import React, { useCallback, useEffect, useState } from "react";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Input } from "../components/ui/input";
import { MagnifyingGlass, ArrowClockwise, ClipboardText, FunnelSimple } from "@phosphor-icons/react";

const STATUS_LABELS = {
  submitted: { t: "Terkirim", c: "bg-amber-100 text-amber-800 border-amber-300" },
  assigned: { t: "Ditugaskan", c: "bg-blue-100 text-blue-800 border-blue-300" },
  accepted: { t: "Diterima", c: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  in_progress: { t: "Dikerjakan", c: "bg-sky-100 text-sky-800 border-sky-300" },
  head_revision: { t: "Revisi Head", c: "bg-orange-100 text-orange-800 border-orange-300" },
  pending_head_review: { t: "Review Head", c: "bg-purple-100 text-purple-800 border-purple-300" },
  awaiting_review: { t: "Review Sales", c: "bg-teal-100 text-teal-800 border-teal-300" },
  revision_requested: { t: "Revisi Sales", c: "bg-rose-100 text-rose-800 border-rose-300" },
  closed: { t: "Selesai/Closed", c: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

const CAT_STYLE = {
  simple: "bg-emerald-100 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-100 text-amber-800 border-amber-300",
  complex: "bg-rose-100 text-rose-800 border-rose-300",
};

const fmtDate = (iso) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return null; }
};

export default function EngineeringInquiryMasterlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (category !== "all") params.category = category;
      if (status !== "all") params.status = status;
      const { data } = await api.get("/inquiries/masterlist", { params });
      setItems(data.items || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, category, status]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
          <ClipboardText size={14} weight="fill" /> Engineering · Masterlist
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Masterlist Inquiry
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Rekap seluruh inquiry costing beserta kategori pekerjaan, tanggal terima, dan tanggal selesai.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari no inquiry / customer / project / PIC..."
            className="pl-8 rounded-none"
            data-testid="inq-master-search"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <FunnelSimple size={15} className="text-slate-400" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 border border-slate-300 rounded-none text-sm px-2" data-testid="inq-master-cat-filter">
            <option value="all">Semua Kategori</option>
            <option value="simple">Simple</option>
            <option value="moderate">Moderate</option>
            <option value="complex">Complex</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 border border-slate-300 rounded-none text-sm px-2" data-testid="inq-master-status-filter">
            <option value="all">Semua Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left p-3">No Inquiry</th>
              <th className="text-left p-3">Customer / Project</th>
              <th className="text-left p-3">PIC Engineer</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Kategori</th>
              <th className="text-left p-3">Tgl Terima</th>
              <th className="text-left p-3">Tgl Selesai</th>
            </tr>
          </thead>
          <tbody data-testid="inq-master-list">
            {loading && (<tr><td colSpan={7} className="p-8 text-center text-slate-400"><ArrowClockwise size={18} className="inline animate-spin mr-1" /> Memuat...</td></tr>)}
            {!loading && items.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-slate-400">Belum ada inquiry.</td></tr>)}
            {!loading && items.map((it) => {
              const st = STATUS_LABELS[it.status] || { t: it.status, c: "bg-slate-100 text-slate-600 border-slate-300" };
              const cat = (it.work_category || "").toLowerCase();
              return (
                <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`inq-master-row-${it.id}`}>
                  <td className="p-3 font-mono font-bold text-slate-900">{it.inquiry_no || "-"}</td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{it.customer_name || "-"}</div>
                    <div className="text-[12px] text-slate-500">{it.title || it.project_name || "-"}</div>
                  </td>
                  <td className="p-3 text-slate-700">{it.pic_engineer_name || it.assigned_to_name || "-"}</td>
                  <td className="p-3"><span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${st.c}`}>{st.t}</span></td>
                  <td className="p-3">
                    {cat
                      ? <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${CAT_STYLE[cat] || ""}`} data-testid={`inq-master-cat-${it.id}`}>{cat}</span>
                      : <span className="text-[10px] text-slate-300 uppercase">—</span>}
                  </td>
                  <td className="p-3 text-[12px] text-slate-600" data-testid={`inq-master-received-${it.id}`}>{fmtDate(it.accepted_at) || <span className="text-slate-300">—</span>}</td>
                  <td className="p-3 text-[12px] text-emerald-700 font-medium" data-testid={`inq-master-completed-${it.id}`}>{fmtDate(it.completed_at) || <span className="text-slate-300">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && <div className="text-[12px] text-slate-400">Total: {items.length} inquiry</div>}
    </div>
  );
}
