import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import {
  Kanban, ArrowClockwise, CheckCircle, ShoppingCart, Flag, XCircle, Package, FileText,
} from "@phosphor-icons/react";

const APPROVAL_LABEL = {
  draft: { t: "Draft", c: "bg-slate-100 text-slate-600 border-slate-300" },
  pending_eng_head: { t: "Menunggu Eng Leader", c: "bg-amber-100 text-amber-800 border-amber-300" },
  pending_qc: { t: "Menunggu QC", c: "bg-blue-100 text-blue-800 border-blue-300" },
  pending_sales: { t: "Menunggu Sales", c: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  approved: { t: "Approved", c: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  controlled: { t: "Controlled", c: "bg-teal-100 text-teal-800 border-teal-300" },
  released: { t: "Released", c: "bg-green-100 text-green-800 border-green-300" },
};
const CAT_STYLE = {
  simple: "bg-emerald-100 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-100 text-amber-800 border-amber-300",
  complex: "bg-rose-100 text-rose-800 border-rose-300",
};
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

export default function SoTrackerDetailPage() {
  const { drfId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reasonModal, setReasonModal] = useState(null); // { type:'drawing'|'bom', id, mode:'set'|'unset', title }
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/so-tracker/${drfId}`);
      setData(data);
    } catch (e) { toast.error("Gagal memuat tracker"); }
    finally { setLoading(false); }
  }, [drfId]);

  useEffect(() => { load(); }, [load]);

  const openReason = (cfg) => { setReason(""); setReasonModal(cfg); };

  const submitReason = async () => {
    if (!reasonModal) return;
    setBusy(true);
    try {
      if (reasonModal.type === "drawing") {
        await api.post(`/so-tracker/drawing/${reasonModal.id}/partial-release`, { released: reasonModal.mode === "set", reason });
        toast.success(reasonModal.mode === "set" ? "Drawing ditandai terbit partial" : "Tanda partial dibatalkan");
      } else {
        await api.post(`/so-tracker/bom/${reasonModal.id}/purchase-ready`, { ready: reasonModal.mode === "set", reason });
        toast.success(reasonModal.mode === "set" ? "BOM ditandai siap dibeli (Purchasing diberi tahu)" : "Tanda siap-dibeli dibatalkan");
      }
      setReasonModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memproses");
    } finally { setBusy(false); }
  };

  const unsetDirect = async (cfg) => {
    setBusy(true);
    try {
      if (cfg.type === "drawing") await api.post(`/so-tracker/drawing/${cfg.id}/partial-release`, { released: false, reason: "" });
      else await api.post(`/so-tracker/bom/${cfg.id}/purchase-ready`, { ready: false, reason: "" });
      toast.success("Dibatalkan");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setBusy(false); }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400"><ArrowClockwise size={22} className="inline animate-spin mr-2" /> Memuat tracker...</div>;
  }
  if (!data) return <div className="p-8"><BackLink /><p className="text-slate-500 mt-4">SO tidak ditemukan.</p></div>;

  const { drf, bom, drawings } = data;
  const bs = BOM_STATUS[bom?.status] || { t: bom?.status || "—", c: "bg-slate-100 text-slate-500 border-slate-200" };
  const releasedCount = drawings.filter((d) => d.released).length;

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-cyan-700 mb-1">
          <Kanban size={14} weight="fill" /> SO Tracker
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-mono" style={{ fontFamily: "Chivo, sans-serif" }}>
          {drf.so_no || drf.form_no}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {drf.customer_name} · {drf.project_name} · Engineer: {drf.assigned_engineer_name || "-"} · Terima: {fmtDate(drf.accepted_at)} · Mulai: {fmtDate(drf.work_started_at)}
        </p>
      </div>

      {/* BOM card */}
      <div className="border-2 border-slate-300 bg-white" data-testid="sotracker-bom-card">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white">
          <Package size={16} weight="fill" /> <span className="text-sm font-bold uppercase tracking-wider">BOM Bersama SO</span>
        </div>
        <div className="p-4 flex flex-wrap items-center gap-4">
          {bom?.exists ? (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">No. BOM</div>
                <div className="font-mono font-bold text-slate-900">{bom.bom_no}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Status</div>
                <span className={`inline-block px-2 py-0.5 text-[11px] font-bold uppercase border ${bs.c}`}>{bs.t}</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Item</div>
                <div className="font-bold text-slate-800">{bom.items_count}</div>
              </div>
              <div className="flex-1" />
              {bom.purchase_ready ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase bg-green-100 text-green-800 border border-green-300" data-testid="sotracker-bom-buyready-badge">
                      <ShoppingCart size={13} weight="fill" /> Siap Dibeli
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5 max-w-[280px]">{bom.purchase_ready_reason}</div>
                  </div>
                  <Button variant="outline" className="rounded-none border-slate-300" disabled={busy} onClick={() => unsetDirect({ type: "bom", id: bom.bom_id })} data-testid="sotracker-bom-unbuyready">
                    <XCircle size={15} className="mr-1" /> Batalkan
                  </Button>
                </div>
              ) : (
                <Button className="rounded-none bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={() => openReason({ type: "bom", id: bom.bom_id, mode: "set", title: `Tandai BOM ${bom.bom_no} SIAP DIBELI` })} data-testid="sotracker-bom-buyready-btn">
                  <ShoppingCart size={15} weight="bold" className="mr-1.5" /> Tandai Siap Dibeli (Purchasing)
                </Button>
              )}
            </>
          ) : <div className="text-sm text-slate-400">SO ini belum punya BOM bersama.</div>}
        </div>
      </div>

      {/* Drawings table */}
      <div className="border-2 border-slate-300 bg-white">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 text-white">
          <div className="flex items-center gap-2"><FileText size={16} weight="fill" /> <span className="text-sm font-bold uppercase tracking-wider">Drawing ({releasedCount}/{drawings.length} terbit)</span></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left p-3">No. Drawing</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Kategori</th>
                <th className="text-left p-3">Selesai (Eng)</th>
                <th className="text-right p-3">Aksi Partial</th>
              </tr>
            </thead>
            <tbody data-testid="sotracker-dwg-list">
              {drawings.length === 0 && (<tr><td colSpan={5} className="p-6 text-center text-slate-400">Belum ada drawing di SO ini.</td></tr>)}
              {drawings.map((d) => {
                const al = APPROVAL_LABEL[d.approval_status] || { t: d.approval_status, c: "bg-slate-100 text-slate-500 border-slate-200" };
                const cat = (d.work_category || "").toLowerCase();
                return (
                  <tr key={d.id} className="border-b border-slate-100" data-testid={`sotracker-dwg-row-${d.id}`}>
                    <td className="p-3">
                      <div className="font-mono font-bold text-slate-900">{d.drawing_no}</div>
                      <div className="text-[12px] text-slate-500">{d.title}</div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase border ${al.c}`}>{al.t}</span>
                      {d.partial_released && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300" data-testid={`sotracker-partial-badge-${d.id}`}>
                            <Flag size={11} weight="fill" /> Terbit Partial
                          </span>
                          <div className="text-[10px] text-slate-500 mt-0.5 max-w-[220px]">{d.partial_release_reason}</div>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {cat ? <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase border ${CAT_STYLE[cat] || ""}`}>{cat}</span> : <span className="text-slate-300 text-[10px]">—</span>}
                    </td>
                    <td className="p-3 text-[12px] text-emerald-700 font-medium">{fmtDate(d.work_completed_at)}</td>
                    <td className="p-3 text-right">
                      {d.partial_released ? (
                        <Button variant="outline" size="sm" className="rounded-none border-slate-300 text-[11px]" disabled={busy} onClick={() => unsetDirect({ type: "drawing", id: d.id })} data-testid={`sotracker-unpartial-${d.id}`}>
                          <XCircle size={13} className="mr-1" /> Batalkan
                        </Button>
                      ) : (
                        <Button size="sm" className="rounded-none bg-amber-600 hover:bg-amber-700 text-white text-[11px]" disabled={busy} onClick={() => openReason({ type: "drawing", id: d.id, mode: "set", title: `Terbitkan PARTIAL — ${d.drawing_no}` })} data-testid={`sotracker-partial-btn-${d.id}`}>
                          <Flag size={13} weight="bold" className="mr-1" /> Terbit Partial
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reason modal */}
      <Dialog open={!!reasonModal} onOpenChange={(o) => { if (!o) setReasonModal(null); }}>
        <DialogContent className="sm:max-w-[480px] rounded-none" data-testid="sotracker-reason-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reasonModal?.type === "bom" ? <ShoppingCart size={18} className="text-green-600" weight="bold" /> : <Flag size={18} className="text-amber-600" weight="bold" />}
              {reasonModal?.title}
            </DialogTitle>
            <DialogDescription>
              {reasonModal?.type === "bom"
                ? "Beri catatan untuk Purchasing — kenapa BOM ini sudah bisa dibeli walau drawing belum lengkap."
                : "Beri alasan kenapa drawing ini diterbitkan lebih dulu (partial)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="reason-input">Alasan / Catatan <span className="text-rose-600">*wajib</span></Label>
            <Textarea id="reason-input" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="rounded-none" placeholder="Tulis alasan..." data-testid="sotracker-reason-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setReasonModal(null)} disabled={busy} data-testid="sotracker-reason-cancel">Batal</Button>
            <Button className="rounded-none bg-cyan-700 hover:bg-cyan-800 text-white" onClick={submitReason} disabled={busy || !reason.trim()} data-testid="sotracker-reason-save">
              {busy ? "Menyimpan..." : <><CheckCircle size={15} weight="bold" className="mr-1.5" /> Simpan</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
