import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api, { downloadXlsx } from "../lib/api";
import { Gauge, CheckCircle, Spinner, ClipboardText, ArrowClockwise, CalendarBlank, X, CircleDashed, WarningCircle, Clock, MagnifyingGlass, DownloadSimple, Warning } from "@phosphor-icons/react";

const HEALTH = {
  finished: { label: "Selesai", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", row: "bg-emerald-50/40" },
  late: { label: "Terlambat", badge: "bg-rose-100 text-rose-700 border-rose-300", row: "bg-rose-50/60" },
  warning: { label: "Warning", badge: "bg-amber-100 text-amber-700 border-amber-300", row: "bg-amber-50/50" },
  on_track: { label: "On Track", badge: "bg-sky-100 text-sky-700 border-sky-200", row: "hover:bg-slate-50" },
};

const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const fmtDay = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "short" }); } catch { return d; } };
const todayISO = () => new Date().toISOString().slice(0, 10);
const enumerateDates = (start, end) => {
  const out = [];
  if (!start) return out;
  const s = new Date(start + "T00:00:00");
  const e = new Date((end || todayISO()) + "T00:00:00");
  if (isNaN(s) || isNaN(e) || e < s) return out;
  let guard = 0;
  while (s <= e && guard < 500) { out.push(s.toISOString().slice(0, 10)); s.setDate(s.getDate() + 1); guard++; }
  return out;
};
const editCls = "w-full h-8 px-1.5 text-xs bg-transparent outline-none focus:bg-amber-50 focus:ring-1 focus:ring-amber-400 rounded-sm";

