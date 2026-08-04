import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import EngineeringQueuePanel from "../components/EngineeringQueuePanel";
import MyJobQueuePanel from "../components/MyJobQueuePanel";
import api from "../lib/api";
import {
  Wrench, Package, CurrencyCircleDollar, FileText, Kanban, ClipboardText as ClipboardIcon,
  Tray, PencilSimpleLine, Gauge, ChartLineUp, WarningCircle,
} from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";

export default function EngineeringPortalPage() {
  const { user } = useAuth();
  const isHead = ["eng_head", "eng_leader", "engineering", "admin", "super_admin", "supervisor"].includes(user?.role);
  const isEngUser = ["eng_head", "eng_leader", "engineering", "eng_staff", "admin", "super_admin", "supervisor"].includes(user?.role);

  // Badge jumlah ECN pada kartu (angka total perubahan drawing)
  const [ecnTotal, setEcnTotal] = useState(0);
  const [jobPending, setJobPending] = useState(0);   // job menunggu diterima (my-queue)
  const [drfPending, setDrfPending] = useState(0);    // DRF menunggu ditangani (Eng Leader)
  const [overloadCount, setOverloadCount] = useState(0); // engineer overload (monitor beban)
  const [ncActive, setNcActive] = useState(0);            // NC/CAR belum tuntas
  useEffect(() => {
    api.get("/ecn-register?kind=ecn")
      .then(({ data }) => setEcnTotal((data.items || []).length))
      .catch(() => setEcnTotal(0));
    if (isEngUser) {
      api.get("/nonconformance/stats")
        .then(({ data }) => setNcActive(data?.open_or_active || 0))
        .catch(() => setNcActive(0));
    }
    if (isEngUser) {
      api.get("/drawing-requests/my-queue")
        .then(({ data }) => setJobPending(data.pending_count || 0))
        .catch(() => setJobPending(0));
      api.get("/engineering/workload")
        .then(({ data }) => setOverloadCount(data?.summary?.overload || 0))
        .catch(() => setOverloadCount(0));
    }
    if (isHead) {
      api.get("/drawing-requests/pending-count-for-engineering")
        .then(({ data }) => setDrfPending(data.count || 0))
        .catch(() => setDrfPending(0));
    }
  }, [isEngUser, isHead]);

  const CARDS = [
    ...(isEngUser ? [{
      key: "so-tracker",
      label: "SO Document Tracker",
      stats: "Progress per-SO · Terbit Partial · BOM Siap Beli",
      description: "Pantau progress tiap SO: status BOM & drawing bisa terbit bertahap. Tandai drawing terbit partial atau BOM siap dibeli untuk Purchasing.",
      icon: Kanban,
      href: "/engineering/so-tracker",
      accent: "from-cyan-500 via-teal-500 to-emerald-500",
      accentText: "text-cyan-400",
    }] : []),
    ...(isEngUser ? [{
      key: "work-orders",
      label: "Work Order Engineering",
      stats: isHead ? "Terima DRF · Assign · Pantau" : "Job Saya · Kerjakan Drawing",
      description: isHead
        ? "Satu pintu Engineering: terima Drawing Request dari Sales, tunjuk engineer yang mengerjakan, dan pantau yang sedang dikerjakan. Engineer lalu generate nomor drawing (bisa >1 berbagi 1 BOM), upload & TTD."
        : "Berisi tab Job Saya (terima & mulai kerja job yang ditugaskan) dan Work Order (generate nomor drawing, upload dokumen, isi BOM, lalu TTD & submit).",
      icon: Kanban,
      href: isHead ? "/engineering/work-orders" : "/engineering/my-queue",
      badgeCount: isHead ? drfPending : jobPending,
      accent: "from-teal-500 via-cyan-500 to-sky-500",
      accentText: "text-teal-400",
    }] : []),
    {
      key: "ecn", label: "Master List ECN & ECR", stats: "Perubahan Drawing · Ringkasan + Arsip",
      description: "Buka arsip perubahan drawing. Ringkasan status (Menunggu Leader / Revisi / Produksi / QA-QC / Selesai) tampil di bagian atas halaman.",
      icon: PencilSimpleLine, href: "/engineering/ecn",
      badgeCount: ecnTotal,
      accent: "from-indigo-500 via-violet-500 to-fuchsia-500", accentText: "text-indigo-400",
    },
    ...(isEngUser ? [{
      key: "nonconformance", label: "Nonconformance (CAR)", stats: "MKS-F-QAD-004 · Tindak Lanjut NC",
      description: "NC/CAR atas Drawing dari QC/Produksi/Sales. Eng Leader assign ke staff, isi Root Cause & Corrective/Preventive Action, terbitkan ECN, lalu tutup (Closed). Memengaruhi KPI #1.",
      icon: WarningCircle, href: "/nonconformance",
      badgeCount: ncActive,
      accent: "from-rose-500 via-red-500 to-orange-500", accentText: "text-rose-400",
    }] : []),
    ...(isEngUser ? [{
      key: "eng-process", label: "Internal Engineering Process", stats: "MKS-F-ENG-006 · Log NC + Export Excel",
      description: "Log proses internal Engineering (tab NC) dari data CAR: Root Cause, Corrective & Preventive Action, No ECN, status. Filter per bulan dan export ke Excel untuk arsip/audit.",
      icon: ClipboardIcon, href: "/engineering/process",
      accent: "from-amber-500 via-orange-500 to-rose-500", accentText: "text-amber-400",
    }] : []),
    ...(isHead ? [{
      key: "kpi", label: "KPI Engineering", stats: "Laporan Bulanan · Auditable",
      description: "Skor KPI bulanan (drawing/BOM compliance, on-time, validasi MKS) dihitung otomatis dari data ERP. Klik tiap indikator untuk telusur audit record aslinya.",
      icon: ChartLineUp, href: "/engineering/kpi",
      accent: "from-emerald-500 via-teal-500 to-cyan-500", accentText: "text-emerald-400",
    }] : []),
    ...(isHead ? [{
      key: "workload", label: "Monitor Beban Kerja", stats: "Beban per Engineer · Overload",
      description: "Pantau beban kerja tiap engineer (DRF + Drawing + Inquiry + ECN). Lihat siapa yang Overload / Sibuk / Normal beserta jumlah tugas terlambat.",
      icon: Gauge, href: "/engineering/workload",
      badgeCount: overloadCount,
      accent: "from-rose-500 via-orange-500 to-amber-500", accentText: "text-rose-400",
    }] : []),
    {
      key: "inquiry-masterlist", label: "Masterlist Inquiry", stats: "Antrian Aktif + Rekap · via Tab",
      description: "Pusat Inquiry Costing: tab Antrian Aktif (accept & upload hasil kerja dari Sales) dan tab Masterlist (rekap semua inquiry: kategori, tgl terima, tgl selesai, lampiran).",
      icon: ClipboardIcon, href: "/engineering/inquiry-masterlist",
      accent: "from-amber-500 via-orange-500 to-red-500", accentText: "text-amber-400",
    },
    {
      key: "material-costing", label: "Engineering Masterlist Material Price", stats: "Raw · Std Parts · Consumable · Subcon",
      description: "Katalog harga referensi untuk estimasi project. Purchasing input harga → auto-hitung berat & harga/Kg.",
      icon: CurrencyCircleDollar, href: "/engineering/material-costing",
      accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
    },
    {
      key: "drawings", label: "Drawing Master List", stats: "Katalog View-Only · Cari via SO",
      description: "Katalog semua drawing (DWG MKS + No. DWG Customer). View-only — cari cukup dengan Nomor SO untuk melihat drawing MKS & customer terkait.",
      icon: FileText, href: "/engineering/drawings",
      accent: "from-violet-500 via-purple-500 to-fuchsia-500", accentText: "text-violet-400",
    },
    {
      key: "bom", label: "Bill of Material (BOM)", stats: "Untuk Purchasing · Yang sudah approved saja",
      description: "Halaman BOM final untuk Purchasing. Hanya BOM yang sudah di-approve Engineering Leader yang muncul di sini.",
      icon: Package, href: "/bom",
      accent: "from-amber-500 via-yellow-500 to-lime-500", accentText: "text-amber-400",
    },
  ];

  return (
    <DeptPortal
      deptLabel="Engineering Department"
      deptTagline="Menu di atas · Antrian Drawing Request · Tugas Saya di bawah"
      accentColor="amber"
      cards={CARDS}
      compactCards
      cardsFirst
      cardsLabel="Menu Engineering"
    >
      <EngineeringQueuePanel isHead={isHead} isEngUser={isEngUser} />
      {isEngUser && <MyJobQueuePanel compact />}
    </DeptPortal>
  );
}
