import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Printer, ChartLineUp, Clock, ShieldCheck, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const COMPANY = "PT. MITRA KARYA SARANA";
const COMPANY_TAGLINE = "STEEL FABRICATION, MARINE CONTRACTOR & ENGINEERING";

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

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

export default function KPIReportPage() {
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(lastDayOfMonth());
  const [grace, setGrace] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/kpi", {
        params: { start_date: startDate, end_date: endDate, ontime_grace_days: grace },
      });
      setData(res.data);
    } catch (e) {
      toast.error("Gagal memuat KPI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catStyle = CATEGORY_STYLES[data?.category] || CATEGORY_STYLES.BAIK;

  return (
    <div className="space-y-6 print:space-y-2">
      {/* Filter bar (hidden on print) */}
      <div className="print:hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "Chivo, sans-serif" }}
          >
            KPI Purchasing
          </h1>
          <p className="text-sm text-slate-500 mt-1">Laporan bulanan Key Performance Indicator Departemen Purchasing.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 p-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tanggal</Label>
            <Input type="date" data-testid="kpi-start" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-none border-slate-300 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tanggal</Label>
            <Input type="date" data-testid="kpi-end" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-none border-slate-300 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Grace Hari (On Time)</Label>
            <Input type="number" min="0" data-testid="kpi-grace" value={grace} onChange={(e) => setGrace(Number(e.target.value) || 0)} className="h-9 w-24 rounded-none border-slate-300 text-sm" />
          </div>
          <Button data-testid="kpi-generate" onClick={load} disabled={loading} className="h-9 rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
            <ChartLineUp size={14} weight="bold" className="mr-1.5" /> {loading ? "Memuat..." : "Hitung Ulang"}
          </Button>
          <Button data-testid="kpi-print" onClick={() => window.print()} variant="outline" className="h-9 rounded-none border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
            <Printer size={14} weight="bold" className="mr-1.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* KPI REPORT — printable */}
      <div className="bg-white border border-slate-200 print:border-none">
        {/* Header */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-200">
          <div className="p-6 flex items-center gap-4">
            <img src="/assets/logo-mks.png" alt="MKS Logo" className="w-16 h-16 object-contain" />
            <div>
              <div className="font-black text-slate-900 text-lg tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>{COMPANY}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mt-0.5">{COMPANY_TAGLINE}</div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-red-700 to-red-500 text-white p-6 flex flex-col items-end justify-center">
            <div className="text-3xl sm:text-4xl font-black tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>KPI PURCHASING</div>
            <div className="mt-2 text-xs sm:text-sm font-semibold">
              PERIODE PELAPORAN : {fmtLongID(startDate)} - {fmtLongID(endDate)}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse text-sm border border-slate-400" data-testid="kpi-table">
            <thead>
              <tr className="bg-blue-50 text-slate-900 text-xs">
                <th className="border border-slate-400 p-2 w-10">No</th>
                <th className="border border-slate-400 p-2 text-left">KPI Departemen</th>
                <th className="border border-slate-400 p-2 w-[260px]">Formula Perhitungan</th>
                <th className="border border-slate-400 p-2 w-20">Target Capaian</th>
                <th className="border border-slate-400 p-2 w-20">Bobot Capaian</th>
                <th className="border border-slate-400 p-2 w-24 bg-emerald-100">Capaian Aktual</th>
                <th className="border border-slate-400 p-2 w-24 bg-blue-200">SKOR KPI</th>
              </tr>
            </thead>
            <tbody>
              {(data?.kpis || []).map((k) => (
                <tr key={k.no} className="align-middle">
                  <td className="border border-slate-400 p-2 text-center tabular-nums">{k.no}</td>
                  <td className="border border-slate-400 p-2">
                    <div className="font-semibold text-slate-900">{k.name}</div>
                    <div className="text-xs italic text-sky-700 mt-1">▶ {k.description}</div>
                  </td>
                  <td className="border border-slate-400 p-2">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-slate-400">(</span>
                      <div className="flex flex-col items-center">
                        <div className="text-xs underline text-slate-900 whitespace-nowrap">{k.formula_num}</div>
                        <div className="text-xs text-slate-900 whitespace-nowrap">{k.formula_den}</div>
                      </div>
                      <span className="text-slate-400">)</span>
                      <span className="text-xs">x 100%</span>
                    </div>
                  </td>
                  <td className="border border-slate-400 p-2 text-center font-semibold">{k.target}</td>
                  <td className="border border-slate-400 p-2 text-center font-semibold tabular-nums">{k.weight}%</td>
                  <td className="border border-slate-400 p-0 text-center">
                    <div className="grid grid-rows-2 h-full">
                      <div className="border-b border-slate-400 tabular-nums py-1 text-sm">{k.numerator}</div>
                      <div className="tabular-nums py-1 text-sm">{k.denominator}</div>
                    </div>
                    <div className="border-t border-slate-400 py-1 font-bold tabular-nums">{k.achievement.toFixed(0)}%</div>
                  </td>
                  <td className="border border-slate-400 p-2 text-center bg-blue-100 font-bold tabular-nums text-lg" style={{ fontFamily: "Chivo, sans-serif" }}>
                    {k.score.toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="border border-slate-400 p-2"></td>
                <td className="border border-slate-400 p-2 text-center font-bold bg-yellow-300 tabular-nums">100%</td>
                <td className="border border-slate-400 p-2"></td>
                <td className="border border-slate-400 p-2 text-center font-black bg-yellow-300 tabular-nums text-lg" data-testid="kpi-total-score" style={{ fontFamily: "Chivo, sans-serif" }}>
                  {data ? data.total_score.toFixed(2) : "0.00"} %
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="border border-slate-400 p-3 align-top">
                  <div className="font-semibold underline mb-1">Kategori Capaian:</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                    <div>≤ 70%</div><div className="text-red-600 font-bold">→ PERLU PERBAIKAN</div>
                    <div>71% - 79%</div><div className="text-amber-600 font-bold">→ CUKUP</div>
                    <div>80% - 89%</div><div className="text-sky-700 font-bold">→ BAIK</div>
                    <div>≥ 90%</div><div className="text-emerald-600 font-bold">→ SANGAT BAIK</div>
                  </div>
                </td>
                <td colSpan={2} className={`border border-slate-400 p-3 text-right font-black text-xl ${catStyle.bg} ${catStyle.text}`} data-testid="kpi-category" style={{ fontFamily: "Chivo, sans-serif" }}>
                  {data?.category || "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Red summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 pt-2">
          <SummaryCard icon={Clock} title="On Time Delivery" achievement={data?.kpis?.[0]?.achievement} score={data?.kpis?.[0]?.score} max={40} />
          <SummaryCard icon={ShieldCheck} title="Compliance Quality" achievement={data?.kpis?.[1]?.achievement} score={data?.kpis?.[1]?.score} max={35} />
          <SummaryCard icon={CheckCircle} title="PO Completion Rate" achievement={data?.kpis?.[2]?.achievement} score={data?.kpis?.[2]?.score} max={25} />
        </div>

        {/* Late PO listing (screen only) */}
        {(data?.late_details?.length || 0) > 0 && (
          <div className="p-4 print:hidden">
            <details className="border border-slate-200 rounded-none">
              <summary className="p-3 bg-slate-50 border-b border-slate-200 cursor-pointer text-xs uppercase tracking-[0.1em] font-bold text-slate-600">
                PO yang terhitung LATE / TIDAK ON TIME ({data.late_details.length})
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                      <th className="text-left p-2">Nomor PO</th>
                      <th className="text-left p-2">Vendor</th>
                      <th className="text-left p-2">Invoice</th>
                      <th className="text-left p-2">Tgl PO</th>
                      <th className="text-left p-2">Tgl Terima</th>
                      <th className="text-left p-2">Contoh Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.late_details.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="p-2 font-mono text-xs">{l.po_no}</td>
                        <td className="p-2">{l.vendor}</td>
                        <td className="p-2 font-mono text-xs">{l.invoice_no || "-"}</td>
                        <td className="p-2">{l.po_date || "-"}</td>
                        <td className="p-2">{l.receive_date || "-"}</td>
                        <td className="p-2 text-slate-600">{l.item_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, achievement, score, max }) {
  return (
    <div className="bg-gradient-to-br from-red-700 to-red-500 text-white p-5 rounded-sm print:rounded-none">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
          <Icon size={22} weight="duotone" />
        </div>
        <div className="font-black text-lg tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>{title}</div>
      </div>
      <div className="mt-3 tabular-nums">
        <div className="text-sm">Realisasi: <span className="font-bold">{achievement != null ? achievement.toFixed(0) : "0"}%</span></div>
        <div className="text-sm">Skor: <span className="font-bold">{score != null ? score.toFixed(2) : "0.00"}/{max}</span></div>
      </div>
    </div>
  );
}
