import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import DrawingRequestFormDialog from "../components/DrawingRequestFormDialog";
import { useAuth } from "../lib/auth";
import { ArrowClockwise, FileText, CheckCircle, Eye, MagnifyingGlass, Wrench, UserPlus } from "@phosphor-icons/react";

/**
 * DrawingRequestInboxPage — Engineering Leader (Riski) melihat DRF submitted dari Sales.
 * Leader HANYA menugaskan engineer yang mengerjakan (accept + assign). Tidak isi kolom lain.
 * Engineer yang ditugaskan lalu membuka Work Group untuk generate drawing + BOM + upload + TTD.
 */
export default function DrawingRequestInboxPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewDrf, setViewDrf] = useState(null);
  const [assignDrf, setAssignDrf] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests?scope=for_engineering");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = q.trim()
    ? items.filter((d) => `${d.form_no} ${d.so_no} ${d.customer_name} ${d.project_name}`.toLowerCase().includes(q.toLowerCase()))
    : items;
  const pag = usePagination(filtered, 20);

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-600 mb-1">
          <Wrench size={14} weight="fill" /> Engineering · Inbox
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Drawing Request dari Sales
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          DRF dari Sales. Sebagai <b>Eng Leader</b>, Anda cukup <b>Accept & tunjuk engineer</b> yang mengerjakan.
          Engineer yang ditugaskan lalu membuka <b>Work Group</b> untuk generate nomor drawing, isi BOM, upload & TTD.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input
            className="h-9 rounded-none border-slate-300 w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari Form No / SO / Customer / Project..."
            data-testid="drf-inbox-search"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500">
            <b className="text-amber-700">{filtered.length}</b> DRF menunggu accept
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Form No</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Project</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Material</th>
                <th className="text-left p-3">Due</th>
                <th className="text-left p-3">Submitted By</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="drf-inbox-list">
              {loading && (<tr><td colSpan={10} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="p-12 text-center text-slate-400">
                  🎉 Tidak ada Drawing Request menunggu accept saat ini.
                </td></tr>
              )}
              {pag.pagedData.map((d) => {
                const isAssigned = !!d.assigned_engineer_id;
                const isInProgress = d.status === "in_progress";
                const isAccepted = d.status === "accepted";
                return (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-amber-50/40" data-testid={`drf-inbox-row-${d.form_no}`}>
                  <td className="p-3 font-mono font-semibold text-slate-900 text-xs">
                    {d.form_no}
                    {isAssigned && (
                      <div className="mt-1">
                        <span className="px-1 py-0.5 bg-teal-100 text-teal-800 border border-teal-400 text-[9px] font-bold uppercase">
                          → {d.assigned_engineer_name}
                        </span>
                      </div>
                    )}
                    {isInProgress && (
                      <div className="mt-1">
                        <span className="px-1 py-0.5 bg-violet-100 text-violet-800 border border-violet-400 text-[9px] font-bold uppercase">
                          Sedang Dikerjakan
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.request_type === "new_order" ? "bg-emerald-100 text-emerald-800 border border-emerald-400" : "bg-blue-100 text-blue-800 border border-blue-400"}`}>
                      {d.request_type === "new_order" ? "New" : "Repeat"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                  <td className="p-3 text-xs">{d.project_name || "-"}</td>
                  <td className="p-3 text-xs">{d.customer_name || "-"}</td>
                  <td className="p-3 text-right text-xs">{d.qty_order} {d.unit}</td>
                  <td className="p-3 text-xs">{d.material || "TBA"}</td>
                  <td className="p-3 text-xs">{d.expected_due_date || "-"}</td>
                  <td className="p-3 text-xs">
                    <div className="font-semibold">{d.requested_by?.name || "-"}</div>
                    <div className="text-[10px] text-slate-500">{d.submitted_at ? new Date(d.submitted_at).toLocaleDateString("id-ID") : ""}</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => setViewDrf(d)}
                        className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                        data-testid={`drf-inbox-view-${d.form_no}`}
                      >
                        <Eye size={11} weight="bold" /> Detail
                      </button>
                      {(isAssigned || isInProgress) ? (
                        <button
                          onClick={() => navigate(`/engineering/drf/${d.id}`)}
                          className="inline-flex items-center px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`drf-inbox-open-${d.form_no}`}
                          title="Buka Work Group"
                        >
                          <Eye size={11} weight="bold" /> Buka Work Group
                        </button>
                      ) : (
                        <button
                          onClick={() => setAssignDrf(d)}
                          className="inline-flex items-center px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`drf-inbox-accept-${d.form_no}`}
                        >
                          <UserPlus size={11} weight="bold" /> Accept & Assign
                        </button>
                      )}
                      {isAccepted && (
                        <button
                          onClick={() => setAssignDrf(d)}
                          className="inline-flex items-center px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`drf-inbox-reassign-${d.form_no}`}
                          title="Ganti engineer"
                        >
                          <UserPlus size={11} weight="bold" /> Ubah
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="DRF" testIdPrefix="drf-inbox-pag" />
      </Card>

      {viewDrf && (
        <DrawingRequestFormDialog
          initial={viewDrf}
          onClose={() => setViewDrf(null)}
          onSaved={() => { setViewDrf(null); load(); }}
        />
      )}

      {assignDrf && (
        <AssignEngineerDialog
          drf={assignDrf}
          onClose={() => setAssignDrf(null)}
          onAssigned={(drfId, assignedId) => {
            setAssignDrf(null);
            load();
            // Riski hanya menunjuk. Kalau dia menunjuk DIRINYA SENDIRI → langsung ke Work Group untuk generate.
            if (assignedId && assignedId === user?.id) {
              navigate(`/engineering/drf/${drfId}`);
            } else {
              toast.success("Engineer sudah ditugaskan. Mereka akan mengerjakan dari menu 'DRF Ditugaskan ke Saya'.");
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Assign Engineer Dialog ---------------- */
function AssignEngineerDialog({ drf, onClose, onAssigned }) {
  const [engineers, setEngineers] = useState([]);
  const [selected, setSelected] = useState(drf.assigned_engineer_id || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/drawing-requests/engineering-users")
      .then(({ data }) => setEngineers(data.items || []))
      .catch((e) => toast.error(e.response?.data?.detail || "Gagal muat daftar engineer"));
  }, []);

  const submit = async () => {
    if (!selected) return toast.error("Pilih engineer dulu");
    setBusy(true);
    try {
      await api.post(`/drawing-requests/${drf.id}/accept-assign`, { assigned_engineer_id: selected });
      const name = engineers.find((e) => e.id === selected)?.name || "engineer";
      toast.success(`✓ DRF diterima & ditugaskan ke ${name}`);
      onAssigned?.(drf.id, selected);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal assign");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" data-testid="assign-dialog">
      <Card className="rounded-none border-slate-300 w-full max-w-md bg-white">
        <div className="px-4 py-3 bg-emerald-700 text-white">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Accept & Assign Engineer</div>
          <div className="font-mono font-bold">{drf.form_no}</div>
          <div className="text-[11px] opacity-90">SO {drf.so_no} · {drf.customer_name || "-"} · {drf.request_type === "new_order" ? "New Order" : "Repeat Order"}</div>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-slate-600">
            Sebagai Eng Leader, Anda cukup menunjuk <b>siapa</b> yang mengerjakan. Detail drawing/BOM diisi oleh engineer.
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Pilih Engineer</div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 divide-y">
              {engineers.length === 0 && <div className="p-3 text-xs text-slate-400 italic">Tidak ada user Engineering. Buat user role eng_staff dulu di Admin.</div>}
              {engineers.map((e) => (
                <label key={e.id} className={`flex items-center gap-2 p-2.5 cursor-pointer hover:bg-emerald-50 ${selected === e.id ? "bg-emerald-100" : ""}`} data-testid={`assign-eng-${e.username}`}>
                  <input type="radio" name="eng" checked={selected === e.id} onChange={() => setSelected(e.id)} />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{e.name || e.username}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{e.role}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
            <Button onClick={submit} disabled={busy || !selected} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40" data-testid="assign-submit">
              <CheckCircle size={14} weight="bold" className="mr-1" /> {busy ? "..." : "Accept & Assign"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
