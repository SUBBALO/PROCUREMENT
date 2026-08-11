import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { FileText, Stamp, Database, Archive } from "@phosphor-icons/react";

export default function DocumentControlPortalPage() {
  // Badge: Drawing MKS approved yang menunggu di-stamp Document Control
  const [pendingStamp, setPendingStamp] = useState(0);
  const [pendingObsolete, setPendingObsolete] = useState(0);

  useEffect(() => {
    const fetch = () => {
      api.get("/drawings/pending-dc-stamp")
        .then(({ data }) => setPendingStamp(data?.total || (data?.items || []).length || 0))
        .catch(() => {});
      api.get("/drawings/obsolete-list", { params: { status: "pending" } })
        .then(({ data }) => setPendingObsolete(data?.pending_count || 0))
        .catch(() => {});
    };
    fetch();
    const t = setInterval(fetch, 45000);
    return () => clearInterval(t);
  }, []);

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
      badgeCount: pendingStamp,
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
      key: "obsolete-stamp",
      label: "Perlu Stamp OBSOLETE",
      stats: "Rev lama yang sudah digantikan",
      description: "Rev drawing lama yang sudah digantikan Rev baru dan menunggu di-stamp OBSOLETE. Klik posisi cap OBSOLETE di PDF (seperti stamp Controlled). Setelah di-stamp → resmi obsolete & view-only.",
      icon: Archive,
      href: "/drawings/controlled?tab=obsolete",
      accent: "from-rose-500 via-red-500 to-orange-500",
      accentText: "text-rose-400",
      badgeCount: pendingObsolete,
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
