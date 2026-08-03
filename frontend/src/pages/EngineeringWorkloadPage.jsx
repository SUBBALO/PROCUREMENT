import React, { useEffect, useState, useCallback, useMemo } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  Gauge, ArrowClockwise, Warning, CheckCircle, Fire, Kanban, FileText,
  CurrencyCircleDollar, PencilSimpleLine, Clock, UsersThree, ChartBar, X, CircleNotch,
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
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState(null); // 'overload'|'busy'|'normal'|'overdue'
  const [showTrend, setShowTrend] = useState(true);
  const [detailUser, setDetailUser] = useState(null);   // {user_id, name} untuk modal rincian
  const [detailTab, setDetailTab] = useState("drf");
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = useCallback(async (row, tabKey) => {
    setDetailUser({ user_id: row.user_id, name: row.name });
    setDetailTab(tabKey || "drf");
    setDetailData(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/engineering/workload/detail?user_id=${row.user_id}`);
      setDetailData(data);
    } catch {
      setDetailData({ drf: [], drawing: [], inquiry: [], ecn: [], counts: {} });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        api.get("/engineering/workload"),
        api.get("/engineering/workload/trend?weeks=8").catch(() => ({ data: null })),
      ]);
      setData(w.data);
      setTrend(t.data);
    } catch {
      setData({ items: [], summary: {}, thresholds: { busy: 4, overload: 7 } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const allItems = data?.items || [];
  const s = data?.summary || {};

  const trendMap = useMemo(() => {
    const m = {};
    (trend?.items || []).forEach((it) => { m[it.user_id] = it.series || []; });
    return m;
  }, [trend]);
  const trendMax = useMemo(() => {
    let mx = 1;
    (trend?.items || []).forEach((it) => (it.series || []).forEach((v) => { if (v > mx) mx = v; }));
    return mx;
  }, [trend]);
  const weekLabels = trend?.weeks || [];

  const items = useMemo(() => {
    if (!levelFilter) return allItems;
    if (levelFilter === "overdue") return allItems.filter((i) => (i.overdue || 0) > 0);
    return allItems.filter((i) => i.level === levelFilter);
  }, [allItems, levelFilter]);

  const maxTotal = Math.max(7, ...allItems.map((i) => i.total || 0));

  const SUMMARY = [
    { label: "Total Engineer", value: s.engineers ?? 0, icon: UsersThree, cls: "border-slate-300 text-slate-700 bg-slate-50", key: null },
    { label: "Total Tugas Aktif", value: s.total_active ?? 0, icon: Gauge, cls: "border-indigo-300 text-indigo-700 bg-indigo-50/60", key: null },
    { label: "Overload", value: s.overload ?? 0, icon: Fire, cls: "border-rose-300 text-rose-700 bg-rose-50/60", key: "overload" },
    { label: "Sibuk", value: s.busy ?? 0, icon: Warning, cls: "border-amber-300 text-amber-700 bg-amber-50/60", key: "busy" },
    { label: "Normal", value: s.normal ?? 0, icon: CheckCircle, cls: "border-emerald-300 text-emerald-700 bg-emerald-50/60", key: "normal" },
    { label: "Terlambat", value: s.overdue ?? 0, icon: Clock, cls: "border-orange-300 text-orange-700 bg-orange-50/60", key: "overdue" },
  ];

  const toggleLevel = (k) => (k ? setLevelFilter((cur) => (cur === k ? null : k)) : setLevelFilter(null));

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
            Beban aktif = DRF + Drawing + Inquiry + ECN/revisi yang sedang dikerjakan. Ambang: Normal ≤3 · Sibuk 4–6 · Overload &gt;6. Klik kartu Overload/Sibuk/Normal/Terlambat untuk menyaring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTrend((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border text-sm font-bold rounded transition-colors ${showTrend ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}
            data-testid="workload-trend-toggle"
          >
            <ChartBar size={14} weight="bold" /> Tren Mingguan
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 rounded transition-colors"
            data-testid="workload-refresh"
          >
            <ArrowClockwise size={14} weight="bold" className={loading ? "animate-spin" : ""} /> Segarkan
          </button>
        </div>
      </div>

      {/* Summary (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5" data-testid="workload-summary">
        {SUMMARY.map((x) => {
          const isReset = !x.key; // Total Engineer / Total Tugas Aktif → reset ke semua
          const active = isReset ? levelFilter === null : levelFilter === x.key;
          return (
            <button
              key={x.label}
              type="button"
              onClick={() => toggleLevel(x.key)}
              className={`text-left border ${x.cls} px-3 py-2.5 rounded-md transition-all hover:shadow-sm cursor-pointer ${active ? "ring-2 ring-offset-1 ring-slate-400 shadow-sm" : ""}`}
              title={isReset ? "Tampilkan semua engineer" : `Saring: ${x.label}`}
              data-testid={`workload-summary-${x.key || x.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center gap-1.5">
                <x.icon size={14} weight="bold" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{x.label}</span>
              </div>
              <div className="text-2xl font-bold mt-0.5 tabular-nums">{x.value}</div>
            </button>
          );
        })}
      </div>

      {levelFilter && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Menyaring:</span>
          <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            {levelFilter === "overdue" ? "Terlambat" : (LEVEL[levelFilter]?.label || levelFilter)}
            <button onClick={() => setLevelFilter(null)} className="hover:text-rose-600" data-testid="workload-filter-clear"><X size={11} weight="bold" /></button>
          </span>
          <span className="text-slate-400">({items.length} engineer)</span>
        </div>
      )}

      {/* Week labels legend (when trend on) */}
      {showTrend && weekLabels.length > 0 && (
        <div className="hidden sm:flex items-center justify-end gap-1 text-[9px] text-slate-400 pr-1" data-testid="workload-trend-legend">
          <span className="mr-1 uppercase tracking-wider font-bold">Tren {weekLabels.length} minggu:</span>
          {weekLabels.map((w, i) => (
            <span key={i} className="w-6 text-center">{w.split(" ")[0]}</span>
          ))}
        </div>
      )}

      {/* Per-engineer list */}
      <Card className="border-slate-200 divide-y divide-slate-100">
        {loading && allItems.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat data beban kerja…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm" data-testid="workload-empty">
            {levelFilter ? "Tidak ada engineer pada filter ini." : "Belum ada user Engineering untuk dimonitor."}
          </div>
        )}
        {items.map((it) => {
          const lv = LEVEL[it.level] || LEVEL.normal;
          const pct = Math.min(100, Math.round(((it.total || 0) / maxTotal) * 100));
          const series = trendMap[it.user_id] || [];
          return (
            <div key={it.user_id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3" data-testid={`workload-row-${it.username}`}>
              {/* Identity */}
              <div className="lg:w-48 shrink-0">
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
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {BREAKDOWN.map((b) => {
                    const val = it[b.key] || 0;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => val > 0 && openDetail(it, b.key)}
                        disabled={val === 0}
                        className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border transition-colors ${val > 0 ? "border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 cursor-pointer" : "border-transparent text-slate-300 cursor-default"}`}
                        data-testid={`workload-breakdown-${it.username}-${b.key}`}
                        title={val > 0 ? `Lihat ${val} ${b.label}` : `Tidak ada ${b.label}`}
                      >
                        <b.icon size={12} weight="bold" className={val > 0 ? b.cls : "text-slate-300"} />
                        {b.label}: <b className={val > 0 ? "text-slate-700" : "text-slate-300"}>{val}</b>
                      </button>
                    );
                  })}
                  {it.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 px-1.5 py-0.5">
                      <Clock size={12} weight="bold" /> Terlambat: {it.overdue}
                    </span>
                  )}
                </div>
              </div>

              {/* Weekly trend mini-chart */}
              {showTrend && (
                <div className="shrink-0 flex items-end gap-1 h-9 lg:w-[220px]" data-testid={`workload-trend-${it.username}`} title="Tugas baru per minggu">
                  {(series.length ? series : weekLabels.map(() => 0)).map((v, i) => {
                    const h = Math.max(2, Math.round((v / trendMax) * 32));
                    const strong = v >= trendMax * 0.66 && v > 0;
                    const mid = v >= trendMax * 0.33 && v > 0;
                    const color = v === 0 ? "bg-slate-200" : (strong ? "bg-rose-400" : (mid ? "bg-amber-400" : "bg-emerald-400"));
                    return (
                      <div key={i} className="flex flex-col items-center justify-end w-5" title={`${weekLabels[i] || ""}: ${v} tugas`}>
                        <span className="text-[8px] text-slate-400 leading-none mb-0.5">{v || ""}</span>
                        <div className={`w-4 ${color} rounded-sm`} style={{ height: `${h}px` }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Level badge */}
              <div className="lg:w-28 shrink-0 flex lg:justify-end">
                <span className={`inline-flex items-center gap-1 border px-2.5 py-1 rounded-full text-[11px] font-bold ${lv.cls}`} data-testid={`workload-level-${it.username}`}>
                  <lv.icon size={12} weight="bold" /> {lv.label}
                </span>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Modal rincian breakdown (view-only) */}
      <Dialog open={!!detailUser} onOpenChange={(o) => { if (!o) setDetailUser(null); }}>
        <DialogContent className="max-w-3xl" data-testid="workload-detail-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <FileText size={18} weight="bold" className="text-amber-600" />
              Rincian Beban — {detailUser?.name}
              <span className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">View-only</span>
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {[
              { key: "drf", label: "DRF", icon: Kanban },
              { key: "drawing", label: "Drawing", icon: FileText },
              { key: "inquiry", label: "Inquiry", icon: CurrencyCircleDollar },
              { key: "ecn", label: "ECN/Revisi", icon: PencilSimpleLine },
            ].map((t) => {
              const cnt = detailData?.counts?.[t.key] ?? 0;
              const active = detailTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setDetailTab(t.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px ${active ? "border-amber-500 text-amber-700" : "border-transparent text-slate-400 hover:text-slate-700"}`}
                  data-testid={`workload-detail-tab-${t.key}`}
                >
                  <t.icon size={13} weight="bold" /> {t.label}
                  <span className={`px-1 rounded-sm text-[10px] ${active ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{cnt}</span>
                </button>
              );
            })}
          </div>

          <div className="max-h-[55vh] overflow-auto">
            {detailLoading && (
              <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <CircleNotch size={22} className="animate-spin text-amber-500" weight="bold" /> Memuat rincian…
              </div>
            )}
            {!detailLoading && detailData && (
              (() => {
                const rows = detailData[detailTab] || [];
                if (rows.length === 0) {
                  return <div className="py-10 text-center text-slate-400 text-sm" data-testid="workload-detail-empty">Tidak ada item pada kategori ini.</div>;
                }
                return (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="text-left py-2 px-2">No.</th>
                        <th className="text-left py-2 px-2">SO</th>
                        <th className="text-left py-2 px-2">Keterangan</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.id || i} className="border-b border-slate-50" data-testid={`workload-detail-row-${detailTab}-${i}`}>
                          <td className="py-1.5 px-2 font-mono font-semibold text-slate-800 whitespace-nowrap">{r.no}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-500 whitespace-nowrap">{r.so_no || "-"}</td>
                          <td className="py-1.5 px-2 text-slate-600 max-w-[280px] truncate" title={r.title}>{r.title || "-"}</td>
                          <td className="py-1.5 px-2"><span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-slate-200 bg-slate-50 text-slate-600">{(r.status || "-").replace(/_/g, " ")}</span></td>
                          <td className={`py-1.5 px-2 whitespace-nowrap ${r.due && String(r.due).slice(0,10) < new Date().toISOString().slice(0,10) ? "text-rose-600 font-bold" : "text-slate-500"}`}>{r.due ? String(r.due).slice(0, 10) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
