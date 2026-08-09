import React from "react";
import DeptPortal from "../components/DeptPortal";
import { Package, ArrowUp, Warehouse, ChartBar, Truck, CurrencyCircleDollar, ClipboardText } from "@phosphor-icons/react";
import { useNotifCount } from "../lib/useNotifCount";

export default function StorePortalPage() {
  // Badge: stok di bawah minimum (perlu pembelian ulang)
  const lowStock = useNotifCount("low_stock");

  const CARDS = [
    {
      key: "stock", label: "Live Inventory (Stock FIFO)", stats: "Live Inventory",
      description: "Live stock per item, FIFO allocation, sisa qty per receipt.",
      icon: Warehouse, href: "/store/stock",
      accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
      badgeCount: lowStock,
    },
    {
      key: "incoming-goods", label: "Incoming Goods", stats: "Input · Laporan · MCL",
      description: "Input barang datang (manual/PO) + Laporan Incoming Goods + Cetak MCL PDF/XLSX.",
      icon: Package, href: "/store/incoming-report",
      accent: "from-emerald-500 via-teal-500 to-cyan-500", accentText: "text-emerald-400",
    },
    {
      key: "keluar-barang", label: "Keluar Barang", stats: "Issue to Production",
      description: "Keluarkan barang ke pengambil dengan FIFO, cetak surat jalan.",
      icon: ArrowUp, href: "/store/issue",
      accent: "from-rose-500 via-red-500 to-orange-500", accentText: "text-rose-400",
    },
    {
      key: "deliveries", label: "Pengiriman Barang", stats: "Delivery ke Customer",
      description: "Kelola DO ke customer, mapping per SO, laporan pengiriman.",
      icon: Truck, href: "/deliveries",
      accent: "from-amber-500 via-orange-500 to-red-500", accentText: "text-amber-400",
    },
    {
      key: "costing-store", label: "Costing Store", stats: "Laporan Nilai Stok",
      description: "Nilai stok berdasarkan FIFO, breakdown per item & vendor, total inventory cost.",
      icon: CurrencyCircleDollar, href: "/store/report",
      accent: "from-fuchsia-500 via-purple-500 to-violet-500", accentText: "text-fuchsia-400",
    },
    {
      key: "consumable", label: "Consumable Good Request", stats: "Store Request",
      description: "Store minta consumable, Purchasing tandai saat sudah dibeli — item ter-link ke pembelian.",
      icon: ClipboardText, href: "/store/consumable-requests",
      accent: "from-teal-500 via-emerald-500 to-cyan-500", accentText: "text-teal-400",
    },
  ];

  return <DeptPortal deptLabel="Store Department" deptTagline="Stock · Incoming Goods · Keluar · Pengiriman · Costing · Consumable" accentColor="emerald" cards={CARDS} />;
}
