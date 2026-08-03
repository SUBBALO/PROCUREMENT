import React, { useCallback, useEffect, useState } from "react";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  ChartLineUp, ArrowClockwise, CircleNotch, Target, CheckCircle, XCircle,
  MagnifyingGlass, Database, CaretLeft, CaretRight, PencilSimpleLine,
} from "@phosphor-icons/react";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const valColor = (v) => (v == null ? "text-slate-300" : v >= 95 ? "text-emerald-600" : v >= 85 ? "text-amber-600" : "text-rose-600");
const cellBg = (v) => (v == null ? "" : v >= 95 ? "bg-emerald-50" : v >= 85 ? "bg-amber-50" : "bg-rose-50");
const catBadge = (c) => ({
  "Luar Biasa": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Baik": "bg-sky-100 text-sky-800 border-sky-300",
  "Cukup": "bg-amber-100 text-amber-800 border-amber-300",
  "Kurang": "bg-rose-100 text-rose-800 border-rose-300",
}[c] || "bg-slate-100 text-slate-500 border-slate-300");

export default function EngineeringKpiPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/engineering/kpi", { params: { year } });
      setData(data);
    } catch (e) {
      setData({ _error: e.response?.data?.detail || "Gagal memuat KPI." });
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const openAudit = useCallback(async (kpi, month) => {
    if (kpi.mode !== "auto") return;
    const cell = kpi.monthly?.[month];
    if (!cell || cell.value == null) return;
    setAudit({ key: kpi.key, name: kpi.name_id, month, source: kpi.source, records: null });
    setAuditLoading(true);
    try {
      const { data } = await api.get(`/engineering/kpi/${kpi.key}/records`, { params: { year, month } });
      setAudit((a) => ({ ...a, ...data }));
    } catch (e) {
      setAudit((a) => ({ ...a, records: [] }));
    } finally {
      setAuditLoading(false);
    }
  }, [year]);

  const overall = data?.overall_score;

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
            <ChartLineUp size={14} weight="fill" /> Engineering · Laporan KPI Bulanan
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            KPI Engineering {year}
          </h1>
          <p className="text-sm text-slate-600 mt-1">Format sesuai form teregister. Angka dihitung otomatis dari data ERP — klik sel bulan untuk telusur audit.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)} className="p-2 border border-slate-300 hover:bg-slate-100" data-testid="kpi-prev-year" title="Tahun sebelumnya"><CaretLeft size={16} weight="bold" /></button>
          <div className="border border-slate-300 bg-white px-3 h-10 flex items-center">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-sm font-bold bg-transparent outline-none" data-testid="kpi-year-select">
              {[now.getFullYear() - 3, now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={() => setYear((y) => y + 1)} className="p-2 border border-slate-300 hover:bg-slate-100" data-testid="kpi-next-year" title="Tahun berikutnya"><CaretRight size={16} weight="bold" /></button>
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
          {/* Overall */}
          <div className="border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-4" data-testid="kpi-overall">
            <div className={`w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center ${overall == null ? "border-slate-200" : overall >= 95 ? "border-emerald-400" : overall >= 85 ? "border-amber-400" : "border-rose-400"}`}>
              <span className={`text-xl font-bold tabular-nums ${valColor(overall)}`} style={{ fontFamily: "Chivo, sans-serif" }}>{overall == null ? "–" : overall}</span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400">Skor KPI Tahun {year}</div>
              <div className="flex items-center gap-2 mt-1">
                {data.overall_category && <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${catBadge(data.overall_category)}`}>{data.overall_category}</span>}
                <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Target size={13} weight="bold" /> Target ≥ {data.target}%</span>
              </div>
            </div>
          </div>

          {/* Tabel KPI format Excel */}
          <div className="border border-slate-200 bg-white overflow-x-auto" data-testid="kpi-table-wrap">
            <table className="w-full text-sm border-collapse" data-testid="kpi-table">
              <thead>
                <tr className="bg-slate-800 text-white text-[10px] uppercase tracking-wider">
                  <th className="p-2 text-center w-8 border border-slate-700">No</th>
                  <th className="p-2 text-left min-w-[240px] border border-slate-700">KPI / Sasaran Mutu</th>
                  <th className="p-2 text-center w-16 border border-slate-700">Target</th>
                  {MONTHS_SHORT.map((m, i) => (
                    <th key={i} className={`p-1.5 text-center w-12 border border-slate-700 ${i + 1 === (now.getMonth() + 1) && year === now.getFullYear() ? "bg-amber-600" : ""}`}>{m}</th>
                  ))}
                  <th className="p-2 text-center w-16 border border-slate-700">Actual</th>
                  <th className="p-2 text-center w-24 border border-slate-700">Kategori</th>
                </tr>
              </thead>
              <tbody>
                {(data.kpis || []).map((k) => (
                  <tr key={k.key} className="hover:bg-slate-50/60" data-testid={`kpi-row-${k.key}`}>
                    <td className="p-2 text-center text-slate-500 tabular-nums border border-slate-200 font-bold">{k.no}</td>
                    <td className="p-2 border border-slate-200">
                      <div className="font-semibold text-slate-800 leading-snug flex items-center gap-1.5">
                        {k.name_id}
                        {k.mode === "manual" && <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-300 px-1 py-px"><PencilSimpleLine size={9} weight="bold" />Manual</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{k.formula}</div>
                    </td>
                    <td className="p-2 text-center text-[11px] font-bold text-slate-600 border border-slate-200 whitespace-nowrap">≥ {k.target}%</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const cell = k.monthly?.[m] || {};
                      const v = cell.value;
                      const clickable = k.mode === "auto" && v != null;
                      return (
                        <td
                          key={m}
                          onClick={() => clickable && openAudit(k, m)}
                          title={clickable ? `${cell.num}/${cell.den} — klik untuk audit` : ""}
                          className={`p-1 text-center text-[12px] font-bold tabular-nums border border-slate-200 ${cellBg(v)} ${valColor(v)} ${clickable ? "cursor-pointer hover:ring-2 hover:ring-amber-400 hover:ring-inset" : ""}`}
                          data-testid={`kpi-cell-${k.key}-${m}`}
                        >
                          {v == null ? <span className="text-slate-300">–</span> : v}
                        </td>
                      );
                    })}
                    <td className={`p-2 text-center text-sm font-bold tabular-nums border border-slate-200 ${valColor(k.actual)}`} data-testid={`kpi-actual-${k.key}`}>
                      {k.actual == null ? <span className="text-slate-300">–</span> : k.actual}
                    </td>
                    <td className="p-1.5 text-center border border-slate-200">
                      {k.category
                        ? <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${catBadge(k.category)}`}>{k.category}</span>
                        : <span className="text-slate-300 text-xs">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 inline-block" /> ≥ 95% tercapai</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500 inline-block" /> 85–94%</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-500 inline-block" /> &lt; 85%</span>
            <span className="inline-flex items-center gap-1"><Database size={12} className="text-sky-600" /> Klik sel bulan berwarna untuk telusur audit record.</span>
          </div>
        </>
      )}

      {/* Audit drill modal */}
      <Dialog open={!!audit} onOpenChange={(o) => { if (!o) setAudit(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="kpi-audit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 text-base">
              <MagnifyingGlass size={16} weight="bold" className="text-amber-600" /> Audit: {audit?.name} — {audit ? MONTHS_FULL[audit.month - 1] : ""} {year}
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
            <>
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
                          {r.ok ? <CheckCircle size={16} weight="fill" className="text-emerald-500 inline" /> : <XCircle size={16} weight="fill" className="text-rose-500 inline" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Memenuhi: <b className="text-emerald-600">{audit.records.filter((r) => r.ok).length}</b> · Tidak: <b className="text-rose-600">{audit.records.filter((r) => !r.ok).length}</b> · Total: <b>{audit.records.length}</b>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
