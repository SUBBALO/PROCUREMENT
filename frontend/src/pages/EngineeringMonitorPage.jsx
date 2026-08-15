import React, { useState } from "react";
import BackLink from "../components/BackLink";
import EngineeringWorkloadPage from "./EngineeringWorkloadPage";
import SoTrackerListPage from "./SoTrackerListPage";
import EngineeringKpiPage from "./EngineeringKpiPage";
import { Gauge, Kanban, ChartLineUp } from "@phosphor-icons/react";

const TABS = [
  { key: "workload", label: "Beban Kerja", icon: Gauge, Comp: EngineeringWorkloadPage },
  { key: "so-tracker", label: "SO Tracker", icon: Kanban, Comp: SoTrackerListPage },
  { key: "kpi", label: "KPI", icon: ChartLineUp, Comp: EngineeringKpiPage },
];

export default function EngineeringMonitorPage() {
  const [tab, setTab] = useState("workload");
  const Active = TABS.find((t) => t.key === tab)?.Comp || TABS[0].Comp;

  return (
    <div className="max-w-[1400px] mx-auto p-4">
      <BackLink />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-700 mb-2">
        Engineering · Monitor
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-1" data-testid="eng-monitor-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`eng-monitor-tab-${t.key}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
                active
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={15} weight={active ? "fill" : "regular"} /> {t.label}
            </button>
          );
        })}
      </div>
      {/* Render halaman existing sebagai isi tab (logika tidak diubah) */}
      <Active embedded />
    </div>
  );
}
