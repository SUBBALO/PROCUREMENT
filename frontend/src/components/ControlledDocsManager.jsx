import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import PdfStampCanvas from "./PdfStampCanvas";
import PdfPreviewModal from "./PdfPreviewModal";
import { useAuth } from "../lib/auth";
import {
  UploadSimple, Stamp, Eye, ArrowClockwise, X, FileText, Trash,
  ArrowsClockwise, DownloadSimple, Warning,
} from "@phosphor-icons/react";

const DOC_TYPES = ["Prosedur", "Manual", "Instruksi Kerja", "Form", "Kebijakan", "Rekaman", "Lainnya"];

const STATUS_META = {
  pending: { label: "Menunggu Stamp DC", cls: "bg-amber-100 text-amber-800 border-amber-400" },
  controlled: { label: "Controlled", cls: "bg-emerald-100 text-emerald-800 border-emerald-400" },
  obsolete: { label: "Obsolete", cls: "bg-rose-100 text-rose-800 border-rose-400" },
};

/**
 * ControlledDocsManager — kelola dokumen ISO terkontrol per-view.
 * view="pending"    → daftar menunggu stamp DC + tombol upload + aksi Preview/Stamp DC
 * view="controlled" → daftar aktif + Preview (view-only) + Buat Revisi + Download
 * view="obsolete"   → arsip versi lama (Preview view-only, ada cap OBSOLETE)
 */
