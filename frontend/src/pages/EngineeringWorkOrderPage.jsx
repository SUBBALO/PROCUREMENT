import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import { DrawingAttachmentsPanel } from "./MasterDrawingPage";
import SignaturePlacementModal from "../components/SignaturePlacementModal";
import PdfPreviewModal from "../components/PdfPreviewModal";
import { Wrench, ClipboardText, FloppyDisk, ArrowClockwise, PaperPlaneRight, CheckCircle, Warning, Eye, DownloadSimple, Paperclip, PencilSimpleLine, Clock, XCircle, PlayCircle } from "@phosphor-icons/react";

/**
 * EngineeringWorkOrderPage — halaman kerja engineer setelah Eng Head assign drawing.
 * Alur:
 *   1. Cek/atur BOM Linking (Tanpa BOM · Buat BOM Baru · Link ke BOM Existing)
 *   2. Upload PDF Drawing + Customer Ref + Extras (via DrawingAttachmentsPanel)
 *   3. Tombol "TTD & Submit" (buka SignaturePlacementModal stage="submit")
 *      → auto-forward ke approval Eng Head
 */
export default function EngineeringWorkOrderPage() {
  const { drawingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [drawing, setDrawing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSubmitSig, setShowSubmitSig] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/drawings/${drawingId}`);
      setDrawing(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Drawing tidak ditemukan");
      navigate("/engineering");
    } finally { setLoading(false); }
  }, [drawingId, navigate]);

  useEffect(() => { load(); }, [load]);

  // Iter 22 — Tidak lagi auto-redirect ke Master List saat drawing selesai.
  // Approver/reviewer boleh tetap buka WorkOrder untuk lihat attachments & status TTD.

  // Hanya tampilkan loader penuh saat load AWAL (drawing masih null).
  // Refetch setelah upload TIDAK meng-unmount panel → popup kategori tidak ikut hilang.
  if (!drawing) {
    return (
      <div className="p-12 text-center text-slate-400">
        <ArrowClockwise size={22} className="mx-auto animate-spin mb-2" />
        Memuat work order...
      </div>
    );
  }

  const isDraft = drawing.approval_status === "draft" || !drawing.approval_status;
  const isPending = (drawing.approval_status || "").startsWith("pending_");
  const hasWorkCat = ["simple", "moderate", "complex"].includes((drawing.work_category || "").toLowerCase());
  const canSubmit = isDraft && drawing.file_id && hasWorkCat;
  const isEngUser = ["eng_staff", "eng_leader", "admin", "super_admin"].includes(user?.role);
  const rr = drawing.revision_request || null;

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
            <Wrench size={14} weight="fill" /> Engineering · Work Order
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            {drawing.drawing_no || "(belum ada nomor)"}
          </h1>
          <div className="text-sm text-slate-600 mt-1">
            <b>{drawing.title || drawing.project_name || "-"}</b>
            {drawing.customer_name && <> · Customer: <b>{drawing.customer_name}</b></>}
            {drawing.so_no && <> · SO: <b className="font-mono">{drawing.so_no}</b></>}
          </div>
        </div>
        <StatusBadge status={drawing.approval_status} />
      </div>

      {/* Fase 3 — Catatan revisi dari leader (kalau pernah di-reject) */}
      <RevisionNotesPanel drawing={drawing} />

      {/* Alur Revisi ECN — gate "Lanjut Kerja" setelah ECN disetujui Eng Leader */}
      <RevisionFlowPanel drawing={drawing} rr={rr} isEngUser={isEngUser} onReload={load} />

      {/* Riwayat Revisi ECN — lihat & buka PDF versi lama tiap Rev */}
      <RevisionHistoryPanel drawing={drawing} />


      {/* Info card: assign, prepared_by, from DRF */}
      <Card className="rounded-none border-slate-200 p-4 bg-slate-50">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Info k="Di-assign ke" v={drawing.assigned_to_name} />
          <Info k="Prepared By" v={drawing.prepared_by} />
          <Info k="Request By (Sales)" v={drawing.request_by_sales} />
          <Info k="BOM Link" v={drawing.bom_no || <span className="italic text-slate-400">Belum di-link</span>} mono />
        </div>
      </Card>

      {/* Step 1: BOM Linking */}
      <BomLinkingSection drawing={drawing} onUpdated={load} />

      {/* Step 2: Attachments (Upload PDF Drawing, Customer Ref, Extras) */}
      <div className="border-2 border-emerald-500">
        <div className="px-3 py-2 bg-emerald-600 text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-white text-emerald-700 flex items-center justify-center text-xs font-bold">2</span>
          <div className="text-[11px] uppercase tracking-widest font-bold">Upload Dokumen Drawing</div>
        </div>
        <div className="p-3">
          <DrawingAttachmentsPanel drawing={drawing} onDrawingUpdated={() => load()} />
        </div>
      </div>

      {/* Step 3: Submit for approval */}
      {isDraft && (
        <div className="border-2 border-sky-500">
          <div className="px-3 py-2 bg-sky-600 text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-white text-sky-700 flex items-center justify-center text-xs font-bold">3</span>
            <div className="text-[11px] uppercase tracking-widest font-bold">TTD Prepared By & Submit ke Eng Head</div>
          </div>
          <div className="p-4 bg-sky-50 flex items-center justify-between gap-4">
            <div className="text-sm text-slate-700 flex-1">
              Setelah PDF drawing di-upload & BOM di-link, klik tombol di kanan untuk TTD
              posisi <b>Prepared By</b> pada PDF, lalu drawing otomatis dikirim ke Eng Head untuk approval.
              {!drawing.file_id && (
                <div className="mt-1 text-rose-700 font-bold">⚠ Upload PDF Drawing dulu di Step 2 sebelum submit.</div>
              )}
              {drawing.file_id && !hasWorkCat && (
                <div className="mt-1 text-rose-700 font-bold">⚠ Pilih Kategori Pekerjaan (SIMPLE / MODERATE / COMPLEX) dulu di Step 2 sebelum submit.</div>
              )}
            </div>
            <Button
              onClick={() => setShowSubmitSig(true)}
              disabled={!canSubmit}
              className="rounded-none bg-sky-700 hover:bg-sky-800 text-white h-11 px-6 disabled:opacity-40"
              data-testid="wo-ttd-submit-btn"
            >
              <PaperPlaneRight size={16} weight="bold" className="mr-2" />
              TTD & Submit
            </Button>
          </div>
        </div>
      )}

      {isPending && (
        <Card className="rounded-none border-amber-500 border-2 p-4 bg-amber-50">
          <div className="flex items-center gap-3">
            <CheckCircle size={24} weight="fill" className="text-amber-700" />
            <div>
              <div className="font-bold text-amber-900">
                Drawing sudah di-submit — sedang menunggu approval
              </div>
              <div className="text-xs text-amber-800 mt-1">
                Status: {drawing.approval_status}. Approver akan menerima notifikasi & TTD sesuai role.
              </div>
            </div>
          </div>
        </Card>
      )}

      {showSubmitSig && (
        <SignaturePlacementModal
          drawing={drawing}
          stage="submit"
          onDone={() => { setShowSubmitSig(false); load(); }}
          onClose={() => setShowSubmitSig(false)}
        />
      )}
    </div>
  );
}

/* ── Revision Flow Panel ─────────────────────────────────────────────────
 * Menampilkan status alur revisi ECN di Work Order:
 *  - pending    : menunggu keputusan Eng Leader (read-only)
 *  - approved   : GATE "Lanjut Kerja?" — staff klik untuk mulai revisi (buka semua menu)
 *  - in_progress: sedang revisi (Rev N) — semua menu terbuka
 *  - rejected   : ECN ditolak
 * Catatan: pengajuan ECN dilakukan dari Master List, bukan di sini.
 */
function RevisionFlowPanel({ drawing, rr, isEngUser, onReload }) {
  const [busy, setBusy] = useState(false);
  if (!rr || !rr.status) return null;
  const ecn = rr.ecn || {};

  const startRevision = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/drawings/${drawing.id}/start-revision`);
      toast.success(`Revisi dimulai — Rev ${data.rev_no}. Semua menu kini terbuka.`);
      onReload?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memulai revisi");
    } finally { setBusy(false); }
  };

  // pending — menunggu keputusan leader
  if (rr.status === "pending") {
    return (
      <div className="border-2 border-amber-500" data-testid="rev-flow-pending">
        <div className="px-3 py-2 bg-amber-500 text-white flex items-center gap-2">
          <Clock size={16} weight="bold" />
          <div className="text-[11px] uppercase tracking-widest font-bold">Pengajuan ECN — Menunggu Keputusan Eng Leader</div>
        </div>
        <div className="p-4 bg-amber-50 text-sm text-slate-700">
          {ecn.ecn_no && <span className="font-mono font-bold">{ecn.ecn_no}</span>} diajukan oleh <b>{rr.requested_by}</b>.
          Drawing belum bisa direvisi sampai Eng Leader menyetujui.
        </div>
      </div>
    );
  }

  // approved — GATE lanjut kerja
  if (rr.status === "approved") {
    return (
      <div className="border-2 border-indigo-600" data-testid="rev-flow-approved">
        <div className="px-3 py-2 bg-indigo-600 text-white flex items-center gap-2">
          <CheckCircle size={16} weight="fill" />
          <div className="text-[11px] uppercase tracking-widest font-bold">Permintaan Revisi Disetujui — Lanjut Kerja?</div>
        </div>
        <div className="p-4 bg-indigo-50 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-700 flex-1">
            ECN {ecn.ecn_no && <span className="font-mono font-bold">{ecn.ecn_no}</span>} telah <b>disetujui</b> oleh {rr.approved_by || "Eng Leader"}.
            {rr.decision_notes && <> Catatan: <i>"{rr.decision_notes}"</i>.</>}
            <div className="mt-1">Klik <b>Mulai Revisi</b> untuk melanjutkan — data lama akan disimpan sebagai <b>history revisi</b> dan semua menu drawing akan terbuka kembali.</div>
          </div>
          {isEngUser && (
            <Button
              onClick={startRevision}
              disabled={busy}
              className="rounded-none bg-indigo-600 hover:bg-indigo-700 text-white h-11 px-6 disabled:opacity-40"
              data-testid="rev-start-btn"
            >
              {busy ? <ArrowClockwise size={16} className="animate-spin mr-2" /> : <PlayCircle size={16} weight="bold" className="mr-2" />}
              Mulai Revisi
            </Button>
          )}
        </div>
      </div>
    );
  }

  // in_progress — sedang revisi
  if (rr.status === "in_progress") {
    return (
      <div className="border-2 border-teal-500" data-testid="rev-flow-inprogress">
        <div className="px-3 py-2 bg-teal-600 text-white flex items-center gap-2">
          <PencilSimpleLine size={16} weight="bold" />
          <div className="text-[11px] uppercase tracking-widest font-bold">Sedang Revisi — Rev {drawing.rev_no ?? 1}</div>
        </div>
        <div className="p-4 bg-teal-50 text-sm text-slate-700">
          Revisi ECN {ecn.ecn_no && <span className="font-mono font-bold">{ecn.ecn_no}</span>} sedang dikerjakan.
          Perbaiki drawing/BOM sesuai perubahan, lalu <b>TTD & Submit</b> ulang ke Eng Head.
        </div>
      </div>
    );
  }

  // rejected
  if (rr.status === "rejected") {
    return (
      <div className="border-2 border-rose-500" data-testid="rev-flow-rejected">
        <div className="px-3 py-2 bg-rose-600 text-white flex items-center gap-2">
          <XCircle size={16} weight="fill" />
          <div className="text-[11px] uppercase tracking-widest font-bold">Pengajuan ECN Ditolak</div>
        </div>
        <div className="p-4 bg-rose-50 text-sm text-slate-700">
          ECN {ecn.ecn_no && <span className="font-mono font-bold">{ecn.ecn_no}</span>} ditolak oleh {rr.decided_by || "Eng Leader"}.
          {rr.decision_notes && <> Catatan: <i>"{rr.decision_notes}"</i>.</>}
        </div>
      </div>
    );
  }

  return null;
}

