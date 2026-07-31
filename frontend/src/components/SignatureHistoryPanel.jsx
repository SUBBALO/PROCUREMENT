import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Card } from "./ui/card";
import { PenNib, ArrowClockwise, Eye, Printer, CheckCircle } from "@phosphor-icons/react";
import PdfPreviewModal from "./PdfPreviewModal";

const STAGE_LABEL = {
  submit: { text: "Prepared By", cls: "bg-sky-100 text-sky-800 border-sky-500" },
  eng_head: { text: "Eng Head Review", cls: "bg-amber-100 text-amber-800 border-amber-500" },
  qc: { text: "QC Inspection", cls: "bg-orange-100 text-orange-800 border-orange-500" },
  sales: { text: "Sales Approval", cls: "bg-yellow-100 text-yellow-800 border-yellow-600" },
  dc_stamp: { text: "DC Stamp", cls: "bg-indigo-100 text-indigo-800 border-indigo-500" },
  so_stamp: { text: "SO Stamp", cls: "bg-violet-100 text-violet-800 border-violet-500" },
  reject_eng_head: { text: "Rejected - Eng Head", cls: "bg-rose-100 text-rose-800 border-rose-500" },
  reject_qc: { text: "Rejected - QC", cls: "bg-rose-100 text-rose-800 border-rose-500" },
  reject_sales: { text: "Rejected - Sales", cls: "bg-rose-100 text-rose-800 border-rose-500" },
};

const STATUS_LABEL = {
  draft: "Draft",
  pending_eng_head: "Menunggu Eng Head",
  pending_qc: "Menunggu QC",
  pending_sales: "Menunggu Sales",
  approved: "Approved",
  controlled: "Controlled",
  released: "Released",
};

/**
 * SignatureHistoryPanel — tabel bukti audit TTD digital (dipakai di halaman Riwayat TTD
 * & sebagai tab di halaman Review & TTD Drawing). Preview PDF pakai PdfPreviewModal
 * (image-based, baca-saja, tanpa buka tab baru / tanpa download).
 */
