import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canViewCosting } from "../lib/rbac";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { MagnifyingGlass, UploadSimple, ClockCounterClockwise, Warning, PencilSimple, FloppyDisk, ArrowLeft } from "@phosphor-icons/react";
import { toast } from "sonner";
import { SortDropdown, sortItems, cmpStr, cmpDateStr } from "../components/SortDropdown";
import { BomPurchaseBadge, BomListProgress, BomSearchLinkModal } from "../components/BomPurchaseWidgets";
import BomAttachmentsReadOnly from "../components/BomAttachmentsReadOnly";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

const BOM_SORT_OPTS = [
  { value: "uploaded_desc", label: "Upload: Baru → Lama", sort: (a, b) => cmpDateStr(b.uploaded_at || b.created_at, a.uploaded_at || a.created_at) },
  { value: "uploaded_asc", label: "Upload: Lama → Baru", sort: (a, b) => cmpDateStr(a.uploaded_at || a.created_at, b.uploaded_at || b.created_at) },
  { value: "so_asc", label: "SO: A → Z", sort: (a, b) => cmpStr(a.so_no, b.so_no) },
  { value: "so_desc", label: "SO: Z → A", sort: (a, b) => cmpStr(b.so_no, a.so_no) },
  { value: "cust_asc", label: "Customer: A → Z", sort: (a, b) => cmpStr(a.customer, b.customer) },
  { value: "cust_desc", label: "Customer: Z → A", sort: (a, b) => cmpStr(b.customer, a.customer) },
];

