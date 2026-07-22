import React, { useEffect, useState } from "react";
import api, { formatRupiah } from "../lib/api";
import { Card } from "../components/ui/card";
import {
  Receipt,
  Storefront,
  Package,
  CurrencyDollar,
  TrendUp,
} from "@phosphor-icons/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2, y - 3, y - 4];
})();

const StatCard = ({ label, value, icon: Icon, tone = "sky", testid }) => (
  <Card data-testid={testid} className="rounded-none border-slate-200 shadow-none p-4 flex items-start justify-between bg-white">
    <div>
      <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums" style={{ fontFamily: "Chivo, sans-serif" }}>
        {value}
      </div>
    </div>
    <div className={`p-2 border border-slate-200 text-${tone}-600`}>
      <Icon size={20} weight="duotone" />
    </div>
  </Card>
);

export default function DashboardPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/stats/summary?year=${year}`)
      .then((r) => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [year]);

  const monthlyData =
    stats?.monthly?.map((m) => ({
      month: m.month?.slice(5) || m.month,
      total: m.total,
      count: m.count,
    })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">Ringkasan transaksi pembelian tahun {year}.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">Tahun</span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger data-testid="year-select" className="w-32 rounded-none h-9 border-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          testid="stat-total-amount"
          label="Total Pembelian"
          value={loading ? "..." : formatRupiah(stats?.total_amount || 0)}
          icon={CurrencyDollar}
        />
        <StatCard
          testid="stat-total-transactions"
          label="Jumlah Transaksi"
          value={loading ? "..." : (stats?.total_transactions || 0).toLocaleString("id-ID")}
          icon={Receipt}
        />
        <StatCard
          testid="stat-vendors"
          label="Jumlah Toko"
          value={loading ? "..." : (stats?.unique_vendors || 0).toLocaleString("id-ID")}
          icon={Storefront}
        />
        <StatCard
          testid="stat-items"
          label="Jumlah Barang"
          value={loading ? "..." : (stats?.unique_items || 0).toLocaleString("id-ID")}
          icon={Package}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-none border-slate-200 shadow-none p-5 lg:col-span-2 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Pembelian per Bulan</h3>
              <p className="text-sm text-slate-900 font-semibold mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>
                Tren Bulanan {year}
              </p>
            </div>
            <TrendUp size={20} weight="duotone" className="text-sky-600" />
          </div>
          <div className="h-72" data-testid="chart-monthly">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickFormatter={(v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + "jt" : v >= 1e3 ? (v / 1e3).toFixed(0) + "rb" : v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "1px solid #E2E8F0", fontSize: 12 }}
                  formatter={(v) => formatRupiah(v)}
                />
                <Bar dataKey="total" radius={[0, 0, 0, 0]}>
                  {monthlyData.map((_, i) => (
                    <Cell key={i} fill="#0284C7" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Top Toko / Vendor</h3>
              <p className="text-sm text-slate-900 font-semibold mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>
                Berdasarkan Nilai
              </p>
            </div>
            <Storefront size={20} weight="duotone" className="text-sky-600" />
          </div>
          <ul className="divide-y divide-slate-100" data-testid="top-vendors">
            {(stats?.top_vendors || []).length === 0 && (
              <li className="text-sm text-slate-400 py-4">Belum ada data</li>
            )}
            {(stats?.top_vendors || []).map((v, i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] tabular-nums w-5 text-slate-400">{i + 1}.</span>
                  <span className="text-sm text-slate-900 truncate">{v.vendor}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-slate-900">{formatRupiah(v.total)}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-400">{v.count} trx</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