export default function SignatureHistoryPanel({ user, showPrint = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawings/my-signature-history");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat riwayat TTD");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (iso) => {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleString("id-ID", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    } catch { return iso.slice(0, 19).replace("T", " "); }
  };

  const filtered = items.filter((h) => {
    if (stageFilter && h.stage !== stageFilter) return false;
    if (q) {
      const s = q.toLowerCase();
      return [h.drawing_no, h.project_name, h.customer_name, h.so_no].some((v) => (v || "").toLowerCase().includes(s));
    }
    return true;
  });

  const stats = items.reduce((acc, h) => { acc.total = (acc.total || 0) + 1; acc[h.stage] = (acc[h.stage] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">
          Bukti audit ISO 9001 — semua drawing yang pernah <b>{user?.name}</b> tanda tangan digital.
          Klik <b>Preview</b> untuk lihat drawing lengkap dengan TTD Anda (baca-saja).
        </p>
        {showPrint && (
          <button onClick={() => window.print()} className="shrink-0 px-3 py-2 text-xs font-bold uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5" data-testid="sig-history-print">
            <Printer size={14} weight="bold" /> Cetak Laporan
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total TTD" value={stats.total || 0} accent="indigo" />
        {stats.submit ? <Stat label="Sebagai Prepared By" value={stats.submit} accent="sky" /> : null}
        {stats.eng_head ? <Stat label="Sebagai Eng Head" value={stats.eng_head} accent="amber" /> : null}
        {stats.qc ? <Stat label="Sebagai QC" value={stats.qc} accent="orange" /> : null}
        {stats.sales ? <Stat label="Sebagai Sales" value={stats.sales} accent="yellow" /> : null}
        {stats.dc_stamp ? <Stat label="DC Stamp" value={stats.dc_stamp} accent="indigo" /> : null}
        {stats.so_stamp ? <Stat label="SO Stamp" value={stats.so_stamp} accent="violet" /> : null}
      </div>

      <Card className="rounded-none border-slate-200 p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari drawing no / project / SO / customer..." className="w-full border border-slate-300 px-3 py-2 text-sm rounded-none focus:outline-none focus:border-slate-500" data-testid="sig-history-search" />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="border border-slate-300 px-3 py-2 text-sm rounded-none focus:outline-none focus:border-slate-500" data-testid="sig-history-stage-filter">
          <option value="">Semua Peran TTD</option>
          <option value="submit">Prepared By</option>
          <option value="eng_head">Eng Head Review</option>
          <option value="qc">QC Inspection</option>
          <option value="sales">Sales Approval</option>
          <option value="dc_stamp">DC Stamp</option>
          <option value="so_stamp">SO Stamp</option>
        </select>
        <button onClick={load} className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" data-testid="sig-history-refresh">
          <ArrowClockwise size={12} weight="bold" /> Refresh
        </button>
      </Card>

      <Card className="rounded-none border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
            <tr>
              <th className="p-3 text-left">Tanggal TTD</th>
              <th className="p-3 text-left">Drawing No</th>
              <th className="p-3 text-left">Project / Customer</th>
              <th className="p-3 text-left">SO</th>
              <th className="p-3 text-center">Peran TTD</th>
              <th className="p-3 text-center">Status Drawing</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={7} className="p-6 text-center text-slate-400"><ArrowClockwise size={20} className="mx-auto animate-spin" /> Memuat...</td></tr>)}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                <PenNib size={28} className="mx-auto mb-2 opacity-40" />
                Belum ada riwayat TTD. Setelah Anda TTD drawing pertama, akan tampil di sini sebagai bukti audit.
              </td></tr>
            )}
            {!loading && filtered.map((h, i) => {
              const stage = STAGE_LABEL[h.stage] || { text: h.stage, cls: "bg-slate-100 text-slate-700 border-slate-400" };
              return (
                <tr key={`${h.drawing_id}-${h.stage}-${i}`} className="border-b border-slate-100 hover:bg-indigo-50/40" data-testid={`sig-row-${i}`}>
                  <td className="p-3 text-xs font-mono text-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5"><CheckCircle size={14} weight="fill" className="text-emerald-600" />{fmtDate(h.signed_at)}</div>
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-900">{h.drawing_no || "-"}</td>
                  <td className="p-3 text-xs"><div className="text-slate-800">{h.project_name || "-"}</div><div className="text-slate-500">{h.customer_name || ""}</div></td>
                  <td className="p-3 font-mono text-xs text-slate-700">{h.so_no || "-"}</td>
                  <td className="p-3 text-center"><span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${stage.cls}`}>{stage.text}</span></td>
                  <td className="p-3 text-center text-xs text-slate-600">{STATUS_LABEL[h.drawing_status_now] || h.drawing_status_now || "-"}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {h.has_pdf && (
                        <button onClick={() => setPreview(h)} className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5" data-testid={`sig-preview-${i}`} title="Preview drawing lengkap dengan TTD Anda (baca-saja)">
                          <Eye size={11} weight="bold" /> Preview
                        </button>
                      )}
                      <a href={`/engineering/work-order/${h.drawing_id}`} className="inline-flex items-center px-2 py-1 border border-slate-300 hover:bg-slate-100 text-slate-800 text-[10px] font-bold uppercase gap-0.5">Detail</a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="text-[10px] text-slate-400 text-center pt-2">
        Total {filtered.length} dari {items.length} riwayat TTD · Ditandatangani secara digital & tersimpan permanen · Untuk audit ISO 9001
      </div>

      {preview && (
        <PdfPreviewModal
          drawingId={preview.drawing_id}
          target="mks"
          stamped
          title={preview.drawing_no}
          subtitle={`${preview.project_name || ""}${preview.customer_name ? " · " + preview.customer_name : ""}`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent = "slate" }) {
  const colors = {
    indigo: "bg-indigo-50 border-indigo-500 text-indigo-800",
    sky: "bg-sky-50 border-sky-500 text-sky-800",
    amber: "bg-amber-50 border-amber-500 text-amber-800",
    orange: "bg-orange-50 border-orange-500 text-orange-800",
    yellow: "bg-yellow-50 border-yellow-500 text-yellow-800",
    violet: "bg-violet-50 border-violet-500 text-violet-800",
    slate: "bg-slate-50 border-slate-500 text-slate-800",
  };
  return (
    <div className={`border-l-4 p-3 ${colors[accent] || colors.slate}`}>
      <div className="text-[10px] uppercase tracking-widest font-bold opacity-70">{label}</div>
      <div className="text-3xl font-bold" style={{ fontFamily: "Chivo, sans-serif" }}>{value}</div>
    </div>
  );
}
