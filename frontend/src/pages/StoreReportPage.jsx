import React, { useEffect, useState, useCallback } from "react";
import api, { formatRupiah, formatDateID } from "../lib/api";
import { useAuth, canSeeStorePrices } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Download, FunnelSimple, ChartLineUp, CalendarBlank, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import BackLink from "../components/BackLink";
const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

// -------- Date preset helpers (WIB local ISO date) --------
const isoDate = (d) => {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
};
const DATE_PRESETS = [
  {
    key: "today", label: "Hari Ini",
    range: () => { const t = new Date(); return { start_date: isoDate(t), end_date: isoDate(t) }; },
  },
  {
    key: "this_week", label: "Minggu Ini",
    range: () => {
      const t = new Date();
      const day = t.getDay() || 7; // 1..7 (Mon..Sun)
      const start = new Date(t); start.setDate(t.getDate() - day + 1);
      return { start_date: isoDate(start), end_date: isoDate(t) };
    },
  },
  {
    key: "this_month", label: "Bulan Ini",
    range: () => {
      const t = new Date();
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      return { start_date: isoDate(start), end_date: isoDate(t) };
    },
  },
  {
    key: "last_month", label: "Bulan Lalu",
    range: () => {
      const t = new Date();
      const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const end = new Date(t.getFullYear(), t.getMonth(), 0);
      return { start_date: isoDate(start), end_date: isoDate(end) };
    },
  },
  {
    key: "this_year", label: "Tahun Ini",
    range: () => {
      const t = new Date();
      const start = new Date(t.getFullYear(), 0, 1);
      return { start_date: isoDate(start), end_date: isoDate(t) };
    },
  },
];

