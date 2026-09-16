import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import BackLink from "../components/BackLink";
import { SortDropdown, sortItems, cmpStr, cmpDateStr } from "../components/SortDropdown";
import { toast } from "sonner";
import { Plus, Trash, CheckCircle, X, Eye, MagnifyingGlass, PencilSimple, Warning, ClipboardText } from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";

const APPROVER_ROLES = new Set(["admin", "super_admin", "supervisor"]);

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-emerald-600 text-sm";
const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll", "Can", "Pack", "Meter"];

const STATUS_META = {
  open: { label: "Open", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  partial: { label: "Sebagian Dibeli", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  fulfilled: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

const CGR_SORT_OPTS = [
  { value: "date_desc", label: "Tanggal: Baru → Lama", sort: (a, b) => cmpDateStr(b.request_date, a.request_date) },
  { value: "date_asc", label: "Tanggal: Lama → Baru", sort: (a, b) => cmpDateStr(a.request_date, b.request_date) },
  { value: "req_by_asc", label: "Request By: A → Z", sort: (a, b) => cmpStr(a.request_by, b.request_by) },
  { value: "req_by_desc", label: "Request By: Z → A", sort: (a, b) => cmpStr(b.request_by, a.request_by) },
  { value: "status_asc", label: "Status: A → Z", sort: (a, b) => cmpStr(a.status, b.status) },
  { value: "items_desc", label: "Jumlah Item: Banyak → Sedikit", sort: (a, b) => (b.items?.length || 0) - (a.items?.length || 0) },
  { value: "items_asc", label: "Jumlah Item: Sedikit → Banyak", sort: (a, b) => (a.items?.length || 0) - (b.items?.length || 0) },
];

export default function ConsumableRequestPage() {
  const { user } = useAuth();
  const isApprover = user && APPROVER_ROLES.has(user.role);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [preview, setPreview] = useState(null);
  const [searching, setSearching] = useState(null);
  const [editingReq, setEditingReq] = useState(null);
  const [sortBy, setSortBy] = useState("date_desc");
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [showApprovals, setShowApprovals] = useState(false);

  const loadApprovals = useCallback(async () => {
    try {
      const { data } = await api.get("/consumable-requests/approvals", { params: { status: "pending" } });
      setPendingApprovals(data || []);
    } catch { /* silent */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/consumable-requests");
      setList(data);
    } catch { toast.error("Gagal memuat"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); loadApprovals(); }, [load, loadApprovals]);

  const sorted = React.useMemo(() => sortItems(list, sortBy, CGR_SORT_OPTS), [list, sortBy]);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Consumable Good Request
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Store minta pembelian consumable. Purchasing tandai saat sudah dibeli — data ter-link ke pembelian.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isApprover && pendingApprovals.length > 0 && (
            <Button
              data-testid="cgr-approval-queue-btn"
              onClick={() => setShowApprovals(true)}
              className="rounded-none bg-amber-500 hover:bg-amber-600 text-white text-xs uppercase tracking-[0.1em] font-bold relative"
            >
              <ClipboardText size={13} weight="bold" className="mr-1.5" /> Approval Queue
              <span className="ml-2 bg-white text-amber-700 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-bold">
                {pendingApprovals.length}
              </span>
            </Button>
          )}
          <SortDropdown testid="cgr-sort-by" value={sortBy} onChange={setSortBy} options={CGR_SORT_OPTS} />
          <Button data-testid="cgr-new" onClick={() => setShowCreate(true)} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em] font-bold">
            <Plus size={13} weight="bold" className="mr-1.5" /> Request Baru
          </Button>
        </div>
      </div>

      {isApprover && pendingApprovals.length > 0 && !showApprovals && (
        <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 flex items-center justify-between" data-testid="cgr-approval-banner">
          <div className="text-sm">
            <Warning size={14} weight="fill" className="inline text-amber-600 mr-1.5" />
            <b className="text-amber-900">{pendingApprovals.length}</b> perubahan menunggu persetujuan Anda (edit/delete dari Store).
          </div>
          <button
            onClick={() => setShowApprovals(true)}
            className="text-xs uppercase tracking-[0.1em] font-bold text-amber-700 hover:text-amber-900"
            data-testid="cgr-approval-banner-open"
          >Buka Queue →</button>
        </div>
      )}

      <Card className="rounded-none border-slate-200 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Tanggal</th>
                <th className="text-left p-3">Request By</th>
                <th className="text-left p-3">Description Singkat</th>
                <th className="text-right p-3">Item</th>
                <th className="text-right p-3">Sudah Dibeli</th>
                <th className="text-left p-3">Status</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="cgr-table">
              {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Memuat...</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">Belum ada request.</td></tr>}
              {sorted.map((r) => {
                const total = (r.items || []).length;
                const bought = (r.items || []).filter((i) => i.purchased).length;
                const st = STATUS_META[r.status] || STATUS_META.open;
                const names = (r.items || []).map((i) => i.description).filter(Boolean);
                const shortDesc = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} lainnya` : "");
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`cgr-row-${r.id}`}>
                    <td className="p-3 text-slate-700 tabular-nums whitespace-nowrap">{formatDateID(r.request_date)}</td>
                    <td className="p-3 text-slate-900 font-semibold">{r.request_by}</td>
                    <td className="p-3 text-slate-600 text-xs max-w-[380px] truncate" title={names.join(", ")}>{shortDesc || <span className="text-slate-300 italic">(kosong)</span>}</td>
                    <td className="p-3 text-right tabular-nums">{total}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-emerald-700">{bought}/{total}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold border ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Button size="sm" variant="outline" onClick={() => setPreview(r)} className="rounded-none h-7 text-xs">
                        <Eye size={12} weight="bold" className="mr-1" /> Detail
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {preview && !searching && !editingReq && <PreviewDialog request={preview} onClose={() => setPreview(null)} onChanged={load} onOpenSearch={(it) => setSearching(it)} onOpenEdit={() => setEditingReq(preview)} />}
      {searching && preview && (
        <SearchTransactionModal
          item={searching}
          requestId={preview.id}
          onClose={() => setSearching(null)}
          onLinked={() => { setSearching(null); load(); }}
        />
      )}
      {editingReq && (
        <EditDialog
          request={editingReq}
          onClose={() => setEditingReq(null)}
          onSaved={(pending) => {
            setEditingReq(null);
            if (pending) toast.info("Permintaan edit terkirim, menunggu approval");
            else toast.success("Request diperbarui");
            load();
            setPreview(null);
          }}
        />
      )}
      {showApprovals && (
        <ApprovalQueueDialog
          approvals={pendingApprovals}
          requests={list}
          onClose={() => setShowApprovals(false)}
          onDone={() => { loadApprovals(); load(); }}
        />
      )}
    </div>
  );
}


function CreateDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({
    request_date: new Date().toISOString().slice(0, 10),
    request_by: "",
    notes: "",
    items: [{ description: "", qty: 1, unit: "Ea", so: "", remarks: "" }],
  });
  const [saving, setSaving] = useState(false);

  const setItem = (i, k, v) => {
    const arr = [...form.items]; arr[i] = { ...arr[i], [k]: v };
    setForm({ ...form, items: arr });
  };
  const addItem = () => {
    setForm((f) => ({ ...f, items: [...f.items, { description: "", qty: 1, unit: "Ea", so: "", remarks: "" }] }));
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="cgr-item-desc-${form.items.length}"]`);
      if (el) el.focus();
    }, 30);
  };
  const rmItem = (i) => setForm({ ...form, items: form.items.filter((_, j) => j !== i) });

  // Enter navigation across item cells: desc → qty → unit → so → remarks → next row's desc (or new row)
  const CELL_ORDER = ["desc", "qty", "unit", "so", "remarks"];
  const onCellKey = (e, i, cell) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const idx = CELL_ORDER.indexOf(cell);
    if (idx < 0) return;
    if (idx < CELL_ORDER.length - 1) {
      const nx = document.querySelector(`[data-testid="cgr-item-${CELL_ORDER[idx + 1]}-${i}"]`);
      if (nx) nx.focus();
    } else {
      // Enter on Remarks — go to next row's desc or add new row
      if (i === form.items.length - 1) {
        // Only add new row if current row has description
        if (form.items[i].description?.trim()) addItem();
      } else {
        const nx = document.querySelector(`[data-testid="cgr-item-desc-${i + 1}"]`);
        if (nx) nx.focus();
      }
    }
  };

  const save = async () => {
    if (!form.request_by.trim()) return toast.error("Request By wajib");
    const validItems = form.items.filter((i) => i.description?.trim());
    if (validItems.length === 0) return toast.error("Minimal 1 item");
    setSaving(true);
    try {
      await api.post("/consumable-requests", { ...form, items: validItems });
      toast.success("Request tersimpan");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consumable Good Request Baru</DialogTitle>
          <DialogDescription>Isi tanggal, requester, dan daftar item yang perlu dibeli.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal *</Label>
            <Input type="date" data-testid="cgr-date" className={inputCls} value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Request By *</Label>
            <Input data-testid="cgr-request-by" className={inputCls} value={form.request_by} onChange={(e) => setForm({ ...form, request_by: e.target.value })} placeholder="Nama pemohon" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold text-slate-600 block">Items</Label>
            <Button size="sm" variant="outline" onClick={addItem} className="rounded-none h-7 text-xs"><Plus size={11} className="mr-1" /> Tambah</Button>
          </div>
          <div className="space-y-1">
            {form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-1">
                <div className="col-span-1 flex items-center justify-center text-xs text-slate-500">{i + 1}</div>
                <Input className={`${inputCls} col-span-4`} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} onKeyDown={(e) => onCellKey(e, i, "desc")} placeholder="Description" data-testid={`cgr-item-desc-${i}`} />
                <Input className={`${inputCls} col-span-1 text-right`} type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} onKeyDown={(e) => onCellKey(e, i, "qty")} placeholder="Qty" data-testid={`cgr-item-qty-${i}`} />
                <select className={`${inputCls} col-span-1 bg-white`} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} onKeyDown={(e) => onCellKey(e, i, "unit")} data-testid={`cgr-item-unit-${i}`}>
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <Input className={`${inputCls} col-span-2`} value={it.so} onChange={(e) => setItem(i, "so", e.target.value)} onKeyDown={(e) => onCellKey(e, i, "so")} placeholder="SO" data-testid={`cgr-item-so-${i}`} />
                <Input className={`${inputCls} col-span-2`} value={it.remarks} onChange={(e) => setItem(i, "remarks", e.target.value)} onKeyDown={(e) => onCellKey(e, i, "remarks")} placeholder="Remarks" data-testid={`cgr-item-remarks-${i}`} />
                <Button size="sm" variant="ghost" onClick={() => rmItem(i)} className="col-span-1 h-9 text-red-600 rounded-none px-0"><Trash size={13} /></Button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Catatan (opsional)</Label>
          <textarea className="w-full min-h-[60px] border border-slate-300 p-2 text-sm rounded-none" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-none"><X size={12} className="mr-1" /> Batal</Button>
          <Button data-testid="cgr-save" onClick={save} disabled={saving} className="rounded-none bg-emerald-600 text-white">Simpan Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function PreviewDialog({ request, onClose, onChanged, onOpenSearch, onOpenEdit }) {
  const { user } = useAuth();
  const role = user?.role;
  const APPROVERS = new Set(["admin", "super_admin", "supervisor"]);
  const canEditDirect = APPROVERS.has(role) || (role === "store" && request.created_by_id === user?.id && request.status === "open");
  const canRequestEdit = canEditDirect || role === "store";
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    if (!window.confirm(canEditDirect ? "Hapus request ini? Data akan dihapus permanen." : "Kirim permintaan HAPUS ke Admin/Supervisor?")) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/consumable-requests/${request.id}`);
      if (data?.pending_approval) toast.info("Permintaan hapus terkirim, menunggu approval");
      else toast.success("Request dihapus");
      onChanged();
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setDeleting(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Detail Request — {formatDateID(request.request_date)} · {request.request_by}</DialogTitle>
            {canRequestEdit && (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={onOpenEdit} className="h-7 rounded-none text-xs border-sky-300 text-sky-700 hover:bg-sky-50" data-testid="cgr-edit-btn">
                  <PencilSimple size={12} weight="bold" className="mr-1" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={doDelete} disabled={deleting} className="h-7 rounded-none text-xs border-red-300 text-red-700 hover:bg-red-50" data-testid="cgr-delete-btn">
                  <Trash size={12} weight="bold" className="mr-1" /> Hapus
                </Button>
              </div>
            )}
          </div>
          {!canEditDirect && canRequestEdit && (
            <div className="mt-1 text-[10px] uppercase tracking-[0.15em] font-bold text-amber-700 flex items-center gap-1">
              <Warning size={11} weight="fill" /> Edit/Hapus butuh approval Admin/Supervisor
            </div>
          )}
        </DialogHeader>
        {request.notes && <div className="p-2 border-l-4 border-slate-400 bg-slate-50 text-xs">{request.notes}</div>}
        <table className="w-full text-sm border border-slate-200">
          <thead className="bg-slate-100">
            <tr className="text-[10px] uppercase font-bold text-slate-600">
              <th className="p-2 text-left">No</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">Unit</th>
              <th className="p-2 text-left">SO</th>
              <th className="p-2 text-left">Remarks</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {(request.items || []).map((it, idx) => (
              <React.Fragment key={it.id}>
                <tr className={`border-t border-slate-200 ${it.purchased ? "bg-emerald-50" : ""}`}>
                  <td className="p-2">{idx + 1}</td>
                  <td className="p-2 font-semibold">{it.description}</td>
                  <td className="p-2 text-right">{it.qty}</td>
                  <td className="p-2">{it.unit}</td>
                  <td className="p-2">{it.so || "-"}</td>
                  <td className="p-2 text-xs text-slate-600">{it.remarks || "-"}</td>
                  <td className="p-2 text-center">
                    {it.purchased ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle size={12} weight="fill" /> Dibeli</span>
                    ) : <span className="text-[10px] text-amber-700">Belum</span>}
                  </td>
                  <td className="p-2 text-center">
                    {!it.purchased && (
                      <Button size="sm" onClick={() => onOpenSearch(it)} className="h-8 text-xs rounded-none bg-sky-600 hover:bg-sky-700 text-white" data-testid={`cgr-search-link-${it.id}`}>
                        <MagnifyingGlass size={11} weight="bold" className="mr-1" /> Cari & Link
                      </Button>
                    )}
                    {it.purchased && (
                      <span className="text-[10px] text-emerald-700 font-bold uppercase">✓ Sudah</span>
                    )}
                  </td>
                </tr>
                {(it.purchases || []).map((p, pi) => (
                  <tr key={pi} className="text-xs text-slate-600 bg-slate-50 border-t border-slate-100">
                    <td></td>
                    <td className="p-2 pl-6 italic">↳ {p.actual_item_name}</td>
                    <td className="p-2 text-right">{p.qty_bought}</td>
                    <td className="p-2">{p.unit}</td>
                    <td className="p-2" colSpan={2}>Vendor: <b>{p.vendor_name}</b> · PO {p.po_no || "-"} · {formatDateID(p.purchase_date)}</td>
                    <td colSpan={2} className="p-2 text-right text-slate-500">oleh {p.purchased_by}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* SearchTransactionModal lifted to parent — see ConsumableRequestPage */}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none"><X size={12} className="mr-1" /> Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function SearchTransactionModal({ item, requestId, onClose, onLinked }) {
  const [q, setQ] = useState(item.description || "");
  const [days, setDays] = useState(60);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(null);

  const search = useCallback(async (kw, d) => {
    setLoading(true);
    try {
      const { data } = await api.get("/consumable-requests/search-transactions", { params: { q: kw ?? q, days: d ?? days } });
      setResults(data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || `Gagal cari (${e.message || "network error"})`);
      setResults([]);
    }
    finally { setLoading(false); }
  }, [q, days]);

  // Auto-search on mount and whenever q/days change (debounced 350ms)
  useEffect(() => {
    const t = setTimeout(() => { search(q, days); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, days]);

  const doLink = async (tx) => {
    if (!window.confirm(`Link transaksi "${tx.item_name}" (${tx.vendor_name}, ${formatDateID(tx.invoice_date)}) ke request item "${item.description}"?`)) return;
    setLinking(tx.id);
    try {
      await api.post(`/consumable-requests/${requestId}/items/${item.id}/link-transaction`, { transaction_id: tx.id });
      toast.success("Transaksi ter-link ke request");
      onLinked();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal link"); }
    finally { setLinking(null); }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="cgr-search-modal">
      <div className="bg-white w-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-sky-50">
          <div>
            <div className="text-sm font-bold text-sky-900">Cari Transaksi untuk Link ke "{item.description}"</div>
            <div className="text-[11px] text-sky-800">Cari transaksi yang sudah tercatat di sistem — link ke item request ini supaya status berubah menjadi <b>Dibeli</b> otomatis.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" data-testid="cgr-search-close" type="button"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input data-testid="cgr-search-q" className="h-9 rounded-none text-sm w-full pl-9 pr-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari item / vendor / PO / invoice — kosongkan untuk semua transaksi" autoFocus />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                data-testid="cgr-search-clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                title="Kosongkan pencarian"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-none border border-slate-300 px-2 text-sm">
            <option value={30}>30 hari</option>
            <option value={60}>60 hari</option>
            <option value={90}>90 hari</option>
            <option value={180}>180 hari</option>
            <option value={365}>1 tahun</option>
          </select>
          {loading && <span className="text-xs text-slate-500 italic">mencari...</span>}
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="p-2 text-left">Tanggal</th>
                <th className="p-2 text-left">Vendor</th>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">PO / Invoice</th>
                <th className="p-2 text-left">SO</th>
                <th className="p-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && !loading && (
                <tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">Tidak ada transaksi ditemukan. Coba perluas rentang hari atau ubah kata kunci.</td></tr>
              )}
              {results.map((tx) => (
                <tr key={tx.id} className={`border-b border-slate-100 hover:bg-sky-50 ${tx.already_linked ? "bg-slate-50 opacity-60" : ""}`} data-testid={`cgr-search-row-${tx.id}`}>
                  <td className="p-2 whitespace-nowrap text-slate-600 tabular-nums">{formatDateID(tx.invoice_date)}</td>
                  <td className="p-2 font-semibold text-slate-800">{tx.vendor_name}</td>
                  <td className="p-2 text-slate-900">{tx.item_name}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{tx.qty}</td>
                  <td className="p-2 text-slate-500 uppercase">{tx.unit}</td>
                  <td className="p-2 font-mono text-[11px] text-slate-600">
                    {tx.po_no && <div>PO: {tx.po_no}</div>}
                    {tx.invoice_no && <div>Inv: {tx.invoice_no}</div>}
                  </td>
                  <td className="p-2 font-mono text-xs text-emerald-700">{tx.project_no || "-"}</td>
                  <td className="p-2 text-center">
                    {tx.already_linked ? (
                      <span className="text-[10px] italic text-slate-500">sudah ter-link</span>
                    ) : (
                      <Button size="sm" onClick={() => doLink(tx)} disabled={linking === tx.id} className="rounded-none h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`cgr-search-link-btn-${tx.id}`}>
                        {linking === tx.id ? "..." : "Link"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-600">{results.length} transaksi ditemukan dalam <b>{days}</b> hari terakhir</div>
          <Button variant="outline" type="button" onClick={onClose} className="rounded-none h-9">Batal</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}


function EditDialog({ request, onClose, onSaved }) {
  const [form, setForm] = useState({
    request_date: request.request_date,
    request_by: request.request_by,
    notes: request.notes || "",
    items: (request.items || []).map((it) => ({ ...it })),
  });
  const [saving, setSaving] = useState(false);

  const setItem = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { id: crypto.randomUUID(), description: "", qty: 1, unit: "Ea", so: "", remarks: "", purchased: false, purchases: [] }] }));
  const rmItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }));

  const save = async () => {
    if (!form.request_by.trim() || form.items.length === 0) return toast.error("Request By & minimal 1 item wajib");
    setSaving(true);
    try {
      const { data } = await api.patch(`/consumable-requests/${request.id}`, form);
      onSaved(!!data?.pending_approval);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Request Consumable</DialogTitle>
          <DialogDescription>Sesuaikan tanggal, requester, catatan, atau daftar item. Simpan untuk apply / kirim approval.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <Label className="text-xs font-bold text-slate-600">Tanggal Request</Label>
            <Input type="date" className={inputCls} value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-600">Request By *</Label>
            <Input className={inputCls} value={form.request_by} onChange={(e) => setForm({ ...form, request_by: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-bold text-slate-600">Catatan</Label>
            <Input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="opsional" />
          </div>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-1 text-[10px] uppercase font-bold text-slate-500 px-1">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4">Description</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-1">Unit</div>
            <div className="col-span-2">SO</div>
            <div className="col-span-2">Remarks</div>
            <div className="col-span-1"></div>
          </div>
          {form.items.map((it, i) => (
            <div key={it.id || i} className="grid grid-cols-12 gap-1">
              <div className="col-span-1 flex items-center justify-center text-xs text-slate-500">{i + 1}{it.purchased && <span className="ml-1 text-emerald-600" title="Sudah dibeli">✓</span>}</div>
              <Input className={`${inputCls} col-span-4`} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Description" />
              <Input className={`${inputCls} col-span-1 text-right`} type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
              <select className={`${inputCls} col-span-1 bg-white`} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <Input className={`${inputCls} col-span-2`} value={it.so} onChange={(e) => setItem(i, "so", e.target.value)} placeholder="SO" />
              <Input className={`${inputCls} col-span-2`} value={it.remarks} onChange={(e) => setItem(i, "remarks", e.target.value)} placeholder="Remarks" />
              <Button size="sm" variant="ghost" onClick={() => rmItem(i)} className="col-span-1 h-9 text-red-600 rounded-none px-0" disabled={it.purchased} title={it.purchased ? "Item sudah dibeli, tidak dapat dihapus" : "Hapus item"}><Trash size={13} /></Button>
            </div>
          ))}
          <Button size="sm" onClick={addItem} variant="outline" className="rounded-none w-full mt-1 text-xs"><Plus size={11} className="mr-1" /> Tambah Item</Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button onClick={save} disabled={saving} data-testid="cgr-edit-save" className="rounded-none bg-sky-600 hover:bg-sky-700 text-white">
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Approval Queue Dialog (Admin/Supervisor) --------------------
function ApprovalQueueDialog({ approvals, requests, onClose, onDone }) {
  const [busyId, setBusyId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null); // approval object
  const [rejectReason, setRejectReason] = useState("");
  const reqMap = React.useMemo(() => Object.fromEntries((requests || []).map((r) => [r.id, r])), [requests]);

  const doApprove = async (ap) => {
    if (!window.confirm(`Approve permintaan ${ap.action.toUpperCase()} dari ${ap.requested_by_name}?`)) return;
    setBusyId(ap.id);
    try {
      await api.post(`/consumable-requests/approvals/${ap.id}/approve`);
      toast.success("Perubahan disetujui");
      onDone && onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal approve");
    } finally { setBusyId(null); }
  };

  const doReject = async () => {
    if (!rejectFor) return;
    if (!rejectReason.trim()) { toast.error("Alasan wajib diisi"); return; }
    setBusyId(rejectFor.id);
    try {
      await api.post(`/consumable-requests/approvals/${rejectFor.id}/reject`, { reason: rejectReason.trim() });
      toast.success("Perubahan ditolak");
      setRejectFor(null); setRejectReason("");
      onDone && onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reject");
    } finally { setBusyId(null); }
  };

  const summariseEditDiff = (ap) => {
    const cur = reqMap[ap.request_id];
    if (!cur) return "Request sudah tidak tersedia";
    const payload = ap.payload || {};
    const chips = [];
    if (payload.request_by && payload.request_by !== cur.request_by) chips.push(`Request By: ${cur.request_by} → ${payload.request_by}`);
    if (payload.request_date && payload.request_date !== cur.request_date) chips.push(`Tgl: ${cur.request_date} → ${payload.request_date}`);
    if (payload.notes !== undefined && payload.notes !== cur.notes) chips.push(`Notes berubah`);
    if (Array.isArray(payload.items)) {
      const curCount = (cur.items || []).length;
      const newCount = payload.items.length;
      if (curCount !== newCount) chips.push(`Item: ${curCount} → ${newCount}`);
      else chips.push(`${newCount} item di-edit`);
    }
    return chips.length ? chips.join(" · ") : "Tidak ada perubahan terdeteksi";
  };

  return (
    <>
      <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="rounded-none max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="approval-queue-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold" style={{ fontFamily: "Chivo, sans-serif" }}>
              Approval Queue — Consumable Requests
            </DialogTitle>
            <DialogDescription>
              Permintaan edit/hapus dari user Store yang membutuhkan persetujuan.
            </DialogDescription>
          </DialogHeader>

          {approvals.length === 0 && (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200">
              Tidak ada permintaan pending saat ini.
            </div>
          )}

          <div className="space-y-3">
            {approvals.map((ap) => {
              const req = reqMap[ap.request_id];
              const isEdit = ap.action === "edit";
              return (
                <div key={ap.id} className="border border-slate-200 bg-white" data-testid={`approval-${ap.id}`}>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold border ${isEdit ? "bg-sky-100 text-sky-800 border-sky-300" : "bg-red-100 text-red-800 border-red-300"}`}>
                        {ap.action}
                      </span>
                      <span className="text-sm text-slate-700">
                        oleh <b>{ap.requested_by_name}</b> · {formatDateID(ap.requested_at?.slice(0, 10))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => doApprove(ap)}
                        disabled={busyId === ap.id}
                        data-testid={`approve-${ap.id}`}
                        className="rounded-none h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em] font-bold"
                      >
                        <CheckCircle size={12} weight="bold" className="mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectFor(ap); setRejectReason(""); }}
                        disabled={busyId === ap.id}
                        data-testid={`reject-${ap.id}`}
                        className="rounded-none h-7 border-red-300 text-red-600 hover:bg-red-50 text-xs uppercase tracking-[0.1em] font-bold"
                      >
                        <X size={12} weight="bold" className="mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                  <div className="px-3 py-2 text-xs text-slate-600 space-y-1">
                    <div>
                      Request: <b className="text-slate-900">{req?.request_by || "-"}</b> · {req?.request_date || "-"} · <span className="text-slate-400">{req?.status || "n/a"}</span>
                    </div>
                    <div className="text-slate-700">
                      {isEdit ? summariseEditDiff(ap) : <span className="text-red-700 font-semibold">Hapus request permanen</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="rounded-none" data-testid="approval-close-btn">Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rejectFor && (
        <Dialog open={true} onOpenChange={(v) => !v && setRejectFor(null)}>
          <DialogContent className="rounded-none max-w-md" data-testid="reject-dialog">
            <DialogHeader>
              <DialogTitle>Alasan Reject</DialogTitle>
              <DialogDescription>
                Tulis alasan yang jelas — pesan ini akan terlihat oleh user Store yang submit.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Alasan</Label>
              <textarea
                className="w-full min-h-[100px] border border-slate-300 rounded-none p-2 text-sm focus:ring-2 focus:ring-red-500"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                data-testid="reject-reason-input"
                placeholder="mis. Qty terlalu banyak, mohon breakdown per SO"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectFor(null)} className="rounded-none">Batal</Button>
              <Button
                onClick={doReject}
                data-testid="confirm-reject-btn"
                className="rounded-none bg-red-600 hover:bg-red-700 text-white"
              >Kirim Reject</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

