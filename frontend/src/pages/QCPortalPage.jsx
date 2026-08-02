import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { ClipboardText, Stamp, ClipboardText as ClipboardIcon } from "@phosphor-icons/react";
import { useNotifCount } from "../lib/useNotifCount";
export default function QCPortalPage() {
  const pendingDrawings = useNotifCount("drawing_pending_approval");
  const [pendingEcn, setPendingEcn] = useState(0);

  useEffect(() => {
    api.get("/drawings/ecn-pending-ttd")
      .then(({ data }) => setPendingEcn((data.items || []).length))
      .catch(() => setPendingEcn(0));
  }, []);

  const CARDS = [
    {
      key: "pending-approval",
      label: "Menunggu TTD Saya",
      stats: "Drawing + ECN dalam satu tempat",
      description: "Kotak masuk tanda tangan Anda: review & TTD Drawing (view-only, cek dimensi/tolerance/spec) DAN TTD ECN (perubahan drawing) — semua jadi satu. TTD Drawing lanjut ke Sales; TTD ECN otomatis diarsipkan ke Document Control.",
      icon: Stamp,
      href: "/drawings/pending-my-approval",
      accent: "from-emerald-500 via-green-500 to-teal-500",
      accentText: "text-emerald-400",
      badgeCount: pendingDrawings + pendingEcn,
    },
    {
      key: "mii",
      label: "Material Incoming Inspection",
      stats: "MII · MKS-F-QAD-002",
      description:
        "Inspeksi material incoming (form ISO). Auto-dari Store non-stock item. Input dimension/visual/OK-NG, cetak PDF MII.",
      icon: ClipboardText,
      href: "/qc/mii",
      accent: "from-violet-500 via-purple-500 to-fuchsia-500",
      accentText: "text-violet-400",
    },
    {
      key: "sig-history",
      label: "Riwayat TTD Saya",
      stats: "Bukti Audit · ISO 9001",
      description: "Semua drawing yang pernah Anda TTD sebagai QC. Lengkap dengan tanggal, jam, dan link preview PDF — bukti audit untuk auditor ISO 9001.",
      icon: ClipboardIcon,
      href: "/my/signature-history",
      accent: "from-indigo-500 via-purple-500 to-fuchsia-500",
      accentText: "text-indigo-400",
    },
  ];

  return (
    <DeptPortal
      deptLabel="Quality Control"
      deptTagline="Material Inspection · TTD Digital Drawing · ISO Registered Forms"
      accentColor="violet"
      cards={CARDS}
    />
  );
}
