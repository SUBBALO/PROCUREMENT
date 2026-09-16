import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import BackLink from "../components/BackLink";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Ruler, Plus, PencilSimple, Trash, MagnifyingGlass, UploadSimple, DownloadSimple,
  WarningCircle, CheckCircle, CalendarCheck, ClockCounterClockwise, Certificate,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const fmtD = (d) => {
  if (!d) return "-";
  try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

const EMPTY_TOOL = { tool_code: "", name: "", brand: "", model: "", serial_no: "", size_range: "", location: "", holder: "", status: "aktif", notes: "" };

function CalStatusBadge({ s }) {
  if (s.cal_status === "overdue") {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-300" data-testid="cal-badge-overdue"><WarningCircle size={11} weight="fill" /> Overdue {s.days_left != null ? `${Math.abs(s.days_left)}h` : ""}</span>;
  }
  if (s.cal_status === "due_soon") {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-300"><ClockCounterClockwise size={11} weight="fill" /> H-{s.days_left}</span>;
  }
  if (s.cal_status === "ok") {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle size={11} weight="fill" /> OK</span>;
  }
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-slate-50 text-slate-500 border border-slate-200">Belum Kalibrasi</span>;
}

export default function QcMeasuringToolsPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [toolDialog, setToolDialog] = useState(null); // {mode:'add'|'edit', data}
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [calTool, setCalTool] = useState(null); // tool utk dialog kalibrasi

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (statusFilter) params.status_filter = statusFilter;
      const { data } = await api.get("/qc/measuring-tools", { params });
      setItems(data.items || []);
      setSummary(data.summary || {});
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat alat ukur"); }
    finally { setLoading(false); }
  }, [q, statusFilter]);
  useEffect(() => { load(); }, [load]);

  const saveTool = async () => {
    const d = toolDialog.data;
    if (!d.name.trim()) return toast.error("Nama alat wajib diisi");
    setSaving(true);
    try {
      if (toolDialog.mode === "add") await api.post("/qc/measuring-tools", d);
      else await api.put(`/qc/measuring-tools/${d.id}`, d);
      toast.success(toolDialog.mode === "add" ? "Alat ukur ditambahkan" : "Alat ukur diperbarui");
      setToolDialog(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/qc/measuring-tools/${delTarget.id}`);
      toast.success("Alat ukur dihapus");
      setDelTarget(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); }
  };

  const chips = [
    { key: "", label: "Semua", n: summary.total || 0, cls: "text-slate-700" },
    { key: "ok", label: "OK", n: summary.ok || 0, cls: "text-emerald-700" },
    { key: "due_soon", label: "H-30", n: summary.due_soon || 0, cls: "text-amber-700" },
    { key: "overdue", label: "Overdue", n: summary.overdue || 0, cls: "text-red-700" },
    { key: "never", label: "Belum Kalibrasi", n: summary.never || 0, cls: "text-slate-500" },
  ];

  return (
    <div className="space-y-4" data-testid="measuring-tools-page">
      <BackLink />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 border border-violet-200 text-violet-700"><Ruler size={22} weight="duotone" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Kalibrasi Alat Ukur</h1>
            <p className="text-sm text-slate-500">Masterlist alat ukur produksi · sertifikat kalibrasi pihak ke-3 · reminder H-30 & overdue.</p>
          </div>
        </div>
        <Button data-testid="add-mtool-btn" onClick={() => setToolDialog({ mode: "add", data: { ...EMPTY_TOOL } })} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white h-9">
          <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Alat Ukur
        </Button>
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <button key={c.key} data-testid={`mtool-filter-${c.key || "all"}`} onClick={() => setStatusFilter(c.key)}
              className={`px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] font-semibold border transition-colors ${statusFilter === c.key ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 hover:bg-slate-50 " + c.cls}`}>
              {c.label} <span className="ml-1 tabular-nums">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="mtool-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama/kode/serial/lokasi…" className="h-8 rounded-none pl-8 w-64 text-sm" />
        </div>
      </div>

      {/* Table */}
      <Card className="rounded-none border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-400">Memuat…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Belum ada alat ukur. Klik <b>Tambah Alat Ukur</b> untuk mulai membuat masterlist.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Kode", "Nama Alat", "Merk / Model", "No. Seri", "Range", "Lokasi", "Penanggung Jawab", "Kalibrasi Terakhir", "Jatuh Tempo", "Status", "Aksi"].map((h) => (
                  <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`mtool-row-${t.tool_code}`}>
                  <td className="p-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">{t.tool_code}</td>
                  <td className="p-2 font-semibold text-slate-800">{t.name}</td>
                  <td className="p-2 text-slate-600">{[t.brand, t.model].filter(Boolean).join(" / ") || "-"}</td>
                  <td className="p-2 text-slate-600 font-mono text-[11px]">{t.serial_no || "-"}</td>
                  <td className="p-2 text-slate-600">{t.size_range || "-"}</td>
                  <td className="p-2 text-slate-600">{t.location || "-"}</td>
                  <td className="p-2 text-slate-600">{t.holder || "-"}</td>
                  <td className="p-2 text-slate-600 whitespace-nowrap">{fmtD(t.last_cal_date)}{t.last_cal_vendor ? <div className="text-[10px] text-slate-400">{t.last_cal_vendor}</div> : null}</td>
                  <td className="p-2 text-slate-700 whitespace-nowrap tabular-nums">{fmtD(t.due_date)}</td>
                  <td className="p-2"><CalStatusBadge s={t} /></td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      <Button data-testid={`mtool-cal-${t.tool_code}`} variant="outline" onClick={() => setCalTool(t)} className="rounded-none h-7 px-2 text-[11px] border-violet-300 text-violet-700 hover:bg-violet-50">
                        <Certificate size={12} weight="bold" className="mr-1" /> Kalibrasi
                      </Button>
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

      {/* Add/Edit tool dialog */}
      <Dialog open={!!toolDialog} onOpenChange={(o) => !o && setToolDialog(null)}>
        <DialogContent className="rounded-none max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{toolDialog?.mode === "add" ? "Tambah Alat Ukur" : "Edit Alat Ukur"}</DialogTitle>
            <DialogDescription>Masterlist alat ukur yang ada di produksi.</DialogDescription>
          </DialogHeader>
          {toolDialog && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[11px] font-semibold">Kode Alat (auto jika kosong)</Label>
                <Input data-testid="mtool-form-code" value={toolDialog.data.tool_code} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, tool_code: e.target.value } }))} className={inputCls} placeholder="AU-0001" /></div>
              <div><Label className="text-[11px] font-semibold">Nama Alat *</Label>
                <Input data-testid="mtool-form-name" value={toolDialog.data.name} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, name: e.target.value } }))} className={inputCls} placeholder="Caliper / Micrometer…" /></div>
              <div><Label className="text-[11px] font-semibold">Merk</Label>
                <Input value={toolDialog.data.brand} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, brand: e.target.value } }))} className={inputCls} /></div>
              <div><Label className="text-[11px] font-semibold">Model / Tipe</Label>
                <Input value={toolDialog.data.model} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, model: e.target.value } }))} className={inputCls} /></div>
              <div><Label className="text-[11px] font-semibold">No. Seri</Label>
                <Input data-testid="mtool-form-serial" value={toolDialog.data.serial_no} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, serial_no: e.target.value } }))} className={inputCls} /></div>
              <div><Label className="text-[11px] font-semibold">Range / Ukuran</Label>
                <Input value={toolDialog.data.size_range} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, size_range: e.target.value } }))} className={inputCls} placeholder="0-150 mm" /></div>
              <div><Label className="text-[11px] font-semibold">Lokasi</Label>
                <Input value={toolDialog.data.location} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, location: e.target.value } }))} className={inputCls} placeholder="Area Produksi / QC Room" /></div>
              <div><Label className="text-[11px] font-semibold">Penanggung Jawab</Label>
                <Input value={toolDialog.data.holder} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, holder: e.target.value } }))} className={inputCls} /></div>
              <div className="col-span-2"><Label className="text-[11px] font-semibold">Catatan</Label>
                <Textarea value={toolDialog.data.notes} onChange={(e) => setToolDialog((s) => ({ ...s, data: { ...s.data, notes: e.target.value } }))} className="rounded-none text-sm min-h-[60px]" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setToolDialog(null)} className="rounded-none">Batal</Button>
            <Button data-testid="mtool-form-save" onClick={saveTool} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">{saving ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Hapus Alat Ukur</DialogTitle>
            <DialogDescription>
              <b>{delTarget?.tool_code} {delTarget?.name}</b> beserta seluruh riwayat & sertifikat kalibrasinya akan dihapus. Lanjutkan?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} className="rounded-none">Batal</Button>
            <Button data-testid="mtool-delete-confirm" onClick={doDelete} className="rounded-none bg-red-600 hover:bg-red-700 text-white">Ya, Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calibration dialog */}
      {calTool && <CalibrationDialog tool={calTool} onClose={() => { setCalTool(null); load(); }} />}
    </div>
  );
}