export default function StoreReportPage() {
  const { user } = useAuth();
  const canSeePrice = canSeeStorePrices(user);

  const [tab, setTab] = useState("out"); // 'out' | 'in'
  const [filters, setFilters] = useState({ q: "", so_number: "", taker: "", start_date: "", end_date: "" });
  const [data, setData] = useState({ items: [], total: 0 });
  const [inData, setInData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: 50 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      if (tab === "out") {
        const { data } = await api.get("/store/issuances", { params });
        setData(data);
      } else {
        // Stock IN — only receipts with add_to_stock=true (Accounting requirement)
        const inParams = { page: p, page_size: 50, add_to_stock: true };
        if (filters.q) inParams.q = filters.q;
        if (filters.start_date) inParams.start_date = filters.start_date;
        if (filters.end_date) inParams.end_date = filters.end_date;
        const { data } = await api.get("/store/incoming-report", { params: inParams });
        setInData(data);
      }
      setPage(p);
    } catch { toast.error("Gagal memuat laporan"); }
    finally { setLoading(false); }
  }, [filters, tab]);

  useEffect(() => { load(1); }, [load]);

  const onExport = async () => {
    try {
      const res = await api.get("/store/report/combined-xlsx", {
        params: { start_date: filters.start_date || undefined, end_date: filters.end_date || undefined },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      const sd = filters.start_date || "awal";
      const ed = filters.end_date || new Date().toISOString().slice(0, 10);
      a.download = `stok_gabungan_${sd}_sd_${ed}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Laporan Gabungan (Stok Masuk + Keluar) siap diunduh");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal export");
    }
  };

  const activeData = tab === "out" ? data : inData;
  const totalPages = Math.max(1, Math.ceil(activeData.total / 50));

  return (
    <div className="space-y-6">
            <BackLink />
<div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Costing Store
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {tab === "out" ? (
              <>Total <span className="tabular-nums font-semibold text-slate-900">{data.total.toLocaleString("id-ID")}</span> transaksi pengeluaran{" "}
              {canSeePrice && <span className="text-emerald-700">· harga FIFO ditampilkan</span>}</>
            ) : (
              <>Total <span className="tabular-nums font-semibold text-slate-900">{inData.total.toLocaleString("id-ID")}</span> baris barang masuk stok (add_to_stock=true)</>
            )}
          </p>
        </div>
        <Button data-testid="export-store-btn" onClick={onExport} className="rounded-none h-9 bg-emerald-700 hover:bg-emerald-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
          <Download size={14} weight="bold" className="mr-1.5" /> Export Gabungan (Masuk + Keluar) Excel
          {(filters.start_date || filters.end_date) && (
            <span className="ml-2 px-1.5 py-0.5 bg-emerald-900/60 text-[10px] tabular-nums normal-case tracking-normal font-medium rounded-none border border-emerald-500/40">
              {filters.start_date || "awal"} → {filters.end_date || "hari ini"}
            </span>
          )}
        </Button>
      </div>

      {/* Date Preset Shortcuts */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center gap-1.5">
          <CalendarBlank size={12} weight="bold" /> Periode Cepat:
        </span>
        {DATE_PRESETS.map((p) => {
          const r = p.range();
          const active = filters.start_date === r.start_date && filters.end_date === r.end_date;
          return (
            <button
              key={p.key}
              data-testid={`date-preset-${p.key}`}
              onClick={() => setFilters({ ...filters, start_date: r.start_date, end_date: r.end_date })}
              className={`px-2.5 py-1 text-[11px] uppercase tracking-[0.05em] font-semibold border transition-colors ${
                active
                  ? "bg-emerald-700 border-emerald-800 text-white"
                  : "bg-white border-slate-300 text-slate-600 hover:border-emerald-600 hover:text-emerald-700"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {(filters.start_date || filters.end_date) && (
          <button
            data-testid="date-preset-clear"
            onClick={() => setFilters({ ...filters, start_date: "", end_date: "" })}
            className="px-2 py-1 text-[11px] font-semibold border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 flex items-center gap-1"
          >
            <X size={11} weight="bold" /> Reset Tanggal
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          data-testid="tab-stok-keluar"
          onClick={() => setTab("out")}
          className={`px-4 py-2 text-xs uppercase tracking-[0.15em] font-bold border-b-2 -mb-px ${tab === "out" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Stok Keluar (Issue)
        </button>
        <button
          data-testid="tab-stok-masuk"
          onClick={() => setTab("in")}
          className={`px-4 py-2 text-xs uppercase tracking-[0.15em] font-bold border-b-2 -mb-px ${tab === "in" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Stok Masuk (Incoming)
        </button>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <FunnelSimple size={16} weight="bold" className="text-slate-500" />
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Filter</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari (barang/SO/pengambil)</Label>
            <Input className={inputCls} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO</Label>
            <Input className={inputCls} value={filters.so_number} onChange={(e) => setFilters({ ...filters, so_number: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Pengambil</Label>
            <Input className={inputCls} value={filters.taker} onChange={(e) => setFilters({ ...filters, taker: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tgl</Label>
            <Input type="date" className={inputCls} value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tgl</Label>
            <Input type="date" className={inputCls} value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          {tab === "out" ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Nomor SO</th>
                <th className="text-left p-3">Tgl Keluar</th>
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Pengambil</th>
                {canSeePrice && <th className="text-right p-3">Unit Price (FIFO)</th>}
                {canSeePrice && <th className="text-right p-3">Total Price</th>}
                <th className="text-left p-3">Vendor Asal</th>
              </tr>
            </thead>
            <tbody data-testid="report-table-out">
              {loading && (<tr><td colSpan={canSeePrice ? 8 : 6} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={canSeePrice ? 8 : 6} className="p-8 text-center text-slate-400"><ChartLineUp size={24} weight="duotone" className="inline-block mr-2 text-slate-300" /> Tidak ada data.</td></tr>
              )}
              {!loading && data.items.map((iss) =>
                canSeePrice && iss.allocations?.length > 0 ? (
                  iss.allocations.map((a, i) => (
                    <tr key={iss.id + "-" + i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{iss.so_number || "-"}</td>
                      <td className="p-3 whitespace-nowrap text-slate-700">{formatDateID(iss.issue_date)}</td>
                      <td className="p-3 text-slate-900 max-w-[280px] truncate" title={iss.item_name}>{iss.item_name}</td>
                      <td className="p-3 text-right tabular-nums">{a.qty} <span className="text-slate-400 text-xs">{iss.unit}</span></td>
                      <td className="p-3 text-slate-700">{iss.taker_name}</td>
                      <td className="p-3 text-right tabular-nums text-emerald-700">{formatRupiah(a.unit_price)}</td>
                      <td className="p-3 text-right tabular-nums font-semibold text-emerald-800">{formatRupiah(a.qty * a.unit_price)}</td>
                      <td className="p-3 text-slate-600 text-xs">{a.vendor_name || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr key={iss.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs">{iss.so_number || "-"}</td>
                    <td className="p-3 whitespace-nowrap text-slate-700">{formatDateID(iss.issue_date)}</td>
                    <td className="p-3 text-slate-900 max-w-[280px] truncate" title={iss.item_name}>{iss.item_name}</td>
                    <td className="p-3 text-right tabular-nums">{iss.qty} <span className="text-slate-400 text-xs">{iss.unit}</span></td>
                    <td className="p-3 text-slate-700">{iss.taker_name}</td>
                    <td className="p-3 text-slate-600 text-xs">{(iss.allocations || []).map((a) => a.vendor_name).filter(Boolean).join(", ") || "-"}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-50 border-b border-emerald-200 sticky top-0">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-emerald-800">
                <th className="text-left p-3">Tgl Terima</th>
                <th className="text-left p-3">Sumber</th>
                <th className="text-left p-3">Vendor/Customer</th>
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">SO No</th>
                <th className="text-left p-3">PO No</th>
                <th className="text-left p-3">DO No</th>
                <th className="text-left p-3">Invoice</th>
                {canSeePrice && <th className="text-right p-3">Unit Price</th>}
                {canSeePrice && <th className="text-right p-3">Total</th>}
              </tr>
            </thead>
            <tbody data-testid="report-table-in">
              {loading && (<tr><td colSpan={canSeePrice ? 12 : 10} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && inData.items.length === 0 && (
                <tr><td colSpan={canSeePrice ? 12 : 10} className="p-8 text-center text-slate-400"><ChartLineUp size={24} weight="duotone" className="inline-block mr-2 text-slate-300" /> Tidak ada data barang masuk stok.</td></tr>
              )}
              {!loading && inData.items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-emerald-50/40">
                  <td className="p-3 whitespace-nowrap text-slate-700 tabular-nums">{formatDateID(r.receive_date)}</td>
                  <td className="p-3 text-slate-600 text-xs uppercase tracking-[0.05em]">{r.source === "po" ? "PO" : (r.is_customer_material ? "Customer" : "Supplier")}</td>
                  <td className="p-3 text-slate-800 font-semibold">{r.vendor_name || r.customer_name || "-"}</td>
                  <td className="p-3 text-slate-900 max-w-[280px] truncate" title={r.item_name}>{r.item_name}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{r.qty_received}</td>
                  <td className="p-3 text-slate-500 uppercase text-xs">{r.unit}</td>
                  <td className="p-3 font-mono text-xs text-emerald-700">{r.so_no || "-"}</td>
                  <td className="p-3 font-mono text-xs">{r.po_no || "-"}</td>
                  <td className="p-3 font-mono text-xs">{r.do_number || "-"}</td>
                  <td className="p-3 font-mono text-xs">{r.invoice_no || "-"}</td>
                  {canSeePrice && <td className="p-3 text-right tabular-nums text-emerald-700">{r.unit_price ? formatRupiah(r.unit_price) : "-"}</td>}
                  {canSeePrice && <td className="p-3 text-right tabular-nums font-semibold text-emerald-800">{r.unit_price ? formatRupiah(Number(r.unit_price) * Number(r.qty_received)) : "-"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50 text-xs">
          <div>Halaman <b>{page}</b> dari <b>{totalPages}</b></div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page === 1 || loading} onClick={() => load(page - 1)} className="h-8 rounded-none">Prev</Button>
            <Button size="sm" variant="ghost" disabled={page >= totalPages || loading} onClick={() => load(page + 1)} className="h-8 rounded-none">Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
