import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ArrowClockwise, Eye, Stamp, MagnifyingGlass, ClockClockwise, Signature, Factory, ShieldCheck, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import EcnReviewModal from "../components/EcnReviewModal";
import BackLink from "../components/BackLink";
import { Input } from "../components/ui/input";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import SignaturePlacementModal from "../components/SignaturePlacementModal";
import PdfPreviewModal from "../components/PdfPreviewModal";
import SignatureHistoryPanel from "../components/SignatureHistoryPanel";
import RejectDrawingModal from "../components/RejectDrawingModal";

const ROLE_STAGE_MAP = {
  eng_leader: "eng_head",
  eng_head: "eng_head",
  engineering: "eng_head",
  qc: "qc",
  sales: "sales",
};

// Tahap TTD ditentukan dari STATUS drawing itu sendiri (bukan sekadar role).
// Ini penting untuk Admin/Super Admin yang inbox-nya lintas-tahap (emergency override).
const STATUS_TO_STAGE = {
  pending_eng_head: "eng_head",
  pending_qc: "qc",
  pending_sales: "sales",
};

/**
 * PendingApprovalDrawingsPage — halaman approver (Eng Head / QC / Sales) dengan 2 tab:
 *  - "Perlu TTD Saya": drawing menunggu TTD digital → preview (baca-saja) + TTD/Reject.
 *  - "Riwayat TTD Saya": bukti audit drawing yang pernah di-TTD (gabungan dari kartu lama).
 * Preview pakai PdfPreviewModal (image-based, tanpa buka tab baru / tanpa download).
 */
