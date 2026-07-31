import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import BackLink from "../components/BackLink";
import {
  ChatText, Receipt, ListChecks, ShoppingCart, Truck, ClockCounterClockwise,
  ArrowRight, Buildings, Package, Info, LockKey,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const EVENT_ICON = {
  inquiry: ChatText,
  quotation: Receipt,
  bom: ListChecks,
  purchase: ShoppingCart,
  delivery: Truck,
};

const EVENT_COLOR = {
  inquiry: "rose",
  quotation: "emerald",
  bom: "amber",
  purchase: "sky",
  delivery: "violet",
};

export default function SOTimelinePage() {
  const { so_no } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/timeline/so/${encodeURIComponent(so_no)}`);
        setData(data);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Gagal memuat timeline SO");
      } finally {
        setLoading(false);
      }
    })();
  }, [so_no]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">Memuat timeline…</div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="rounded-none border-slate-200 p-6 text-center">
          <div className="text-sm text-slate-500">SO {so_no} tidak ditemukan.</div>
        </Card>
      </div>
    );
  }

  const { summary, events, price_hidden } = data;
  const master = summary.master_so;

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">Sales Order Timeline</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 font-mono" style={{ fontFamily: "Chivo, sans-serif" }}>
          SO {summary.so_no}
        </h1>
        {master ? (
          <p className="mt-2 text-sm text-slate-600">
            <b className="text-slate-900">{master.customer || "-"}</b>
            {master.description ? ` — ${master.description}` : ""}
            {master.so_date && <> · <span className="text-slate-500">Tanggal SO: {formatDateID(master.so_date)}</span></>}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500 italic">Master SO belum terdaftar untuk nomor ini.</p>
        )}
        {price_hidden && (
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <LockKey size={12} weight="bold" /> Harga & nilai disembunyikan (role Store)
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <SummaryCard label="Inquiry" value={summary.counts.inquiries} color="rose" icon={ChatText} />
        <SummaryCard label="Quotation" value={summary.counts.quotations} color="emerald" icon={Receipt} />
        <SummaryCard label="BOM Revisi" value={summary.counts.bom_revisions} color="amber" icon={ListChecks} />
        <SummaryCard label="Pembelian" value={summary.counts.purchases} color="sky" icon={ShoppingCart} />
        <SummaryCard label="Pengiriman" value={summary.counts.deliveries} color="violet" icon={Truck} />
      </div>

      {/* Total spend (if not store role) */}
      {!price_hidden && summary.totals_by_currency && Object.keys(summary.totals_by_currency).length > 0 && (
        <Card className="rounded-none border-sky-200 bg-sky-50 p-3">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-sky-700 mb-2">Total Pengeluaran Pembelian</div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(summary.totals_by_currency).map(([cur, amt]) => (
              <div key={cur}>
                <div className="text-[9px] uppercase text-sky-600 tracking-[0.1em]">{cur}</div>
                <div className="text-lg font-bold font-mono tabular-nums text-sky-900">
                  {Number(amt).toLocaleString("id-ID")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Timeline */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <ClockCounterClockwise size={14} weight="bold" className="text-slate-500" />
          <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
            Timeline Kronologis — {events.length} event
          </span>
        </div>

        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400 italic">
            Belum ada aktivitas untuk SO ini.
          </div>
        ) : (
          <div className="relative p-4">
            {/* Vertical line */}
            <div className="absolute left-8 top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-4">
              {events.map((e, idx) => {
                const Icon = EVENT_ICON[e.type] || Info;
                const color = EVENT_COLOR[e.type] || "slate";
                return (
                  <div key={idx} className="relative pl-14" data-testid={`timeline-event-${idx}`}>
                    <div className={`absolute left-4 top-1 w-8 h-8 flex items-center justify-center border-2 border-${color}-300 bg-${color}-50 text-${color}-700`}>
                      <Icon size={14} weight="duotone" />
                    </div>
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className={`text-[10px] uppercase tracking-[0.15em] font-bold text-${color}-700`}>{e.type}</span>
                      <span className="text-xs tabular-nums text-slate-500">{e.when ? formatDateID(e.when) : "-"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-slate-900">{e.title}</div>
                        {e.detail && <div className="text-xs text-slate-600 mt-0.5">{e.detail}</div>}
                        {e.actor && <div className="text-[10px] text-slate-400 mt-0.5">Oleh: {e.actor}</div>}
                      </div>
                      {e.link && (
                        <Link
                          to={e.link_id ? `${e.link}?open=${e.link_id}` : e.link}
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-2 py-1 transition-colors shrink-0"
                        >
                          Buka <ArrowRight size={10} weight="bold" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, color, icon: Icon }) {
  return (
    <Card className={`rounded-none border-${color}-200 bg-${color}-50 p-3 shadow-none`}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-[10px] uppercase tracking-[0.15em] font-bold text-${color}-700`}>{label}</div>
          <div className={`text-2xl font-bold tabular-nums text-${color}-900 mt-1`} style={{ fontFamily: "Chivo, sans-serif" }}>{value || 0}</div>
        </div>
        <Icon size={20} weight="duotone" className={`text-${color}-500`} />
      </div>
    </Card>
  );
}
