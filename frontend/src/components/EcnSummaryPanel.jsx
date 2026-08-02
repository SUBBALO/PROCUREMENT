import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { PencilSimpleLine, Factory, ShieldCheck, Archive, Clock, ArrowSquareOut } from "@phosphor-icons/react";

const CHIP = "flex-1 min-w-[120px] border bg-white px-3 py-2";

export default function EcnSummaryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/ecn-register?kind=ecn")
      .then(({ data }) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (items.length === 0) return null;

  const cnt = {
    total: items.length,
    pending: items.filter((r) => r.status === "pending").length,
    revising: items.filter((r) => r.status === "in_progress" && !r.ack_stage).length,
    prod: items.filter((r) => r.ack_stage === "production").length,
    qc: items.filter((r) => r.ack_stage === "qa_qc").length,
    done: items.filter((r) => r.ack_stage === "done" || r.ack_doc_control).length,
  };

  const stats = [
    { key: "pending", label: "Menunggu Leader", value: cnt.pending, icon: Clock, cls: "border-amber-300 text-amber-700" },
    { key: "revising", label: "Sedang Revisi", value: cnt.revising, icon: PencilSimpleLine, cls: "border-teal-300 text-teal-700" },
    { key: "prod", label: "Menunggu Produksi", value: cnt.prod, icon: Factory, cls: "border-orange-300 text-orange-700" },
    { key: "qc", label: "Menunggu QA/QC", value: cnt.qc, icon: ShieldCheck, cls: "border-sky-300 text-sky-700" },
    { key: "done", label: "Selesai (Distribusi)", value: cnt.done, icon: Archive, cls: "border-emerald-300 text-emerald-700" },
  ];

  return (
    <div className="border-2 border-indigo-200 bg-indigo-50/40" data-testid="ecn-summary-panel">
      <div className="px-4 py-2 bg-indigo-600 text-white flex items-center gap-2">
        <PencilSimpleLine size={16} weight="bold" />
        <div className="text-[11px] uppercase tracking-widest font-bold">Ringkasan ECN — Perubahan Drawing</div>
        <span className="ml-2 text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{cnt.total} total</span>
        <Link to="/engineering/ecn" className="ml-auto text-[11px] font-bold inline-flex items-center gap-1 hover:underline" data-testid="ecn-summary-open">
          Buka Master List <ArrowSquareOut size={12} weight="bold" />
        </Link>
      </div>
      <div className="p-3 flex flex-wrap gap-2">
        {stats.map((s) => (
          <div key={s.key} className={`${CHIP} ${s.cls}`} data-testid={`ecn-stat-${s.key}`}>
            <div className="flex items-center gap-1.5">
              <s.icon size={14} weight="bold" />
              <span className="text-[10px] uppercase tracking-wider font-bold">{s.label}</span>
            </div>
            <div className="text-2xl font-bold mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
