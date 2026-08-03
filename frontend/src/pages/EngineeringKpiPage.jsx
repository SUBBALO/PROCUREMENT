import React, { useCallback, useEffect, useState } from "react";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  Printer, ChartLineUp, MagnifyingGlass, Database, CircleNotch, CheckCircle, XCircle,
  ClipboardText, ArrowsClockwise,
} from "@phosphor-icons/react";

const COMPANY = "PT. MITRA KARYA SARANA";
const COMPANY_TAGLINE = "STEEL FABRICATION, MARINE CONTRACTOR & ENGINEERING";
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const fmtLongID = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};

const CATEGORY_STYLES = {
  "SANGAT BAIK": { bg: "bg-emerald-500", text: "text-white" },
  "BAIK": { bg: "bg-sky-500", text: "text-white" },
  "CUKUP": { bg: "bg-amber-400", text: "text-slate-900" },
  "PERLU PERBAIKAN": { bg: "bg-red-500", text: "text-white" },
};

const achColor = (v) => (v == null ? "text-slate-300" : v >= 90 ? "text-emerald-600" : v >= 80 ? "text-sky-600" : v >= 71 ? "text-amber-600" : "text-rose-600");

export default function EngineeringKpiPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/engineering/kpi", { params: { year, month } });
      setData(res.data);
    } catch (e) {
      setData({ _error: e.response?.data?.detail || "Gagal memuat KPI." });
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const openAudit = useCallback(async (kpi) => {
    setAudit({ key: kpi.key, name: kpi.name_id, source: kpi.source, records: null });
    setAuditLoading(true);
    try {
      const { data } = await api.get(`/engineering/kpi/${kpi.key}/records`, { params: { year, month } });
      setAudit((a) => ({ ...a, ...data }));
    } catch (e) {
      setAudit((a) => ({ ...a, records: [] }));
    } finally {
      setAuditLoading(false);
    }
  }, [year, month]);

  const catStyle = CATEGORY_STYLES[data?.category] || CATEGORY_STYLES.BAIK;

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="print:hidden"><BackLink /></div>

      {/* Filter bar (screen only) */}
      <div className="print:hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>KPI Engineering</h1>
          <p className="text-sm text-slate-500 mt-1">Laporan bulanan Key Performance Indicator Departemen Engineering — dihitung otomatis & auditable dari data ERP.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 p-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Bulan</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-9 border border-slate-300 rounded-none text-sm px-2" data-testid="kpi-month-select">
              {MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Tahun</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 border border-slate-300 rounded-none text-sm px-2" data-testid="kpi-year-select">
              {[now.getFullYear() - 3, now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold" data-testid="kpi-generate">
            <ArrowsClockwise size={14} weight="bold" className="mr-1.5" /> {loading ? "Memuat..." : "Hitung Ulang"}
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="h-9 rounded-none border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold" data-testid="kpi-print">
            <Printer size={14} weight="bold" className="mr-1.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {loading && <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2"><CircleNotch size={26} className="animate-spin text-teal-500" weight="bold" /> Memuat KPI…</div>}
      {!loading && data?._error && <div className="py-12 text-center text-rose-500 text-sm border border-rose-200 bg-rose-50" data-testid="kpi-error">{data._error}</div>}

      {!loading && data && !data._error && (
        <div className="bg-white border border-slate-200 print:border-none">
          {/* Letterhead */}
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-200">
            <div className="p-6 flex items-center gap-4">
              <img src="/assets/logo-mks.png" alt="MKS Logo" className="w-16 h-16 object-contain" onError={(e) => { e.target.style.display = "none"; }} />
              <div>
                <div className="font-black text-slate-900 text-lg tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>{COMPANY}</div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mt-0.5">{COMPANY_TAGLINE}</div>
              </div>
            </div>
            <div className="bg-gradient-to-r from-teal-700 to-teal-500 text-white p-6 flex flex-col items-end justify-center">
              <div className="text-3xl sm:text-4xl font-black tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>KPI ENGINEERING</div>
              <div className="mt-2 text-xs sm:text-sm font-semibold">PERIODE PELAPORAN : {fmtLongID(data.period?.start_date)} - {fmtLongID(data.period?.end_date)}</div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto p-4">
            <table className="w-full border-collapse text-sm border border-slate-400" data-testid="kpi-table">
              <thead>
                <tr className="bg-teal-50 text-slate-900 text-xs">
                  <th className="border border-slate-400 p-2 w-10">No</th>
                  <th className="border border-slate-400 p-2 text-left">Department KPI</th>
                  <th className="border border-slate-400 p-2 w-[260px]">Calculation Formula</th>
                  <th className="border border-slate-400 p-2 w-20">Target Achievement</th>
                  <th className="border border-slate-400 p-2 w-16">Achievement Weight (%)</th>
                  <th className="border border-slate-400 p-2 w-28 bg-emerald-100">Actual Achievements</th>
                  <th className="border border-slate-400 p-2 w-20 bg-teal-200">KPI Score (%)</th>
                  <th className="border border-slate-400 p-2 w-16 print:hidden">Audit</th>
                </tr>
              </thead>
              <tbody>
                {(data.kpis || []).map((k) => (
                  <tr key={k.key} className="align-middle" data-testid={`kpi-row-${k.key}`}>
                    <td className="border border-slate-400 p-2 text-center tabular-nums">{k.no}</td>
                    <td className="border border-slate-400 p-2">
                      <div className="font-semibold text-slate-900">{k.name_id}</div>
                      <div className="text-xs italic text-teal-700 mt-1">▶ {k.description}</div>
                    </td>
                    <td className="border border-slate-400 p-2">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-slate-400">(</span>
                        <div className="flex flex-col items-center">
                          <div className="text-[11px] underline text-slate-900 whitespace-nowrap px-1">{k.formula_num}</div>
                          <div className="text-[11px] text-slate-900 whitespace-nowrap px-1">{k.formula_den}</div>
                        </div>
                        <span className="text-slate-400">)</span>
                        <span className="text-xs">x 100%</span>
                      </div>
                    </td>
                    <td className="border border-slate-400 p-2 text-center font-semibold">{k.target}</td>
                    <td className="border border-slate-400 p-2 text-center font-bold tabular-nums" data-testid={`kpi-weight-${k.key}`}>{k.weight}%</td>
                    <td className="border border-slate-400 p-0 text-center">
                      <div className="grid grid-rows-2">
                        <div className="border-b border-slate-400 tabular-nums py-1 text-sm" data-testid={`kpi-num-${k.key}`}>{k.numerator}</div>
                        <div className="tabular-nums py-1 text-sm" data-testid={`kpi-den-${k.key}`}>{k.denominator}</div>
                      </div>
                      <div className={`border-t border-slate-400 py-1 font-bold tabular-nums ${achColor(k.achievement)}`} data-testid={`kpi-ach-${k.key}`}>
                        {k.achievement == null ? "–" : `${k.achievement.toFixed(0)}%`}
                      </div>
                    </td>
                    <td className={`border border-slate-400 p-2 text-center bg-teal-100 font-bold tabular-nums text-lg ${achColor(k.achievement)}`} style={{ fontFamily: "Chivo, sans-serif" }} data-testid={`kpi-score-${k.key}`}>
                      {k.score == null ? "–" : `${k.score.toFixed(2)} %`}
                    </td>
                    <td className="border border-slate-400 p-1 text-center print:hidden">
                      <button onClick={() => openAudit(k)} className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide border border-teal-300 text-teal-700 hover:bg-teal-600 hover:text-white transition-colors" data-testid={`kpi-audit-btn-${k.key}`} title="Telusur record (audit)">
                        <MagnifyingGlass size={11} weight="bold" />
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr>
                  <td colSpan={4} className="border border-slate-400 p-2 text-right font-bold uppercase text-xs tracking-wider text-slate-600">Total</td>
                  <td className="border border-slate-400 p-2 text-center font-black bg-yellow-200 tabular-nums" data-testid="kpi-total-weight">{data.total_weight}%</td>
                  <td className="border border-slate-400"></td>
                  <td className="border border-slate-400 p-2 text-center font-black bg-yellow-300 tabular-nums text-lg" data-testid="kpi-total-score" style={{ fontFamily: "Chivo, sans-serif" }}>
                    {data.total_score == null ? "–" : `${data.total_score.toFixed(2)} %`}
                  </td>
                  <td className="border border-slate-400 print:hidden"></td>
                </tr>
                {/* Category */}
                <tr>
                  <td colSpan={5} className="border border-slate-400 p-3 align-top">
                    <div className="font-semibold underline mb-1">Achievement Category (Kategori Capaian):</div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs max-w-sm">
                      <div>≤ 70%</div><div className="text-red-600 font-bold">→ PERLU PERBAIKAN</div>
                      <div>71% - 79%</div><div className="text-amber-600 font-bold">→ CUKUP</div>
                      <div>80% - 89%</div><div className="text-sky-700 font-bold">→ BAIK</div>
                      <div>≥ 90%</div><div className="text-emerald-600 font-bold">→ SANGAT BAIK</div>
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-slate-400 p-3 text-right font-black text-xl ${catStyle.bg} ${catStyle.text}`} data-testid="kpi-category" style={{ fontFamily: "Chivo, sans-serif" }}>
                    {data.category || "-"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-4 pb-4 text-[11px] text-slate-400 flex items-center gap-1.5 print:hidden">
            <Database size={13} className="text-teal-600" /> Semua angka dihitung otomatis dari data ERP. Klik ikon Audit pada tiap baris untuk menelusuri record aslinya (siap saat diaudit).
          </div>
        </div>
      )}

      {/* Audit drill modal (screen only) */}
      <Dialog open={!!audit} onOpenChange={(o) => { if (!o) setAudit(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="kpi-audit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 text-base">
              <MagnifyingGlass size={16} weight="bold" className="text-teal-600" /> Audit: {audit?.name} — {MONTHS_FULL[month - 1]} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 p-2 mb-2">
            <Database size={13} className="mt-0.5 shrink-0 text-teal-600" /> <span>{audit?.source}</span>
          </div>
          {auditLoading || audit?.records == null ? (
            <div className="py-10 text-center text-slate-400"><CircleNotch size={22} className="animate-spin inline text-teal-500 mr-1" weight="bold" /> Memuat record…</div>
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
