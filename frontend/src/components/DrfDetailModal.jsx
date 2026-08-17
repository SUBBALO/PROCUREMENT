import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import PdfPreviewModal from "./PdfPreviewModal";
import { Button } from "./ui/button";
import {
  X, FileText, Paperclip, Eye, PaperPlaneTilt, Gear, CheckCircle,
  ArrowRight, UserGear, Image as ImageIcon, FileX,
} from "@phosphor-icons/react";

const TYPE_META = {
  new_order: { label: "New Order", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  repeat_order: { label: "Repeat Order", cls: "bg-blue-50 text-blue-700 border-blue-300" },
};
const STATUS_META = {
  submitted: { label: "Perlu Di-assign", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  accepted: { label: "Antri", cls: "bg-amber-50 text-amber-700 border-amber-300" },
  received: { label: "Diterima — Belum Digambar", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  in_progress: { label: "Proses — Sedang Dikerjakan", cls: "bg-violet-100 text-violet-800 border-violet-300" },
  completed: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};
const APPROVAL_META = {
  draft: { label: "Draft / Revisi", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  pending_eng_head: { label: "Menunggu TTD Eng Head", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  pending_qc: { label: "Menunggu TTD QC", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  pending_sales: { label: "Menunggu TTD Sales", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  controlled: { label: "Controlled (DC)", cls: "bg-teal-100 text-teal-800 border-teal-300" },
  released: { label: "Released", cls: "bg-green-100 text-green-800 border-green-300" },
};

const isPdf = (f) => ((f.content_type || "").toLowerCase().includes("pdf")) || (f.filename || "").toLowerCase().endsWith(".pdf");
const isImage = (f) => (f.content_type || "").toLowerCase().startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.filename || "");

export default function DrfDetailModal({ drf, isHead, onClose, onChanged }) {
  const navigate = useNavigate();
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const [detail, setDetail] = useState(drf);
  const [drawings, setDrawings] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [assignId, setAssignId] = useState("");
  const [assignPrio, setAssignPrio] = useState("normal"); // Prioritas tugas saat assign
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { mode:'attachment'|'drawing', ... }
  const [imgPreview, setImgPreview] = useState(null); // { url, name }
  const [editDl, setEditDl] = useState(false);
  const [dlDraw, setDlDraw] = useState("");
  const [dlDel, setDlDel] = useState("");
  const [savingDl, setSavingDl] = useState(false);

  const openEditDl = () => {
    setDlDraw(detail?.expected_due_date || "");
    setDlDel(detail?.delivery_due_date || "");
    setEditDl(true);
  };
  const saveDeadlines = async () => {
    setSavingDl(true);
    try {
      const { data } = await api.patch(`/drawing-requests/${detail.id}/deadlines`, {
        expected_due_date: dlDraw || "",
        delivery_due_date: dlDel || "",
      });
      setDetail((d) => ({ ...d, expected_due_date: data.expected_due_date, delivery_due_date: data.delivery_due_date }));
      toast.success("Deadline diperbarui");
      setEditDl(false);
      onChanged && onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan deadline");
    } finally {
      setSavingDl(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/drawing-requests/${drf.id}`);
      setDetail(data);
      const ids = data.linked_drawing_ids || (data.linked_drawing_id ? [data.linked_drawing_id] : []);
      if (ids.length) {
        const results = await Promise.all(ids.map((id) => api.get(`/drawings/${id}`).then((r) => r.data).catch(() => null)));
        setDrawings(results.filter(Boolean));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat detail DRF");
    }
  }, [drf.id]);

  useEffect(() => { load(); }, [load]);

  // Load daftar engineer untuk assign (hanya bila submitted & user head)
  useEffect(() => {
    if (isHead && detail?.status === "submitted") {
      api.get("/drawing-requests/engineering-users")
        .then(({ data }) => setEngineers(data?.items || []))
        .catch(() => {});
    }
  }, [isHead, detail?.status]);

  const doAcceptAssign = async () => {
    if (!assignId) return toast.error("Pilih engineer yang akan mengerjakan");
    const eng = engineers.find((e) => e.id === assignId);
    setBusy(true);
    try {
      await api.post(`/drawing-requests/${detail.id}/accept-assign`, {
        assigned_engineer_id: assignId,
        assigned_engineer_name: eng?.name || eng?.username || "",
        priority: assignPrio,
      });
      const pl = { high: " · Prioritas TINGGI", low: " · prioritas low" }[assignPrio] || "";
      toast.success(`✓ DRF diterima & ditugaskan ke ${eng?.name || eng?.username}${pl}`);
      onChanged?.();
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal terima & assign");
    } finally { setBusy(false); }
  };

  const openAttachment = (f) => {
    if (isPdf(f)) {
      setPreview({
        title: f.filename,
        metaUrl: `/drawing-requests/${detail.id}/attachments/${f.file_id}/page-meta`,
        pageUrlBuilder: (n) => `${apiUrl}/api/drawing-requests/${detail.id}/attachments/${f.file_id}/page-image?page=${n}&scale=2`,
      });
    } else if (isImage(f)) {
      setImgPreview({ url: `${apiUrl}/api/drawing-requests/${detail.id}/attachments/${f.file_id}/download`, name: f.filename });
    } else {
      toast.info("Format ini tidak bisa dipreview (hanya PDF & gambar)");
    }
  };

  const st = STATUS_META[detail?.status] || { label: detail?.status || "-", cls: "bg-slate-100 text-slate-700 border-slate-300" };
  const tp = TYPE_META[detail?.request_type] || { label: detail?.request_type, cls: "bg-slate-100 text-slate-700 border-slate-300" };
  const attachments = detail?.attached_files || [];
  const showDrawings = ["accepted", "in_progress", "completed"].includes(detail?.status);

  const InfoCell = ({ label, value, mono }) => (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] font-bold text-slate-400">{label}</div>
      <div className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-3" data-testid="drf-detail-modal">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-300">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-amber-800 text-white px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest opacity-80">Detail Drawing Request</div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono font-bold text-lg truncate">{detail?.form_no}</h2>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${tp.cls}`}>{tp.label}</span>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${st.cls}`}>{st.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded" data-testid="drf-detail-close" aria-label="Tutup"><X size={20} weight="bold" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 p-3">
            <InfoCell label="No. SO" value={detail?.so_no} mono />
            {detail?.request_type === "repeat_order" && <InfoCell label="SO Referensi (Lama)" value={detail?.ref_so_no} mono />}
            <InfoCell label="Customer" value={detail?.customer_name} />
            <InfoCell label="Kode Customer" value={detail?.customer_code} mono />
            <InfoCell label="No. PO Customer" value={detail?.po_customer_no} mono />
            <InfoCell label="Project" value={detail?.project_name} />
            <InfoCell label="Qty Order" value={`${detail?.qty_order ?? "-"} ${detail?.unit || ""}`} />
            <InfoCell label="Material" value={detail?.material} />
            <InfoCell label="Tanggal Terima PO" value={detail?.po_received_date || "-"} />
            <InfoCell label="Deadline Drawing" value={detail?.expected_due_date || "-"} />
            <InfoCell label="Deadline Pengiriman" value={detail?.delivery_due_date || "-"} />
            <InfoCell label="Requested By" value={detail?.requested_by?.name} />
            <InfoCell label="Engineer Ditugaskan" value={detail?.assigned_engineer_name} />
          </div>

          {/* Editor deadline — bisa diubah kapan saja (termasuk setelah DRF diterima/submitted) */}
          <div className="mt-3 border border-slate-200 bg-slate-50 rounded p-3">
            {!editDl ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-600">
                  <b>Deadline Drawing:</b> {detail?.expected_due_date || "-"} &nbsp;·&nbsp;
                  <b>Deadline Pengiriman:</b> {detail?.delivery_due_date || "-"}
                </div>
                <button onClick={openEditDl} className="px-2.5 py-1 text-[11px] font-bold uppercase bg-slate-700 hover:bg-slate-800 text-white rounded" data-testid="drf-edit-deadline-btn">
                  Ubah Deadline
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-wide font-bold text-amber-700">Deadline Drawing</div>
                  <input type="date" value={dlDraw} onChange={(e) => setDlDraw(e.target.value)} className="border border-amber-300 rounded px-2 py-1 text-sm" data-testid="drf-edit-drawing-date" />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide font-bold text-teal-700">Deadline Pengiriman</div>
                  <input type="date" value={dlDel} onChange={(e) => setDlDel(e.target.value)} className="border border-teal-300 rounded px-2 py-1 text-sm" data-testid="drf-edit-delivery-date" />
                </div>
                <button onClick={saveDeadlines} disabled={savingDl} className="px-3 py-1.5 text-[11px] font-bold uppercase bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50" data-testid="drf-save-deadline-btn">
                  {savingDl ? "Menyimpan…" : "Simpan"}
                </button>
                <button onClick={() => setEditDl(false)} className="px-3 py-1.5 text-[11px] font-bold uppercase bg-slate-200 hover:bg-slate-300 text-slate-700 rounded">
                  Batal
                </button>
              </div>
            )}
          </div>
          {detail?.notes && (
            <div className="text-sm">
              <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-slate-400">Catatan</span>
              <p className="text-slate-700 whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}

          {/* Lampiran DRF (dari Sales) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={14} className="text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">Lampiran dari Sales</h3>
              <span className="text-[10px] text-slate-400">({attachments.length})</span>
            </div>
            {attachments.length === 0 ? (
              <div className="text-xs text-slate-400 italic border border-dashed border-slate-200 p-3">Tidak ada lampiran.</div>
            ) : (
              <div className="space-y-1" data-testid="drf-detail-attachments">
                {attachments.map((f) => {
                  const previewable = isPdf(f) || isImage(f);
                  return (
                    <div key={f.file_id} className="flex items-center gap-2 border border-slate-200 p-2 hover:bg-slate-50">
                      {isImage(f) ? <ImageIcon size={14} className="text-slate-500" /> : isPdf(f) ? <FileText size={14} className="text-rose-500" /> : <FileX size={14} className="text-slate-400" />}
                      <span className="flex-1 text-xs truncate">{f.filename}</span>
                      <span className="text-[10px] text-slate-400">{((f.size || 0) / 1024).toFixed(1)} KB</span>
                      <button
                        onClick={() => openAttachment(f)}
                        disabled={!previewable}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid={`drf-detail-preview-${f.file_id}`}
                        title={previewable ? "Preview view-only" : "Hanya PDF & gambar bisa dipreview"}
                      >
                        <Eye size={11} weight="bold" /> Lihat
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dokumen Drawing (Engineer) + progres */}
          {showDrawings && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Gear size={14} className="text-violet-600" />
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">Dokumen Drawing (Engineer) & Progres</h3>
                <span className="text-[10px] text-slate-400">({drawings.length})</span>
              </div>
              {drawings.length === 0 ? (
                <div className="text-xs text-slate-400 italic border border-dashed border-slate-200 p-3">Engineer belum membuat nomor drawing.</div>
              ) : (
                <div className="space-y-2" data-testid="drf-detail-drawings">
                  {drawings.map((d) => {
                    const ap = APPROVAL_META[d.approval_status] || { label: d.approval_status || "-", cls: "bg-slate-100 text-slate-700 border-slate-300" };
                    const extras = d.additional_files || [];
                    return (
                      <div key={d.id} className="border border-slate-200 p-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono font-bold text-sm text-slate-900">{d.drawing_no}</span>
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${ap.cls}`}>{ap.label}</span>
                          {d.title && <span className="text-xs text-slate-500 truncate">· {d.title}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {d.file_id && (
                            <DocChip label="DWG MKS" onClick={() => setPreview({ title: d.drawing_no, drawingId: d.id, targets: [{ key: "mks", label: "Drawing MKS" }] })} testid={`drf-detail-dwg-mks-${d.id}`} />
                          )}
                          {d.customer_ref_file_id && (
                            <DocChip label="Customer" onClick={() => setPreview({ title: d.drawing_no, drawingId: d.id, targets: [{ key: "customer_ref", label: "Drawing Customer" }] })} testid={`drf-detail-dwg-cust-${d.id}`} />
                          )}
                          {extras.map((ex) => (
                            <DocChip
                              key={ex.id}
                              label={ex.label || ex.filename || "Nesting/Extra"}
                              onClick={() => setPreview({ title: `${d.drawing_no} · ${ex.label || ex.filename || "Extra"}`, drawingId: d.id, targets: [{ key: "extra", label: ex.label || "Extra", extraId: ex.id }] })}
                              testid={`drf-detail-dwg-extra-${ex.id}`}
                            />
                          ))}
                          {(d.cad_files || []).map((f) => (
                            <a
                              key={f.id}
                              href={`${apiUrl}/api/drawings/${d.id}/cad-files/${f.id}/download`}
                              target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 hover:bg-purple-200 border border-purple-300 text-[11px] font-semibold text-purple-800 transition-colors"
                              title="Unduh file CAD asli"
                              data-testid={`drf-detail-cad-${f.id}`}
                            >
                              <FileText size={11} weight="bold" /> CAD: {f.filename}
                            </a>
                          ))}
                          {!d.file_id && !d.customer_ref_file_id && extras.length === 0 && (d.cad_files || []).length === 0 && (
                            <span className="text-[11px] text-slate-400 italic">Belum ada dokumen diupload</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 flex flex-wrap items-center justify-end gap-2">
          {isHead && detail?.status === "submitted" && (
            <div className="flex items-center gap-2 mr-auto" data-testid="drf-detail-assign-box">
              <UserGear size={16} className="text-amber-700" />
              <select
                value={assignId}
                onChange={(e) => setAssignId(e.target.value)}
                className="h-9 border border-slate-300 text-sm px-2 rounded-none focus:outline-none focus:border-amber-500"
                data-testid="drf-detail-engineer-select"
              >
                <option value="">— Pilih engineer —</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>{e.name || e.username} ({e.role})</option>
                ))}
              </select>
              <select
                value={assignPrio}
                onChange={(e) => setAssignPrio(e.target.value)}
                className={`h-9 border text-sm px-2 rounded-none font-semibold focus:outline-none ${
                  assignPrio === "high" ? "border-rose-400 bg-rose-50 text-rose-700"
                  : assignPrio === "low" ? "border-slate-300 bg-slate-50 text-slate-500"
                  : "border-slate-300 bg-white text-slate-700"}`}
                title="Prioritas tugas"
                data-testid="drf-detail-priority-select"
              >
                <option value="high">Prioritas: High</option>
                <option value="normal">Prioritas: Normal</option>
                <option value="low">Prioritas: Low</option>
              </select>
              <Button onClick={doAcceptAssign} disabled={busy || !assignId} className="rounded-none bg-amber-700 hover:bg-amber-800 text-white h-9" data-testid="drf-detail-accept-assign">
                <PaperPlaneTilt size={14} weight="bold" className="mr-1" /> {busy ? "Memproses..." : "Terima & Assign"}
              </Button>
            </div>
          )}
          {["accepted", "in_progress"].includes(detail?.status) && (
            <Button
              onClick={() => { navigate(`/engineering/drf/${detail.id}`); onClose?.(); }}
              className="rounded-none bg-violet-700 hover:bg-violet-800 text-white h-9"
              data-testid="drf-detail-goto-workorder"
            >
              Lanjut ke Work Order <ArrowRight size={14} weight="bold" className="ml-1" />
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300 h-9" data-testid="drf-detail-close-btn">Tutup</Button>
        </div>
      </div>

      {/* Nested preview (view-only) */}
      {preview && (
        <PdfPreviewModal
          drawingId={preview.drawingId}
          targets={preview.targets}
          metaUrl={preview.metaUrl}
          pageUrlBuilder={preview.pageUrlBuilder}
          stamped={!!preview.drawingId}
          noDownload
          noPrint
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
      {imgPreview && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex flex-col" data-testid="drf-detail-img-preview" onClick={() => setImgPreview(null)}>
          <div className="flex items-center justify-between p-3 bg-slate-900 text-white">
            <span className="font-mono text-sm truncate">{imgPreview.name}</span>
            <button onClick={() => setImgPreview(null)} className="p-2 bg-rose-600 hover:bg-rose-500 rounded" aria-label="Tutup"><X size={16} weight="bold" /></button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <img src={imgPreview.url} alt={imgPreview.name} className="max-w-full max-h-full object-contain select-none" draggable={false} onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}

function DocChip({ label, onClick, testid }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-violet-100 border border-slate-300 hover:border-violet-400 text-[11px] font-semibold text-slate-700 transition-colors"
      data-testid={testid}
    >
      <Eye size={11} weight="bold" /> {label}
    </button>
  );
}
