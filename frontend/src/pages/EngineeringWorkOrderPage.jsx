import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import BackLink from "../components/BackLink";
import { DrawingAttachmentsPanel } from "./MasterDrawingPage";
import SignaturePlacementModal from "../components/SignaturePlacementModal";
import PdfPreviewModal from "../components/PdfPreviewModal";
import FinalSubmitChecklistDialog from "../components/FinalSubmitChecklistDialog";
import { Wrench, ClipboardText, ArrowClockwise, PaperPlaneRight, CheckCircle, Warning, Eye, DownloadSimple, Paperclip, PencilSimpleLine, Clock, XCircle, PlayCircle, Factory, ShieldCheck, Archive, Signature, Package, Lock } from "@phosphor-icons/react";

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
  const [showChecklist, setShowChecklist] = useState(false);
  const [wgStatus, setWgStatus] = useState(null);
  const [checkingFinal, setCheckingFinal] = useState(false);

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

  // Fase 2 — deteksi "submit final" (drawing draft terakhir di 1 SO).
  // Jika final → tampilkan checklist wajib dulu sebelum buka modal TTD.
  const handleSubmitClick = async () => {
    if (!drawing.from_drf_id) { setShowSubmitSig(true); return; }
    setCheckingFinal(true);
    try {
      const { data } = await api.get(`/drawing-requests/${drawing.from_drf_id}/workgroup-status`);
      if (isDraft && (data.draft_count || 0) <= 1) {
        setWgStatus(data);
        setShowChecklist(true);
      } else {
        setShowSubmitSig(true);
      }
    } catch {
      setShowSubmitSig(true);
    } finally {
      setCheckingFinal(false);
    }
  };

  const gotoDoc = (target) => {
    setShowChecklist(false);
    if (target === "bom" && drawing.bom_id) {
      navigate(`/engineering/bom-entry/${drawing.bom_id}`);
    } else if (drawing.from_drf_id) {
      // Nesting / CAD / Costing di-upload di halaman Work Group (SoDocsPanel)
      navigate(`/engineering/drf/${drawing.from_drf_id}#so-docs`);
    }
  };

