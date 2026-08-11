import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { Signature, FileText, Factory, WarningCircle, ClipboardText } from "@phosphor-icons/react";

export default function ProductionPortalPage() {
  const [pendingTtd, setPendingTtd] = useState(0);
  const [newSo, setNewSo] = useState(0);

  useEffect(() => {
    api.get("/drawings/ecn-pending-ttd")
      .then(({ data }) => setPendingTtd((data.items || []).length))
      .catch(() => setPendingTtd(0));
    api.get("/production/new-so?scope=unack")
      .then(({ data }) => setNewSo(data.unack_count || 0))
      .catch(() => setNewSo(0));
  }, []);

  const CARDS = [
    {
      key: "new-so",
      label: "SO Masuk (Baru)",
      stats: "Sales Order baru · siapkan produksi",
      description:
        "Daftar Sale Order yang baru dibuat Sales. Produksi bisa lihat lebih awal (walau drawing belum di-stamp), cek status drawing/BOM, lalu tandai sudah disiapkan.",
      icon: ClipboardText,
      href: "/produksi/new-so",
      accent: "from-emerald-500 via-teal-500 to-cyan-500",
      accentText: "text-emerald-400",
      badgeCount: newSo,
    },
    {
      key: "ecn-ttd",
      label: "Menunggu TTD Saya",
      stats: "Drawing + ECN dalam satu tempat",
      description:
        "Kotak masuk tanda tangan Anda. Untuk Produksi: acknowledge/TTD perubahan drawing (ECN) yang sudah terbit. Setelah Produksi acknowledge, otomatis lanjut ke QA/QC.",
      icon: Signature,
      href: "/drawings/pending-my-approval",
      accent: "from-amber-500 via-orange-500 to-rose-500",
      accentText: "text-amber-400",
      badgeCount: pendingTtd,
    },
    {
      key: "controlled",
      label: "Controlled Drawing Database",
      stats: "Drawing Terbit · View-only",
      description:
        "Lihat semua drawing yang sudah terbit (controlled/released) untuk kebutuhan produksi. Baca dimensi, spec, dan revisi terbaru.",
      icon: FileText,
      href: "/drawings/controlled",
      accent: "from-sky-500 via-blue-500 to-indigo-500",
      accentText: "text-sky-400",
    },
  ];

  return (
    <DeptPortal
      deptLabel="Produksi"
      deptTagline="Acknowledge ECN · TTD Digital · Controlled Drawing"
      accentColor="amber"
      cards={CARDS}
    />
  );
}
