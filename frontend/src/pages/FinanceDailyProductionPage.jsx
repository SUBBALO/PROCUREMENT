import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Coins, CurrencyDollar, ClockCounterClockwise, Table as TableIcon, UsersThree,
  FloppyDisk, CalendarBlank, User, Kanban, ArrowClockwise, Lock, WarningCircle, MicrosoftExcelLogo,
} from "@phosphor-icons/react";

const FIN_ROLES = ["finance", "admin", "super_admin"];

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};
const rp = (v) => "Rp " + Number(v || 0).toLocaleString("id-ID");

export default function FinanceDailyProductionPage() {
  const { user } = useAuth();
  const allowed = FIN_ROLES.includes(user?.role);
  const [tab, setTab] = useState("daily");

  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-md" data-testid="finance-access-denied">
          <Lock size={40} weight="bold" className="mx-auto text-rose-500 mb-3" />
          <h1 className="text-lg font-bold text-slate-800">Akses Ditolak</h1>
          <p className="text-sm text-slate-500 mt-1">Halaman ini beserta data <b>rate karyawan</b> hanya untuk Finance &amp; Admin.</p>
          <div className="mt-4"><BackLink /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-5">
        <BackLink />
        <div className="flex items-start gap-3 mt-2 mb-4">
          <div className="w-11 h-11 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <Coins size={22} weight="fill" className="text-white" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-emerald-600 font-bold">Finance</div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">Daily Production Report — Biaya Tenaga Kerja</h1>
            <p className="text-sm text-slate-500">Salinan laporan produksi harian + biaya (rate/jam × jam kerja). Kelola rate karyawan di tab Master Rate.</p>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
          <TabBtn active={tab === "daily"} onClick={() => setTab("daily")} icon={TableIcon} label="Laporan Harian + Biaya" testid="tab-daily" />
          <TabBtn active={tab === "rate"} onClick={() => setTab("rate")} icon={UsersThree} label="Master Rate Karyawan" testid="tab-rate" />
        </div>

        {tab === "daily" ? <DailyPanel /> : <RatePanel />}
      </div>
    </div>
  );
}