export default function BOMPage() {
  const { user } = useAuth();
  const role = user?.role;
  // Backend allows: admin, engineering, eng_head, eng_staff — mirror that in the UI
  // so all Engineering sub-roles see the Upload button.
  const isEngineering = ["engineering", "eng_leader", "eng_head", "eng_staff"].includes(role);
  const isAdmin = role === "admin" || user?.is_super_admin;
  // BOM Utama = read-only untuk semua role. Purchasing hanya lihat & annotate.
  // Manual upload + add item Manual DIHILANGKAN — semua BOM harus lewat Engineering Preparation & Approval workflow.
  const canUpload = false;
  const canAddItem = false;
  const canAnnotate = isAdmin;

  const [searchSo, setSearchSo] = useState("");
  const [selectedBom, setSelectedBom] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [expandedRevId, setExpandedRevId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listRows, setListRows] = useState([]);
  const [sortBy, setSortBy] = useState("uploaded_desc");
  const sortedList = useMemo(() => sortItems(listRows, sortBy, BOM_SORT_OPTS), [listRows, sortBy]);
  const listPag = usePagination(sortedList, 20);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadReason, setUploadReason] = useState("");
  const [uploadPreparedBy, setUploadPreparedBy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preparers, setPreparers] = useState([]);
  const [revisionPrompt, setRevisionPrompt] = useState(null);  // {so_no, latest_rev, ...} when SO exists
  const openUpload = () => {
    setUploadOpen(true); setUploadFile(null); setUploadReason(""); setUploadPreparedBy(""); setRevisionPrompt(null);
  };

  const doUpload = async () => {
    if (!uploadFile) return toast.error("Pilih file dulu");
    if (!uploadPreparedBy.trim()) return toast.error("Nama Pembuat BOM wajib diisi");
    if (revisionPrompt && !uploadReason.trim()) return toast.error("Alasan revisi wajib diisi");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("prepared_by", uploadPreparedBy.trim());
      fd.append("revision_reason", uploadReason.trim());
      const { data } = await api.post("/bom/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(data.message || "BOM tersimpan");
      setUploadOpen(false);
      setUploadFile(null); setUploadReason(""); setUploadPreparedBy(""); setRevisionPrompt(null);
      await loadList(searchSo);
      // refresh preparers autocomplete
      api.get("/bom/preparers").then((r) => setPreparers(r.data || [])).catch(() => {});
    } catch (e) {
      const detail = e.response?.data?.detail;
      // 409 with structured payload → SO already exists, prompt for reason inline
      if (e.response?.status === 409 && detail && typeof detail === "object" && detail.code === "revision_reason_required") {
        setRevisionPrompt(detail);
        toast.info(detail.message || "SO sudah ada — isi alasan revisi");
      } else {
        toast.error((typeof detail === "string" ? detail : detail?.message) || "Gagal upload");
      }
    } finally { setUploading(false); }
  };

  // Editable annotations (admin)
  const [annotations, setAnnotations] = useState({});
  const [savingAnn, setSavingAnn] = useState(false);

  const loadList = async (q = "") => {
    setLoading(true);
    try {
      const params = { rev: "latest" };
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/bom", { params });
      setListRows(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat BOM");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList("");
    api.get("/bom/preparers").then((r) => setPreparers(r.data || [])).catch(() => {});
    /* eslint-disable-next-line */
  }, []);

  const openBom = async (bom) => {
    const { data } = await api.get(`/bom/${bom.id}`);
    setSelectedBom(data);
    setAnnotations(data.annotations || {});
  };

  const openHistory = async (soNo) => {
    const { data } = await api.get(`/bom/history/${encodeURIComponent(soNo)}`);
    setHistory(data.revisions || []);
    setShowHistory(true);
  };

  const doSearch = async (e) => {
    e?.preventDefault?.();
    await loadList(searchSo);
  };

  const updateAnn = (itemNo, key, val) => {
    setAnnotations((prev) => ({
      ...prev,
      [itemNo]: { ...(prev[itemNo] || {}), [key]: val },
    }));
  };

  const saveAnnotations = async () => {
    if (!selectedBom) return;
    setSavingAnn(true);
    try {
      const payload = { annotations: [] };
      for (const [key, v] of Object.entries(annotations)) {
        payload.annotations.push({
          item_no: parseInt(key, 10),
          available_stock: v.available_stock === "" || v.available_stock === undefined ? null : parseFloat(v.available_stock),
          qty_purchase: v.qty_purchase === "" || v.qty_purchase === undefined ? null : parseFloat(v.qty_purchase),
          purchase_due_date: v.purchase_due_date || null,
          admin_remark: v.admin_remark || "",
        });
      }
      await api.patch(`/bom/${selectedBom.id}/annotations`, payload);
      toast.success("Annotasi tersimpan");
      // Refresh
      const { data } = await api.get(`/bom/${selectedBom.id}`);
      setSelectedBom(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSavingAnn(false); }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      {/* Back link */}
      <Link
        to={user?.role === "sales" ? "/sales" : (["engineering", "eng_leader", "eng_head", "eng_staff"].includes(user?.role) ? "/engineering" : "/")}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900"
        data-testid="bom-back-to-portal"
      >
        <ArrowLeft size={12} weight="bold" /> Kembali ke {["engineering", "eng_leader", "eng_head", "eng_staff"].includes(user?.role) ? "Engineering Portal" : "Portal Utama"}
      </Link>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Bill of Material (BOM)
          </h1>
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500 mt-1">
            Daftar BOM per SO dari Engineering. Search berdasarkan Nomor SO.
          </p>
        </div>
        {canUpload && (
          <Button
            data-testid="bom-upload-btn"
            onClick={openUpload}
            className="rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em]"
          >
            <UploadSimple size={14} weight="bold" className="mr-1.5" /> Upload BOM
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="rounded-none border-slate-200 p-4">
        <form onSubmit={doSearch} className="flex items-end gap-3">
          <div className="flex-1 max-w-lg">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari <span className="text-slate-400 font-normal normal-case">(Nomor SO, Customer, atau Project)</span></Label>
            <Input
              data-testid="bom-search-input"
              className={inputCls}
              value={searchSo}
              onChange={(e) => setSearchSo(e.target.value)}
              placeholder="mis. 005221, PT. YOKOHAMA, MH PALLET"
            />
          </div>
          <Button data-testid="bom-search-btn" type="submit" className="rounded-none bg-sky-600 hover:bg-sky-700 text-white h-9">
            <MagnifyingGlass size={14} weight="bold" className="mr-1.5" /> Cari
          </Button>
          {searchSo && (
            <Button type="button" variant="outline" onClick={() => { setSearchSo(""); loadList(""); }} className="rounded-none h-9">
              Reset
            </Button>
          )}
        </form>
      </Card>

      {/* List (latest revision per SO) */}
      {!selectedBom && (
        <Card className="rounded-none border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center justify-between gap-2 flex-wrap">
            <span>Daftar BOM (Revisi terbaru per SO) — {listRows.length} SO</span>
            <SortDropdown testid="bom-sort" value={sortBy} onChange={setSortBy} options={BOM_SORT_OPTS} className="normal-case tracking-normal" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  <th className="text-left p-3">SO No</th>
                  <th className="text-left p-3">BOM No</th>
                  <th className="text-left p-3">Rev</th>
                  <th className="text-left p-3">Project</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Prepared By</th>
                  <th className="text-left p-3">Delivery</th>
                  <th className="text-right p-3">Items</th>
                  <th className="text-left p-3 bg-sky-50">Progress Beli</th>
                  <th className="text-left p-3">Diupload</th>
                  <th className="text-center p-3">Aksi</th>
                </tr>
              </thead>
              <tbody data-testid="bom-list">
                {loading && (<tr><td colSpan={11} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
                {!loading && listRows.length === 0 && (
                  <tr><td colSpan={11} className="p-8 text-center text-slate-400">
                    {searchSo ? `Tidak ada BOM untuk SO "${searchSo}"` : "Belum ada BOM. Upload untuk memulai."}
                  </td></tr>
                )}
                {sortedList.length > 0 && listPag.pagedData.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono font-semibold text-slate-900">{b.so_no}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{b.bom_no || "-"}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 bg-sky-50 border border-sky-200 text-sky-700 text-[10px] uppercase tracking-[0.05em] font-bold">
                        Rev.{b.rev_no}
                      </span>
                    </td>
                    <td className="p-3 text-slate-800">{b.project_name || "-"}</td>
                    <td className="p-3 text-slate-800">{b.customer || "-"}</td>
                    <td className="p-3 text-slate-700 text-xs whitespace-nowrap">{b.prepared_by || "-"}</td>
                    <td className="p-3 text-slate-600 text-xs">{b.delivery_date ? formatDateID(b.delivery_date) : "-"}</td>
                    <td className="p-3 text-right tabular-nums">{(b.items || []).length}</td>
                    <td className="p-3 bg-sky-50/30"><BomListProgress progress={b.purchase_progress} /></td>
                    <td className="p-3 text-xs text-slate-500">
                      {b.uploaded_by_name || "-"}<br />
                      <span className="text-[10px] text-slate-400">{(b.uploaded_at || "").slice(0, 19).replace("T", " ")}</span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-flex gap-1">
                        <button
                          data-testid={`bom-open-${b.so_no}`}
                          onClick={() => openBom(b)}
                          className="text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-none"
                        >
                          Buka
                        </button>
                        <button
                          data-testid={`bom-history-${b.so_no}`}
                          onClick={() => openHistory(b.so_no)}
                          className="text-[10px] uppercase tracking-[0.05em] font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 px-2 py-1 rounded-none"
                          title="Lihat semua revisi"
                        >
                          <ClockCounterClockwise size={12} weight="bold" className="inline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar {...listPag} label="BOM" testIdPrefix="bom-list-pag" />
        </Card>
      )}

      {/* Detail view of selected BOM */}
      {selectedBom && (
        <BomDetail
          bom={selectedBom}
          annotations={annotations}
          canAnnotate={canAnnotate}
          savingAnn={savingAnn}
          onBack={() => { setSelectedBom(null); setAnnotations({}); }}
          onUpdate={updateAnn}
          onSave={saveAnnotations}
          onHistory={() => openHistory(selectedBom.so_no)}
        />
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="rounded-none max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload BOM Excel</DialogTitle>
            <DialogDescription>
              Format: .xls (Excel 97-2003), .xlsx atau .xlsm sesuai template MKS Engineering. Sistem akan otomatis membaca SO No & item.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">File Excel *</Label>
              <input
                type="file"
                accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                data-testid="bom-upload-file"
                onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setRevisionPrompt(null); }}
                className="text-sm file:mr-3 file:py-2 file:px-3 file:border-0 file:bg-slate-900 file:text-white file:text-xs file:uppercase file:tracking-[0.1em] file:font-semibold file:cursor-pointer"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Pembuat BOM *</Label>
              <Input
                data-testid="bom-upload-prepared-by"
                list="preparers-list"
                autoComplete="off"
                className={inputCls}
                value={uploadPreparedBy}
                onChange={(e) => setUploadPreparedBy(e.target.value)}
                placeholder="mis. Sudirman, Andi Wijaya"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Wajib. Karena akun engineering dipakai bersama, mohon isi nama asli pembuat. Autocomplete dari daftar sebelumnya.
              </div>
              <datalist id="preparers-list">
                {preparers.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>

            {revisionPrompt && (
              <div className="border-2 border-amber-400 bg-amber-50 p-3 space-y-2">
                <div className="flex items-start gap-2 text-amber-900">
                  <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
                  <div className="text-xs leading-relaxed">
                    <b>Nomor SO {revisionPrompt.so_no} sudah ada</b> di database sebagai Rev.{revisionPrompt.latest_rev}, diupload oleh <b>{revisionPrompt.latest_uploaded_by || "-"}</b> ({revisionPrompt.latest_prepared_by || "-"}) pada {revisionPrompt.latest_uploaded_at}.
                    Silakan isi alasan revisi untuk melanjutkan sebagai Rev.{revisionPrompt.latest_rev + 1}.
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-amber-900 mb-1 block">Alasan Revisi *</Label>
                  <Input
                    data-testid="bom-upload-reason"
                    autoFocus
                    className="h-9 rounded-none border-amber-400 focus:ring-2 focus:ring-amber-600 text-sm"
                    value={uploadReason}
                    onChange={(e) => setUploadReason(e.target.value)}
                    placeholder="mis. Update spesifikasi material, tambah item baru"
                  />
                </div>
              </div>
            )}

            {!revisionPrompt && (
              <div className="bg-slate-50 border border-slate-200 p-2 text-[11px] text-slate-600">
                Jika Nomor SO sudah ada di database, sistem akan otomatis meminta alasan revisi setelah tombol Upload ditekan.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading} className="rounded-none">Batal</Button>
            <Button
              data-testid="bom-upload-submit"
              onClick={doUpload}
              disabled={uploading || !uploadFile || !uploadPreparedBy.trim() || (!!revisionPrompt && !uploadReason.trim())}
              className="rounded-none bg-slate-900 hover:bg-slate-800 text-white"
            >
              {uploading ? "Mengunggah..." : (revisionPrompt ? `Upload sebagai Rev.${revisionPrompt.latest_rev + 1}` : "Upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="rounded-none max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histori Revisi</DialogTitle>
            <DialogDescription>Semua revisi BOM untuk SO ini, terbaru dulu.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm" data-testid="bom-history-table">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-[0.05em] font-bold text-slate-500">
                  <th className="text-left p-2">Rev</th>
                  <th className="text-left p-2">Tanggal Upload</th>
                  <th className="text-left p-2">Pembuat BOM</th>
                  <th className="text-left p-2">Diupload oleh</th>
                  <th className="text-left p-2">Alasan Revisi</th>
                  <th className="text-right p-2">Items</th>
                  <th className="text-center p-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <React.Fragment key={h.id}>
                  <tr className="border-b border-slate-100">
                    <td className="p-2"><b>Rev.{h.rev_no}</b></td>
                    <td className="p-2 text-xs text-slate-600">{(h.uploaded_at || "").slice(0, 19).replace("T", " ")}</td>
                    <td className="p-2 text-slate-800 font-semibold">{h.prepared_by || "-"}</td>
                    <td className="p-2 text-slate-700 text-xs">{h.uploaded_by_name}</td>
                    <td className="p-2 text-slate-600 text-xs italic">{h.revision_reason || "(upload awal)"}</td>
                    <td className="p-2 text-right tabular-nums">{(h.items || []).length}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <button
                        onClick={() => setExpandedRevId(expandedRevId === h.id ? null : h.id)}
                        data-testid={`rev-view-items-${h.rev_no}`}
                        className="text-[10px] uppercase tracking-[0.05em] font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 px-2 py-1 rounded-none mr-1"
                      >
                        {expandedRevId === h.id ? "Tutup" : "Lihat Item"}
                      </button>
                      <button
                        onClick={() => { openBom(h); setShowHistory(false); }}
                        className="text-[10px] uppercase tracking-[0.05em] font-semibold text-sky-700 border border-sky-300 hover:bg-sky-50 px-2 py-1 rounded-none"
                      >
                        Buka
                      </button>
                    </td>
                  </tr>
                  {expandedRevId === h.id && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={7} className="p-2">
                        <div className="border border-slate-200 bg-white" data-testid={`rev-items-${h.rev_no}`}>
                          <div className="px-2 py-1 bg-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                            Isi Item BOM — Rev.{h.rev_no} {h.revision_reason ? `· ${h.revision_reason}` : ""}
                          </div>
                          {(h.items || []).length === 0 ? (
                            <div className="p-3 text-xs italic text-slate-400">Tidak ada item pada revisi ini.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                  <th className="text-left p-1.5 w-8">#</th>
                                  <th className="text-left p-1.5">Nama Item</th>
                                  <th className="text-left p-1.5">Spesifikasi</th>
                                  <th className="text-right p-1.5">Qty</th>
                                  <th className="text-left p-1.5">Unit</th>
                                  <th className="text-left p-1.5">Material</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(h.items || []).map((it, i) => (
                                  <tr key={i} className="border-t border-slate-100">
                                    <td className="p-1.5 text-slate-500">{it.item_no || i + 1}</td>
                                    <td className="p-1.5 text-slate-800">{it.item_name || "-"}</td>
                                    <td className="p-1.5 text-slate-600">{it.item_specification || "-"}</td>
                                    <td className="p-1.5 text-right tabular-nums">{it.qty ?? "-"}</td>
                                    <td className="p-1.5 text-slate-600">{it.uom || "-"}</td>
                                    <td className="p-1.5 text-slate-600">{it.material || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function BomDetail({ bom, annotations, canAnnotate, savingAnn, onBack, onUpdate, onSave, onHistory }) {
  // Add/edit/delete item DISABLED di BOM Utama — semua perubahan wajib lewat revisi BOM (Engineering workflow)
  const canAddItem = false;
  const { user } = useAuth();
  const showCosting = canViewCosting(user?.role);  // RBAC: harga & riwayat pembelian
  const items = bom.items || [];
  const [addItemMode, setAddItemMode] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [purchases, setPurchases] = useState({ items: [], count: 0, totals_by_currency: {}, price_hidden: false });
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [statusMap, setStatusMap] = useState({}); // item_no -> { status, total_bought, purchases }
  const [progress, setProgress] = useState(null);
  const [linkItem, setLinkItem] = useState(null); // item currently being linked

  const loadStatus = React.useCallback(async () => {
    if (!bom?.id) return;
    try {
      const { data } = await api.get(`/bom/${bom.id}/purchase-status`);
      const map = {};
      (data.items || []).forEach((it) => { map[String(it.item_no)] = it; });
      setStatusMap(map);
      setProgress(data.progress);
    } catch (e) { /* ignore */ }
  }, [bom?.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Build a Set of item names that have already been purchased (for per-item badge)
  const purchasedNames = React.useMemo(() => {
    const s = new Set();
    (purchases.items || []).forEach((t) => {
      if (t.item_name) s.add(t.item_name.trim().toLowerCase());
    });
    return s;
  }, [purchases.items]);

  const isPurchased = (name) => name && purchasedNames.has(String(name).trim().toLowerCase());

  useEffect(() => {
    if (!bom?.id || !showCosting) return;   // RBAC: hanya role privileged yang ambil riwayat pembelian
    let cancelled = false;
    (async () => {
      setPurchasesLoading(true);
      try {
        const { data } = await api.get(`/bom/${bom.id}/purchases`);
        if (!cancelled) setPurchases(data);
      } catch (e) {
        if (!cancelled) setPurchases({ items: [], count: 0, totals_by_currency: {}, price_hidden: false });
      } finally {
        if (!cancelled) setPurchasesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bom?.id, showCosting]);
  return (
    <>
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900" data-testid="bom-back-btn">
          ← Kembali ke daftar
        </button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onHistory} className="rounded-none h-8 text-xs">
            <ClockCounterClockwise size={12} weight="bold" className="mr-1" /> Histori Revisi
          </Button>
          {bom.engineering_status === "approved" && (
            <Button
              variant="outline"
              className="rounded-none h-8 text-xs border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold"
              onClick={async () => {
                try {
                  const res = await api.get(`/bom/${bom.id}/export/xlsx`, { responseType: "blob" });
                  const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${bom.bom_no || "BOM"} - ${(bom.project_name || "").replace(/\//g, "_")}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                  toast.success("File BOM ter-download");
                } catch (e) {
                  toast.error(e.response?.data?.detail || "Gagal export BOM");
                }
              }}
              data-testid="bom-detail-export-xlsx"
              title="Download BOM sesuai template untuk print"
            >
              📥 Export & Print (Excel)
            </Button>
          )}
          {canAnnotate && (
            <Button onClick={onSave} disabled={savingAnn} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" data-testid="bom-save-annotations">
              <FloppyDisk size={12} weight="bold" className="mr-1" /> {savingAnn ? "Menyimpan..." : "Simpan Annotasi"}
            </Button>
          )}
        </div>
      </div>

      {/* Meta card */}
      <Card className="rounded-none border-slate-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <MetaField label="Nomor SO" value={bom.so_no} highlight />
        <MetaField label="BOM No" value={bom.bom_no} />
        <MetaField label="Revisi" value={`Rev.${bom.rev_no}`} highlight />
        <MetaField label="Tanggal BOM" value={bom.bom_date ? formatDateID(bom.bom_date) : "-"} />
        <MetaField label="Project" value={bom.project_name} />
        <MetaField label="Customer" value={bom.customer} />
        <MetaField label="Delivery Date" value={bom.delivery_date ? formatDateID(bom.delivery_date) : "-"} />
        <MetaField label="Class Material" value={bom.class_material || "-"} />
        <MetaField label="Prepared By" value={bom.prepared_by || "-"} highlight />
        <MetaField label="Tanggal Upload" value={(bom.uploaded_at || "").slice(0, 10) ? formatDateID(bom.uploaded_at.slice(0, 10)) : "-"} />
        <MetaField label="Diupload oleh" value={bom.uploaded_by_name || "-"} colSpan={2} />
        {bom.project_dwg && <MetaField label="Eng. Drawing No" value={bom.project_dwg} colSpan={2} />}
        {bom.revision_reason && <MetaField label="Alasan Revisi" value={bom.revision_reason} colSpan={2} highlight />}
      </Card>

      {/* BOM Attachments — READ ONLY. Dokumen dikelola dari MKS-F-ENG-005 Drawing Master List */}
      <BomAttachmentsReadOnly bom={bom} />

      {/* Items */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
            Daftar Material — {items.length} item
          </div>
          {canAddItem && (
            <button
              onClick={() => setAddItemMode(true)}
              className="px-2 py-1 bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-bold flex items-center gap-1"
              data-testid="bom-add-item"
            >
              + Tambah Item Manual
            </button>
          )}
          {!canAddItem && (
            <div className="text-[10px] text-slate-500 italic">Untuk menambah/mengubah item, ajukan <b>Revisi BOM</b> ke Engineering Leader melalui halaman Work Order (Drawing Master List → buka BOM). Perubahan langsung tidak diizinkan.</div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="bom-items-table">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-500">
                <th className="text-left p-2 w-10">No</th>
                <th className="text-left p-2">Item Name</th>
                <th className="text-left p-2 min-w-[240px]">Specification</th>
                <th className="text-right p-2 w-14">Qty</th>
                <th className="text-left p-2 w-14">UoM</th>
                <th className="text-left p-2">Material</th>
                <th className="text-left p-2 w-14">Part</th>
                <th className="text-left p-2 bg-sky-50 min-w-[140px]">Beli</th>
                <th className="text-right p-2 bg-amber-50 w-16">Stock</th>
                <th className="text-right p-2 bg-amber-50 w-16">Qty Purchase</th>
                <th className="text-left p-2 bg-amber-50 w-28">Due Date</th>
                <th className="text-left p-2 bg-amber-50 min-w-[280px]">Admin Remark</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const ann = annotations[String(it.item_no)] || {};
                return (
                  <tr key={it.item_no} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                    <td className="p-2 text-slate-400 tabular-nums align-top">
                      <div className="flex flex-col items-start gap-1">
                        <span>{it.item_no}</span>
                        {canAddItem && (
                          <div className="flex gap-0.5">
                            <button
                              onClick={() => setEditItem(it)}
                              className="text-[9px] px-1 py-0.5 text-sky-600 hover:bg-sky-50 border border-sky-200"
                              title="Edit item"
                              data-testid={`bom-item-edit-${it.item_no}`}
                            >✏</button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Hapus item no.${it.item_no} — "${it.item_name}"?`)) return;
                              try {
                                await api.delete(`/bom/${bom.id}/items/${it.item_no}`);
                                toast.success("Item terhapus");
                                window.location.reload();
                              } catch (e) { toast.error("Gagal hapus"); }
                            }}
                            className="text-[9px] px-1 py-0.5 text-rose-600 hover:bg-rose-50 border border-rose-200"
                            title="Hapus item"
                            data-testid={`bom-item-del-${it.item_no}`}
                          >🗑</button>
                        </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2 font-semibold text-slate-900 align-top whitespace-normal break-words max-w-[180px]">
                      {isPurchased(it.item_name) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-[0.1em] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 mr-1 whitespace-nowrap" title="Sudah ada pembelian dgn nama item ini di SO yang sama">
                          ✓ Dibeli
                        </span>
                      )}
                      {it.item_name}
                    </td>
                    <td className="p-2 text-slate-700 align-top whitespace-normal break-words max-w-[320px]">{it.item_specification}</td>
                    <td className="p-2 text-right tabular-nums align-top">{it.qty}</td>
                    <td className="p-2 text-slate-600 text-xs align-top">{it.uom}</td>
                    <td className="p-2 text-slate-600 text-xs align-top whitespace-normal break-words max-w-[140px]">{it.material}</td>
                    <td className="p-2 text-slate-600 text-xs font-mono align-top whitespace-normal break-words max-w-[80px]">{it.remark}</td>

                    <td className="p-1 bg-sky-50/40 align-top">
                      {(() => {
                        const st = statusMap[String(it.item_no)];
                        const isInStock = st?.purchase_status === "in_stock";
                        return (
                          <div className="space-y-1">
                            <BomPurchaseBadge
                              status={st?.purchase_status || "pending"}
                              totalBought={st?.total_bought || 0}
                              qty={it.qty}
                              unit={it.uom}
                              availableStock={st?.available_stock || 0}
                              neededQty={st?.needed_qty}
                            />
                            {!isInStock && (
                              <button
                                type="button"
                                onClick={() => setLinkItem(it)}
                                data-testid={`bom-search-link-${it.item_no}`}
                                className="mt-1 text-[10px] uppercase tracking-wide font-semibold text-white bg-sky-600 hover:bg-sky-700 px-1.5 py-0.5 rounded-none inline-flex items-center gap-0.5"
                              >
                                <MagnifyingGlass size={10} weight="bold" /> Cari & Link
                              </button>
                            )}
                            {(st?.purchases || []).length > 0 && (
                              <details className="text-[9px] mt-0.5">
                                <summary className="cursor-pointer text-sky-700 hover:underline">
                                  {(st.purchases || []).length} pembelian
                                </summary>
                                <div className="mt-1 space-y-0.5 pl-1">
                                  {(st.purchases || []).map((p, pi) => (
                                    <div key={pi} className="text-[9px] text-slate-600 border-l-2 border-sky-300 pl-1">
                                      <b>{p.vendor_name}</b> · {p.qty_bought} {p.unit || ""} · PO {p.po_no || "-"}<br/>
                                      <span className="text-slate-400">{formatDateID(p.purchase_date)} — {p.source}</span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td className="p-1 bg-amber-50/40 align-top w-16">
                      {canAnnotate ? (
                        <Input
                          type="number" step="any"
                          data-testid={`bom-ann-stock-${it.item_no}`}
                          className="h-8 w-full rounded-none border-amber-200 text-xs text-right tabular-nums px-1"
                          value={ann.available_stock ?? ""}
                          onChange={(e) => onUpdate(String(it.item_no), "available_stock", e.target.value)}
                          placeholder="0"
                        />
                      ) : (
                        <div className="text-right text-xs tabular-nums text-slate-700 px-1">{ann.available_stock ?? "-"}</div>
                      )}
                    </td>
                    <td className="p-1 bg-amber-50/40 align-top w-16">
                      {canAnnotate ? (
                        <Input
                          type="number" step="any"
                          data-testid={`bom-ann-qtypur-${it.item_no}`}
                          className="h-8 w-full rounded-none border-amber-200 text-xs text-right tabular-nums px-1"
                          value={ann.qty_purchase ?? ""}
                          onChange={(e) => onUpdate(String(it.item_no), "qty_purchase", e.target.value)}
                          placeholder="0"
                        />
                      ) : (
                        <div className="text-right text-xs tabular-nums text-slate-700 px-1">{ann.qty_purchase ?? "-"}</div>
                      )}
                    </td>
                    <td className="p-1 bg-amber-50/40 align-top">
                      {canAnnotate ? (
                        <Input
                          type="date"
                          data-testid={`bom-ann-due-${it.item_no}`}
                          className="h-8 rounded-none border-amber-200 text-xs"
                          value={ann.purchase_due_date || ""}
                          onChange={(e) => onUpdate(String(it.item_no), "purchase_due_date", e.target.value)}
                        />
                      ) : (
                        <div className="text-xs text-slate-700 px-2">{ann.purchase_due_date ? formatDateID(ann.purchase_due_date) : "-"}</div>
                      )}
                    </td>
                    <td className="p-1 bg-amber-50/40 align-top min-w-[280px]">
                      {canAnnotate ? (
                        <textarea
                          data-testid={`bom-ann-remark-${it.item_no}`}
                          className="w-full min-h-[36px] rounded-none border border-amber-200 text-xs p-1.5 resize-none focus:ring-2 focus:ring-sky-600 focus:outline-none overflow-hidden"
                          rows={1}
                          value={ann.admin_remark || ""}
                          onChange={(e) => onUpdate(String(it.item_no), "admin_remark", e.target.value)}
                          ref={(el) => {
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = Math.max(36, el.scrollHeight) + "px";
                            }
                          }}
                          placeholder="—"
                        />
                      ) : (
                        <div className="text-xs text-slate-700 px-2 italic whitespace-pre-wrap break-words">{ann.admin_remark || "-"}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Purchase History for this SO — RBAC: hanya role privileged (costing) */}
      {showCosting && (
      <Card className="rounded-none border-slate-200 overflow-hidden" data-testid="bom-purchases-card">
        <div className="px-4 py-2 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-sky-800">
            Riwayat Pembelian untuk SO {bom.so_no} — {purchases.count || 0} transaksi
          </div>
          {purchases.price_hidden && (
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.1em]">
              🔒 Harga disembunyikan (role: Store)
            </span>
          )}
        </div>

        {purchasesLoading ? (
          <div className="p-4 text-xs text-slate-500 italic">Memuat data pembelian…</div>
        ) : purchases.count === 0 ? (
          <div className="p-4 text-xs text-slate-500 italic">
            Belum ada transaksi pembelian yang tercatat untuk SO ini.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="bom-purchases-table">
                <thead className="bg-white border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-500">
                    <th className="text-left p-2 w-24">Tanggal Inv.</th>
                    <th className="text-left p-2 w-28">PO No</th>
                    <th className="text-left p-2 min-w-[160px]">Vendor</th>
                    <th className="text-left p-2 min-w-[200px]">Item</th>
                    <th className="text-right p-2 w-16">Qty</th>
                    <th className="text-left p-2 w-14">Unit</th>
                    {!purchases.price_hidden && (
                      <>
                        <th className="text-right p-2 w-24">Unit Price</th>
                        <th className="text-right p-2 w-28">Total</th>
                        <th className="text-left p-2 w-16">Curr.</th>
                      </>
                    )}
                    <th className="text-left p-2 w-24">Terima</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.items.map((t, idx) => (
                    <tr key={t.id || idx} className="border-b border-slate-100 hover:bg-slate-50 align-top" data-testid={`bom-purchase-row-${idx}`}>
                      <td className="p-2 text-slate-700 tabular-nums align-top">{t.invoice_date ? formatDateID(t.invoice_date) : "-"}</td>
                      <td className="p-2 text-slate-600 font-mono text-xs align-top">{t.po_no || "-"}</td>
                      <td className="p-2 text-slate-900 font-semibold align-top">{t.vendor_name || "-"}</td>
                      <td className="p-2 text-slate-700 align-top">{t.item_name || "-"}</td>
                      <td className="p-2 text-right tabular-nums align-top">{t.qty ?? 0}</td>
                      <td className="p-2 text-slate-600 text-xs align-top">{t.unit || "-"}</td>
                      {!purchases.price_hidden && (
                        <>
                          <td className="p-2 text-right tabular-nums align-top">{Number(t.unit_price || 0).toLocaleString("id-ID")}</td>
                          <td className="p-2 text-right tabular-nums font-semibold text-slate-900 align-top">{Number(t.total_price || 0).toLocaleString("id-ID")}</td>
                          <td className="p-2 text-xs text-slate-600 align-top">{t.currency || "IDR"}</td>
                        </>
                      )}
                      <td className="p-2 text-slate-600 text-xs tabular-nums align-top">{t.receive_date ? formatDateID(t.receive_date) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals per currency (hidden for Store role) */}
            {!purchases.price_hidden && Object.keys(purchases.totals_by_currency || {}).length > 0 && (
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-4 justify-end text-xs">
                {Object.entries(purchases.totals_by_currency).map(([cur, amt]) => (
                  <div key={cur} className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Total {cur}:</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">{Number(amt).toLocaleString("id-ID")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
      )}

      {linkItem && (
        <BomSearchLinkModal
          bomId={bom.id}
          item={linkItem}
          onClose={() => setLinkItem(null)}
          onLinked={() => { loadStatus(); setLinkItem(null); }}
        />
      )}

      {(addItemMode || editItem) && (
        <BomItemFormDialog
          bomId={bom.id}
          initial={editItem}
          onClose={() => { setAddItemMode(false); setEditItem(null); }}
          onSaved={() => { setAddItemMode(false); setEditItem(null); if (onBack) window.location.reload(); }}
        />
      )}
    </>
  );
}

function BomItemFormDialog({ bomId, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => initial || {
    item_no: "", item_name: "", item_specification: "", qty: 1, uom: "pcs",
    material: "", weight_kg: "", remark: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!f.item_name.trim()) { toast.error("Item Name wajib"); return; }
    setSaving(true);
    try {
      const body = {
        item_no: f.item_no ? parseInt(f.item_no) : null,
        item_name: f.item_name.trim(),
        item_specification: f.item_specification || "",
        qty: parseFloat(f.qty) || 0,
        uom: f.uom || "",
        material: f.material || "",
        weight_kg: f.weight_kg === "" ? null : parseFloat(f.weight_kg),
        remark: f.remark || "",
      };
      if (initial) {
        await api.put(`/bom/${bomId}/items/${initial.item_no}`, body);
        toast.success(`Item no.${initial.item_no} terupdate`);
      } else {
        const { data } = await api.post(`/bom/${bomId}/items`, body);
        toast.success(`Item no.${data.item.item_no} · "${data.item.item_name}" ditambahkan`);
      }
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit Item no.${initial.item_no}` : "Tambah Item BOM Manual"}</DialogTitle>
          <DialogDescription>Field wajib: Item Name. Item no. otomatis diambil dari nomor tertinggi + 1 jika dikosongkan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-3 gap-3">
          <label className="col-span-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Item No (kosong = auto)</div>
            <input type="number" className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.item_no} onChange={(e) => set("item_no", e.target.value)} placeholder="auto" disabled={!!initial} />
          </label>
          <label className="col-span-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Item Name *</div>
            <input className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.item_name} onChange={(e) => set("item_name", e.target.value)} placeholder="mis. Plate ASTM A36 5mm" />
          </label>
          <label className="col-span-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Specification</div>
            <input className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.item_specification} onChange={(e) => set("item_specification", e.target.value)} placeholder="mis. 1220x2440x5mm · SS400 · Rev A" />
          </label>
          <label>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Qty *</div>
            <input type="number" step="any" className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.qty} onChange={(e) => set("qty", e.target.value)} />
          </label>
          <label>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">UoM</div>
            <select className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.uom} onChange={(e) => set("uom", e.target.value)}>
              <option value="pcs">pcs</option><option value="set">set</option><option value="lot">lot</option>
              <option value="m">m</option><option value="m2">m²</option><option value="kg">kg</option>
              <option value="liter">liter</option><option value="roll">roll</option><option value="sheet">sheet</option>
            </select>
          </label>
          <label>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Weight (Kg)</div>
            <input type="number" step="any" className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} placeholder="opsional" />
          </label>
          <label className="col-span-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Material</div>
            <input className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.material} onChange={(e) => set("material", e.target.value)} placeholder="mis. ASTM A36 / SS304" />
          </label>
          <label>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Part / Remark</div>
            <input className="h-9 border border-slate-300 w-full px-2 text-sm rounded-none" value={f.remark} onChange={(e) => set("remark", e.target.value)} placeholder="mis. P1 / P1&P2" />
          </label>
          <div className="col-span-3 flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
            <Button type="submit" disabled={saving} className="rounded-none bg-sky-700 hover:bg-sky-800 text-white">
              {saving ? "Menyimpan..." : (initial ? "Update" : "Tambah")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MetaField({ label, value, highlight, colSpan = 1 }) {
  return (
    <div className={`${colSpan > 1 ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm ${highlight ? "font-bold text-slate-900" : "text-slate-800"}`}>{value || "-"}</div>
    </div>
  );
}
