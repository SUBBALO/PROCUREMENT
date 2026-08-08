import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "../components/ui/alert-dialog";
import BackLink from "../components/BackLink";
import PdfPreviewModal from "../components/PdfPreviewModal";
import SoDocsPanel from "../components/SoDocsPanel";
import EngLeaderReviewDialog from "../components/EngLeaderReviewDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { WorkOrderView } from "./BomEntryGridPage";
import {
  Wrench, ArrowClockwise, Plus, Trash, FileText, Package,
  CheckCircle, PaperPlaneRight, PencilSimple, Lock, ArrowRight, Eye, ClipboardText,
} from "@phosphor-icons/react";

/**
 * EngineeringDrfWorkPage — Work hub untuk 1 Drawing Request (DRF).
 * Struktur: 1 DRF bisa berisi >1 drawing, tapi HANYA 1 BOM bersama.
 * Hanya engineer yang ditugaskan Eng Leader yang bisa mengerjakan; lainnya view-only.
 *
 * Alur New Order:
 *   1. Engineer tentukan mau buat berapa drawing → Generate nomor drawing.
 *   2. Tiap drawing: buka Work Order untuk upload (multi) + TTD + submit.
 *   3. Semua drawing otomatis share 1 BOM → edit di halaman BOM.
 */