/* ── Revision History Panel ──────────────────────────────────────────────
 * Menampilkan riwayat revisi ECN (snapshot data lama tiap Rev) dengan
 * kemampuan membuka/mengunduh PDF MKS versi lama.
 */
function RevisionHistoryPanel({ drawing }) {
  const [preview, setPreview] = useState(null);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const history = (drawing.revisions || [])
    .filter((r) => r.type === "ecn_revision")
    .slice()
    .reverse(); // terbaru dulu
  if (history.length === 0) return null;

  return (
    <div className="border-2 border-slate-300" data-testid="rev-history-panel">
      <div className="px-3 py-2 bg-slate-700 text-white flex items-center gap-2">
        <ClipboardText size={16} weight="bold" />
        <div className="text-[11px] uppercase tracking-widest font-bold">Riwayat Revisi (History)</div>
        <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{history.length} versi</span>
      </div>
      <div className="divide-y divide-slate-100">
        {history.map((rev) => {
          const snap = rev.snapshot || {};
          const hasMks = !!snap.file_id;
          return (
            <div key={rev.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50" data-testid={`rev-hist-${rev.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-white">Rev {rev.rev_no ?? 0}</span>
                  {rev.ecn_no && <span className="font-mono text-xs font-bold text-indigo-700">{rev.ecn_no}</span>}
                  <span className="text-xs text-slate-500">oleh <b>{rev.started_by || "-"}</b></span>
                  {rev.at && <span className="text-[11px] text-slate-400">· {new Date(rev.at).toLocaleString("id-ID")}</span>}
                </div>
                {rev.reason && <div className="text-xs text-slate-600 mt-0.5 truncate" title={rev.reason}>Alasan: {rev.reason}</div>}
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{snap.drawing_no || drawing.drawing_no} · {(snap.approvals || []).length} TTD tersimpan</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasMks ? (
                  <>
                    <button
                      onClick={() => setPreview(rev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 border border-slate-300 hover:bg-slate-100"
                      data-testid={`rev-hist-view-${rev.id}`}
                    >
                      <Eye size={13} weight="bold" /> Lihat PDF Rev {rev.rev_no ?? 0}
                    </button>
                    <a
                      href={`${apiUrl}/api/drawings/${drawing.id}/revisions/${rev.id}/download`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 border border-sky-300 hover:bg-sky-50"
                      data-testid={`rev-hist-dl-${rev.id}`}
                    >
                      <DownloadSimple size={13} weight="bold" /> Unduh
                    </a>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">Tidak ada PDF versi ini</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <PdfPreviewModal
          metaUrl={`/drawings/${drawing.id}/revisions/${preview.id}/page-meta`}
          pageUrlBuilder={(n) => `${apiUrl}/api/drawings/${drawing.id}/revisions/${preview.id}/page-image?page=${n}&scale=2`}
          title={`${preview.snapshot?.drawing_no || drawing.drawing_no} · Rev ${preview.rev_no ?? 0}${preview.ecn_no ? " · " + preview.ecn_no : ""}`}
          downloadUrl={`${apiUrl}/api/drawings/${drawing.id}/revisions/${preview.id}/download`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function RevisionNotesPanel({ drawing }) {
  const [preview, setPreview] = useState(null);
  const revisions = (drawing.revisions || []).filter((r) => r.type !== "ecn_revision").slice().reverse(); // reject notes saja, terbaru dulu
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  if (revisions.length === 0) return null;
  const isDraft = (drawing.approval_status || "draft") === "draft";

  return (
    <div className="border-2 border-rose-500" data-testid="revision-panel">
      <div className="px-3 py-2 bg-rose-600 text-white flex items-center gap-2">
        <Warning size={16} weight="fill" />
        <div className="text-[11px] uppercase tracking-widest font-bold flex-1">
          Catatan Revisi dari Reviewer{isDraft ? " — Perlu Diperbaiki & Submit Ulang" : ""}
        </div>
        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{revisions.length}x revisi</span>
      </div>
      <div className="p-4 bg-rose-50 space-y-3">
        {revisions.map((rev, idx) => (
          <div key={rev.id || idx} className={`bg-white border ${idx === 0 ? "border-rose-300" : "border-slate-200"} p-3`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                {idx === 0 ? "\u2605 Terbaru \u00b7 " : ""}Reject di stage: {rev.stage}
              </div>
              <div className="text-[10px] text-slate-500">
                {rev.rejected_by_name} \u00b7 {rev.at ? new Date(rev.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : ""}
              </div>
            </div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">{rev.notes}</div>
            {(rev.files || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {rev.files.map((f) => (
                  <div key={f.id} className="inline-flex items-center gap-1 border border-slate-300 bg-slate-50 pl-2">
                    <Paperclip size={12} className="text-slate-500" />
                    <span className="text-[11px] max-w-[160px] truncate">{f.filename}</span>
                    {f.is_pdf && (
                      <button
                        onClick={() => setPreview(f)}
                        className="px-1.5 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase"
                        title="Preview"
                        data-testid={`rev-preview-${f.id}`}
                      >
                        <Eye size={11} weight="bold" />
                      </button>
                    )}
                    <a
                      href={`${apiUrl}/api/drawings/${drawing.id}/revision-files/${f.id}/download`}
                      target="_blank" rel="noreferrer"
                      className="px-1.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase"
                      title="Download"
                    >
                      <DownloadSimple size={11} weight="bold" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isDraft && (
          <div className="text-[11px] text-rose-700 font-semibold">
            \u2192 Perbaiki drawing/BOM sesuai catatan, upload ulang PDF bila perlu, lalu klik <b>TTD &amp; Submit</b> di bawah untuk kirim ulang ke Eng Head.
          </div>
        )}
      </div>

      {preview && (
        <PdfPreviewModal
          metaUrl={`/drawings/${drawing.id}/revision-files/${preview.id}/page-meta`}
          pageUrlBuilder={(n) => `${apiUrl}/api/drawings/${drawing.id}/revision-files/${preview.id}/page-image?page=${n}&scale=2`}
          title={preview.filename}
          downloadUrl={`${apiUrl}/api/drawings/${drawing.id}/revision-files/${preview.id}/download`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}


function Info({ k, v, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{k}</div>
      <div className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>
        {v || <span className="italic text-slate-400">-</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: { label: "DRAFT", cls: "bg-slate-200 text-slate-700 border-slate-400" },
    pending_eng_head: { label: "MENUNGGU ENG HEAD", cls: "bg-amber-100 text-amber-800 border-amber-500" },
    pending_qc: { label: "MENUNGGU QC", cls: "bg-orange-100 text-orange-800 border-orange-500" },
    pending_sales: { label: "MENUNGGU SALES", cls: "bg-yellow-100 text-yellow-800 border-yellow-500" },
    approved: { label: "APPROVED", cls: "bg-emerald-100 text-emerald-800 border-emerald-500" },
    controlled: { label: "CONTROLLED", cls: "bg-indigo-100 text-indigo-800 border-indigo-500" },
    released: { label: "RELEASED", cls: "bg-teal-100 text-teal-800 border-teal-500" },
  };
  const m = map[status] || map.draft;
  return (
    <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border ${m.cls}`}
          data-testid="wo-status-badge">
      {m.label}
    </span>
  );
}

/* ---------------- BOM Linking Section ---------------- */
function BomLinkingSection({ drawing, onUpdated }) {
  const [mode, setMode] = useState(drawing.bom_id ? "existing_locked" : "none");
  const [bomList, setBomList] = useState([]);
  const [bomQ, setBomQ] = useState("");
  const [nextBomNo, setNextBomNo] = useState("");
  const [newBomNo, setNewBomNo] = useState("");
  const [selectedBomId, setSelectedBomId] = useState(drawing.bom_id || "");
  const [saving, setSaving] = useState(false);
  const [linkedBom, setLinkedBom] = useState(null); // detail BOM yg sedang di-link

  // Load detail BOM yg sedang di-link (untuk cek engineering_status)
  useEffect(() => {
    if (!drawing.bom_id) { setLinkedBom(null); return; }
    api.get(`/bom/${drawing.bom_id}`)
      .then(({ data }) => setLinkedBom(data))
      .catch(() => setLinkedBom(null));
  }, [drawing.bom_id]);

  // Load next BOM No suggestion
  useEffect(() => {
    if (mode !== "create_new") return;
    api.get("/bom/next-number").then(({ data }) => setNextBomNo(data.bom_no || "")).catch(() => {});
  }, [mode]);

  // Load existing BOMs for search
  useEffect(() => {
    if (mode !== "existing") return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/bom?q=${encodeURIComponent(bomQ)}&limit=20`);
        setBomList(data.items || []);
      } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(t);
  }, [bomQ, mode]);

  const alreadyLinked = drawing.bom_id;
  const linkedBomApproved = linkedBom && linkedBom.engineering_status === "approved";
  const drawingIsDraft = (drawing.approval_status || "draft") === "draft";

  const saveLink = async (overrideMode) => {
    const useMode = overrideMode || mode;
    setSaving(true);
    try {
      const payload = { bom_link_mode: useMode };
      if (useMode === "existing") payload.bom_id = selectedBomId;
      if (useMode === "create_new") payload.bom_no = newBomNo.trim();
      const { data } = await api.post(`/drawings/${drawing.id}/link-bom`, payload);
      toast.success(useMode === "none" ? "BOM unlinked" : `BOM ter-link: ${data.bom_no || "-"}`);
      onUpdated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal link BOM");
    } finally { setSaving(false); }
  };

  const quickCreateNew = async () => {
    if (!window.confirm("Buat BOM BARU untuk drawing ini? BOM lama tetap tersimpan, hanya drawing ini yang di-relink ke BOM baru (kosong).")) return;
    setMode("create_new");
    setNewBomNo("");
    // Langsung save mode create_new (auto-generate no)
    await saveLink("create_new");
  };

  return (
    <div className="border-2 border-amber-500">
      <div className="px-3 py-2 bg-amber-600 text-white flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-white text-amber-700 flex items-center justify-center text-xs font-bold">1</span>
        <div className="text-[11px] uppercase tracking-widest font-bold flex-1">
          BOM Linking
          {alreadyLinked && <span className="ml-2 text-[10px] normal-case tracking-normal">— sudah terhubung ke <b className="font-mono">{drawing.bom_no}</b></span>}
        </div>
        {alreadyLinked && (
          <a
            href={`/engineering/bom-entry/${drawing.bom_id}`}
            className="text-[10px] font-bold uppercase tracking-widest text-white bg-amber-800 hover:bg-amber-900 px-2 py-1"
            data-testid="wo-open-bom"
          >
            Buka BOM →
          </a>
        )}
      </div>
      <div className="p-4 bg-amber-50 space-y-3">
        {/* Warning: BOM terkunci karena sudah approved */}
        {linkedBomApproved && drawingIsDraft && (
          <div className="border-2 border-rose-500 bg-rose-50 p-3" data-testid="wo-bom-approved-warn">
            <div className="text-[11px] uppercase tracking-widest font-bold text-rose-800 mb-1">⚠ BOM Terkunci — Approved</div>
            <div className="text-xs text-slate-700 mb-2">
              BOM <b className="font-mono">{drawing.bom_no}</b> sudah <b>approved</b> di workflow BOM (biasanya untuk drawing sebelumnya yg 1 SO).
              Isi BOM tidak bisa diedit lagi. Kalau drawing baru ini butuh BOM dengan item beda, klik <b>"Buat BOM Baru"</b> di bawah — BOM lama tetap tersimpan untuk drawing sebelumnya.
            </div>
            <Button
              onClick={quickCreateNew}
              disabled={saving}
              className="rounded-none bg-rose-700 hover:bg-rose-800 text-white text-xs h-8"
              data-testid="wo-bom-quick-create"
            >
              🆕 Buat BOM Baru untuk Drawing Ini
            </Button>
          </div>
        )}

        {alreadyLinked && mode === "existing_locked" && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              Drawing ini sudah ter-link ke BOM <b className="font-mono">{drawing.bom_no}</b>
              {linkedBom && (
                <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  linkedBom.engineering_status === "approved"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-400"
                    : "bg-slate-100 text-slate-700 border border-slate-400"
                }`}>
                  {linkedBom.engineering_status || "draft"}
                </span>
              )}
              . Klik <b>Ubah Link</b> jika ingin ganti / lepaskan.
            </div>
            <Button variant="outline" onClick={() => setMode("none")}
                    className="rounded-none" data-testid="wo-bom-change">
              Ubah Link
            </Button>
          </div>
        )}

        {mode !== "existing_locked" && (
          <>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1 cursor-pointer" data-testid="wo-bom-none">
                <input type="radio" name="wo_bom" checked={mode === "none"} onChange={() => setMode("none")} />
                <span>Tanpa BOM</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer" data-testid="wo-bom-new">
                <input type="radio" name="wo_bom" checked={mode === "create_new"} onChange={() => setMode("create_new")} />
                <span>Buat BOM Baru</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer" data-testid="wo-bom-existing">
                <input type="radio" name="wo_bom" checked={mode === "existing"} onChange={() => setMode("existing")} />
                <span>Link ke BOM Existing</span>
              </label>
            </div>

            {mode === "create_new" && (
              <div className="bg-white border border-amber-300 p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-widest font-bold text-amber-800">Nomor BOM Baru</div>
                <Input
                  className="rounded-none border-amber-300 font-mono"
                  value={newBomNo}
                  onChange={(e) => setNewBomNo(e.target.value)}
                  placeholder={nextBomNo ? `Kosongkan → pakai ${nextBomNo}` : "Auto..."}
                  data-testid="wo-bom-newno"
                />
                <div className="text-[11px] text-slate-500">
                  BOM baru dibuat kosong — tambah items lewat halaman BOM setelah link tersimpan.
                </div>
              </div>
            )}

            {mode === "existing" && (
              <div className="bg-white border border-amber-300 p-3 space-y-2">
                <Input
                  className="rounded-none border-amber-300"
                  value={bomQ}
                  onChange={(e) => setBomQ(e.target.value)}
                  placeholder="Cari bom_no / SO / project..."
                  data-testid="wo-bom-search"
                />
                <div className="max-h-48 overflow-y-auto border border-slate-200 divide-y">
                  {bomList.length === 0 && (
                    <div className="p-3 text-xs text-slate-400 italic">Ketik untuk mencari BOM...</div>
                  )}
                  {bomList.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBomId(b.id)}
                      className={`w-full text-left p-2 text-xs hover:bg-amber-50 ${selectedBomId === b.id ? "bg-amber-100 font-bold" : ""}`}
                      data-testid={`wo-bom-opt-${b.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">{b.bom_no}</span>
                        {b.engineering_status === "approved" && (
                          <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-400 px-1">approved · locked</span>
                        )}
                      </div>
                      <div className="text-slate-500">SO: {b.so_no || "-"} · {b.project_name || "-"} · {b.customer || "-"}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {alreadyLinked && (
                <Button variant="outline" onClick={() => setMode("existing_locked")}
                        className="rounded-none">Batal</Button>
              )}
              <Button
                onClick={() => saveLink()}
                disabled={saving || (mode === "existing" && !selectedBomId)}
                className="rounded-none bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-40"
                data-testid="wo-bom-save"
              >
                <FloppyDisk size={14} weight="bold" className="mr-1" />
                {saving ? "Menyimpan..." : "Simpan Link BOM"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