const TabBtn = ({ active, onClick, icon: Icon, label, testid }) => (
  <button onClick={onClick} data-testid={testid}
    className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${active ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
    <Icon size={16} weight="bold" /> {label}
  </button>
);

/* ------------------------------------------------------------------ */
/* Tab 1: Laporan Harian + Biaya                                       */
/* ------------------------------------------------------------------ */
function DailyPanel() {
  const [month, setMonth] = useState(thisMonth());
  const [date, setDate] = useState("");
  const [operator, setOperator] = useState("");
  const [soNo, setSoNo] = useState("");
  const [data, setData] = useState({ items: [], total_hours: 0, total_cost: 0, summary_operator: [], summary_date: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (date) params.date = date; else if (month) params.month = month;
      if (operator) params.operator = operator;
      if (soNo) params.so_no = soNo;
      const { data } = await api.get("/finance/daily-production", { params });
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat data");
    } finally { setLoading(false); }
  }, [month, date, operator, soNo]);

  useEffect(() => { load(); }, [load]);

  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = {};
      if (date) params.date = date; else if (month) params.month = month;
      if (operator) params.operator = operator;
      if (soNo) params.so_no = soNo;
      const res = await api.get("/finance/daily-production/export.xlsx", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `biaya_tenaga_kerja_${date || month || "semua"}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal export Excel");
    } finally { setExporting(false); }
  };

  const inputCls = "h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400";

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={CurrencyDollar} label="Total Biaya Tenaga Kerja" value={rp(data.total_cost)} accent="emerald" testid="stat-total-cost" />
        <StatCard icon={ClockCounterClockwise} label="Total Jam Kerja" value={`${data.total_hours} jam`} accent="sky" testid="stat-total-hours" />
        <StatCard icon={TableIcon} label="Jumlah Baris" value={data.count || 0} accent="slate" testid="stat-total-rows" />
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col"><label className="text-[11px] font-bold text-slate-500 mb-0.5 flex items-center gap-1"><CalendarBlank size={12} /> Bulan</label><input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDate(""); }} className={inputCls} data-testid="filter-month" /></div>
        <div className="flex flex-col"><label className="text-[11px] font-bold text-slate-500 mb-0.5">Tanggal (override)</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} data-testid="filter-date" /></div>
        <div className="flex flex-col"><label className="text-[11px] font-bold text-slate-500 mb-0.5 flex items-center gap-1"><User size={12} /> Operator</label><input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="nama…" className={inputCls} data-testid="filter-operator" /></div>
        <div className="flex flex-col"><label className="text-[11px] font-bold text-slate-500 mb-0.5 flex items-center gap-1"><Kanban size={12} /> SO No</label><input value={soNo} onChange={(e) => setSoNo(e.target.value)} placeholder="SO…" className={inputCls} data-testid="filter-so" /></div>
        <button onClick={() => { setDate(""); setOperator(""); setSoNo(""); setMonth(thisMonth()); }} className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-600 rounded hover:bg-slate-50"><ArrowClockwise size={15} weight="bold" /> Reset</button>
        <div className="flex-1" />
        <button onClick={exportExcel} disabled={exporting || loading} data-testid="finance-export-btn"
          className="inline-flex items-center gap-1.5 h-9 px-4 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 disabled:opacity-60">
          <MicrosoftExcelLogo size={16} weight="bold" /> {exporting ? "Menyiapkan…" : "Export Excel"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Tanggal</th>
                <th className="px-3 py-2 text-left font-bold">Operator</th>
                <th className="px-3 py-2 text-left font-bold">SO</th>
                <th className="px-3 py-2 text-left font-bold">Customer</th>
                <th className="px-3 py-2 text-left font-bold">Process</th>
                <th className="px-3 py-2 text-center font-bold">Jam (Mulai–Selesai)</th>
                <th className="px-3 py-2 text-right font-bold">Total Jam Kerja</th>
                <th className="px-3 py-2 text-right font-bold">Rate/Jam</th>
                <th className="px-3 py-2 text-right font-bold">Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400" data-testid="daily-empty">Tidak ada data untuk filter ini.</td></tr>
              ) : data.items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50" data-testid={`fin-row-${r.id}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.report_date)}</td>
                  <td className="px-3 py-2 font-semibold text-slate-700">{r.operator_name || "—"}</td>
                  <td className="px-3 py-2 font-mono">{r.so_no || "—"}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate" title={r.customer}>{r.customer || "—"}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate" title={r.process}>{r.process || "—"}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap font-mono text-slate-600">{(r.work_start || "—") + " – " + (r.work_end || "—")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-sky-700">{r.work_hours} jam</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.rate_per_hour ? rp(r.rate_per_hour) : <span className="text-amber-500" title="Rate belum diisi">belum diisi</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{rp(r.cost)}</td>
                </tr>
              ))}
            </tbody>
            {!loading && data.items.length > 0 && (
              <tfoot>
                <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold text-slate-800">
                  <td className="px-3 py-2" colSpan={6}>TOTAL</td>
                  <td className="px-3 py-2 text-right tabular-nums text-sky-700">{data.total_hours} jam</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700" data-testid="daily-total-cost">{rp(data.total_cost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Ringkasan per operator */}
      {data.summary_operator?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><UsersThree size={13} /> Ringkasan per Operator</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.summary_operator.map((s) => (
              <div key={s.name} className="flex items-center justify-between border border-slate-100 rounded px-3 py-2 bg-slate-50" data-testid={`sum-op-${s.name}`}>
                <div className="min-w-0"><div className="font-bold text-slate-700 truncate">{s.name}</div><div className="text-[11px] text-slate-400">{s.total_hours} jam · {s.rows} baris</div></div>
                <div className="text-sm font-bold text-emerald-700 shrink-0">{rp(s.total_cost)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, accent, testid }) => {
  const map = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={`border rounded-lg p-4 flex items-center gap-3 ${map[accent]}`} data-testid={testid}>
      <Icon size={26} weight="bold" className="opacity-80" />
      <div><div className="text-[11px] uppercase tracking-wider font-bold opacity-70">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Tab 2: Master Rate Karyawan                                         */
/* ------------------------------------------------------------------ */
function RatePanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/finance/employee-rates");
      setRows(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat rate");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRate = (id, v) => setRows((prev) => prev.map((r) => (r.employee_id === id ? { ...r, rate_per_hour: v } : r)));

  const save = async (row) => {
    setSavingId(row.employee_id);
    try {
      await api.put(`/finance/employee-rates/${row.employee_id}`, { rate_per_hour: Number(row.rate_per_hour) || 0 });
      toast.success(`Rate ${row.name} disimpan`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan rate");
    } finally { setSavingId(null); }
  };

  const filtered = useMemo(
    () => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || (r.designation || "").toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const inputCls = "h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-800">
        <WarningCircle size={16} weight="fill" className="text-amber-500 mt-0.5 shrink-0" />
        <div>Rate ini <b>hanya terlihat oleh Finance &amp; Admin</b>. Operator/Produksi tidak dapat melihatnya. Rate dihitung <b>per jam</b>.</div>
      </div>

      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / jabatan…" className={`${inputCls} flex-1 max-w-xs`} data-testid="rate-search" />
        <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-600 rounded hover:bg-slate-50"><ArrowClockwise size={15} weight="bold" /> Muat Ulang</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-bold">Nama Karyawan</th>
              <th className="px-3 py-2 text-left font-bold">Jabatan</th>
              <th className="px-3 py-2 text-right font-bold w-48">Rate / Jam (Rp)</th>
              <th className="px-3 py-2 text-left font-bold w-40">Terakhir Diubah</th>
              <th className="px-3 py-2 text-center font-bold w-28">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400" data-testid="rate-empty">Belum ada karyawan. Tambahkan dulu di menu Absensi Produksi → Daftar Karyawan.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.employee_id} className="hover:bg-slate-50" data-testid={`rate-row-${r.employee_id}`}>
                <td className="px-3 py-2 font-semibold text-slate-700">{r.name}</td>
                <td className="px-3 py-2 text-slate-500">{r.designation || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <input type="number" min="0" step="1000" value={r.rate_per_hour}
                    onChange={(e) => setRate(r.employee_id, e.target.value)}
                    className={`${inputCls} w-40 text-right`} data-testid={`rate-input-${r.employee_id}`} />
                </td>
                <td className="px-3 py-2 text-[11px] text-slate-400">{r.updated_at ? `${fmtDate(r.updated_at)}${r.updated_by ? " · " + r.updated_by : ""}` : "—"}</td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => save(r)} disabled={savingId === r.employee_id}
                    className="inline-flex items-center gap-1 h-8 px-3 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-700 disabled:opacity-60"
                    data-testid={`rate-save-${r.employee_id}`}>
                    <FloppyDisk size={14} weight="bold" /> {savingId === r.employee_id ? "…" : "Simpan"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
