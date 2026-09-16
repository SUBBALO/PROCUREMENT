import React from "react";
import BackLink from "../components/BackLink";
import SignatureHistoryPanel from "../components/SignatureHistoryPanel";
import { PenNib } from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";

export default function MySignatureHistoryPage() {
  const { user } = useAuth();
  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-700 mb-1">
          <PenNib size={14} weight="fill" /> Bukti Audit — TTD Digital
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Riwayat TTD Saya
        </h1>
      </div>
      <SignatureHistoryPanel user={user} />
    </div>
  );
}