function DrfItemPicker({ drawing, onSaved, editable }) {
  const [items, setItems] = React.useState([]);
  const [name, setName] = React.useState(drawing.item_name || "");
  const [qty, setQty] = React.useState(drawing.item_qty || "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!drawing.from_drf_id) return;
    api.get(`/drawing-requests/${drawing.from_drf_id}`)
      .then(({ data }) => setItems(data?.items || []))
      .catch(() => setItems([]));
  }, [drawing.from_drf_id]);

  const pickItem = (val) => {
    setName(val);
    const it = items.find((i) => i.name === val);
    if (it && !qty) setQty(it.qty);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/drawings/${drawing.id}/drf-item`, { item_name: name, item_qty: Number(qty) || 0 });
      toast.success("Item & qty drawing tersimpan");
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan item");
    } finally { setSaving(false); }
  };

  return (
    <div className="border-2 border-indigo-400" data-testid="wo-drf-item-picker">
      <div className="px-4 py-2.5 bg-indigo-600 text-white flex items-center gap-2 text-[13px] uppercase tracking-widest font-bold">
        <ClipboardText size={16} weight="fill" /> Item &amp; Qty Drawing
        <span className="text-[10px] normal-case tracking-normal opacity-90">— dari daftar item DRF (qty bisa beda/partial, auto-isi qty stamp SO)</span>
      </div>
      <div className="p-3 bg-indigo-50 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Nama Item</label>
          {items.length > 0 ? (
            <select
              value={name} onChange={(e) => pickItem(e.target.value)} disabled={!editable}
              className="w-full h-9 rounded-none border border-slate-300 bg-white px-2 text-sm disabled:opacity-60"
              data-testid="wo-item-select"
            >
              <option value="">— pilih item —</option>
              {items.map((it, i) => <option key={i} value={it.name}>{it.name} (DRF: {it.qty} {it.unit})</option>)}
            </select>
          ) : (
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} placeholder="Nama item"
              className="w-full h-9 rounded-none border border-slate-300 px-2 text-sm disabled:opacity-60" data-testid="wo-item-name" />
          )}
        </div>
        <div className="w-28">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Qty Drawing</label>
          <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} disabled={!editable}
            className="w-full h-9 rounded-none border border-slate-300 px-2 text-sm disabled:opacity-60" data-testid="wo-item-qty" />
        </div>
        {editable && (
          <Button onClick={save} disabled={saving} className="rounded-none bg-indigo-700 hover:bg-indigo-800 text-white h-9" data-testid="wo-item-save">
            {saving ? <ArrowClockwise size={15} className="animate-spin" /> : "Simpan"}
          </Button>
        )}
        {!editable && drawing.item_name && (
          <div className="text-sm text-slate-700">Item: <b>{drawing.item_name}</b> · Qty: <b>{drawing.item_qty}</b></div>
        )}
      </div>
    </div>
  );
}


  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-0.5">
            <Wrench size={12} weight="fill" /> Engineering · Work Order
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            {drawing.drawing_no || "(belum ada nomor)"}
          </h1>
          <div className="text-xs text-slate-600 mt-0.5">
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

      {/* Acknowledgment ECN — Produksi -> QA/QC -> Doc Control (setelah drawing revisi TERBIT/IFU) */}
      <EcnAckPanel drawing={drawing} user={user} onReload={load} />


      {/* Info card: assign, prepared_by, from DRF */}
      <Card className="rounded-none border-slate-200 px-3 py-2 bg-slate-50">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Info k="Di-assign ke" v={drawing.assigned_to_name} />
          <Info k="Prepared By" v={drawing.prepared_by} />
          <Info k="Request By (Sales)" v={drawing.request_by_sales} />
          <Info k="BOM Link" v={drawing.bom_no || <span className="italic text-slate-400">Belum di-link</span>} mono />
        </div>
      </Card>

      {/* Feature B — 2 Tab: (1) Drawing & Upload  (2) BOM (tetap 1 SO) */}
      <Tabs defaultValue="drawing" className="w-full">
        <TabsList className="rounded-none bg-slate-100 border border-slate-200 p-0 h-auto">
          <TabsTrigger value="drawing" className="rounded-none data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="wo-tab-drawing">
            1 · Drawing &amp; Upload
          </TabsTrigger>
          <TabsTrigger value="bom" className="rounded-none data-[state=active]:bg-amber-600 data-[state=active]:text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="wo-tab-bom">
            2 · Bill of Material
          </TabsTrigger>
        </TabsList>

        {/* TAB 1 — Drawing & Upload + Submit */}
        <TabsContent value="drawing" className="mt-3 space-y-4">
          {/* Feature K — Item DRF & Qty untuk drawing ini (auto-isi qty stamping SO) */}
          <DrfItemPicker drawing={drawing} onSaved={load} editable={isDraft} />

          {/* Section B: Attachments (Upload PDF Drawing, Customer Ref, Extras) */}
          <div className="border-2 border-emerald-500">
            <div className="px-4 py-3 bg-emerald-600 text-white flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-white text-emerald-700 flex items-center justify-center text-base font-extrabold">A</span>
              <div className="text-[13px] uppercase tracking-widest font-bold">Upload Dokumen Drawing</div>
            </div>
            <div className="p-3">
              <DrawingAttachmentsPanel drawing={drawing} onDrawingUpdated={() => load()} editable={isDraft} />
            </div>
          </div>

          {/* Section C: Submit for approval */}
          {isDraft && (
            <div className="border-2 border-sky-500">
              <div className="px-4 py-3 bg-sky-600 text-white flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-white text-sky-700 flex items-center justify-center text-base font-extrabold">B</span>
                <div className="text-[13px] uppercase tracking-widest font-bold">TTD Prepared By &amp; Submit ke Eng Head</div>
              </div>
              <div className="p-4 bg-sky-50 flex items-center justify-between gap-4">
                <div className="text-sm text-slate-700 flex-1">
                  Ini <b>satu-satunya</b> tombol Submit ke Engineering. Sistem akan <b>memverifikasi kelengkapan</b>
                  (PDF drawing ter-upload, kategori kerja, dan BOM sudah diisi) sebelum dikirim. BOM cukup <b>disimpan</b>
                  di tab Bill of Material — tidak perlu submit terpisah.
                  {!drawing.file_id && (
                    <div className="mt-1 text-rose-700 font-bold">⚠ Upload PDF Drawing dulu di atas sebelum submit.</div>
                  )}
                  {drawing.file_id && !hasWorkCat && (
                    <div className="mt-1 text-rose-700 font-bold">⚠ Pilih Kategori Pekerjaan (SIMPLE / MODERATE / COMPLEX) dulu sebelum submit.</div>
                  )}
                </div>
                <Button
                  onClick={handleSubmitClick}
                  disabled={!canSubmit || checkingFinal}
                  className="rounded-none bg-sky-700 hover:bg-sky-800 text-white h-12 px-7 text-base disabled:opacity-40 transition-colors duration-150 active:translate-y-[1px]"
                  data-testid="wo-ttd-submit-btn"
                >
                  {checkingFinal
                    ? <ArrowClockwise size={18} className="animate-spin mr-2" />
                    : <PaperPlaneRight size={18} weight="bold" className="mr-2" />}
                  TTD &amp; Submit
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 2 — BOM (1 BOM per SO) */}
        <TabsContent value="bom" className="mt-3">
          <BomReferenceSection drawing={drawing} navigate={navigate} />
        </TabsContent>
      </Tabs>

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

      <FinalSubmitChecklistDialog
        open={showChecklist}
        status={wgStatus}
        onClose={() => setShowChecklist(false)}
        onProceed={() => { setShowChecklist(false); setShowSubmitSig(true); }}
        onGoto={gotoDoc}
      />
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

/* ── ECN Acknowledgment Panel ────────────────────────────────────────────
 * Rantai TTD digital setelah drawing revisi TERBIT (IFU):
 *   Produksi (acknowledge) -> QA/QC (TTD) -> Doc Control (otomatis arsip).
 * Berurutan. Tiap tahap menyimpan PNG TTD + tanggal + jam.
 */
function SignatureImg({ userId, name }) {
  const [err, setErr] = useState(false);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  if (!userId || err) {
    return <div className="h-10 flex items-center text-lg font-semibold text-slate-700 italic" style={{ fontFamily: "Playfair Display, serif" }}>{name}</div>;
  }
  return (
    <img
      src={`${apiUrl}/api/users/${userId}/signature`}
      alt={`TTD ${name}`}
      className="h-10 object-contain"
      onError={() => setErr(true)}
      data-testid="ack-sig-img"
    />
  );
}

const ACK_TONES = {
  amber: { activeBox: "border-amber-400 bg-amber-50", icon: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700" },
  sky: { activeBox: "border-sky-400 bg-sky-50", icon: "text-sky-700", btn: "bg-sky-600 hover:bg-sky-700" },
  indigo: { activeBox: "border-indigo-400 bg-indigo-50", icon: "text-indigo-700", btn: "bg-indigo-600 hover:bg-indigo-700" },
};

function AckStep({ icon: Icon, title, roleLabel, tone, data, active, canSign, onSign, busy, waitingText }) {
  const done = !!data;
  const t = ACK_TONES[tone] || ACK_TONES.indigo;
  const boxCls = done ? "border-emerald-400 bg-emerald-50" : active ? t.activeBox : "border-slate-200 bg-slate-50 opacity-70";
  const testKey = title.toLowerCase().replace(/[^a-z]/g, "-");
  return (
    <div className={`border-2 p-3 flex-1 min-w-[220px] ${boxCls}`} data-testid={`ack-step-${testKey}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} weight="bold" className={done ? "text-emerald-700" : active ? t.icon : "text-slate-400"} />
        <div className="text-[11px] uppercase tracking-widest font-bold text-slate-700">{title}</div>
        {done && <CheckCircle size={16} weight="fill" className="text-emerald-600 ml-auto" />}
      </div>
      {done ? (
        <div className="space-y-1">
          <div className="bg-white border border-slate-200 px-2 py-1">
            <SignatureImg userId={data.user_id} name={data.name} />
          </div>
          <div className="text-xs font-semibold text-slate-800">{data.name}</div>
          <div className="text-[11px] text-slate-500">
            {data.auto ? "Otomatis diarsipkan" : roleLabel} · {data.at ? new Date(data.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : ""}
          </div>
        </div>
      ) : active ? (
        <div className="space-y-2">
          <div className="text-xs text-slate-600">Menunggu {roleLabel}…</div>
          {canSign && (
            <Button onClick={onSign} disabled={busy} className={`rounded-none w-full text-white h-9 ${t.btn}`} data-testid={`ack-sign-${testKey}`}>
              {busy ? <ArrowClockwise size={14} className="animate-spin mr-1.5" /> : <Signature size={14} weight="bold" className="mr-1.5" />}
              TTD Sekarang
            </Button>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 italic">{waitingText}</div>
      )}
    </div>
  );
}

function EcnAckPanel({ drawing, user, onReload }) {
  const [busy, setBusy] = useState(false);
  const rr = drawing.revision_request || {};
  const ecn = rr.ecn || {};
  const isIfu = ["controlled", "released"].includes(drawing.approval_status);
  const available = !!ecn.ecn_no && isIfu;
  if (!available) return null;

  const ack = rr.ack || { stage: "production", production: null, qa_qc: null, doc_control: null };
  const stage = ack.stage || "production";
  const role = user?.role;
  const isProd = ["produksi", "production"].includes(role);
  const isQc = role === "qc";
  const isAdmin = ["admin", "super_admin", "supervisor"].includes(role);

  const doAck = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/drawings/${drawing.id}/ecn-ack`);
      toast.success(data.message || "TTD tercatat");
      onReload?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal TTD");
    } finally { setBusy(false); }
  };

  const allDone = stage === "done";

  return (
    <div className="border-2 border-violet-500" data-testid="ecn-ack-panel">
      <div className="px-3 py-2 bg-violet-600 text-white flex items-center gap-2">
        <ShieldCheck size={16} weight="bold" />
        <div className="text-[11px] uppercase tracking-widest font-bold">Acknowledgment ECN {ecn.ecn_no && <span className="font-mono normal-case">· {ecn.ecn_no}</span>}</div>
        {allDone
          ? <span className="ml-auto text-[10px] bg-emerald-400/90 text-emerald-950 px-2 py-0.5 rounded-full font-bold">SELESAI</span>
          : <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Berurutan: Produksi → QA/QC → Doc Control</span>}
      </div>
      <div className="p-3 bg-violet-50/50">
        <div className="flex flex-col sm:flex-row gap-3">
          <AckStep
            icon={Factory}
            title="Produksi"
            roleLabel="acknowledge Produksi"
            tone="amber"
            data={ack.production}
            active={stage === "production"}
            canSign={isProd || isAdmin}
            onSign={doAck}
            busy={busy}
            waitingText="Menunggu tahap sebelumnya"
          />
          <AckStep
            icon={ShieldCheck}
            title="QA/QC"
            roleLabel="tanda tangan QA/QC"
            tone="sky"
            data={ack.qa_qc}
            active={stage === "qa_qc"}
            canSign={isQc || isAdmin}
            onSign={doAck}
            busy={busy}
            waitingText="Menunggu Produksi acknowledge"
          />
          <AckStep
            icon={Archive}
            title="Doc Control"
            roleLabel="Document Control"
            tone="indigo"
            data={ack.doc_control}
            active={false}
            canSign={false}
            onSign={doAck}
            busy={busy}
            waitingText="Otomatis setelah QA/QC TTD"
          />
        </div>
      </div>
    </div>
  );
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

/* ---------------- BOM Reference Section (read-only, 1 BOM per SO) ---------------- */
function BomReferenceSection({ drawing, navigate }) {
  const linked = !!drawing.bom_id;
  return (
    <div className="border-2 border-amber-500" data-testid="wo-bom-reference">
      <div className="px-4 py-3 bg-amber-600 text-white flex items-center gap-3">
        <span className="w-8 h-8 rounded-full bg-white text-amber-700 flex items-center justify-center text-base font-extrabold">A</span>
        <div className="text-[13px] uppercase tracking-widest font-bold flex-1 flex items-center gap-2">
          <Package size={16} weight="fill" /> Bill of Material
          <span className="text-[11px] normal-case tracking-normal opacity-90">— 1 BOM bersama per Sales Order</span>
        </div>
        {linked && (
          <button
            onClick={() => navigate(`/engineering/bom-entry/${drawing.bom_id}`)}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-800 bg-white hover:bg-amber-50 px-4 h-9 rounded-none border border-amber-200 shadow-sm transition-colors duration-150"
            data-testid="wo-open-bom"
          >
            Isi / Buka BOM →
          </button>
        )}
      </div>
      <div className="p-4 bg-amber-50 text-sm text-slate-700">
        {linked ? (
          <span>
            Drawing ini memakai BOM bersama <b className="font-mono">{drawing.bom_no}</b>.
            Isi/edit item BOM dilakukan sekali untuk seluruh SO — klik <b>Isi / Buka BOM</b> di kanan atas.
          </span>
        ) : (
          <span className="italic text-slate-500">
            BOM bersama diatur otomatis di halaman <b>Work Group</b> saat generate drawing. Belum ada BOM ter-link untuk drawing ini.
          </span>
        )}
      </div>
    </div>
  );
}
