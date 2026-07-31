import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import BackLink from "../components/BackLink";
import { Wrench, ArrowClockwise, ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";

/**
 * MyDrfWorkListPage — daftar Drawing Request yang DITUGASKAN ke engineer yang login,
 * pintu masuk ke Work Group (generate drawing + upload + TTD).
 */
export default function MyDrfWorkListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests?scope=for_engineering");
      const all = data.items || [];
      const isLeader = ["eng_head", "eng_leader", "admin", "super_admin", "supervisor"].includes(user?.role);
      // engineer: hanya yang di-assign ke dia; leader/admin: semua yang accepted/in_progress
      const mine = all.filter((d) => {
        if (!["accepted", "in_progress"].includes(d.status)) return false;
        return isLeader || d.assigned_engineer_id === user?.id;
      });
      setItems(mine);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = q.trim()
    ? items.filter((d) => `${d.form_no} ${d.so_no} ${d.customer_name} ${d.project_name}`.toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
          <Wrench size={14} weight="fill" /> Engineering · Tugas Saya
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Drawing Request Ditugaskan ke Saya
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          DRF yang ditugaskan Eng Leader kepada Anda. Klik untuk generate nomor drawing, isi BOM, upload & TTD.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari Form No / SO / Customer..." data-testid="mydrf-search" />
          <Button variant="ghost" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500"><b className="text-teal-700">{filtered.length}</b> DRF</div>
        </div>
        <div className="divide-y divide-slate-100" data-testid="mydrf-list">
          {loading && <div className="p-8 text-center text-slate-400">Memuat...</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-12 text-center text-slate-400">Tidak ada DRF yang ditugaskan ke Anda saat ini.</div>
          )}
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => navigate(`/engineering/drf/${d.id}`)}
              className="w-full text-left p-4 hover:bg-teal-50/50 flex flex-wrap items-center gap-3"
              data-testid={`mydrf-row-${d.form_no}`}
            >
              <div className="flex-1 min-w-[240px]">
                <div className="font-mono font-bold text-slate-900 text-sm">{d.form_no}</div>
                <div className="text-xs text-slate-500">SO {d.so_no} · {d.project_name || "-"} · {d.customer_name || "-"}</div>
              </div>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.request_type === "new_order" ? "bg-emerald-100 text-emerald-800 border border-emerald-400" : "bg-blue-100 text-blue-800 border border-blue-400"}`}>
                {d.request_type === "new_order" ? "New" : "Repeat"}
              </span>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.status === "in_progress" ? "bg-violet-100 text-violet-800 border border-violet-400" : "bg-sky-100 text-sky-800 border border-sky-400"}`}>
                {d.status === "in_progress" ? "Dikerjakan" : "Diterima"}
              </span>
              <div className="text-xs text-slate-600">→ {d.assigned_engineer_name || "-"}</div>
              <ArrowRight size={16} className="text-teal-600" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
