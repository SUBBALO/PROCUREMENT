import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ClipboardText, CheckCircle, ArrowCounterClockwise, ArrowClockwise, Play, FilePdf, Cube, X, Eye, DownloadSimple } from "@phosphor-icons/react";

function fmtDate(s) {
  if (!s) return "-";
  try { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function ProductionNewSoPage() {
  const [items, setItems] = useState([]);
  const [scope, setScope] = useState("unack");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/production/new-so?scope=${scope}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat SO");
    } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const ack = async (so) => {
    setBusy(so.id);
    try {
      await api.post(`/production/new-so/${so.id}/ack`);
      toast.success(`SO ${so.so_no || ""} ditandai siap`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal acknowledge");
    } finally { setBusy(null); }
  };

  const unack = async (so) => {
    setBusy(so.id);
    try {
      await api.post(`/production/new-so/${so.id}/unack`);
      toast.success(`SO ${so.so_no || ""} dikembalikan ke daftar baru`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membatalkan");
    } finally { setBusy(null); }
  };

  const [startModal, setStartModal] = useState(null); // so yang mau dimulai
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const startWork = async () => {
    const so = startModal;
    setBusy(so.id);
    try {
      await api.post(`/production/new-so/${so.id}/start`, { start_date: startDate });
      toast.success(`SO ${so.so_no || ""} — Mulai Kerja ${startDate}`);
      setStartModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menandai mulai kerja");
    } finally { setBusy(null); }
  };
  const openStart = (so) => { setStartDate(new Date().toISOString().slice(0, 10)); setStartModal(so); };

  // ----- Preview Drawing/BOM -----
  const [attSo, setAttSo] = useState(null);       // SO yang dibuka pratinjaunya
  const [att, setAtt] = useState({ drawings: [], boms: [] });
  const [attLoading, setAttLoading] = useState(false);
  const [tab, setTab] = useState("drawing");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activeDwg, setActiveDwg] = useState(null);
  const [activeBom, setActiveBom] = useState(null);

  const openAtt = async (so) => {
    setAttSo(so); setAttLoading(true); setPdfUrl(""); setActiveDwg(null); setActiveBom(null);
    setTab(so.has_drawing ? "drawing" : "bom");
    try {
      const { data } = await api.get("/production/so-attachments", { params: { so_no: so.so_no } });
      setAtt({ drawings: data.drawings || [], boms: data.boms || [] });
      if ((data.boms || []).length > 0) setActiveBom(data.boms[0]);
      if ((data.drawings || []).length > 0 && data.drawings[0].has_file) loadPdf(data.drawings[0]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat lampiran");
    } finally { setAttLoading(false); }
  };
  const loadPdf = async (dwg) => {
    if (!dwg?.has_file) { toast.error("Drawing belum ada file PDF"); return; }
    setActiveDwg(dwg); setPdfLoading(true);
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(""); }
    try {
      const res = await api.get(`/drawings/${dwg.id}/preview`, { responseType: "blob" });
      setPdfUrl(URL.createObjectURL(res.data));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat PDF");
    } finally { setPdfLoading(false); }
  };
  const downloadDwg = async (dwg) => {
    try {
      const res = await api.get(`/drawings/${dwg.id}/download`, { responseType: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(res.data);
      a.download = `${dwg.drawing_no}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast.error("Gagal unduh"); }
  };
  const closeAtt = () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); setPdfUrl(""); setAttSo(null); };

  const unstartWork = async (so) => {
    setBusy(so.id);
    try {
      await api.post(`/production/new-so/${so.id}/unstart`);
      toast.success(`SO ${so.so_no || ""} — status Mulai Kerja dibatalkan`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membatalkan");
    } finally { setBusy(null); }
  };

  const fmtQty = (n) => {
    const v = Number(n || 0);
    return Number.isInteger(v) ? v.toLocaleString("id-ID") : v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  };

  const StatusPill = ({ ok, label }) => (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] border ${
      ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-50 text-slate-400"
    }`}>{label}{ok ? " ✓" : " –"}</span>
  );

  return (
    <div className="space-y-3">
      <BackLink />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <ClipboardText size={20} weight="duotone" className="text-emerald-600" /> SO Masuk (Baru)
          </h1>
          <p className="text-slate-500">
            Sales Order yang baru dibuat. Produksi bisa lihat lebih awal (walau drawing belum di-stamp), pantau kesiapan drawing/BOM, tandai <b>siap</b>, lalu <b>Mulai Kerja</b> saat pengerjaan dimulai.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-slate-300 rounded-none overflow-hidden">
            <button
              data-testid="scope-unack"
              onClick={() => setScope("unack")}
              className={`px-3 h-8 text-[11px] uppercase tracking-[0.08em] font-bold ${scope === "unack" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >Baru</button>
            <button
              data-testid="scope-all"
              onClick={() => setScope("all")}
              className={`px-3 h-8 text-[11px] uppercase tracking-[0.08em] font-bold border-l border-slate-300 ${scope === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >Semua</button>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-none h-8 text-xs" data-testid="refresh-btn">
            <ArrowClockwise size={13} weight="bold" className="mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none bg-white">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200">
          <h3 className="uppercase tracking-[0.15em] font-bold text-slate-500">Daftar Sales Order</h3>
          <span className="text-slate-500" data-testid="so-count">Total: <b>{items.length}</b></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="new-so-table">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-600 text-left">
                <th className="px-2 py-1 w-28">No. SO</th>
                <th className="px-2 py-1 w-24">Tanggal</th>
                <th className="px-2 py-1 min-w-[180px]">Customer</th>
                <th className="px-2 py-1 min-w-[220px]">Deskripsi</th>
                <th className="px-2 py-1 w-24 text-right">Qty Total</th>
                <th className="px-2 py-1 w-24 text-center">Drawing</th>
                <th className="px-2 py-1 w-24 text-center">BOM</th>
                <th className="px-2 py-1 w-32">Status</th>
                <th className="px-2 py-1 w-40 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400" data-testid="empty-state">
                  {scope === "unack" ? "Tidak ada SO baru. Semua sudah disiapkan 🎉" : "Belum ada SO."}
                </td></tr>
              )}
              {!loading && items.map((so) => (
                <tr key={so.id} className="border-b border-slate-100 hover:bg-emerald-50/40" data-testid={`so-row-${so.so_no}`}>
                  <td className="px-2 py-1 font-mono font-bold text-slate-900">{so.so_no || "-"}</td>
                  <td className="px-2 py-1 text-slate-600 whitespace-nowrap">{fmtDate(so.so_date || so.created_at)}</td>
                  <td className="px-2 py-1 text-slate-800">{so.customer || "-"}</td>
                  <td className="px-2 py-1 text-slate-600">
                    {(so.items && so.items.length > 0) ? (
                      <div className="space-y-0.5">
                        {so.items.map((it, ix) => (
                          <div key={ix} className="flex items-center gap-1" data-testid={`so-item-${so.so_no}-${ix}`}>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-700">{it.name || "-"}</span>
                            <span className="text-[10px] font-bold text-slate-500">({fmtQty(it.qty)} {it.unit})</span>
                          </div>
                        ))}
                      </div>
                    ) : (so.description || "-")}
                  </td>
                  <td className="px-2 py-1 text-right font-bold text-slate-900 tabular-nums" data-testid={`qty-total-${so.so_no}`}>{fmtQty(so.qty_total)}</td>
                  <td className="px-2 py-1 text-center">
                    {so.has_drawing ? (
                      <button onClick={() => { setTab("drawing"); openAtt(so); }} data-testid={`preview-dwg-${so.so_no}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors" title="Pratinjau Drawing"><Eye size={11} weight="bold" /> DWG</button>
                    ) : <StatusPill ok={false} label="DWG" />}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {so.has_bom ? (
                      <button onClick={() => { setTab("bom"); openAtt(so); }} data-testid={`preview-bom-${so.so_no}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors" title="Pratinjau BOM"><Eye size={11} weight="bold" /> BOM</button>
                    ) : <StatusPill ok={false} label="BOM" />}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex flex-col gap-0.5">
                      {so.prod_started ? (
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-blue-700" title={`Mulai kerja oleh ${so.prod_started_by} · ${fmtDate(so.prod_started_at)}`}>▶ Dikerjakan</span>
                      ) : so.prod_ack ? (
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-700" title={`oleh ${so.prod_ack_by} · ${fmtDate(so.prod_ack_at)}`}>Siap ✓</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-600">Baru</span>
                      )}
                      {so.released > 0 && (
                        <span className={`text-[10px] font-bold ${so.balance <= 0 ? "text-emerald-700" : "text-slate-500"}`} data-testid={`progress-${so.so_no}`}>
                          {so.balance <= 0 ? "Selesai " : "Siap "}{fmtQty(so.released)}/{fmtQty(so.qty_total)} pcs
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {!so.prod_ack && !so.prod_started && (
                        <Button size="sm" disabled={busy === so.id} onClick={() => ack(so)} className="rounded-none h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`ack-${so.so_no}`}>
                          <CheckCircle size={12} weight="bold" className="mr-1" /> Tandai Siap
                        </Button>
                      )}
                      {so.prod_ack && !so.prod_started && (
                        <Button variant="outline" size="sm" disabled={busy === so.id} onClick={() => unack(so)} className="rounded-none h-7 text-[10px]" data-testid={`unack-${so.so_no}`}>
                          <ArrowCounterClockwise size={12} weight="bold" className="mr-1" /> Batal
                        </Button>
                      )}
                      {!so.prod_started ? (
                        <Button size="sm" disabled={busy === so.id} onClick={() => openStart(so)} className="rounded-none h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white" data-testid={`start-${so.so_no}`}>
                          <Play size={12} weight="fill" className="mr-1" /> Mulai Kerja
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={busy === so.id} onClick={() => unstartWork(so)} className="rounded-none h-7 text-[10px]" data-testid={`unstart-${so.so_no}`}>
                          <ArrowCounterClockwise size={12} weight="bold" className="mr-1" /> Batal Mulai
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {startModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="start-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Mulai Kerja · SO {startModal.so_no}</h2>
              <button onClick={() => setStartModal(null)} data-testid="start-modal-close" className="p-1 rounded text-slate-400 hover:bg-slate-100"><ArrowCounterClockwise size={16} weight="bold" /></button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs text-slate-500">{startModal.customer}</p>
              <label className="text-xs font-bold text-slate-600">Tanggal Mulai Kerja</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="start-date-input"
                className="w-full h-9 px-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <p className="text-[11px] text-slate-400">Pastikan tanggal benar — ini jadi Date Received di Job Progress.</p>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setStartModal(null)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Batal</button>
              <Button onClick={startWork} disabled={busy === startModal.id} data-testid="start-confirm-btn" className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded">
                <Play size={14} weight="fill" className="mr-1" /> OK, Mulai
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Preview Drawing / BOM ===== */}
      {attSo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="att-preview-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><FilePdf size={18} weight="duotone" className="text-emerald-600" /> Lampiran SO {attSo.so_no}</h2>
                <p className="text-[11px] text-slate-500">{attSo.customer}</p>
              </div>
              <div className="flex items-center gap-1">
                <div className="inline-flex border border-slate-300 rounded overflow-hidden mr-2">
                  <button onClick={() => setTab("drawing")} data-testid="att-tab-drawing" className={`px-3 h-8 text-[11px] uppercase tracking-[0.08em] font-bold ${tab === "drawing" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Drawing ({att.drawings.length})</button>
                  <button onClick={() => setTab("bom")} data-testid="att-tab-bom" className={`px-3 h-8 text-[11px] uppercase tracking-[0.08em] font-bold border-l border-slate-300 ${tab === "bom" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>BOM ({att.boms.length})</button>
                </div>
                <button onClick={closeAtt} data-testid="att-preview-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} weight="bold" /></button>
              </div>
            </div>

            {attLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">Memuat lampiran…</div>
            ) : tab === "drawing" ? (
              <div className="flex-1 flex overflow-hidden">
                {/* Drawing list */}
                <div className="w-64 border-r border-slate-200 overflow-y-auto shrink-0 bg-slate-50">
                  {att.drawings.length === 0 ? (
                    <div className="p-4 text-xs text-slate-400" data-testid="att-dwg-empty">Belum ada drawing untuk SO ini.</div>
                  ) : att.drawings.map((d) => (
                    <button key={d.id} onClick={() => loadPdf(d)} data-testid={`att-dwg-${d.drawing_no}`}
                      className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-white transition-colors ${activeDwg?.id === d.id ? "bg-white border-l-2 border-l-emerald-500" : ""}`}>
                      <div className="font-mono font-bold text-[11px] text-slate-800">{d.drawing_no}{d.revision ? ` · Rev ${d.revision}` : ""}</div>
                      <div className="text-[10px] text-slate-500 truncate">{d.title || "—"}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] uppercase font-bold text-slate-400">{d.discipline || ""}</span>
                        {!d.has_file && <span className="text-[9px] font-bold text-amber-600">(belum ada PDF)</span>}
                      </div>
                    </button>
                  ))}
                </div>
                {/* PDF viewer */}
                <div className="flex-1 flex flex-col bg-slate-100">
                  {activeDwg && (
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white shrink-0">
                      <span className="text-xs font-bold text-slate-700 font-mono">{activeDwg.drawing_no}</span>
                      {activeDwg.has_file && <Button size="sm" variant="outline" onClick={() => downloadDwg(activeDwg)} data-testid="att-dwg-download" className="rounded-none h-7 text-[10px]"><DownloadSimple size={12} weight="bold" className="mr-1" /> Unduh</Button>}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    {pdfLoading ? (
                      <div className="h-full flex items-center justify-center text-slate-400">Memuat PDF…</div>
                    ) : pdfUrl ? (
                      <iframe title="drawing-pdf" src={pdfUrl} className="w-full h-full border-0" data-testid="att-pdf-frame" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm">Pilih drawing di kiri untuk pratinjau.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* BOM list */}
                <div className="w-56 border-r border-slate-200 overflow-y-auto shrink-0 bg-slate-50">
                  {att.boms.length === 0 ? (
                    <div className="p-4 text-xs text-slate-400" data-testid="att-bom-empty">Belum ada BOM untuk SO ini.</div>
                  ) : att.boms.map((b) => (
                    <button key={b.id} onClick={() => setActiveBom(b)} data-testid={`att-bom-${b.bom_no}`}
                      className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-white transition-colors ${activeBom?.id === b.id ? "bg-white border-l-2 border-l-emerald-500" : ""}`}>
                      <div className="font-mono font-bold text-[11px] text-slate-800">{b.bom_no}</div>
                      <div className="text-[10px] text-slate-500">Part {b.part_no} · {b.items_count} item</div>
                    </button>
                  ))}
                </div>
                {/* BOM items */}
                <div className="flex-1 overflow-auto bg-white">
                  {activeBom ? (
                    <table className="w-full border-collapse text-xs" data-testid="att-bom-table">
                      <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                        <tr className="text-[10px] uppercase tracking-[0.06em] font-bold text-slate-600 text-left">
                          <th className="px-2 py-1.5 w-10">No</th>
                          <th className="px-2 py-1.5 min-w-[180px]">Nama Item</th>
                          <th className="px-2 py-1.5 min-w-[140px]">Spesifikasi</th>
                          <th className="px-2 py-1.5 w-16 text-right">Qty</th>
                          <th className="px-2 py-1.5 w-14">Satuan</th>
                          <th className="px-2 py-1.5 min-w-[120px]">Material</th>
                          <th className="px-2 py-1.5 w-16 text-right">Berat (kg)</th>
                          <th className="px-2 py-1.5 min-w-[120px]">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeBom.items.length === 0 ? (
                          <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">BOM tanpa item.</td></tr>
                        ) : activeBom.items.map((it, ix) => (
                          <tr key={ix} className="border-b border-slate-100 hover:bg-emerald-50/40">
                            <td className="px-2 py-1 text-slate-500">{it.item_no}</td>
                            <td className="px-2 py-1 font-semibold text-slate-800">{it.item_name || "—"}</td>
                            <td className="px-2 py-1 text-slate-600">{it.item_specification || "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums font-bold">{fmtQty(it.qty)}</td>
                            <td className="px-2 py-1 text-slate-600">{it.uom || "—"}</td>
                            <td className="px-2 py-1 text-slate-600">{it.material || "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-slate-600">{it.weight_kg ?? "—"}</td>
                            <td className="px-2 py-1 text-slate-500">{it.remark || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">Pilih BOM di kiri.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
