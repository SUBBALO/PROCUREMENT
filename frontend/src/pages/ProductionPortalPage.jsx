import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { Signature, FileText, Factory, WarningCircle, ClipboardText, Notebook, Gauge, Package, CalendarX, UsersThree, Clock } from "@phosphor-icons/react";

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
      key: "job-progress",
      label: "Daily Monitoring Job Progress",
      stats: "Semua aktivitas produksi · Progress per-SO",
      description:
        "Papan utama monitoring semua job produksi per SO: Date Received (mulai kerja), Due Date, Qty Finished (otomatis dari Release Note), Balance & % progress, hingga Days sampai selesai.",
      icon: Gauge,
      href: "/produksi/job-progress",
      accent: "from-amber-500 via-orange-500 to-rose-500",
      accentText: "text-amber-400",
    },
    {
      key: "frn",
      label: "Finished Goods Release Note",
      stats: "Rilis barang jadi · QC · Partial",
      description:
        "Catat barang jadi yang lolos QC dan dirilis per SO (boleh bertahap/partial). Setiap rilis otomatis menambah Qty Finished pada papan Job Progress.",
      icon: Package,
      href: "/produksi/frn",
      accent: "from-emerald-500 via-teal-500 to-cyan-500",
      accentText: "text-emerald-400",
    },
    {
      key: "daily-report",
      label: "Daily Production Report",
      stats: "Input harian · Masterlist · Export Excel",
      description:
        "Laporan produksi harian model spreadsheet: ketik & Enter untuk baris berikutnya (auto-simpan). Catat operator, SO, proses, qty OK & NG, jam kerja, mesin. Tab Masterlist Bulanan untuk rekap & export Excel.",
      icon: Notebook,
      href: "/produksi/daily-report",
      accent: "from-amber-500 via-orange-500 to-rose-500",
      accentText: "text-amber-400",
    },
    {
      key: "attendance",
      label: "Absensi Kehadiran",
      stats: "Check-in harian · Status kehadiran",
      description:
        "Absensi harian karyawan produksi (Hadir/Terlambat/Ijin/Night Shift/MC/In-situ). Operator yang tidak hadir otomatis tidak bisa diinput di Daily Production.",
      icon: UsersThree,
      href: "/produksi/attendance",
      accent: "from-indigo-500 via-blue-500 to-cyan-500",
      accentText: "text-indigo-400",
    },
    {
      key: "overtime",
      label: "Overtime Request",
      stats: "Form OT · Rekap jam OT/bulan",
      description:
        "Form permintaan lembur per SO (customer auto). Lihat total jam overtime tiap karyawan dalam satu bulan.",
      icon: Clock,
      href: "/produksi/overtime",
      accent: "from-orange-500 via-amber-500 to-yellow-500",
      accentText: "text-orange-400",
    },
    {
      key: "holidays",
      label: "Hari Libur Nasional",
      stats: "Master libur · Working Date Target",
      description:
        "Input tanggal libur nasional per tahun. Dipakai untuk menghitung Working Date Target di Job Progress (kecualikan Minggu & hari libur).",
      icon: CalendarX,
      href: "/produksi/holidays",
      accent: "from-rose-500 via-pink-500 to-fuchsia-500",
      accentText: "text-rose-400",
    },
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
      deptTagline="Daily Production Report · Masterlist Bulanan · Acknowledge ECN · TTD Digital"
      accentColor="amber"
      cards={CARDS}
    />
  );
}
