import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import {
  ArrowClockwise, CheckCircle, ClipboardText, ArrowRight, Clock, Hourglass, Tray,
} from "@phosphor-icons/react";

/**
 * MyJobQueuePanel — Antrian job untuk eng staff yang login.
 * - pending: DRF di-assign Riski tapi belum diterima → tombol TERIMA (set start kerja)
 * - in_progress: sudah diterima → tombol Buka Work Order
 * Prop `compact` untuk tampilan ringkas di dashboard.
 */
export default function MyJobQueuePanel({ compact = false }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ pending: [], in_progress: [], pending_count: 0, in_progress_count: 0 });
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);

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

  const acceptJob = async (drf) => {
    setAccepting(drf.id);
    try {
      await api.post(`/drawing-requests/${drf.id}/start-work`);
      toast.success(`Job ${drf.form_no} diterima — mulai kerja tercatat`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menerima job");
    } finally {
      setAccepting(null);
    }
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

  const pending = data.pending || [];
  const working = data.in_progress || [];
  const nothing = pending.length === 0 && working.length === 0;

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
          {mode === "working" && drf.work_started_at && <> · <span className="text-emerald-600">Mulai kerja: {fmt(drf.work_started_at)}</span></>}
        </div>
      </div>
      {mode === "pending" ? (
        <button
          onClick={() => acceptJob(drf)}
          disabled={accepting === drf.id}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold uppercase tracking-wider disabled:opacity-60"
          data-testid={`myqueue-accept-${drf.id}`}
        >
          {accepting === drf.id
            ? <><ArrowClockwise size={14} className="animate-spin" /> ...</>
            : <><CheckCircle size={15} weight="bold" /> Terima</>}
        </button>
      ) : (
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

  return (
    <div className="border-2 border-teal-500 bg-teal-50/40" data-testid="myqueue-panel">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-teal-600 text-white">
        <div className="flex items-center gap-2">
          <Tray size={18} weight="fill" />
          <span className="text-sm font-bold uppercase tracking-[0.15em]">Antrian Job Saya</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="px-2 py-0.5 bg-white/20" data-testid="myqueue-pending-count">Belum diterima: {pending.length}</span>
          <span className="px-2 py-0.5 bg-white/20" data-testid="myqueue-working-count">Dikerjakan: {working.length}</span>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {nothing && (
          <div className="text-center py-6 text-sm text-slate-500">
            <ClipboardText size={26} className="mx-auto mb-1 text-slate-300" />
            Belum ada job yang ditugaskan ke Anda.
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-amber-700">
              <Hourglass size={14} weight="fill" /> Perlu Diterima ({pending.length})
            </div>
            {(compact ? pending.slice(0, 3) : pending).map((drf) => <JobRow key={drf.id} drf={drf} mode="pending" />)}
          </div>
        )}

        {working.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-sky-700">
              <Clock size={14} weight="fill" /> Sedang Dikerjakan ({working.length})
            </div>
            {(compact ? working.slice(0, 3) : working).map((drf) => <JobRow key={drf.id} drf={drf} mode="working" />)}
          </div>
        )}

        {compact && (pending.length > 3 || working.length > 3) && (
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
