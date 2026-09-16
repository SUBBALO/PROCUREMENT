import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import BackLink from "../components/BackLink";
import {
  ChatText, Receipt, ListChecks, ShoppingCart, Truck, ClockCounterClockwise,
  ArrowRight, Buildings, Package, Info, LockKey, Ruler, Factory, Stamp,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const EVENT_ICON = {
  inquiry: ChatText,
  quotation: Receipt,
  bom: ListChecks,
  purchase: ShoppingCart,
  delivery: Truck,
  drawing: Ruler,
  production: Factory,
  doccon: Stamp,
};

const EVENT_COLOR = {
  inquiry: "rose",
  quotation: "emerald",
  bom: "amber",
  purchase: "sky",
  delivery: "violet",
  drawing: "indigo",
  production: "orange",
  doccon: "teal",
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
          <div className="relative p-3">
            {/* Vertical line */}
            <div className="absolute left-[26px] top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-1">
              {events.map((e, idx) => {
                const Icon = EVENT_ICON[e.type] || Info;
                const color = EVENT_COLOR[e.type] || "sky";
                const c = CARD_CLS[color] || CARD_CLS.sky;
                return (
                  <div key={idx} className="relative pl-10 py-1.5 border-b border-slate-100 last:border-0" data-testid={`timeline-event-${idx}`}>
                    <div className={`absolute left-1 top-1.5 w-6 h-6 flex items-center justify-center border ${c.box} ${c.label}`}>
                      <Icon size={12} weight="duotone" />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-[9px] uppercase tracking-[0.12em] font-bold ${c.label}`}>{e.type}</span>
                          <span className="text-[11px] tabular-nums text-slate-400">{e.when ? formatDateID(e.when) : "-"}</span>
                          <span className="font-semibold text-[13px] text-slate-900 truncate">{e.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {e.detail}{e.detail && e.actor ? " · " : ""}{e.actor ? `Oleh: ${e.actor}` : ""}
                        </div>
                      </div>
                      {e.link && (
                        <Link
                          to={e.link_id ? `${e.link}?open=${e.link_id}` : e.link}
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-2 py-0.5 transition-colors shrink-0"
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

const CARD_CLS = {
  rose: { box: "border-rose-200 bg-rose-50", label: "text-rose-700", val: "text-rose-900", icon: "text-rose-500" },
  emerald: { box: "border-emerald-200 bg-emerald-50", label: "text-emerald-700", val: "text-emerald-900", icon: "text-emerald-500" },
  amber: { box: "border-amber-200 bg-amber-50", label: "text-amber-700", val: "text-amber-900", icon: "text-amber-500" },
  sky: { box: "border-sky-200 bg-sky-50", label: "text-sky-700", val: "text-sky-900", icon: "text-sky-500" },
  violet: { box: "border-violet-200 bg-violet-50", label: "text-violet-700", val: "text-violet-900", icon: "text-violet-500" },
  indigo: { box: "border-indigo-200 bg-indigo-50", label: "text-indigo-700", val: "text-indigo-900", icon: "text-indigo-500" },
  orange: { box: "border-orange-200 bg-orange-50", label: "text-orange-700", val: "text-orange-900", icon: "text-orange-500" },
  teal: { box: "border-teal-200 bg-teal-50", label: "text-teal-700", val: "text-teal-900", icon: "text-teal-500" },
};

function SummaryCard({ label, value, color, icon: Icon }) {
  const c = CARD_CLS[color] || CARD_CLS.sky;
  return (
    <Card className={`rounded-none ${c.box} p-3 shadow-none`}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-[10px] uppercase tracking-[0.15em] font-bold ${c.label}`}>{label}</div>
          <div className={`text-2xl font-bold tabular-nums ${c.val} mt-1`} style={{ fontFamily: "Chivo, sans-serif" }}>{value || 0}</div>
        </div>
        <Icon size={20} weight="duotone" className={c.icon} />
      </div>
    </Card>
  );
}
