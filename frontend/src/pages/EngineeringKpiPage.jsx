import React, { useCallback, useEffect, useMemo, useState } from "react";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  ChartLineUp, ArrowClockwise, CircleNotch, Target, CheckCircle, XCircle,
  MagnifyingGlass, Info, Database, PencilSimpleLine, CaretLeft, CaretRight,
} from "@phosphor-icons/react";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const barColor = (v) => (v == null ? "bg-slate-300" : v >= 95 ? "bg-emerald-500" : v >= 85 ? "bg-amber-500" : "bg-rose-500");
const textColor = (v) => (v == null ? "text-slate-400" : v >= 95 ? "text-emerald-600" : v >= 85 ? "text-amber-600" : "text-rose-600");
const catColor = (c) => ({
  Excellent: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Good: "bg-sky-100 text-sky-800 border-sky-300",
  Fair: "bg-amber-100 text-amber-800 border-amber-300",
  Poor: "bg-rose-100 text-rose-800 border-rose-300",
}[c] || "bg-slate-100 text-slate-600 border-slate-300");

export default function EngineeringKpiPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState(null);       // { key, name, source, records }
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/engineering/kpi", { params: { year, month } });
      setData(data);
    } catch (e) {
      setData({ _error: e.response?.data?.detail || "Gagal memuat KPI." });
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const openAudit = useCallback(async (kpi) => {
    if (kpi.mode !== "auto") return;
    setAudit({ key: kpi.key, name: kpi.name, source: kpi.source, records: null });
    setAuditLoading(true);
    try {
      const { data } = await api.get(`/engineering/kpi/${kpi.key}/records`, { params: { year, month } });
      setAudit(data);
    } catch (e) {
      setAudit((a) => ({ ...a, records: [] }));
    } finally {
      setAuditLoading(false);
    }
  }, [year, month]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const overall = data?.overall_score;

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4">
      <BackLink />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
            <ChartLineUp size={14} weight="fill" /> Engineering · Laporan Bulanan
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            KPI Engineering
          </h1>
          <p className="text-sm text-slate-600 mt-1">Target semua indikator ≥ 95%. Angka dihitung otomatis dari data ERP — klik kartu untuk telusur audit.</p>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 border border-slate-300 hover:bg-slate-100" data-testid="kpi-prev-month" title="Bulan sebelumnya"><CaretLeft size={16} weight="bold" /></button>
          <div className="flex items-center gap-2 border border-slate-300 bg-white px-3 h-10">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="text-sm font-semibold bg-transparent outline-none" data-testid="kpi-month-select">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-sm font-semibold bg-transparent outline-none" data-testid="kpi-year-select">
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={nextMonth} className="p-2 border border-slate-300 hover:bg-slate-100" data-testid="kpi-next-month" title="Bulan berikutnya"><CaretRight size={16} weight="bold" /></button>
          <button onClick={load} className="p-2 border border-slate-300 hover:bg-slate-100" data-testid="kpi-refresh" title="Muat ulang"><ArrowClockwise size={16} weight="bold" /></button>
        </div>
      </div>

      {loading && (
        <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2"><CircleNotch size={26} className="animate-spin text-amber-500" weight="bold" /> Memuat KPI…</div>
      )}

      {!loading && data?._error && (
        <div className="py-12 text-center text-rose-500 text-sm border border-rose-200 bg-rose-50" data-testid="kpi-error">{data._error}</div>
      )}

      {!loading && data && !data._error && (
        <>
          {/* Overall score */}
          <div className="border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-5" data-testid="kpi-overall">
            <div className="flex items-center gap-4">
              <div className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center ${overall == null ? "border-slate-200" : overall >= 95 ? "border-emerald-400" : overall >= 85 ? "border-amber-400" : "border-rose-400"}`}>
                <span className={`text-2xl font-bold tabular-nums ${textColor(overall)}`} style={{ fontFamily: "Chivo, sans-serif" }}>{overall == null ? "–" : overall}</span>
                <span className="text-[9px] text-slate-400 uppercase">skor</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400">Skor KPI {MONTHS[month - 1]} {year}</div>
                <div className="flex items-center gap-2 mt-1">
                  {data.category && <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${catColor(data.category)}`}>{data.category}</span>}
                  <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Target size={13} weight="bold" /> Target ≥ {data.target}%</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Rata-rata indikator otomatis (indikator manual tidak dihitung ke skor).</div>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="kpi-grid">
            {(data.kpis || []).map((k) => {
              const clickable = k.mode === "auto";
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => openAudit(k)}
                  disabled={!clickable}
                  className={`text-left border border-slate-200 bg-white p-3.5 flex flex-col gap-2 transition-colors ${clickable ? "hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer" : "opacity-95 cursor-default"}`}
                  data-testid={`kpi-card-${k.key}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="w-6 h-6 shrink-0 flex items-center justify-center bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-500 tabular-nums">{k.no}</span>
                      <div className="text-sm font-semibold text-slate-800 leading-snug">{k.name}</div>
                    </div>
                    {k.mode === "manual"
                      ? <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-300 px-1.5 py-0.5"><PencilSimpleLine size={10} weight="bold" /> Manual</span>
                      : <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5"><Database size={10} weight="bold" /> Otomatis</span>}
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold tabular-nums ${textColor(k.value)}`} style={{ fontFamily: "Chivo, sans-serif" }} data-testid={`kpi-value-${k.key}`}>
                      {k.value == null ? "–" : k.value}
                    </span>
                    <span className="text-sm text-slate-400 font-semibold">%</span>
                    {k.value != null && (
                      k.value >= k.target
                        ? <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600"><CheckCircle size={13} weight="fill" /> Tercapai</span>
                        : <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-500"><XCircle size={13} weight="fill" /> Di bawah target</span>
                    )}
                  </div>

                  {/* Progress vs target */}
                  <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor(k.value)}`} style={{ width: `${Math.min(100, k.value || 0)}%` }} />
                    <div className="absolute top-0 bottom-0" style={{ left: `${k.target}%` }}>
                      <div className="w-px h-full bg-slate-800/70" title={`Target ${k.target}%`} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      {k.value == null
                        ? (k.mode === "manual" ? "Input manual (belum ada sumber data)" : "Tidak ada data pada bulan ini")
                        : <><b className="text-slate-700 tabular-nums">{k.numerator}</b> {k.num_label} / <b className="text-slate-700 tabular-nums">{k.denominator}</b> {k.den_label}</>}
                    </span>
                    {clickable && k.value != null && <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold"><MagnifyingGlass size={12} weight="bold" /> Audit</span>}
                  </div>

                  <div className="flex items-start gap-1.5 text-[10px] text-slate-400 border-t border-slate-100 pt-1.5 leading-snug">
                    <Info size={12} className="mt-0.5 shrink-0" /> <span>Sumber: {k.source}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ===== Audit drill modal ===== */}
      <Dialog open={!!audit} onOpenChange={(o) => { if (!o) setAudit(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="kpi-audit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 text-base">
              <MagnifyingGlass size={16} weight="bold" className="text-amber-600" /> Audit: {audit?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 p-2 mb-2">
            <Database size={13} className="mt-0.5 shrink-0 text-sky-600" /> <span>{audit?.source}</span>
          </div>
          {auditLoading || audit?.records == null ? (
            <div className="py-10 text-center text-slate-400"><CircleNotch size={22} className="animate-spin inline text-amber-500 mr-1" weight="bold" /> Memuat record…</div>
          ) : audit.records.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Tidak ada record penyusun pada bulan ini.</div>
          ) : (
            <div className="border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-left p-2 w-8">#</th>
                    <th className="text-left p-2">Referensi</th>
                    <th className="text-left p-2 w-24">Tanggal</th>
                    <th className="text-left p-2">Keterangan</th>
                    <th className="text-center p-2 w-16">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.records.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100" data-testid={`kpi-audit-row-${i}`}>
                      <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="p-2 font-mono font-semibold text-slate-800">{r.ref || "-"}</td>
                      <td className="p-2 text-[12px] text-slate-500 tabular-nums">{r.date || "—"}</td>
                      <td className="p-2 text-[12px] text-slate-600">{r.note}</td>
                      <td className="p-2 text-center">
                        {r.ok
                          ? <CheckCircle size={16} weight="fill" className="text-emerald-500 inline" />
                          : <XCircle size={16} weight="fill" className="text-rose-500 inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {audit?.records && audit.records.length > 0 && (
            <div className="text-[11px] text-slate-500 mt-2">
              Memenuhi: <b className="text-emerald-600">{audit.records.filter((r) => r.ok).length}</b> · Tidak: <b className="text-rose-600">{audit.records.filter((r) => !r.ok).length}</b> · Total: <b>{audit.records.length}</b>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
