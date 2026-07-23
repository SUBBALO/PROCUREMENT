import React from "react";
import DeptPortal from "../components/DeptPortal";
import { Package, ArrowDown, ArrowUp, Warehouse, ChartBar, ClipboardText, Truck, CurrencyCircleDollar } from "@phosphor-icons/react";

const CARDS = [
  {
    key: "stock", label: "Live Inventory (Stock FIFO)", stats: "Live Inventory",
    description: "Live stock per item, FIFO allocation, sisa qty per receipt.",
    icon: Warehouse, href: "/store/stock",
    accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
  },
  {
    key: "terima-po", label: "Terima Barang (PO GRN)", stats: "Receive from Vendor",
    description: "Receive barang dari PO purchasing, checklist, add to stock.",
    icon: ArrowDown, href: "/store/receive",
    accent: "from-emerald-500 via-teal-500 to-cyan-500", accentText: "text-emerald-400",
  },
  {
    key: "manual-receive", label: "Manual Receive", stats: "Tarik dari PO Purchasing",
    description: "Input manual barang datang tanpa PO purchasing (drop-in).",
    icon: ClipboardText, href: "/store/manual-receive",
    accent: "from-lime-500 via-green-500 to-emerald-500", accentText: "text-lime-400",
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
    key: "reports", label: "Laporan Store", stats: "Incoming · Outgoing",
    description: "Laporan Incoming Goods (dgn MCL) + Outgoing + Ringkasan.",
    icon: ChartBar, href: "/store/incoming-report",
    accent: "from-violet-500 via-purple-500 to-fuchsia-500", accentText: "text-violet-400",
  },
];

export default function StorePortalPage() {
  return <DeptPortal deptLabel="Store Department" deptTagline="Terima · Manual · Keluar · Stock · Pengiriman · Laporan" accentColor="emerald" cards={CARDS} />;
}
