import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeptPortal from "../components/DeptPortal";
import EngineeringQueuePanel from "../components/EngineeringQueuePanel";
import MyJobQueuePanel from "../components/MyJobQueuePanel";
import api from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  Wrench, Package, CurrencyCircleDollar, FileText, Kanban, ClipboardText as ClipboardIcon,
  Tray, PencilSimpleLine, Factory, ShieldCheck, Archive, Clock, ArrowSquareOut,
} from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";

export default function EngineeringPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHead = ["eng_head", "eng_leader", "engineering", "admin", "super_admin", "supervisor"].includes(user?.role);
  const isEngUser = ["eng_head", "eng_leader", "engineering", "eng_staff", "admin", "super_admin", "supervisor"].includes(user?.role);

  // ── Ringkasan ECN (dipindah dari panel → kartu + dialog) ──
  const [ecnItems, setEcnItems] = useState([]);
  const [ecnOpen, setEcnOpen] = useState(false);

  useEffect(() => {
    api.get("/ecn-register?kind=ecn")
      .then(({ data }) => setEcnItems(data.items || []))
      .catch(() => setEcnItems([]));
  }, []);

  const ecn = useMemo(() => {
    const items = ecnItems || [];
    return {
      total: items.length,
      pending: items.filter((r) => r.status === "pending").length,
      revising: items.filter((r) => r.status === "in_progress" && !r.ack_stage).length,
      prod: items.filter((r) => r.ack_stage === "production").length,
      qc: items.filter((r) => r.ack_stage === "qa_qc").length,
      done: items.filter((r) => r.ack_stage === "done" || r.ack_doc_control).length,
    };
  }, [ecnItems]);

  const ecnStats = [
    { key: "pending", label: "Menunggu Leader", value: ecn.pending, icon: Clock, cls: "border-amber-300 text-amber-700 bg-amber-50/60" },
    { key: "revising", label: "Sedang Revisi", value: ecn.revising, icon: PencilSimpleLine, cls: "border-teal-300 text-teal-700 bg-teal-50/60" },
    { key: "prod", label: "Menunggu Produksi", value: ecn.prod, icon: Factory, cls: "border-orange-300 text-orange-700 bg-orange-50/60" },
    { key: "qc", label: "Menunggu QA/QC", value: ecn.qc, icon: ShieldCheck, cls: "border-sky-300 text-sky-700 bg-sky-50/60" },
    { key: "done", label: "Selesai (Distribusi)", value: ecn.done, icon: Archive, cls: "border-emerald-300 text-emerald-700 bg-emerald-50/60" },
  ];

  const CARDS = [
    ...(isEngUser ? [{
      key: "my-queue",
      label: "Antrian Job Saya",
      stats: "Terima Job · Mulai Kerja",
      description: "Job yang ditugaskan Eng Leader kepada Anda. Klik Terima untuk mulai kerja (tanggal start tercatat), lalu buka Work Order saat siap.",
      icon: Tray,
      href: "/engineering/my-queue",
      accent: "from-teal-500 via-emerald-500 to-green-500",
      accentText: "text-teal-400",
    }] : []),
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
      stats: isHead ? "Terima DRF · Assign · Pantau" : "DRF Ditugaskan ke Saya",
      description: isHead
        ? "Satu pintu Engineering: terima Drawing Request dari Sales, tunjuk engineer yang mengerjakan, dan pantau yang sedang dikerjakan. Engineer lalu generate nomor drawing (bisa >1 berbagi 1 BOM), upload & TTD."
        : "Drawing Request yang ditugaskan Eng Leader kepada Anda. Buka untuk generate nomor drawing (bisa >1 dalam 1 request, berbagi 1 BOM), upload dokumen (MKS, customer dwg, nesting), isi BOM, lalu TTD & submit.",
      icon: Kanban,
      href: "/engineering/work-orders",
      accent: "from-teal-500 via-cyan-500 to-sky-500",
      accentText: "text-teal-400",
    }] : []),
    {
      key: "ecn", label: "Ringkasan ECN & ECR", stats: "Perubahan Drawing · Klik lihat ringkasan",
      description: "Ringkasan status perubahan drawing (ECN) harian. Klik untuk lihat statistik lengkap & buka arsip Master List ECN & ECR.",
      icon: PencilSimpleLine, onClick: () => setEcnOpen(true),
      badgeCount: ecn.total,
      accent: "from-indigo-500 via-violet-500 to-fuchsia-500", accentText: "text-indigo-400",
    },
    {
      key: "costing", label: "Costing (Inquiry Sales)", stats: "Request dari Sales",
      description: "Lihat permintaan costing dari Sales, accept, upload hasil kerja & drawing.",
      icon: Wrench, href: "/engineering/inquiries",
      accent: "from-rose-500 via-red-500 to-orange-500", accentText: "text-rose-400",
    },
    {
      key: "inquiry-masterlist", label: "Masterlist Inquiry", stats: "Kategori · Tgl Terima · Tgl Selesai",
      description: "Rekap seluruh inquiry costing: kategori pekerjaan (Simple/Moderate/Complex), tanggal terima, dan tanggal selesai. View-only untuk pantau progress.",
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
    <>
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

      {/* Dialog Ringkasan ECN — dibuka saat kartu ECN diklik */}
      <Dialog open={ecnOpen} onOpenChange={setEcnOpen}>
        <DialogContent className="max-w-2xl" data-testid="ecn-summary-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <PencilSimpleLine size={20} weight="bold" />
              Ringkasan ECN — Perubahan Drawing
              <span className="ml-1 text-[11px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold" data-testid="ecn-summary-total">
                {ecn.total} total
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {ecnStats.map((s) => (
              <div key={s.key} className={`border ${s.cls} px-3 py-2.5 rounded-md`} data-testid={`ecn-stat-${s.key}`}>
                <div className="flex items-center gap-1.5">
                  <s.icon size={15} weight="bold" />
                  <span className="text-[10px] uppercase tracking-wider font-bold">{s.label}</span>
                </div>
                <div className="text-3xl font-bold mt-1 tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => { setEcnOpen(false); navigate("/engineering/ecn"); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="ecn-summary-open-masterlist"
            >
              <ArrowSquareOut size={16} weight="bold" className="mr-1.5" />
              Buka Master List ECN & ECR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
