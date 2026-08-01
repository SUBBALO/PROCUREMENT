import React, { useState, useEffect } from "react";
import BackLink from "../components/BackLink";
import ControlledDrawingDatabasePage from "./ControlledDrawingDatabasePage";
import ControlledDocsManager from "../components/ControlledDocsManager";
import api from "../lib/api";
import { Compass, FileText, Archive } from "@phosphor-icons/react";

/**
 * Controlled Document Register — pusat dokumen terkontrol Document Control.
 * Tab: Drawing (dari database drawing controlled) · Dokumen ISO (controlled) · Obsolete (arsip).
 */
export default function ControlledDocumentRegisterPage() {
  const [tab, setTab] = useState("drawing");
  const [counts, setCounts] = useState({ controlled: 0, obsolete: 0 });

  const loadCounts = () => {
    api.get("/controlled-documents/counts").then(({ data }) => setCounts(data)).catch(() => {});
  };
  useEffect(() => { loadCounts(); }, []);

  const TABS = [
    { key: "drawing", label: "Drawing", icon: Compass, color: "bg-indigo-100 text-indigo-800 border-indigo-500" },
    { key: "iso", label: "Dokumen ISO", icon: FileText, color: "bg-red-100 text-red-800 border-red-500", badge: counts.controlled },
    { key: "obsolete", label: "Obsolete", icon: Archive, color: "bg-rose-100 text-rose-800 border-rose-500", badge: counts.obsolete },
  ];

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink to="/" />
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Controlled Document Register
        </h1>
        <div className="text-xs text-slate-500 mt-1">
          Register dokumen terkontrol — Drawing MKS, Dokumen ISO (Prosedur/Manual/IK/Form), dan arsip Obsolete.
          Preview view-only; revisi baru otomatis membuat versi lama menjadi OBSOLETE.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 flex-wrap" data-testid="register-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px flex items-center gap-1.5 ${active ? t.color : "border-transparent text-slate-500 hover:text-slate-800"}`}
              data-testid={`register-tab-${t.key}`}
            >
              <Icon size={14} weight={active ? "fill" : "regular"} /> {t.label}
              {t.badge ? <span className="ml-1 min-w-[18px] h-4 px-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-slate-700 text-white">{t.badge}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="pt-1">
        {tab === "drawing" && <ControlledDrawingDatabasePage embedded />}
        {tab === "iso" && <ControlledDocsManager view="controlled" onChanged={loadCounts} />}
        {tab === "obsolete" && <ControlledDocsManager view="obsolete" onChanged={loadCounts} />}
      </div>
    </div>
  );
}
