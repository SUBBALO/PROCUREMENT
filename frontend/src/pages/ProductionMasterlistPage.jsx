import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import {
  Factory, ListChecks, MicrosoftExcelLogo, ArrowClockwise, CheckCircle,
  WarningCircle, ClipboardText, CalendarBlank, User, Kanban, Clock,
} from "@phosphor-icons/react";

const thisMonth = () => new Date().toISOString().slice(0, 7);

const inputCls =
  "w-full h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500";

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

export default function ProductionMasterlistPage({ embedded = false, refreshSignal = 0, headerActions = null }) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [date, setDate] = useState("");
  const [operator, setOperator] = useState("");
  const [soNo, setSoNo] = useState("");
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ total_ok: 0, total_ng: 0, total_work_hours: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback(() => {
    const p = {};
    if (date) p.date = date;
    else if (month) p.month = month;
    if (operator.trim()) p.operator = operator.trim();
    if (soNo.trim()) p.so_no = soNo.trim();
    return p;
  }, [month, date, operator, soNo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/production/reports/masterlist", { params: buildParams() });
      setItems(data.items || []);
      setTotals({ total_ok: data.total_ok || 0, total_ng: data.total_ng || 0, total_work_hours: data.total_work_hours || 0 });
    } catch (e) {
      setItems([]);
      toast.error(e.response?.data?.detail || "Gagal memuat masterlist");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (refreshSignal) load(); /* reload saat parent minta refresh */ // eslint-disable-next-line
  }, [refreshSignal]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get("/production/reports/masterlist.xlsx", {
        params: buildParams(), responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily_production_report_${date || month || "all"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Excel berhasil diunduh");
    } catch (e) {
      toast.error("Gagal export Excel");
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => { setDate(""); setOperator(""); setSoNo(""); setMonth(thisMonth()); };

  const grouped = useMemo(() => {
    const map = {};
    items.forEach((r) => { (map[r.report_date] = map[r.report_date] || []).push(r); });
    return Object.keys(map).sort((a, b) => (a < b ? 1 : -1)).map((d) => ({ date: d, rows: map[d] }));
  }, [items]);

  return (
    <div className={embedded ? "space-y-4" : "p-4 max-w-[1500px] mx-auto space-y-4"} data-testid="production-masterlist-page">
      {!embedded && <BackLink />}

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {!embedded && (
          <>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
            <Factory size={14} weight="fill" /> Produksi · Masterlist Bulanan
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Masterlist Production Report
          </h1>
          <p className="text-xs text-slate-500 mt-1">Semua baris laporan harian digabung. Filter per bulan / tanggal / operator / SO, lalu export ke Excel.</p>
          </>
          )}
          {embedded && (
            <p className="text-xs text-slate-500">Filter per bulan / tanggal / operator / SO, lalu export ke Excel.</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {headerActions}
          {!embedded && (
          <button onClick={() => navigate("/produksi/daily-report")} data-testid="open-daily-btn"
            className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-700 rounded hover:bg-slate-50 transition-colors">
            <ListChecks size={16} weight="bold" /> Input Harian
          </button>
          )}
          <button onClick={exportExcel} disabled={exporting} data-testid="export-excel-btn"
            className="inline-flex items-center gap-1.5 h-9 px-4 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            <MicrosoftExcelLogo size={16} weight="bold" /> {exporting ? "Menyiapkan…" : "Export Excel"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><CalendarBlank size={13} /> Bulan</label>
          <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDate(""); }} data-testid="filter-month" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><CalendarBlank size={13} /> Tanggal (opsional)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="filter-date" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><User size={13} /> Operator</label>
          <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Cari operator…" data-testid="filter-operator" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><Kanban size={13} /> SO No</label>
          <input value={soNo} onChange={(e) => setSoNo(e.target.value)} placeholder="Cari SO…" data-testid="filter-so" className={inputCls} />
        </div>
        <div className="flex items-end">
          <button onClick={resetFilters} data-testid="reset-filter-btn"
            className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-600 rounded hover:bg-slate-50 transition-colors w-full justify-center">
            <ArrowClockwise size={15} weight="bold" /> Reset
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1"><ClipboardText size={13} /> Total Baris</div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5" data-testid="ml-total-rows">{items.length}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 flex items-center gap-1"><CheckCircle size={13} weight="fill" /> Total Qty OK</div>
          <div className="text-2xl font-bold text-emerald-700 mt-0.5" data-testid="ml-total-ok">{totals.total_ok}</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-rose-700 flex items-center gap-1"><WarningCircle size={13} weight="fill" /> Total Qty NG</div>
          <div className="text-2xl font-bold text-rose-700 mt-0.5" data-testid="ml-total-ng">{totals.total_ng}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700 flex items-center gap-1"><Clock size={13} weight="fill" /> Total Jam Kerja</div>
          <div className="text-2xl font-bold text-amber-700 mt-0.5" data-testid="ml-total-hours">{totals.total_work_hours} <span className="text-sm font-semibold">jam</span></div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="masterlist-table">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-bold">Tanggal</th>
                <th className="px-3 py-2 text-left font-bold">Operator</th>
                <th className="px-3 py-2 text-left font-bold">SO No / Customer</th>
                <th className="px-3 py-2 text-left font-bold">Process</th>
                <th className="px-3 py-2 text-center font-bold bg-emerald-50 text-emerald-700">Qty OK</th>
                <th className="px-3 py-2 text-center font-bold bg-rose-50 text-rose-700">Qty NG</th>
                <th className="px-3 py-2 text-left font-bold">Working Time</th>
                <th className="px-3 py-2 text-center font-bold bg-amber-50 text-amber-700">Jam</th>
                <th className="px-3 py-2 text-left font-bold">Machine No</th>
                <th className="px-3 py-2 text-left font-bold">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400" data-testid="ml-empty">Tidak ada data untuk filter ini.</td></tr>
              ) : (
                grouped.map((g) => (
                  <React.Fragment key={g.date}>
                    {g.rows.map((r, i) => (
                      <tr key={r.id} className="hover:bg-slate-50" data-testid={`ml-row-${g.date}-${i}`}>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(r.report_date)}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{r.operator_name || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-800">{r.so_no || "—"}</div>
                          {r.customer && <div className="text-[11px] text-slate-500">{r.customer}</div>}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.process || "—"}</td>
                        <td className="px-3 py-2 text-center font-bold text-emerald-700 bg-emerald-50/40">{r.qty_ok}</td>
                        <td className="px-3 py-2 text-center font-bold text-rose-700 bg-rose-50/40">{r.qty_ng}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {r.work_start || r.work_end ? `${r.work_start || "?"} – ${r.work_end || "?"}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-amber-700 bg-amber-50/40">{r.work_hours ? `${r.work_hours}` : "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{r.machine_no || "—"}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[240px] truncate" title={r.remarks}>{r.remarks || "—"}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px] text-slate-400">Total: {items.length} baris · {totals.total_work_hours} jam kerja</div>
    </div>
  );
}
