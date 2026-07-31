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
    ...(isEngUser ? [{
      key: "work-orders",
      label: "Work Order Engineering",
      stats: isHead ? "Terima DRF · Assign · Pantau" : "DRF Ditugaskan ke Saya",
      description: isHead
        ? "Satu pintu Engineering: terima Drawing Request dari Sales, tunjuk engineer yang mengerjakan, dan pantau yang sedang dikerjakan. Engineer lalu generate nomor drawing (bisa >1 berbagi 1 BOM), upload & TTD."
        : "Drawing Request yang ditugaskan Eng Leader kepada Anda. Buka untuk generate nomor drawing (bisa >1 dalam 1 request, berbagi 1 BOM), upload dokumen (MKS, customer dwg, nesting), isi BOM, lalu TTD & submit.",
      icon: Kanban,
      href: "/engineering/work-orders",
      accent: "from-teal-500 via-cyan-500 to-sky-500",
      accentText: "text-teal-400",
      badgeCount: (drfPending || 0) + (myTasks || 0),
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
      key: "drawings", label: "Drawing Master List", stats: "Katalog View-Only · Cari via SO",
      description: "Katalog semua drawing (DWG MKS + No. DWG Customer). View-only — cari cukup dengan Nomor SO untuk melihat drawing MKS & customer terkait.",
      icon: FileText, href: "/engineering/drawings",
      accent: "from-violet-500 via-purple-500 to-fuchsia-500", accentText: "text-violet-400",
    },
    {
      key: "ecn", label: "Perubahan Drawing — ECR & ECN", stats: "ECR (Customer) · ECN (Internal MKS)",
      description: "Pengajuan perubahan drawing/BOM. ECR = perubahan diminta customer; ECN = perubahan internal MKS dari engineer. Submit ke Eng Leader untuk review & approve.",
      icon: ClipboardIcon, href: "/engineering/ecn",
      accent: "from-rose-500 via-pink-500 to-fuchsia-500", accentText: "text-rose-400",
    },
    {
      key: "bom", label: "Bill of Material (BOM)", stats: "Untuk Purchasing · Yang sudah approved saja",
      description: "Halaman BOM final untuk Purchasing. Hanya BOM yang sudah di-approve Engineering Leader yang muncul di sini.",
      icon: Package, href: "/bom",
      accent: "from-amber-500 via-yellow-500 to-lime-500", accentText: "text-amber-400",
    },
  ];

  return <DeptPortal deptLabel="Engineering Department" deptTagline="Drawing Request · Tugas Saya · Costing · BOM · Master Drawing" accentColor="amber" cards={CARDS} />;
}
