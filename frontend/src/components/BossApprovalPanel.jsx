import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Stamp, ArrowRight, CalendarBlank } from "@phosphor-icons/react";

/**
 * BossApprovalPanel — muncul di halaman utama (Command Center) untuk Direktur (sales_head).
 * Menampilkan inquiry costing dari Sales yang MENUNGGU APPROVAL beliau (status pending_boss_review).
 * Posisi: di ATAS panel Progress SO. Klik "Review & Approve" → buka detail inquiry.
 */
export default function BossApprovalPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/inquiries", { params: { status: "pending_boss_review" } });
      setItems((data?.items || []).filter((q) => q.status === "pending_boss_review"));
    } catch (e) {
      setItems([]);
    } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (!loaded || items.length === 0) return null;

  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");

  return (
    <div className="border-2 border-fuchsia-500 bg-white mb-4" data-testid="boss-approval-panel">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-fuchsia-700 text-white">
        <Stamp size={17} weight="fill" />
        <span className="text-[12px] font-bold uppercase tracking-[0.15em]">Butuh Approval Anda — Inquiry dari Sales</span>
        <span className="ml-auto px-2 py-0.5 bg-white text-fuchsia-700 text-[11px] font-bold" data-testid="boss-approval-count">
          {items.length} menunggu
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-fuchsia-50/50" data-testid={`boss-approval-row-${q.inquiry_no}`}>
            <div className="flex-1 min-w-[240px]">
              <div className="font-mono font-bold text-slate-900 text-sm">{q.inquiry_no}</div>
              <div className="text-[12px] text-slate-600 truncate">
                {q.title || "-"} · <b>{q.customer_name || "-"}</b>
                {q.project_name ? <span className="text-slate-400"> · {q.project_name}</span> : null}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Dibuat oleh {q.created_by_name || q.created_by || "-"} · {fmt(q.created_at)}
                {q.customer_deadline && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                    <CalendarBlank size={11} weight="bold" /> Deadline: {fmt(q.customer_deadline)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate(`/sales/inquiries?open=${q.id}`)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-[11px] font-bold uppercase tracking-wider"
              data-testid={`boss-approval-open-${q.inquiry_no}`}
            >
              Review &amp; Approve <ArrowRight size={13} weight="bold" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
