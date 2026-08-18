import React from "react";
import DeptPortal from "../components/DeptPortal";
import BackLink from "../components/BackLink";
import { useAuth } from "../lib/auth";
import { Coins, Lock } from "@phosphor-icons/react";

const FIN_ROLES = ["finance", "admin", "super_admin"];

export default function FinancePortalPage() {
  const { user } = useAuth();

  if (!FIN_ROLES.includes(user?.role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-md" data-testid="finance-portal-denied">
          <Lock size={40} weight="bold" className="mx-auto text-rose-500 mb-3" />
          <h1 className="text-lg font-bold text-slate-800">Akses Ditolak</h1>
          <p className="text-sm text-slate-500 mt-1">Portal Finance hanya untuk Finance &amp; Admin.</p>
          <div className="mt-4"><BackLink /></div>
        </div>
      </div>
    );
  }

  const CARDS = [
    {
      key: "daily-production",
      label: "Daily Production Report — Biaya Tenaga Kerja",
      stats: "Rate/Jam · Jam Kerja · Biaya",
      description:
        "Salinan laporan produksi harian + biaya tenaga kerja (rate/jam × jam kerja) dan Master Rate Karyawan. Rate hanya terlihat oleh Finance & Admin.",
      icon: Coins,
      href: "/finance/daily-production",
      accent: "from-emerald-500 via-green-500 to-teal-500",
      accentText: "text-emerald-400",
    },
  ];

  return (
    <DeptPortal
      deptLabel="Finance"
      deptTagline="Departemen Finance · Biaya Tenaga Kerja & Rate Karyawan"
      accentColor="emerald"
      cards={CARDS}
      compactCards
      cardsLabel="Menu Finance"
    />
  );
}