function CalibrationDialog({ tool, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ vendor: "", cert_no: "", cal_date: today, due_date: "", result: "pass", notes: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get(`/qc/measuring-tools/${tool.id}/calibrations`); setRows(data.items || []); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, [tool.id]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.vendor.trim()) return toast.error("Vendor kalibrasi wajib diisi");
    if (!form.cal_date || !form.due_date) return toast.error("Tanggal kalibrasi & jatuh tempo wajib diisi");
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("file", file);
      await api.post(`/qc/measuring-tools/${tool.id}/calibrations`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Kalibrasi tersimpan");
      setForm({ vendor: "", cert_no: "", cal_date: today, due_date: "", result: "pass", notes: "" });
      setFile(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan kalibrasi"); }
    finally { setSaving(false); }
  };

  const openCert = async (c) => {
    try {
      const { data } = await api.get(`/qc/calibrations/cert/${c.cert_file_id}`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error("Gagal membuka sertifikat"); }
  };

  const removeCal = async (c) => {
    try { await api.delete(`/qc/calibrations/${c.id}`); toast.success("Riwayat kalibrasi dihapus"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Certificate size={18} weight="duotone" className="text-violet-600" /> Kalibrasi — {tool.tool_code} {tool.name}</DialogTitle>
          <DialogDescription>Input hasil kalibrasi pihak ke-3 + upload sertifikat (PDF/JPG). Status alat otomatis mengikuti jatuh tempo terbaru.</DialogDescription>
        </DialogHeader>

        {/* Form kalibrasi baru */}
        <div className="border border-slate-200 p-3 space-y-3 bg-slate-50/50">
          <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-500">Kalibrasi Baru</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px] font-semibold">Vendor Kalibrasi *</Label>
              <Input data-testid="cal-form-vendor" value={form.vendor} onChange={(e) => setForm((s) => ({ ...s, vendor: e.target.value }))} className={inputCls} placeholder="PT Kalibrasi XYZ" /></div>
            <div><Label className="text-[11px] font-semibold">No. Sertifikat</Label>
              <Input value={form.cert_no} onChange={(e) => setForm((s) => ({ ...s, cert_no: e.target.value }))} className={inputCls} /></div>
            <div><Label className="text-[11px] font-semibold">Tanggal Kalibrasi *</Label>
              <Input data-testid="cal-form-date" type="date" value={form.cal_date} onChange={(e) => setForm((s) => ({ ...s, cal_date: e.target.value }))} className={inputCls} /></div>
            <div><Label className="text-[11px] font-semibold">Jatuh Tempo Berikutnya *</Label>
              <Input data-testid="cal-form-due" type="date" value={form.due_date} onChange={(e) => setForm((s) => ({ ...s, due_date: e.target.value }))} className={inputCls} /></div>
            <div><Label className="text-[11px] font-semibold">Hasil</Label>
              <Select value={form.result} onValueChange={(v) => setForm((s) => ({ ...s, result: v }))}>
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="pass">Lulus (Pass)</SelectItem>
                  <SelectItem value="fail">Tidak Lulus (Fail)</SelectItem>
                </SelectContent>
              </Select></div>
            <div><Label className="text-[11px] font-semibold">File Sertifikat (PDF/JPG, max 10MB)</Label>
              <input data-testid="cal-form-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-2 file:h-9 file:px-3 file:border file:border-slate-300 file:bg-white file:text-xs file:font-semibold hover:file:bg-slate-50 border border-slate-300 h-9" /></div>
            <div className="col-span-2"><Label className="text-[11px] font-semibold">Catatan</Label>
              <Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} className={inputCls} /></div>
          </div>
          <Button data-testid="cal-form-save" onClick={submit} disabled={saving} className="rounded-none bg-violet-700 hover:bg-violet-800 text-white h-9">
            <UploadSimple size={14} weight="bold" className="mr-1.5" /> {saving ? "Menyimpan…" : "Simpan Kalibrasi"}
          </Button>
        </div>

        {/* Riwayat */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-500 mb-1.5">Riwayat Kalibrasi</div>
          {loading ? <div className="text-sm text-slate-400 p-3">Memuat…</div> : rows.length === 0 ? (
            <div className="text-sm text-slate-400 p-3 border border-dashed border-slate-200 text-center">Belum ada riwayat kalibrasi.</div>
          ) : (
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{["Tgl Kalibrasi", "Jatuh Tempo", "Vendor", "No. Sert", "Hasil", "Sertifikat", ""].map((h) => (
                  <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="p-2 tabular-nums">{fmtD(c.cal_date)}</td>
                    <td className="p-2 tabular-nums">{fmtD(c.due_date)}</td>
                    <td className="p-2">{c.vendor}</td>
                    <td className="p-2 font-mono text-[11px]">{c.cert_no || "-"}</td>
                    <td className="p-2">{c.result === "fail" ? <span className="text-red-600 font-bold">FAIL</span> : <span className="text-emerald-600 font-bold">PASS</span>}</td>
                    <td className="p-2">
                      {c.cert_file_id ? (
                        <button data-testid={`cal-cert-open-${c.id}`} onClick={() => openCert(c)} className="inline-flex items-center gap-1 text-sky-700 hover:underline font-semibold">
                          <DownloadSimple size={12} weight="bold" /> Lihat
                        </button>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="p-2 text-right">
                      <button onClick={() => removeCal(c)} className="text-red-500 hover:text-red-700"><Trash size={13} weight="bold" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
