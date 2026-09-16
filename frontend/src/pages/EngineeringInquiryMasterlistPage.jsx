import React, { useCallback, useEffect, useState } from "react";
import BackLink from "../components/BackLink";
import PageTabNav from "../components/PageTabNav";
import { useInquiryTabs } from "../hooks/useEngTabs";
import api from "../lib/api";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import InlinePdfImageViewer from "../components/InlinePdfImageViewer";
import {
  MagnifyingGlass, ArrowClockwise, ClipboardText, FunnelSimple, Eye, X,
  Paperclip, FilePdf, MicrosoftExcelLogo, Image as ImageIcon, File as FileIcon,
  DownloadSimple, CircleNotch, User, Buildings, CalendarBlank, CheckCircle,
  ListBullets, NotePencil, Wrench,
} from "@phosphor-icons/react";

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const STATUS_LABELS = {
  submitted: { t: "Terkirim", c: "bg-amber-100 text-amber-800 border-amber-300" },
  assigned: { t: "Ditugaskan", c: "bg-blue-100 text-blue-800 border-blue-300" },
  accepted: { t: "Diterima", c: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  in_progress: { t: "Dikerjakan", c: "bg-sky-100 text-sky-800 border-sky-300" },
  head_revision: { t: "Revisi Head", c: "bg-orange-100 text-orange-800 border-orange-300" },
  pending_head_review: { t: "Review Head", c: "bg-purple-100 text-purple-800 border-purple-300" },
  awaiting_review: { t: "Review Sales", c: "bg-teal-100 text-teal-800 border-teal-300" },
  revision_requested: { t: "Revisi Sales", c: "bg-rose-100 text-rose-800 border-rose-300" },
  closed: { t: "Selesai/Closed", c: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

// Status IKUT KEADAAN AKTUAL (pola DRF): ditugaskan-belum diterima → Antri;
// diterima-belum dikerjakan → Diterima; work_started_at terisi → Dikerjakan.
const stageLabel = (it) => {
  if (["submitted", "in_progress"].includes(it.status) && it.assigned_to_id) {
    if (it.work_started_at) return { t: "Dikerjakan", c: "bg-sky-100 text-sky-800 border-sky-300" };
    if (it.accepted_at) return { t: "Diterima — Belum Dikerjakan", c: "bg-indigo-100 text-indigo-800 border-indigo-300" };
    return { t: "Antri — Belum Diterima", c: "bg-amber-100 text-amber-800 border-amber-400" };
  }
  return STATUS_LABELS[it.status] || { t: it.status, c: "bg-slate-100 text-slate-600 border-slate-300" };
};

const CAT_STYLE = {
  simple: "bg-emerald-100 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-100 text-amber-800 border-amber-300",
  complex: "bg-rose-100 text-rose-800 border-rose-300",
};

const fmtDate = (iso) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return null; }
};

const fmtSize = (b) => {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const extOf = (fn) => (fn && fn.includes(".") ? fn.split(".").pop().toLowerCase() : "");
const isPdfExcel = (ext) => ["pdf", "xlsx", "xls", "xlsm", "csv"].includes(ext);
const isImage = (ext) => ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
const attIcon = (ext) => (ext === "pdf" ? FilePdf : (["xlsx", "xls", "xlsm", "csv"].includes(ext) ? MicrosoftExcelLogo : (isImage(ext) ? ImageIcon : FileIcon)));

export default function EngineeringInquiryMasterlistPage() {
  const inqTabs = useInquiryTabs();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  // Detail modal
  const [detail, setDetail] = useState(null);       // full inquiry object
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Attachment preview modal
  const [preview, setPreview] = useState(null);     // {inqId, fileId, filename, ext}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (category !== "all") params.category = category;
      if (status !== "all") params.status = status;
      const { data } = await api.get("/inquiries/masterlist", { params });
      setItems(data.items || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, category, status]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const openDetail = useCallback(async (id) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/inquiries/${id}`);
      setDetail(data);
    } catch (e) {
      setDetail({ _error: e.response?.data?.detail || "Gagal memuat detail inquiry." });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openAttachment = (inqId, a) => {
    const ext = extOf(a.filename);
    if (isPdfExcel(ext) || isImage(ext)) {
      setPreview({ inqId, fileId: a.id, filename: a.filename, ext });
    } else {
      // Unsupported preview → langsung unduh
      window.open(`${backendUrl}/api/inquiries/${inqId}/attachments/${a.id}/download`, "_blank");
    }
  };

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4">
      <BackLink />
      <PageTabNav tabs={inqTabs} />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
          <ClipboardText size={14} weight="fill" /> Engineering · Masterlist
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Masterlist Inquiry
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Rekap seluruh inquiry costing. Klik baris untuk melihat detail lengkap beserta lampirannya.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari no inquiry / customer / project / PIC..."
            className="pl-8 rounded-none"
            data-testid="inq-master-search"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <FunnelSimple size={15} className="text-slate-400" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 border border-slate-300 rounded-none text-sm px-2" data-testid="inq-master-cat-filter">
            <option value="all">Semua Kategori</option>
            <option value="simple">Simple</option>
            <option value="moderate">Moderate</option>
            <option value="complex">Complex</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 border border-slate-300 rounded-none text-sm px-2" data-testid="inq-master-status-filter">
            <option value="all">Semua Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left p-3">No Inquiry</th>
              <th className="text-left p-3">Customer / Project</th>
              <th className="text-left p-3">PIC Engineer</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Kategori</th>
              <th className="text-left p-3">Tgl Terima</th>
              <th className="text-left p-3">Tgl Selesai</th>
              <th className="text-right p-3">Aksi</th>
            </tr>
          </thead>
          <tbody data-testid="inq-master-list">
            {loading && (<tr><td colSpan={8} className="p-8 text-center text-slate-400"><ArrowClockwise size={18} className="inline animate-spin mr-1" /> Memuat...</td></tr>)}
            {!loading && items.length === 0 && (<tr><td colSpan={8} className="p-8 text-center text-slate-400">Belum ada inquiry.</td></tr>)}
            {!loading && items.map((it) => {
              const st = stageLabel(it);
              const cat = (it.work_category || "").toLowerCase();
              const attCount = (it.attachments?.length || 0) + (it.engineer_response_files?.length || 0);
              return (
                <tr
                  key={it.id}
                  onClick={() => openDetail(it.id)}
                  className="border-b border-slate-100 hover:bg-amber-50/60 cursor-pointer transition-colors"
                  data-testid={`inq-master-row-${it.id}`}
                >
                  <td className="p-3 font-mono font-bold text-slate-900">
                    {it.inquiry_no || "-"}
                    {attCount > 0 && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400" title={`${attCount} lampiran`}>
                        <Paperclip size={11} weight="bold" />{attCount}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{it.customer_name || "-"}</div>
                    <div className="text-[12px] text-slate-500">{it.title || it.project_name || "-"}</div>
                  </td>
                  <td className="p-3 text-slate-700">{it.pic_engineer_name || it.assigned_to_name || "-"}</td>
                  <td className="p-3"><span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${st.c}`}>{st.t}</span></td>
                  <td className="p-3">
                    {cat
                      ? <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${CAT_STYLE[cat] || ""}`} data-testid={`inq-master-cat-${it.id}`}>{cat}</span>
                      : <span className="text-[10px] text-slate-300 uppercase">—</span>}
                  </td>
                  <td className="p-3 text-[12px] text-slate-600" data-testid={`inq-master-received-${it.id}`}>{fmtDate(it.accepted_at) || <span className="text-slate-300">—</span>}</td>
                  <td className="p-3 text-[12px] text-emerald-700 font-medium" data-testid={`inq-master-completed-${it.id}`}>{fmtDate(it.completed_at) || <span className="text-slate-300">—</span>}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openDetail(it.id); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border border-amber-300 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-colors"
                      data-testid={`inq-master-view-${it.id}`}
                    >
                      <Eye size={13} weight="bold" /> Lihat
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && <div className="text-[12px] text-slate-400">Total: {items.length} inquiry</div>}

      {/* ============ MODAL DETAIL INQUIRY ============ */}
      <Dialog open={detailOpen} onOpenChange={(o) => { if (!o) { setDetailOpen(false); setDetail(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="inq-detail-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 flex-wrap">
              <ClipboardText size={18} weight="bold" className="text-amber-600" />
              <span className="font-mono">{detail?.inquiry_no || "Detail Inquiry"}</span>
              {detail?.status && (() => {
                const st = stageLabel(detail);
                return <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${st.c}`}>{st.t}</span>;
              })()}
              {detail?.work_category && (
                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${CAT_STYLE[(detail.work_category || "").toLowerCase()] || ""}`}>
                  {detail.work_category}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <CircleNotch size={26} className="animate-spin text-amber-500" weight="bold" /> Memuat detail…
            </div>
          )}

          {!detailLoading && detail?._error && (
            <div className="py-12 text-center text-rose-500 text-sm" data-testid="inq-detail-error">{detail._error}</div>
          )}

          {!detailLoading && detail && !detail._error && (
            <div className="space-y-5" data-testid="inq-detail-body">
              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <InfoRow icon={Buildings} label="Customer" value={detail.customer_name} />
                <InfoRow icon={ListBullets} label="Project" value={detail.project_name} />
                <InfoRow icon={NotePencil} label="Judul" value={detail.title} />
                <InfoRow icon={User} label="PIC Engineer" value={detail.pic_engineer_name || detail.assigned_to_name} />
                <InfoRow icon={CalendarBlank} label="Tgl Terima" value={fmtDate(detail.accepted_at)} />
                <InfoRow icon={CheckCircle} label="Tgl Selesai" value={fmtDate(detail.completed_at)} valueCls="text-emerald-700 font-semibold" />
                <InfoRow icon={CalendarBlank} label="Deadline Customer" value={fmtDate(detail.customer_deadline)} />
                <InfoRow icon={User} label="Dibuat oleh" value={detail.created_by_name} />
              </div>

              {/* Description */}
              {detail.description && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Deskripsi</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 p-3">{detail.description}</p>
                </div>
              )}

              {/* Items */}
              {Array.isArray(detail.items) && detail.items.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Daftar Item ({detail.items.length})</div>
                  <div className="border border-slate-200 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="text-left p-2 w-10">No</th>
                          <th className="text-left p-2">Nama Item</th>
                          <th className="text-left p-2 w-20">Qty</th>
                          <th className="text-left p-2 w-20">Unit</th>
                          <th className="text-left p-2">Spesifikasi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100" data-testid={`inq-detail-item-${i}`}>
                            <td className="p-2 text-slate-400">{i + 1}</td>
                            <td className="p-2 font-medium text-slate-800">{r.item_name || "-"}</td>
                            <td className="p-2 text-slate-600 tabular-nums">{r.qty}</td>
                            <td className="p-2 text-slate-600">{r.unit || "-"}</td>
                            <td className="p-2 text-slate-600">{r.specification || <span className="text-slate-300">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Review note */}
              {detail.review_note && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Catatan Review Sales</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-rose-50 border border-rose-200 p-3">{detail.review_note}</p>
                </div>
              )}

              {/* Attachments */}
              <AttachmentGroup
                title="Lampiran dari Sales"
                files={detail.attachments}
                inqId={detail.id}
                onOpen={openAttachment}
              />
              <AttachmentGroup
                title="File Hasil Kerja Engineer"
                files={detail.engineer_response_files}
                inqId={detail.id}
                onOpen={openAttachment}
                accent="violet"
              />

              {(!(detail.attachments?.length) && !(detail.engineer_response_files?.length)) && (
                <div className="text-sm text-slate-400 flex items-center gap-1.5 border border-dashed border-slate-200 p-4 justify-center" data-testid="inq-detail-no-att">
                  <Paperclip size={14} /> Tidak ada lampiran pada inquiry ini.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL PRATINJAU LAMPIRAN ============ */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden" data-testid="inq-att-preview-dialog">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2 text-slate-800 text-sm pr-8">
              {preview && React.createElement(attIcon(preview.ext), { size: 16, weight: "bold", className: "text-amber-600 shrink-0" })}
              <span className="truncate">{preview?.filename}</span>
              {preview && (
                <a
                  href={`${backendUrl}/api/inquiries/${preview.inqId}/attachments/${preview.fileId}/download`}
                  target="_blank" rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                  data-testid="inq-att-download"
                >
                  <DownloadSimple size={13} weight="bold" /> Unduh
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="h-[72vh] bg-slate-100" data-testid="inq-att-preview-body">
            {preview && isImage(preview.ext) && (
              <div className="w-full h-full overflow-auto flex items-start justify-center p-4">
                <img
                  src={`${backendUrl}/api/inquiries/${preview.inqId}/attachments/${preview.fileId}/download?inline=1`}
                  alt={preview.filename}
                  className="max-w-full object-contain shadow border border-slate-200 bg-white"
                  data-testid="inq-att-image"
                />
              </div>
            )}
            {preview && isPdfExcel(preview.ext) && (
              <InlinePdfImageViewer
                className="h-full"
                metaUrl={`/inquiries/${preview.inqId}/attachments/${preview.fileId}/page-meta`}
                pageUrlBuilder={(n) => `${backendUrl}/api/inquiries/${preview.inqId}/attachments/${preview.fileId}/page-image?page=${n}&scale=2`}
                emptyMessage="Lampiran tidak dapat dipratinjau."
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Sub-components ---------- */

const InfoRow = ({ icon: Icon, label, value, valueCls = "text-slate-800" }) => (
  <div className="flex items-start gap-2">
    <Icon size={15} weight="bold" className="text-slate-400 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
      <div className={`text-sm ${valueCls} break-words`}>{value || <span className="text-slate-300">—</span>}</div>
    </div>
  </div>
);

const AttachmentGroup = ({ title, files, inqId, onOpen, accent = "amber" }) => {
  if (!files || files.length === 0) return null;
  const dot = accent === "violet" ? "bg-violet-500" : "bg-amber-500";
  return (
    <div data-testid={`inq-att-group-${accent}`}>
      <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dot}`} /> {title} ({files.length})
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {files.map((a) => {
          const ext = extOf(a.filename);
          const Icon = attIcon(ext);
          const previewable = isPdfExcel(ext) || isImage(ext);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpen(inqId, a)}
              className="group flex items-center gap-3 text-left border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 p-2.5 transition-colors"
              data-testid={`inq-att-item-${a.id}`}
              title={previewable ? "Klik untuk pratinjau" : "Klik untuk mengunduh"}
            >
              <div className="w-9 h-9 shrink-0 flex items-center justify-center bg-slate-100 group-hover:bg-white border border-slate-200">
                <Icon size={18} weight="bold" className="text-slate-500 group-hover:text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{a.filename}</div>
                <div className="text-[11px] text-slate-400">
                  {fmtSize(a.size)}{a.uploaded_by ? ` · ${a.uploaded_by}` : ""}
                </div>
              </div>
              {previewable
                ? <Eye size={15} weight="bold" className="text-slate-300 group-hover:text-amber-600 shrink-0" />
                : <DownloadSimple size={15} weight="bold" className="text-slate-300 group-hover:text-amber-600 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
