import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import api, { downloadFile } from "../lib/api";
import { toast } from "sonner";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { FileText, MagnifyingGlass, Plus, PencilSimple, Trash, ArrowClockwise, UploadSimple, Eye, DownloadSimple, Warning, CheckCircle, Printer, Stamp, FileXls, FilePdf, X, PencilSimpleLine, Clock, Users, CaretDown, CaretRight } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import SignaturePlacementModal from "../components/SignaturePlacementModal";
import PdfPreviewModal from "../components/PdfPreviewModal";
import EcnRevisionModal from "../components/EcnRevisionModal";
import { useAuth } from "../lib/auth";
import { canPrintDrawing, isDrawingPreviewOnly } from "../lib/rbac";

const ENG_ROLES = ["eng_staff", "eng_leader", "eng_head", "engineering", "admin", "super_admin"];

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const DISCIPLINES = ["Mechanical", "Civil", "Electrical", "Piping", "Structural", "Instrument", "General"];
const STATUSES = ["Draft", "Issued", "Superseded", "Cancelled"];
// Sales roster — konsisten dengan Quotation & Sales pages
const SALES_NAMES = ["Asiong", "Nicholas", "Nicholas Jacky C", "Kiki", "Riska", "Feggie", "Fiana"];
const STATUS_COLORS = {
  Draft: "bg-slate-100 text-slate-700",
  Issued: "bg-emerald-100 text-emerald-800",
  Superseded: "bg-amber-100 text-amber-800",
  Cancelled: "bg-rose-100 text-rose-700",
};

