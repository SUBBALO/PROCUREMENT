import React, { useEffect, useState, useMemo } from "react";
import api, { formatRupiah, formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { MagnifyingGlass, Package } from "@phosphor-icons/react";

export default function MasterItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api
      .get("/master/items")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (it) => it.item_name.toLowerCase().includes(kw) || (it.last_vendor || "").toLowerCase().includes(kw)
    );
  }, [items, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Master Barang
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Katalog unik nama barang dengan harga & toko terakhir. Total{" "}
          <span className="tabular-nums font-semibold text-slate-900">{items.length.toLocaleString("id-ID")}</span> item.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="relative max-w-md">
          <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="items-search"
            placeholder="Cari nama barang atau toko..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600"
          />
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">Toko Terakhir</th>
                <th className="text-left p-3">Tanggal Terakhir</th>
                <th className="text-right p-3">Harga Terakhir</th>
                <th className="text-right p-3"># Pembelian</th>
              </tr>
            </thead>
            <tbody data-testid="items-table">
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400">Memuat...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400">
                    <Package size={24} weight="duotone" className="inline-block mr-2 text-slate-300" />
                    Belum ada data barang.
                  </td>
                </tr>
              )}
              {filtered.map((it) => (
                <tr key={it.item_name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-slate-900 max-w-[400px]">{it.item_name}</td>
                  <td className="p-3 text-slate-500 text-xs uppercase tracking-[0.05em]">{it.unit || "-"}</td>
                  <td className="p-3 text-slate-700">{it.last_vendor || "-"}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap">{formatDateID(it.last_date)}</td>
                  <td className="p-3 text-right tabular-nums font-semibold text-slate-900">{formatRupiah(it.last_price)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-600">{it.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
