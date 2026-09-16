import React from "react";
import { Tray } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import PageTabNav from "../components/PageTabNav";
import MyJobQueuePanel from "../components/MyJobQueuePanel";
import { useWorkOrderTabs } from "../hooks/useEngTabs";

export default function EngineeringMyQueuePage() {
  const woTabs = useWorkOrderTabs();
  return (
    <div className="p-4 max-w-[1100px] mx-auto space-y-4">
      <BackLink />
      {woTabs.length > 1 && <PageTabNav tabs={woTabs} />}
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
          <Tray size={14} weight="fill" /> Engineering · Antrian Job
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Antrian Job Saya
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Job yang ditugaskan Eng Leader kepada Anda. Alurnya: <b>Terima</b> (akui pekerjaan) → <b>Mulai Kerjakan</b> (mulai menggambar) → <b>Buka Work Order</b> untuk mengerjakan.
        </p>
      </div>
      <MyJobQueuePanel />
    </div>
  );
}
