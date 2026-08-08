import React, { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { MagnifyingGlass, ArrowClockwise, CheckCircle, CircleNotch, Circle } from "@phosphor-icons/react";

const STAGE_STYLE = {
  done: { dot: "bg-emerald-500 border-emerald-500 text-white", line: "bg-emerald-400", label: "text-emerald-700", Icon: CheckCircle },
  in_progress: { dot: "bg-amber-400 border-amber-500 text-white", line: "bg-slate-200", label: "text-amber-700", Icon: CircleNotch },
  pending: { dot: "bg-white border-slate-300 text-slate-300", line: "bg-slate-200", label: "text-slate-400", Icon: Circle },
};

function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return s; }
}

export default function SoProgressTracker() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dashboard/so-progress?limit=80${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      setItems(data.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white border border-slate-200" data-testid="so-progress-tracker">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Monitoring</div>
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Progress Sales Order</h2>
          <p className="text-[11px] text-slate-500">Alur: Engineering → DocCon → Produksi → QC → Delivery</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-300 bg-white px-2 h-9">
            <MagnifyingGlass size={14} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") load(q); }}
              placeholder="Cari SO / customer..."
              className="text-sm outline-none w-40"
              data-testid="so-progress-search"
            />
          </div>
          <button onClick={() => load(q)} className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1" data-testid="so-progress-refresh">
            <ArrowClockwise size={14} weight="bold" className={loading ? "animate-spin" : ""} /> Muat
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 max-h-[calc(100vh-260px)] overflow-y-auto">
        {loading && <div className="p-8 text-center text-slate-400 text-sm">Memuat progress SO…</div>}
        {!loading && items.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">Tidak ada SO dalam workflow.</div>}
        {!loading && items.map((so) => (
          <div key={so.so_no} className="p-4 hover:bg-slate-50 transition-colors" data-testid={`so-progress-row-${so.so_no}`}>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="min-w-0">
                <span className="font-mono font-bold text-slate-900">{so.so_no}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="text-sm text-slate-700">{so.customer || "-"}</span>
                {so.description ? <span className="text-xs text-slate-400 ml-1.5 truncate">— {so.description}</span> : null}
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 bg-slate-900 text-white">
                Tahap: {so.current_stage}
              </span>
            </div>

            {/* Horizontal stepper */}
            <div className="flex items-stretch">
              {so.stages.map((st, i) => {
                const style = STAGE_STYLE[st.status] || STAGE_STYLE.pending;
                const Icon = style.Icon;
                return (
                  <div key={st.key} className="flex-1 flex flex-col items-center relative">
                    {i < so.stages.length - 1 && (
                      <div className={`absolute top-3 left-1/2 w-full h-0.5 ${(so.stages[i + 1].status === "done" || st.status === "done") ? "bg-emerald-400" : "bg-slate-200"}`} />
                    )}
                    <div className={`relative z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center ${style.dot}`}>
                      <Icon size={14} weight={st.status === "pending" ? "regular" : "fill"} className={st.status === "in_progress" ? "animate-spin" : ""} />
                    </div>
                    <div className={`mt-1.5 text-[10px] uppercase tracking-wide font-bold ${style.label}`}>{st.label}</div>
                    {st.progress ? <div className="text-[9px] text-slate-500 font-mono">{st.progress}</div> : null}
                    {st.date ? <div className="text-[9px] text-slate-400">{fmtDate(st.date)}</div> : null}
                    {st.pic ? <div className="text-[9px] text-slate-400 truncate max-w-[80px]" title={st.pic}>{st.pic}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
