import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import BackLink from "../components/BackLink";
import {
  ArrowClockwise, UsersThree, Hourglass, TrayArrowDown, Gear, CaretDown, CaretRight,
  ClipboardText, FileText, Calculator, ClockCounterClockwise, ArrowRight,
} from "@phosphor-icons/react";

const STAGE_META = {
  antri: { label: "Antri", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  diterima: { label: "Diterima", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  proses: { label: "Proses", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function EngineeringLogworkPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/engineering/logwork");
      setItems(data.items || []);
    } catch (e) { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const totals = items.reduce((a, e) => {
    a.antri += e.counts?.antri || 0; a.diterima += e.counts?.diterima || 0;
    a.proses += e.counts?.proses || 0; a.active += e.total_active || 0; return a;
  }, { antri: 0, diterima: 0, proses: 0, active: 0 });

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4">
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-700 mb-1">
            <UsersThree size={16} weight="fill" /> Engineering · Logwork
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Beban Kerja Engineer
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Pantau apa yang sedang dikerjakan tiap engineer. Klik nama untuk lihat detail (SO / Inquiry / Drawing) & riwayatnya.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider hover:bg-slate-50" data-testid="logwork-refresh">
          <ArrowClockwise size={14} /> Refresh
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <TotalChip icon={Hourglass} color="text-amber-700 border-amber-300" label="Antri" n={totals.antri} />
        <TotalChip icon={TrayArrowDown} color="text-sky-700 border-sky-300" label="Diterima" n={totals.diterima} />
        <TotalChip icon={Gear} color="text-emerald-700 border-emerald-300" label="Proses" n={totals.proses} />
        <TotalChip icon={ClipboardText} color="text-slate-700 border-slate-300" label="Total Item Aktif" n={totals.active} />
      </div>

      {loading ? (
        <div className="border-2 border-slate-200 bg-white p-8 text-center text-slate-400">
          <ArrowClockwise size={22} className="mx-auto animate-spin mb-1" /> Memuat logwork...
        </div>
      ) : items.length === 0 ? (
        <div className="border-2 border-slate-200 bg-white p-8 text-center text-slate-400">Belum ada data engineer.</div>
      ) : (
        <div className="space-y-2" data-testid="logwork-list">
          {items.map((e) => {
            const isOpen = !!open[e.user_id];
            const c = e.counts || {};
            return (
              <div key={e.user_id} className="border-2 border-slate-200 bg-white" data-testid={`logwork-eng-${e.user_id}`}>
                <button onClick={() => toggle(e.user_id)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
                  {isOpen ? <CaretDown size={16} className="text-slate-500 shrink-0" /> : <CaretRight size={16} className="text-slate-500 shrink-0" />}
                  <div className="flex-1 min-w-[160px]">
                    <div className="font-bold text-slate-900">{e.name}</div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">{e.role}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <Stage n={c.antri} cls={STAGE_META.antri.cls} label="Antri" />
                    <Stage n={c.diterima} cls={STAGE_META.diterima.cls} label="Diterima" />
                    <Stage n={c.proses} cls={STAGE_META.proses.cls} label="Proses" />
                    <span className="px-2 py-0.5 bg-slate-900 text-white">Total {e.total_active}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-200 p-3 space-y-4 bg-slate-50/50">
                    {/* DRF / SO */}
                    <Group icon={FileText} title={`Drawing Request / SO (${e.drf.length})`} empty={e.drf.length === 0}>
                      {e.drf.map((d) => (
                        <ItemRow key={d.id} onClick={() => navigate(`/engineering/drf/${d.id}`)} testid={`logwork-drf-${d.id}`}>
                          <span className="font-mono font-bold text-slate-800">{d.form_no}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${STAGE_META[d.stage]?.cls}`}>{STAGE_META[d.stage]?.label}</span>
                          <span className="text-slate-600">SO <b className="font-mono">{d.so_no || "-"}</b> · {d.project_name || "-"} · {d.customer_name || "-"}</span>
                          <span className="ml-auto text-[11px] text-slate-400">{d.work_started_at ? `Mulai: ${fmt(d.work_started_at)}` : d.work_received_at ? `Diterima: ${fmt(d.work_received_at)}` : `Ditugaskan: ${fmt(d.assigned_at)}`}</span>
                          <ArrowRight size={13} className="text-slate-400" />
                        </ItemRow>
                      ))}
                    </Group>

                    {/* Inquiry */}
                    <Group icon={Calculator} title={`Inquiry Costing (${e.inquiry.length})`} empty={e.inquiry.length === 0}>
                      {e.inquiry.map((iq) => (
                        <ItemRow key={iq.id} onClick={() => navigate("/engineering/inquiries")} testid={`logwork-inq-${iq.id}`}>
                          <span className="font-mono font-bold text-slate-800">{iq.inquiry_no}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase border bg-violet-100 text-violet-800 border-violet-300">{iq.status}</span>
                          <span className="text-slate-600 truncate">{iq.title} · {iq.customer_name || "-"}</span>
                          <ArrowRight size={13} className="text-slate-400 ml-auto" />
                        </ItemRow>
                      ))}
                    </Group>

                    {/* Drawing */}
                    <Group icon={ClipboardText} title={`Drawing Aktif (${e.drawing.length})`} empty={e.drawing.length === 0}>
                      {e.drawing.map((dr) => (
                        <div key={dr.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-[13px]" data-testid={`logwork-dwg-${dr.id}`}>
                          <span className="font-mono font-bold text-slate-800">{dr.drawing_no || "(no)"}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase border bg-slate-100 text-slate-700 border-slate-300">{dr.approval_status || "draft"}</span>
                          <span className="text-slate-600 truncate">SO {dr.so_no || "-"} · {dr.title || ""}</span>
                        </div>
                      ))}
                    </Group>

                    {/* Riwayat */}
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">
                        <ClockCounterClockwise size={14} weight="fill" /> Riwayat Aktivitas Terakhir
                      </div>
                      {e.history.length === 0 ? (
                        <div className="text-[12px] text-slate-400 italic px-1">Belum ada aktivitas tercatat.</div>
                      ) : (
                        <div className="space-y-1">
                          {e.history.map((h, i) => (
                            <div key={i} className="flex items-center gap-2 text-[12px] px-1">
                              <span className="text-slate-400 tabular-nums w-[130px] shrink-0">{fmt(h.at)}</span>
                              <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${h.event === "Mulai Kerjakan" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>{h.event}</span>
                              <span className="text-slate-700 truncate">{h.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TotalChip = ({ icon: Icon, color, label, n }) => (
  <div className={`flex items-center gap-2 border bg-white px-3 py-2 ${color}`}>
    <Icon size={18} weight="fill" />
    <div>
      <div className="text-lg font-bold tabular-nums leading-none">{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  </div>
);

const Stage = ({ n, cls, label }) => (
  <span className={`px-2 py-0.5 border ${cls}`} title={label}>{label[0]}:{n || 0}</span>
);

const Group = ({ icon: Icon, title, empty, children }) => (
  <div>
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-slate-600 mb-1.5">
      <Icon size={14} weight="fill" /> {title}
    </div>
    {empty ? <div className="text-[12px] text-slate-400 italic px-1">Tidak ada.</div> : <div className="space-y-1">{children}</div>}
  </div>
);

const ItemRow = ({ onClick, testid, children }) => (
  <button onClick={onClick} data-testid={testid} className="w-full flex flex-wrap items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-[13px] text-left transition-colors">
    {children}
  </button>
);