export default function ProductionJobProgressPage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ count: 0, finished: 0, in_progress: 0, late: 0, warning: 0, avg_productivity: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const dirtyRef = useRef({});
  const [detail, setDetail] = useState(null);       // row yang sedang dilihat detailnya
  const [detailRows, setDetailRows] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/production/job-progress");
      setItems(data.items || []);
      setStats({ count: data.count || 0, finished: data.finished || 0, in_progress: data.in_progress || 0, late: data.late || 0, warning: data.warning || 0, avg_productivity: data.avg_productivity || 0 });
    } catch (e) {
      setItems([]);
      toast.error(e.response?.data?.detail || "Gagal memuat Job Progress");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportXlsx = async () => {
    try { await downloadXlsx("/production/job-progress/export.xlsx", {}, `job_progress_${todayISO()}.xlsx`); toast.success("Board diexport"); }
    catch (e) { toast.error(e.message || "Gagal export"); }
  };

  const filtered = items.filter((r) => {
    if (statusFilter !== "all" && r.health !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (q && !(`${r.so_no} ${r.customer} ${r.description}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const setField = (soId, field, value) => {
    setItems((prev) => prev.map((r) => (r.so_id === soId ? { ...r, [field]: value } : r)));
    dirtyRef.current[soId] = true;
  };

  const saveRow = async (soId) => {
    if (!dirtyRef.current[soId]) return;
    const row = items.find((r) => r.so_id === soId);
    if (!row) return;
    try {
      await api.put(`/production/job-progress/${soId}`, {
        pic: row.pic || "", remarks: row.remarks || "",
      });
      dirtyRef.current[soId] = false;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan");
    }
  };

  const StatCard = ({ testid, icon: Icon, label, value, cls }) => (
    <div className={`rounded-lg p-3 border ${cls}`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1"><Icon size={13} weight="fill" /> {label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  );

  const pctColor = (p) => (p >= 100 ? "bg-emerald-500" : p >= 50 ? "bg-amber-500" : "bg-rose-500");

  const openDetail = async (row) => {
    setDetail(row); setDetailLoading(true); setDetailRows([]);
    try {
      const { data } = await api.get("/production/reports/masterlist", { params: { so_no: row.so_no } });
      setDetailRows((data.items || []).filter((r) => r.so_no === row.so_no));
    } catch { setDetailRows([]); }
    finally { setDetailLoading(false); }
  };

  const detailModel = () => {
    if (!detail) return null;
    const end = detail.finished && detail.finished_at ? detail.finished_at : todayISO();
    const range = enumerateDates(detail.date_received, end);
    const byDate = {};
    detailRows.forEach((r) => { (byDate[r.report_date] = byDate[r.report_date] || []).push(r); });
    const workedSet = new Set(Object.keys(byDate));
    const worked = range.filter((d) => workedSet.has(d)).length;
    return { range, byDate, workedSet, worked, idle: range.length - worked };
  };

  return (
    <div className="p-4 max-w-[1700px] mx-auto space-y-4" data-testid="job-progress-page">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
            <Gauge size={14} weight="fill" /> Produksi · Daily Monitoring
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Daily Monitoring Job Progress</h1>
          <p className="text-xs text-slate-500 mt-1">Semua SO yang sudah <b>Mulai Kerja</b>. Due Date otomatis dari SO · Plan Start = tgl mulai kerja · Plan Finish & Qty Finished otomatis dari Release Note (selesai saat qty rilis = SO Qty). Hanya PIC & Remarks yang diisi manual.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><MagnifyingGlass size={15} weight="bold" className="text-slate-500" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari SO / customer…" data-testid="jp-search" className="text-sm outline-none bg-transparent w-40" /></div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="jp-status-filter" className="h-9 px-2 text-sm border border-slate-300 rounded bg-white font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400">
            <option value="all">Semua Status</option>
            <option value="on_track">On Track</option>
            <option value="warning">Warning</option>
            <option value="late">Terlambat</option>
            <option value="finished">Selesai</option>
          </select>
          <button onClick={exportXlsx} data-testid="jp-export-btn" className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-700 rounded hover:bg-slate-50 transition-colors"><DownloadSimple size={15} weight="bold" /> Export</button>
          <button onClick={load} data-testid="refresh-btn" className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-700 rounded hover:bg-slate-50 transition-colors"><ArrowClockwise size={15} weight="bold" /> Refresh</button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex flex-wrap lg:flex-col gap-2.5 lg:w-44 shrink-0" data-testid="jp-kpi-sidebar">
          <div className="flex-1 lg:flex-none min-w-[140px]"><StatCard testid="stat-total" icon={ClipboardText} label="Total Job Aktif" value={stats.count} cls="bg-white border-slate-200 text-slate-800" /></div>
          <div className="flex-1 lg:flex-none min-w-[140px]"><StatCard testid="stat-progress" icon={Spinner} label="Sedang Proses" value={stats.in_progress} cls="bg-sky-50 border-sky-200 text-sky-700" /></div>
          <div className="flex-1 lg:flex-none min-w-[140px]"><StatCard testid="stat-warning" icon={Warning} label="Warning" value={stats.warning} cls="bg-amber-50 border-amber-200 text-amber-700" /></div>
          <div className="flex-1 lg:flex-none min-w-[140px]"><StatCard testid="stat-late" icon={WarningCircle} label="Terlambat" value={stats.late} cls="bg-rose-50 border-rose-200 text-rose-700" /></div>
          <div className="flex-1 lg:flex-none min-w-[140px]"><StatCard testid="stat-finished" icon={CheckCircle} label="Selesai" value={stats.finished} cls="bg-emerald-50 border-emerald-200 text-emerald-700" /></div>
          <div className="flex-1 lg:flex-none min-w-[140px]"><StatCard testid="stat-avg-prod" icon={Gauge} label="Avg Produktivitas" value={`${stats.avg_productivity}%`} cls="bg-violet-50 border-violet-200 text-violet-700" /></div>
        </div>

        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" data-testid="job-progress-table">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-24">Status</th>
                <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[120px]">Customer</th>
                <th className="px-2 py-2 text-left font-bold border border-slate-200 w-20">SO No</th>
                <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[180px]">Job Description</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-16">SO Qty</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-24">Date Received</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-28">Due Date</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-20" title="Sisa hari kerja (exclude Minggu/libur) s/d Due Date">Sisa Hari</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-28">Plan Start</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-28">Plan Finish</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-14">Days</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-20" title="Hari kerja target (exclude Minggu) dari mulai kerja s/d Due Date">Working Date Target</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-20" title="Jumlah hari SO benar-benar dikerjakan (dari Daily Production Report)">Actual Working Day</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 w-20" title="Working Date Target ÷ Actual Working Day">Productivity</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-emerald-50 text-emerald-700 w-16">Qty Finish</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-rose-50 text-rose-700 w-16">Balance</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 min-w-[130px]">Job Progress %</th>
                <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[110px]">PIC</th>
                <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[140px]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={19} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={19} className="px-3 py-10 text-center text-slate-400" data-testid="jp-empty">
                  {items.length === 0 ? (<>Belum ada SO yang dikerjakan. Tekan <b className="text-blue-600">Mulai Kerja</b> pada menu <b>SO Masuk</b> agar muncul di sini.</>) : "Tidak ada SO yang cocok dengan filter."}
                </td></tr>
              ) : (
                filtered.map((r, i) => {
                  const h = HEALTH[r.health] || HEALTH.on_track;
                  return (
                  <tr key={r.so_id} className={h.row} data-testid={`jp-row-${r.so_no}`}>
                    <td className="border border-slate-200 px-2 py-1 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase ${h.badge}`} data-testid={`jp-status-${r.so_no}`}>{h.label}</span>
                    </td>
                    <td className="border border-slate-200 px-2 py-1 text-slate-800">{r.customer || "—"}</td>
                    <td className="border border-slate-200 px-2 py-1 font-mono font-bold">
                      <button onClick={() => openDetail(r)} data-testid={`jp-detail-${r.so_no}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline" title="Lihat detail hari kerja">
                        {r.so_no}
                      </button>
                    </td>
                    <td className="border border-slate-200 px-2 py-1 text-slate-600">{r.description || "—"}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-slate-900">{r.so_qty}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center text-slate-600 whitespace-nowrap">{fmtDate(r.date_received)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center text-slate-600 whitespace-nowrap" data-testid={`jp-due-${r.so_no}`}>{fmtDate(r.due_date)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center whitespace-nowrap" data-testid={`jp-remain-${r.so_no}`}>
                      {r.finished ? <span className="text-emerald-600 font-bold">selesai</span>
                        : r.health === "late" ? <span className="text-rose-600 font-bold">telat {r.overdue_days}h</span>
                        : r.days_remaining == null ? <span className="text-slate-300">—</span>
                        : <span className={`font-bold ${r.days_remaining <= 3 ? "text-amber-600" : "text-slate-600"}`}>{r.days_remaining} hari</span>}
                    </td>
                    <td className="border border-slate-200 px-2 py-1 text-center text-slate-600 whitespace-nowrap" data-testid={`jp-plan-start-${r.so_no}`}>{fmtDate(r.plan_start)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center text-slate-600 whitespace-nowrap" data-testid={`jp-plan-finish-${r.so_no}`}>{r.plan_finish ? fmtDate(r.plan_finish) : "—"}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-slate-700">{r.days}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600" data-testid={`jp-wdt-${r.so_no}`}>{r.working_date_target}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-blue-700" data-testid={`jp-awd-${r.so_no}`} title={(r.actual_working_dates || []).join(", ")}>{r.actual_working_days}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-violet-700" data-testid={`jp-prod-${r.so_no}`}>{r.productivity}%</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-emerald-700 bg-emerald-50/40">{r.qty_finished}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center font-bold text-rose-700 bg-rose-50/40">{r.qty_balance}</td>
                    <td className="border border-slate-200 px-2 py-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${pctColor(r.percent)}`} style={{ width: `${Math.min(100, r.percent)}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 w-10 text-right" data-testid={`jp-pct-${r.so_no}`}>{r.percent}%</span>
                      </div>
                      {r.finished && <span className="text-[9px] font-bold uppercase text-emerald-600">Finished {r.finished_at ? `· ${fmtDate(r.finished_at)}` : ""}</span>}
                    </td>
                    <td className="border border-slate-200 p-0">
                      <input value={r.pic || ""} onChange={(e) => setField(r.so_id, "pic", e.target.value)} onBlur={() => saveRow(r.so_id)} data-testid={`jp-pic-${r.so_no}`} placeholder="PIC…" className={editCls} />
                    </td>
                    <td className="border border-slate-200 p-0">
                      <input value={r.remarks || ""} onChange={(e) => setField(r.so_id, "remarks", e.target.value)} onBlur={() => saveRow(r.so_id)} data-testid={`jp-remarks-${r.so_no}`} placeholder="Catatan…" className={editCls} />
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* Detail hari kerja per SO */}
      {detail && (() => {
        const m = detailModel();
        return (
          <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-10 bg-slate-900/50 backdrop-blur-sm" data-testid="jp-detail-modal">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CalendarBlank size={18} weight="bold" className="text-blue-600" /> Detail Hari Kerja · SO {detail.so_no}
                  </h2>
                  <p className="text-[11px] text-slate-500">{detail.customer} · {detail.description} · {fmtDate(detail.date_received)} → {detail.finished && detail.finished_at ? fmtDate(detail.finished_at) : "hari ini"}</p>
                </div>
                <button onClick={() => setDetail(null)} data-testid="jp-detail-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><X size={18} weight="bold" /></button>
              </div>

              <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-100 shrink-0">
                <div className="text-center"><div className="text-[10px] font-bold text-slate-500 uppercase">Rentang</div><div className="text-lg font-bold text-slate-800">{m.range.length} hari</div></div>
                <div className="text-center"><div className="text-[10px] font-bold text-emerald-600 uppercase">Dikerjakan</div><div className="text-lg font-bold text-emerald-700" data-testid="jp-detail-worked">{m.worked} hari</div></div>
                <div className="text-center"><div className="text-[10px] font-bold text-slate-400 uppercase">Tidak Dikerjakan</div><div className="text-lg font-bold text-slate-500" data-testid="jp-detail-idle">{m.idle} hari</div></div>
              </div>

              <div className="px-5 py-3 overflow-y-auto space-y-1">
                {detailLoading ? (
                  <div className="py-8 text-center text-slate-400">Memuat…</div>
                ) : m.range.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">Belum ada Date Received untuk SO ini.</div>
                ) : (
                  m.range.map((d) => {
                    const worked = m.workedSet.has(d);
                    const entries = m.byDate[d] || [];
                    return (
                      <div key={d} className={`flex items-start gap-3 rounded-md px-3 py-2 border ${worked ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`} data-testid={`jp-detail-day-${d}`}>
                        <div className="w-40 shrink-0">
                          <div className="text-xs font-bold text-slate-700">{fmtDay(d)}</div>
                          {worked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle size={11} weight="fill" /> Dikerjakan</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><CircleDashed size={11} weight="bold" /> Tidak dikerjakan</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {entries.map((e) => (
                            <div key={e.id} className="text-[11px] text-slate-600 truncate">
                              <b className="text-slate-800">{e.operator_name || "—"}</b>
                              {e.process ? ` · ${e.process}` : ""}
                              {` · OK ${e.qty_ok} / NG ${e.qty_ng}`}
                              {e.work_start || e.work_end ? ` · ${e.work_start || "?"}–${e.work_end || "?"}` : ""}
                              {e.machine_no ? ` · ${e.machine_no}` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
