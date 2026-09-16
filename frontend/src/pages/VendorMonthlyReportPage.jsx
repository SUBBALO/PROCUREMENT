import React, { useEffect, useMemo, useState } from "react";
import api, { formatRupiah, formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Storefront,
  Receipt,
  CurrencyDollar,
  MagnifyingGlass,
  Eye,
  Package,
  CaretRight,
} from "@phosphor-icons/react";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (m) => {
  if (!m) return "-";
  const [y, mo] = m.split("-");
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${names[Number(mo) - 1] || mo} ${y}`;
};

const SummaryCard = ({ label, value, icon: Icon, testid }) => (
  <Card data-testid={testid} className="rounded-none border-slate-200 shadow-none p-4 flex items-start justify-between bg-white">
    <div>
      <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums" style={{ fontFamily: "Chivo, sans-serif" }}>
        {value}
      </div>
    </div>
    <div className="p-2 border border-slate-200 text-sky-600">
      <Icon size={20} weight="duotone" />
    </div>
  </Card>
);

export default function VendorMonthlyReportPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Detail drill-down
  const [detailVendor, setDetailVendor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/reports/vendor-monthly?month=${month}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month]);

  const openDetail = (vendor) => {
    setDetailVendor(vendor);
    setDetail(null);
    setDetailLoading(true);
    api
      .get(`/reports/vendor-monthly/detail?month=${month}&vendor=${encodeURIComponent(vendor)}`)
      .then((r) => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  };

  const vendors = useMemo(() => {
    const list = data?.vendors || [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((v) => (v.vendor || "").toLowerCase().includes(q));
  }, [data, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Laporan Belanja per Vendor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cek total belanja tiap PT/supplier dalam 1 bulan, lalu klik untuk melihat rincian pesanannya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">Bulan</span>
          <Input
            data-testid="vendor-report-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44 rounded-none h-9 border-slate-300"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          testid="vendor-report-grand-total"
          label={`Total Belanja — ${monthLabel(month)}`}
          value={loading ? "..." : formatRupiah(data?.grand_total_idr || 0)}
          icon={CurrencyDollar}
        />
        <SummaryCard
          testid="vendor-report-vendor-count"
          label="Jumlah Vendor"
          value={loading ? "..." : (data?.vendor_count || 0).toLocaleString("id-ID")}
          icon={Storefront}
        />
        <SummaryCard
          testid="vendor-report-tx-count"
          label="Jumlah Transaksi"
          value={loading ? "..." : (data?.grand_tx || 0).toLocaleString("id-ID")}
          icon={Receipt}
        />
      </div>

      {/* Vendor table */}
      <Card className="rounded-none border-slate-200 shadow-none bg-white">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 flex-wrap">
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">
            Daftar Vendor ({vendors.length})
          </h3>
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="vendor-report-search"
              placeholder="Cari nama vendor..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-64 pl-8 rounded-none h-9 border-slate-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="vendor-report-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 w-12">No</th>
                <th className="px-4 py-3">Nama Vendor / PT</th>
                <th className="px-4 py-3 text-right w-24">Transaksi</th>
                <th className="px-4 py-3 text-right w-20">PO</th>
                <th className="px-4 py-3 text-right w-24">Item</th>
                <th className="px-4 py-3 text-right w-44">Total Belanja</th>
                <th className="px-4 py-3 text-right w-32">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Memuat data...</td></tr>
              )}
              {!loading && vendors.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400" data-testid="vendor-report-empty">
                  Belum ada transaksi pembelian pada {monthLabel(month)}.
                </td></tr>
              )}
              {!loading && vendors.map((v, i) => (
                <tr
                  key={v.vendor + i}
                  className="hover:bg-sky-50/60 cursor-pointer transition-colors"
                  onClick={() => openDetail(v.vendor)}
                  data-testid={`vendor-row-${i}`}
                >
                  <td className="px-4 py-3 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{v.vendor}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{v.tx_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{v.po_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{v.item_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{formatRupiah(v.total_idr)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openDetail(v.vendor); }}
                      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-sky-700 hover:text-sky-900"
                      data-testid={`vendor-detail-btn-${i}`}
                    >
                      <Eye size={15} weight="duotone" /> Rincian <CaretRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && vendors.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-3" colSpan={5}>TOTAL {query ? "(hasil filter)" : monthLabel(month)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" data-testid="vendor-report-footer-total">
                    {formatRupiah(vendors.reduce((s, v) => s + (v.total_idr || 0), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detailVendor} onOpenChange={(o) => { if (!o) { setDetailVendor(null); setDetail(null); } }}>
        <DialogContent className="max-w-5xl rounded-none border-slate-300 p-0" data-testid="vendor-detail-dialog">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2 text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
              <Package size={20} weight="duotone" className="text-sky-600" />
              {detailVendor}
            </DialogTitle>
            <DialogDescription>
              Rincian pesanan pada {monthLabel(month)}
              {detail ? ` — ${detail.count} transaksi` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto px-5 pb-2">
            {detailLoading && <div className="py-10 text-center text-slate-400">Memuat rincian...</div>}
            {!detailLoading && detail && detail.items?.length === 0 && (
              <div className="py-10 text-center text-slate-400">Tidak ada rincian.</div>
            )}
            {!detailLoading && detail && detail.items?.length > 0 && (
              <table className="w-full text-sm" data-testid="vendor-detail-table">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-slate-500 border-b border-slate-200">
                    <th className="px-2 py-2.5">Tanggal</th>
                    <th className="px-2 py-2.5">No. PO</th>
                    <th className="px-2 py-2.5">No. Invoice</th>
                    <th className="px-2 py-2.5">SO</th>
                    <th className="px-2 py-2.5">Nama Barang</th>
                    <th className="px-2 py-2.5 text-right">Qty</th>
                    <th className="px-2 py-2.5">Unit</th>
                    <th className="px-2 py-2.5 text-right">Harga Satuan</th>
                    <th className="px-2 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.items.map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-slate-50">
                      <td className="px-2 py-2.5 whitespace-nowrap text-slate-600">{formatDateID(t.invoice_date)}</td>
                      <td className="px-2 py-2.5 text-slate-700">{t.po_no || "-"}</td>
                      <td className="px-2 py-2.5 text-slate-700">{t.invoice_no || "-"}</td>
                      <td className="px-2 py-2.5 text-slate-700">{t.project_no || "-"}</td>
                      <td className="px-2 py-2.5 text-slate-900">{t.item_name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{Number(t.qty || 0).toLocaleString("id-ID")}</td>
                      <td className="px-2 py-2.5 text-slate-500">{t.unit || "-"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                        {(t.currency && t.currency !== "IDR") ? `${t.currency} ${Number(t.unit_price || 0).toLocaleString("id-ID")}` : formatRupiah(t.unit_price)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-medium text-slate-900">
                        {formatRupiah(t.total_price_idr || t.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                    <td className="px-2 py-3" colSpan={8}>SUBTOTAL {detailVendor}</td>
                    <td className="px-2 py-3 text-right tabular-nums" data-testid="vendor-detail-subtotal">
                      {formatRupiah(detail.subtotal_idr)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
