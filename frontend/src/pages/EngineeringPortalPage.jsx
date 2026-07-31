import React, { useEffect, useState } from "react";
import DeptPortal from "../components/DeptPortal";
import api from "../lib/api";
import { Wrench, Package, CurrencyCircleDollar, FileText, ClipboardText, PaperPlaneTilt, Kanban, PenNib, ClipboardText as ClipboardIcon } from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";

export default function EngineeringPortalPage() {
  const { user } = useAuth();
  const isHead = ["eng_head", "eng_leader", "engineering", "admin", "super_admin", "supervisor"].includes(user?.role);
  const isEngUser = ["eng_head", "eng_leader", "engineering", "eng_staff", "admin", "super_admin", "supervisor"].includes(user?.role);
  const [drfPending, setDrfPending] = useState(0);
  const [myTasks, setMyTasks] = useState(0);
  const [pendingApproval, setPendingApproval] = useState(0);

  useEffect(() => {
    const fetchAll = () => {
      if (isHead) {
        api.get("/drawing-requests/pending-count-for-engineering")
          .then(({ data }) => setDrfPending(data?.count || 0)).catch(() => {});
        // Iter 22 — Eng Head lihat count drawing yg menunggu TTD Eng Head
        api.get("/drawings/pending-my-approval")
          .then(({ data }) => setPendingApproval(data?.total || 0)).catch(() => {});
      }
      if (isEngUser) {
        api.get("/drawings/my-assignments")
          .then(({ data }) => setMyTasks((data?.items || []).filter((d) => !["controlled", "released"].includes(d.approval_status)).length))
          .catch(() => {});
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 45000);
    return () => clearInterval(t);
  }, [isHead, isEngUser]);

  const CARDS = [
    ...(isHead ? [{
      key: "pending-approval",
      label: "Review & TTD Drawing dari Engineer",
      stats: "Cek hasil kerja engineer · TTD kalau OK",
      description: "Drawing yang sudah dikerjakan engineer & menunggu review Anda. Buka PDF → cek isi drawing, BOM, dimensi → kalau OK klik TTD & Approve, kalau perlu revisi klik Reject dengan catatan.",
      icon: PenNib,
      href: "/drawings/pending-my-approval",
      accent: "from-orange-500 via-amber-500 to-yellow-500",
      accentText: "text-orange-400",
      badgeCount: pendingApproval,
    }] : []),
    ...(isHead ? [{
      key: "drawing-request-inbox",
      label: "Drawing Request dari Sales",
      stats: "MKS-F-ENG-001 Inbox",
      description: "DRF dari Sales menunggu Anda accept & assign engineer. Klik Accept → auto-TTD Received By & form Register Drawing terbuka dengan data pre-filled.",
      icon: PaperPlaneTilt,
      href: "/engineering/drawing-request-inbox",
      accent: "from-emerald-500 via-green-500 to-teal-500",
      accentText: "text-emerald-400",
      badgeCount: drfPending,
    }] : []),
    ...(isEngUser ? [{
      key: "my-assignments",
      label: "Tugas Drawing Saya",
      stats: "Yang di-Assign ke Anda",
      description: "Semua drawing yang di-assign kepada Anda oleh Eng Head. Klik untuk edit / upload PDF / submit approval + track status.",
      icon: Kanban,
      href: "/engineering/my-assignments",
      accent: "from-teal-500 via-cyan-500 to-sky-500",
      accentText: "text-teal-400",
      badgeCount: myTasks,
    }] : []),
    {
      key: "costing", label: "Costing (Inquiry Sales)", stats: "Request dari Sales",
      description: "Lihat permintaan costing dari Sales, accept, upload hasil kerja & drawing.",
      icon: Wrench, href: "/engineering/inquiries",
      accent: "from-rose-500 via-red-500 to-orange-500", accentText: "text-rose-400",
    },
    {
      key: "material-costing", label: "Engineering Masterlist Material Price", stats: "Raw · Std Parts · Consumable · Subcon",
      description: "Katalog harga referensi untuk estimasi project. Purchasing input harga → auto-hitung berat & harga/Kg.",
      icon: CurrencyCircleDollar, href: "/engineering/material-costing",
      accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
    },
    {
      key: "drawings", label: "MKS-F-ENG-005 Drawing Master List", stats: "Register · Upload · Verifikasi PDF",
      description: "Register nomor drawing + upload PDF. Sistem verifikasi isi PDF, warning jika drawing_no tidak match.",
      icon: FileText, href: "/engineering/drawings",
      accent: "from-violet-500 via-purple-500 to-fuchsia-500", accentText: "text-violet-400",
    },
    {
      key: "master-list", label: "BOM Preparation & Approval", stats: "Draft · Review Eng Leader · Approved",
      description: "Ruang kerja Engineering untuk siapkan & review BOM. Draft diisi engineer → di-approve Engineering Leader → otomatis masuk BOM (halaman Purchasing).",
      icon: ClipboardText, href: "/engineering/master-list",
      accent: "from-emerald-500 via-teal-500 to-cyan-500", accentText: "text-emerald-400",
    },
    {
      key: "bom", label: "Bill of Material (BOM)", stats: "Untuk Purchasing · Yang sudah approved saja",
      description: "Halaman BOM final untuk Purchasing. Hanya BOM yang sudah di-approve Engineering Leader yang muncul di sini.",
      icon: Package, href: "/bom",
      accent: "from-amber-500 via-yellow-500 to-lime-500", accentText: "text-amber-400",
    },
    ...(isEngUser ? [{
      key: "sig-history",
      label: "Riwayat TTD Saya",
      stats: "Bukti Audit · ISO 9001",
      description: "Semua drawing yang pernah Anda TTD sebagai bukti audit. Lengkap dengan tanggal, jam, peran (Prepared By / Eng Head), dan link preview PDF.",
      icon: ClipboardIcon,
      href: "/my/signature-history",
      accent: "from-indigo-500 via-purple-500 to-fuchsia-500",
      accentText: "text-indigo-400",
    }] : []),
  ];

  return <DeptPortal deptLabel="Engineering Department" deptTagline="Drawing Request · Tugas Saya · Costing · BOM · Master Drawing" accentColor="amber" cards={CARDS} />;
}
