import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import BackLink from "../components/BackLink";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Toolbox, Plus, PencilSimple, Trash, MagnifyingGlass, HandGrabbing, ArrowUUpLeft,
  WarningCircle, CheckCircle, ClockCounterClockwise, Wrench, ClipboardText,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const fmtD = (d) => {
  if (!d) return "-";
  try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};
const EMPTY_TOOL = { tool_code: "", name: "", brand: "", spec: "", location: "", condition: "baik", notes: "" };

const STATUS_BADGE = {
  available: { label: "Tersedia", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle },
  borrowed: { label: "Dipinjam", cls: "bg-amber-50 text-amber-700 border-amber-300", icon: HandGrabbing },
  missing: { label: "Hilang", cls: "bg-red-50 text-red-700 border-red-300", icon: WarningCircle },
  maintenance: { label: "Rusak/Servis", cls: "bg-sky-50 text-sky-700 border-sky-200", icon: Wrench },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.available;
  const Icon = s.icon;
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase border ${s.cls}`}><Icon size={11} weight="fill" /> {s.label}</span>;
}

export default function ProductionToolsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [borrowerOptions, setBorrowerOptions] = useState([]);

  const [toolDialog, setToolDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [borrowTool, setBorrowTool] = useState(null);
  const [returnTool, setReturnTool] = useState(null);
  const [missingTool, setMissingTool] = useState(null);
  const [historyTool, setHistoryTool] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (statusFilter) params.status_filter = statusFilter;
      const { data } = await api.get("/production/tools", { params });
      setItems(data.items || []);
      setSummary(data.summary || {});
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat tools"); }
    finally { setLoading(false); }
  }, [q, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/production/tools-borrowers").then(({ data }) => setBorrowerOptions(data.names || [])).catch(() => {});
  }, []);

  const saveTool = async () => {
    const d = toolDialog.data;
    if (!d.name.trim()) return toast.error("Nama alat wajib diisi");
    setSaving(true);
    try {
      if (toolDialog.mode === "add") await api.post("/production/tools", d);
      else await api.put(`/production/tools/${d.id}`, d);
      toast.success(toolDialog.mode === "add" ? "Alat ditambahkan" : "Alat diperbarui");
      setToolDialog(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    try { await api.delete(`/production/tools/${delTarget.id}`); toast.success("Alat dihapus"); setDelTarget(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); }
  };

  const markFound = async (t) => {
    try { await api.post(`/production/tools/${t.id}/found`); toast.success("Alat kembali tersedia"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal update status"); }
  };

  const chips = [
    { key: "", label: "Semua", n: summary.total || 0, cls: "text-slate-700" },
    { key: "available", label: "Tersedia", n: summary.available || 0, cls: "text-emerald-700" },
    { key: "borrowed", label: "Dipinjam", n: summary.borrowed || 0, cls: "text-amber-700" },
    { key: "missing", label: "Hilang", n: summary.missing || 0, cls: "text-red-700" },
    { key: "maintenance", label: "Rusak/Servis", n: summary.maintenance || 0, cls: "text-sky-700" },
  ];

  return (
    <div className="space-y-4" data-testid="production-tools-page">
      <BackLink />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-50 border border-amber-200 text-amber-700"><Toolbox size={22} weight="duotone" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Peminjaman Alat / Tools</h1>
            <p className="text-sm text-slate-500">Inventory alat produksi · siapa pinjam · kapan kembali · alat hilang ketahuan.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button data-testid="tools-opname-btn" variant="outline" onClick={() => navigate("/produksi/tools/opname")} className="rounded-none h-9 border-amber-300 text-amber-700 hover:bg-amber-50">
            <ClipboardText size={14} weight="bold" className="mr-1.5" /> Stok Opname
          </Button>
          <Button data-testid="add-ptool-btn" onClick={() => setToolDialog({ mode: "add", data: { ...EMPTY_TOOL } })} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white h-9">
            <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Alat
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <button key={c.key} data-testid={`ptool-filter-${c.key || "all"}`} onClick={() => setStatusFilter(c.key)}
              className={`px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] font-semibold border transition-colors ${statusFilter === c.key ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 hover:bg-slate-50 " + c.cls}`}>
              {c.label} <span className="ml-1 tabular-nums">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="ptool-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama/kode/lokasi/pemegang…" className="h-8 rounded-none pl-8 w-64 text-sm" />
        </div>
      </div>

      <Card className="rounded-none border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-400">Memuat…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada alat. Klik <b>Tambah Alat</b> untuk mulai membuat inventory.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Kode", "Nama Alat", "Merk", "Spek", "Lokasi", "Status", "Pemegang", "Sejak", "Est. Kembali", "Aksi"].map((h) => (
                  <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`ptool-row-${t.tool_code}`}>
                  <td className="p-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">{t.tool_code}</td>
                  <td className="p-2 font-semibold text-slate-800">{t.name}</td>
                  <td className="p-2 text-slate-600">{t.brand || "-"}</td>
                  <td className="p-2 text-slate-600">{t.spec || "-"}</td>
                  <td className="p-2 text-slate-600">{t.location || "-"}</td>
                  <td className="p-2"><StatusBadge status={t.status} /></td>
                  <td className="p-2 text-slate-700 font-semibold">{t.holder_name || "-"}</td>
                  <td className="p-2 text-slate-600 whitespace-nowrap">{fmtD(t.held_since)}</td>
                  <td className="p-2 text-slate-600 whitespace-nowrap">{fmtD(t.est_return_date)}</td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      {t.status === "available" && (
                        <Button data-testid={`ptool-borrow-${t.tool_code}`} variant="outline" onClick={() => setBorrowTool(t)} className="rounded-none h-7 px-2 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50">
                          <HandGrabbing size={12} weight="bold" className="mr-1" /> Pinjam
                        </Button>
                      )}
                      {t.status === "borrowed" && (
                        <>
                          <Button data-testid={`ptool-return-${t.tool_code}`} variant="outline" onClick={() => setReturnTool(t)} className="rounded-none h-7 px-2 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            <ArrowUUpLeft size={12} weight="bold" className="mr-1" /> Kembalikan
                          </Button>
                          <Button data-testid={`ptool-missing-${t.tool_code}`} variant="outline" onClick={() => setMissingTool(t)} className="rounded-none h-7 px-2 text-[11px] border-red-300 text-red-600 hover:bg-red-50">
                            <WarningCircle size={12} weight="bold" className="mr-1" /> Hilang
                          </Button>
                        </>
                      )}
                      {(t.status === "missing" || t.status === "maintenance") && (
                        <Button data-testid={`ptool-found-${t.tool_code}`} variant="outline" onClick={() => markFound(t)} className="rounded-none h-7 px-2 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                          <CheckCircle size={12} weight="bold" className="mr-1" /> {t.status === "missing" ? "Ditemukan" : "Selesai Servis"}
                        </Button>
                      )}
                      <Button data-testid={`ptool-history-${t.tool_code}`} variant="outline" onClick={() => setHistoryTool(t)} className="rounded-none h-7 px-2" title="Riwayat"><ClockCounterClockwise size={12} weight="bold" /></Button>
                      <Button variant="outline" onClick={() => setToolDialog({ mode: "edit", data: { ...EMPTY_TOOL, ...t } })} className="rounded-none h-7 px-2"><PencilSimple size={12} weight="bold" /></Button>
                      <Button variant="outline" onClick={() => setDelTarget(t)} className="rounded-none h-7 px-2 border-red-300 text-red-600 hover:bg-red-50"><Trash size={12} weight="bold" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add/Edit */}
      <Dialog open={!!toolDialog} onOpenChange={(o) => !o && setToolDialog(null)}>
        <DialogContent className="rounded-none max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{toolDialog?.mode === "add" ? "Tambah Alat" : "Edit Alat"}</DialogTitle>
            <DialogDescription>Inventory alat/tools produksi.</DialogDescription>
          </DialogHeader>
          {toolDialog && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[11px] font-semibold">Kode Alat (auto jika kosong)</Label>
                <Input data-testid="ptool-form-code" value={toolDialog.data.tool_code} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, tool_code: e.target.value } }))} className={inputCls} placeholder="TL-0001" /></div>
              <div><Label className="text-[11px] font-semibold">Nama Alat *</Label>
                <Input data-testid="ptool-form-name" value={toolDialog.data.name} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, name: e.target.value } }))} className={inputCls} placeholder="Bor tangan / Gerinda…" /></div>
              <div><Label className="text-[11px] font-semibold">Merk</Label>
                <Input value={toolDialog.data.brand} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, brand: e.target.value } }))} className={inputCls} /></div>
              <div><Label className="text-[11px] font-semibold">Spek / Ukuran</Label>
                <Input value={toolDialog.data.spec} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, spec: e.target.value } }))} className={inputCls} /></div>
              <div><Label className="text-[11px] font-semibold">Lokasi Simpan</Label>
                <Input value={toolDialog.data.location} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, location: e.target.value } }))} className={inputCls} placeholder="Rak A1 / Tool Crib" /></div>
              <div><Label className="text-[11px] font-semibold">Kondisi</Label>
                <Select value={toolDialog.data.condition} onValueChange={(v) => setToolDialog((s) => ({ ...s, data: { ...s.data, condition: v } }))}>
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="baik">Baik</SelectItem>
                    <SelectItem value="rusak">Rusak</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="col-span-2"><Label className="text-[11px] font-semibold">Catatan</Label>
                <Input value={toolDialog.data.notes} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, notes: e.target.value } }))} className={inputCls} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setToolDialog(null)} className="rounded-none">Batal</Button>
            <Button data-testid="ptool-form-save" onClick={saveTool} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">{saving ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Hapus Alat</DialogTitle>
            <DialogDescription><b>{delTarget?.tool_code} {delTarget?.name}</b> akan dihapus dari inventory. Lanjutkan?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} className="rounded-none">Batal</Button>
            <Button data-testid="ptool-delete-confirm" onClick={doDelete} className="rounded-none bg-red-600 hover:bg-red-700 text-white">Ya, Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {borrowTool && <BorrowDialog tool={borrowTool} options={borrowerOptions} onClose={(reload) => { setBorrowTool(null); if (reload) load(); }} />}
      {returnTool && <ReturnDialog tool={returnTool} onClose={(reload) => { setReturnTool(null); if (reload) load(); }} />}
      {missingTool && <MissingDialog tool={missingTool} onClose={(reload) => { setMissingTool(null); if (reload) load(); }} />}
      {historyTool && <HistoryDialog tool={historyTool} onClose={() => setHistoryTool(null)} />}
    </div>
  );
}

