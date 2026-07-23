import React from "react";
import DeptPortal from "../components/DeptPortal";
import { Plus, ListDashes, Package, ChartBar, Truck } from "@phosphor-icons/react";

const CARDS = [
  {
    key: "input-tx", label: "Input Transaksi Pembelian", stats: "Purchase Entry",
    description: "Input transaksi baru, tarik PO via AI, multi-currency.",
    icon: Plus, href: "/input",
    accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
  },
  {
    key: "master-list", label: "Master List Transaksi", stats: "History · Filter",
    description: "Daftar lengkap transaksi pembelian, filter, edit, export Excel.",
    icon: ListDashes, href: "/master",
    accent: "from-emerald-500 via-teal-500 to-cyan-500", accentText: "text-emerald-400",
  },
  {
    key: "master-items", label: "Master Items (Harga)", stats: "Item · Vendor · Price",
    description: "Rekap item, harga terakhir, vendor, unit standar.",
    icon: Package, href: "/master-items",
    accent: "from-amber-500 via-orange-500 to-red-500", accentText: "text-amber-400",
  },
  {
    key: "dashboard", label: "Dashboard", stats: "KPI · Metrik",
    description: "Ringkasan pembelian per periode, top vendor, expose FX.",
    icon: ChartBar, href: "/dashboard",
    accent: "from-violet-500 via-purple-500 to-fuchsia-500", accentText: "text-violet-400",
  },
];

export default function PurchasingPortalPage() {
  return <DeptPortal deptLabel="Purchasing Department" deptTagline="Input Transaksi · Master · Vendor · Dashboard" accentColor="sky" cards={CARDS} />;
}
