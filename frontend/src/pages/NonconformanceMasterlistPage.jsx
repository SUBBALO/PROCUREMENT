import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import CarCreateModal from "../components/CarCreateModal";
import CarDetailModal from "../components/CarDetailModal";
import {
  CAR_STATUS_LABEL, CAR_STATUS_CLS, SEVERITY_CLS, SEVERITY_LABEL,
  SOURCE_CLS, SOURCE_LABEL, DEPT_FULL_LABEL, DEPARTMENTS, isCarIssuer,
} from "../lib/carConstants";
import {
  WarningCircle, MagnifyingGlass, ArrowClockwise, Plus, Warning,
  ClockCountdown, UserGear, Gear, CheckCircle,
} from "@phosphor-icons/react";

const SUMMARY = [
  { key: "open", label: "Open", icon: Warning, cls: "border-amber-300 text-amber-700 bg-amber-50/60" },
  { key: "assigned", label: "Assigned", icon: UserGear, cls: "border-sky-300 text-sky-700 bg-sky-50/60" },
  { key: "in_progress", label: "In Progress", icon: Gear, cls: "border-teal-300 text-teal-700 bg-teal-50/60" },
  { key: "closed", label: "Closed", icon: CheckCircle, cls: "border-emerald-300 text-emerald-700 bg-emerald-50/60" },
];

export default function NonconformanceMasterlistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const canIssue = isCarIssuer(user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (deptFilter) params.set("issuer_dept", deptFilter);
      const { data } = await api.get(`/nonconformance?${params.toString()}`);
      setItems(data.items || []);
      const { data: st } = await api.get("/nonconformance/stats");
      setStats(st || {});
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal memuat data CAR");
    } finally { setLoading(false); }
  }, [q, statusFilter, deptFilter]);

  useEffect(() => { load(); }, [load]);

  const pag = usePagination(items, 20);

  return (
    <div className="p-4 max-w-[1300px] mx-auto space-y-4">
      <BackLink />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-rose-600 mb-1">
            <WarningCircle size={14} weight="fill" /> Quality · MKS-F-QAD-004 Rev.02
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Nonconformance (CAR) Masterlist
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Corrective Action Report berlaku untuk <b>semua departemen</b> — terhadap Drawing maupun objek/proses lain
            (mis. hasil kerja Produksi, barang salah terima di Store, komplain customer). Diterbitkan siapa saja,
            <b> ditujukan ke dept/user</b> tertentu untuk ditindaklanjuti (investigasi → tindakan → Closed).
            NC bertipe <b>Drawing</b> memengaruhi <b>KPI #1 Engineering</b> pada bulan penerbitannya.
          </p>
        </div>
        {canIssue && (
          <Button onClick={() => setShowCreate(true)} className="rounded-none bg-rose-600 hover:bg-rose-700" data-testid="car-new-btn">
            <Plus size={16} weight="bold" className="mr-1" /> Terbitkan CAR
          </Button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="car-summary">
        {SUMMARY.map((s) => {
          const active = statusFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter((cur) => (cur === s.key ? "" : s.key))}
              className={`text-left border ${s.cls} px-3 py-2.5 rounded-md transition-all hover:shadow-sm ${active ? "ring-2 ring-offset-1 ring-indigo-400 shadow-sm" : ""}`}
              data-testid={`car-stat-${s.key}`}
            >
              <div className="flex items-center gap-1.5">
                <s.icon size={14} weight="bold" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{s.label}</span>
              </div>
              <div className="text-2xl font-bold mt-0.5 tabular-nums">{stats[s.key] ?? 0}</div>
            </button>
          );
        })}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Cari No CAR / Drawing / SO / Customer..." data-testid="car-search" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 border border-slate-300 text-sm px-2 bg-white" data-testid="car-status-filter">
            <option value="">Semua Status</option>
            {Object.entries(CAR_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="h-9 border border-slate-300 text-sm px-2 bg-white" data-testid="car-dept-filter">
            <option value="">Semua Penerbit</option>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <Button variant="outline" onClick={load} className="rounded-none h-9" data-testid="car-apply">Terapkan</Button>
          {(statusFilter || deptFilter || q) && (
            <Button variant="ghost" onClick={() => { setQ(""); setStatusFilter(""); setDeptFilter(""); }} className="rounded-none h-9 text-slate-500" data-testid="car-reset">Reset</Button>
          )}
          <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500"><b className="text-rose-700">{items.length}</b> CAR</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">No CAR</th>
                <th className="text-left p-3">Tgl Terbit</th>
                <th className="text-left p-3">Penerbit</th>
                <th className="text-left p-3">Ditujukan Ke</th>
                <th className="text-left p-3">Sumber</th>
                <th className="text-left p-3">Objek NC</th>
                <th className="text-left p-3">SO</th>
                <th className="text-center p-3">Severity</th>
                <th className="text-left p-3">Assignee</th>
                <th className="text-center p-3">Status</th>
              </tr>
            </thead>
            <tbody data-testid="car-list">
              {loading && <tr><td colSpan={10} className="p-8 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={10} className="p-12 text-center text-slate-400">Belum ada CAR. {canIssue ? "Klik “Terbitkan CAR” untuk membuat." : ""}</td></tr>}
              {!loading && pag.pagedData.map((e) => (
                <tr key={e.id} onClick={() => setDetailId(e.id)} className="border-b border-slate-100 hover:bg-rose-50/40 cursor-pointer" data-testid={`car-row-${e.nc_no}`}>
                  <td className="p-3 font-mono font-bold text-slate-900 text-xs">{e.nc_no}</td>
                  <td className="p-3 text-xs whitespace-nowrap">{formatDateID(e.issued_at)}</td>
                  <td className="p-3 text-xs">{e.issued_by?.name}<div className="text-[10px] text-slate-400">{DEPT_FULL_LABEL[e.issuer_dept] || e.issuer_dept}</div></td>
                  <td className="p-3 text-xs">{DEPT_FULL_LABEL[e.issued_to_dept] || e.issued_to || "-"}{e.issued_to_user?.name ? <div className="text-[10px] text-slate-400">{e.issued_to_user.name}</div> : null}</td>
                  <td className="p-3"><span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${SOURCE_CLS[e.source] || SOURCE_CLS.in_house}`}>{SOURCE_LABEL[e.source] || "-"}</span></td>
                  <td className="p-3 text-xs max-w-[200px]">
                    {e.link_type === "drawing" ? (
                      <span className="font-mono line-clamp-2" title={(e.drawing_nos || []).join(", ")}>
                        {(e.drawing_nos || []).join(", ") || "-"}
                        {(e.drawing_nos || []).length > 1 && <span className="text-[9px] text-slate-400"> ({e.drawing_nos.length})</span>}
                      </span>
                    ) : (
                      <span className="line-clamp-2 text-slate-700" title={e.object_ref}>{e.object_ref || "-"}</span>
                    )}
                  </td>
                  <td className="p-3 text-xs font-mono">{e.so_no || "-"}</td>
                  <td className="p-3 text-center"><span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${SEVERITY_CLS[e.severity]}`}>{SEVERITY_LABEL[e.severity]}</span></td>
                  <td className="p-3 text-xs">{e.assigned_to?.name || <span className="text-slate-300">—</span>}</td>
                  <td className="p-3 text-center"><span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${CAR_STATUS_CLS[e.status]}`}>{CAR_STATUS_LABEL[e.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="CAR" testIdPrefix="car-pag" />
      </Card>

      <CarCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
      <CarDetailModal open={!!detailId} ncId={detailId} user={user} onClose={() => setDetailId(null)} onChanged={load} />
    </div>
  );
}
