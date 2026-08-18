import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import {
  Plus, PencilSimple, Trash, MagnifyingGlass, ClipboardText, Upload, FileText,
  PaperPlaneTilt, CircleNotch, X, Eye, Lock, CheckCircle, Gear, Paperclip,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { SortDropdown, sortItems, cmpStr, cmpDateStr } from "../components/SortDropdown";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import DrawingRequestFormDialog from "../components/DrawingRequestFormDialog";
import AddCustomerDialog from "../components/AddCustomerDialog";

const SO_SORT_OPTS = [
  { value: "created_desc", label: "Tanggal Buat: Baru → Lama", sort: (a, b) => cmpDateStr(b.created_at, a.created_at) },
  { value: "created_asc", label: "Tanggal Buat: Lama → Baru", sort: (a, b) => cmpDateStr(a.created_at, b.created_at) },
  { value: "so_asc", label: "No SO: A → Z", sort: (a, b) => cmpStr(a.so_no, b.so_no) },
  { value: "so_desc", label: "No SO: Z → A", sort: (a, b) => cmpStr(b.so_no, a.so_no) },
  { value: "cust_asc", label: "Customer: A → Z", sort: (a, b) => cmpStr(a.customer, b.customer) },
];
const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

const DR_STATUS = {
  belum_drawing_request: { label: "Belum Drawing Request", cls: "bg-slate-100 text-slate-600 border-slate-300", icon: FileText },
  submitted_eng: { label: "Sudah Submit ke Eng", cls: "bg-amber-100 text-amber-800 border-amber-400", icon: PaperPlaneTilt },
  eng_terima: { label: "Eng Terima", cls: "bg-sky-100 text-sky-800 border-sky-400", icon: CheckCircle },
  eng_kerjakan: { label: "Eng Kerjakan", cls: "bg-violet-100 text-violet-800 border-violet-400", icon: Gear },
  selesai_eng: { label: "Selesai Proses Eng", cls: "bg-emerald-100 text-emerald-800 border-emerald-500", icon: CheckCircle },
};

const fmtMoney = (v, cur = "IDR") => `${cur} ${Number(v || 0).toLocaleString("id-ID")}`;

export default function SalesOrderPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canSeePrice = ["super_admin", "admin", "finance"].includes(role);
  const canCreate = ["sales", "sales_head", "admin", "super_admin", "finance", "supervisor"].includes(role);
  const canWrite = user && role !== "finance" && role !== "store"; // untuk import excel/hapus (sesuai lama)
  const canDelete = ["admin", "super_admin"].includes(role); // hapus SO: HANYA admin

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("created_desc");
  const [dlg, setDlg] = useState(null);       // create/edit full SO
  const [del, setDel] = useState(null);
  const [detail, setDetail] = useState(null); // view detail
  const [drTarget, setDrTarget] = useState(null); // SO -> ajukan drawing request
  const [drfOpen, setDrfOpen] = useState(null);   // buka DR yang sudah ada (edit draft / lihat)
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // bulk-select SO ids (admin)
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const sortedList = useMemo(() => sortItems(list, sortBy, SO_SORT_OPTS), [list, sortBy]);
  const filteredList = useMemo(
    () => sortedList.filter((s) => !q.trim() || [s.so_no, s.customer, s.description, s.po_customer_no].some((x) => (x || "").toLowerCase().includes(q.toLowerCase()))),
    [sortedList, q]
  );
  const pag = usePagination(filteredList, 20);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/sales-orders", { params: q ? { q } : {} }); setList(data || []); }
    catch { toast.error("Gagal muat SO"); } finally { setLoading(false); }
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // Diarahkan dari Quotation "Confirm Order" -> auto buka form Create SO ter-prefill
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const fq = location.state?.fromQuotation;
    if (fq) {
      setDlg({ mode: "create", fromQuotation: fq });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const doDelete = async () => {
    try { await api.delete(`/sales-orders/${del.id}`); toast.success("SO dihapus"); setDel(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const doBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      const { data } = await api.post(`/sales-orders/bulk-delete`, { ids });
      toast.success(`${data?.deleted ?? ids.length} SO dihapus`);
      setSelected(new Set());
      setBulkConfirm(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus massal");
    } finally { setBulkBusy(false); }
  };

  const doImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append("file", importFile);
      const { data } = await api.post("/sales-orders/import/xlsx", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${data.inserted} SO diimport (${data.skipped_duplicates || 0} duplikat dilewati)`);
      setImportOpen(false); setImportFile(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal import"); }
    finally { setImporting(false); }
  };

  return (
    <div className="space-y-6 p-4 max-w-[1400px] mx-auto">
      <BackLink />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <ClipboardText size={28} weight="duotone" className="text-emerald-600" /> Sales Order (SO)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {list.length.toLocaleString("id-ID")} SO · Buat SO dari Quotation, ajukan Drawing Request ke Engineering, dan lacak statusnya.
            {!canSeePrice && <span className="ml-1 inline-flex items-center gap-1 text-slate-400"><Lock size={12} /> harga disembunyikan</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button data-testid="import-so-btn" onClick={() => setImportOpen(true)} variant="outline" className="rounded-none h-9 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
              <Upload size={14} weight="bold" className="mr-1.5" /> Import Excel
            </Button>
          )}
          {canCreate && (
            <Button data-testid="create-so-btn" onClick={() => setDlg({ mode: "create" })} className="rounded-none h-9 bg-emerald-700 hover:bg-emerald-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
              <Plus size={14} weight="bold" className="mr-1.5" /> Buat Sales Order
            </Button>
          )}
          {canDelete && selected.size > 0 && (
            <Button data-testid="so-bulk-delete-btn" onClick={() => setBulkConfirm(true)} variant="outline" className="rounded-none h-9 border-red-300 text-red-600 hover:bg-red-50 text-xs uppercase tracking-[0.1em] font-semibold">
              <Trash size={14} weight="bold" className="mr-1.5" /> Hapus Terpilih ({selected.size})
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-md flex-1 min-w-[240px]">
            <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className={`${inputCls} pl-9`} placeholder="Cari SO / customer / PO / deskripsi..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="so-search" />
          </div>
          <SortDropdown testid="so-sort" value={sortBy} onChange={setSortBy} options={SO_SORT_OPTS} />
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                {canDelete && (
                  <th className="px-2 py-1.5 w-8 text-center">
                    <input
                      type="checkbox"
                      data-testid="so-select-all"
                      checked={pag.pagedData.length > 0 && pag.pagedData.every((s) => selected.has(s.id))}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) pag.pagedData.forEach((s) => next.add(s.id));
                        else pag.pagedData.forEach((s) => next.delete(s.id));
                        setSelected(next);
                      }}
                    />
                  </th>
                )}
                <th className="text-left px-2 py-1.5">Tanggal PO</th>
                <th className="text-left px-2 py-1.5">Nomor SO</th>
                <th className="text-left px-2 py-1.5">Customer</th>
                <th className="text-left px-2 py-1.5">PO Customer</th>
                <th className="text-left px-2 py-1.5">Item / Deskripsi</th>
                {canSeePrice && <th className="text-right px-2 py-1.5">Nilai</th>}
                <th className="text-left px-2 py-1.5">Status Eng</th>
              </tr>
            </thead>
            <tbody data-testid="so-table">
              {loading && (<tr><td colSpan={(canSeePrice ? 7 : 6) + (canDelete ? 1 : 0)} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filteredList.length === 0 && (<tr><td colSpan={(canSeePrice ? 7 : 6) + (canDelete ? 1 : 0)} className="p-6 text-center text-slate-400">Belum ada SO.</td></tr>)}
              {pag.pagedData.map((s) => {
                const st = DR_STATUS[s.drawing_request_status] || DR_STATUS.belum_drawing_request;
                const StIcon = st.icon;
                const itemCount = (s.items || []).length;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 hover:bg-emerald-50/60 cursor-pointer"
                    data-testid={`so-row-${s.so_no}`}
                    onClick={() => setDetail(s)}
                    title="Klik untuk lihat detail SO"
                  >
                    {canDelete && (
                      <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          data-testid={`so-select-${s.so_no}`}
                          checked={selected.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(s.id); else next.delete(s.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{formatDateID(s.so_date)}</td>
                    <td className="px-2 py-1.5 font-mono text-xs font-semibold text-slate-900">{s.so_no}</td>
                    <td className="px-2 py-1.5">{s.customer || "-"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{s.po_customer_no || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-slate-600 max-w-[320px] truncate">
                      {itemCount > 0
                        ? <span>{itemCount} item · <span className="text-slate-400">{(s.items || []).map((it) => it.name).filter(Boolean).slice(0, 2).join(", ")}{itemCount > 2 ? "…" : ""}</span></span>
                        : (s.description || <span className="text-slate-300">—</span>)}
                    </td>
                    {canSeePrice && <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{itemCount > 0 ? fmtMoney(s.total_amount, s.currency) : "—"}</td>}
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${st.cls}`} data-testid={`so-status-${s.so_no}`}>
                        <StIcon size={11} weight="bold" /> {st.label}
                      </span>
                      {s.drawing_count > 0 && (
                        <span className="ml-2 text-[10px] text-slate-500" data-testid={`so-dwg-summary-${s.so_no}`} title={(s.drawings || []).map((x) => `${x.drawing_no} (${x.status || "-"})`).join("\n")}>
                          {s.drawing_done}/{s.drawing_count} dwg
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="SO" testIdPrefix="so-pag" />
      </Card>

      {bulkConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" data-testid="so-bulk-confirm">
          <Card className="rounded-none border-slate-300 w-full max-w-md bg-white">
            <div className="px-4 py-3 bg-red-700 text-white flex items-center gap-2">
              <Trash size={16} weight="fill" />
              <span className="font-bold uppercase text-sm tracking-widest">Hapus {selected.size} Sales Order</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600">Anda akan menghapus <b>{selected.size}</b> Sales Order sekaligus. Tindakan ini hanya untuk Admin dan tidak bisa dibatalkan dari sini.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkConfirm(false)} className="rounded-none">Batal</Button>
                <Button onClick={doBulkDelete} disabled={bulkBusy} className="rounded-none bg-red-700 hover:bg-red-800 text-white disabled:opacity-40" data-testid="so-bulk-confirm-btn">
                  <Trash size={14} weight="bold" className="mr-1" /> {bulkBusy ? "Menghapus..." : `Hapus ${selected.size} SO`}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {dlg && (
        <SalesOrderFormDialog
          mode={dlg.mode}
          so={dlg.so}
          fromQuotation={dlg.fromQuotation}
          canSeePrice={canSeePrice}
          currentUserName={user?.name || user?.username || ""}
          onClose={() => setDlg(null)}
          onSaved={() => { setDlg(null); load(); }}
        />
      )}

      {detail && (
        <SoDetailModal
          so={detail}
          canSeePrice={canSeePrice}
          canCreate={canCreate}
          canDelete={canDelete}
          onEdit={() => { const s = detail; setDetail(null); setDlg({ mode: "edit", so: s }); }}
          onAjukanDR={() => { const s = detail; setDetail(null); setDrTarget(s); }}
          onOpenDR={(drf) => { setDetail(null); setDrfOpen(drf); }}
          onDelete={() => { const s = detail; setDetail(null); setDel(s); }}
          onClose={() => setDetail(null)}
        />
      )}

      {drTarget && (
        <DrawingRequestFormDialog
          initial={{
            request_type: "new_order",
            so_no: drTarget.so_no,
            project_name: drTarget.description || "",
            customer_name: drTarget.customer || "",
            po_customer_no: drTarget.po_customer_no || "",
            po_received_date: drTarget.so_date || "",
            delivery_due_date: drTarget.due_date || "",
            items: (drTarget.items || []).map((it) => ({ name: it.name || "", qty: it.qty ?? 1, unit: it.unit || "pcs", material: "TBA" })),
          }}
          onClose={() => setDrTarget(null)}
          onSaved={() => { setDrTarget(null); load(); }}
        />
      )}

      {drfOpen && (
        <DrawingRequestFormDialog
          initial={drfOpen}
          onClose={() => setDrfOpen(null)}
          onSaved={() => { setDrfOpen(null); load(); }}
        />
      )}

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="rounded-none">
          <DialogHeader><DialogTitle>Hapus SO?</DialogTitle><DialogDescription>Yakin hapus <b>{del?.so_no}</b> — {del?.customer}?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)} className="rounded-none">Batal</Button>
            <Button onClick={doDelete} className="rounded-none bg-red-600 hover:bg-red-700 text-white">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader><DialogTitle>Import SO dari Excel</DialogTitle>
            <DialogDescription>Kolom: <b>Nomor SO</b>, <b>Tanggal</b>, <b>Customer</b>, <b>Description</b>. Duplikat dilewati.</DialogDescription>
          </DialogHeader>
          <input type="file" accept=".xlsx" data-testid="so-import-file" onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:py-2 file:px-4 file:rounded-none file:border file:border-slate-300 file:bg-white file:text-slate-700 file:text-xs file:uppercase file:font-semibold hover:file:bg-slate-50" />
          {importFile && <div className="mt-2 text-xs text-slate-500">File: <b>{importFile.name}</b></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} className="rounded-none">Batal</Button>
            <Button data-testid="confirm-so-import" onClick={doImport} disabled={importing || !importFile} className="rounded-none bg-slate-900 hover:bg-slate-800">{importing ? "Mengimpor..." : "Upload & Import"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Create / Edit Sales Order ---------------- */
function SalesOrderFormDialog({ mode, so, fromQuotation, canSeePrice, currentUserName, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [soNo, setSoNo] = useState(so?.so_no || "");
  const [soDate, setSoDate] = useState(so?.so_date || today());
  const [dueDate, setDueDate] = useState(so?.due_date || "");
  const [customer, setCustomer] = useState(so?.customer || "");
  const [customerAddress, setCustomerAddress] = useState(so?.customer_address || "");
  const [poNo, setPoNo] = useState(so?.po_customer_no || "");
  const [salesName, setSalesName] = useState(so?.sales_name || currentUserName || "");
  const [currency, setCurrency] = useState(so?.currency || "IDR");
  const [srcQuoId, setSrcQuoId] = useState(so?.source_quotation_id || "");
  const [srcQuoNo, setSrcQuoNo] = useState(so?.source_quotation_no || "");
  const [customers, setCustomers] = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [items, setItems] = useState(
    (so?.items && so.items.length > 0)
      ? so.items.map((it) => ({ name: it.name || "", qty: it.qty ?? 1, unit: it.unit || "pcs", price: it.price ?? 0 }))
      : [{ name: "", qty: 1, unit: "pcs", price: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [showAddCust, setShowAddCust] = useState(false);
  const [autoSave, setAutoSave] = useState(false);

  // Lanjutkan simpan SO otomatis setelah customer baru ditambahkan ke Master
  useEffect(() => {
    if (autoSave) { setAutoSave(false); save(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave]);

  useEffect(() => {
    api.get("/customers", { params: { limit: 1000 } }).then(({ data }) => setCustomers(data.items || data || [])).catch(() => {});
    api.get("/sales-users").then(({ data }) => setSalesUsers(data.items || [])).catch(() => {});
  }, []);

  const soNoValid = /^00\d{4}$/.test(soNo.trim());
  const grandTotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);

  const setItem = (i, patch) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setItems((p) => [...p, { name: "", qty: 1, unit: "pcs", price: 0 }]);
  const removeItem = (i) => setItems((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);

  const pickCustomer = (c) => {
    setCustomer(c.name || c.customer_name || "");
    if (c.address) setCustomerAddress(c.address);
  };

  const pickQuotation = (quo) => {
    setSrcQuoId(quo.id || ""); setSrcQuoNo(quo.quotation_no || "");
    if (quo.customer_name) setCustomer(quo.customer_name);
    if (quo.customer_address) setCustomerAddress(quo.customer_address);
    if (quo.currency) setCurrency(quo.currency);
    const mapped = (quo.items || []).map((it) => ({
      name: it.description || it.item_name || "", qty: Number(it.qty) || 1, unit: it.unit || "pcs", price: Number(it.unit_price) || 0,
    }));
    if (mapped.length > 0) setItems(mapped);
    toast.success(`Data ditarik dari quotation ${quo.quotation_no || ""}`);
  };

  // Prefill dari Quotation Confirm Order redirect
  useEffect(() => {
    if (fromQuotation) pickQuotation(fromQuotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!soNoValid) return toast.error("Nomor SO wajib 6 digit diawali '00' (mis. 005251)");
    if (!customer.trim()) return toast.error("Customer wajib diisi");
    // Wajib ada di Master Customer — kalau belum, munculkan popup input lengkap dulu
    const custExists = (customers || []).some(
      (c) => (c.name || c.customer_name || "").trim().toLowerCase() === customer.trim().toLowerCase()
    );
    if (!custExists) {
      toast.info("Customer belum terdaftar — lengkapi data Master Customer dulu");
      setShowAddCust(true);
      return;
    }
    const cleanItems = items.filter((it) => (it.name || "").trim());
    if (cleanItems.length === 0) return toast.error("Minimal 1 item dengan nama diisi");
    setSaving(true);
    try {
      const payload = {
        so_no: soNo.trim(), so_date: soDate, due_date: dueDate, customer: customer.trim(), customer_address: customerAddress,
        po_customer_no: poNo.trim(), sales_name: salesName.trim(), currency,
        source_quotation_id: srcQuoId, source_quotation_no: srcQuoNo,
        items: cleanItems.map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 0, unit: it.unit || "pcs", price: Number(it.price) || 0 })),
      };
      if (isEdit) await api.put(`/sales-orders/${so.id}/full`, payload);
      else await api.post("/sales-orders/full", payload);
      toast.success(isEdit ? "SO diperbarui" : "Sales Order dibuat");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan SO"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-4" data-testid="so-form-dialog">
      <div className="bg-white w-full max-w-3xl border border-slate-300 flex flex-col max-h-[92vh] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-700 text-white shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">{isEdit ? "Edit Sales Order" : "Buat Sales Order Baru"}</div>
            <div className="font-semibold">Tarik dari Quotation (opsional) atau isi manual</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20" data-testid="so-form-close"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {!isEdit && (
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Ref Quotation <span className="normal-case font-normal text-slate-400">(opsional — tarik data otomatis)</span></Label>
              <QuotationAutocomplete onPick={pickQuotation} />
              {srcQuoNo && <div className="mt-1 text-[11px] text-emerald-700">Terhubung: <b>{srcQuoNo}</b></div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO * <span className="normal-case font-normal text-slate-400">(6 digit, 00xxxx)</span></Label>
              <Input data-testid="so-input-no" className={`${inputCls} font-mono ${soNo && !soNoValid ? "border-red-400" : ""}`} value={soNo} onChange={(e) => setSoNo(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="005251" />
              {soNo && !soNoValid && <div className="text-[10px] text-red-500 mt-0.5">Harus 6 digit diawali "00"</div>}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal PO</Label>
              <Input type="date" className={inputCls} value={soDate} onChange={(e) => setSoDate(e.target.value)} data-testid="so-input-date" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Due Date (Delivery)</Label>
              <Input type="date" data-testid="so-input-due" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">No. PO Customer</Label>
              <Input data-testid="so-input-po" className={inputCls} value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="PO-xxxx" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Customer * <span className="normal-case font-normal text-slate-400">(dari Master Customer)</span></Label>
              <CustomerAutocomplete customers={customers} value={customer} onChangeText={setCustomer} onPick={pickCustomer} />
              {customerAddress && <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1" title={customerAddress}>{customerAddress}</div>}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Sales</Label>
              <SalesNamePicker value={salesName} onChange={setSalesName} options={salesUsers} />
            </div>
          </div>

          {/* Item table */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold text-slate-600">Item Pesanan <span className="normal-case font-normal text-slate-400">(bisa diedit / tambah bila tidak sesuai quotation)</span></Label>
              <div className="flex items-center gap-2">
                {canSeePrice && (
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-7 text-xs border border-slate-300 rounded-none px-1" data-testid="so-currency">
                    <option value="IDR">IDR</option><option value="USD">USD</option><option value="SGD">SGD</option><option value="EUR">EUR</option>
                  </select>
                )}
                <Button type="button" onClick={addItem} variant="outline" className="rounded-none h-7 text-[10px] uppercase font-bold" data-testid="so-add-item"><Plus size={12} weight="bold" className="mr-1" /> Tambah</Button>
              </div>
            </div>
            <div className="border border-slate-200 overflow-x-auto">
              <table className="w-full text-xs" data-testid="so-items-table">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="text-left p-2 w-8">No</th>
                    <th className="text-left p-2">Nama Item *</th>
                    <th className="text-right p-2 w-20">Qty</th>
                    <th className="text-left p-2 w-24">Unit</th>
                    {canSeePrice && <th className="text-right p-2 w-32">Harga/Item</th>}
                    {canSeePrice && <th className="text-right p-2 w-32">Total</th>}
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100" data-testid={`so-item-row-${i}`}>
                      <td className="p-1.5 text-slate-400">{i + 1}</td>
                      <td className="p-1.5"><Input className="h-8 rounded-none text-xs" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Nama item" data-testid={`so-item-name-${i}`} /></td>
                      <td className="p-1.5"><Input type="number" min="0" className="h-8 rounded-none text-xs text-right" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} data-testid={`so-item-qty-${i}`} /></td>
                      <td className="p-1.5"><Input className="h-8 rounded-none text-xs" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} placeholder="pcs" /></td>
                      {canSeePrice && <td className="p-1.5"><Input type="number" min="0" className="h-8 rounded-none text-xs text-right" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} data-testid={`so-item-price-${i}`} /></td>}
                      {canSeePrice && <td className="p-1.5 text-right tabular-nums font-semibold text-slate-700">{((Number(it.qty) || 0) * (Number(it.price) || 0)).toLocaleString("id-ID")}</td>}
                      <td className="p-1.5 text-center"><button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-500" title="Hapus item"><Trash size={13} weight="bold" /></button></td>
                    </tr>
                  ))}
                </tbody>
                {canSeePrice && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td colSpan={5} className="p-2 text-right uppercase text-[10px] tracking-widest text-slate-500">Total</td>
                      <td className="p-2 text-right tabular-nums text-emerald-700" data-testid="so-grand-total">{fmtMoney(grandTotal, currency)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button onClick={save} disabled={saving || !soNoValid} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40" data-testid="so-save-btn">
            {saving ? <CircleNotch size={14} className="animate-spin mr-1" /> : <CheckCircle size={14} weight="bold" className="mr-1" />}
            {isEdit ? "Simpan Perubahan" : "Simpan Sales Order"}
          </Button>
        </div>
      </div>

      <AddCustomerDialog
        open={showAddCust}
        initialName={customer}
        onClose={() => setShowAddCust(false)}
        onSaved={(c) => {
          setCustomers((prev) => [...(prev || []), c]);
          setCustomer(c.name);
          if (c.address) setCustomerAddress(c.address);
          setShowAddCust(false);
          setAutoSave(true); // lanjutkan simpan SO otomatis
        }}
      />
    </div>
  );
}

/* Quotation autocomplete for pulling into SO */
function QuotationAutocomplete({ onPick }) {
  const [text, setText] = useState("");
  const [sug, setSug] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const { data } = await api.get("/quotations", { params: { q: text || "" } }); setSug((data.items || data || []).slice(0, 12)); }
      catch { setSug([]); } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [text, open]);
  return (
    <div className="relative">
      <Input className={inputCls} value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} placeholder="Cari No Quotation / Customer / Project" data-testid="so-quo-search" autoComplete="off" />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-300 shadow-md max-h-56 overflow-y-auto z-30" data-testid="so-quo-suggestions">
          <div className="px-2 py-1 bg-slate-50 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 border-b flex items-center justify-between">
            <span>Quotation{sug.length ? ` (${sug.length})` : ""}</span>{loading && <CircleNotch size={11} className="animate-spin" />}
          </div>
          {!loading && sug.length === 0 ? (
            <div className="px-2 py-2 text-xs text-slate-400 italic">Tidak ada quotation. Anda tetap bisa isi SO manual di bawah.</div>
          ) : sug.map((qo) => (
            <button key={qo.id} type="button" onClick={() => { onPick(qo); setOpen(false); setText(qo.quotation_no || ""); }} className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 border-b border-slate-100 text-xs" data-testid={`so-quo-opt-${qo.id}`}>
              <div className="font-mono font-semibold text-slate-900">{qo.quotation_no}</div>
              <div className="text-slate-500 text-[11px]">{qo.customer_name || "-"}{qo.project_name ? ` · ${qo.project_name}` : ""} · {(qo.items || []).length} item</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Master Customer autocomplete — pilih dari master (isi nama + alamat) atau ketik manual */
function CustomerAutocomplete({ customers, value, onChangeText, onPick }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const list = customers || [];
    if (!q) return list.slice(0, 20);
    return list.filter((c) => (c.name || c.customer_name || "").toLowerCase().includes(q)).slice(0, 20);
  }, [customers, value]);
  return (
    <div className="relative">
      <Input
        className={inputCls}
        value={value}
        onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Cari / pilih customer..."
        data-testid="so-input-customer"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-300 shadow-md max-h-56 overflow-y-auto z-30" data-testid="so-customer-suggestions">
          {matches.map((c) => (
            <button
              key={c.id || c.customer_code || c.name}
              type="button"
              onClick={() => { onPick(c); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 border-b border-slate-100 text-xs"
              data-testid={`so-customer-opt-${c.customer_code || c.id || (c.name || "").slice(0, 6)}`}
            >
              <div className="font-semibold text-slate-900">{c.name || c.customer_name}{(c.customer_code) && <span className="ml-1 font-mono text-slate-400">· {c.customer_code}</span>}</div>
              {c.address && <div className="text-slate-500 text-[11px] line-clamp-1">{c.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Nama Sales — default user aktif, bisa diketik bebas atau dipilih dari daftar user Sales/Admin */
function SalesNamePicker({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const list = options || [];
    if (!q) return list.slice(0, 20);
    return list.filter((u) => (u.name || u.username || "").toLowerCase().includes(q)).slice(0, 20);
  }, [options, value]);
  return (
    <div className="relative">
      <Input
        className={inputCls}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Nama sales (otomatis, bisa diubah)"
        data-testid="so-input-sales"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-300 shadow-md max-h-56 overflow-y-auto z-30" data-testid="so-sales-suggestions">
          {matches.map((u) => (
            <button
              key={u.id || u.username}
              type="button"
              onClick={() => { onChange(u.name || u.username); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 border-b border-slate-100 text-xs flex items-center justify-between"
              data-testid={`so-sales-opt-${u.username || u.id}`}
            >
              <span className="font-medium text-slate-800">{u.name || u.username}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">{u.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


/* Label status DR (level DRF) */
const DRF_STATUS_LABEL = {
  draft: { label: "Draft (belum dikirim)", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  submitted: { label: "Terkirim ke Engineering", cls: "bg-amber-100 text-amber-800 border-amber-400" },
  accepted: { label: "Diterima Engineering", cls: "bg-sky-100 text-sky-800 border-sky-400" },
  received: { label: "Diterima Engineering", cls: "bg-sky-100 text-sky-800 border-sky-400" },
  in_progress: { label: "Dikerjakan Engineering", cls: "bg-violet-100 text-violet-800 border-violet-400" },
  completed: { label: "Selesai Engineering", cls: "bg-emerald-100 text-emerald-800 border-emerald-500" },
  revision_requested: { label: "Menunggu Approval Revisi", cls: "bg-orange-100 text-orange-800 border-orange-400" },
};

/* SO detail view (respects price visibility) + aksi (Edit / Ajukan DR / Hapus) + daftar DR & lampiran */
function SoDetailModal({ so, canSeePrice, canCreate, canDelete, onEdit, onAjukanDR, onOpenDR, onDelete, onClose }) {
  const st = DR_STATUS[so.drawing_request_status] || DR_STATUS.belum_drawing_request;
  const canEdit = canCreate && (so.items || []).length > 0;
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const [drfs, setDrfs] = useState([]);
  const [drfLoading, setDrfLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setDrfLoading(true);
    api.get("/drawing-requests", { params: { so_no: so.so_no } })
      .then(({ data }) => { if (alive) setDrfs(data?.items || []); })
      .catch(() => { if (alive) setDrfs([]); })
      .finally(() => { if (alive) setDrfLoading(false); });
    return () => { alive = false; };
  }, [so.so_no]);

  // "Ajukan DR baru" hanya bila belum ada DR sama sekali untuk SO ini
  const hasDrf = drfs.length > 0;
  const canAjukan = canCreate && !drfLoading && !hasDrf;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" data-testid="so-detail-modal">
      <div className="bg-white w-full max-w-2xl border border-slate-300 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white shrink-0">
          <div><div className="text-[10px] uppercase tracking-widest opacity-70">Detail Sales Order</div><div className="font-mono font-bold text-lg">{so.so_no}</div></div>
          <button onClick={onClose} className="p-1 hover:bg-white/20"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3 text-sm overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Customer" value={so.customer} />
            <Info label="No. PO Customer" value={so.po_customer_no} />
            <Info label="Tanggal PO" value={formatDateID(so.so_date)} />
            <Info label="Ref Quotation" value={so.source_quotation_no || "-"} />
            <Info label="Nama Sales" value={so.sales_name} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Status Proses Engineering</div>
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border ${st.cls}`}>{st.label}</span>
          </div>

          {/* Daftar Drawing Request untuk SO ini + lampiran */}
          <div data-testid="so-detail-drf-section">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Drawing Request</div>
            {drfLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><CircleNotch size={14} className="animate-spin" /> Memuat data DR…</div>
            ) : !hasDrf ? (
              <div className="text-xs text-slate-400 italic border border-dashed border-slate-200 p-3">Belum ada Drawing Request untuk SO ini.</div>
            ) : (
              <div className="space-y-2">
                {drfs.map((drf) => {
                  const ds = DRF_STATUS_LABEL[drf.status] || DRF_STATUS_LABEL.draft;
                  const files = drf.attached_files || [];
                  const isDraft = drf.status === "draft";
                  return (
                    <div key={drf.id} className="border border-slate-200" data-testid={`so-drf-card-${drf.form_no || drf.id}`}>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-800">{drf.form_no || "(draft)"}</span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${ds.cls}`}>{ds.label}</span>
                        </div>
                        {canCreate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenDR(drf)}
                            className={`rounded-none h-7 text-[11px] uppercase font-bold ${isDraft ? "border-amber-400 text-amber-700 hover:bg-amber-50" : "border-sky-300 text-sky-700 hover:bg-sky-50"}`}
                            data-testid={`so-drf-open-${drf.form_no || drf.id}`}
                          >
                            {isDraft ? (<><PencilSimple size={13} weight="bold" className="mr-1" /> Lanjutkan / Kirim</>) : (<><Eye size={13} weight="bold" className="mr-1" /> Lihat</>)}
                          </Button>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">Lampiran ({files.length})</div>
                        {files.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic">Tidak ada lampiran.</div>
                        ) : (
                          <div className="space-y-1">
                            {files.map((f) => (
                              <div key={f.file_id} className="flex items-center gap-2 border border-slate-200 px-2 py-1 hover:bg-slate-50">
                                <Paperclip size={12} className="text-slate-400 shrink-0" />
                                <span className="flex-1 text-[11px] truncate">{f.filename}</span>
                                <span className="text-[9px] px-1 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
                                  {(f.category || "other") === "po_customer" ? "PO" : "Lain"}
                                </span>
                                <a
                                  href={`${apiUrl}/api/drawing-requests/${drf.id}/attachments/${f.file_id}/download`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 hover:bg-slate-200 text-slate-600"
                                  title="Buka / lihat file"
                                  data-testid={`so-drf-file-${f.file_id}`}
                                >
                                  <Eye size={13} />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Item ({(so.items || []).length})</div>
            <div className="border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50"><tr className="text-[9px] uppercase text-slate-400"><th className="text-left p-2">Nama</th><th className="text-right p-2">Qty</th><th className="text-left p-2">Unit</th>{canSeePrice && <th className="text-right p-2">Harga</th>}{canSeePrice && <th className="text-right p-2">Total</th>}</tr></thead>
                <tbody>
                  {(so.items || []).length === 0 && <tr><td colSpan={canSeePrice ? 5 : 3} className="p-3 text-center text-slate-400">Tidak ada item (SO lama/import).</td></tr>}
                  {(so.items || []).map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-2 font-medium">{it.name}</td>
                      <td className="p-2 text-right tabular-nums">{it.qty}</td>
                      <td className="p-2">{it.unit}</td>
                      {canSeePrice && <td className="p-2 text-right tabular-nums">{Number(it.price || 0).toLocaleString("id-ID")}</td>}
                      {canSeePrice && <td className="p-2 text-right tabular-nums font-semibold">{Number(it.line_total ?? ((Number(it.qty) || 0) * (Number(it.price) || 0))).toLocaleString("id-ID")}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canSeePrice && (so.items || []).length > 0 && (
              <div className="text-right mt-1 font-bold text-emerald-700">Total: {fmtMoney(so.total_amount, so.currency)}</div>
            )}
            {!canSeePrice && <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1"><Lock size={12} /> Harga hanya untuk Super Admin, Admin & Finance.</div>}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {canAjukan && (
              <Button onClick={onAjukanDR} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs uppercase font-bold" data-testid={`so-detail-ajukan-dr-${so.so_no}`} title="Kirim permintaan gambar kerja ke Engineering">
                <PaperPlaneTilt size={14} weight="bold" className="mr-1" /> Ajukan Drawing Request
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={onEdit} className="rounded-none text-xs uppercase font-bold border-sky-300 text-sky-700 hover:bg-sky-50" data-testid={`so-detail-edit-${so.so_no}`}>
                <PencilSimple size={14} weight="bold" className="mr-1" /> Edit SO
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" onClick={onDelete} className="rounded-none text-xs uppercase font-bold border-red-300 text-red-600 hover:bg-red-50" data-testid={`so-detail-delete-${so.so_no}`}>
                <Trash size={14} weight="bold" className="mr-1" /> Hapus
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</div>
      <div className="text-slate-800">{value || "-"}</div>
    </div>
  );
}
