import React, { useEffect, useState, useCallback } from "react";
import api, { formatRupiah, formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Download, FunnelSimple, ChartLineUp } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

export default function StoreReportPage() {
  const { user } = useAuth();
  const canSeePrice = user?.role === "admin" || (user?.perms || []).includes("view_store_report");

  const [filters, setFilters] = useState({ q: "", so_number: "", taker: "", start_date: "", end_date: "" });
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: 50 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get("/store/issuances", { params });
      setData(data);
      setPage(p);
    } catch { toast.error("Gagal memuat laporan"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, [load]);

  const onExport = async () => {
    try {
      const res = await api.get("/store/report/xlsx", {
        params: { start_date: filters.start_date, end_date: filters.end_date },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan_stok_keluar_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Laporan siap diunduh");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal export");
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / 50));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Costing Store
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Total <span className="tabular-nums font-semibold text-slate-900">{data.total.toLocaleString("id-ID")}</span> transaksi pengeluaran{" "}
            {canSeePrice && <span className="text-emerald-700">· harga FIFO ditampilkan</span>}
          </p>
        </div>
        {canSeePrice && (
          <Button data-testid="export-store-btn" onClick={onExport} className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
            <Download size={14} weight="bold" className="mr-1.5" /> Export Excel
          </Button>
        )}
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
            <tbody data-testid="report-table">
              {loading && (<tr><td colSpan={canSeePrice ? 8 : 6} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={canSeePrice ? 8 : 6} className="p-8 text-center text-slate-400"><ChartLineUp size={24} weight="duotone" className="inline-block mr-2 text-slate-300" /> Tidak ada data.</td></tr>
              )}
              {!loading && data.items.map((iss) =>
                canSeePrice && iss.allocations?.length > 0 ? (
                  // Show per-allocation rows so FIFO price is transparent
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