export default function MasterDrawingPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [drfPrefill, setDrfPrefill] = useState(null); // { from_drf_id, so_no, project_name, customer_name, customer_code, class_material, request_by_sales, source_drawing_id }
  const [uploadItem, setUploadItem] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [customerRefUpload, setCustomerRefUpload] = useState(null);
  const [customerRefPreview, setCustomerRefPreview] = useState(null);
  const [viewer, setViewer] = useState(null); // universal image-based viewer config
  const [detail, setDetail] = useState(null); // drawing detail popup
  const [ecnItem, setEcnItem] = useState(null); // drawing untuk modal Ajukan ECN
  const [mine, setMine] = useState(false); // filter "Drawing Saya"
  const [designer, setDesigner] = useState(""); // filter by designer (user id)
  const [designers, setDesigners] = useState([]); // daftar user Engineering
  const isEngUser = ENG_ROLES.includes(user?.role);
  const isAdminUser = ["admin", "super_admin"].includes(user?.role);
  // Owner check: hanya engineer yang menggambar drawing ini yang boleh ajukan revisi
  const isDesigner = useCallback((it) => {
    if (!it || !user) return false;
    const cands = [it.assigned_to_user_id, it.prepared_by, it.assigned_to_name, it.created_by_id, it.created_by].filter(Boolean);
    return cands.includes(user.id) || cands.includes(user.name) || cands.includes(user.username);
  }, [user]);
  const canPrint = canPrintDrawing(user?.role);
  const previewOnly = isDrawingPreviewOnly(user?.role);

  // Daftar user Engineering untuk filter "Designer" (hanya untuk user Engineering)
  useEffect(() => {
    if (!isEngUser) return;
    api.get("/drawings/eng-designers")
      .then(({ data }) => setDesigners(data.designers || []))
      .catch(() => setDesigners([]));
  }, [isEngUser]);

  // Filter client-side berdasarkan "Drawing Saya" / Designer terpilih
  const viewItems = useMemo(() => {
    let list = items;
    if (mine && user) {
      list = list.filter((it) =>
        it.assigned_to_user_id === user.id ||
        it.prepared_by === user.name || it.prepared_by === user.username ||
        it.assigned_to_name === user.name);
    }
    if (designer) {
      const d = designers.find((x) => x.id === designer);
      const dn = d?.name; const du = d?.username;
      list = list.filter((it) =>
        it.assigned_to_user_id === designer ||
        (dn && (it.prepared_by === dn || it.assigned_to_name === dn)) ||
        (du && it.prepared_by === du));
    }
    return list;
  }, [items, mine, designer, designers, user]);

  const pag = usePagination(viewItems, 20);

  // Iter 19 — kalau URL punya query params from_drf_id → auto-open form Register Drawing dengan pre-fill
  useEffect(() => {
    const from_drf_id = searchParams.get("from_drf_id");
    if (from_drf_id && !showForm) {
      setDrfPrefill({
        from_drf_id,
        so_no: searchParams.get("so_no") || "",
        project_name: searchParams.get("project_name") || "",
        customer_name: searchParams.get("customer_name") || "",
        customer_code: searchParams.get("customer_code") || "",
        class_material: searchParams.get("class_material") || "",
        request_by_sales: searchParams.get("request_by_sales") || "",
        source_drawing_id: searchParams.get("source_drawing_id") || "",
      });
      setShowForm(true);
      // Clear query params setelah baca
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, showForm]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawings", {
        params: {
          q: q.trim() || undefined,
          discipline: discipline || undefined,
          status: status || undefined,
        },
      });
      setItems(data.items || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal muat"); }
    finally { setLoading(false); }
  }, [q, discipline, status]);

  useEffect(() => { load(); }, [load]);

  // Setelah register/edit drawing → tutup form + reload list. Upload attachments sudah handled di dalam form itu sendiri (post-register mode).
  // Untuk drawing baru dengan BOM (mode create_new atau existing) → redirect ke Engineering Work Order page (unified flow)
  const handleRegistered = async (newDrawing) => {
    setShowForm(false);
    await load();
    // Auto-redirect: kalau ini drawing BARU dan sudah punya bom_id → langsung ke unified work order page
    if (newDrawing && !editItem && newDrawing.bom_id) {
      window.location.href = `/engineering/bom-entry/${newDrawing.bom_id}?just_created=1`;
    }
  };

  const del = async (it) => {
    if (!window.confirm(`Hapus drawing ${it.drawing_no} ${it.revision}?`)) return;
    try {
      await api.delete(`/drawings/${it.id}`);
      toast.success("Terhapus");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const [exporting, setExporting] = useState("");
  const doExport = async (fmt) => {
    setExporting(fmt);
    try {
      const params = { format: fmt };
      if (q.trim()) params.q = q.trim();
      if (discipline) params.discipline = discipline;
      if (status) params.status = status;
      const ext = fmt === "pdf" ? "pdf" : "xlsx";
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await downloadFile("/drawings/export", params, `MasterDrawingList_${ts}.${ext}`);
      toast.success(`Daftar drawing diekspor ke ${ext.toUpperCase()}`);
    } catch (e) {
      toast.error(e.message || "Gagal export");
    } finally { setExporting(""); }
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-sky-600 mb-1">
          <FileText size={14} weight="fill" /> Engineering
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          MKS-F-ENG-005 Drawing Master List
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          <b>Katalog view-only</b> semua drawing (DWG MKS + No. DWG Customer terkait). Cari cukup dengan <b>Nomor SO</b> untuk melihat drawing MKS beserta drawing customer-nya. Pengerjaan drawing (upload/BOM/TTD) dilakukan di <b>DRF Ditugaskan ke Saya → Work Group</b>, bukan di sini.
        </p>
      </div>

      {/* Filter row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] max-w-md">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari</Label>
          <Input data-testid="dw-search" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="drawing no · title · SO · prepared_by..." />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Discipline</Label>
          <select className={inputCls} value={discipline} onChange={(e) => setDiscipline(e.target.value)} data-testid="dw-filter-disc">
            <option value="">Semua</option>
            {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Status</Label>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="dw-filter-status">
            <option value="">Semua</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {isEngUser && (
          <>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Designer</Label>
              <select className={inputCls} value={designer} onChange={(e) => { setDesigner(e.target.value); if (e.target.value) setMine(false); }} data-testid="dw-filter-designer">
                <option value="">Semua Designer</option>
                {designers.map((d) => <option key={d.id} value={d.id}>{d.name || d.username}</option>)}
              </select>
            </div>
            <Button
              variant={mine ? "default" : "outline"}
              onClick={() => { setMine((v) => !v); setDesigner(""); }}
              className={`rounded-none h-9 ${mine ? "bg-sky-600 hover:bg-sky-700 text-white" : ""}`}
              data-testid="dw-filter-mine"
              title="Tampilkan hanya drawing yang saya rancang"
            >
              <PencilSimpleLine size={14} weight="bold" className="mr-1" /> Drawing Saya
            </Button>
          </>
        )}
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
        <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
        <div className="flex-1"></div>
        {canPrint && (
          <div className="inline-flex items-center gap-0 border border-slate-300 rounded-none overflow-hidden" data-testid="dw-export-group">
            <span className="px-2 h-9 inline-flex items-center bg-slate-100 text-[10px] uppercase tracking-widest font-bold text-slate-500">Ekspor Arsip</span>
            <button
              onClick={() => doExport("xlsx")}
              disabled={!!exporting}
              className="px-3 h-9 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 border-l border-slate-300"
              data-testid="dw-export-xlsx"
              title="Ekspor daftar (mengikuti filter) ke Excel"
            >
              <FileXls size={15} weight="fill" /> {exporting === "xlsx" ? "..." : "Excel"}
            </button>
            <button
              onClick={() => doExport("pdf")}
              disabled={!!exporting}
              className="px-3 h-9 inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 border-l border-slate-300"
              data-testid="dw-export-pdf"
              title="Ekspor daftar (mengikuti filter) ke PDF"
            >
              <FilePdf size={15} weight="fill" /> {exporting === "pdf" ? "..." : "PDF"}
            </button>
          </div>
        )}
        <div
          className="inline-flex items-center gap-2 h-9 px-3 rounded-none bg-slate-100 border border-slate-300 text-slate-600 text-xs"
          data-testid="dw-register-info"
          title="Drawing baru harus melalui alur Drawing Request Form dari Sales"
        >
          <span>📋</span>
          <span>Register drawing baru: via <b>Sales → Drawing Request Form (MKS-F-ENG-001)</b></span>
        </div>
      </div>

      {/* Sub-section: Customer Code Master — ditaruh DI ATAS list drawing biar mudah diakses */}
      <CustomerCodeMasterPanel />

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center justify-between gap-2">
          <span>MKS-F-ENG-005 Drawing Master List — {items.length} entri</span>
          <span className="normal-case tracking-normal text-[10px] text-slate-400 flex items-center gap-3">
            <span className="flex items-center gap-1"><Eye size={12} /> Preview: MKS · Customer · BOM · Nesting</span>
            {canPrint && <span className="flex items-center gap-1 text-sky-600"><Printer size={12} weight="bold" /> Print (Engineering)</span>}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Drawing</th>
                <th className="text-left p-3">Rev</th>
                <th className="text-left p-3">Title / Project</th>
                <th className="text-left p-3">Status &amp; TTD</th>
                <th className="text-left p-3">Kategori &amp; Progres</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody data-testid="dw-list">
              {loading && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && viewItems.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">{(mine || designer) ? "Tidak ada drawing untuk filter ini." : "Belum ada drawing. Alur register drawing baru: Sales buat DRF (MKS-F-ENG-001) → Eng Head Accept → Assign Engineer."}</td></tr>)}
              {pag.pagedData.map((it) => (
                <DrawingMasterRow
                  key={it.id}
                  it={it}
                  onDetail={setDetail}
                />
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="drawing" testIdPrefix="dw-pag" />
      </Card>

      {showForm && (
        <DrawingForm initial={editItem} drfPrefill={drfPrefill} onClose={() => { setShowForm(false); setDrfPrefill(null); }} onSaved={handleRegistered} />
      )}
      {uploadItem && (
        <UploadDialog item={uploadItem} onClose={() => setUploadItem(null)} onDone={() => { setUploadItem(null); load(); }} />
      )}
      {previewItem && (
        <PreviewDialog item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
      {customerRefUpload && (
        <CustomerRefUploadDialog item={customerRefUpload} onClose={() => setCustomerRefUpload(null)} onDone={() => { setCustomerRefUpload(null); load(); }} />
      )}
      {customerRefPreview && (
        <CustomerRefPreviewDialog item={customerRefPreview} onClose={() => setCustomerRefPreview(null)} />
      )}
      {detail && (
        <DrawingDetailModal
          it={detail}
          previewOnly={previewOnly}
          onView={setViewer}
          onClose={() => setDetail(null)}
          canEcn={isEngUser && (isAdminUser || isDesigner(detail))}
          onRequestEcn={(it) => { setDetail(null); setEcnItem(it); }}
        />
      )}
      {ecnItem && (
        <EcnRevisionModal
          drawing={ecnItem}
          open={!!ecnItem}
          onClose={() => setEcnItem(null)}
          onDone={() => { setEcnItem(null); load(); }}
        />
      )}
      {viewer && (
        <PdfPreviewModal
          {...(viewer.mode === "drawing"
            ? { drawingId: viewer.drawingId, target: viewer.target, stamped: viewer.stamped, hideSo: viewer.hideSo }
            : {
                metaUrl: viewer.metaUrl,
                pageUrlBuilder: (n) => `${viewer.pageBase}?page=${n}&scale=2`,
                // Lampiran BOM ber-PDF → tampilkan PDF asli (cepat) via blob iframe.
                pdfUrl: (viewer.metaUrl && viewer.metaUrl.endsWith("/page-meta")
                          && viewer.metaUrl.includes("/attachments/")
                          && /\.pdf$/i.test(viewer.subtitle || ""))
                  ? viewer.metaUrl.replace("/page-meta", "/preview") : "",
              })}
          title={viewer.title}
          subtitle={viewer.subtitle}
          downloadUrl={viewer.downloadUrl || ""}
          noDownload={viewer.noDownload}
          autoPrint={viewer.autoPrint}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

/* ============ MASTER LIST ROW (redesign MKS-F-ENG-005) ============ */
const _attCache = {}; // bom_id -> { costing:[], nesting:[], ... }  (dedupe fetch across pagination)

const TILE_TONES = {
  violet: "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100",
  sky: "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100",
  amber: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
  teal: "border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100",
};
const TILE_OFF = "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed";

function PreviewTile({ label, tone, available, loading, onClick, testid }) {
  const cls = available ? `${TILE_TONES[tone]} cursor-pointer` : TILE_OFF;
  return (
    <button
      type="button"
      disabled={!available}
      onClick={available ? onClick : undefined}
      data-testid={testid}
      title={available ? `Preview ${label} (DC-stamped)` : (loading ? "Memuat..." : `${label} belum ada`)}
      className={`flex flex-col items-center justify-center gap-0.5 w-[70px] h-[54px] border transition-colors ${cls}`}
    >
      {loading ? (
        <ArrowClockwise size={15} className="animate-spin" />
      ) : (
        <Eye size={15} weight={available ? "bold" : "regular"} />
      )}
      <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
    </button>
  );
}

const _TTD_STAGE = { submit: "Prepared", eng_head: "Eng Head", qc: "QC", sales: "Sales" };

const WORKCAT_STYLE = {
  simple: "bg-emerald-100 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-100 text-amber-800 border-amber-300",
  complex: "bg-rose-100 text-rose-800 border-rose-300",
};

function _fmtDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return null; }
}

function WorkProgressCell({ it }) {
  const cat = (it.work_category || "").toLowerCase();
  const rows = [
    { label: "Terima", val: _fmtDate(it.request_received_at), color: "text-slate-600" },
    { label: "Mulai", val: _fmtDate(it.work_started_at), color: "text-sky-700" },
    { label: "Selesai", val: _fmtDate(it.work_completed_at), color: "text-emerald-700" },
  ];
  return (
    <div className="space-y-1" data-testid={`dw-progress-${it.id}`}>
      {cat ? (
        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${WORKCAT_STYLE[cat] || "bg-slate-100 text-slate-600 border-slate-300"}`} data-testid={`dw-workcat-badge-${it.id}`}>
          {cat}
        </span>
      ) : (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-400 border border-slate-200">no kategori</span>
      )}
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-400 w-[42px] shrink-0">{r.label}</span>
            <span className={`font-medium ${r.val ? r.color : "text-slate-300"}`}>{r.val || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawingMasterRow({ it, onDetail }) {
  // Baris minimalis — detail lengkap & preview dokumen ada di popup (klik baris).
  const approvals = (it.approvals || []).filter((a) => !String(a.stage || "").startsWith("reject_"));
  const ttdByStage = {};
  approvals.forEach((a) => { if (_TTD_STAGE[a.stage] && !ttdByStage[a.stage]) ttdByStage[a.stage] = a.name; });
  const ttdEntries = Object.entries(ttdByStage);
  const dcName = it.dc_stamp?.name;
  const isControlled = it.approval_status === "controlled" || it.approval_status === "released";

  return (
    <tr
      className="border-b border-slate-100 hover:bg-sky-50/60 align-top cursor-pointer"
      data-testid={`dw-row-${it.id}`}
      onClick={() => onDetail?.(it)}
      title="Klik untuk lihat detail lengkap & preview dokumen"
    >
      {/* Drawing (ringkas) */}
      <td className="p-3">
        <div className="font-mono font-semibold text-slate-900 text-sm">{it.drawing_no}</div>
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
          <span>{it.discipline}</span>
          <span className="text-slate-300">·</span>
          <span className="font-mono" title="SO">SO {it.so_no || "-"}</span>
        </div>
      </td>

      {/* Rev — revisi drawing saat ini */}
      <td className="p-3 whitespace-nowrap" data-testid={`dw-rev-${it.id}`}>
        <span className={`inline-flex items-center justify-center min-w-[46px] px-2 py-1 text-[11px] font-bold uppercase tracking-wider border ${(it.rev_no ?? 0) > 0 ? "bg-amber-50 text-amber-800 border-amber-300" : "bg-slate-100 text-slate-600 border-slate-300"}`} title={it.revision || `Rev ${it.rev_no ?? 0}`}>
          Rev {it.rev_no ?? 0}
        </span>
        {it.revision_request?.status === "in_progress" && (
          <div className="text-[9px] text-amber-600 font-bold mt-0.5">sedang revisi</div>
        )}
      </td>

      {/* Title / Project (dipangkas) */}
      <td className="p-3 max-w-[280px]">
        <div className="text-slate-800 text-sm font-medium truncate">{it.title || "-"}</div>
        {it.project_name && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{it.project_name}</div>}
      </td>

      {/* Status & TTD (ringkas) */}
      <td className="p-3" data-testid={`dw-status-${it.id}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[it.status] || "bg-slate-100 text-slate-700"}`}>{it.status}</span>
          {dcName ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300" title={`DC stamp: ${dcName}`}><Stamp size={11} weight="fill" /> DC</span>
          ) : isControlled ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300"><Stamp size={11} weight="fill" /> Controlled</span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200"><Stamp size={11} /> Belum DC</span>
          )}
          {ttdEntries.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title={ttdEntries.map(([s, n]) => `${_TTD_STAGE[s]}: ${n}`).join(", ")}>
              <CheckCircle size={10} weight="fill" /> {ttdEntries.length} TTD
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Belum TTD</span>
          )}
        </div>
      </td>

      {/* Buka detail */}
      <td className="p-3">
        <WorkProgressCell it={it} />
      </td>

      {/* Buka detail */}
      <td className="p-3 text-right">
        <span className="inline-flex items-center gap-1 text-[11px] text-sky-600 font-semibold" data-testid={`dw-detail-open-${it.id}`}>
          <Eye size={13} /> Detail
        </span>
      </td>
    </tr>
  );
}

/* ============ DRAWING DETAIL POPUP (klik Title/Project) ============ */
function DrawingDetailModal({ it, previewOnly, onView, onClose, canEcn, onRequestEcn }) {
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const [att, setAtt] = useState(it.bom_id ? _attCache[it.bom_id] || null : { costing: [], nesting: [] });
  const [attLoading, setAttLoading] = useState(false);

  useEffect(() => {
    if (!it.bom_id) { setAtt({ costing: [], nesting: [] }); return; }
    if (_attCache[it.bom_id]) { setAtt(_attCache[it.bom_id]); return; }
    let alive = true;
    setAttLoading(true);
    api.get(`/bom/${it.bom_id}/attachments`)
      .then(({ data }) => { const a = data.attachments || { costing: [], nesting: [] }; _attCache[it.bom_id] = a; if (alive) setAtt(a); })
      .catch(() => { if (alive) setAtt({ costing: [], nesting: [] }); })
      .finally(() => { if (alive) setAttLoading(false); });
    return () => { alive = false; };
  }, [it.bom_id]);

  const firstCosting = att?.costing?.[0];
  const firstNesting = att?.nesting?.[0];
  const subtitle = `${it.title || ""}${it.project_name ? " · " + it.project_name : ""}${it.so_no ? " · SO " + it.so_no : ""}`;

  // Master Drawing List = katalog VIEW-ONLY → preview tanpa tombol download untuk SEMUA role
  // (konsisten dengan viewer image-based di modal ECN). Unduhan asli lewat Work Order.
  const openMks = () => onView({ mode: "drawing", drawingId: it.id, target: "mks", stamped: true, hideSo: true, title: it.drawing_no, subtitle, noDownload: true, downloadUrl: `${backendUrl}/api/drawings/${it.id}/pdf-stamped` });
  const openCustomer = () => onView({ mode: "drawing", drawingId: it.id, target: "customer_ref", stamped: true, hideSo: true, title: `${it.drawing_no} · Customer DWG`, subtitle, noDownload: true, downloadUrl: `${backendUrl}/api/drawings/${it.id}/customer-ref/download` });
  const openAtt = (a, label) => onView({ mode: "generic", metaUrl: `/bom/${it.bom_id}/attachments/${a.id}/page-meta`, pageBase: `${backendUrl}/api/bom/${it.bom_id}/attachments/${a.id}/page-image`, downloadUrl: `${backendUrl}/api/bom/${it.bom_id}/attachments/${a.id}/download`, title: `${it.drawing_no} · ${label}`, subtitle: a.filename || "", noDownload: true });

  const approvals = (it.approvals || []).filter((a) => !String(a.stage || "").startsWith("reject_"));
  const ttdByStage = {};
  approvals.forEach((a) => { if (_TTD_STAGE[a.stage] && !ttdByStage[a.stage]) ttdByStage[a.stage] = a; });
  const dcName = it.dc_stamp?.name;
  const isControlled = it.approval_status === "controlled" || it.approval_status === "released";

  const Row = ({ label, value, mono }) => (
    <div className="flex gap-2 py-1 border-b border-slate-100">
      <div className="w-32 shrink-0 text-[10px] uppercase tracking-wider font-bold text-slate-400 pt-0.5">{label}</div>
      <div className={`flex-1 text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value || <span className="text-slate-300">-</span>}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" data-testid="dw-detail-modal" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-none shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 text-white px-4 py-3 flex items-center justify-between z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">Detail Drawing · MKS-F-ENG-005</div>
            <h2 className="text-lg font-bold font-mono">{it.drawing_no}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10" data-testid="dw-detail-close"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Preview Dokumen (DC-Stamped)</div>
            <div className="flex flex-wrap items-center gap-2">
              <PreviewTile label="DWG MKS" tone="violet" available={!!it.file_id} onClick={openMks} testid="dw-detail-tile-mks" />
              <PreviewTile label="Customer" tone="sky" available={!!it.customer_ref_file_id} onClick={openCustomer} testid="dw-detail-tile-cust" />
              <PreviewTile label="BOM" tone="amber" available={!!firstCosting} loading={attLoading} onClick={() => openAtt(firstCosting, "BOM")} testid="dw-detail-tile-bom" />
              <PreviewTile label="Nesting" tone="teal" available={!!firstNesting} loading={attLoading} onClick={() => openAtt(firstNesting, "Nesting")} testid="dw-detail-tile-nesting" />
            </div>
          </div>

          {/* DWG CAD — File Asli (native, unduh saja) */}
          <div data-testid="dw-detail-cad">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">
              DWG CAD — File Asli ({(it.cad_files || []).length})
            </div>
            {((it.cad_files || []).length === 0) ? (
              <div className="text-xs text-slate-400 italic">Tidak ada file CAD asli.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {(it.cad_files || []).map((f) => (
                  <a
                    key={f.id}
                    href={`${backendUrl}/api/drawings/${it.id}/cad-files/${f.id}/download`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 bg-purple-50 border border-purple-200 hover:bg-purple-100 p-2 text-xs transition-colors"
                    title="Unduh file CAD asli"
                    data-testid={`dw-detail-cad-${f.id}`}
                  >
                    <FileText size={14} className="text-purple-700 flex-none" />
                    <span className="flex-1 truncate font-mono">{f.filename}</span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">{((f.size || 0) / 1024).toFixed(0)} KB</span>
                    <DownloadSimple size={13} className="text-purple-700 flex-none" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Informasi</div>
            <Row label="Judul" value={it.title} />
            <Row label="Project" value={it.project_name} />
            <Row label="No. DWG Customer" value={it.customer_drawing_no} mono />
            <Row label="Revisi" value={it.revision} />
            <Row label="Discipline" value={it.discipline} />
            <Row label="SO" value={it.so_no} mono />
            <Row label="BOM" value={it.bom_no} mono />
            <Row label="Prepared By" value={it.prepared_by} />
            <Row label="Assigned Eng" value={it.assigned_to_name} />
            <Row label="Request (Sales)" value={it.request_by_sales} />
            <Row label="Status Dokumen" value={it.status} />
            <Row label="Kategori Kerja" value={(it.work_category || "").toUpperCase() || "-"} />
            <Row label="Tgl Terima Request" value={_fmtDate(it.request_received_at) || "-"} />
            <Row label="Tgl Mulai Kerja" value={_fmtDate(it.work_started_at) || "-"} />
            <Row label="Tgl Selesai (Eng Leader)" value={_fmtDate(it.work_completed_at) || "-"} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Status &amp; TTD</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {dcName ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300"><Stamp size={12} weight="fill" /> DC Stamp: {dcName}</span>
              ) : isControlled ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300"><Stamp size={12} weight="fill" /> Controlled</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200"><Stamp size={12} /> Belum DC Stamp</span>
              )}
            </div>
            {Object.keys(ttdByStage).length > 0 ? (
              <div className="space-y-1">
                {Object.entries(ttdByStage).map(([stage, a]) => (
                  <div key={stage} className="flex items-center gap-2 text-xs">
                    <CheckCircle size={13} weight="fill" className="text-emerald-600" />
                    <span className="font-bold w-20">{_TTD_STAGE[stage]}</span>
                    <span className="text-slate-700">{a.name}</span>
                    {a.at && <span className="text-slate-400 text-[10px]">· {new Date(a.at).toLocaleString("id-ID")}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">Belum ada TTD</div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 flex justify-between items-center gap-2">
          <div className="text-xs">
            {(() => {
              const rr = it.revision_request;
              if (!rr || !rr.status) return null;
              const map = {
                pending: ["Pengajuan ECN menunggu keputusan Eng Leader", "text-amber-700"],
                approved: ["Revisi disetujui — buka Work Order untuk mulai revisi", "text-indigo-700"],
                in_progress: ["Drawing sedang direvisi", "text-teal-700"],
                rejected: ["Pengajuan ECN terakhir ditolak", "text-rose-700"],
              };
              const m = map[rr.status];
              return m ? <span className={`font-semibold ${m[1]}`} data-testid="dw-detail-ecn-status">{rr.ecn?.ecn_no ? `${rr.ecn.ecn_no} · ` : ""}{m[0]}</span> : null;
            })()}
          </div>
          <div className="flex gap-2">
            {canEcn && isControlled && it.revision_request?.status !== "pending" && it.revision_request?.status !== "approved" && it.revision_request?.status !== "in_progress" && (
              <Button
                onClick={() => onRequestEcn?.(it)}
                className="rounded-none bg-indigo-600 hover:bg-indigo-700 text-white"
                data-testid="dw-detail-ecn-btn"
              >
                <PencilSimpleLine size={15} weight="bold" className="mr-1.5" /> Ajukan ECN (Revisi)
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300" data-testid="dw-detail-close-btn">Tutup</Button>
          </div>
        </div>
      </div>
    </div>
  );
}




/* ============ FORM DIALOG ============ */
function DrawingForm({ initial, drfPrefill, onClose, onSaved }) {
  const { user } = useAuth();
  const isHead = ["eng_head", "eng_leader", "engineering", "admin", "super_admin", "supervisor"].includes(user?.role);
  const [orderType, setOrderType] = useState(drfPrefill?.source_drawing_id ? "repeat" : "new"); // new | repeat
  const [repeatDrawing, setRepeatDrawing] = useState(null); // selected existing drawing
  const [repeatQ, setRepeatQ] = useState("");
  const [repeatOpts, setRepeatOpts] = useState([]);
  const [sourceBom, setSourceBom] = useState(null); // Repeat Order — source BOM to copy items from
  const [sourceBomQ, setSourceBomQ] = useState("");
  const [sourceBomOpts, setSourceBomOpts] = useState([]);
  const [f, setF] = useState(() => initial || {
    drawing_no: "", customer_code: (drfPrefill?.customer_code || "MKS"), customer_name: (drfPrefill?.customer_name || ""),
    project_initial: "",
    drawing_type: "Assembly", title: "", revision: "Rev-0",
    discipline: "Mechanical",
    so_no: (drfPrefill?.so_no || ""),
    project_name: (drfPrefill?.project_name || ""),
    class_material: (drfPrefill?.class_material || ""),
    prepared_by: "",
    request_by_sales: (drfPrefill?.request_by_sales || ""),
    checked_by: "",
    drawing_date: "", status: "Draft", remark: "",
    bom_link_mode: "none", bom_no: "", bom_id: "",
    from_drf_id: (drfPrefill?.from_drf_id || ""),
    assigned_to_user_id: (drfPrefill?.assigned_to_user_id || ""),
    assigned_to_name: (drfPrefill?.assigned_to_name || ""),
  });
  const [engineerList, setEngineerList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [nextPreview, setNextPreview] = useState("");
  const [previewMeta, setPreviewMeta] = useState(null);
  const [nextBomNo, setNextBomNo] = useState("");
  const [lastBomNo, setLastBomNo] = useState("");
  const [bomOptions, setBomOptions] = useState([]);
  const [bomQ, setBomQ] = useState("");
  const [showCfg, setShowCfg] = useState(false);
  const [justRegistered, setJustRegistered] = useState(null); // drawing baru saja di-register — enables attachments panel
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Drawing yang aktif untuk attachments panel (edit mode ATAU baru register)
  const activeDrawing = initial?.id ? initial : justRegistered;
  const isPostRegister = !initial?.id && !!justRegistered;

  // Iter 22 — Eng Head assign drawing ke engineer LAIN → sembunyikan panel BOM & upload dokumen
  // karena orang yg di-assign yg akan mengerjakan. Kalau Eng Head assign ke dirinya sendiri
  // (atau belum di-assign), panel tetap tampil.
  const isAssignedToOther = isHead
    && f.assigned_to_user_id
    && f.assigned_to_user_id !== user?.id;

  // Live preview auto-number as user types (works for both Register and Edit)
  useEffect(() => {
    // Only skip if user has explicitly typed a manual drawing_no different from initial
    const isEditing = !!initial;
    const currentDwgNo = (f.drawing_no || "").trim();
    // In edit mode, only preview if user cleared or changed intent to regenerate
    // We still compute preview so the "Apply Auto Number" button knows what to suggest
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/drawings/next-number", {
          params: {
            customer_code: f.customer_code || "MKS",
            project_initial: f.project_initial || "",
            drawing_type: f.drawing_type || "Assembly",
          },
          signal: controller.signal,
        });
        setNextPreview(data.preview || "");
        setPreviewMeta(data);
      } catch { /* ignore */ }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, f.customer_code, f.project_initial, f.drawing_type]);

  // Iter 20 — load engineer list for Assign dropdown
  useEffect(() => {
    api.get("/drawings/engineering-users")
      .then(({ data }) => setEngineerList(data?.items || []))
      .catch(() => {});
  }, []);

  // Live preview BOM next number ketika mode = create_new
  useEffect(() => {
    if (initial) return;
    if (f.bom_link_mode !== "create_new") { setNextBomNo(""); setLastBomNo(""); return; }
    (async () => {
      try {
        const { data } = await api.get("/bom/next-number");
        setNextBomNo(data.preview || "");
        setLastBomNo(data.last_bom_no_this_month || data.last_bom_no || "");
      } catch {}
    })();
  }, [initial, f.bom_link_mode]);

  // BOM search for existing mode
  useEffect(() => {
    if (f.bom_link_mode !== "existing") return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/bom/lookup", { params: { q: bomQ.trim() || undefined } });
        setBomOptions(data.items || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [f.bom_link_mode, bomQ]);

  // Search drawings for Repeat Order mode
  useEffect(() => {
    if (initial) return;
    if (orderType !== "repeat") return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/drawings", { params: { q: repeatQ.trim() || undefined, limit: 30 } });
        setRepeatOpts(data.items || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [initial, orderType, repeatQ]);

  // Search BOMs for Repeat Order source-copy mode
  useEffect(() => {
    if (initial) return;
    if (orderType !== "repeat") return;
    // Pre-fill query with selected repeat drawing's context to surface relevant BOMs first
    const q = (sourceBomQ.trim() || repeatDrawing?.drawing_no || repeatDrawing?.bom_no || "").trim();
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/bom/lookup", { params: { q: q || undefined, limit: 30 } });
        setSourceBomOpts(data.items || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [initial, orderType, sourceBomQ, repeatDrawing]);

  // Auto-detect BOM existing untuk SO yang sama (1 SO bs multiple drawing → same BOM)
  const [soExistingBom, setSoExistingBom] = useState(null);
  useEffect(() => {
    if (initial) return;
    if (orderType !== "new") { setSoExistingBom(null); return; }
    const so = (f.so_no || "").trim();
    if (!so) { setSoExistingBom(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/bom/lookup", { params: { q: so, limit: 5 } });
        // Match exact SO
        const match = (data.items || []).find((b) => String(b.so_no || "").trim() === so);
        if (match) {
          setSoExistingBom(match);
          // Auto-suggest link-existing mode kalau user belum pilih
          if (f.bom_link_mode === "none" || f.bom_link_mode === "create_new") {
            set("bom_link_mode", "existing");
            set("bom_id", match.id);
            set("bom_no", match.bom_no || "");
          }
        } else {
          setSoExistingBom(null);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, orderType, f.so_no]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let saved;
      if (initial?.id) {
        await api.put(`/drawings/${initial.id}`, f);
        // Iter 20 — sync assign kalau berubah (hanya Eng Head yg boleh, backend akan reject kalau bukan)
        if (isHead && (f.assigned_to_user_id || "") !== (initial.assigned_to_user_id || "")) {
          try {
            await api.post(`/drawings/${initial.id}/assign`, {
              assigned_to_user_id: f.assigned_to_user_id || "",
              assigned_to_name: f.assigned_to_name || "",
            });
          } catch (aerr) {
            toast.warning("Drawing tersimpan, tapi gagal update assign: " + (aerr.response?.data?.detail || ""));
          }
        }
        saved = { ...initial, ...f };
      } else if (orderType === "repeat") {
        // REPEAT ORDER — create new BOM only, drawing_no stays same
        if (!repeatDrawing) { toast.error("Pilih drawing yang akan di-repeat dulu"); setSaving(false); return; }
        const resp = await api.post("/bom/register", {
          bom_no: f.bom_no || "",
          so_no: f.so_no || "",
          project_name: repeatDrawing.project_name || repeatDrawing.title || "",
          project_dwg: repeatDrawing.drawing_no,
          customer: repeatDrawing.customer_code || "MKS",
          delivery_date: f.drawing_date || "",
          prepared_by: f.prepared_by || "",
          remark: f.remark || "",
          drawing_id: repeatDrawing.id,
          is_repeat: true,
          source_bom_id: sourceBom?.id || "",
        });
        const copied = resp.data?.copied_items_count ?? 0;
        toast.success(
          sourceBom
            ? `Repeat Order tercatat — BOM ${resp.data.bom_no} (dari drawing ${repeatDrawing.drawing_no}) · ${copied} item di-copy dari ${sourceBom.bom_no}`
            : `Repeat Order tercatat — BOM ${resp.data.bom_no} (drawing ${repeatDrawing.drawing_no})`
        );
        saved = { ...repeatDrawing, bom_no: resp.data.bom_no, is_repeat_bom: true };
      } else {
        if (!f.drawing_no && !f.project_initial) {
          toast.error("Isi Project Initial dulu (mis. SP untuk Support Plate) atau ketik Drawing No manual");
          setSaving(false);
          return;
        }
        if (!f.so_no || !f.so_no.trim()) {
          toast.error("SO No wajib diisi — pilih dari Master List SO");
          setSaving(false);
          return;
        }
        const resp = await api.post("/drawings", f);
        saved = resp.data;
        // Iter 20 — Apply assign kalau Eng Head set assigned_to di form
        if (isHead && f.assigned_to_user_id) {
          try {
            await api.post(`/drawings/${saved.id}/assign`, {
              assigned_to_user_id: f.assigned_to_user_id,
              assigned_to_name: f.assigned_to_name || "",
            });
          } catch (aerr) {
            toast.warning("Drawing dibuat, tapi gagal assign: " + (aerr.response?.data?.detail || ""));
          }
        }
        // Iter 22 — Kalau Eng Head assign ke ORANG LAIN, redirect ke Work Order page
        // supaya panel BOM + Upload dokumen dihandle oleh assignee (Trisna) di halaman kerjanya.
        // Kalau assign ke diri sendiri (atau belum di-assign) → tetap flow lama (upload di modal).
        if (isHead && f.assigned_to_user_id && f.assigned_to_user_id !== user?.id) {
          toast.success(`Drawing ${saved.drawing_no} di-register & di-assign ke ${f.assigned_to_name}. Dialihkan ke Work Order...`);
          setSaving(false);
          // Beri jeda sedikit supaya toast terlihat, lalu redirect
          setTimeout(() => {
            window.location.href = `/engineering/work-order/${saved.id}`;
          }, 900);
          return;
        }
        toast.success(`Drawing ${saved.drawing_no} di-register — silakan upload file di panel bawah`);
        // Jangan close — biarkan user langsung upload attachments di panel
        setJustRegistered(saved);
        setSaving(false);
        return; // do not call onSaved yet — user harus klik Selesai
      }
      onSaved(saved);
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const finishAndClose = () => {
    onSaved(justRegistered || initial);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Drawing" : "Register Drawing Baru + Order Baru"}</DialogTitle>
          <DialogDescription>
            Format nomor: <span className="font-mono text-slate-700">DWG.YY.MM.NN_CUSTOMER.INITIAL.TYPE.SEQ</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {/* Iter 19 — Banner kalau dari DRF */}
          {drfPrefill?.from_drf_id && !initial && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3">
              <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-700">📋 Drawing Request Form</div>
              <div className="text-sm text-slate-800 mt-1">
                Form ini dibuat dari <b>Drawing Request Form dari Sales</b> ({drfPrefill.request_by_sales || "Sales"}).
                Data SO, Customer, Project, dan Material sudah pre-filled. Lengkapi Project Initial, Title, dan upload PDF drawing.
              </div>
            </div>
          )}
          {/* Order Type toggle */}
          {!initial && (
            <div className="border-2 border-violet-400 bg-violet-50/50 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-violet-800">Jenis Order</div>
              <div className="flex gap-6 text-sm">
                <label className="flex items-center gap-1 cursor-pointer" data-testid="dw-order-new">
                  <input type="radio" name="order_type" checked={orderType === "new"} onChange={() => { setOrderType("new"); setRepeatDrawing(null); }} />
                  <span>🆕 <b>New Order</b> — register drawing baru</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer" data-testid="dw-order-repeat">
                  <input type="radio" name="order_type" checked={orderType === "repeat"} onChange={() => { setOrderType("repeat"); set("bom_link_mode", "create_new"); }} />
                  <span>🔁 <b>Repeat Order</b> — pakai drawing existing, BOM baru</span>
                </label>
              </div>
              {orderType === "repeat" && (
                <div className="text-[11px] text-slate-600">
                  Drawing no <b>tidak dibuat baru</b> — hanya BOM baru dibuat dan di-link ke drawing existing.
                </div>
              )}
            </div>
          )}

          {/* REPEAT ORDER — pick existing drawing */}
          {!initial && orderType === "repeat" && (
            <div className="border-2 border-violet-500 bg-white p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-violet-700">Pilih Drawing yang Direpeat *</div>
              <Input className={inputCls} value={repeatQ} onChange={(e) => setRepeatQ(e.target.value)} placeholder="Cari drawing no · title · project..." data-testid="dw-repeat-search" />
              <div className="max-h-40 overflow-y-auto border border-slate-200 divide-y">
                {repeatOpts.length === 0 && <div className="p-2 text-xs text-slate-400 italic">Ketik untuk cari drawing existing...</div>}
                {repeatOpts.map((d) => (
                  <button
                    key={d.id} type="button"
                    onClick={() => setRepeatDrawing(d)}
                    className={`w-full text-left p-2 text-xs hover:bg-violet-50 ${repeatDrawing?.id === d.id ? "bg-violet-100 ring-2 ring-violet-500" : ""}`}
                    data-testid={`dw-repeat-opt-${d.id}`}
                  >
                    <div className="font-mono font-bold">{d.drawing_no}</div>
                    <div className="text-slate-500">{d.title || "-"} · {d.project_name || "-"} · Rev {d.revision}</div>
                  </button>
                ))}
              </div>
              {repeatDrawing && (
                <div className="text-[11px] p-2 bg-emerald-50 border border-emerald-300">
                  ✓ Repeat dari: <b className="font-mono">{repeatDrawing.drawing_no}</b> · {repeatDrawing.title}
                </div>
              )}
            </div>
          )}

          {/* REPEAT ORDER — pick source BOM to copy items from (optional) */}
          {!initial && orderType === "repeat" && repeatDrawing && (
            <div className="border-2 border-amber-500 bg-amber-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-amber-800">
                  Copy Items dari BOM Existing (opsional) — <span className="text-amber-700">nomor BOM tetap baru, cuma isi/items yang di-copy</span>
                </div>
                {sourceBom && (
                  <button type="button" onClick={() => { setSourceBom(null); setSourceBomQ(""); }} className="text-[10px] text-rose-700 underline">Batal</button>
                )}
              </div>
              {!sourceBom && (
                <>
                  <Input
                    className={inputCls}
                    value={sourceBomQ}
                    onChange={(e) => setSourceBomQ(e.target.value)}
                    placeholder="Cari BOM: nomor · SO · project · drawing... (kosong = BOM dari drawing yg dipilih)"
                    data-testid="dw-source-bom-search"
                  />
                  <div className="max-h-40 overflow-y-auto border border-slate-200 divide-y bg-white">
                    {sourceBomOpts.length === 0 && (
                      <div className="p-2 text-xs text-slate-400 italic">Ketik untuk cari BOM existing… atau kosongkan untuk skip copy items.</div>
                    )}
                    {sourceBomOpts.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSourceBom(b)}
                        className={`w-full text-left p-2 text-xs hover:bg-amber-50 ${sourceBom?.id === b.id ? "bg-amber-100 ring-2 ring-amber-500" : ""}`}
                        data-testid={`dw-source-bom-opt-${b.id}`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-mono font-bold text-amber-900">{b.bom_no}</div>
                          <div className="text-[10px] text-slate-500 tabular-nums">{b.items_count ?? b.items_length ?? "-"} items</div>
                        </div>
                        <div className="text-slate-500 mt-0.5">SO {b.so_no || "-"} · {b.project_name || "-"} · Dwg {b.project_dwg || "-"}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {sourceBom && (
                <div className="text-[11px] p-2 bg-white border border-amber-400">
                  ✓ Items akan di-copy dari BOM: <b className="font-mono text-amber-900">{sourceBom.bom_no}</b>
                  <span className="text-slate-600"> · {sourceBom.items_count ?? sourceBom.items_length ?? "?"} items · SO {sourceBom.so_no || "-"}</span>
                </div>
              )}
              <div className="text-[10px] text-amber-700 italic">
                ℹ Nomor BOM baru tetap auto-generate dari sequence bulan ini. Yang di-copy hanya isi/items material (nama, spec, qty, dll).
              </div>
            </div>
          )}

          {/* Preview banner — visible di Register (new) DAN Edit mode */}
          {(!initial || initial) && orderType === "new" && (
            <div className={`border-2 p-3 space-y-1 ${initial ? "border-amber-500 bg-amber-50" : "border-sky-500 bg-sky-50"}`}>
              <div className="flex items-center justify-between">
                <div className={`text-[10px] uppercase tracking-wider font-bold ${initial ? "text-amber-800" : "text-sky-700"}`}>
                  {initial ? "Nomor Otomatis (Suggestion) — kalau field diubah, klik Terapkan untuk regenerate" : "Nomor Drawing Otomatis"}
                </div>
                <button type="button" onClick={() => setShowCfg(true)} className={`text-[10px] underline ${initial ? "text-amber-800 hover:text-amber-900" : "text-sky-700 hover:text-sky-900"}`}>
                  Ganti Format
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`font-mono text-lg font-bold tabular-nums ${initial ? "text-amber-900" : "text-sky-900"}`}>
                  {nextPreview || <span className="text-slate-400 text-sm italic">Isi Customer + Project Initial + Type di bawah...</span>}
                </div>
                {initial && nextPreview && nextPreview !== (f.drawing_no || "").trim() && (
                  <button
                    type="button"
                    onClick={() => set("drawing_no", nextPreview)}
                    className="ml-auto px-2 h-7 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold whitespace-nowrap"
                    data-testid="dw-apply-auto-no"
                    title="Terapkan nomor otomatis (menimpa Drawing No sekarang)"
                  >
                    ↻ Terapkan Nomor
                  </button>
                )}
              </div>
              {previewMeta && previewMeta.is_new_project === true && (
                <div className="text-[11px] text-emerald-700">✨ Project baru untuk bulan ini — monthly running #{String(previewMeta.monthly_running).padStart(2, "0")}</div>
              )}
              {previewMeta && previewMeta.is_new_project === false && (
                <div className="text-[11px] text-slate-600">↩ Project ini sudah punya {previewMeta.existing_project_drawings} drawing tipe {f.drawing_type} — nomor lanjut</div>
              )}
              {initial && (
                <div className="text-[11px] text-amber-700 mt-1">
                  Drawing No sekarang: <b className="font-mono">{f.drawing_no || "-"}</b>
                </div>
              )}
            </div>
          )}

          {(orderType === "new" || initial) && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Customer Name" full>
              <CustomerAutoComplete
                value={f.customer_name || ""}
                onChangeName={(name, cust) => {
                  set("customer_name", name);
                  // Auto-fill customer_code kalau customer punya code
                  if (cust && cust.customer_code) {
                    set("customer_code", (cust.customer_code || "").toUpperCase());
                  }
                }}
              />
              <div className="text-[10px] text-slate-500 mt-0.5 italic">Pilih dari daftar (Sales Master Customer). Kode akan auto-fill kalau customer sudah punya code.</div>
            </Field>
            <Field label="Customer Code *">
              <Input
                className={`${inputCls} font-mono uppercase`}
                value={f.customer_code}
                onChange={(e) => set("customer_code", e.target.value.toUpperCase())}
                placeholder="MKS / SPM / YOK"
                data-testid="dw-f-customer"
              />
              <div className="text-[10px] text-slate-500 mt-0.5 italic">1-10 karakter. Kalau ketik manual, sistem auto-simpan ke database Customer.</div>
            </Field>
            <Field label="Project Initial *">
              <Input className={`${inputCls} font-mono uppercase`} value={f.project_initial} onChange={(e) => set("project_initial", e.target.value.toUpperCase())} placeholder="mis. SP" data-testid="dw-f-initial" />
            </Field>
            <Field label="Drawing Type *">
              <select className={inputCls} value={f.drawing_type} onChange={(e) => set("drawing_type", e.target.value)} data-testid="dw-f-type">
                <option value="Assembly">Assembly (A.00)</option>
                <option value="Part">Part (P.01+)</option>
              </select>
            </Field>
            <Field label="Project Name" full>
              <Input className={inputCls} value={f.project_name} onChange={(e) => set("project_name", e.target.value)} placeholder="mis. SUPPORT PLATE" data-testid="dw-f-project" />
            </Field>
            <Field label="Class of Material" full>
              <Input
                list="dw-class-material-opts"
                className={inputCls}
                value={f.class_material || ""}
                onChange={(e) => set("class_material", e.target.value)}
                placeholder="mis. RAW MATERIAL FOR QTY 1 PCS"
                data-testid="dw-f-classmat"
              />
              <datalist id="dw-class-material-opts">
                <option value="RAW MATERIAL FOR QTY 1 PCS" />
                <option value="RAW MATERIAL FOR QTY 1 LOT" />
                <option value="RAW MATERIAL FOR QTY 1 + 1 + 8 PCS" />
                <option value="RAW MATERIAL FOR QTY 2 PCS" />
                <option value="RAW MATERIAL FOR QTY 5 PCS" />
                <option value="RAW MATERIAL FOR QTY 10 PCS" />
              </datalist>
              <div className="text-[10px] text-slate-500 mt-0.5 italic">Deskripsi ringkas paket order — misal 1 PCS, 1 LOT, atau kombinasi (1 + 1 + 8 PCS)</div>
            </Field>
            <Field label={initial ? "Drawing No *" : "Drawing No (override manual — opsional)"} full>
              <Input className={`${inputCls} font-mono`} value={f.drawing_no} onChange={(e) => set("drawing_no", e.target.value)} placeholder={nextPreview || "auto — biarkan kosong"} data-testid="dw-f-no" />
            </Field>

            <Field label="Revision">
              <Input className={inputCls} value={f.revision} onChange={(e) => set("revision", e.target.value)} placeholder="Rev-0 / A / B" data-testid="dw-f-rev" />
            </Field>
            <Field label="Discipline">
              <select className={inputCls} value={f.discipline} onChange={(e) => set("discipline", e.target.value)} data-testid="dw-f-disc">
                {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Status (auto: Draft → Issued saat Drawing PDF di-upload)">
              <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)} data-testid="dw-f-status">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              {!initial && (
                <div className="text-[10px] text-slate-500 mt-0.5 italic">Biarkan Draft — sistem otomatis ganti ke Issued setelah upload Drawing PDF.</div>
              )}
            </Field>
            <Field label="SO No *">
              <SOAutocompleteInput value={f.so_no} onChange={(v) => set("so_no", v)} testid="dw-f-so" required />
            </Field>
            <Field label="Request By (Sales)">
              <input
                list="sales-names-list"
                className={inputCls}
                value={f.request_by_sales || ""}
                onChange={(e) => set("request_by_sales", e.target.value)}
                placeholder="Ketik atau pilih nama Sales..."
                data-testid="dw-f-request-by"
              />
              <datalist id="sales-names-list">
                {SALES_NAMES.map((n) => <option key={n} value={n} />)}
              </datalist>
            </Field>
            <Field label={isHead ? "Assign Engineer *" : "Ditugaskan Ke"} full>
              {isHead ? (
                <select
                  className={inputCls}
                  value={f.assigned_to_user_id || ""}
                  onChange={(e) => {
                    const uid = e.target.value;
                    const u = engineerList.find((x) => x.id === uid);
                    setF((s) => ({
                      ...s,
                      assigned_to_user_id: uid,
                      assigned_to_name: u ? (u.name || u.username) : "",
                      // Iter 21 — auto-fill prepared_by dari assigned engineer
                      prepared_by: u ? (u.name || u.username) : s.prepared_by,
                    }));
                  }}
                  data-testid="dw-f-assigned-to"
                >
                  <option value="">— Belum di-assign (semua Eng bisa edit) —</option>
                  {engineerList.map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.username} · {u.role}</option>
                  ))}
                </select>
              ) : (
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  {f.assigned_to_name || <span className="italic text-slate-400">Belum di-assign — semua Engineering bisa edit</span>}
                </div>
              )}
              {isHead && (
                <div className="text-[10px] text-slate-500 mt-0.5">
                  💡 Hanya user yang ditunjuk yang bisa edit/upload PDF & buat BOM. Engineer lain view-only. Anda (Eng Head) selalu bisa edit.
                </div>
              )}
            </Field>
            <Field label="Remark" full>
              <Input className={inputCls} value={f.remark} onChange={(e) => set("remark", e.target.value)} placeholder="Catatan opsional" data-testid="dw-f-remark" />
            </Field>
          </div>
          )}

          {/* Repeat Order — compact form (SO + BOM + Remark) */}
          {orderType === "repeat" && !initial && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="SO No (opsional)">
                <Input className={inputCls} value={f.so_no} onChange={(e) => set("so_no", e.target.value)} placeholder="mis. 5230" />
              </Field>
              <Field label="Delivery / Target Date">
                <Input type="date" className={inputCls} value={f.drawing_date} onChange={(e) => set("drawing_date", e.target.value)} />
              </Field>
              <Field label="Prepared By">
                <Input className={inputCls} value={f.prepared_by} onChange={(e) => set("prepared_by", e.target.value)} placeholder="Nama drafter" />
              </Field>
              <Field label="Remark" full>
                <Input className={inputCls} value={f.remark} onChange={(e) => set("remark", e.target.value)} placeholder="mis. Repeat Order dari SO 5100 · qty tambahan" />
              </Field>
            </div>
          )}

          {/* BOM Linking Section (hanya saat create baru + assign ke diri sendiri / belum di-assign) */}
          {!initial && !isAssignedToOther && (
            <div className="border-2 border-amber-400 bg-amber-50/50 p-3 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-amber-800">Link ke BOM (opsional)</div>

              {/* Auto-detect existing BOM banner (untuk 1 SO = multiple drawing case) */}
              {soExistingBom && orderType === "new" && (
                <div className="border-2 border-sky-500 bg-sky-50 p-2 text-xs" data-testid="dw-so-existing-bom">
                  <div className="font-bold text-sky-800">🔗 SO <span className="font-mono">{soExistingBom.so_no}</span> sudah punya BOM: <span className="font-mono">{soExistingBom.bom_no}</span></div>
                  <div className="text-sky-700 mt-0.5">
                    Drawing baru ini akan otomatis <b>di-link ke BOM yang sama</b> (biasa untuk 1 SO dengan 2-3 drawing).
                    Ubah mode &ldquo;Buat BOM Baru&rdquo; hanya kalau memang ingin BOM terpisah.
                  </div>
                </div>
              )}

              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1 cursor-pointer" data-testid="dw-bom-none">
                  <input type="radio" name="bom_mode" checked={f.bom_link_mode === "none"} onChange={() => set("bom_link_mode", "none")} />
                  <span>Tanpa BOM</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer" data-testid="dw-bom-new">
                  <input type="radio" name="bom_mode" checked={f.bom_link_mode === "create_new"} onChange={() => set("bom_link_mode", "create_new")} />
                  <span>Buat BOM Baru</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer" data-testid="dw-bom-existing">
                  <input type="radio" name="bom_mode" checked={f.bom_link_mode === "existing"} onChange={() => set("bom_link_mode", "existing")} />
                  <span>Link ke BOM Existing {soExistingBom ? "(otomatis dipilih)" : ""}</span>
                </label>
              </div>

              {f.bom_link_mode === "create_new" && (
                <div className="border border-amber-300 bg-white p-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 border border-slate-200 p-2">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Nomor Terakhir Dibuat</div>
                      <div className="font-mono font-bold text-slate-700">{lastBomNo || <span className="text-slate-400 italic">belum ada</span>}</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-300 p-2">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Saran Berikutnya (Auto)</div>
                      <div className="font-mono font-bold text-amber-800">{nextBomNo || "..."}</div>
                    </div>
                  </div>
                  <Input
                    className={`${inputCls} font-mono`}
                    placeholder={nextBomNo ? `Kosongkan → pakai ${nextBomNo}` : "Auto..."}
                    value={f.bom_no}
                    onChange={(e) => set("bom_no", e.target.value)}
                    data-testid="dw-f-bom-no"
                  />
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">BOM baru dibuat kosong — tambah items nanti via BOM page.</div>
                    {nextBomNo && !f.bom_no && (
                      <button type="button" onClick={() => set("bom_no", nextBomNo)}
                        className="text-[11px] text-amber-700 underline hover:text-amber-900">
                        Isi otomatis {nextBomNo}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {f.bom_link_mode === "existing" && (
                <div className="border border-amber-300 bg-white p-2 space-y-2">
                  <Input className={inputCls} placeholder="Cari bom_no / SO / project..." value={bomQ} onChange={(e) => setBomQ(e.target.value)} data-testid="dw-f-bom-search" />
                  <div className="max-h-40 overflow-y-auto border border-slate-200 divide-y">
                    {bomOptions.length === 0 && <div className="p-2 text-xs text-slate-400 italic">Ketik untuk mencari BOM existing...</div>}
                    {bomOptions.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => set("bom_id", b.id)}
                        className={`w-full text-left p-2 text-xs hover:bg-amber-50 ${f.bom_id === b.id ? "bg-amber-100" : ""}`}
                        data-testid={`dw-bom-opt-${b.id}`}
                      >
                        <div className="font-mono font-bold">{b.bom_no}</div>
                        <div className="text-slate-500">SO: {b.so_no || "-"} · {b.project_name || "-"} · {b.customer || "-"}</div>
                      </button>
                    ))}
                  </div>
                  {f.bom_id && (
                    <div className="text-[11px] text-emerald-700">✓ BOM terpilih</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attachments Panel — visible saat drawing sudah ada (edit mode ATAU baru register).
              Kecuali Eng Head sedang REGISTER BARU + assign ke orang lain → biar Trisna upload sendiri
              di menu 'My Assignments'. Saat EDIT mode, panel tetap tampil supaya Head bisa monitor. */}
          {activeDrawing?.id && !(isPostRegister && isAssignedToOther) && (
            <>
              {isPostRegister && (
                <div className="border-2 border-emerald-500 bg-emerald-50 p-3">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-800 mb-1">✓ Drawing Berhasil Diregister</div>
                  <div className="text-xs text-slate-700">
                    <b className="font-mono">{activeDrawing.drawing_no}</b> — sekarang silakan upload file di panel bawah. Klik <b>Selesai</b> saat sudah selesai upload.
                  </div>
                </div>
              )}
              <DrawingAttachmentsPanel
                drawing={activeDrawing}
                onDrawingUpdated={(updated) => {
                  if (isPostRegister) setJustRegistered((prev) => ({ ...prev, ...updated }));
                }}
              />
            </>
          )}

          {/* Info banner — Eng Head assign ke orang lain saat CREATE, sembunyikan panel BOM+Upload */}
          {!initial && isAssignedToOther && (
            <div className="border-2 border-sky-500 bg-sky-50 p-3" data-testid="dw-assigned-info">
              <div className="text-[11px] uppercase tracking-wider font-bold text-sky-800 mb-1">📤 Drawing Di-assign ke Engineer Lain</div>
              <div className="text-xs text-slate-700">
                Drawing ini akan dikerjakan oleh <b>{f.assigned_to_name || "Engineer terpilih"}</b>.
                Bagian <b>Link ke BOM</b> dan <b>upload dokumen</b> akan muncul di sisi Engineer tersebut
                (di menu <i>My Assignments</i>). Anda cukup register drawing di sini, sisanya biarkan
                Engineer yg mengerjakan.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {isPostRegister ? (
              <Button type="button" onClick={finishAndClose} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white" data-testid="dw-f-finish">
                ✓ Selesai
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
                <Button type="submit" disabled={saving} className="rounded-none bg-sky-700 hover:bg-sky-800 text-white" data-testid="dw-f-save">
                  {saving ? "Menyimpan..." : (initial ? "Update" : "Register")}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>

        {showCfg && <ConfigDialog onClose={() => setShowCfg(false)} onSaved={() => setShowCfg(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({ onClose, onSaved }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { (async () => {
    try { const { data } = await api.get("/drawings/config"); setCfg(data); } catch { toast.error("Gagal load config"); }
  })(); }, []);
  if (!cfg) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/drawings/config", {
        default_customer_code: cfg.default_customer_code,
        assembly_start_seq: Number(cfg.assembly_start_seq),
        part_start_seq: Number(cfg.part_start_seq),
      });
      toast.success("Config tersimpan");
      onSaved();
    } catch (e) { toast.error("Gagal simpan"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-md">
        <DialogHeader>
          <DialogTitle>Config Format Nomor Drawing</DialogTitle>
          <DialogDescription>
            Format tetap: <span className="font-mono">DWG.YY.MM.NN_CUSTOMER.INITIAL.TYPE.SEQ</span><br />
            Contoh: <span className="font-mono font-bold">{cfg.format_example}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Default Customer Code">
            <Input className={`${inputCls} font-mono uppercase`} value={cfg.default_customer_code || "MKS"} onChange={(e) => setCfg({ ...cfg, default_customer_code: e.target.value.toUpperCase() })} placeholder="MKS" />
          </Field>
          <Field label="Assembly Start Seq (default 0 → A.00)">
            <Input type="number" min="0" max="99" className={inputCls} value={cfg.assembly_start_seq ?? 0} onChange={(e) => setCfg({ ...cfg, assembly_start_seq: parseInt(e.target.value) || 0 })} />
          </Field>
          <Field label="Part Start Seq (default 1 → P.01)">
            <Input type="number" min="0" max="99" className={inputCls} value={cfg.part_start_seq ?? 1} onChange={(e) => setCfg({ ...cfg, part_start_seq: parseInt(e.target.value) || 1 })} />
          </Field>
          <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-2">
            Monthly running (NN) auto-increment per bulan per project. YY/MM otomatis dari tanggal sistem.
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button onClick={save} disabled={saving} className="rounded-none bg-sky-700 hover:bg-sky-800 text-white">
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`block ${full ? "col-span-full" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* ============ SO AUTOCOMPLETE INPUT (integrasi Master List SO) ============ */

function SOAutocompleteInput({ value, onChange, testid, required }) {
  const [q, setQ] = React.useState(value || "");
  const [open, setOpen] = React.useState(false);
  const [opts, setOpts] = React.useState([]);
  const [hi, setHi] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => { setQ(value || ""); }, [value]);

  // Load on open + debounced search
  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/sales-orders/autocomplete", { params: { q: q.trim() || undefined, limit: 20 } });
        setOpts(data.items || []);
        setHi(0);
      } catch { setOpts([]); }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [open, q]);

  React.useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (so) => { onChange(so.so_no); setQ(so.so_no); setOpen(false); };
  const onKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((v) => Math.min(v + 1, opts.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((v) => Math.max(v - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (opts[hi]) pick(opts[hi]);
      else if (q.trim()) { onChange(q.trim()); setOpen(false); }
    } else if (e.key === "Escape") { setOpen(false); }
  };

  const exactMatch = opts.find((o) => o.so_no === q.trim());

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={`${inputCls} ${required && !q.trim() ? "border-rose-400" : ""}`}
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Ketik / pilih dari Master List SO — mis. 5221"
        data-testid={testid || "so-autocomplete"}
        autoComplete="off"
      />
      {q.trim() && exactMatch && (
        <div className="text-[10px] text-emerald-700 mt-0.5 truncate">✓ {exactMatch.customer || ""}{exactMatch.description ? ` · ${exactMatch.description}` : ""}</div>
      )}
      {q.trim() && !exactMatch && !loading && opts.length > 0 && (
        <div className="text-[10px] text-amber-700 mt-0.5">⚠ Tidak ada di Master SO — pilih dari list atau register SO dulu</div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 max-h-64 overflow-y-auto bg-white border border-slate-300 shadow-lg">
          {loading && <div className="p-2 text-xs text-slate-400 italic">Memuat…</div>}
          {!loading && opts.length === 0 && <div className="p-2 text-xs text-slate-400 italic">Tidak ada SO cocok. Register di menu Master SO dulu.</div>}
          {opts.map((o, idx) => (
            <div
              key={o.so_no}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHi(idx)}
              className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between gap-2 ${idx === hi ? "bg-sky-100" : "hover:bg-slate-50"}`}
              data-testid={`so-opt-${o.so_no}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono font-bold text-slate-900">{o.so_no}</div>
                <div className="text-slate-500 truncate">{o.customer || "-"}{o.description ? ` · ${o.description}` : ""}</div>
              </div>
              {o.so_date && <div className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">{o.so_date}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ ATTACHMENTS PANEL (inline in DrawingForm) ============ */

export function DrawingAttachmentsPanel({ drawing, onDrawingUpdated, editable = true }) {
  const [bomAttachments, setBomAttachments] = useState({ drawing: [], nesting: [], costing: [] });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewFile, setPreviewFile] = useState(null); // { url, name, contentType }
  const [uploading, setUploading] = useState(null); // category key while uploading

  // Local drawing state (untuk update file_id/customer_ref_file_id in-place tanpa reload)
  const [localDrawing, setLocalDrawing] = useState(drawing);
  useEffect(() => { setLocalDrawing(drawing); }, [drawing]);
  const activeDwg = localDrawing;

  // Editor manual Nomor DWG (koreksi bila auto-detect salah / tidak terbaca)
  const [editingNo, setEditingNo] = useState(false);
  const [noInput, setNoInput] = useState("");
  const [savingNo, setSavingNo] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [ocrSuggestion, setOcrSuggestion] = useState("");
  const [mismatchInfo, setMismatchInfo] = useState(null); // popup nomor DWG salah (New Order strict)
  // Popup konfirmasi/manual "No. Drawing Customer" setelah upload Customer Ref PDF
  const [custNoPopup, setCustNoPopup] = useState(null); // { value, candidates, detected, source }
  const [custNoSaving, setCustNoSaving] = useState(false);
  // Kategori Pekerjaan (SIMPLE/MODERATE/COMPLEX) — wajib sebelum submit ke Eng Leader
  const [workCatPopup, setWorkCatPopup] = useState(false);
  const [savingCat, setSavingCat] = useState(false);
  const saveWorkCategory = async (cat) => {
    setSavingCat(true);
    try {
      await api.post(`/drawings/${activeDwg.id}/work-category`, { work_category: cat });
      setLocalDrawing((d) => ({ ...d, work_category: cat }));
      onDrawingUpdated?.({ work_category: cat });
      toast.success(`Kategori pekerjaan: ${cat.toUpperCase()}`);
      setWorkCatPopup(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan kategori");
    } finally {
      setSavingCat(false);
    }
  };
  const saveCustNo = async () => {
    const val = (custNoPopup?.value || "").trim();
    setCustNoSaving(true);
    try {
      await api.patch(`/drawings/${activeDwg.id}/basic-info`, { customer_drawing_no: val });
      setLocalDrawing((d) => ({ ...d, customer_drawing_no: val }));
      onDrawingUpdated?.({ customer_drawing_no: val });
      toast.success(val ? `No. Drawing Customer disimpan → ${val}` : "No. Drawing Customer dikosongkan");
      setCustNoPopup(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan No. Drawing Customer");
    } finally {
      setCustNoSaving(false);
    }
  };

  const applyOcrSuggestion = async () => {
    const val = (ocrSuggestion || "").trim();
    if (!val) return;
    setSavingNo(true);
    try {
      const { data: rn } = await api.post(`/drawings/${activeDwg.id}/rename`, { new_drawing_no: val });
      setLocalDrawing((d) => ({ ...d, drawing_no: rn.drawing_no, rename_history: rn.rename_history || d.rename_history }));
      onDrawingUpdated?.({ drawing_no: rn.drawing_no });
      setOcrSuggestion("");
      toast.success(`✓ Nomor DWG (OCR) dipakai → ${rn.drawing_no}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memakai nomor OCR");
    } finally { setSavingNo(false); }
  };
  const saveDwgNo = async () => {
    const val = (noInput || "").trim();
    if (!val) return toast.error("Nomor DWG tidak boleh kosong");
    setSavingNo(true);
    try {
      const { data: rn } = await api.post(`/drawings/${activeDwg.id}/rename`, { new_drawing_no: val });
      setLocalDrawing((d) => ({ ...d, drawing_no: rn.drawing_no, rename_history: rn.rename_history || d.rename_history }));
      onDrawingUpdated?.({ drawing_no: rn.drawing_no });
      setEditingNo(false);
      setOcrSuggestion("");
      toast.success(`✓ Nomor DWG disimpan → ${rn.drawing_no}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan nomor DWG");
    } finally { setSavingNo(false); }
  };

  // Load BOM attachments if drawing has bom_id
  useEffect(() => {
    if (!activeDwg.bom_id) return;
    let alive = true;
    setLoading(true);
    api.get(`/bom/${activeDwg.bom_id}/attachments`)
      .then(({ data }) => { if (alive) setBomAttachments(data.attachments || { drawing: [], nesting: [], costing: [] }); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeDwg.bom_id, refreshKey]);

  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  // Drawing PDF (drawing-level, uses /api/drawings/{id})
  const drawingFile = activeDwg.file_id ? {
    id: activeDwg.file_id, name: activeDwg.filename || `${activeDwg.drawing_no}.pdf`,
    previewUrl: `${backendUrl}/api/drawings/${activeDwg.id}/preview`,
    kind: "drawing_pdf",
    viewer: { drawingId: activeDwg.id, target: "mks", downloadUrl: `${backendUrl}/api/drawings/${activeDwg.id}/pdf-stamped` },
  } : null;

  const customerRefFile = activeDwg.customer_ref_file_id ? {
    id: activeDwg.customer_ref_file_id, name: activeDwg.customer_ref_filename || `${activeDwg.drawing_no}-CUST-REF.pdf`,
    previewUrl: `${backendUrl}/api/drawings/${activeDwg.id}/customer-ref/preview`,
    kind: "customer_ref",
    viewer: { drawingId: activeDwg.id, target: "customer_ref", downloadUrl: `${backendUrl}/api/drawings/${activeDwg.id}/customer-ref/download` },
  } : null;

  const uploadDrawingPdf = async (file) => {
    setUploading("drawing_pdf");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/drawings/${activeDwg.id}/upload`, fd);
      // Local patch (tidak reload parent dulu — hindari flash warning bila akan auto-rename)
      const patch = {
        file_id: "temp",
        filename: file.name,
        pdf_match_status: data?.match ? "verified" : "warning",
        pdf_match_note: data?.note,
        pdf_extracted_candidates: data?.extracted_candidates,
        status: data?.status || activeDwg.status,
      };
      setLocalDrawing((d) => ({ ...d, ...patch }));

      // Wajib pilih Kategori Pekerjaan setelah upload MKS (kalau belum ada).
      if (editable && !activeDwg.work_category) setWorkCatPopup(true);

      // Auto-baca nomor DWG dari isi PDF (repeat/manual upload).
      const detected = (data?.detected_no || "").trim();
      const source = data?.detected_source || "native";
      const norm = (s) => (s || "").replace(/\s+/g, "").toUpperCase();
      const differs = detected && norm(detected) !== norm(activeDwg.drawing_no);

      // Sumber NATIVE (teks embedded, akurat) & beda → LANGSUNG pakai nomor dari PDF.
      if (differs && source === "native") {
        try {
          const { data: rn } = await api.post(`/drawings/${activeDwg.id}/rename`, { new_drawing_no: detected });
          setLocalDrawing((d) => ({ ...d, ...patch, drawing_no: rn.drawing_no, pdf_match_status: "verified", pdf_match_note: "Nomor drawing dibaca otomatis dari isi PDF", rename_history: rn.rename_history || d.rename_history }));
          setOcrSuggestion("");
          toast.success(`✓ Nomor DWG dibaca dari PDF → ${rn.drawing_no}`, {
            description: `Sebelumnya: ${activeDwg.drawing_no}. Otomatis disamakan dengan isi PDF.`,
            duration: 8000,
          });
          onDrawingUpdated?.({ drawing_no: rn.drawing_no });
          return;
        } catch (e2) {
          toast.error(`Nomor di PDF (${detected}) terdeteksi tapi gagal dipakai: ${e2.response?.data?.detail || "error"}. Bisa ketik manual.`, { duration: 9000 });
        }
      }

      // Sumber OCR (PDF scan) → jadikan SARAN (bisa kurang akurat), user konfirmasi/koreksi manual.
      if (differs && source === "ocr") {
        setOcrSuggestion(detected);
        toast.warning(`Nomor DWG terbaca via OCR: ${detected}`, {
          description: "PDF berupa scan — nomor mungkin kurang akurat. Klik 'Pakai' untuk memakainya, atau 'Ubah manual' untuk mengetik sendiri.",
          duration: 12000,
        });
      } else {
        setOcrSuggestion("");
      }

      onDrawingUpdated?.(patch);
      if (data?.match === false && !detected) {
        const extracted = (data?.extracted_candidates || []).slice(0, 5).join(", ") || "-";
        toast.error(
          `⚠ Nomor DWG tidak terbaca otomatis. Kandidat di PDF: ${extracted} · Nomor sekarang: ${activeDwg.drawing_no}`,
          { duration: 10000, description: "PDF mungkin scan/gambar. Klik 'Ubah manual' untuk ketik nomor DWG bila perlu." }
        );
      } else if (data?.match) {
        toast.success(data?.status_auto_promoted ? "Drawing PDF ter-upload — nomor MATCH · status otomatis Issued" : "Drawing PDF ter-upload — nomor MATCH ✓");
      } else if (source !== "ocr") {
        toast.success("Drawing PDF ter-upload ✓");
      }
    } catch (e) {
      const det = e.response?.data?.detail;
      if (det && typeof det === "object" && det.code === "dwg_no_mismatch") {
        setMismatchInfo(det); // tampilkan popup — file TIDAK disimpan
      } else {
        toast.error((typeof det === "string" ? det : det?.message) || "Gagal upload drawing PDF");
      }
    }
    finally { setUploading(null); }
  };

  const uploadBomAttachment = async (category, file) => {
    if (!activeDwg.bom_id) {
      toast.error("Drawing ini belum ada BOM link. Link ke BOM dulu di Edit drawing.");
      return;
    }
    setUploading(category);
    try {
      const fd = new FormData();
      fd.append("category", category);
      fd.append("file", file);
      await api.post(`/bom/${activeDwg.bom_id}/attachments`, fd);
      toast.success(`${category === "nesting" ? "Nesting PDF" : "Costing Excel"} ter-upload`);
      setRefreshKey((k) => k + 1);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal upload"); }
    finally { setUploading(null); }
  };

  const uploadCustomerRef = async (file) => {
    setUploading("customer_ref");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/drawings/${activeDwg.id}/upload-customer-ref`, fd);
      toast.success("Customer Ref ter-upload");
      const patch = { customer_ref_file_id: "temp", customer_ref_filename: file.name };
      setLocalDrawing((d) => ({ ...d, ...patch }));
      onDrawingUpdated?.(patch);

      // Auto-baca "No. Drawing Customer" dari isi PDF. Selalu tampilkan popup:
      // - terbaca → prefill (bisa dikoreksi)
      // - tidak terbaca → input manual (autofill kosong + kandidat sbg saran)
      const detected = (data?.detected_customer_drawing_no || "").trim();
      const existing = (data?.existing_customer_drawing_no || activeDwg.customer_drawing_no || "").trim();
      setCustNoPopup({
        value: detected || existing || "",
        candidates: data?.customer_drawing_candidates || [],
        detected,
        source: data?.detected_source || "none",
      });
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal upload"); }
    finally { setUploading(null); }
  };

  const deleteBomAttachment = async (category, attachId) => {
    if (!window.confirm("Hapus file ini?")) return;
    try {
      await api.delete(`/bom/${activeDwg.bom_id}/attachments/${attachId}`);
      toast.success("File dihapus");
      setRefreshKey((k) => k + 1);
    } catch (e) { toast.error("Gagal hapus"); }
  };

  const deleteDrawingPdf = async () => {
    if (!window.confirm("Hapus Drawing PDF? Drawing record tetap ada.")) return;
    try {
      await api.delete(`/drawings/${activeDwg.id}/file`);
      toast.success("Drawing PDF dihapus");
      const patch = { file_id: null, filename: null, pdf_match_status: null };
      setLocalDrawing((d) => ({ ...d, ...patch }));
      onDrawingUpdated?.(patch);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const deleteCustomerRef = async () => {
    if (!window.confirm("Hapus Customer Reference?")) return;
    try {
      await api.delete(`/drawings/${activeDwg.id}/customer-ref`);
      toast.success("Customer Ref dihapus");
      const patch = { customer_ref_file_id: null, customer_ref_filename: null };
      setLocalDrawing((d) => ({ ...d, ...patch }));
      onDrawingUpdated?.(patch);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const openPreview = (name, url, contentType) => setPreviewFile({ name, url, contentType });
  const openFilePreview = (f) => setPreviewFile({
    name: f.name || f.filename,
    url: f.previewUrl,
    contentType: f.content_type,
    viewer: f.viewer || null,
    downloadUrl: f.downloadUrl || (f.viewer && f.viewer.downloadUrl) || "",
  });

  // Multi-file drawing (additional_files[]) — user request: "kadang dokumen drawing lebih dari 1 file"
  const uploadDrawingExtra = async (file) => {
    setUploading("drawing_extra");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/drawings/${activeDwg.id}/extras`, fd);
      toast.success(`File tambahan "${file.name}" terupload`);
      const newExtras = [...(activeDwg.additional_files || []), data.file];
      setLocalDrawing((d) => ({ ...d, additional_files: newExtras }));
      onDrawingUpdated?.({ additional_files: newExtras });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    } finally { setUploading(null); }
  };

  const deleteDrawingExtra = async (extraId) => {
    if (!window.confirm("Hapus file tambahan ini?")) return;
    try {
      await api.delete(`/drawings/${activeDwg.id}/extras/${extraId}`);
      toast.success("File dihapus");
      const newExtras = (activeDwg.additional_files || []).filter((f) => f.id !== extraId);
      setLocalDrawing((d) => ({ ...d, additional_files: newExtras }));
      onDrawingUpdated?.({ additional_files: newExtras });
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  // DWG CAD (File Asli) — file sumber gambar engineer (AutoCAD/Inventor/dll). Terpisah dari extras.
  const uploadCadFile = async (file) => {
    setUploading("cad");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/drawings/${activeDwg.id}/cad-files`, fd);
      toast.success(`✓ File CAD "${file.name}" terupload`);
      const list = [...(activeDwg.cad_files || []), data.file];
      setLocalDrawing((d) => ({ ...d, cad_files: list }));
      onDrawingUpdated?.({ cad_files: list });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload CAD");
    } finally { setUploading(null); }
  };

  const deleteCadFile = async (cadId) => {
    if (!window.confirm("Hapus file CAD ini?")) return;
    try {
      await api.delete(`/drawings/${activeDwg.id}/cad-files/${cadId}`);
      toast.success("File CAD dihapus");
      const list = (activeDwg.cad_files || []).filter((f) => f.id !== cadId);
      setLocalDrawing((d) => ({ ...d, cad_files: list }));
      onDrawingUpdated?.({ cad_files: list });
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const Slot = ({ label, icon: Icon, accent, files, onUpload, category, allowMulti = false, allowedExt = ".pdf" }) => (
    <div className={`border-2 border-${accent}-300 bg-${accent}-50/40 p-3 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold text-${accent}-800`}>
          <Icon size={14} weight="bold" /> {label}
        </div>
        <label className={`inline-flex items-center gap-1 px-2 h-7 text-[11px] font-bold cursor-pointer whitespace-nowrap bg-${accent}-700 hover:bg-${accent}-800 text-white ${uploading === category ? "opacity-60 pointer-events-none" : ""} ${editable ? "" : "hidden"}`}>
          <UploadSimple size={12} weight="bold" />
          {uploading === category ? "Uploading..." : (files.length > 0 && !allowMulti ? "Replace" : "+ Upload")}
          <input
            type="file"
            accept={allowedExt}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
            data-testid={`dw-att-upload-${category}`}
          />
        </label>
      </div>
      {files.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic">Belum ada file di-upload.</div>
      ) : (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={f.id || i} className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 text-xs">
              <FileText size={13} className={`text-${accent}-700 flex-none`} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono" title={f.name}>{f.name}</div>
                {f.size_bytes && <div className="text-[10px] text-slate-400">{(f.size_bytes / 1024).toFixed(1)} KB · {f.uploaded_by || "-"} · {fmtShortDate(f.uploaded_at)}</div>}
              </div>
              <button
                type="button"
                onClick={() => openFilePreview(f)}
                className={`p-1 text-${accent}-700 hover:bg-${accent}-50`}
                title="Preview inline"
                data-testid={`dw-att-view-${category}-${f.id || i}`}
              >
                <Eye size={13} />
              </button>
              {editable && (category !== "drawing_pdf" && category !== "customer_ref") && f.id && (
                <button
                  type="button"
                  onClick={() => deleteBomAttachment(category, f.id)}
                  className="p-1 text-rose-600 hover:bg-rose-50"
                  title="Hapus"
                >
                  <Trash size={13} />
                </button>
              )}
              {editable && category === "drawing_pdf" && (
                <button
                  type="button"
                  onClick={deleteDrawingPdf}
                  className="p-1 text-rose-600 hover:bg-rose-50"
                  title="Hapus Drawing PDF"
                  data-testid={`dw-att-delete-drawing_pdf`}
                >
                  <Trash size={13} />
                </button>
              )}
              {editable && category === "customer_ref" && (
                <button
                  type="button"
                  onClick={deleteCustomerRef}
                  className="p-1 text-rose-600 hover:bg-rose-50"
                  title="Hapus Customer Ref"
                  data-testid={`dw-att-delete-customer_ref`}
                >
                  <Trash size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Build files list per slot
  const nestingList = (bomAttachments.nesting || []).map((a) => ({
    ...a,
    previewUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/preview`,
    viewer: {
      metaUrl: `/bom/${activeDwg.bom_id}/attachments/${a.id}/page-meta`,
      pageBase: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/page-image`,
      downloadUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/download`,
    },
  }));
  const costingList = (bomAttachments.costing || []).map((a) => ({
    ...a,
    previewUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/preview`,
    // costing Excel → preview sebagai halaman GAMBAR (LibreOffice→PDF→image) di viewer yang sama.
    // Download tetap file Excel asli.
    viewer: {
      metaUrl: `/bom/${activeDwg.bom_id}/attachments/${a.id}/page-meta`,
      pageBase: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/page-image`,
      downloadUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/download`,
    },
    downloadUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/download`,
  }));
  const nestingPriceList = (bomAttachments.nesting_price || []).map((a) => ({
    ...a,
    previewUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/preview`,
    viewer: {
      metaUrl: `/bom/${activeDwg.bom_id}/attachments/${a.id}/page-meta`,
      pageBase: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/page-image`,
      downloadUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/download`,
    },
    downloadUrl: `${backendUrl}/api/bom/${activeDwg.bom_id}/attachments/${a.id}/download`,
  }));

  return (
    <div className="border-2 border-slate-300 bg-slate-50 p-3 space-y-3" data-testid="dw-attachments-panel">
      {!editable && (
        <div className="flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] text-slate-600" data-testid="dw-att-locked-banner">
          <span className="text-slate-500">🔒</span>
          <span>Drawing sudah di-submit / dikunci — mode <b>baca saja</b>. Upload, Replace, hapus, ubah nomor &amp; kategori dinonaktifkan.</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-700">
          📎 File Attachments — {editable ? "Upload & Preview" : "Preview"}
        </div>
        <div className="flex items-center gap-2">
          {activeDwg.bom_id && (
            <a
              href={`/engineering/bom-entry/${activeDwg.bom_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 h-7 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold whitespace-nowrap"
              data-testid="dw-goto-bom"
              title={editable ? `Buka BOM ${activeDwg.bom_no || ""} untuk isi/edit items` : `Lihat BOM ${activeDwg.bom_no || ""}`}
            >
              {editable ? "➕ Isi Data BOM" : "👁 Lihat BOM"} {activeDwg.bom_no ? `(${activeDwg.bom_no})` : ""}
            </a>
          )}
          {!activeDwg.bom_id && editable && (
            <div className="text-[10px] text-amber-700 italic">
              Nesting &amp; Costing memerlukan Link BOM — set di form saat register.
            </div>
          )}
        </div>
      </div>

      {/* Nomor DWG — auto-baca dari PDF saat upload, bisa dikoreksi manual */}
      <div className="flex flex-wrap items-center gap-2 border border-slate-300 bg-white px-3 py-2" data-testid="dw-no-editor">
        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">No. DWG</span>
        {!editingNo ? (
          <>
            <span className="font-mono font-bold text-slate-900 text-sm" data-testid="dw-no-value">{activeDwg.drawing_no || "(belum ada)"}</span>
            {editable && (
              <button
                onClick={() => { setNoInput(activeDwg.drawing_no || ""); setEditingNo(true); }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-slate-300 text-slate-600 hover:bg-slate-100"
                data-testid="dw-no-edit-btn"
                title="Ketik/koreksi nomor DWG manual (bila auto-baca salah / tidak terbaca)"
              >
                <PencilSimple size={12} /> Ubah manual
              </button>
            )}
            {editable && (
              <span className="text-[10px] text-slate-400 italic">Nomor otomatis dibaca dari isi PDF saat upload; ubah di sini bila salah.</span>
            )}
            {(activeDwg.rename_history || []).length > 0 && (
              <button
                onClick={() => setShowHist((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                data-testid="dw-no-history-btn"
                title="Lihat riwayat perubahan nomor DWG"
              >
                <ArrowClockwise size={11} /> Riwayat ({(activeDwg.rename_history || []).length})
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={noInput}
              onChange={(e) => setNoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveDwgNo(); if (e.key === "Escape") setEditingNo(false); }}
              placeholder="mis. DWG.26.07.03_THIES.FL.A.03"
              className="h-8 w-[320px] font-mono text-sm rounded-none"
              autoFocus
              data-testid="dw-no-input"
            />
            <Button onClick={saveDwgNo} disabled={savingNo} className="h-8 rounded-none bg-emerald-600 hover:bg-emerald-700" data-testid="dw-no-save-btn">
              {savingNo ? "..." : "Simpan"}
            </Button>
            <Button variant="ghost" onClick={() => setEditingNo(false)} disabled={savingNo} className="h-8 rounded-none" data-testid="dw-no-cancel-btn">Batal</Button>
          </div>
        )}
      </div>

      {/* Kategori Pekerjaan Drawing — WAJIB sebelum submit ke Eng Leader */}
      <div className={`flex flex-wrap items-center gap-2 border px-3 py-2 ${activeDwg.work_category ? "border-slate-300 bg-white" : "border-rose-300 bg-rose-50"}`} data-testid="dw-workcat-editor">
        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Kategori Pekerjaan</span>
        {["simple", "moderate", "complex"].map((c) => {
          const active = (activeDwg.work_category || "") === c;
          const styleMap = {
            simple: { on: "bg-emerald-600 text-white border-emerald-700", off: "bg-white text-slate-600 border-slate-300 hover:border-emerald-400 hover:text-emerald-700" },
            moderate: { on: "bg-amber-600 text-white border-amber-700", off: "bg-white text-slate-600 border-slate-300 hover:border-amber-400 hover:text-amber-700" },
            complex: { on: "bg-rose-600 text-white border-rose-700", off: "bg-white text-slate-600 border-slate-300 hover:border-rose-400 hover:text-rose-700" },
          };
          return (
            <button
              key={c}
              onClick={() => editable && saveWorkCategory(c)}
              disabled={savingCat || !editable}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors ${active ? styleMap[c].on : styleMap[c].off} ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
              data-testid={`dw-workcat-${c}`}
            >
              {c}
            </button>
          );
        })}
        {!activeDwg.work_category && (
          <span className="text-[11px] text-rose-700 font-semibold">← wajib dipilih sebelum submit</span>
        )}
      </div>


      {/* Saran nomor via OCR (PDF scan) — tidak diterapkan otomatis */}
      {editable && ocrSuggestion && (
        <div className="flex flex-wrap items-center gap-2 border border-amber-300 bg-amber-50 px-3 py-2" data-testid="dw-ocr-suggestion">
          <span className="text-[10px] uppercase tracking-widest font-bold text-amber-700">OCR</span>
          <span className="text-xs text-amber-800">Nomor terbaca dari scan (cek dulu, bisa kurang akurat):</span>
          <span className="font-mono font-bold text-amber-900 text-sm">{ocrSuggestion}</span>
          <Button onClick={applyOcrSuggestion} disabled={savingNo} className="h-7 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs" data-testid="dw-ocr-apply">Pakai</Button>
          <button onClick={() => { setNoInput(ocrSuggestion); setEditingNo(true); }} className="text-[11px] text-amber-700 underline" data-testid="dw-ocr-edit">Koreksi manual</button>
          <button onClick={() => setOcrSuggestion("")} className="text-[11px] text-slate-500 underline">Abaikan</button>
        </div>
      )}

      {/* Riwayat ganti nomor DWG */}
      {showHist && (activeDwg.rename_history || []).length > 0 && (
        <div className="border border-indigo-200 bg-indigo-50/60 px-3 py-2" data-testid="dw-no-history-list">
          <div className="text-[10px] uppercase tracking-widest font-bold text-indigo-700 mb-1">Riwayat Perubahan Nomor DWG</div>
          <div className="space-y-1">
            {[...(activeDwg.rename_history || [])].reverse().map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
                <span className="font-mono line-through text-slate-400">{h.from || "-"}</span>
                <span className="text-slate-400">→</span>
                <span className="font-mono font-bold text-slate-900">{h.to || "-"}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{h.by || "-"}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{h.at ? new Date(h.at).toLocaleString("id-ID") : "-"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROMINENT MISMATCH WARNING */}
      {activeDwg.file_id && activeDwg.pdf_match_status === "warning" && (
        <div className="border-2 border-rose-500 bg-rose-50 p-3 space-y-1" data-testid="dw-mismatch-warn">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <span className="text-lg">⚠</span> NOMOR DRAWING PDF TIDAK MATCH!
          </div>
          <div className="text-xs text-rose-700">
            <b>Registered:</b> <span className="font-mono">{activeDwg.drawing_no}</span>
            {activeDwg.pdf_extracted_candidates && activeDwg.pdf_extracted_candidates.length > 0 && (
              <> · <b>PDF berisi:</b> <span className="font-mono">{activeDwg.pdf_extracted_candidates.slice(0, 5).join(", ")}</span></>
            )}
          </div>
          <div className="text-[11px] text-rose-700 italic">
            {activeDwg.pdf_match_note || "Nomor tidak ditemukan atau berbeda."} — Silakan <b>Replace</b> file dengan PDF yang benar, atau <b>Hapus</b> lalu upload ulang.
          </div>
        </div>
      )}

      {/* Popup: Nomor DWG di PDF salah (New Order strict) — file TIDAK disimpan */}
      {mismatchInfo && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" data-testid="dw-mismatch-modal" onClick={() => setMismatchInfo(null)}>
          <div className="bg-white w-full max-w-md border-2 border-rose-500 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-rose-700 text-white px-4 py-3 flex items-center gap-2">
              <Warning size={20} weight="fill" />
              <h3 className="font-bold uppercase tracking-widest text-sm">Nomor DWG di PDF Salah</h3>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p className="text-slate-700">{mismatchInfo.message}</p>
              <div className="bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">Harus (terdaftar)</span>
                  <span className="font-mono font-bold text-emerald-700">{mismatchInfo.expected}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 uppercase tracking-wider font-bold">Terbaca di PDF</span>
                  <span className="font-mono font-bold text-rose-700">{mismatchInfo.detected || (mismatchInfo.candidates && mismatchInfo.candidates[0]) || "tidak ditemukan"}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                <Warning size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>File <b>tidak disimpan</b> ke sistem. Revisi PDF agar nomornya <b>{mismatchInfo.expected}</b>, lalu upload ulang.</span>
              </div>
            </div>
            <div className="border-t border-slate-200 p-3 flex justify-end">
              <button onClick={() => setMismatchInfo(null)} className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold uppercase tracking-wider" data-testid="dw-mismatch-close">
                Mengerti, Upload Ulang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup WAJIB: pilih Kategori Pekerjaan setelah upload MKS */}
      <Dialog open={workCatPopup} onOpenChange={(o) => { if (!o) setWorkCatPopup(false); }}>
        <DialogContent className="sm:max-w-[460px] rounded-none" data-testid="dw-workcat-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Kategori Pekerjaan Drawing</DialogTitle>
            <DialogDescription>
              Pilih tingkat kesulitan drawing ini. Wajib diisi — engineer yang menggambar paling tahu. Nomor: <b className="font-mono">{activeDwg.drawing_no}</b>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-2">
            {[
              { key: "simple", label: "SIMPLE", desc: "Mudah / cepat", cls: "border-emerald-400 hover:bg-emerald-50 text-emerald-700" },
              { key: "moderate", label: "MODERATE", desc: "Sedang", cls: "border-amber-400 hover:bg-amber-50 text-amber-700" },
              { key: "complex", label: "COMPLEX", desc: "Rumit / lama", cls: "border-rose-400 hover:bg-rose-50 text-rose-700" },
            ].map((o) => (
              <button
                key={o.key}
                onClick={() => saveWorkCategory(o.key)}
                disabled={savingCat}
                className={`flex flex-col items-center gap-1 border-2 rounded-none py-4 px-2 bg-white ${o.cls} disabled:opacity-50`}
                data-testid={`dw-workcat-modal-${o.key}`}
              >
                <span className="text-sm font-bold tracking-wider">{o.label}</span>
                <span className="text-[10px] text-slate-500">{o.desc}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup: konfirmasi / input manual "No. Drawing Customer" setelah upload Customer Ref */}
      <Dialog open={!!custNoPopup} onOpenChange={(o) => { if (!o) setCustNoPopup(null); }}>
        <DialogContent className="sm:max-w-[480px] rounded-none" data-testid="dw-custno-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} weight="bold" className="text-blue-600" /> No. Drawing Customer
            </DialogTitle>
            <DialogDescription>
              {custNoPopup?.detected
                ? <>Nomor terbaca otomatis dari PDF customer{custNoPopup?.source === "ocr" ? " (via OCR — mohon verifikasi)" : ""}. Konfirmasi atau koreksi bila perlu.</>
                : <>Nomor tidak terbaca otomatis dari PDF. Silakan ketik manual (boleh dikosongkan bila memang tidak ada).</>}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="custno-input">No. Drawing Customer</Label>
              <Input
                id="custno-input"
                value={custNoPopup?.value || ""}
                onChange={(e) => setCustNoPopup((p) => ({ ...p, value: e.target.value }))}
                placeholder="cth: CUST-DRW-00123"
                className="rounded-none font-mono"
                data-testid="dw-custno-input"
                autoFocus
              />
            </div>
            {custNoPopup?.candidates?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Saran dari PDF (klik untuk pakai)</div>
                <div className="flex flex-wrap gap-1.5">
                  {custNoPopup.candidates.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCustNoPopup((p) => ({ ...p, value: c }))}
                      className="px-2 py-1 border border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-400 text-[11px] font-mono"
                      data-testid={`dw-custno-cand-${c}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setCustNoPopup(null)} disabled={custNoSaving} data-testid="dw-custno-skip">
              Lewati
            </Button>
            <Button className="rounded-none bg-blue-600 hover:bg-blue-700 text-white" onClick={saveCustNo} disabled={custNoSaving} data-testid="dw-custno-save">
              {custNoSaving ? "Menyimpan..." : "Simpan Nomor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Drawing PDF slot */}
        <Slot
          label="Drawing PDF (MKS)"
          icon={FileText}
          accent="emerald"
          files={drawingFile ? [drawingFile] : []}
          onUpload={uploadDrawingPdf}
          category="drawing_pdf"
          allowedExt=".pdf"
        />

        {/* Customer Reference PDF slot */}
        <Slot
          label="Customer Reference PDF"
          icon={FileText}
          accent="blue"
          files={customerRefFile ? [customerRefFile] : []}
          onUpload={uploadCustomerRef}
          category="customer_ref"
          allowedExt=".pdf"
        />

        {/* Nesting · Nesting Price · Costing · DWG CAD · File Tambahan dipindah ke panel
            "Dokumen SO — Nesting · AutoCAD · Costing" (level SO). Panel per-drawing kini
            fokus hanya MKS + Customer Reference. Revisi ditangani lewat proses revisi ke Eng Leader. */}
      </div>

      {loading && <div className="text-[11px] text-slate-400 italic">Memuat attachments BOM...</div>}

      {previewFile && (() => {
        const ext = (previewFile.name || "").split(".").pop().toLowerCase();
        const isPdf = ext === "pdf" || (previewFile.contentType || "").includes("pdf");
        const isExcel = ["xlsx", "xls", "xlsm"].includes(ext);
        const v = previewFile.viewer;
        // PDF & Excel → viewer image-based (Excel dikonversi ke halaman gambar di backend).
        if (v && v.metaUrl && (isPdf || isExcel)) {
          return (
            <PdfPreviewModal
              metaUrl={v.metaUrl}
              pageUrlBuilder={(n) => `${v.pageBase}?page=${n}&scale=2`}
              pdfUrl={isPdf && v.metaUrl.includes("/attachments/") ? v.metaUrl.replace("/page-meta", "/preview") : ""}
              title={previewFile.name}
              subtitle={isExcel ? "Excel (preview gambar) · Download = file asli" : ""}
              downloadUrl={v.downloadUrl || previewFile.downloadUrl || ""}
              onClose={() => setPreviewFile(null)}
            />
          );
        }
        if (v && isPdf) {
          return (
            <PdfPreviewModal
              drawingId={v.drawingId}
              target={v.target}
              extraId={v.extraId || ""}
              stamped
              title={previewFile.name}
              downloadUrl={v.downloadUrl || previewFile.downloadUrl || ""}
              onClose={() => setPreviewFile(null)}
            />
          );
        }
        return <InlinePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />;
      })()}
    </div>
  );
}

/* ============ INLINE PREVIEW DIALOG (iframe for PDF, info card for Excel) ============ */

function InlinePreviewDialog({ file, onClose }) {
  const ext = (file.name || "").split(".").pop().toLowerCase();
  const isPdf = ext === "pdf" || (file.contentType || "").includes("pdf");
  const isExcel = ["xlsx", "xls"].includes(ext) || (file.contentType || "").includes("sheet");
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl h-[90vh] flex flex-col" data-testid="dw-attachment-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={16} weight="bold" className="text-slate-600" />
            <span className="font-mono text-sm">{file.name}</span>
          </DialogTitle>
          <DialogDescription>Preview inline — tanpa download.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 border border-slate-200 bg-slate-900 overflow-hidden">
          {(isPdf || isExcel) && (
            <iframe src={file.url} title={file.name} className="w-full h-full bg-white" />
          )}
          {isImage && (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain" />
            </div>
          )}
          {!isPdf && !isImage && !isExcel && (
            <div className="w-full h-full flex items-center justify-center text-slate-400 italic">Tipe file tidak dikenal — coba download</div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose} className="rounded-none">Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtShortDate(s) {
  if (!s) return "-";
  try { return new Date(s).toLocaleDateString("id-ID"); } catch { return "-"; }
}

/* ============ UPLOAD DIALOG with pre-verify ============ */
function UploadDialog({ item, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verify, setVerify] = useState(null);

  const doVerify = async (f) => {
    setVerifying(true);
    setVerify(null);
    try {
      const fd = new FormData();
      fd.append("drawing_no", item.drawing_no);
      fd.append("file", f);
      const { data } = await api.post("/drawings/verify-pdf", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVerify(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal verify");
    } finally { setVerifying(false); }
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setVerify(null);
    if (f) doVerify(f);
  };

  const upload = async () => {
    if (!file) { toast.error("Pilih file dulu"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("force", "true");
      const { data } = await api.post(`/drawings/${item.id}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.match) toast.success("✓ PDF verified — nomor drawing cocok · file tersimpan");
      else toast.warning("⚠ File tersimpan dengan warning — nomor drawing di PDF tidak match");
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    } finally { setUploading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple size={18} weight="bold" /> Upload PDF Drawing
          </DialogTitle>
          <DialogDescription>
            Register: <span className="font-mono font-bold">{item.drawing_no}</span> · Rev {item.revision} · {item.title}
          </DialogDescription>
        </DialogHeader>

        <div className="border-2 border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Pilih File PDF</div>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={onFileChange}
            className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 file:bg-white file:text-sky-700 file:font-semibold hover:file:bg-sky-50"
            data-testid="dw-up-file"
          />
          {file && (
            <div className="text-xs text-slate-700">📄 <b>{file.name}</b> · {(file.size / 1024).toFixed(1)} KB</div>
          )}
        </div>

        {verifying && (
          <div className="text-xs text-slate-500 mt-2">🔎 Memverifikasi isi PDF...</div>
        )}

        {verify && (
          verify.match ? (
            <div className="border-2 border-emerald-500 bg-emerald-50 p-3 mt-2 flex items-start gap-2" data-testid="dw-verify-ok">
              <CheckCircle size={20} weight="fill" className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-bold text-emerald-800">✓ Nomor drawing cocok</div>
                <div className="text-xs text-emerald-700 mt-0.5">Nomor <span className="font-mono">{item.drawing_no}</span> ditemukan di isi PDF.</div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-amber-500 bg-amber-50 p-3 mt-2 space-y-1" data-testid="dw-verify-warn">
              <div className="flex items-start gap-2">
                <Warning size={20} weight="fill" className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-bold text-amber-800">⚠ Warning — Isi PDF tidak match</div>
                  <div className="text-xs text-amber-700 mt-0.5">{verify.note}</div>
                </div>
              </div>
              {verify.extracted_candidates?.length > 0 && (
                <div className="text-xs text-amber-800 pt-1">
                  <div className="font-semibold mb-1">Kandidat nomor yang ditemukan di PDF:</div>
                  <div className="flex flex-wrap gap-1">
                    {verify.extracted_candidates.map((c, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-white border border-amber-300 font-mono text-[11px]">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[10px] text-slate-500 mt-1">Anda tetap bisa upload jika yakin file benar.</div>
            </div>
          )
        )}

        <DialogFooter className="gap-2 mt-3">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button
            onClick={upload}
            disabled={!file || uploading}
            className={`rounded-none text-white ${verify?.match === false ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-700 hover:bg-emerald-800"}`}
            data-testid="dw-up-submit"
          >
            {uploading ? "Meng-upload..." : (verify?.match === false ? "Upload Tetap (dgn warning)" : "Upload PDF")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ PREVIEW DIALOG ============ */
function PreviewDialog({ item, onClose }) {
  const targets = [{ key: "mks", label: "Drawing MKS" }];
  if (item.customer_ref_file_id) targets.push({ key: "customer_ref", label: "Drawing Customer" });
  return (
    <PdfPreviewModal
      drawingId={item.id}
      targets={targets}
      stamped
      title={`${item.drawing_no} · Rev ${item.revision}`}
      subtitle={`${item.title || ""}${item.project_name ? " · " + item.project_name : ""}`}
      downloadUrl={`${process.env.REACT_APP_BACKEND_URL}/api/drawings/${item.id}/download`}
      onClose={onClose}
    />
  );
}

/* ============ CUSTOMER REFERENCE DIALOGS ============ */

function CustomerRefUploadDialog({ item, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    if (!file) { toast.error("Pilih file dulu"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/drawings/${item.id}/upload-customer-ref`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Customer reference PDF tersimpan");
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    } finally { setUploading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple size={18} weight="bold" /> Upload Customer Reference PDF
          </DialogTitle>
          <DialogDescription>
            Untuk drawing: <span className="font-mono font-bold">{item.drawing_no}</span><br />
            Upload PDF <b>referensi dari customer</b> (bukan drawing MKS) yang jadi acuan gambar MKS ini.
          </DialogDescription>
        </DialogHeader>
        <div className="border-2 border-dashed border-blue-300 bg-blue-50 p-4 space-y-3">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 file:bg-white file:text-blue-700 file:font-semibold hover:file:bg-blue-100"
            data-testid="dw-cref-file"
          />
          {file && (<div className="text-xs text-slate-700">📄 <b>{file.name}</b> · {(file.size / 1024).toFixed(1)} KB</div>)}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button onClick={upload} disabled={!file || uploading} className="rounded-none bg-blue-700 hover:bg-blue-800 text-white" data-testid="dw-cref-submit">
            {uploading ? "Meng-upload..." : "Upload Reference PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerRefPreviewDialog({ item, onClose }) {
  return (
    <PdfPreviewModal
      drawingId={item.id}
      target="customer_ref"
      stamped
      title={`Customer Reference — ${item.drawing_no}`}
      subtitle={item.customer_ref_filename || ""}
      downloadUrl={`${process.env.REACT_APP_BACKEND_URL}/api/drawings/${item.id}/customer-ref/download`}
      onClose={onClose}
    />
  );
}



/* ============ CUSTOMER AUTO-COMPLETE (untuk DrawingForm Customer Name field) ============ */
function CustomerAutoComplete({ value, onChangeName }) {
  const [opts, setOpts] = useState([]);
  const [q, setQ] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => { setQ(value || ""); }, [value]);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      if (!open) return;
      setLoading(true);
      try {
        const { data } = await api.get("/customers", { params: { q: q.trim() || undefined, limit: 50 } });
        setOpts(data.items || []);
      } catch { setOpts([]); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <div className="relative">
      <Input
        className={`${inputCls}`}
        value={q}
        onChange={(e) => { setQ(e.target.value); onChangeName(e.target.value, null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Ketik / pilih customer (mis. PT. SPM Oil & Gas)"
        data-testid="dw-f-customer-name"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-72 overflow-auto bg-white border border-slate-300 shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-slate-400">Memuat...</div>}
          {!loading && opts.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">
              Tidak ada customer. Sales perlu buat customer dulu, atau ketik nama customer baru.
            </div>
          )}
          {opts.map((c) => (
            <button
              type="button"
              key={c.id}
              className="w-full text-left px-3 py-1.5 hover:bg-sky-50 text-sm border-b border-slate-100 flex items-center justify-between"
              onMouseDown={(e) => { e.preventDefault(); onChangeName(c.name, c); setQ(c.name); setOpen(false); }}
              data-testid={`dw-customer-opt-${c.id}`}
            >
              <span>{c.name}</span>
              <span className="text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 border border-sky-200">
                {c.customer_code || <span className="text-slate-400 font-normal">no code</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ CUSTOMER CODE MASTER PANEL (sub-section di halaman Drawing Master List) ============ */
function CustomerCodeMasterPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [editingCode, setEditingCode] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [expanded, setExpanded] = useState(false);  // default collapsed
  const pag = usePagination(items, 20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/customers", { params: { q: q.trim() || undefined, limit: 500 } });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat customer");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { if (expanded) load(); }, [load, expanded]);
  useEffect(() => { load(); /* prime count on mount */ }, []); // eslint-disable-line

  const saveCode = async (cust) => {
    const code = (editingCode[cust.id] ?? "").toUpperCase().trim();
    if (code === (cust.customer_code || "").toUpperCase()) return;
    setSavingId(cust.id);
    try {
      const { data } = await api.patch(`/customers/${cust.id}/customer-code`, { customer_code: code });
      setItems((prev) => prev.map((c) => (c.id === cust.id ? data : c)));
      setEditingCode((p) => { const n = { ...p }; delete n[cust.id]; return n; });
      toast.success(`Kode "${code || "(kosong)"}" tersimpan untuk ${cust.name}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan customer code");
    } finally {
      setSavingId(null);
    }
  };

  const withoutCode = items.filter((c) => !c.customer_code).length;

  return (
    <Card className="rounded-none border border-slate-200 overflow-hidden" data-testid="customer-code-master-panel">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors ${expanded ? "bg-slate-50 border-b border-slate-200" : "bg-white hover:bg-slate-50"}`}
        data-testid="ccm-toggle"
      >
        {expanded
          ? <CaretDown size={13} weight="bold" className="text-slate-400 shrink-0" />
          : <CaretRight size={13} weight="bold" className="text-slate-400 shrink-0" />}
        <Users size={15} weight="bold" className="text-slate-500 shrink-0" />
        <span className="text-[12px] font-semibold text-slate-700">Customer Code Master</span>
        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5">
          {items.length}
        </span>
        {withoutCode > 0 && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5" title={`${withoutCode} customer belum punya kode`}>
            {withoutCode} belum ada kode
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[10px] text-slate-400 hidden sm:inline">
          {expanded ? "Tutup" : "Kelola kode singkat customer"}
        </span>
      </button>

      {expanded && (
        <>
          <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2">
            <Input
              className={`${inputCls} w-56`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Cari customer / kode..."
              data-testid="ccm-search"
            />
            <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh">
              <ArrowClockwise size={14} weight="bold" />
            </Button>
            <div className="flex-1"></div>
            <div className="text-[10px] text-slate-500 italic">
              Sales buat customer → auto-muncul di sini → engineer isi kode (contoh: MKS, SPM, YOK)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                  <th className="text-left p-3 w-[36%]">Customer Name</th>
                  <th className="text-left p-3 w-[16%]">Customer Code</th>
                  <th className="text-left p-3">PIC</th>
                  <th className="text-left p-3">Address</th>
                  <th className="text-center p-3 w-[10%]">Status</th>
                </tr>
              </thead>
              <tbody data-testid="ccm-list">
                {loading && (<tr><td colSpan={5} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
                {!loading && items.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-slate-400">Belum ada customer. Sales bisa daftar via menu <b>Master Customer</b>.</td></tr>)}
                {items.length > 0 && pag.pagedData.map((c) => {
                  const currentEdit = editingCode[c.id];
                  const isDirty = currentEdit !== undefined && (currentEdit ?? "").toUpperCase().trim() !== (c.customer_code || "").toUpperCase();
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`ccm-row-${c.id}`}>
                      <td className="p-3 font-semibold text-slate-800">{c.name}</td>
                      <td className="p-3">
                        <Input
                          className={`${inputCls} font-mono uppercase w-24 ${isDirty ? "border-amber-500 bg-amber-50" : ""}`}
                          value={currentEdit !== undefined ? currentEdit : (c.customer_code || "")}
                          onChange={(e) => setEditingCode((p) => ({ ...p, [c.id]: e.target.value.toUpperCase() }))}
                          onKeyDown={(e) => e.key === "Enter" && saveCode(c)}
                          onBlur={() => isDirty && saveCode(c)}
                          placeholder="MKS"
                          maxLength={10}
                          data-testid={`ccm-code-${c.id}`}
                        />
                      </td>
                      <td className="p-3 text-xs text-slate-600">{c.pic || "-"}</td>
                      <td className="p-3 text-xs text-slate-500 max-w-[280px] truncate" title={c.address}>{c.address || "-"}</td>
                      <td className="p-3 text-center">
                        {isDirty ? (
                          <Button
                            size="sm"
                            onClick={() => saveCode(c)}
                            disabled={savingId === c.id}
                            className="rounded-none h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                            data-testid={`ccm-save-${c.id}`}
                          >
                            {savingId === c.id ? "..." : "SIMPAN"}
                          </Button>
                        ) : (
                          c.customer_code ? (
                            <CheckCircle size={14} weight="fill" className="text-emerald-500 inline" title="Sudah ada kode" />
                          ) : (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 border border-amber-300 font-bold uppercase">Belum ada kode</span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar {...pag} label="customer" testIdPrefix="ccm-pag" />
        </>
      )}
    </Card>
  );
}

/* ============ Digital Approval Badge + Action Button (Iter 16) ============ */
const APPROVAL_BADGE = {
  draft: { label: "Draft", bg: "bg-slate-100 text-slate-700", stage: null },
  pending_eng_head: { label: "Menunggu Eng Head", bg: "bg-amber-100 text-amber-800 border border-amber-300", stage: "eng_head" },
  pending_qc: { label: "Menunggu QC", bg: "bg-blue-100 text-blue-800 border border-blue-300", stage: "qc" },
  pending_sales: { label: "Menunggu Sales", bg: "bg-purple-100 text-purple-800 border border-purple-300", stage: "sales" },
  approved: { label: "✓ Approved", bg: "bg-emerald-100 text-emerald-800 border border-emerald-400 font-bold", stage: null },
  controlled: { label: "✓ Controlled", bg: "bg-indigo-100 text-indigo-800 border border-indigo-400 font-bold", stage: null },
  released: { label: "✓ Released", bg: "bg-teal-100 text-teal-800 border border-teal-400 font-bold", stage: null },
};

const STAGE_ROLE_MAP = {
  eng_head: ["eng_leader", "eng_head", "engineering", "super_admin"],
  qc: ["qc", "super_admin"],
  sales: ["sales", "super_admin"],
};

function DrawingApprovalBadge({ drawing, onChanged }) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [showApprovals, setShowApprovals] = React.useState(false);
  const [showSigPicker, setShowSigPicker] = React.useState(false);
  const [showSubmitSig, setShowSubmitSig] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const status = drawing.approval_status || "draft";
  const meta = APPROVAL_BADGE[status] || APPROVAL_BADGE.draft;
  const role = user?.role;

  const canSubmit = status === "draft" && drawing.file_id && ["eng_staff", "eng_leader", "eng_head", "engineering", "admin", "super_admin"].includes(role);
  const canApproveThisStage = meta.stage && (STAGE_ROLE_MAP[meta.stage] || []).includes(role);
  const canDCStamp = status === "approved" && ["doc_control", "document_control", "admin", "super_admin"].includes(role);
  const canPreviewStamped = drawing.file_id && ["approved", "controlled", "released"].includes(status);

  const openSubmitSig = () => setShowSubmitSig(true);

  const openSigPicker = () => setShowSigPicker(true);

  const doReject = async () => {
    const notes = window.prompt(`Alasan reject (wajib, min 5 char):`);
    if (!notes || notes.trim().length < 5) return toast.error("Notes wajib min 5 char");
    setBusy(true);
    try {
      await api.post(`/drawings/${drawing.id}/reject/${meta.stage}`, { notes: notes.trim() });
      toast.success("Drawing di-reject, kembali ke draft");
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reject");
    } finally { setBusy(false); }
  };

  const doDCStamp = async () => {
    if (!window.confirm(`Terapkan Digital Document Control Stamp ke drawing ${drawing.drawing_no}? Ini akan mengubah status ke 'controlled'.`)) return;
    const notes = window.prompt("Notes (opsional):") || "";
    setBusy(true);
    try {
      await api.post(`/drawings/${drawing.id}/stamp-controlled`, { notes });
      toast.success(`✓ DC Stamp diterapkan → ${drawing.drawing_no} kini Controlled Document`);
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal apply stamp");
    } finally { setBusy(false); }
  };

  const previewStamped = () => setShowPreview(true);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => setShowApprovals(true)}
        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.bg} whitespace-nowrap hover:opacity-80`}
        title="Klik untuk lihat riwayat approval"
        data-testid={`dw-approval-badge-${drawing.id}`}
      >
        {meta.label}
      </button>
      {canSubmit && (
        <button
          onClick={openSubmitSig}
          disabled={busy}
          className="px-1.5 py-0.5 text-[9px] font-bold bg-sky-600 hover:bg-sky-700 text-white uppercase tracking-widest disabled:opacity-50"
          data-testid={`dw-submit-approval-${drawing.id}`}
          title="Tanda tangan sebagai Prepared By, lalu submit ke Eng Head"
        >
          {busy ? "..." : "▶ TTD & Submit"}
        </button>
      )}
      {canApproveThisStage && (
        <div className="flex gap-0.5">
          <button
            onClick={openSigPicker}
            disabled={busy}
            className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white uppercase tracking-widest disabled:opacity-50"
            data-testid={`dw-approve-${drawing.id}`}
            title={`Approve & TTD sebagai ${meta.stage}`}
          >
            ✓ TTD & Approve
          </button>
          <button
            onClick={doReject}
            disabled={busy}
            className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-600 hover:bg-rose-700 text-white uppercase tracking-widest disabled:opacity-50"
            data-testid={`dw-reject-${drawing.id}`}
            title={`Reject ${meta.stage}`}
          >
            ✕ Reject
          </button>
        </div>
      )}
      {canDCStamp && (
        <button
          onClick={doDCStamp}
          disabled={busy}
          className="px-1.5 py-0.5 text-[9px] font-bold bg-red-700 hover:bg-red-800 text-white uppercase tracking-widest disabled:opacity-50 animate-pulse"
          data-testid={`dw-dc-stamp-${drawing.id}`}
          title="Apply Digital Document Control Stamp"
        >
          🔴 DC STAMP
        </button>
      )}
      {canPreviewStamped && (
        <button
          onClick={previewStamped}
          className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-600 hover:bg-slate-700 text-white uppercase tracking-widest"
          data-testid={`dw-preview-stamped-${drawing.id}`}
          title="Preview PDF dengan semua digital stamps"
        >
          👁 Preview Stamped
        </button>
      )}
      {showApprovals && (
        <ApprovalHistoryDialog drawing={drawing} onClose={() => setShowApprovals(false)} />
      )}
      {showSigPicker && meta.stage && (
        <SignaturePlacementModal
          drawing={drawing}
          stage={meta.stage}
          onDone={() => { setShowSigPicker(false); onChanged?.(); }}
          onClose={() => setShowSigPicker(false)}
        />
      )}
      {showSubmitSig && (
        <SignaturePlacementModal
          drawing={drawing}
          stage="submit"
          onDone={() => { setShowSubmitSig(false); onChanged?.(); }}
          onClose={() => setShowSubmitSig(false)}
        />
      )}
      {showPreview && (
        <PdfPreviewModal
          drawingId={drawing.id}
          target="mks"
          stamped
          title={drawing.drawing_no}
          subtitle={`${drawing.title || ""}${drawing.project_name ? " · " + drawing.project_name : ""}`}
          downloadUrl={`${process.env.REACT_APP_BACKEND_URL}/api/drawings/${drawing.id}/pdf-stamped`}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

function ApprovalHistoryDialog({ drawing, onClose }) {
  const list = drawing.approvals || [];
  const STAGE_LABEL = {
    submit: "Submit for Approval",
    eng_head: "Engineering Head Review",
    qc: "QC Check",
    sales: "Sales Final Approval",
    reject_eng_head: "REJECT — Engineering Head",
    reject_qc: "REJECT — QC",
    reject_sales: "REJECT — Sales",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white max-w-xl w-full mx-4 max-h-[80vh] overflow-auto border-2 border-slate-300" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Riwayat Approval — {drawing.drawing_no}</div>
            <div className="text-xs text-slate-600 mt-0.5">{drawing.project_name || drawing.title}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl leading-none">×</button>
        </div>
        <div className="p-4">
          {list.length === 0 ? (
            <div className="text-sm text-slate-400 italic">Belum ada approval tercatat.</div>
          ) : (
            <div className="space-y-2">
              {list.map((a, i) => {
                const isReject = a.stage?.startsWith("reject_");
                return (
                  <div key={i} className={`border-l-4 p-2 ${isReject ? "border-rose-500 bg-rose-50" : "border-emerald-500 bg-emerald-50"}`}>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider">
                        {isReject ? "❌" : "✓"} {STAGE_LABEL[a.stage] || a.stage}
                      </div>
                      <div className="text-[10px] text-slate-500">{a.at ? new Date(a.at).toLocaleString("id-ID") : ""}</div>
                    </div>
                    <div className="text-sm mt-0.5">
                      <span className="font-semibold">{a.name}</span>
                      <span className="text-slate-500 ml-1">({a.role})</span>
                    </div>
                    {a.notes && <div className="text-[11px] text-slate-600 mt-1 italic">&ldquo;{a.notes}&rdquo;</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

