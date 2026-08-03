import React from "react";
import DeptPortal from "../components/DeptPortal";
import { FileText, Stamp, Database } from "@phosphor-icons/react";

export default function DocumentControlPortalPage() {
  const CARDS = [
    {
      key: "distribution",
      label: "Menunggu Stamp DC",
      stats: "Drawing MKS saja",
      description: "Antrian Drawing MKS yang sudah approved dan perlu di-stamp Document Control. Klik posisi stamp di PDF viewer. (Dokumen ISO tidak lagi di-stamp — diarsipkan di Controlled Document Register.)",
      icon: FileText,
      href: "/document-control/distribution",
      accent: "from-red-500 via-rose-500 to-pink-500",
      accentText: "text-red-400",
    },
    {
      key: "so-stamp",
      label: "SO Stamp untuk Produksi",
      stats: "MKS S.O · P/O · Qty · Customer · Due",
      description: "Setelah drawing controlled, apply kotak merah info SO/PO/Qty/Customer/Received/Due Date. Data auto-terisi dari input Sales saat TTD.",
      icon: Stamp,
      href: "/document-control/so-stamp",
      accent: "from-amber-500 via-orange-500 to-red-500",
      accentText: "text-amber-400",
    },
    {
      key: "controlled-db",
      label: "Controlled Document Register",
      stats: "Drawing · Dokumen ISO · Obsolete",
      description: "Register dokumen terkontrol: tab Drawing, tab Dokumen ISO (upload & arsip langsung ke database, tanpa stamp), dan arsip Obsolete. Preview view-only, buat revisi (versi lama otomatis OBSOLETE), & riwayat.",
      icon: Database,
      href: "/documents/register",
      accent: "from-indigo-500 via-blue-500 to-cyan-500",
      accentText: "text-indigo-400",
    },
  ];

  return (
    <DeptPortal
      deptLabel="Document Control"
      deptTagline="Distribution Record · DC Stamp · SO Stamp · Controlled Database"
      accentColor="red"
      cards={CARDS}
    />
  );
}
