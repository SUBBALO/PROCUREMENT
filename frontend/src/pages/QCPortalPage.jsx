import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { ClipboardText, Stamp, SealCheck, WarningCircle, Ruler } from "@phosphor-icons/react";
import { useNotifCount } from "../lib/useNotifCount";
export default function QCPortalPage() {
  const pendingDrawings = useNotifCount("drawing_pending_approval");
  const pendingReleaseNotes = useNotifCount("frn_pending_qc");
  const calibrationDue = useNotifCount("tool_calibration_due");
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
      key: "release-notes",
      label: "Release Note Menunggu Persetujuan",
      stats: "FGRN · Approve / Tolak · TTD QC",
      description:
        "Kotak masuk Finished Goods Release Note dari Produksi. Review barang jadi, beri komentar QC, lalu Approve (Release = lolos & siap kirim ke Store) atau Tolak (dikembalikan ke Produksi).",
      icon: SealCheck,
      href: "/qc/release-notes",
      accent: "from-emerald-500 via-teal-500 to-cyan-500",
      accentText: "text-emerald-400",
      badgeCount: pendingReleaseNotes,
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
      key: "measuring-tools",
      label: "Kalibrasi Alat Ukur",
      stats: "Masterlist · Sertifikat · Reminder H-30",
      description:
        "Masterlist alat ukur di produksi + input hasil kalibrasi pihak ke-3 (upload sertifikat PDF/JPG). Alat yang mendekati jatuh tempo (H-30) atau overdue otomatis muncul peringatan.",
      icon: Ruler,
      href: "/qc/measuring-tools",
      accent: "from-violet-500 via-purple-500 to-fuchsia-500",
      accentText: "text-violet-400",
      badgeCount: calibrationDue,
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
