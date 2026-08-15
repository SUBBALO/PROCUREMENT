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

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

  const antri = data.antri || [];
  const diterima = data.diterima || [];
  const proses = data.proses || [];
  const nothing = antri.length === 0 && diterima.length === 0 && proses.length === 0;

  if (loading) {
    return (
      <div className="border-2 border-slate-200 bg-white p-6 text-center text-slate-400" data-testid="myqueue-loading">
        <ArrowClockwise size={20} className="mx-auto animate-spin mb-1" /> Memuat antrian job...
      </div>
    );
  }

  if (compact && nothing) return null;

  const JobRow = ({ drf, mode }) => (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white border border-slate-200" data-testid={`myqueue-row-${drf.id}`}>
      <div className="flex-1 min-w-[220px]">
        <div className="font-mono font-bold text-slate-900 text-sm">{drf.form_no}</div>
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

  return (
    <div className="border-2 border-teal-500 bg-teal-50/40" data-testid="myqueue-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-teal-600 text-white">
        <div className="flex items-center gap-2">
          <Tray size={18} weight="fill" />
          <span className="text-sm font-bold uppercase tracking-[0.15em]">Antrian Job Saya</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="px-2 py-0.5 bg-amber-400/90 text-amber-950" data-testid="myqueue-antri-count">Antri: {antri.length}</span>
          <span className="px-2 py-0.5 bg-white/25" data-testid="myqueue-diterima-count">Diterima: {diterima.length}</span>
          <span className="px-2 py-0.5 bg-white/25" data-testid="myqueue-proses-count">Proses: {proses.length}</span>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {nothing && (
          <div className="text-center py-6 text-sm text-slate-500">
            <ClipboardText size={26} className="mx-auto mb-1 text-slate-300" />
            Belum ada job yang ditugaskan ke Anda.
          </div>
        )}

        <Section icon={Hourglass} color="text-amber-700" title="Antri — Perlu Diterima" list={antri} mode="antri"
          hint="Klik Terima untuk mengakui pekerjaan ini." />
        <Section icon={TrayArrowDown} color="text-sky-700" title="Diterima — Siap Dikerjakan" list={diterima} mode="diterima"
          hint="Klik Mulai Kerjakan saat mau menggambar (tanggal mulai tercatat)." />
        <Section icon={Gear} color="text-emerald-700" title="Proses — Sedang Dikerjakan" list={proses} mode="proses" />

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
    </div>
  );
}
