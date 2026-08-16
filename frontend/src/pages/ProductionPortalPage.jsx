import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeptPortal from "../components/DeptPortal";
import ProductionJobProgressPage from "./ProductionJobProgressPage";
import api from "../lib/api";
import { Signature, FileText, Factory, WarningCircle, ClipboardText, Notebook, Gauge, Package, CalendarX, UsersThree, Clock, ChartBar, CheckCircle, ArrowRight, CalendarCheck, Toolbox } from "@phosphor-icons/react";

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
      key: "so-work-summary",
      label: "Ringkasan Kerja SO",
      stats: "Per SO · Berapa hari & jam · Siapa saja",
      description:
        "Rekap kerja tiap SO dari Daily Production Report: tanggal berapa saja dikerjakan, siapa operatornya, total hari & total jam untuk menyelesaikan 1 SO.",
      icon: ChartBar,
      href: "/produksi/so-work-summary",
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
      key: "tools",
      label: "Peminjaman Alat / Tools",
      stats: "Inventory · Pinjam/Kembali · Alat hilang",
      description:
        "Inventory alat produksi: siapa pinjam alat apa, kapan dikembalikan, dan alat hilang langsung ketahuan. Cek status & pemegang alat kapan saja.",
      icon: Toolbox,
      href: "/produksi/tools",
      accent: "from-amber-500 via-orange-500 to-rose-500",
      accentText: "text-amber-400",
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

  // Susun kartu ke sidebar kiri (grup), Job Progress tampil di tengah
  const GROUP_OF = {
    "job-progress": "monitor",
    "so-work-summary": "monitor",
    "daily-report": "harian",
    "frn": "harian",
    "overtime": "harian",
    "attendance": "harian",
    "new-so": "so",
    "holidays": "so",
    "tools": "so",
    "ecn-ttd": "drawing",
    "controlled": "drawing",
  };
  const GROUP_DEFS = [
    { key: "monitor", label: "Monitoring" },
    { key: "harian", label: "Input Harian" },
    { key: "so", label: "SO & Master" },
    { key: "drawing", label: "Drawing & TTD" },
  ];
  const groups = GROUP_DEFS.map((g) => ({
    ...g,
    cards: CARDS.filter((c) => (GROUP_OF[c.key] || "harian") === g.key),
  }));

  return (
    <DeptPortal
      deptLabel="Produksi"
      deptTagline="Daily Monitoring Job Progress di tengah · Menu produksi di kiri"
      accentColor="amber"
      groups={groups}
      compactCards
      sidebarMenu
      cardsLabel="Menu Produksi"
    >
      <TodayPanel />
      <ProductionJobProgressPage embedded />
    </DeptPortal>
  );
}

function TodayPanel() {
  const navigate = useNavigate();
  const [sum, setSum] = useState(null);

  const load = () => {
    api.get("/production/today-summary")
      .then(({ data }) => setSum(data))
      .catch(() => setSum(null));
  };
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []);

  const dateLabel = (() => {
    try { return new Date((sum?.date || new Date().toISOString().slice(0, 10)) + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
    catch { return sum?.date || ""; }
  })();

  const attMissing = sum?.attendance_missing ?? 0;
  const attTotal = sum?.total_employees ?? 0;
  const reportCount = sum?.report_count ?? 0;
  const rejected = sum?.frn_rejected ?? 0;

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-[2px]" data-testid="today-panel">
      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
        <CalendarCheck size={15} weight="fill" className="text-amber-500" />
        <h2 className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-slate-500">Hari Ini</h2>
        <span className="text-[11px] text-slate-400">· {dateLabel}</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <TodayTile
          testId="today-attendance"
          done={attTotal > 0 && attMissing === 0}
          icon={UsersThree}
          warnLabel={attTotal === 0 ? "Belum ada karyawan produksi" : `${attMissing} dari ${attTotal} belum diabsen`}
          doneLabel="Absensi hari ini beres"
          actionLabel="Isi Absensi"
          onClick={() => navigate("/produksi/attendance?input=today")}
        />
        <TodayTile
          testId="today-report"
          done={reportCount > 0}
          actionAlways
          icon={Notebook}
          warnLabel="Belum ada laporan produksi hari ini"
          doneLabel={`${reportCount} baris laporan hari ini`}
          actionLabel={reportCount > 0 ? "Input Lagi" : "Input Produksi"}
          onClick={() => navigate("/produksi/daily-report?input=today")}
        />
        <TodayTile
          testId="today-rejected"
          done={rejected === 0}
          actionAlways
          icon={Package}
          warnLabel={`${rejected} Release Note ditolak QC`}
          doneLabel="Kelola Release Note"
          actionLabel={rejected > 0 ? "Ajukan Ulang" : "Buka Release Note"}
          onClick={() => navigate("/produksi/frn")}
        />
      </div>
    </section>
  );
}

function TodayTile({ done, icon: Icon, warnLabel, doneLabel, actionLabel, onClick, testId, actionAlways = false }) {
  const showAction = !done || actionAlways;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50/70"}`}
      data-testid={testId}
    >
      <span className={`grid place-items-center w-9 h-9 rounded-md shrink-0 ${done ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
        {done ? <CheckCircle size={20} weight="fill" /> : <Icon size={19} weight="duotone" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-semibold leading-tight ${done ? "text-emerald-800" : "text-slate-900"}`} style={{ fontFamily: "Chivo, sans-serif" }}>
          {done ? doneLabel : warnLabel}
        </div>
        {showAction && (
          <button
            onClick={onClick}
            data-testid={`${testId}-action`}
            className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${done ? "text-emerald-700 hover:text-emerald-900" : "text-amber-700 hover:text-amber-900"}`}
          >
            {actionLabel} <ArrowRight size={12} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
