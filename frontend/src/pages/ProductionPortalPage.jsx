import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { Signature, FileText, Factory } from "@phosphor-icons/react";

export default function ProductionPortalPage() {
  const [pendingTtd, setPendingTtd] = useState(0);

  useEffect(() => {
    api.get("/drawings/ecn-pending-ttd")
      .then(({ data }) => setPendingTtd((data.items || []).length))
      .catch(() => setPendingTtd(0));
  }, []);

  const CARDS = [
    {
      key: "ecn-ttd",
      label: "Menunggu TTD ECN Anda",
      stats: "Acknowledge Perubahan Drawing (ECN)",
      description:
        "Perubahan drawing (ECN) yang sudah terbit dan menunggu acknowledge/TTD digital Produksi. Klik untuk baca perubahan lalu TTD. Setelah Produksi acknowledge, otomatis lanjut ke QA/QC.",
      icon: Signature,
      href: "/ecn-ttd",
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