export default function PendingApprovalDrawingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [ecnItems, setEcnItems] = useState([]);
  const [busyEcn, setBusyEcn] = useState(null);
  const [ecnReview, setEcnReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [sigDrawing, setSigDrawing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rejectDrawing, setRejectDrawing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [drawRes, ecnRes] = await Promise.allSettled([
        api.get("/drawings/pending-my-approval"),
        api.get("/drawings/ecn-pending-ttd"),
      ]);
      setItems(drawRes.status === "fulfilled" ? (drawRes.value.data.items || []) : []);
      setEcnItems(ecnRes.status === "fulfilled" ? (ecnRes.value.data.items || []) : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat data");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const signEcn = async (it) => {
    if (!it) return;
    setBusyEcn(it.drawing_id);
    try {
      const { data } = await api.post(`/drawings/${it.drawing_id}/ecn-ack`);
      toast.success(data.message || "TTD tercatat");
      setEcnReview(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal TTD");
    } finally { setBusyEcn(null); }
  };

  const filtered = q.trim()
    ? items.filter((d) => [d.drawing_no, d.project_name, d.customer_name, d.customer_code, d.so_no].some(
        (v) => (v || "").toLowerCase().includes(q.toLowerCase())
      ))
    : items;
  const pag = usePagination(filtered, 20);

  const roleStage = ROLE_STAGE_MAP[user?.role];
  // Tahap TTD per-drawing: utamakan status drawing, fallback ke pemetaan role.
  // Mendukung Admin/Super Admin (inbox lintas-tahap) sekaligus approver biasa.
  const stageOf = (d) => STATUS_TO_STAGE[d?.approval_status] || roleStage || null;
  const roleLabel = {
    eng_head: "Engineering Head",
    eng_leader: "Engineering Head",
    engineering: "Engineering Head",
    qc: "Quality Control",
    sales: "Sales",
    doc_control: "Document Control",
  }[user?.role] || user?.role;

  const doReject = (d) => setRejectDrawing(d);

  const TabBtn = ({ id, icon: Icon, label, count }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px transition-colors ${tab === id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
      data-testid={`pending-tab-${id}`}
    >
      <Icon size={15} weight="fill" /> {label}
      {typeof count === "number" && count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">{count}</span>
      )}
    </button>
  );

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-700 mb-1">
          <Stamp size={14} weight="fill" /> Kotak Masuk TTD — {roleLabel}
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Menunggu TTD Saya
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Semua yang menunggu tanda tangan Anda dalam satu tempat: <b>Drawing</b> (review & TTD) dan <b>ECN</b> (perubahan drawing). Tab <b>Riwayat TTD Saya</b> berisi bukti audit.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <TabBtn id="pending" icon={Stamp} label="Perlu TTD Saya" count={items.length + ecnItems.length} />
        <TabBtn id="history" icon={ClockClockwise} label="Riwayat TTD Saya" />
      </div>

      {tab === "pending" && ecnItems.length > 0 && (
        <Card className="rounded-none border-violet-300 overflow-hidden" data-testid="inbox-ecn-section">
          <div className="px-4 py-2 bg-violet-600 text-white flex items-center gap-2">
            <Signature size={15} weight="bold" />
            <div className="text-[11px] uppercase tracking-widest font-bold">ECN — Perubahan Drawing</div>
            <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{ecnItems.length} menunggu TTD</span>
          </div>
          <div className="divide-y divide-slate-100">
            {ecnItems.map((it) => (
              <div key={it.drawing_id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 hover:bg-violet-50/40" data-testid={`inbox-ecn-${it.ecn_no}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-sm font-bold text-violet-700">{it.ecn_no}</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-300 inline-flex items-center gap-1">
                      {it.stage === "production" ? <Factory size={10} weight="fill" /> : <ShieldCheck size={10} weight="fill" />}{it.stage_label}
                    </span>
                    {it.production_done && it.stage === "qa_qc" && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1"><CheckCircle size={10} weight="fill" /> Produksi OK</span>
                    )}
                  </div>
                  <div className="font-mono text-sm text-slate-800">{it.drawing_no}{it.rev_no != null && <span className="text-slate-400"> · Rev {it.rev_no}</span>}</div>
                  <div className="text-[11px] text-slate-500">SO {it.so_no || "-"} · {it.customer || "-"} · diajukan {it.requested_by || "-"}</div>
                  {(it.current_desc || it.proposed_desc) && (
                    <div className="mt-1 inline-flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-2 py-1 max-w-xl">
                      <span className="text-slate-500 line-through truncate">{it.current_desc || "—"}</span>
                      <ArrowRight size={13} weight="bold" className="text-violet-500 shrink-0" />
                      <span className="text-slate-800 font-semibold truncate">{it.proposed_desc || it.reason || "—"}</span>
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => setEcnReview(it)}
                  disabled={busyEcn === it.drawing_id}
                  className="rounded-none bg-violet-600 hover:bg-violet-700 text-white h-10 px-5 disabled:opacity-40 shrink-0"
                  data-testid={`inbox-ecn-sign-${it.ecn_no}`}
                >
                  {busyEcn === it.drawing_id ? <ArrowClockwise size={15} className="animate-spin mr-1.5" /> : <Eye size={15} weight="bold" className="mr-1.5" />}
                  Review & TTD
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "pending" && items.length === 0 && ecnItems.length === 0 && (
        <Card className="rounded-none p-12 text-center" data-testid="inbox-empty">
          <CheckCircle size={40} weight="duotone" className="mx-auto text-emerald-500 mb-2" />
          <div className="text-slate-600 font-semibold">Tidak ada yang menunggu TTD Anda</div>
          <div className="text-sm text-slate-400 mt-1">Semua drawing & ECN sudah Anda tandatangani.</div>
        </Card>
      )}

      {tab === "pending" && items.length > 0 && (
        <Card className="rounded-none border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <MagnifyingGlass size={14} className="text-slate-500" />
            <Input
              className="h-9 rounded-none border-slate-300 w-72"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari drawing no / project / customer / SO..."
              data-testid="pending-search"
            />
            <Button variant="ghost" onClick={load} className="rounded-none h-9">
              <ArrowClockwise size={14} weight="bold" />
            </Button>
            <div className="flex-1"></div>
            <div className="text-xs text-slate-500">
              <b className="text-emerald-700">{filtered.length}</b> drawing menunggu TTD Anda
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                  <th className="text-left p-3">Drawing No</th>
                  <th className="text-left p-3">Title / Project</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">SO</th>
                  <th className="text-left p-3">Prepared By</th>
                  <th className="text-left p-3">Request Sales</th>
                  <th className="text-center p-3">Sudah TTD</th>
                  <th className="text-center p-3">Aksi</th>
                </tr>
              </thead>
              <tbody data-testid="pending-approval-list">
                {loading && (<tr><td colSpan={8} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400">
                    🎉 Tidak ada drawing yang menunggu TTD Anda saat ini.
                  </td></tr>
                )}
                {pag.pagedData.map((d) => {
                  const approvedCount = (d.approvals || []).filter((a) => !a.stage?.startsWith("reject_") && a.stage !== "submit").length;
                  return (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-emerald-50/40" data-testid={`pending-row-${d.drawing_no}`}>
                      <td className="p-3 font-mono font-semibold text-slate-900">{d.drawing_no}</td>
                      <td className="p-3 text-slate-800">
                        <div className="font-semibold">{d.title || "-"}</div>
                        <div className="text-xs text-slate-500">{d.project_name || ""}</div>
                      </td>
                      <td className="p-3 text-xs">{d.customer_name || d.customer_code || "-"}</td>
                      <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                      <td className="p-3 text-xs">{d.prepared_by || "-"}</td>
                      <td className="p-3 text-xs">{d.request_by_sales || "-"}</td>
                      <td className="p-3 text-center text-xs">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold">{approvedCount} / 3 ✓</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setPreview(d)}
                            className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                            data-testid={`pending-view-${d.drawing_no}`}
                          >
                            <Eye size={11} weight="bold" /> Preview
                          </button>
                          <button
                            onClick={() => setSigDrawing(d)}
                            disabled={!stageOf(d)}
                            className="inline-flex items-center px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase gap-0.5 disabled:opacity-50"
                            data-testid={`pending-approve-${d.drawing_no}`}
                          >
                            <Stamp size={11} weight="bold" /> TTD & Approve
                          </button>
                          <button
                            onClick={() => doReject(d)}
                            className="inline-flex items-center px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase"
                            data-testid={`pending-reject-${d.drawing_no}`}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar {...pag} label="drawing" testIdPrefix="pending-pag" />
        </Card>
      )}

      {tab === "history" && <SignatureHistoryPanel user={user} />}

      {sigDrawing && stageOf(sigDrawing) && (
        <SignaturePlacementModal
          drawing={sigDrawing}
          stage={stageOf(sigDrawing)}
          onDone={() => { setSigDrawing(null); load(); }}
          onClose={() => setSigDrawing(null)}
        />
      )}

      {preview && (
        <PdfPreviewModal
          drawingId={preview.id}
          targets={[
            { key: "mks", label: "Drawing MKS" },
            { key: "customer_ref", label: "Drawing Customer" },
          ]}
          stamped
          noDownload={user?.role === "qc"}
          noPrint={user?.role === "qc"}
          title={preview.drawing_no}
          subtitle={`${preview.title || ""}${preview.customer_name ? " · " + preview.customer_name : ""}`}
          onClose={() => setPreview(null)}
        />
      )}
      {rejectDrawing && stageOf(rejectDrawing) && (
        <RejectDrawingModal
          drawing={rejectDrawing}
          stage={stageOf(rejectDrawing)}
          onDone={() => { setRejectDrawing(null); load(); }}
          onClose={() => setRejectDrawing(null)}
        />
      )}

      {ecnReview && (
        <EcnReviewModal
          item={ecnReview}
          busy={busyEcn === ecnReview.drawing_id}
          onConfirm={() => signEcn(ecnReview)}
          onClose={() => setEcnReview(null)}
        />
      )}
    </div>
  );
}
