import React, { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import {
  Gauge, ArrowClockwise, Warning, CheckCircle, Fire, Kanban, FileText,
  CurrencyCircleDollar, PencilSimpleLine, Clock, UsersThree,
} from "@phosphor-icons/react";

const LEVEL = {
  overload: { label: "Overload", cls: "bg-rose-100 text-rose-700 border-rose-300", bar: "bg-rose-500", icon: Fire },
  busy: { label: "Sibuk", cls: "bg-amber-100 text-amber-700 border-amber-300", bar: "bg-amber-500", icon: Warning },
  normal: { label: "Normal", cls: "bg-emerald-100 text-emerald-700 border-emerald-300", bar: "bg-emerald-500", icon: CheckCircle },
};

const BREAKDOWN = [
  { key: "drf", label: "DRF", icon: Kanban, cls: "text-teal-600" },
  { key: "drawing", label: "Drawing", icon: FileText, cls: "text-violet-600" },
  { key: "inquiry", label: "Inquiry", icon: CurrencyCircleDollar, cls: "text-sky-600" },
  { key: "ecn", label: "ECN/Revisi", icon: PencilSimpleLine, cls: "text-indigo-600" },
];

export default function EngineeringWorkloadPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/engineering/workload");
      setData(data);
    } catch {
      setData({ items: [], summary: {}, thresholds: { busy: 4, overload: 7 } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const items = data?.items || [];
  const s = data?.summary || {};
  const maxTotal = Math.max(7, ...items.map((i) => i.total || 0));

  const SUMMARY = [
    { label: "Total Engineer", value: s.engineers ?? 0, icon: UsersThree, cls: "border-slate-300 text-slate-700 bg-slate-50" },
    { label: "Total Tugas Aktif", value: s.total_active ?? 0, icon: Gauge, cls: "border-indigo-300 text-indigo-700 bg-indigo-50/60" },
    { label: "Overload", value: s.overload ?? 0, icon: Fire, cls: "border-rose-300 text-rose-700 bg-rose-50/60" },
    { label: "Sibuk", value: s.busy ?? 0, icon: Warning, cls: "border-amber-300 text-amber-700 bg-amber-50/60" },
    { label: "Normal", value: s.normal ?? 0, icon: CheckCircle, cls: "border-emerald-300 text-emerald-700 bg-emerald-50/60" },
    { label: "Terlambat", value: s.overdue ?? 0, icon: Clock, cls: "border-orange-300 text-orange-700 bg-orange-50/60" },
  ];

  return (
    <div className="space-y-4" data-testid="workload-page">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <Gauge size={24} weight="bold" className="text-amber-600" />
            Monitor Beban Kerja Engineer
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Beban aktif = DRF + Drawing + Inquiry + ECN/revisi yang sedang dikerjakan. Ambang: Normal ≤3 · Sibuk 4–6 · Overload &gt;6.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 rounded transition-colors"
          data-testid="workload-refresh"
        >
          <ArrowClockwise size={14} weight="bold" className={loading ? "animate-spin" : ""} /> Segarkan
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5" data-testid="workload-summary">
        {SUMMARY.map((x) => (
          <div key={x.label} className={`border ${x.cls} px-3 py-2.5 rounded-md`}>
            <div className="flex items-center gap-1.5">
              <x.icon size={14} weight="bold" />
              <span className="text-[10px] uppercase tracking-wider font-bold">{x.label}</span>
            </div>
            <div className="text-2xl font-bold mt-0.5 tabular-nums">{x.value}</div>
          </div>
        ))}
      </div>

      {/* Per-engineer list */}
      <Card className="border-slate-200 divide-y divide-slate-100">
        {loading && items.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat data beban kerja…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm" data-testid="workload-empty">Belum ada user Engineering untuk dimonitor.</div>
        )}
        {items.map((it) => {
          const lv = LEVEL[it.level] || LEVEL.normal;
          const pct = Math.min(100, Math.round(((it.total || 0) / maxTotal) * 100));
          return (
            <div key={it.user_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`workload-row-${it.username}`}>
              {/* Identity */}
              <div className="sm:w-52 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-sm font-bold">
                    {(it.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 text-sm truncate">{it.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{(it.role || "").replace(/_/g, " ")}</div>
                  </div>
                </div>
              </div>

              {/* Bar + breakdown */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${lv.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 tabular-nums w-8 text-right">{it.total}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {BREAKDOWN.map((b) => (
                    <span key={b.key} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <b.icon size={12} weight="bold" className={b.cls} />
                      {b.label}: <b className="text-slate-700">{it[b.key]}</b>
                    </span>
                  ))}
                  {it.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600">
                      <Clock size={12} weight="bold" /> Terlambat: {it.overdue}
                    </span>
                  )}
                </div>
              </div>

              {/* Level badge */}
              <div className="sm:w-28 shrink-0 flex sm:justify-end">
                <span className={`inline-flex items-center gap-1 border px-2.5 py-1 rounded-full text-[11px] font-bold ${lv.cls}`} data-testid={`workload-level-${it.username}`}>
                  <lv.icon size={12} weight="bold" /> {lv.label}
                </span>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
