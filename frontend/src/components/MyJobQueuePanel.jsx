import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import {
  ArrowClockwise, CheckCircle, ClipboardText, ArrowRight, PlayCircle, Hourglass, TrayArrowDown, Gear, Tray,
} from "@phosphor-icons/react";

/**
 * MyJobQueuePanel — Antrian job untuk engineer yang login (3 tahap).
 *  1. ANTRI    (accepted)    → ditugaskan Leader, belum diterima → tombol "Terima"
 *  2. DITERIMA (received)    → sudah diterima, belum digambar     → tombol "Mulai Kerjakan"
 *  3. PROSES   (in_progress) → sedang dikerjakan                  → "Buka Work Order"
 * Prop `compact` untuk tampilan ringkas di dashboard.
 */
export default function MyJobQueuePanel({ compact = false }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ antri: [], diterima: [], proses: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // drf.id sedang diproses
  // Riwayat pekerjaan selesai
  const [view, setView] = useState("aktif"); // aktif | riwayat
  const [hist, setHist] = useState(null);    // {drf, inquiries}
  const [histMonth, setHistMonth] = useState("");
  const [histLoading, setHistLoading] = useState(false);
  // Statistik pribadi mini (per bulan)
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async (month) => {
    try {
      const { data } = await api.get("/drawing-requests/my-stats", { params: month ? { month } : {} });
      setStats(data);
    } catch (e) { setStats(null); }
  }, []);
  useEffect(() => { loadStats(view === "riwayat" ? histMonth : ""); }, [view, histMonth, loadStats]);

  const loadHistory = useCallback(async (month) => {
    setHistLoading(true);
    try {
      const { data } = await api.get("/drawing-requests/my-history", { params: month ? { month } : {} });
      setHist(data);
    } catch (e) { setHist({ drf: [], inquiries: [] }); }
    finally { setHistLoading(false); }
  }, []);
  useEffect(() => { if (view === "riwayat") loadHistory(histMonth); }, [view, histMonth, loadHistory]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests/my-queue");
      setData(data);
    } catch (e) {
      // panel opsional — diamkan bila gagal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doTerima = async (drf) => {
    setBusy(drf.id);
    try {
      await api.post(`/drawing-requests/${drf.id}/accept-work`);
      toast.success(`Job ${drf.form_no} diterima`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menerima job");
    } finally { setBusy(null); }
  };

  const doMulai = async (drf) => {
    setBusy(drf.id);
    try {
      await api.post(`/drawing-requests/${drf.id}/start-work`);
      toast.success(`Mulai kerjakan ${drf.form_no}`);
      navigate(`/engineering/drf/${drf.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memulai job");
      setBusy(null);
    }
  };

  const doInqTerima = async (iq) => {
    setBusy(iq.id);
    try {
      await api.post(`/inquiries/${iq.id}/receive-job`);
      toast.success(`Inquiry ${iq.inquiry_no} diterima`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menerima inquiry");
    } finally { setBusy(null); }
  };

  const doInqKerjakan = async (iq) => {
    setBusy(iq.id);
    try {
      await api.post(`/inquiries/${iq.id}/start-job`);
      toast.success(`Mulai kerjakan ${iq.inquiry_no}`);
      navigate("/engineering/inquiries");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memulai inquiry");
      setBusy(null);
    }
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

  const antri = data.antri || [];
  const diterima = data.diterima || [];
  const proses = data.proses || [];
  const inqAntri = data.inquiry_antri || [];
  const inqDiterima = data.inquiry_diterima || [];
  const inqProses = data.inquiry_proses || [];
  const nothing = antri.length === 0 && diterima.length === 0 && proses.length === 0
    && inqAntri.length === 0 && inqDiterima.length === 0 && inqProses.length === 0;

  if (loading) {
    return (
      <div className="border-2 border-slate-200 bg-white p-6 text-center text-slate-400" data-testid="myqueue-loading">
        <ArrowClockwise size={20} className="mx-auto animate-spin mb-1" /> Memuat antrian job...
      </div>
    );
  }

  if (compact && nothing) return null;

  const JobRow = ({ drf, mode }) => (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 bg-white border ${drf.priority === "high" ? "border-rose-400 border-l-4" : "border-slate-200"}`} data-testid={`myqueue-row-${drf.id}`}>
      <div className="flex-1 min-w-[220px]">
        <div className="font-mono font-bold text-slate-900 text-sm flex items-center flex-wrap gap-1.5">
          {drf.form_no}
          {drf.priority === "high" && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-rose-600 text-white" data-testid={`myqueue-prio-high-${drf.id}`}>
              Prioritas Tinggi
            </span>
          )}
          {drf.priority === "low" && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600" data-testid={`myqueue-prio-low-${drf.id}`}>
              Low
            </span>
          )}
        </div>
        <div className="text-[12px] text-slate-600">
          SO <b className="font-mono">{drf.so_no || "-"}</b> · {drf.project_name || "-"} · {drf.customer_name || "-"}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Ditugaskan oleh {drf.assigned_by || "-"} · {fmt(drf.assigned_at)}
          {drf.work_received_at && <> · <span className="text-sky-600">Diterima: {fmt(drf.work_received_at)}</span></>}
          {drf.work_started_at && <> · <span className="text-emerald-600">Mulai: {fmt(drf.work_started_at)}</span></>}
        </div>
      </div>

      {mode === "antri" && (
        <button
          onClick={() => doTerima(drf)}
          disabled={busy === drf.id}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold uppercase tracking-wider disabled:opacity-60"
          data-testid={`myqueue-terima-${drf.id}`}
        >
          {busy === drf.id ? <ArrowClockwise size={14} className="animate-spin" /> : <CheckCircle size={15} weight="bold" />} Terima
        </button>
      )}

      {mode === "diterima" && (
        <button
          onClick={() => doMulai(drf)}
          disabled={busy === drf.id}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold uppercase tracking-wider disabled:opacity-60"
          data-testid={`myqueue-mulai-${drf.id}`}
        >
          {busy === drf.id ? <ArrowClockwise size={14} className="animate-spin" /> : <PlayCircle size={15} weight="bold" />} Mulai Kerjakan
        </button>
      )}

      {mode === "proses" && (
        <button
          onClick={() => navigate(`/engineering/drf/${drf.id}`)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-bold uppercase tracking-wider"
          data-testid={`myqueue-open-${drf.id}`}
        >
          Buka Work Order <ArrowRight size={14} weight="bold" />
        </button>
      )}
    </div>
  );

  const Section = ({ icon: Icon, color, title, list, mode, hint }) => (
    list.length > 0 ? (
      <div className="space-y-2">
        <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold ${color}`}>
          <Icon size={14} weight="fill" /> {title} ({list.length})
        </div>
        {hint && <div className="text-[11px] text-slate-400 -mt-1">{hint}</div>}
        {(compact ? list.slice(0, 3) : list).map((drf) => <JobRow key={drf.id} drf={drf} mode={mode} />)}
      </div>
    ) : null
  );

  const InqRow = ({ iq, mode }) => (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white border border-slate-200" data-testid={`myqueue-inq-row-${iq.id}`}>
      <div className="flex-1 min-w-[220px]">
        <div className="font-mono font-bold text-slate-900 text-sm">{iq.inquiry_no} <span className="text-[10px] font-bold text-rose-600 uppercase">· Inquiry</span></div>
        <div className="text-[12px] text-slate-600">{iq.title || "-"} · {iq.customer_name || "-"}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Ditugaskan: {fmt(iq.assigned_at)}
          {iq.accepted_at && <> · <span className="text-sky-600">Diterima: {fmt(iq.accepted_at)}</span></>}
          {iq.work_started_at && <> · <span className="text-emerald-600">Mulai: {fmt(iq.work_started_at)}</span></>}
        </div>
      </div>
      {mode === "belum_terima" && (
        <button onClick={() => doInqTerima(iq)} disabled={busy === iq.id}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold uppercase tracking-wider disabled:opacity-60"
          data-testid={`myqueue-inq-terima-${iq.id}`}>
          {busy === iq.id ? <ArrowClockwise size={14} className="animate-spin" /> : <CheckCircle size={15} weight="bold" />} Terima
        </button>
      )}
      {mode === "diterima" && (
        <button onClick={() => doInqKerjakan(iq)} disabled={busy === iq.id}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold uppercase tracking-wider disabled:opacity-60"
          data-testid={`myqueue-inq-kerjakan-${iq.id}`}>
          {busy === iq.id ? <ArrowClockwise size={14} className="animate-spin" /> : <PlayCircle size={15} weight="bold" />} Kerjakan
        </button>
      )}
      {mode === "proses" && (
        <button onClick={() => navigate("/engineering/inquiries")}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-bold uppercase tracking-wider"
          data-testid={`myqueue-inq-open-${iq.id}`}>
          Buka Inquiry <ArrowRight size={14} weight="bold" />
        </button>
      )}
    </div>
  );

  const InqSection = ({ icon: Icon, color, title, list, mode, hint }) => (
    list.length > 0 ? (
      <div className="space-y-2">
        <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold ${color}`}>
          <Icon size={14} weight="fill" /> {title} ({list.length})
        </div>
        {hint && <div className="text-[11px] text-slate-400 -mt-1">{hint}</div>}
        {(compact ? list.slice(0, 3) : list).map((iq) => <InqRow key={iq.id} iq={iq} mode={mode} />)}
      </div>
    ) : null
  );

  return (
    <div className="border-2 border-teal-500 bg-teal-50/40" data-testid="myqueue-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-teal-600 text-white">
        <div className="flex items-center gap-2">
          <Tray size={18} weight="fill" />
          <span className="text-sm font-bold uppercase tracking-[0.15em]">Tugas Saya</span>
          <div className="flex ml-2">
            <button onClick={() => setView("aktif")} data-testid="myqueue-view-aktif"
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-white/40 ${view === "aktif" ? "bg-white text-teal-700" : "bg-transparent text-white hover:bg-white/15"}`}>
              Aktif
            </button>
            <button onClick={() => setView("riwayat")} data-testid="myqueue-view-riwayat"
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-white/40 border-l-0 ${view === "riwayat" ? "bg-white text-teal-700" : "bg-transparent text-white hover:bg-white/15"}`}>
              Riwayat
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="px-2 py-0.5 bg-amber-400/90 text-amber-950" data-testid="myqueue-antri-count">Antri: {antri.length + inqAntri.length}</span>
          <span className="px-2 py-0.5 bg-white/25" data-testid="myqueue-diterima-count">Diterima: {diterima.length + inqDiterima.length}</span>
          <span className="px-2 py-0.5 bg-white/25" data-testid="myqueue-proses-count">Proses: {proses.length + inqProses.length}</span>
        </div>
      </div>

      {/* Statistik Pribadi Mini — performa bulan berjalan (atau bulan yang dipilih di Riwayat) */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-white border-b-2 border-teal-100 text-[11px] text-slate-600" data-testid="myqueue-stats">
          <span className="text-[9px] uppercase tracking-widest font-bold text-teal-700">Statistik Saya · {stats.month}</span>
          <span data-testid="myqueue-stats-done">Selesai: <b className="text-slate-900">{stats.completed_count}</b>
            {stats.completed_count > 0 && <span className="text-slate-400"> ({stats.drf_done} DRF · {stats.inquiry_done} Inquiry)</span>}
          </span>
          <span data-testid="myqueue-stats-lead">Rata-rata lead time: <b className="text-slate-900">{stats.avg_lead_days != null ? `${stats.avg_lead_days} hari` : "—"}</b></span>
          <span data-testid="myqueue-stats-ontime">On-time: <b className={stats.on_time_rate != null && stats.on_time_rate < 80 ? "text-rose-700" : "text-emerald-700"}>
            {stats.on_time_total ? `${stats.on_time_count}/${stats.on_time_total}` : "—"}
          </b>{stats.on_time_rate != null && <span className="text-slate-400"> ({stats.on_time_rate}%)</span>}</span>
        </div>
      )}

      {view === "riwayat" ? (
        <div className="p-3 space-y-3" data-testid="myqueue-history">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-slate-500">Pekerjaan yang sudah Anda selesaikan (Drawing Request & Inquiry).</div>
            <input type="month" value={histMonth} onChange={(e) => setHistMonth(e.target.value)}
              className="h-8 px-2 border border-slate-300 text-xs bg-white" data-testid="myqueue-history-month" />
          </div>
          {histLoading ? (
            <div className="text-center py-5 text-sm text-slate-400">Memuat…</div>
          ) : !hist || (hist.drf.length === 0 && hist.inquiries.length === 0) ? (
            <div className="text-center py-5 text-sm text-slate-400">
              Belum ada pekerjaan selesai{histMonth ? " pada bulan ini" : ""}.
            </div>
          ) : (
            <div className="space-y-3">
              {hist.drf.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 border-b border-slate-200 pb-1 mb-1">
                    Drawing Request Selesai ({hist.drf.length})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {hist.drf.map((d) => (
                        <tr key={d.id} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 font-mono text-[11px] font-semibold text-slate-800">
                            {d.form_no}
                            {d.request_type === "repeat_order" && <span className="ml-1 px-1 text-[9px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200">Repeat</span>}
                          </td>
                          <td className="py-1.5 pr-2 text-slate-600">SO {d.so_no || "-"} · {d.customer_name || "-"}</td>
                          <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">Selesai {(d.completed_at || "").slice(0, 10)}</td>
                          <td className="py-1.5 text-right text-slate-500 whitespace-nowrap">{d.lead_days != null ? `${d.lead_days} hari` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hist.inquiries.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 border-b border-slate-200 pb-1 mb-1">
                    Inquiry Selesai ({hist.inquiries.length})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {hist.inquiries.map((iq) => (
                        <tr key={iq.id} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 font-mono text-[11px] font-semibold text-slate-800">{iq.inquiry_no}</td>
                          <td className="py-1.5 pr-2 text-slate-600">{iq.customer_name || "-"} · {iq.title || iq.project_name || "-"}</td>
                          <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">Selesai {(iq.completed_at || "").slice(0, 10)}</td>
                          <td className="py-1.5 text-right text-slate-500 whitespace-nowrap">{iq.lead_days != null ? `${iq.lead_days} hari` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
      <div className="p-3 space-y-4">
        {nothing && (
          <div className="text-center py-6 text-sm text-slate-500">
            <ClipboardText size={26} className="mx-auto mb-1 text-slate-300" />
            Belum ada job yang ditugaskan ke Anda.
          </div>
        )}

        {(antri.length > 0 || diterima.length > 0 || proses.length > 0) && (
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 border-b border-slate-200 pb-1">Drawing Request / SO</div>
        )}
        <Section icon={Hourglass} color="text-amber-700" title="Antri — Perlu Diterima" list={antri} mode="antri"
          hint="Klik Terima untuk mengakui pekerjaan ini." />
        <Section icon={TrayArrowDown} color="text-sky-700" title="Diterima — Siap Dikerjakan" list={diterima} mode="diterima"
          hint="Klik Mulai Kerjakan saat mau menggambar (tanggal mulai tercatat)." />
        <Section icon={Gear} color="text-emerald-700" title="Proses — Sedang Dikerjakan" list={proses} mode="proses" />

        {(inqAntri.length > 0 || inqDiterima.length > 0 || inqProses.length > 0) && (
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 border-b border-slate-200 pb-1 pt-2">Inquiry Costing</div>
        )}
        <InqSection icon={Hourglass} color="text-amber-700" title="Antri — Perlu Diterima" list={inqAntri} mode="belum_terima"
          hint="Klik Terima untuk mengakui inquiry ini (masih antri)." />
        <InqSection icon={TrayArrowDown} color="text-sky-700" title="Diterima — Siap Dikerjakan" list={inqDiterima} mode="diterima"
          hint="Klik Kerjakan saat mulai mengerjakan (tanggal mulai tercatat)." />
        <InqSection icon={Gear} color="text-emerald-700" title="Proses — Sedang Dikerjakan" list={inqProses} mode="proses" />

        {compact && (antri.length > 3 || diterima.length > 3 || proses.length > 3) && (
          <button
            onClick={() => navigate("/engineering/my-queue")}
            className="w-full text-center text-[12px] font-bold text-teal-700 hover:text-teal-900 py-1"
            data-testid="myqueue-see-all"
          >
            Lihat semua antrian →
          </button>
        )}
      </div>
      )}
    </div>
  );
}
