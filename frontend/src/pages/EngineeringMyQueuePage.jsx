import React from "react";
import BackLink from "../components/BackLink";
import MyJobQueuePanel from "../components/MyJobQueuePanel";
import { Tray } from "@phosphor-icons/react";

export default function EngineeringMyQueuePage() {
  return (
    <div className="p-4 max-w-[1100px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
          <Tray size={14} weight="fill" /> Engineering · Antrian Job
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Antrian Job Saya
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Job yang ditugaskan Eng Leader kepada Anda. Klik <b>Terima</b> untuk mulai kerja (tanggal start tercatat), lalu buka Work Order saat siap mengerjakan.
        </p>
      </div>
      <MyJobQueuePanel />
    </div>
  );
}
