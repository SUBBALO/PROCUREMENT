import React from "react";
import DeptPortal from "../components/DeptPortal";
import { Storefront, FileText, Users } from "@phosphor-icons/react";

const CARDS = [
  {
    key: "inquiry", label: "Inquiry Costing", stats: "Ke Engineering",
    description: "Kirim permintaan costing harga ke Engineering, upload drawing & dokumen, review hasilnya.",
    icon: Storefront, href: "/sales/inquiries",
    accent: "from-rose-500 via-red-500 to-orange-500", accentText: "text-rose-400",
  },
  {
    key: "quotation", label: "Quotation", stats: "Ke Customer",
    description: "Buat quotation resmi dengan kop surat A4, format nomor 001/MKS/Q/VII/2026.",
    icon: FileText, href: "/sales/quotations",
    accent: "from-amber-500 via-orange-500 to-red-500", accentText: "text-amber-400",
  },
  {
    key: "customers", label: "Master Customer", stats: "Data Customer",
    description: "Kelola master data customer: nama, alamat, PIC. Autocomplete saat buat quotation.",
    icon: Users, href: "/sales/customers",
    accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
  },
];

export default function SalesPortalPage() {
  return <DeptPortal deptLabel="Sales Department" deptTagline="Inquiry · Quotation · Order Status" accentColor="rose" cards={CARDS} />;
}
