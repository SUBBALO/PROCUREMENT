import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { ChartBar, CalendarBlank, MagnifyingGlass, Clock, CalendarCheck, UsersThree, X } from "@phosphor-icons/react";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const inputCls = "w-full h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500";
const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };

export default function ProductionSoWorkSummaryPage() {
  const [month, setMonth] = useState(thisMonth());
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (month) params.month = month;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/production/so-work-summary", { params });
      setItems(data.items || []);
      setTotalHours(data.total_hours || 0);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [month, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const openDetail = async (so) => {
    setDetailLoading(true); setDetail({ so_no: so.so_no, customer: so.customer });
    try { const { data } = await api.get(`/production/so-work-summary/${encodeURIComponent(so.so_no)}`); setDetail(data); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat detail"); setDetail(null); }
    finally { setDetailLoading(false); }
  };

  return (
    <div className="p-4 max-w-[1300px] mx-auto space-y-4" data-testid="so-work-summary-page">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1"><ChartBar size={14} weight="fill" /> Produksi · Ringkasan Kerja</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Ringkasan Kerja SO</h1>
          <p className="text-xs text-slate-500 mt-1">Untuk tiap SO: berapa hari dikerjakan, siapa saja operatornya, dan total jam kerja. Klik baris untuk rincian per tanggal.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-slate-500" /><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="sws-month" className="text-sm outline-none bg-transparent" /></div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><MagnifyingGlass size={16} weight="bold" className="text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SO…" data-testid="sws-search" className="text-sm outline-none bg-transparent" /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Jumlah SO</div><div className="text-2xl font-bold text-slate-900 mt-0.5" data-testid="sws-count">{items.length}</div></div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><div className="text-[10px] uppercase tracking-wider font-bold text-amber-700 flex items-center gap-1"><Clock size={13} weight="fill" /> Total Jam Kerja</div><div className="text-2xl font-bold text-amber-700 mt-0.5" data-testid="sws-total-hours">{totalHours} <span className="text-sm font-semibold">jam</span></div></div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="sws-table">
            <thead><tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-bold">SO No</th>
              <th className="px-3 py-2 text-left font-bold">Customer</th>
              <th className="px-3 py-2 text-left font-bold">Periode Kerja</th>
              <th className="px-3 py-2 text-center font-bold">Total Hari</th>
              <th className="px-3 py-2 text-center font-bold text-amber-700">Total Jam</th>
              <th className="px-3 py-2 text-left font-bold">Operator</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
                : items.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400" data-testid="sws-empty">Belum ada laporan produksi ber-SO pada periode ini.</td></tr>
                : items.map((s) => (
                  <tr key={s.so_no} onClick={() => openDetail(s)} className="hover:bg-amber-50/50 cursor-pointer" data-testid={`sws-row-${s.so_no}`}>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900">{s.so_no}</td>
                    <td className="px-3 py-2 text-slate-700">{s.customer || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(s.first_date)} – {fmtDate(s.last_date)}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-800">{s.total_days} hari</td>
                    <td className="px-3 py-2 text-center font-bold text-amber-700">{s.total_hours} jam</td>
                    <td className="px-3 py-2 text-slate-600">
                      <span className="font-semibold">{s.operators_count} org</span>
                      <span className="text-[11px] text-slate-400"> · {(s.operators || []).slice(0, 3).join(", ")}{(s.operators || []).length > 3 ? "…" : ""}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail popup */}
      {detail && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-8 bg-slate-900/50 backdrop-blur-sm" data-testid="sws-detail-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><ChartBar size={18} weight="bold" className="text-amber-600" /> Ringkasan Kerja · SO {detail.so_no}</h2>
                <p className="text-[11px] text-slate-500">{detail.customer || ""}</p>
              </div>
              <button onClick={() => setDetail(null)} data-testid="sws-detail-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X size={18} weight="bold" /></button>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-4">
              {detailLoading ? <div className="py-8 text-center text-slate-400">Memuat…</div> : (
                <>
                  {/* Ringkasan angka besar */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-amber-700 flex items-center gap-1"><CalendarCheck size={13} weight="fill" /> Total Hari</div><div className="text-2xl font-bold text-amber-700 mt-0.5" data-testid="sws-d-days">{detail.total_days} hari</div></div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-amber-700 flex items-center gap-1"><Clock size={13} weight="fill" /> Total Jam</div><div className="text-2xl font-bold text-amber-700 mt-0.5" data-testid="sws-d-hours">{detail.total_hours} jam</div></div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><UsersThree size={13} weight="fill" /> Operator</div><div className="text-2xl font-bold text-slate-800 mt-0.5">{(detail.by_operator || []).length} org</div></div>
                  </div>
                  <p className="text-xs text-slate-500">Periode: <b>{fmtDate(detail.first_date)}</b> s/d <b>{fmtDate(detail.last_date)}</b></p>

                  {/* Rekap per operator */}
                  <div>
                    <div className="text-[11px] font-bold text-slate-600 uppercase mb-1">Rekap per Operator</div>
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-100 text-[10px] uppercase text-slate-500"><th className="px-2 py-1 text-left">Operator</th><th className="px-2 py-1 text-center w-24">Hari</th><th className="px-2 py-1 text-center w-24">Jam</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {(detail.by_operator || []).map((o) => (
                            <tr key={o.name}><td className="px-2 py-1 font-semibold text-slate-800">{o.name}</td><td className="px-2 py-1 text-center">{o.days}</td><td className="px-2 py-1 text-center font-bold text-amber-700">{o.hours}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Rincian per tanggal */}
                  <div>
                    <div className="text-[11px] font-bold text-slate-600 uppercase mb-1">Rincian per Tanggal</div>
                    <div className="space-y-2">
                      {(detail.by_date || []).map((d) => (
                        <div key={d.date} className="border border-slate-200 rounded-lg overflow-hidden" data-testid={`sws-d-date-${d.date}`}>
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50">
                            <span className="text-xs font-bold text-slate-700">{fmtDate(d.date)} <span className="text-slate-400 font-normal">· {(d.operators || []).length} operator</span></span>
                            <span className="text-xs font-bold text-amber-700">{d.hours} jam</span>
                          </div>
                          <table className="w-full text-xs">
                            <thead><tr className="text-[9px] uppercase text-slate-400"><th className="px-2 py-1 text-left">Operator</th><th className="px-2 py-1 text-left">Process</th><th className="px-2 py-1 text-center">Jam Kerja</th><th className="px-2 py-1 text-center">Jam</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {d.rows.map((r, ix) => (
                                <tr key={ix}>
                                  <td className="px-2 py-1 font-semibold text-slate-700">{r.operator_name || "—"}</td>
                                  <td className="px-2 py-1 text-slate-600">{r.process || "—"}</td>
                                  <td className="px-2 py-1 text-center text-slate-500">{r.work_start || "?"}–{r.work_end || "?"}</td>
                                  <td className="px-2 py-1 text-center font-bold text-amber-700">{r.work_hours}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                      {(detail.by_date || []).length === 0 && <p className="text-xs text-slate-400">Belum ada rincian.</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
