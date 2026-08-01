import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import { Wrench, ArrowClockwise, MagnifyingGlass, UserPlus, ArrowRight, Eye, CheckCircle, Tray, Gear, PencilSimple, ClockCounterClockwise } from "@phosphor-icons/react";

const LEADER_ROLES = ["eng_head", "eng_leader", "admin", "super_admin", "supervisor"];

/**
 * WorkOrderEngineeringPage — SATU pintu Engineering (role-aware), menggantikan 3 kartu lama.
 *  - Eng Leader (Riski): 2 tab → "Perlu Di-assign" (DRF baru dari Sales) & "Sedang Dikerjakan".
 *    Riski hanya Accept & tunjuk engineer (tidak generate/upload). Bisa juga tunjuk diri sendiri.
 *  - Eng Staff: langsung lihat DRF yang ditugaskan ke dia.
 *  Klik DRF → Work Group (generate nomor drawing, BOM bersama, upload & TTD per drawing).
 */
export default function WorkOrderEngineeringPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isLeader = LEADER_ROLES.includes(user?.role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(isLeader ? "assign" : "inprogress");
  const [assignDrf, setAssignDrf] = useState(null);
  const [pendingTtd, setPendingTtd] = useState([]);
  const [history, setHistory] = useState([]);
  const [subLoading, setSubLoading] = useState(false);

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

  // Load data untuk tab TTD saat dibuka
  useEffect(() => {
    if (tab === "pendingttd") {
      setSubLoading(true);
      api.get("/drawings/pending-my-approval")
        .then(({ data }) => setPendingTtd(data.items || data || []))
        .catch(() => setPendingTtd([]))
        .finally(() => setSubLoading(false));
    } else if (tab === "history") {
      setSubLoading(true);
      api.get(`/drawings/my-signature-history${isLeader ? "?all=true" : ""}`)
        .then(({ data }) => setHistory(data.items || []))
        .catch(() => setHistory([]))
        .finally(() => setSubLoading(false));
    }
  }, [tab, isLeader]);

  const matchQ = (d) => !q.trim() || `${d.form_no} ${d.so_no} ${d.customer_name} ${d.project_name}`.toLowerCase().includes(q.toLowerCase());

  const needAssign = items.filter((d) => d.status === "submitted" && matchQ(d));
  const inProgress = items.filter((d) => ["accepted", "in_progress"].includes(d.status)
    && (isLeader || d.assigned_engineer_id === user?.id) && matchQ(d));

  const shown = isLeader ? (tab === "assign" ? needAssign : inProgress) : inProgress;

  // Part B — search Riwayat TTD (SO/Customer/Drawing) + pagination semua tab
  const [histQ, setHistQ] = useState("");
  const histFiltered = histQ.trim()
    ? history.filter((h) => `${h.drawing_no} ${h.so_no} ${h.customer_name} ${h.project_name} ${h.signed_by}`.toLowerCase().includes(histQ.toLowerCase()))
    : history;
  const pagShown = usePagination(shown, 20);
  const pagTtd = usePagination(pendingTtd, 20);
  const pagHist = usePagination(histFiltered, 20);

  return (
    <div className="p-4 max-w-[1300px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
          <Wrench size={14} weight="fill" /> Engineering
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Work Order Engineering
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isLeader
            ? "Terima Drawing Request dari Sales lalu tunjuk engineer yang mengerjakan. Pantau progress yang sedang dikerjakan."
            : "Drawing Request yang ditugaskan Eng Leader kepada Anda. Buka untuk generate nomor drawing, isi BOM, upload & TTD."}
        </p>
      </div>

      {/* Tabs (role-aware) */}
      <div className="flex gap-1 border-b border-slate-200 flex-wrap">
        {isLeader && <TabBtn active={tab === "assign"} onClick={() => setTab("assign")} icon={Tray} label="Perlu Di-assign" count={needAssign.length} testid="wo-tab-assign" />}
        <TabBtn active={tab === "inprogress"} onClick={() => setTab("inprogress")} icon={Gear} label="Sedang Dikerjakan" count={inProgress.length} testid="wo-tab-inprogress" />
        <TabBtn active={tab === "pendingttd"} onClick={() => setTab("pendingttd")} icon={PencilSimple} label="Perlu TTD Saya" count={pendingTtd.length} testid="wo-tab-pendingttd" />
        <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={ClockCounterClockwise} label="Riwayat TTD" testid="wo-tab-history" />
      </div>

      {/* DRF tabs: assign / inprogress */}
      {(tab === "assign" || tab === "inprogress") && (
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari Form No / SO / Customer..." data-testid="wo-search" />
          <Button variant="ghost" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500"><b className="text-teal-700">{shown.length}</b> DRF</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Form No</th>
                <th className="text-left p-3">Jenis</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Project</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Engineer</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="wo-list">
              {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">Memuat...</td></tr>}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={8} className="p-12 text-center text-slate-400">
                  {isLeader && tab === "assign" ? "Tidak ada DRF baru yang perlu di-assign." : "Belum ada DRF di sini."}
                </td></tr>
              )}
              {pagShown.pagedData.map((d) => {
                return (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-teal-50/40" data-testid={`wo-row-${d.form_no}`}>
                    <td className="p-3 font-mono font-semibold text-slate-900 text-xs">{d.form_no}</td>                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.request_type === "new_order" ? "bg-emerald-100 text-emerald-800 border border-emerald-400" : "bg-blue-100 text-blue-800 border border-blue-400"}`}>
                        {d.request_type === "new_order" ? "New" : "Repeat"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                    <td className="p-3 text-xs">{d.project_name || "-"}</td>
                    <td className="p-3 text-xs">{d.customer_name || "-"}</td>
                    <td className="p-3 text-right text-xs">{d.qty_order} {d.unit}</td>
                    <td className="p-3 text-xs">{d.assigned_engineer_name || <span className="italic text-slate-400">-</span>}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        {d.status === "submitted" && isLeader ? (
                          <button onClick={() => setAssignDrf(d)} className="inline-flex items-center px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase gap-0.5" data-testid={`wo-accept-${d.form_no}`}>
                            <UserPlus size={11} weight="bold" /> Accept & Assign
                          </button>
                        ) : (
                          <>
                            <button onClick={() => navigate(`/engineering/drf/${d.id}`)} className="inline-flex items-center px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold uppercase gap-0.5" data-testid={`wo-open-${d.form_no}`}>
                              <Eye size={11} weight="bold" /> Buka Work Group <ArrowRight size={11} />
                            </button>
                            {isLeader && (
                              <button onClick={() => setAssignDrf(d)} className="inline-flex items-center px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold uppercase gap-0.5" title="Ganti engineer" data-testid={`wo-reassign-${d.form_no}`}>
                                <UserPlus size={11} weight="bold" /> Ubah
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pagShown} label="DRF" testIdPrefix="wo-pag" />
      </Card>
      )}

      {/* Perlu TTD Saya */}
      {tab === "pendingttd" && (
        <Card className="rounded-none border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            Drawing yang menunggu <b>tanda tangan Anda</b>. Klik "Review & TTD" untuk preview + bubuhkan TTD.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                  <th className="text-left p-3">Drawing No</th>
                  <th className="text-left p-3">Title</th>
                  <th className="text-left p-3">SO</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Tahap</th>
                  <th className="text-center p-3">Aksi</th>
                </tr>
              </thead>
              <tbody data-testid="wo-pendingttd-list">
                {subLoading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Memuat...</td></tr>}
                {!subLoading && pendingTtd.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-400">Tidak ada drawing yang menunggu TTD Anda.</td></tr>}
                {pagTtd.pagedData.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-amber-50/40" data-testid={`wo-ttd-row-${d.drawing_no}`}>
                    <td className="p-3 font-mono font-bold text-xs">{d.drawing_no}</td>
                    <td className="p-3 text-xs">{d.title || d.project_name || "-"}</td>
                    <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                    <td className="p-3 text-xs">{d.customer_name || "-"}</td>
                    <td className="p-3 text-xs"><span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-400 text-[9px] font-bold uppercase">{(d.approval_status || "").replace("pending_", "")}</span></td>
                    <td className="p-3 text-center">
                      <button onClick={() => navigate(`/engineering/work-order/${d.id}`)} className="inline-flex items-center px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase gap-0.5" data-testid={`wo-ttd-review-${d.drawing_no}`}>
                        <PencilSimple size={11} weight="bold" /> Review & TTD
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar {...pagTtd} label="drawing" testIdPrefix="wo-ttd-pag" />
        </Card>
      )}

      {/* Riwayat TTD */}
      {tab === "history" && (
        <Card className="rounded-none border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <MagnifyingGlass size={14} className="text-slate-500" />
            <Input className="h-9 rounded-none border-slate-300 w-72" value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="Cari SO / Customer / Drawing No..." data-testid="wo-history-search" />
            <div className="flex-1" />
            <div className="text-xs text-slate-500">{isLeader ? "Riwayat TTD SEMUA user (audit ISO)." : "Riwayat TTD Anda (audit ISO)."} Read-only.</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                  <th className="text-left p-3">Tgl TTD</th>
                  <th className="text-left p-3">Drawing No</th>
                  <th className="text-left p-3">Tahap</th>
                  <th className="text-left p-3">Oleh</th>
                  <th className="text-left p-3">Status Skrg</th>
                  <th className="text-center p-3">Lihat</th>
                </tr>
              </thead>
              <tbody data-testid="wo-history-list">
                {subLoading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Memuat...</td></tr>}
                {!subLoading && history.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-400">Belum ada riwayat TTD.</td></tr>}
                {!subLoading && history.length > 0 && histFiltered.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-400">Tidak ada hasil untuk pencarian ini.</td></tr>}
                {pagHist.pagedData.map((h, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`wo-hist-row-${i}`}>
                    <td className="p-3 text-xs">{h.signed_at ? new Date(h.signed_at).toLocaleString("id-ID") : "-"}</td>
                    <td className="p-3 font-mono font-bold text-xs">{h.drawing_no}</td>
                    <td className="p-3 text-xs uppercase">{h.stage}</td>
                    <td className="p-3 text-xs">{h.signed_by || "-"}</td>
                    <td className="p-3 text-xs">{h.drawing_status_now}</td>
                    <td className="p-3 text-center">
                      {h.has_pdf && <button onClick={() => navigate(`/engineering/work-order/${h.drawing_id}`)} className="p-1 text-violet-700 hover:bg-violet-50" title="Lihat drawing"><Eye size={13} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar {...pagHist} label="TTD" testIdPrefix="wo-hist-pag" />
        </Card>
      )}

      {assignDrf && (
        <AssignEngineerDialog
          drf={assignDrf}
          currentUserId={user?.id}
          onClose={() => setAssignDrf(null)}
          onAssigned={(drfId, assignedId, selfAssigned) => {
            setAssignDrf(null);
            load();
            if (selfAssigned) navigate(`/engineering/drf/${drfId}`);
            else { toast.success("Engineer ditugaskan. Mereka mengerjakan dari tab 'Sedang Dikerjakan' / menu mereka."); if (isLeader) setTab("inprogress"); }
          }}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px ${active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
      <Icon size={14} weight="fill" /> {label}
      {count > 0 && <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${active ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600"}`}>{count}</span>}
    </button>
  );
}

/* Accept + Assign engineer (Riski). Bisa tunjuk diri sendiri → langsung ke Work Group. */
function AssignEngineerDialog({ drf, currentUserId, onClose, onAssigned }) {
  const [engineers, setEngineers] = useState([]);
  const [selected, setSelected] = useState(drf.assigned_engineer_id || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/drawing-requests/engineering-users")
      .then(({ data }) => setEngineers(data.items || []))
      .catch((e) => toast.error(e.response?.data?.detail || "Gagal muat engineer"));
  }, []);

  const submit = async () => {
    if (!selected) return toast.error("Pilih engineer dulu");
    setBusy(true);
    try {
      await api.post(`/drawing-requests/${drf.id}/accept-assign`, { assigned_engineer_id: selected });
      const name = engineers.find((e) => e.id === selected)?.name || "engineer";
      toast.success(`✓ DRF diterima & ditugaskan ke ${name}`);
      onAssigned?.(drf.id, selected, selected === currentUserId);
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
          <div className="text-sm text-slate-600">Tunjuk <b>siapa</b> yang mengerjakan. Detail drawing/BOM diisi oleh engineer. (Boleh tunjuk diri sendiri.)</div>
          <div className="max-h-60 overflow-y-auto border border-slate-200 divide-y">
            {engineers.length === 0 && <div className="p-3 text-xs text-slate-400 italic">Tidak ada user Engineering. Buat user role eng_staff di Admin.</div>}
            {engineers.map((e) => (
              <label key={e.id} className={`flex items-center gap-2 p-2.5 cursor-pointer hover:bg-emerald-50 ${selected === e.id ? "bg-emerald-100" : ""}`} data-testid={`assign-eng-${e.username}`}>
                <input type="radio" name="eng" checked={selected === e.id} onChange={() => setSelected(e.id)} />
                <div>
                  <div className="text-sm font-semibold text-slate-800">{e.name || e.username}{e.id === currentUserId ? " (Saya)" : ""}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{e.role}</div>
                </div>
              </label>
            ))}
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
