import React, { useEffect, useState, useMemo } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { MagnifyingGlass, Package } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function StoreStockPage() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/store/stock")
      .then((r) => setStock(r.data))
      .catch(() => toast.error("Gagal memuat stok"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return stock;
    return stock.filter((s) => s.item_name.toLowerCase().includes(kw) || (s.vendors || []).join(" ").toLowerCase().includes(kw));
  }, [stock, q]);

  const totalQty = filtered.reduce((sum, s) => sum + Number(s.qty || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Stok Saat Ini
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Total <span className="tabular-nums font-semibold text-slate-900">{stock.length.toLocaleString("id-ID")}</span> item aktif di gudang.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="relative max-w-md">
          <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="stock-search"
            className="h-9 pl-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600"
            placeholder="Cari nama barang atau vendor..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-left p-3">Vendor</th>
                <th className="text-left p-3">Terima Terakhir</th>
                <th className="text-right p-3">Batch</th>
                <th className="text-right p-3">Qty Tersedia</th>
              </tr>
            </thead>
            <tbody data-testid="stock-table">
              {loading && (<tr><td colSpan={5} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">
                  <Package size={24} weight="duotone" className="inline-block mr-2 text-slate-300" />
                  Belum ada stok.
                </td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.item_name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-slate-900 max-w-[360px]">{s.item_name}</td>
                  <td className="p-3 text-slate-600 text-xs">{(s.vendors || []).join(", ") || "-"}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap">{formatDateID(s.last_receive_date)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{s.batches}</td>
                  <td className="p-3 text-right tabular-nums font-semibold text-sky-700">{s.qty} <span className="text-slate-400 text-xs">{s.unit}</span></td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-50">
                  <td colSpan={4} className="p-3 text-right text-xs uppercase tracking-[0.1em] font-bold text-slate-600">Total</td>
                  <td className="p-3 text-right tabular-nums font-bold text-slate-900">{totalQty.toLocaleString("id-ID")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
