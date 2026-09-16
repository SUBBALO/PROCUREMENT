import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import BackLink from "../components/BackLink";
import { Signature, ArrowClockwise, ShieldCheck, Factory, CheckCircle, ArrowRight, ClipboardText } from "@phosphor-icons/react";

function fmt(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return ""; }
}

export default function EcnTtdQueuePage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const isProd = ["produksi", "production"].includes(user?.role);
  const isQc = user?.role === "qc";
  const deptLabel = isProd ? "Produksi" : isQc ? "QA/QC" : "Anda";
  const DeptIcon = isProd ? Factory : ShieldCheck;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawings/ecn-pending-ttd");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat daftar");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sign = async (it) => {
    setBusyId(it.drawing_id);
    try {
      const { data } = await api.post(`/drawings/${it.drawing_id}/ecn-ack`);
      toast.success(data.message || "TTD tercatat");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal TTD");
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-4 max-w-[1100px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-violet-600 mb-1">
          <DeptIcon size={14} weight="fill" /> {deptLabel} · Acknowledgment ECN
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Menunggu TTD ECN Anda
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Daftar perubahan drawing (ECN) yang sudah terbit dan menunggu tanda tangan digital <b>{deptLabel}</b>.
          Alur berurutan: <b>Produksi → QA/QC → Doc Control</b> (otomatis diarsipkan setelah QA/QC TTD).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" className="mr-1.5" /> Refresh</Button>
        <div className="text-sm text-slate-500"><b className="text-violet-700">{items.length}</b> menunggu TTD Anda</div>
      </div>

      {loading ? (
        <Card className="rounded-none p-10 text-center text-slate-400">Memuat…</Card>
      ) : items.length === 0 ? (
        <Card className="rounded-none p-12 text-center" data-testid="ecn-ttd-empty">
          <CheckCircle size={40} weight="duotone" className="mx-auto text-emerald-500 mb-2" />
          <div className="text-slate-600 font-semibold">Tidak ada ECN yang menunggu TTD Anda</div>
          <div className="text-sm text-slate-400 mt-1">Semua perubahan drawing sudah Anda tandatangani.</div>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="ecn-ttd-list">
          {items.map((it) => (
            <Card key={it.drawing_id} className="rounded-none border-l-4 border-l-violet-500 overflow-hidden" data-testid={`ecn-ttd-card-${it.ecn_no}`}>
              <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-bold text-violet-700">{it.ecn_no}</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-300">{it.stage_label}</span>
                    {it.production_done && it.stage === "qa_qc" && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1"><CheckCircle size={10} weight="fill" /> Produksi OK</span>
                    )}
                  </div>
                  <div className="font-mono text-sm text-slate-800">{it.drawing_no} {it.rev_no != null && <span className="text-slate-400">· Rev {it.rev_no}</span>}</div>
                  <div className="text-xs text-slate-500 mt-0.5">SO {it.so_no || "-"} · {it.customer || "-"} · diajukan {it.requested_by || "-"}</div>
                  {(it.current_desc || it.proposed_desc) && (
                    <div className="mt-2 flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-2 py-1.5 max-w-2xl">
                      <span className="text-slate-500 line-through truncate">{it.current_desc || "—"}</span>
                      <ArrowRight size={14} weight="bold" className="text-violet-500 shrink-0" />
                      <span className="text-slate-800 font-semibold truncate">{it.proposed_desc || it.reason || "—"}</span>
                    </div>
                  )}
                  {it.reason && !it.proposed_desc && (
                    <div className="text-xs text-slate-600 mt-1">Alasan: {it.reason}</div>
                  )}
                </div>
                <div className="shrink-0">
                  <Button
                    onClick={() => sign(it)}
                    disabled={busyId === it.drawing_id}
                    className="rounded-none bg-violet-600 hover:bg-violet-700 text-white h-11 px-6 disabled:opacity-40"
                    data-testid={`ecn-ttd-sign-${it.ecn_no}`}
                  >
                    {busyId === it.drawing_id
                      ? <ArrowClockwise size={16} className="animate-spin mr-2" />
                      : <Signature size={16} weight="bold" className="mr-2" />}
                    TTD Sekarang
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
