import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Input } from "../components/ui/input";
import { MagnifyingGlass, ArrowClockwise, Kanban, ArrowRight, CheckCircle, ShoppingCart } from "@phosphor-icons/react";

const BOM_STATUS = {
  draft: { t: "Draft", c: "bg-slate-100 text-slate-600 border-slate-300" },
  pending_review: { t: "Review", c: "bg-amber-100 text-amber-800 border-amber-300" },
  approved: { t: "Approved", c: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
};

export default function SoTrackerListPage({ embedded = false }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/so-tracker", { params: q.trim() ? { q: q.trim() } : {} });
      setItems(data.items || []);
    } catch (e) { setItems([]); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  return (
    <div className={embedded ? "space-y-4" : "p-4 max-w-[1250px] mx-auto space-y-4"}>
      {!embedded && <BackLink />}
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-cyan-700 mb-1">
          <Kanban size={14} weight="fill" /> Engineering · SO Tracker
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          SO Document Tracker
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Progress tiap SO: status BOM & drawing bisa terbit bertahap (partial). Klik SO untuk detail & menandai rilis partial / BOM siap dibeli.
        </p>
      </div>

      <div className="relative max-w-md">
        <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SO / customer / project / engineer..." className="pl-8 rounded-none" data-testid="sotracker-search" />
      </div>

      <div className="border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left p-3">SO / Form</th>
              <th className="text-left p-3">Customer / Project</th>
              <th className="text-left p-3">Engineer</th>
              <th className="text-left p-3">Drawing</th>
              <th className="text-left p-3">BOM</th>
              <th className="text-left p-3">Terima</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody data-testid="sotracker-list">
            {loading && (<tr><td colSpan={7} className="p-8 text-center text-slate-400"><ArrowClockwise size={18} className="inline animate-spin mr-1" /> Memuat...</td></tr>)}
            {!loading && items.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-slate-400">Belum ada SO.</td></tr>)}
            {!loading && items.map((it) => {
              const bs = BOM_STATUS[it.bom?.status] || { t: it.bom?.status || "—", c: "bg-slate-100 text-slate-500 border-slate-200" };
              const done = it.all_drawings_done;
              return (
                <tr key={it.drf_id} className="border-b border-slate-100 hover:bg-cyan-50/40 cursor-pointer" onClick={() => navigate(`/engineering/so-tracker/${it.drf_id}`)} data-testid={`sotracker-row-${it.drf_id}`}>
                  <td className="p-3">
                    <div className="font-mono font-bold text-slate-900">{it.so_no || "-"}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{it.form_no}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{it.customer_name || "-"}</div>
                    <div className="text-[12px] text-slate-500">{it.project_name || "-"}</div>
                  </td>
                  <td className="p-3 text-slate-700">{it.assigned_engineer_name || "-"}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border ${done ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-sky-100 text-sky-800 border-sky-300"}`} data-testid={`sotracker-dwg-${it.drf_id}`}>
                      {done && <CheckCircle size={12} weight="fill" />}
                      {it.drawings_released}/{it.drawings_total} terbit
                    </span>
                    {it.drawings_partial > 0 && (
                      <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">{it.drawings_partial} partial</span>
                    )}
                  </td>
                  <td className="p-3">
                    {it.bom?.exists ? (
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border w-fit ${bs.c}`}>{bs.t}</span>
                        {it.bom.purchase_ready && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-green-100 text-green-800 border border-green-300 w-fit" data-testid={`sotracker-buyready-${it.drf_id}`}>
                            <ShoppingCart size={11} weight="fill" /> Siap Dibeli
                          </span>
                        )}
                      </div>
                    ) : <span className="text-[11px] text-slate-300">— tanpa BOM</span>}
                  </td>
                  <td className="p-3 text-[12px] text-slate-600">{fmtDate(it.accepted_at)}</td>
                  <td className="p-3 text-right"><ArrowRight size={16} className="text-slate-400" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && <div className="text-[12px] text-slate-400">Total: {items.length} SO</div>}
    </div>
  );
}