export default function ControlledDocsManager({ view = "pending", onChanged }) {
  const { user } = useAuth();
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const canManage = ["doc_control", "document_control", "admin", "supervisor", "super_admin"].includes(user?.role);
  const isAdmin = ["admin", "supervisor", "super_admin"].includes(user?.role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [stampDoc, setStampDoc] = useState(null);
  const [preview, setPreview] = useState(null);
  const [revisionDoc, setRevisionDoc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/controlled-documents", { params: { category: "iso", status: view, q: q || undefined } });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat dokumen");
    } finally { setLoading(false); }
  }, [view, q]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged?.(); };

  const doDelete = async (doc) => {
    if (!window.confirm(`Hapus dokumen "${doc.doc_no}"? Tindakan ini permanen.`)) return;
    try {
      await api.delete(`/controlled-documents/${doc.id}`);
      toast.success("Dokumen dihapus");
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const fmtDate = (iso) => {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }); }
    catch { return iso.slice(0, 10); }
  };

  return (
    <div className="space-y-3" data-testid={`iso-docs-${view}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari No. Dokumen / Judul / Tipe..." className="h-9 rounded-none border-slate-300 w-64" data-testid="iso-search" />
        </div>
        <button onClick={load} className="p-2 border border-slate-300 hover:bg-slate-50" title="Segarkan" data-testid="iso-refresh"><ArrowClockwise size={14} weight="bold" /></button>
        <a
          href={`${apiUrl}/api/controlled-documents/export?category=iso&status=${view}&format=xlsx`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-bold uppercase tracking-wider"
          title="Ekspor daftar ke Excel (audit ISO)" data-testid="iso-export-xlsx"
        >
          <DownloadSimple size={13} weight="bold" /> Excel
        </a>
        <a
          href={`${apiUrl}/api/controlled-documents/export?category=iso&status=${view}&format=pdf`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold uppercase tracking-wider"
          title="Ekspor daftar ke PDF (audit ISO)" data-testid="iso-export-pdf"
        >
          <DownloadSimple size={13} weight="bold" /> PDF
        </a>
        <div className="flex-1" />
        {(view === "pending" || view === "controlled") && canManage && (
          <Button onClick={() => setUploadOpen(true)} className="rounded-none bg-red-700 hover:bg-red-800 text-white h-9" data-testid="iso-upload-btn">
            <UploadSimple size={14} weight="bold" className="mr-1" /> Upload Dokumen ISO
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
            <tr>
              <th className="p-3 text-left">No. Dokumen</th>
              <th className="p-3 text-left">Judul</th>
              <th className="p-3 text-left">Tipe</th>
              <th className="p-3 text-center">Rev</th>
              <th className="p-3 text-left">Oleh</th>
              <th className="p-3 text-left">Tanggal</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400"><ArrowClockwise size={20} className="mx-auto animate-spin" /> Memuat…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="p-10 text-center text-slate-400">
                <FileText size={28} className="mx-auto mb-2 opacity-40" />
                {view === "pending" ? "Tidak ada dokumen menunggu stamp DC." : view === "controlled" ? "Belum ada dokumen ISO terkontrol." : "Tidak ada dokumen obsolete."}
              </td></tr>
            )}
            {!loading && items.map((d) => {
              const st = STATUS_META[d.status] || { label: d.status, cls: "bg-slate-100 text-slate-700 border-slate-400" };
              return (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-red-50/40" data-testid={`iso-row-${d.doc_no}`}>
                  <td className="p-3 font-mono font-semibold text-slate-900 text-xs whitespace-nowrap">{d.doc_no}</td>
                  <td className="p-3 text-slate-800 max-w-[260px] truncate" title={d.title}>{d.title}</td>
                  <td className="p-3 text-xs text-slate-600">{d.doc_type || "-"}</td>
                  <td className="p-3 text-center"><span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[10px] font-bold">{d.rev_label}</span></td>
                  <td className="p-3 text-xs text-slate-600">{d.uploaded_by?.name || "-"}</td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(d.created_at)}</td>
                  <td className="p-3 text-center"><span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${st.cls}`}>{st.label}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <button onClick={() => setPreview(d)} className="inline-flex items-center gap-0.5 px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase" data-testid={`iso-preview-${d.doc_no}`}>
                        <Eye size={11} weight="bold" /> Lihat
                      </button>
                      {view === "pending" && canManage && (
                        <button onClick={() => setStampDoc(d)} className="inline-flex items-center gap-0.5 px-2 py-1 bg-indigo-700 hover:bg-indigo-800 text-white text-[10px] font-bold uppercase" data-testid={`iso-stamp-${d.doc_no}`}>
                          <Stamp size={11} weight="bold" /> Stamp DC
                        </button>
                      )}
                      {view === "controlled" && canManage && (
                        <>
                          <button onClick={() => setRevisionDoc(d)} className="inline-flex items-center gap-0.5 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase" data-testid={`iso-revise-${d.doc_no}`}>
                            <ArrowsClockwise size={11} weight="bold" /> Revisi
                          </button>
                          <a href={`${apiUrl}/api/controlled-documents/${d.id}/download`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 px-2 py-1 border border-slate-300 hover:bg-slate-100 text-slate-700 text-[10px] font-bold uppercase" data-testid={`iso-download-${d.doc_no}`}>
                            <DownloadSimple size={11} weight="bold" /> Unduh
                          </a>
                        </>
                      )}
                      {(view === "pending" || view === "obsolete") && isAdmin && (
                        <button onClick={() => doDelete(d)} className="inline-flex items-center px-2 py-1 border border-rose-300 hover:bg-rose-50 text-rose-600 text-[10px] font-bold uppercase" data-testid={`iso-delete-${d.doc_no}`}>
                          <Trash size={11} weight="bold" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); refresh(); }} />}
      {stampDoc && <StampModal doc={stampDoc} onClose={() => setStampDoc(null)} onDone={() => { setStampDoc(null); refresh(); }} />}
      {revisionDoc && <RevisionModal doc={revisionDoc} onClose={() => setRevisionDoc(null)} onDone={() => { setRevisionDoc(null); refresh(); }} />}
      {preview && (
        <PdfPreviewModal
          metaUrl={`/controlled-documents/${preview.id}/page-meta`}
          pageUrlBuilder={(n) => `${apiUrl}/api/controlled-documents/${preview.id}/page-image?page=${n}&scale=2&stamped=true`}
          noDownload={!canManage}
          noPrint={!canManage}
          title={`${preview.doc_no} · ${preview.rev_label}`}
          subtitle={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

// ---------------- Upload Modal ----------------
function UploadModal({ onClose, onDone }) {
  const [form, setForm] = useState({ doc_no: "", title: "", doc_type: "Prosedur", notes: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.doc_no.trim() || !form.title.trim()) return toast.error("No. Dokumen & Judul wajib diisi");
    if (!file) return toast.error("Pilih file PDF");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("doc_no", form.doc_no); fd.append("title", form.title);
      fd.append("category", "iso"); fd.append("doc_type", form.doc_type); fd.append("notes", form.notes);
      fd.append("file", file);
      await api.post("/controlled-documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("✓ Dokumen ISO berhasil diarsipkan ke database");
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal upload"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-3" data-testid="iso-upload-modal">
      <div className="bg-white w-full max-w-lg border border-slate-300 shadow-2xl">
        <div className="bg-red-800 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold uppercase tracking-widest text-sm">Upload Dokumen ISO</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={18} weight="bold" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="No. Dokumen *"><Input value={form.doc_no} onChange={(e) => setForm({ ...form, doc_no: e.target.value })} placeholder="mis. MKS-ISO-PRO-01" className="rounded-none border-slate-300" data-testid="iso-form-docno" /></Field>
          <Field label="Judul Dokumen *"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="mis. Prosedur Pengendalian Dokumen" className="rounded-none border-slate-300" data-testid="iso-form-title" /></Field>
          <Field label="Tipe Dokumen">
            <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} className="w-full h-10 border border-slate-300 px-2 text-sm rounded-none" data-testid="iso-form-type">
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Catatan"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-none border-slate-300" /></Field>
          <Field label="File PDF *">
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm border border-slate-300 p-2" data-testid="iso-form-file" />
            {file && <span className="text-xs text-slate-500 mt-1 block">{file.name} · {(file.size / 1024).toFixed(1)} KB</span>}
          </Field>
        </div>
        <div className="border-t border-slate-200 p-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300">Batal</Button>
          <Button onClick={submit} disabled={busy} className="rounded-none bg-red-700 hover:bg-red-800 text-white" data-testid="iso-upload-submit">{busy ? "Mengupload…" : "Upload"}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Stamp Modal ----------------
function StampModal({ doc, onClose, onDone }) {
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const [posPick, setPosPick] = useState(null); // {page, xRel, yRel}
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!posPick) return toast.error("Klik posisi stamp pada dokumen dulu");
    setBusy(true);
    try {
      await api.post(`/controlled-documents/${doc.id}/stamp-controlled`, {
        notes: "Controlled Document",
        placements: [{ page: -1, x: posPick.xRel, y: posPick.yRel, size: "M" }],
      });
      toast.success(`✓ ${doc.doc_no} di-stamp DC → Controlled`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal stamp"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" data-testid="iso-stamp-modal">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-widest opacity-70">Stamp DC — klik posisi cap (berlaku semua halaman)</div>
          <h3 className="font-mono font-bold">{doc.doc_no} · {doc.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={confirm} disabled={busy || !posPick} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="iso-stamp-confirm">
            <Stamp size={14} weight="bold" className="mr-1" /> {busy ? "Menstamp…" : "Konfirmasi Stamp"}
          </Button>
          <button onClick={onClose} className="p-2 bg-rose-600 hover:bg-rose-500 rounded"><X size={16} weight="bold" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <PdfStampCanvas
          metaUrl={`/controlled-documents/${doc.id}/page-meta`}
          imgUrlBuilder={(n) => `${apiUrl}/api/controlled-documents/${doc.id}/page-image?page=${n}&scale=2&stamped=false`}
          pos={posPick}
          allPages
          onPick={(page, xRel, yRel) => setPosPick({ page, xRel, yRel })}
          markerNode={<div className="px-2 py-1 bg-red-600/90 text-white text-[9px] font-bold uppercase tracking-wider border-2 border-red-800 rotate-[-8deg]">DC Controlled</div>}
        />
      </div>
    </div>
  );
}

// ---------------- Revision Modal ----------------
function RevisionModal({ doc, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return toast.error("Pilih file revisi (PDF)");
    if (!window.confirm(`Buat revisi baru untuk "${doc.doc_no}"?\nVersi lama (${doc.rev_label}) akan otomatis jadi OBSOLETE.`)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("notes", notes); fd.append("file", file);
      await api.post(`/controlled-documents/${doc.id}/new-revision`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`✓ Revisi baru dibuat. ${doc.rev_label} → OBSOLETE. Silakan stamp DC revisi baru.`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal buat revisi"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-3" data-testid="iso-revision-modal">
      <div className="bg-white w-full max-w-lg border border-slate-300 shadow-2xl">
        <div className="bg-amber-700 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold uppercase tracking-widest text-sm">Buat Revisi — {doc.doc_no}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={18} weight="bold" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <Warning size={16} weight="fill" className="shrink-0 mt-0.5" />
            <span>Versi lama <b>{doc.rev_label}</b> akan otomatis diberi cap <b>OBSOLETE</b> & dipindah ke tab Obsolete. Revisi baru masuk <b>Menunggu Stamp DC</b>.</span>
          </div>
          <Field label="Catatan Revisi"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. perbaikan klausul 7.5" className="rounded-none border-slate-300" data-testid="iso-rev-notes" /></Field>
          <Field label="File Revisi (PDF) *">
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm border border-slate-300 p-2" data-testid="iso-rev-file" />
            {file && <span className="text-xs text-slate-500 mt-1 block">{file.name}</span>}
          </Field>
        </div>
        <div className="border-t border-slate-200 p-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300">Batal</Button>
          <Button onClick={submit} disabled={busy} className="rounded-none bg-amber-700 hover:bg-amber-800 text-white" data-testid="iso-rev-submit">{busy ? "Memproses…" : "Buat Revisi"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
