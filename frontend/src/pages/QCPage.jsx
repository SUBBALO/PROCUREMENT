import React, { useEffect, useMemo, useState, useCallback } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ClipboardText, MagnifyingGlass, X, FileText, CheckCircle, Warning, ArrowClockwise, FloppyDisk, Eye } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfPreviewModal from "../components/PdfPreviewModal";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const _today = () => new Date().toISOString().slice(0, 10);
const _firstOfMonth = () => _today().slice(0, 8) + "01";

const STATUS_BADGE = {
  pending: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", label: "PENDING" },
  inspected: { bg: "bg-sky-100", text: "text-sky-800", border: "border-sky-300", label: "INSPECTED" },
  verified: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", label: "VERIFIED" },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}

export default function QCPage() {
  const [stats, setStats] = useState({ pending: 0, inspected: 0, verified: 0, ng_items: 0 });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(_firstOfMonth());
  const [endDate, setEndDate] = useState(_today());
  const [openId, setOpenId] = useState(null);
  const pag = usePagination(items, 20);

  const loadStats = useCallback(async () => {
    try { const { data } = await api.get("/qc/stats"); setStats(data); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (query.trim()) params.q = query.trim();
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const { data } = await api.get("/qc/inspections", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat");
    } finally { setLoading(false); }
  }, [statusFilter, query, startDate, endDate]);

  useEffect(() => { load(); loadStats(); }, [load, loadStats]);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-violet-600 mb-1">
            <ClipboardText size={14} weight="fill" /> Quality Control
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Material Incoming Inspection
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Form <b>MKS-F-QAD-002 REV 03</b> · Auto-generated dari Store Incoming Goods (item <b>non-stok</b>).
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending Inspection" value={stats.pending} tone="amber" onClick={() => setStatusFilter("pending")} active={statusFilter === "pending"} testId="qc-stat-pending" />
        <StatCard label="Inspected" value={stats.inspected} tone="sky" onClick={() => setStatusFilter("inspected")} active={statusFilter === "inspected"} testId="qc-stat-inspected" />
        <StatCard label="Verified" value={stats.verified} tone="emerald" onClick={() => setStatusFilter("verified")} active={statusFilter === "verified"} testId="qc-stat-verified" />
        <StatCard label="NG Items (all)" value={stats.ng_items} tone="rose" onClick={() => {}} active={false} testId="qc-stat-ng" />
      </div>

      {/* Filter row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] max-w-md">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari <span className="text-slate-400 font-normal normal-case">(Nama Supplier/Customer · DO · PO)</span></Label>
          <Input data-testid="qc-search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="mis. DO-001 · PT ABC" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Status</Label>
          <select data-testid="qc-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} w-40 bg-white`}>
            <option value="">Semua</option>
            <option value="pending">Pending</option>
            <option value="inspected">Inspected</option>
            <option value="verified">Verified</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tanggal</Label>
          <Input data-testid="qc-start-date" type="date" className={`${inputCls} w-40`} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tanggal</Label>
          <Input data-testid="qc-end-date" type="date" className={`${inputCls} w-40`} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
        <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
        {(query || statusFilter !== "pending" || startDate !== _firstOfMonth() || endDate !== _today()) && (
          <Button variant="ghost" onClick={() => { setQuery(""); setStatusFilter("pending"); setStartDate(_firstOfMonth()); setEndDate(_today()); }} className="rounded-none h-9 text-xs" data-testid="qc-clear-filter">
            <X size={12} weight="bold" className="mr-1" /> Reset
          </Button>
        )}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Daftar Inspection — {items.length}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Tgl Terima</th>
                <th className="text-left p-3">Sumber</th>
                <th className="text-left p-3">Nama</th>
                <th className="text-left p-3">DO No</th>
                <th className="text-left p-3">PO No</th>
                <th className="text-right p-3">Items</th>
                <th className="text-right p-3">NG</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Inspector</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="qc-list">
              {loading && (<tr><td colSpan={10} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={10} className="p-8 text-center text-slate-400">Belum ada inspection.</td></tr>)}
              {items.length > 0 && pag.pagedData.map((it) => {
                const totalItems = (it.items || []).length;
                const ngCount = (it.items || []).filter((x) => x.result === "ng").length;
                return (
                  <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 text-xs text-slate-700 tabular-nums">{it.receive_date}</td>
                    <td className="p-3 text-xs uppercase font-bold text-slate-600">{it.source_type === "customer" ? "Customer" : "Supplier"}</td>
                    <td className="p-3 text-sm text-slate-900">{it.source_name}</td>
                    <td className="p-3 text-xs font-mono text-slate-700">{it.do_no || "-"}</td>
                    <td className="p-3 text-xs font-mono text-slate-700">{it.po_no || "-"}</td>
                    <td className="p-3 text-right tabular-nums text-sm">{totalItems}</td>
                    <td className="p-3 text-right tabular-nums text-sm">{ngCount > 0 ? <span className="text-rose-700 font-bold">{ngCount}</span> : <span className="text-slate-300">0</span>}</td>
                    <td className="p-3"><StatusBadge status={it.status} /></td>
                    <td className="p-3 text-xs text-slate-600">{it.inspector_name || <span className="text-slate-300">—</span>}</td>
                    <td className="p-3 text-center">
                      <button data-testid={`qc-open-${it.id}`} onClick={() => setOpenId(it.id)} className="text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-violet-700 hover:bg-violet-800 px-2 py-1 rounded-none">Buka</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="inspection" testIdPrefix="qc-pag" />
      </Card>

      {openId && <InspectionDialog inspectionId={openId} onClose={() => { setOpenId(null); load(); loadStats(); }} />}
    </div>
  );
}

function StatCard({ label, value, tone, onClick, active, testId }) {
  const toneCls = {
    amber: "border-amber-300 bg-amber-50 text-amber-800",
    sky: "border-sky-300 bg-sky-50 text-sky-800",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-800",
    rose: "border-rose-300 bg-rose-50 text-rose-800",
  }[tone] || "border-slate-300 bg-slate-50 text-slate-800";
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`p-4 border rounded-none text-left transition-all ${toneCls} ${active ? "ring-2 ring-offset-1 ring-violet-500" : "hover:brightness-95"}`}
    >
      <div className="text-[10px] uppercase tracking-[0.15em] font-bold opacity-70">{label}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>{value}</div>
    </button>
  );
}

function InspectionDialog({ inspectionId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [inspectionDate, setInspectionDate] = useState(_today());
  const [rows, setRows] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showMiiViewer, setShowMiiViewer] = useState(false);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/qc/inspections/${inspectionId}`);
      setDoc(data);
      setInspectionDate(data.inspection_date || _today());
      setRows((data.items || []).map((it) => ({
        receipt_item_id: it.receipt_item_id,
        no: it.no,
        so_no: it.so_no || "",
        description: it.description || "",
        qty: it.qty || 0,
        unit: it.unit || "",
        batch_grade_heat: it.batch_grade_heat || "",
        mill_cert_no: it.mill_cert_no || "",
        dimension_spec: it.dimension_spec || "",
        dimension_actual: it.dimension_actual || "",
        visual: it.visual || "",
        result: it.result || "",
        remark: it.remark || "",
      })));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat");
      onClose();
    } finally { setLoading(false); }
  }, [inspectionId, onClose]);

  useEffect(() => { load(); }, [load]);

  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const isReadonly = doc?.status === "verified";

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/qc/inspections/${inspectionId}/save`, {
        inspection_date: inspectionDate,
        items: rows.map((r) => ({
          receipt_item_id: r.receipt_item_id,
          description: r.description,
          batch_grade_heat: r.batch_grade_heat,
          mill_cert_no: r.mill_cert_no,
          dimension_spec: r.dimension_spec,
          dimension_actual: r.dimension_actual,
          visual: r.visual,
          result: r.result,
          remark: r.remark,
        })),
      });
      setDoc(data);
      toast.success(data.status === "inspected" ? "Inspection saved — status INSPECTED" : "Draft tersimpan");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  const verify = async () => {
    if (!window.confirm("Verify inspection ini? Setelah verify, form tidak bisa diedit tanpa re-open.")) return;
    setVerifying(true);
    try {
      const { data } = await api.post(`/qc/inspections/${inspectionId}/verify`);
      setDoc(data);
      toast.success("Inspection VERIFIED");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal verify");
    } finally { setVerifying(false); }
  };

  const reopen = async () => {
    if (!window.confirm("Re-open inspection? Status kembali ke pending untuk diedit.")) return;
    try {
      const { data } = await api.post(`/qc/inspections/${inspectionId}/reopen`);
      setDoc(data);
      toast.success("Re-opened");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reopen");
    }
  };

  const previewPdf = async () => {
    // Iter 40 — Preview image-based (tanpa new-tab / anti-IDM). Ada tombol Print & Download di viewer.
    setShowMiiViewer(true);
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/qc/inspections/${inspectionId}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MII_${(doc?.do_no || inspectionId).slice(0, 20)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Gagal download PDF");
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Material Incoming Inspection {doc && <StatusBadge status={doc.status} />}
          </DialogTitle>
          <DialogDescription>
            MKS-F-QAD-002 REV 03 · Form ISO fixed layout · isi kolom manual (Batch, Mill Cert, Dimension, Visual, Result).
          </DialogDescription>
        </DialogHeader>

        {loading && <div className="p-6 text-center text-slate-400">Memuat...</div>}
        {!loading && doc && (
          <div className="space-y-4">
            {/* Header info */}
            <Card className="rounded-none border-slate-200 p-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 block">Sumber</Label>
                  <div className="font-semibold">
                    <input type="checkbox" checked={doc.source_type === "supplier"} readOnly className="mr-1.5 accent-violet-600" />
                    Supplier
                    <input type="checkbox" checked={doc.source_type === "customer"} readOnly className="ml-4 mr-1.5 accent-violet-600" />
                    Supplied by Customer
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 block">{doc.source_type === "customer" ? "Customer Name" : "Supplier Name"}</Label>
                  <div className="font-mono text-sm text-slate-800">{doc.source_name || "-"}</div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 block">DO. No.</Label>
                  <div className="font-mono text-sm text-slate-800">{doc.do_no || "-"}</div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 block">Date</Label>
                  <Input data-testid="qc-inspection-date" type="date" className={inputCls} value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} disabled={isReadonly} />
                </div>
              </div>
            </Card>

            {/* Items table */}
            <Card className="rounded-none border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="qc-items-table">
                  <thead className="bg-slate-100 border-b-2 border-slate-300">
                    <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                      <th rowSpan={3} className="border border-slate-300 p-1 w-8">NO.</th>
                      <th rowSpan={3} className="border border-slate-300 p-1 w-20">SO. NO.</th>
                      <th rowSpan={3} className="border border-slate-300 p-1 w-36">BATCH No.#/GRADE MAT'L/Heat No.#</th>
                      <th rowSpan={3} className="border border-slate-300 p-1 w-32">MILL CERT/ EDS NO.</th>
                      <th rowSpan={3} className="border border-slate-300 p-1">DESCRIPTION OF PART</th>
                      <th rowSpan={3} className="border border-slate-300 p-1 w-16">QTY</th>
                      <th colSpan={3} className="border border-slate-300 p-1 bg-violet-50">IQC INSPECTION RESULT</th>
                      <th colSpan={2} className="border border-slate-300 p-1 bg-emerald-50">RESULT</th>
                      <th rowSpan={3} className="border border-slate-300 p-1 w-36">REMARK</th>
                    </tr>
                    <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                      <th colSpan={2} className="border border-slate-300 p-1 bg-violet-50">DIMENTION</th>
                      <th rowSpan={2} className="border border-slate-300 p-1 bg-violet-50 w-24">VISUAL</th>
                      <th rowSpan={2} className="border border-slate-300 p-1 bg-emerald-50 w-10">OK</th>
                      <th rowSpan={2} className="border border-slate-300 p-1 bg-emerald-50 w-10">NG</th>
                    </tr>
                    <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                      <th className="border border-slate-300 p-1 bg-violet-50 w-20">SPEC</th>
                      <th className="border border-slate-300 p-1 bg-violet-50 w-20">ACTUAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.receipt_item_id} className="border-b border-slate-200">
                        <td className="border border-slate-300 p-1 text-center tabular-nums">{r.no}</td>
                        <td className="border border-slate-300 p-1 text-center font-mono">{r.so_no || "-"}</td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.batch_grade_heat} onChange={(v) => setRow(i, "batch_grade_heat", v)} disabled={isReadonly} testId={`qc-batch-${i}`} /></td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.mill_cert_no} onChange={(v) => setRow(i, "mill_cert_no", v)} disabled={isReadonly} testId={`qc-mill-${i}`} /></td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.description} onChange={(v) => setRow(i, "description", v)} disabled={isReadonly} testId={`qc-desc-${i}`} /></td>
                        <td className="border border-slate-300 p-1 text-right tabular-nums">{r.qty} {r.unit}</td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.dimension_spec} onChange={(v) => setRow(i, "dimension_spec", v)} disabled={isReadonly} testId={`qc-spec-${i}`} /></td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.dimension_actual} onChange={(v) => setRow(i, "dimension_actual", v)} disabled={isReadonly} testId={`qc-actual-${i}`} /></td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.visual} onChange={(v) => setRow(i, "visual", v)} disabled={isReadonly} testId={`qc-visual-${i}`} /></td>
                        <td className="border border-slate-300 p-1 text-center">
                          <input type="radio" data-testid={`qc-ok-${i}`} disabled={isReadonly} name={`result-${i}`} checked={r.result === "ok"} onChange={() => setRow(i, "result", "ok")} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                        </td>
                        <td className="border border-slate-300 p-1 text-center">
                          <input type="radio" data-testid={`qc-ng-${i}`} disabled={isReadonly} name={`result-${i}`} checked={r.result === "ng"} onChange={() => setRow(i, "result", "ng")} className="w-4 h-4 accent-rose-600 cursor-pointer" />
                        </td>
                        <td className="border border-slate-300 p-0.5"><CellInput value={r.remark} onChange={(v) => setRow(i, "remark", v)} disabled={isReadonly} testId={`qc-remark-${i}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                <b>Note:</b> Visual = Check of Appearance (Dent, Damage, Scratch, Colour)
              </div>
            </Card>

            {/* Signatures */}
            {(doc.inspector_name || doc.leader_name) && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <Card className="rounded-none border-slate-200 p-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Inspected by</div>
                  <div className="font-semibold text-slate-800">{doc.inspector_name || "-"}</div>
                  {doc.inspected_at && <div className="text-[10px] text-slate-500 mt-1">{new Date(doc.inspected_at).toLocaleString("id-ID")}</div>}
                </Card>
                <Card className="rounded-none border-slate-200 p-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Verified by</div>
                  <div className="font-semibold text-slate-800">{doc.leader_name || "-"}</div>
                  {doc.verified_at && <div className="text-[10px] text-slate-500 mt-1">{new Date(doc.verified_at).toLocaleString("id-ID")}</div>}
                </Card>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
          {doc && doc.status !== "verified" && (
            <Button data-testid="qc-save-btn" onClick={save} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">
              <FloppyDisk size={13} weight="bold" className="mr-1.5" /> {saving ? "Menyimpan..." : "Save Inspection"}
            </Button>
          )}
          {doc && doc.status === "inspected" && (
            <Button data-testid="qc-verify-btn" onClick={verify} disabled={verifying} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white">
              <CheckCircle size={13} weight="bold" className="mr-1.5" /> {verifying ? "Verify..." : "Verify by Leader"}
            </Button>
          )}
          {doc && doc.status === "verified" && (
            <Button data-testid="qc-reopen-btn" onClick={reopen} variant="outline" className="rounded-none border-amber-400 text-amber-700 hover:bg-amber-50">
              <Warning size={13} weight="bold" className="mr-1.5" /> Re-open
            </Button>
          )}
          {doc && (
            <Button data-testid="qc-preview-btn" onClick={() => setShowPreview(true)} variant="outline" className="rounded-none">
              <Eye size={13} weight="bold" className="mr-1.5" /> Preview
            </Button>
          )}
          {doc && (
            <Button data-testid="qc-pdf-btn" onClick={downloadPdf} className="rounded-none bg-violet-700 hover:bg-violet-800 text-white">
              <FileText size={13} weight="bold" className="mr-1.5" /> Download MII PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      {showPreview && doc && <MIIPreviewDialog doc={{ ...doc, items: rows, inspection_date: inspectionDate }} onClose={() => setShowPreview(false)} onDownload={downloadPdf} onPreview={previewPdf} />}
      {showMiiViewer && (
        <PdfPreviewModal
          metaUrl={`/qc/inspections/${inspectionId}/page-meta`}
          pageUrlBuilder={(n) => `${apiUrl}/api/qc/inspections/${inspectionId}/page-image?page=${n}&scale=2`}
          title={`MII — ${doc?.do_no || inspectionId}`}
          subtitle={doc?.source_name || ""}
          downloadUrl={`${apiUrl}/api/qc/inspections/${inspectionId}/pdf`}
          onClose={() => setShowMiiViewer(false)}
        />
      )}
    </Dialog>
  );
}

function CellInput({ value, onChange, disabled, testId }) {
  return (
    <input
      type="text"
      data-testid={testId}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-1 py-0.5 text-xs border-0 bg-transparent focus:outline-none focus:bg-sky-50 disabled:text-slate-500 disabled:bg-slate-50"
    />
  );
}

// ============ MII PREVIEW DIALOG (WYSIWYG match PDF) ============
function MIIPreviewDialog({ doc, onClose, onDownload, onPreview }) {
  const dateStr = (() => {
    try { return new Date(doc.inspection_date || doc.receive_date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
    catch { return (doc.inspection_date || doc.receive_date || "").slice(0, 10); }
  })();
  const items = doc.items || [];
  // Enforce minimum 10 empty rows for form-like look (match PDF)
  const displayItems = [...items];
  while (displayItems.length < 10) displayItems.push(null);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-[95vw] max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-2 sticky top-0 bg-white z-10 border-b border-slate-200">
          <DialogTitle>Preview MII — {doc.do_no || doc.id?.slice(0, 8)}</DialogTitle>
          <DialogDescription>Preview WYSIWYG — sama persis dengan PDF hasil download (MKS-F-QAD-002 REV 03).</DialogDescription>
        </DialogHeader>

        {/* A4 landscape page container */}
        <div className="px-6 py-4 bg-slate-100">
          <div
            className="relative w-full mx-auto bg-white shadow-lg"
            style={{
              aspectRatio: "297 / 210",   // A4 landscape
              fontFamily: "Arial, Helvetica, sans-serif",
              color: "#0f172a",
              padding: "10mm",
            }}
            data-testid="mii-preview-page"
          >
            {/* Top: logo + company + title */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-2 mb-3">
              <img src="/letterhead.png" alt="MKS" style={{ width: "60mm", height: "18mm", objectFit: "contain", objectPosition: "left top" }} />
              <div className="flex-1 text-center">
                <div className="inline-block border border-slate-800 px-4 py-1 mb-1">
                  <div style={{ fontSize: "9px", fontWeight: 700 }}>PT. MITRA KARYA SARANA</div>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.05em" }}>MATERIAL INCOMING INSPECTION</div>
              </div>
              <div style={{ width: "60mm" }} />
            </div>

            {/* Header — Supplier / Customer / DO / Date */}
            <div className="mb-2" style={{ fontSize: "9px" }}>
              <div className="flex items-center gap-6 mb-1">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" readOnly checked={doc.source_type === "supplier"} className="w-3 h-3 accent-slate-800" />
                  <span>Supplier Name:</span>
                </label>
                <span className="flex-1 border-b border-slate-800 pb-0.5">{doc.source_type === "supplier" ? (doc.source_name || "") : ""}</span>
                <span>DO. No.:</span>
                <span className="w-48 border-b border-slate-800 pb-0.5">{doc.do_no || ""}</span>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" readOnly checked={doc.source_type === "customer"} className="w-3 h-3 accent-slate-800" />
                  <span>Supplied by Customer:</span>
                </label>
                <span className="flex-1 border-b border-slate-800 pb-0.5">{doc.source_type === "customer" ? (doc.source_name || "") : ""}</span>
                <span>Date:</span>
                <span className="w-48 border-b border-slate-800 pb-0.5">{dateStr}</span>
              </div>
            </div>

            {/* Items table */}
            <table className="w-full border-collapse" style={{ fontSize: "7.5px", lineHeight: "1.15" }}>
              <thead>
                <tr className="bg-slate-100" style={{ fontWeight: 700 }}>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "3%" }}>NO.</th>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "7%" }}>SO. NO.</th>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "11%" }}>BATCH No.#/GRADE MAT'L/Heat No.#</th>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "9%" }}>MILL CERT/ EDS NO.</th>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "18%" }}>DESCRIPTION OF PART</th>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "5%" }}>QTY</th>
                  <th colSpan={3} className="border border-slate-800 p-1">IQC INSPECTION RESULT</th>
                  <th colSpan={2} className="border border-slate-800 p-1">RESULT</th>
                  <th rowSpan={3} className="border border-slate-800 p-1" style={{ width: "13%" }}>REMARK</th>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <th colSpan={2} className="border border-slate-800 p-1">DIMENTION</th>
                  <th rowSpan={2} className="border border-slate-800 p-1" style={{ width: "9%" }}>VISUAL</th>
                  <th rowSpan={2} className="border border-slate-800 p-1" style={{ width: "4%" }}>OK</th>
                  <th rowSpan={2} className="border border-slate-800 p-1" style={{ width: "4%" }}>NG</th>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <th className="border border-slate-800 p-1" style={{ width: "7%" }}>SPEC</th>
                  <th className="border border-slate-800 p-1" style={{ width: "7%" }}>ACTUAL</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((r, i) => (
                  <tr key={i} style={{ height: "22px" }}>
                    <td className="border border-slate-800 p-0.5 text-center tabular-nums">{r ? (r.no || i + 1) : ""}</td>
                    <td className="border border-slate-800 p-0.5 text-center font-mono">{r ? (r.so_no || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.batch_grade_heat || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.mill_cert_no || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.description || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5 text-center tabular-nums">{r ? `${r.qty || ""} ${r.unit || ""}`.trim() : ""}</td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.dimension_spec || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.dimension_actual || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.visual || "") : ""}</td>
                    <td className="border border-slate-800 p-0.5 text-center">
                      {r && r.result === "ok" && <span style={{ fontWeight: 700 }}>✓</span>}
                    </td>
                    <td className="border border-slate-800 p-0.5 text-center">
                      {r && r.result === "ng" && <span style={{ fontWeight: 700 }}>✓</span>}
                    </td>
                    <td className="border border-slate-800 p-0.5">{r ? (r.remark || "") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Note */}
            <div className="mt-1" style={{ fontSize: "7.5px" }}>
              <b>Note :</b> Visual = Check of Appearance (Dent, Damage, Scratch, Colour)
            </div>

            {/* Signatures */}
            <div className="mt-6 grid grid-cols-2 gap-8" style={{ fontSize: "9px" }}>
              <div>
                <div className="mb-1">Inspected by,</div>
                <div style={{ height: "36px" }} />
                <div className="border-t border-slate-800 pt-1 font-bold">QC Inspector &nbsp; {doc.inspector_name || ""}</div>
              </div>
              <div>
                <div className="mb-1">Verified by,</div>
                <div style={{ height: "36px" }} />
                <div className="border-t border-slate-800 pt-1 font-bold">QC Leader &nbsp; {doc.leader_name || ""}</div>
              </div>
            </div>

            {/* Doc footer */}
            <div className="absolute" style={{ bottom: "3mm", left: "10mm", right: "10mm", fontSize: "6.5px", color: "#64748b", display: "flex", justifyContent: "space-between" }}>
              <span>MKS-F-QAD-002 REV 03</span>
              <span>MII#{(doc.id || "").slice(0, 8)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 pb-5 sticky bottom-0 bg-white border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
          {onPreview && (
            <Button data-testid="mii-preview-open" onClick={onPreview} className="rounded-none bg-slate-700 hover:bg-slate-800 text-white">
              <FileText size={13} weight="bold" className="mr-1.5" /> Preview di Tab Baru
            </Button>
          )}
          <Button data-testid="mii-preview-download" onClick={onDownload} className="rounded-none bg-violet-700 hover:bg-violet-800 text-white">
            <FileText size={13} weight="bold" className="mr-1.5" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
