import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import {
  PaperPlaneTilt, Stamp, Kanban, ClipboardText, ArrowRight,
  ArrowClockwise, CheckCircle, Gear, Tray,
} from "@phosphor-icons/react";

const TYPE_LABEL = { new_order: "New", repeat_order: "Repeat" };
const STATUS_META = {
  submitted: { label: "Perlu Diterima", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  accepted: { label: "Diterima", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  in_progress: { label: "Dikerjakan", cls: "bg-violet-100 text-violet-800 border-violet-300" },
};

/**
 * EngineeringQueuePanel — ringkasan konsolidasi antrian Drawing Request (DRF) untuk portal Engineering.
 * Menampilkan stat tiles (perlu diterima / dikerjakan / menunggu TTD saya / tugas saya) + mini-list
 * antrian DRF terbaru sehingga Eng Leader bisa langsung melihat & bertindak tanpa berpindah menu.
 */
export default function EngineeringQueuePanel({ isHead, isEngUser }) {
  const navigate = useNavigate();
  const [drfs, setDrfs] = useState([]);
  const [pendingApproval, setPendingApproval] = useState(0);
  const [myTasks, setMyTasks] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const jobs = [];
      if (isHead) {
        jobs.push(
          api.get("/drawing-requests", { params: { scope: "for_engineering" } })
            .then(({ data }) => setDrfs(data?.items || [])).catch(() => {}),
          api.get("/drawings/pending-my-approval")
            .then(({ data }) => setPendingApproval(data?.total || 0)).catch(() => {}),
        );
      }
      if (isEngUser) {
        jobs.push(
          api.get("/drawings/my-assignments")
            .then(({ data }) => setMyTasks((data?.items || []).filter((d) => !["controlled", "released"].includes(d.approval_status)).length))
            .catch(() => {}),
        );
      }
      await Promise.all(jobs);
    } finally {
      setLoading(false);
    }
  }, [isHead, isEngUser]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 45000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const submitted = drfs.filter((d) => d.status === "submitted");
  const accepted = drfs.filter((d) => d.status === "accepted");
  const inProgress = drfs.filter((d) => d.status === "in_progress");
  const queue = [...submitted, ...accepted, ...inProgress];

  const tiles = [
    ...(isHead ? [
      { key: "submitted", label: "Perlu Diterima", value: submitted.length, icon: PaperPlaneTilt, accent: "text-amber-600", ring: "border-l-amber-500", href: "/engineering/drawing-request-inbox" },
      { key: "inprogress", label: "Sedang Dikerjakan", value: inProgress.length, icon: Gear, accent: "text-violet-600", ring: "border-l-violet-500", href: "/engineering/work-orders" },
      { key: "approval", label: "Menunggu TTD Saya", value: pendingApproval, icon: Stamp, accent: "text-emerald-600", ring: "border-l-emerald-500", href: "/drawings/pending-my-approval" },
    ] : []),
    ...(isEngUser ? [
      { key: "mytasks", label: "Tugas Saya", value: myTasks, icon: Kanban, accent: "text-teal-600", ring: "border-l-teal-500", href: "/engineering/work-orders" },
    ] : []),
  ];

  return (
    <div className="bg-white border border-slate-200 shadow-sm" data-testid="eng-queue-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <Tray size={16} weight="fill" className="text-amber-600" />
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800" style={{ fontFamily: "Chivo, sans-serif" }}>
            Antrian Drawing Request
          </h2>
          {loading && <span className="text-[10px] text-slate-400 animate-pulse">memuat…</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchAll} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded" title="Segarkan" data-testid="eng-queue-refresh">
            <ArrowClockwise size={14} weight="bold" />
          </button>
          {isHead && (
            <button
              onClick={() => navigate("/engineering/drawing-request-inbox")}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-amber-700 hover:text-amber-900 px-2 py-1"
              data-testid="eng-queue-inbox-link"
            >
              Buka Inbox <ArrowRight size={12} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-200">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.href)}
              className={`text-left bg-white hover:bg-slate-50 transition-colors p-3 border-l-4 ${t.ring} focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500`}
              data-testid={`eng-queue-tile-${t.key}`}
            >
              <div className="flex items-center justify-between">
                <Icon size={18} weight="duotone" className={t.accent} />
                <span className="text-2xl font-bold tabular-nums text-slate-900" data-testid={`eng-queue-count-${t.key}`}>{t.value}</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500 mt-1">{t.label}</div>
            </button>
          );
        })}
      </div>

      {/* Mini-list antrian */}
      {isHead && (
        <div className="p-3">
          {queue.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Tidak ada antrian DRF saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="eng-queue-list">
                <thead>
                  <tr className="text-[9px] uppercase tracking-[0.1em] font-bold text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1.5 pr-2">Form No</th>
                    <th className="text-left py-1.5 pr-2">Tipe</th>
                    <th className="text-left py-1.5 pr-2">SO</th>
                    <th className="text-left py-1.5 pr-2">Customer / Project</th>
                    <th className="text-left py-1.5 pr-2">Engineer</th>
                    <th className="text-left py-1.5 pr-2">Status</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.slice(0, 6).map((d) => {
                    const meta = STATUS_META[d.status] || { label: d.status, cls: "bg-slate-100 text-slate-700 border-slate-300" };
                    const goto = d.status === "submitted" ? "/engineering/drawing-request-inbox" : "/engineering/work-orders";
                    return (
                      <tr key={d.id} className="border-b border-slate-50 hover:bg-amber-50/40" data-testid={`eng-queue-row-${d.form_no}`}>
                        <td className="py-1.5 pr-2 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">{d.form_no}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${d.request_type === "repeat_order" ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`}>
                            {TYPE_LABEL[d.request_type] || d.request_type}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-xs text-slate-600 whitespace-nowrap">{d.so_no || "-"}</td>
                        <td className="py-1.5 pr-2 text-xs text-slate-700 max-w-[220px] truncate" title={`${d.customer_name || ""} ${d.project_name || ""}`}>
                          <span className="font-medium">{d.customer_name || "-"}</span>
                          {d.project_name ? <span className="text-slate-400"> · {d.project_name}</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-slate-600 whitespace-nowrap">{d.assigned_engineer_name || <span className="text-slate-300">—</span>}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${meta.cls}`}>{meta.label}</span>
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => navigate(goto)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900"
                            data-testid={`eng-queue-open-${d.form_no}`}
                          >
                            {d.status === "submitted" ? "Terima" : "Buka"} <ArrowRight size={11} weight="bold" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {queue.length > 6 && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => navigate("/engineering/work-orders")}
                    className="text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-800"
                    data-testid="eng-queue-more"
                  >
                    +{queue.length - 6} DRF lainnya — lihat semua
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
