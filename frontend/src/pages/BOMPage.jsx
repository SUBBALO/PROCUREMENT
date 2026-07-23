import React, { useEffect, useMemo, useState } from "react";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { MagnifyingGlass, UploadSimple, ClockCounterClockwise, Warning, PencilSimple, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

export default function BOMPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isEngineering = role === "engineering";
  const isAdmin = role === "admin";
  const canUpload = isEngineering || isAdmin;
  const canAnnotate = isAdmin;

  const [searchSo, setSearchSo] = useState("");
  const [selectedBom, setSelectedBom] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listRows, setListRows] = useState([]);

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
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
            Daftar BOM (Revisi terbaru per SO) — {listRows.length} SO
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
                  <th className="text-left p-3">Diupload</th>
                  <th className="text-center p-3">Aksi</th>
                </tr>
              </thead>
              <tbody data-testid="bom-list">
                {loading && (<tr><td colSpan={10} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
                {!loading && listRows.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">
                    {searchSo ? `Tidak ada BOM untuk SO "${searchSo}"` : "Belum ada BOM. Upload untuk memulai."}
                  </td></tr>
                )}
                {listRows.map((b) => (
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
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle>Upload BOM Excel</DialogTitle>
            <DialogDescription>
              Format: .xls atau .xlsx sesuai template MKS Engineering. Sistem akan otomatis membaca SO No & item.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">File Excel *</Label>
              <input
                type="file"
                accept=".xls,.xlsx"
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
        <DialogContent className="rounded-none max-w-2xl">
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
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="p-2"><b>Rev.{h.rev_no}</b></td>
                    <td className="p-2 text-xs text-slate-600">{(h.uploaded_at || "").slice(0, 19).replace("T", " ")}</td>
                    <td className="p-2 text-slate-800 font-semibold">{h.prepared_by || "-"}</td>
                    <td className="p-2 text-slate-700 text-xs">{h.uploaded_by_name}</td>
                    <td className="p-2 text-slate-600 text-xs italic">{h.revision_reason || "(upload awal)"}</td>
                    <td className="p-2 text-right tabular-nums">{(h.items || []).length}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => { openBom(h); setShowHistory(false); }}
                        className="text-[10px] uppercase tracking-[0.05em] font-semibold text-sky-700 border border-sky-300 hover:bg-sky-50 px-2 py-1 rounded-none"
                      >
                        Buka
                      </button>
                    </td>
                  </tr>
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
  const items = bom.items || [];
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

      {/* Items */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Daftar Material — {items.length} item
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
                    <td className="p-2 text-slate-400 tabular-nums align-top">{it.item_no}</td>
                    <td className="p-2 font-semibold text-slate-900 align-top whitespace-normal break-words max-w-[180px]">{it.item_name}</td>
                    <td className="p-2 text-slate-700 align-top whitespace-normal break-words max-w-[320px]">{it.item_specification}</td>
                    <td className="p-2 text-right tabular-nums align-top">{it.qty}</td>
                    <td className="p-2 text-slate-600 text-xs align-top">{it.uom}</td>
                    <td className="p-2 text-slate-600 text-xs align-top whitespace-normal break-words max-w-[140px]">{it.material}</td>
                    <td className="p-2 text-slate-600 text-xs font-mono align-top whitespace-normal break-words max-w-[80px]">{it.remark}</td>

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
    </>
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
