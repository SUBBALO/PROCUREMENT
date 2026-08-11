import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { Storefront, FileText, Users, ClipboardText, PenNib, WarningCircle } from "@phosphor-icons/react";
import { useNotifCount } from "../lib/useNotifCount";

export default function SalesPortalPage() {
  // Badge "Review & TTD" = drawing yang masih menunggu TTD Sales (approval_status = pending_sales).
  // Drawing yang sudah 'approved' TIDAK dihitung (TTD Sales sudah selesai → lanjut ke Document Control).
  const pendingDrawings = useNotifCount("drawing_pending_approval");
  const [pendingApproval, setPendingApproval] = useState(0);

  useEffect(() => {
    const fetch = () => {
      api.get("/drawings/pending-my-approval")
        .then(({ data }) => setPendingApproval(data?.total || 0)).catch(() => {});
    };
    fetch();
    const t = setInterval(fetch, 45000);
    return () => clearInterval(t);
  }, []);

  const CARDS = [
    {
      key: "pending-approval",
      label: "Review & TTD Drawing (Sales Approval)",
      stats: "Cek final · Isi SO Data · TTD",
      description: "Drawing sudah di-approve Engineering & QC — Anda review terakhir sebagai Sales. Preview drawing (baca-saja), klik TTD & Approve → isi SO/PO/Qty/Customer untuk SO Stamp Produksi. Tab 'Riwayat TTD Saya' berisi semua drawing yang pernah Anda tanda tangani (bukti audit).",
      icon: PenNib,
      href: "/drawings/pending-my-approval",
      accent: "from-orange-500 via-amber-500 to-yellow-500",
      accentText: "text-orange-400",
      badgeCount: pendingApproval,
    },
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
      key: "create-so", label: "Create Sales Order", stats: "Dari Quotation · Ajukan Drawing Request",
      description: "Buat Sales Order dari quotation (atau manual), isi No. SO 6 digit (00xxxx) + No. PO Customer + item & harga. Setelah simpan, ajukan Drawing Request ke Engineering dan pantau statusnya (Submit → Terima → Kerjakan → Selesai).",
      icon: ClipboardText, href: "/sales/sales-orders",
      accent: "from-emerald-600 via-teal-500 to-green-500", accentText: "text-emerald-400",
    },
    {
      key: "drawing-requests",
      label: "Drawing Request Form",
      stats: "MKS-F-ENG-001",
      description:
        "Buat request drawing ke Engineering (New Order / Repeat Order). Track status request, dan TTD drawing MKS setelah selesai.",
      icon: ClipboardText,
      href: "/sales/drawing-requests",
      accent: "from-emerald-500 via-green-500 to-teal-500",
      accentText: "text-emerald-400",
      badgeCount: pendingDrawings,
    },
    {
      key: "bom-view", label: "BOM (View Only)", stats: "Bahan Baku · Reference",
      description: "Lihat BOM yang sudah di-approve Engineering — sebagai referensi untuk quotation & follow-up produksi. Sales HANYA VIEW, tidak bisa edit isi BOM.",
      icon: ClipboardText, href: "/bom",
      accent: "from-emerald-500 via-teal-500 to-cyan-500", accentText: "text-emerald-400",
    },
    {
      key: "customers", label: "Master List Customer", stats: "Data Customer",
      description: "Kelola master data customer: nama, alamat, PIC. Autocomplete saat buat quotation.",
      icon: Users, href: "/sales/customers",
      accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
    },
  ];

  return <DeptPortal deptLabel="Sales Department" deptTagline="Drawing Request · Inquiry · Quotation · Order" accentColor="amber" cards={CARDS} />;
}