export default function EngineeringDrfWorkPage() {
  const { drfId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [drf, setDrf] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState(null); // { drawingId, target, extraId, title, subtitle }
  const [editDwg, setEditDwg] = useState(null); // drawing yang sedang diedit (draft)
  const [editForm, setEditForm] = useState({ title: "", drawing_type: "Assembly", customer_drawing_no: "", project_name: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [delDwg, setDelDwg] = useState(null); // drawing yang akan dihapus (konfirmasi)
  const [delBusy, setDelBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const openEdit = (d) => {
    setEditForm({
      title: d.title || "",
      drawing_type: d.drawing_type || "Assembly",
      customer_drawing_no: d.customer_drawing_no || "",
      project_name: d.project_name || "",
    });
    setEditDwg(d);
  };

  const saveEdit = async () => {
    if (!editDwg) return;
    setEditBusy(true);
    try {
      await api.patch(`/drawings/${editDwg.id}/basic-info`, {
        title: editForm.title.trim(),
        drawing_type: editForm.drawing_type,
        customer_drawing_no: editForm.customer_drawing_no.trim(),
        project_name: editForm.project_name.trim(),
      });
      toast.success(`Drawing ${editDwg.drawing_no} diperbarui`);
      setEditDwg(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan perubahan");
    } finally {
      setEditBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: drfData } = await api.get(`/drawing-requests/${drfId}`);
      setDrf(drfData);
      const { data: dwData } = await api.get(`/drawings?from_drf_id=${drfId}`);
      const items = dwData.items || dwData || [];
      // sort by drawing_no ascending
      items.sort((a, b) => (a.drawing_no || "").localeCompare(b.drawing_no || ""));
      setDrawings(items);
    } catch (e) {
      toast.error(e.response?.data?.detail || "DRF tidak ditemukan");
      navigate("/engineering");
    } finally {
      setLoading(false);
    }
  }, [drfId, navigate]);

  useEffect(() => { load(); }, [load]);

  // Deep-link dari checklist submit final: scroll ke panel Dokumen SO
  useEffect(() => {
    if (!loading && drawings.length > 0 && window.location.hash === "#so-docs") {
      const el = document.getElementById("so-docs");
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    }
  }, [loading, drawings.length]);

  if (loading || !drf) {
    return (
      <div className="p-12 text-center text-slate-400">
        <ArrowClockwise size={22} className="mx-auto animate-spin mb-2" />
        Memuat Drawing Request...
      </div>
    );
  }

  const isTrueAdmin = ["admin", "super_admin", "supervisor"].includes(user?.role);
  const isLeaderRole = ["eng_leader", "eng_head", "admin", "super_admin", "supervisor"].includes(user?.role);
  const isAssignee = drf.assigned_engineer_id && drf.assigned_engineer_id === user?.id;
  // Hanya engineer yang DITUGASKAN yang bisa generate/upload. Eng Leader (Riski) yang bukan
  // pengerja = view-only (Riski hanya menunjuk siapa yang kerja). Admin = override.
  const canEdit = isAssignee || isTrueAdmin;
  const isRepeat = drf.request_type === "repeat_order";
  const sharedBomId = drawings[0]?.bom_id || drf.shared_bom_id || "";

  // Drawing masih bisa Edit/Hapus selama DRAFT / dikembalikan untuk revisi (belum masuk approval)
  const isDraftDwg = (d) => !d?.approval_status || d.approval_status === "draft";
  const deleteDrawing = async (d) => {
    if (!d) return;
    setDelBusy(true);
    try {
      await api.delete(`/drawings/${d.id}`);
      toast.success(`Drawing ${d.drawing_no} dihapus`);
      setDelDwg(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus drawing");
    } finally {
      setDelBusy(false);
    }
  };
  const sharedBomNo = drawings[0]?.bom_no || "";

  // Fase 2 — LOCK dinamis: SO terkunci bila semua drawing sudah keluar dari 'draft' (submit final).
  const soLocked = drawings.length > 0 && drawings.every((d) => (d.approval_status || "draft") !== "draft");

  // Gate "Terima Job": assignee harus klik TERIMA dulu (catat tanggal start kerja)
  const needAccept = isAssignee && !drf.work_started_at;
  const canWork = canEdit && !needAccept; // admin non-assignee tetap bisa
  const startWork = async () => {
    setAccepting(true);
    try {
      await api.post(`/drawing-requests/${drfId}/start-work`);
      toast.success("Job diterima — tanggal mulai kerja tercatat");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menerima job");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-0.5">
            <Wrench size={12} weight="fill" /> Engineering · Work Group
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            {drf.form_no}
            <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${isRepeat ? "bg-blue-100 text-blue-800 border border-blue-400" : "bg-emerald-100 text-emerald-800 border border-emerald-400"}`}>
              {isRepeat ? "Repeat Order" : "New Order"}
            </span>
          </h1>
          <div className="text-xs text-slate-600 mt-0.5">
            SO: <b className="font-mono">{drf.so_no}</b> · {drf.project_name || "-"} · Customer: <b>{drf.customer_name || "-"}</b>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1.5">
          <div>
            <div className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Ditugaskan ke</div>
            <div className="text-xs font-semibold text-slate-800">{drf.assigned_engineer_name || <span className="italic text-slate-400">Belum di-assign</span>}</div>
          </div>
          {isLeaderRole && drawings.length > 0 && (
            <button
              onClick={() => setShowReview(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-widest transition-colors duration-150 active:translate-y-[1px]"
              data-testid="open-eng-leader-review-dialog-button"
            >
              <ClipboardText size={13} weight="fill" /> Review Dokumen SO
            </button>
          )}
        </div>
      </div>

      {/* Info order — compact */}
      <Card className="rounded-none border-slate-200 px-3 py-2 bg-slate-50">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <Info k="Qty Order" v={`${drf.qty_order} ${drf.unit}`} />
          <Info k="Material" v={drf.material} />
          <Info k="Due Date" v={drf.expected_due_date} />
          <Info k="Request By (Sales)" v={drf.requested_by?.name} />
          <Info k="BOM Bersama" v={sharedBomNo || <span className="italic text-slate-400">Otomatis saat generate</span>} mono />
        </div>
      </Card>

      {!canEdit && (
        <div className="border-2 border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 flex items-center gap-2">
          <Lock size={16} /> Mode <b>view-only</b>. Hanya engineer yang ditugaskan ({drf.assigned_engineer_name || "-"}) yang bisa mengerjakan DRF ini.
        </div>
      )}

      {/* Gate: Terima Job dulu (catat tanggal start kerja) */}
      {needAccept && (
        <div className="border-2 border-emerald-500 bg-emerald-50 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="drf-accept-gate">
          <div className="text-sm text-slate-700 flex-1 min-w-[240px]">
            <b className="text-emerald-800">Job ini ditugaskan ke Anda oleh {drf.assigned_by || "Eng Leader"}.</b><br />
            Klik <b>TERIMA JOB</b> untuk mulai bekerja — tanggal mulai kerja akan tercatat. Setelah itu Anda bisa generate drawing, upload, dan isi BOM.
          </div>
          <button
            onClick={startWork}
            disabled={accepting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            data-testid="drf-accept-btn"
          >
            {accepting
              ? <><ArrowClockwise size={16} className="animate-spin" /> Memproses...</>
              : <><CheckCircle size={16} weight="bold" /> Terima Job</>}
          </button>
        </div>
      )}

      {/* Feature: 2 tab level GRUP — Drawing & Upload | BOM (1 BOM per SO) */}
      <Tabs defaultValue="drawing" className="w-full">
        <TabsList className="rounded-none bg-slate-100 border border-slate-200 p-0 h-auto">
          <TabsTrigger value="drawing" className="rounded-none data-[state=active]:bg-teal-600 data-[state=active]:text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="wg-tab-drawing">
            Drawing &amp; Upload
          </TabsTrigger>
          <TabsTrigger value="bom" className="rounded-none data-[state=active]:bg-amber-600 data-[state=active]:text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="wg-tab-bom">
            {sharedBomNo ? `BOM · ${sharedBomNo}` : "BOM"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drawing" className="mt-3 space-y-4">
      {isRepeat && (
        <div className="border-2 border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
          <b>Repeat Order:</b> tarik-otomatis <b>Drawing + BOM + Nesting + Costing</b> dari order lama (cari via SO / No. DWG). Hasil tarikan auto-attach & BOM autofill — <b>editable bila Qty berubah</b>. Kalau data lama tidak ketemu, tetap bisa generate drawing baru & upload manual di bawah.
        </div>
      )}

      {/* Repeat Order: auto-pull panel */}
      {canWork && isRepeat && (
        <RepeatPullPanel drf={drf} onDone={load} />
      )}

      {/* Generate drawings */}
      {canWork && (
        <GenerateDrawingsPanel drf={drf} existingCount={drawings.length} onDone={load} />
      )}

      {/* Fase 2 — Banner LOCK setelah submit final */}
      {soLocked && (
        <div className="border-2 border-slate-700 bg-slate-100 p-3 flex items-center gap-2 text-sm text-slate-700" data-testid="drf-so-locked-banner">
          <Lock size={18} weight="fill" className="text-slate-700" />
          <span>
            <b>Dokumen SO terkunci.</b> Semua drawing sudah di-submit final ke Eng Leader — BOM &amp; Dokumen SO
            (Nesting/AutoCAD/Costing) tidak bisa diubah lagi. Jika ada drawing dikembalikan (revisi), kunci otomatis terbuka.
          </span>
        </div>
      )}

      {/* Drawings list */}
      <div className="border-2 border-teal-500">
        <div className="px-3 py-2 bg-teal-600 text-white flex items-center gap-2">
          <FileText size={16} weight="fill" />
          <div className="text-[11px] uppercase tracking-widest font-bold flex-1">
            Daftar Drawing ({drawings.length})
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {drawings.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              Belum ada drawing. {canEdit ? "Generate nomor drawing di atas untuk mulai." : ""}
            </div>
          )}
          {drawings.map((d) => {
            const subtitle = `${d.title || d.project_name || ""} · ${d.drawing_type || ""}`;
            return (
            <div key={d.id} className="p-3 flex flex-wrap items-center gap-3 hover:bg-teal-50/40" data-testid={`drf-drawing-${d.drawing_no}`}>
              <div className="flex-1 min-w-[220px]">
                <div className="font-mono font-bold text-slate-900 text-sm">{d.drawing_no}</div>
                <div className="text-xs text-slate-500">{d.title || d.project_name || "-"} · {d.drawing_type}</div>
                {d.customer_drawing_no && (
                  <div className="text-[10px] text-slate-500">Cust DWG No: <span className="font-mono text-slate-700">{d.customer_drawing_no}</span></div>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <PreviewChip
                  available={!!d.file_id}
                  okLabel="MKS ✓" offLabel="MKS ✗"
                  onClick={() => setViewer({ drawingId: d.id, target: "mks", title: `${d.drawing_no} · DWG MKS`, subtitle })}
                  testid={`drf-preview-mks-${d.drawing_no}`}
                />
                <PreviewChip
                  available={!!d.customer_ref_file_id}
                  okLabel="Cust Dwg 👁" offLabel="Cust Dwg"
                  onClick={() => setViewer({ drawingId: d.id, target: "customer_ref", title: `${d.drawing_no} · Customer DWG`, subtitle })}
                  testid={`drf-preview-cust-${d.drawing_no}`}
                />
              </div>
              <StatusBadge status={d.approval_status} />
              <button
                onClick={() => navigate(`/engineering/work-order/${d.id}`)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold uppercase tracking-widest"
                data-testid={`drf-open-wo-${d.drawing_no}`}
              >
                <PencilSimple size={13} weight="bold" /> Upload & TTD <ArrowRight size={12} />
              </button>
              {canWork && isDraftDwg(d) && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(d)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 border border-amber-400 text-amber-700 hover:bg-amber-50 text-[11px] font-bold uppercase tracking-wider"
                    title="Edit data drawing"
                    data-testid={`drf-edit-${d.drawing_no}`}
                  >
                    <PencilSimple size={12} weight="bold" /> Edit
                  </button>
                  <button
                    onClick={() => setDelDwg(d)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 border border-rose-400 text-rose-700 hover:bg-rose-50 text-[11px] font-bold uppercase tracking-wider"
                    title="Hapus drawing (permanen)"
                    data-testid={`drf-delete-${d.drawing_no}`}
                  >
                    <Trash size={12} weight="bold" /> Hapus
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Dokumen SO (level SO/BOM): Nesting · AutoCAD · Costing ---------- */}
      {drawings.length > 0 && (
        <div id="so-docs" className="scroll-mt-4">
          <SoDocsPanel bomId={sharedBomId} bomNo={sharedBomNo} canEdit={canWork && !soLocked} />
        </div>
      )}


      {drawings.length > 0 && canEdit && (
        <div className="border-2 border-sky-500 bg-sky-50 p-3 text-xs text-slate-700">
          <b>Langkah berikutnya:</b> untuk tiap drawing klik <b>Upload &amp; TTD</b> → upload PDF MKS, lalu <b>TTD &amp; Submit ke Eng Leader</b>. Isi item BOM di tab <b>BOM</b> (1 BOM untuk semua drawing). Submit final memverifikasi drawing + BOM sekaligus.
        </div>
      )}
        </TabsContent>

        {/* TAB 2 — BOM (embedded editable grid, Simpan saja · tanpa Submit) */}
        <TabsContent value="bom" className="mt-3">
          {sharedBomId ? (
            <div className="border-2 border-amber-500 p-3" data-testid="wg-bom-embed">
              <WorkOrderView bomId={sharedBomId} embedded />
            </div>
          ) : (
            <div className="border-2 border-dashed border-amber-400 bg-amber-50/50 p-8 text-center text-sm text-slate-600" data-testid="wg-bom-empty">
              <Package size={28} weight="fill" className="mx-auto mb-2 text-amber-500" />
              BOM bersama belum terbentuk. Generate minimal 1 nomor drawing di tab <b>Drawing &amp; Upload</b> — BOM akan otomatis dibuat dan muncul di sini.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {viewer && (
        <PdfPreviewModal
          drawingId={viewer.drawingId}
          target={viewer.target}
          extraId={viewer.extraId || ""}
          stamped={false}
          title={viewer.title}
          subtitle={viewer.subtitle}
          onClose={() => setViewer(null)}
        />
      )}

      <EngLeaderReviewDialog
        open={showReview}
        onClose={() => setShowReview(false)}
        drfId={drfId}
        bomId={sharedBomId}
        bomNo={sharedBomNo}
        soNo={drf.so_no}
        onReload={load}
      />

      {/* ---------- Edit Drawing Modal (draft/revisi saja) ---------- */}
      <Dialog open={!!editDwg} onOpenChange={(o) => { if (!o) setEditDwg(null); }}>
        <DialogContent className="sm:max-w-[520px] rounded-none" data-testid="drf-edit-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilSimple size={18} weight="bold" className="text-amber-600" />
              Edit Data Drawing
            </DialogTitle>
            <DialogDescription>
              {editDwg?.drawing_no
                ? <>Perbaiki data dasar untuk <b className="font-mono">{editDwg.drawing_no}</b>. Nomor drawing tidak dapat diubah.</>
                : "Perbaiki data dasar drawing."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Judul Drawing</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="cth: Bracket Assembly"
                className="rounded-none"
                data-testid="drf-edit-title-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-type">Tipe Drawing</Label>
              <select
                id="edit-type"
                value={editForm.drawing_type}
                onChange={(e) => setEditForm((f) => ({ ...f, drawing_type: e.target.value }))}
                className="w-full h-10 border border-slate-300 rounded-none text-sm px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                data-testid="drf-edit-type-select"
              >
                <option value="Assembly">Assembly</option>
                <option value="Part">Part</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-custno">No. Drawing Customer</Label>
              <Input
                id="edit-custno"
                value={editForm.customer_drawing_no}
                onChange={(e) => setEditForm((f) => ({ ...f, customer_drawing_no: e.target.value }))}
                placeholder="No. DWG dari customer (opsional)"
                className="rounded-none font-mono"
                data-testid="drf-edit-custno-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-project">Nama Project</Label>
              <Input
                id="edit-project"
                value={editForm.project_name}
                onChange={(e) => setEditForm((f) => ({ ...f, project_name: e.target.value }))}
                placeholder="Nama project (opsional)"
                className="rounded-none"
                data-testid="drf-edit-project-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setEditDwg(null)}
              disabled={editBusy}
              data-testid="drf-edit-cancel-btn"
            >
              Batal
            </Button>
            <Button
              className="rounded-none bg-amber-600 hover:bg-amber-700 text-white"
              onClick={saveEdit}
              disabled={editBusy}
              data-testid="drf-edit-save-btn"
            >
              {editBusy ? <><ArrowClockwise size={15} className="animate-spin mr-1.5" /> Menyimpan...</> : <><CheckCircle size={15} weight="bold" className="mr-1.5" /> Simpan Perubahan</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Delete Drawing Konfirmasi ---------- */}
      <AlertDialog open={!!delDwg} onOpenChange={(o) => { if (!o) setDelDwg(null); }}>
        <AlertDialogContent className="rounded-none" data-testid="drf-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash size={18} weight="bold" /> Hapus Drawing?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {delDwg?.drawing_no
                ? <>Drawing <b className="font-mono">{delDwg.drawing_no}</b> beserta seluruh file (MKS / Customer DWG / Nesting / CAD) akan dihapus <b>permanen</b> dan tidak dapat dikembalikan.</>
                : "Drawing ini akan dihapus permanen."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none" disabled={delBusy} data-testid="drf-delete-cancel-btn">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-rose-600 hover:bg-rose-700 text-white"
              onClick={(e) => { e.preventDefault(); deleteDrawing(delDwg); }}
              disabled={delBusy}
              data-testid="drf-delete-confirm-btn"
            >
              {delBusy ? <><ArrowClockwise size={15} className="animate-spin mr-1.5" /> Menghapus...</> : <><Trash size={15} weight="bold" className="mr-1.5" /> Ya, Hapus Permanen</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Generate Drawings Panel ---------- */
function GenerateDrawingsPanel({ drf, existingCount, onDone }) {
  const [open, setOpen] = useState(existingCount === 0);
  const [count, setCount] = useState(1);
  const [rows, setRows] = useState([{ project_initial: "", drawing_type: "Assembly", title: "", customer_drawing_no: "" }]);
  const [classMaterial, setClassMaterial] = useState(drf.material ? `RAW MATERIAL FOR ${drf.qty_order} ${drf.unit}` : "");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);   // preview nomor berikutnya (row 0)
  const [recent, setRecent] = useState([]);         // daftar nomor DWG yang pernah dibuat (customer sama)
  const custCode = (drf.customer_code || "MKS").toUpperCase();

  const applyCount = (n) => {
    const c = Math.max(1, Math.min(20, parseInt(n) || 1));
    setCount(c);
    setRows((prev) => {
      const next = [...prev];
      while (next.length < c) next.push({ project_initial: prev[0]?.project_initial || "", drawing_type: "Part", title: "", customer_drawing_no: "" });
      return next.slice(0, c);
    });
  };

  const updateRow = (i, key, val) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  // Live preview nomor + daftar nomor lama (verifikasi urutan / tidak loncat)
  const row0Initial = rows[0]?.project_initial || "";
  const row0Type = rows[0]?.drawing_type || "Assembly";
  useEffect(() => {
    const initial = row0Initial.trim();
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/drawings/next-number", {
          params: { customer_code: custCode, project_initial: initial || "X", drawing_type: row0Type },
        });
        setPreview(data);
      } catch { setPreview(null); }
      try {
        const { data } = await api.get(`/drawings?q=${encodeURIComponent(custCode)}&limit=40`);
        const items = (data.items || data || []).filter((d) => (d.drawing_no || "").includes(`_${custCode}.`));
        items.sort((a, b) => (b.drawing_no || "").localeCompare(a.drawing_no || ""));
        setRecent(items.slice(0, 8));
      } catch { setRecent([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [row0Initial, row0Type, custCode]);

  const submit = async () => {
    for (const r of rows) {
      if (!r.project_initial.trim()) return toast.error("Project Initial wajib diisi tiap drawing (mis. 'BR' untuk Bracket)");
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/drawing-requests/${drf.id}/generate-drawings`, {
        class_material: classMaterial,
        drawings: rows.map((r) => ({
          project_initial: r.project_initial.trim(),
          drawing_type: r.drawing_type,
          title: r.title.trim(),
          customer_drawing_no: (r.customer_drawing_no || "").trim(),
        })),
      });
      toast.success(`✓ ${data.drawings.length} nomor drawing dibuat, berbagi 1 BOM.`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal generate drawing");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="rounded-none bg-teal-700 hover:bg-teal-800 text-white" data-testid="drf-add-drawings-btn">
          <Plus size={15} weight="bold" className="mr-1" /> Tambah Drawing
        </Button>
      </div>
    );
  }

  return (
    <div className="border-2 border-emerald-500" data-testid="drf-generate-panel">
      <div className="px-3 py-2 bg-emerald-600 text-white flex items-center gap-2">
        <Plus size={16} weight="bold" />
        <div className="text-[11px] uppercase tracking-widest font-bold flex-1">Generate Nomor Drawing (bisa lebih dari 1)</div>
      </div>
      <div className="p-4 bg-emerald-50 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-800 mb-1">Mau buat berapa drawing?</div>
            <Input
              type="number" min={1} max={20} value={count}
              onChange={(e) => applyCount(e.target.value)}
              className="rounded-none border-emerald-300 w-28 h-10 text-lg font-bold"
              data-testid="drf-gen-count"
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-800 mb-1">Class / Paket Material (opsional)</div>
            <Input value={classMaterial} onChange={(e) => setClassMaterial(e.target.value)} className="rounded-none border-emerald-300 h-10" placeholder="mis. RAW MATERIAL FOR QTY 5 PCS" data-testid="drf-gen-class" />
          </div>
        </div>

        {/* Cek urutan nomor: preview + daftar nomor lama */}
        <div className="bg-white border border-emerald-200 p-3 text-xs" data-testid="drf-number-check">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Nomor berikutnya (perkiraan):</span>{" "}
              <span className="font-mono font-bold text-emerald-800">{preview?.preview || "isi Initial dulu"}</span>
              {preview && (
                <span className="ml-2 text-[10px] text-slate-500">
                  {preview.is_new_project ? "(project/initial baru)" : `(lanjut · sudah ada ${preview.existing_project_drawings} dwg tipe ini)`}
                </span>
              )}
            </div>
          </div>
          {recent.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Nomor DWG terakhir untuk {custCode} (cek urutan / loncat):</div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((d) => (
                  <span key={d.id} className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5" title={d.title || ""}>{d.drawing_no}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest font-bold text-emerald-800 px-2">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-2">Initial*</div>
            <div className="col-span-2">Tipe</div>
            <div className="col-span-3">Judul</div>
            <div className="col-span-3">No. DWG Customer (opsional)</div>
            <div className="col-span-1"></div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white border border-emerald-200 p-2" data-testid={`drf-gen-row-${i}`}>
              <div className="col-span-1 text-center text-xs font-bold text-slate-500">#{i + 1}</div>
              <div className="col-span-2">
                <Input value={r.project_initial} onChange={(e) => updateRow(i, "project_initial", e.target.value.toUpperCase())} className="rounded-none h-9" placeholder="BR" data-testid={`drf-gen-initial-${i}`} />
              </div>
              <div className="col-span-2">
                <select value={r.drawing_type} onChange={(e) => updateRow(i, "drawing_type", e.target.value)} className="w-full h-9 border border-slate-300 rounded-none text-sm px-2" data-testid={`drf-gen-type-${i}`}>
                  <option>Assembly</option>
                  <option>Part</option>
                </select>
              </div>
              <div className="col-span-3">
                <Input value={r.title} onChange={(e) => updateRow(i, "title", e.target.value)} className="rounded-none h-9" placeholder="Judul drawing (opsional)" data-testid={`drf-gen-title-${i}`} />
              </div>
              <div className="col-span-3">
                <Input value={r.customer_drawing_no} onChange={(e) => updateRow(i, "customer_drawing_no", e.target.value)} className="rounded-none h-9 font-mono" placeholder="No. DWG customer" data-testid={`drf-gen-custno-${i}`} />
              </div>
              <div className="col-span-1 text-center">
                {rows.length > 1 && (
                  <button onClick={() => { setRows(rows.filter((_, x) => x !== i)); setCount(rows.length - 1); }} className="text-rose-600 hover:text-rose-800" title="Hapus baris">
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => { setRows([...rows, { project_initial: rows[0]?.project_initial || "", drawing_type: "Part", title: "", customer_drawing_no: "" }]); setCount(rows.length + 1); }} className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
            <Plus size={13} /> Tambah baris
          </button>
        </div>

        <div className="flex justify-end gap-2">
          {existingCount > 0 && <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>}
          <Button onClick={submit} disabled={busy} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40" data-testid="drf-gen-submit">
            {busy ? "Membuat..." : `Generate ${rows.length} Nomor Drawing`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RepeatPullPanel({ drf, onDone }) {
  const [q, setQ] = useState(drf.ref_so_no || drf.so_no || "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState({});
  const [classMaterial, setClassMaterial] = useState(drf.material ? `RAW MATERIAL FOR ${drf.qty_order} ${drf.unit}` : "");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [viewer, setViewer] = useState(null);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const openDrawing = (r, target, label) => setViewer({
    mode: "drawing", drawingId: r.id, target,
    title: `${r.drawing_no} · ${label}`, subtitle: `${r.title || ""} · SO ${r.so_no || "-"}`,
  });

  const openBomAtt = async (r, category, label) => {
    if (!r.bom_id) return toast.error("Drawing lama ini tidak punya BOM terkait");
    try {
      const { data } = await api.get(`/bom/${r.bom_id}/attachments`);
      const groups = data.attachments || {};
      let list = [];
      if (category === "nesting") list = groups.nesting || [];
      else list = [...(groups.costing || []), ...(groups.costing_prev || []), ...(groups.nesting_price || [])];
      const att = list[0];
      if (!att) return toast.error(`Tidak ada file ${label}`);
      setViewer({
        mode: "generic",
        metaUrl: `/bom/${r.bom_id}/attachments/${att.id}/page-meta`,
        pageBase: `${apiUrl}/api/bom/${r.bom_id}/attachments/${att.id}/page-image`,
        title: `${r.drawing_no} · ${label}`, subtitle: att.filename || "",
      });
    } catch (e) {
      toast.error(e.response?.data?.detail || `Gagal buka ${label}`);
    }
  };

  const doSearch = useCallback(async () => {
    if (!q.trim()) return toast.error("Isi SO / No. DWG untuk mencari");
    setSearching(true);
    setSearched(true);
    try {
      const { data } = await api.get(`/drawings/repeat-search?q=${encodeURIComponent(q.trim())}`);
      setResults(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mencari");
      setResults([]);
    } finally { setSearching(false); }
  }, [q]);

  // Auto-search sekali saat panel dibuka bila ada ref SO
  useEffect(() => {
    if ((drf.ref_so_no || drf.so_no || "").trim()) { doSearch(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const pull = async () => {
    if (selectedIds.length === 0) return toast.error("Pilih minimal 1 drawing lama");
    setBusy(true);
    try {
      const { data } = await api.post(`/drawing-requests/${drf.id}/pull-repeat`, {
        source_drawing_ids: selectedIds,
        class_material: classMaterial,
      });
      toast.success(`✓ ${data.drawings.length} drawing ditarik (Drawing + BOM + Nesting + Costing). Cek & edit Qty bila perlu.`);
      setSelected({});
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menarik data lama");
    } finally { setBusy(false); }
  };

  return (
    <div className="border-2 border-blue-500" data-testid="repeat-pull-panel">
      <div className="px-3 py-2 bg-blue-600 text-white flex items-center gap-2">
        <ArrowClockwise size={16} weight="bold" />
        <div className="text-[11px] uppercase tracking-widest font-bold flex-1">Tarik Otomatis Data Order Lama (Repeat)</div>
      </div>
      <div className="p-4 bg-blue-50 space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[240px]">
            <div className="text-[10px] uppercase tracking-widest font-bold text-blue-800 mb-1">Cari via SO lama / No. DWG / No. DWG Customer</div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="rounded-none border-blue-300 h-10"
              placeholder="mis. SO-2024-001 atau DWG.24.05.01_MKS..."
              data-testid="repeat-search-input"
            />
          </div>
          <Button onClick={doSearch} disabled={searching} className="rounded-none bg-blue-700 hover:bg-blue-800 text-white h-10" data-testid="repeat-search-btn">
            {searching ? "Mencari..." : "Cari"}
          </Button>
        </div>

        <div className="bg-white border border-blue-200">
          <div className="px-3 py-1.5 bg-blue-100/60 text-[10px] uppercase tracking-widest font-bold text-blue-800 border-b border-blue-200">
            Hasil pencarian ({results.length})
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100" data-testid="repeat-results">
            {searching && <div className="p-6 text-center text-slate-400 text-sm">Mencari...</div>}
            {!searching && searched && results.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">
                Tidak ada drawing lama yang cocok. Gunakan panel <b>Generate Nomor Drawing</b> di bawah untuk buat & upload manual.
              </div>
            )}
            {!searching && results.map((r) => (
              <label key={r.id} className={`flex items-start gap-3 p-2.5 cursor-pointer hover:bg-blue-50/60 ${selected[r.id] ? "bg-blue-50" : ""}`} data-testid={`repeat-opt-${r.drawing_no}`}>
                <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold text-slate-900 text-sm">{r.drawing_no}</div>
                  <div className="text-xs text-slate-500 truncate">{r.title || "-"} · {r.drawing_type} · SO {r.so_no || "-"} · {r.customer_name || "-"}</div>
                  {r.customer_drawing_no && <div className="text-[10px] text-slate-500">Cust DWG: <span className="font-mono">{r.customer_drawing_no}</span></div>}
                </div>
                <div className="flex flex-wrap gap-1 justify-end" onClick={(e) => e.preventDefault()}>
                  <PreviewChip
                    available={r.has_mks}
                    okLabel="MKS 👁" offLabel="MKS"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDrawing(r, "mks", "DWG MKS"); }}
                    testid={`repeat-preview-mks-${r.drawing_no}`}
                  />
                  <PreviewChip
                    available={r.has_customer_ref}
                    okLabel="Cust Dwg 👁" offLabel="Cust Dwg"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDrawing(r, "customer_ref", "Customer DWG"); }}
                    testid={`repeat-preview-cust-${r.drawing_no}`}
                  />
                  <PreviewChip
                    available={r.has_nesting}
                    okLabel="Nesting 👁" offLabel="Nesting"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openBomAtt(r, "nesting", "Nesting"); }}
                    testid={`repeat-preview-nesting-${r.drawing_no}`}
                  />
                  <PreviewChip
                    available={r.has_costing}
                    okLabel="Costing 👁" offLabel="Costing"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openBomAtt(r, "costing", "Costing"); }}
                    testid={`repeat-preview-costing-${r.drawing_no}`}
                  />
                  <Chip ok={!!r.bom_no} label={r.bom_no || "No BOM"} neutral={!r.bom_no} />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <div className="text-[10px] uppercase tracking-widest font-bold text-blue-800 mb-1">Class / Paket Material (opsional)</div>
            <Input value={classMaterial} onChange={(e) => setClassMaterial(e.target.value)} className="rounded-none border-blue-300 h-10" placeholder="mis. RAW MATERIAL FOR QTY 5 PCS" data-testid="repeat-class" />
          </div>
          <Button onClick={pull} disabled={busy || selectedIds.length === 0} className="rounded-none bg-blue-700 hover:bg-blue-800 text-white h-10 disabled:opacity-40" data-testid="repeat-pull-btn">
            <ArrowClockwise size={15} weight="bold" className="mr-1" />
            {busy ? "Menarik..." : `Tarik ${selectedIds.length || ""} Drawing`}
          </Button>
        </div>
        <div className="text-[11px] text-slate-500">
          Data yang ditarik: Drawing (MKS + Customer), BOM (item + costing lama sebagai referensi), & Nesting. Semua auto-attach di tiap Work Order. BOM bersama bisa diedit bila Qty berubah.
        </div>
      </div>

      {viewer && (
        <PdfPreviewModal
          {...(viewer.mode === "drawing"
            ? { drawingId: viewer.drawingId, target: viewer.target, stamped: false }
            : {
                metaUrl: viewer.metaUrl,
                pageUrlBuilder: (n) => `${viewer.pageBase}?page=${n}&scale=2`,
                pdfUrl: (viewer.metaUrl && viewer.metaUrl.endsWith("/page-meta")
                          && viewer.metaUrl.includes("/attachments/")
                          && /\.pdf$/i.test(viewer.subtitle || ""))
                  ? viewer.metaUrl.replace("/page-meta", "/preview") : "",
              })}
          title={viewer.title}
          subtitle={viewer.subtitle}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function Info({ k, v, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{k}</div>
      <div className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{v || <span className="italic text-slate-400">-</span>}</div>
    </div>
  );
}

function Chip({ ok, label, neutral }) {
  const cls = neutral
    ? "bg-slate-100 text-slate-500 border-slate-300"
    : ok
    ? "bg-emerald-100 text-emerald-800 border-emerald-400"
    : "bg-rose-100 text-rose-800 border-rose-400";
  return <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${cls}`}>{label}</span>;
}

/** Chip yang bisa diklik untuk PREVIEW dokumen bila file tersedia (verifikasi sebelum submit). */
function PreviewChip({ available, okLabel, offLabel, onClick, testid }) {
  if (!available) {
    return (
      <span
        className="px-1.5 py-0.5 text-[10px] font-bold uppercase border bg-slate-100 text-slate-400 border-slate-300 cursor-not-allowed"
        title="Belum ada file"
        data-testid={`${testid}-off`}
      >
        {offLabel}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      title="Klik untuk preview dokumen (view-only)"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase border bg-emerald-100 text-emerald-800 border-emerald-400 hover:bg-emerald-200 hover:border-emerald-500 transition-colors cursor-pointer"
    >
      <Eye size={11} weight="bold" /> {okLabel}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: { label: "DRAFT", cls: "bg-slate-200 text-slate-700 border-slate-400" },
    pending_eng_head: { label: "MENUNGGU ENG LEADER", cls: "bg-amber-100 text-amber-800 border-amber-500" },
    pending_qc: { label: "MENUNGGU QC", cls: "bg-orange-100 text-orange-800 border-orange-500" },
    pending_sales: { label: "MENUNGGU SALES", cls: "bg-yellow-100 text-yellow-800 border-yellow-500" },
    approved: { label: "APPROVED", cls: "bg-emerald-100 text-emerald-800 border-emerald-500" },
    controlled: { label: "CONTROLLED", cls: "bg-indigo-100 text-indigo-800 border-indigo-500" },
    released: { label: "RELEASED", cls: "bg-teal-100 text-teal-800 border-teal-500" },
  };
  const m = map[status] || map.draft;
  return <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${m.cls}`}>{m.label}</span>;
}
