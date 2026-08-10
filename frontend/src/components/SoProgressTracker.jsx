import React, { useEffect, useState, useCallback, useMemo } from "react";
import api from "../lib/api";
import { MagnifyingGlass, ArrowClockwise } from "@phosphor-icons/react";

const STAGE_STYLE = {
  done: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Selesai" },
  in_progress: { dot: "bg-amber-500", text: "text-amber-700", label: "Proses" },
  pending: { dot: "bg-slate-300", text: "text-slate-400", label: "—" },
};

const STAGE_ORDER = ["engineering", "doccon", "produksi", "qc", "delivery"];
const STAGE_HEAD = { engineering: "Engineering", doccon: "DocCon", produksi: "Produksi", qc: "QC Final", delivery: "Delivery" };

const STATUS_PILL = {
  done: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  progress: "bg-sky-100 text-sky-700 ring-sky-200",
  waiting: "bg-amber-100 text-amber-700 ring-amber-200",
  revision: "bg-rose-100 text-rose-700 ring-rose-200",
  pending: "bg-slate-100 text-slate-600 ring-slate-200",
};

function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return s; }
}

function StageCell({ st }) {
  const style = STAGE_STYLE[st?.status] || STAGE_STYLE.pending;
  return (
    <td className="px-2 py-1.5 align-top border-l border-slate-100">
      <div className={`inline-flex items-center gap-1 text-[11px] font-semibold ${style.text}`}>
        <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />
        {style.label}
      </div>
      {st?.date ? <div className="text-[10px] text-slate-400 leading-tight">{fmtDate(st.date)}</div> : null}
    </td>
  );
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

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const stageMap = (so) => {
    const m = {};
    (so.stages || []).forEach((s) => { m[s.key] = s; });
    return m;
  };

  return (
    <div className="bg-white border border-slate-200" data-testid="so-progress-tracker">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Monitoring</div>
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Progress Sales Order</h2>
          <p className="text-[11px] text-slate-500">Alur: Engineering → DocCon → Produksi → QC Final → Delivery</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-300 bg-white px-2 h-8">
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
          <button onClick={() => load(q)} className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1" data-testid="so-progress-refresh">
            <ArrowClockwise size={14} weight="bold" className={loading ? "animate-spin" : ""} /> Muat
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-240px)] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
            <tr className="text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-bold">SO / Customer</th>
              <th className="px-2 py-2 text-left font-bold border-l border-slate-200">Deadline</th>
              {STAGE_ORDER.map((k) => (
                <th key={k} className="px-2 py-2 text-left font-bold border-l border-slate-200">{STAGE_HEAD[k]}</th>
              ))}
              <th className="px-2 py-2 text-left font-bold border-l border-slate-200">Status Saat Ini</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={8} className="p-8 text-center text-slate-400 text-sm">Memuat progress SO…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-slate-400 text-sm">Tidak ada SO dalam workflow.</td></tr>
            )}
            {!loading && items.map((so) => {
              const m = stageMap(so);
              const delivered = m.delivery?.status === "done";
              const overdue = so.deadline && so.deadline < today && !delivered;
              return (
                <tr key={so.so_no} className="hover:bg-slate-50 transition-colors" data-testid={`so-progress-row-${so.so_no}`}>
                  <td className="px-3 py-1.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 text-[13px]">{so.so_no}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 truncate max-w-[220px]" title={`${so.customer || ""} ${so.description || ""}`}>
                      {so.customer || "-"}{so.description ? ` · ${so.description}` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-top border-l border-slate-100">
                    {so.deadline ? (
                      <span className={`text-[11px] font-semibold ${overdue ? "text-rose-600" : "text-slate-700"}`}>
                        {fmtDate(so.deadline)}{overdue ? " ⚠" : ""}
                      </span>
                    ) : <span className="text-[11px] text-slate-300">—</span>}
                  </td>
                  {STAGE_ORDER.map((k) => (<StageCell key={k} st={m[k]} />))}
                  <td className="px-2 py-1.5 align-top border-l border-slate-100" data-testid={`so-progress-status-${so.so_no}`}>
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ring-1 ${STATUS_PILL[so.status_kind] || STATUS_PILL.pending}`}>
                      {so.status_now || so.current_stage}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