function BorrowDialog({ tool, options, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ borrower_name: "", purpose: "", so_no: "", borrow_date: today, est_return_date: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.borrower_name.trim()) return toast.error("Nama peminjam wajib diisi");
    setSaving(true);
    try {
      await api.post(`/production/tools/${tool.id}/borrow`, form);
      toast.success(`${tool.name} dipinjam oleh ${form.borrower_name}`);
      onClose(true);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal mencatat peminjaman"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="rounded-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandGrabbing size={18} weight="duotone" className="text-amber-600" /> Pinjam — {tool.tool_code} {tool.name}</DialogTitle>
          <DialogDescription>Catat siapa yang meminjam alat ini.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] font-semibold">Nama Peminjam *</Label>
            <Input data-testid="borrow-form-name" list="borrower-options" value={form.borrower_name} onChange={(e) => setForm((s) => ({ ...s, borrower_name: e.target.value }))} className={inputCls} placeholder="Pilih / ketik nama…" />
            <datalist id="borrower-options">{options.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
          <div><Label className="text-[11px] font-semibold">Keperluan</Label>
            <Input data-testid="borrow-form-purpose" value={form.purpose} onChange={(e) => setForm((s) => ({ ...s, purpose: e.target.value }))} className={inputCls} placeholder="Pengerjaan SO / maintenance…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px] font-semibold">Tgl Pinjam</Label>
              <Input type="date" value={form.borrow_date} onChange={(e) => setForm((s) => ({ ...s, borrow_date: e.target.value }))} className={inputCls} /></div>
            <div><Label className="text-[11px] font-semibold">Estimasi Kembali</Label>
              <Input data-testid="borrow-form-est" type="date" value={form.est_return_date} onChange={(e) => setForm((s) => ({ ...s, est_return_date: e.target.value }))} className={inputCls} /></div>
          </div>
          <div><Label className="text-[11px] font-semibold">No. SO (opsional)</Label>
            <Input value={form.so_no} onChange={(e) => setForm((s) => ({ ...s, so_no: e.target.value }))} className={inputCls} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} className="rounded-none">Batal</Button>
          <Button data-testid="borrow-form-save" onClick={submit} disabled={saving} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white">{saving ? "Menyimpan…" : "Catat Peminjaman"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ tool, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ return_date: today, condition: "baik", note: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/production/tools/${tool.id}/return`, form);
      toast.success(data.status === "maintenance" ? "Dikembalikan (rusak) → status Servis" : "Alat dikembalikan — tersedia lagi");
      onClose(true);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal mencatat pengembalian"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="rounded-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowUUpLeft size={18} weight="duotone" className="text-emerald-600" /> Kembalikan — {tool.tool_code} {tool.name}</DialogTitle>
          <DialogDescription>Dipinjam oleh <b>{tool.holder_name}</b> sejak {fmtD(tool.held_since)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px] font-semibold">Tgl Kembali</Label>
              <Input type="date" value={form.return_date} onChange={(e) => setForm((s) => ({ ...s, return_date: e.target.value }))} className={inputCls} /></div>
            <div><Label className="text-[11px] font-semibold">Kondisi</Label>
              <Select value={form.condition} onValueChange={(v) => setForm((s) => ({ ...s, condition: v }))}>
                <SelectTrigger data-testid="return-form-condition" className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="baik">Baik</SelectItem>
                  <SelectItem value="rusak">Rusak (masuk servis)</SelectItem>
                </SelectContent>
              </Select></div>
          </div>
          <div><Label className="text-[11px] font-semibold">Catatan</Label>
            <Input value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} className={inputCls} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} className="rounded-none">Batal</Button>
          <Button data-testid="return-form-save" onClick={submit} disabled={saving} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "Menyimpan…" : "Catat Pengembalian"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MissingDialog({ tool, onClose }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/production/tools/${tool.id}/missing`, { note });
      toast.success(`${tool.name} ditandai HILANG`);
      onClose(true);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal update status"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="rounded-none max-w-md border-red-300">
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2"><WarningCircle size={18} weight="fill" /> Tandai Hilang — {tool.tool_code} {tool.name}</DialogTitle>
          <DialogDescription>Pemegang terakhir: <b>{tool.holder_name || "-"}</b>. Alat akan berstatus HILANG sampai ditemukan.</DialogDescription>
        </DialogHeader>
        <div><Label className="text-[11px] font-semibold">Catatan / Kronologi</Label>
          <Input data-testid="missing-form-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Terakhir dipakai di area…" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} className="rounded-none">Batal</Button>
          <Button data-testid="missing-form-save" onClick={submit} disabled={saving} className="rounded-none bg-red-600 hover:bg-red-700 text-white">{saving ? "Menyimpan…" : "Ya, Tandai Hilang"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ tool, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/production/tools/${tool.id}/history`).then(({ data }) => setRows(data.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, [tool.id]);
  const LOAN_LABEL = { out: "Dipinjam", returned: "Kembali", missing: "Hilang" };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClockCounterClockwise size={18} weight="duotone" /> Riwayat — {tool.tool_code} {tool.name}</DialogTitle>
          <DialogDescription>Semua transaksi pinjam/kembali alat ini.</DialogDescription>
        </DialogHeader>
        {loading ? <div className="p-4 text-sm text-slate-400">Memuat…</div> : rows.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 border border-dashed border-slate-200 text-center">Belum pernah dipinjam.</div>
        ) : (
          <table className="w-full text-xs border border-slate-200">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{["Peminjam", "Keperluan", "Tgl Pinjam", "Est. Kembali", "Tgl Kembali", "Kondisi", "Status"].map((h) => (
                <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="p-2 font-semibold">{l.borrower_name}</td>
                  <td className="p-2">{[l.purpose, l.so_no && `SO ${l.so_no}`].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="p-2 tabular-nums">{fmtD(l.borrow_date)}</td>
                  <td className="p-2 tabular-nums">{fmtD(l.est_return_date)}</td>
                  <td className="p-2 tabular-nums">{fmtD(l.return_date)}</td>
                  <td className="p-2">{l.return_condition || "-"}</td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${l.status === "out" ? "bg-amber-50 text-amber-700 border-amber-300" : l.status === "missing" ? "bg-red-50 text-red-700 border-red-300" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                      {LOAN_LABEL[l.status] || l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
