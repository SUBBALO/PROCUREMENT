import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import DrawingRequestFormDialog from "../components/DrawingRequestFormDialog";
import { Ruler, MagnifyingGlass, ArrowClockwise, ArrowRight, Funnel } from "@phosphor-icons/react";

const STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  submitted: { label: "Terkirim ke Eng", cls: "bg-amber-100 text-amber-800 border-amber-400" },
  accepted: { label: "Diterima Eng", cls: "bg-sky-100 text-sky-800 border-sky-400" },
  received: { label: "Diterima Eng", cls: "bg-sky-100 text-sky-800 border-sky-400" },
  in_progress: { label: "Dikerjakan", cls: "bg-violet-100 text-violet-800 border-violet-400" },
  completed: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800 border-emerald-500" },
  revision_requested: { label: "Revisi", cls: "bg-orange-100 text-orange-800 border-orange-400" },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};

export default function DrawingRequestMasterlistPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [openDrf, setOpenDrf] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests");
      setRows(data?.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat data DR");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && (r.status || "") !== status) return false;
      if (!t) return true;
      return [r.form_no, r.so_no, r.customer_name, r.project_name, r.assigned_engineer_name]
        .some((v) => (v || "").toLowerCase().includes(t));
    });
  }, [rows, q, status]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const inputCls = "h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-5">
        <BackLink />
        <div className="flex items-start gap-3 mt-2 mb-4">
          <div className="w-11 h-11 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Ruler size={22} weight="fill" className="text-white" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-indigo-600 font-bold">Engineering</div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">Masterlist Drawing Request</h1>
            <p className="text-sm text-slate-500">Semua Drawing Request (DR) dari semua SO beserta status & engineer penanggung jawab.</p>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <Chip active={status === "all"} onClick={() => setStatus("all")} label={`Semua (${counts.all || 0})`} testid="drf-chip-all" />
          {Object.keys(STATUS_META).filter((k) => k !== "received").map((k) => (
            <Chip key={k} active={status === k} onClick={() => setStatus(k)} label={`${STATUS_META[k].label} (${counts[k] || 0})`} testid={`drf-chip-${k}`} />
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari Form No / SO / customer / project / engineer…" className={`${inputCls} w-full pl-8`} data-testid="drf-search" />
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-600 rounded hover:bg-slate-50"><ArrowClockwise size={15} weight="bold" /> Muat Ulang</button>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Form No</th>
                  <th className="px-3 py-2 text-left font-bold">Tanggal</th>
                  <th className="px-3 py-2 text-left font-bold">SO</th>
                  <th className="px-3 py-2 text-left font-bold">Customer</th>
                  <th className="px-3 py-2 text-left font-bold">Project</th>
                  <th className="px-3 py-2 text-left font-bold">Tipe</th>
                  <th className="px-3 py-2 text-left font-bold">Engineer</th>
                  <th className="px-3 py-2 text-left font-bold">Deadline</th>
                  <th className="px-3 py-2 text-center font-bold">Status</th>
                  <th className="px-3 py-2 text-center font-bold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400" data-testid="drf-empty">Tidak ada Drawing Request.</td></tr>
                ) : filtered.map((r) => {
                  const st = STATUS_META[r.status] || STATUS_META.draft;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50" data-testid={`drf-row-${r.id}`}>
                      <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{r.form_no || "(draft)"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(r.created_at || r.date)}</td>
                      <td className="px-3 py-2 font-mono">{r.so_no || r.ref_so_no || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[150px] truncate" title={r.customer_name}>{r.customer_name || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate" title={r.project_name}>{r.project_name || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{r.request_type === "repeat_order" ? "Repeat" : "New"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.assigned_engineer_name || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(r.delivery_due_date)}</td>
                      <td className="px-3 py-2 text-center"><span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${st.cls}`}>{st.label}</span></td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => setOpenDrf(r)}
                          className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-2 py-0.5 rounded"
                          data-testid={`drf-open-${r.id}`}>
                          Buka <ArrowRight size={11} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 mt-2">Total: {filtered.length} Drawing Request</div>
      </div>

      {openDrf && (
        <DrawingRequestFormDialog
          initial={openDrf}
          onClose={() => setOpenDrf(null)}
          onSaved={() => { setOpenDrf(null); load(); }}
        />
      )}
    </div>
  );
}

const Chip = ({ active, onClick, label, testid }) => (
  <button onClick={onClick} data-testid={testid}
    className={`px-2.5 py-1 text-[11px] font-bold rounded-full border transition-colors ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}>
    {label}
  </button>
);
