import React, { useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { X, UploadSimple, Trash, XCircle } from "@phosphor-icons/react";

/**
 * RejectDrawingModal — Fase 3: reject drawing dengan catatan + unggah banyak file koreksi (markup).
 * Setelah reject, drawing kembali ke draft & catatan/file tersimpan di revisi untuk staff.
 */
export default function RejectDrawingModal({ drawing, stage, onDone, onClose }) {
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (notes.trim().length < 5) return toast.error("Catatan reject wajib diisi (min 5 karakter)");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("notes", notes.trim());
      files.forEach((f) => fd.append("files", f));
      await api.post(`/drawings/${drawing.id}/reject-with-files/${stage}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Drawing ${drawing.drawing_no} di-reject → kembali ke staff untuk revisi`);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reject");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-3" data-testid="reject-modal">
      <div className="bg-white w-full max-w-lg border border-slate-300 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-4 py-3 bg-rose-700 text-white flex items-center gap-2">
          <XCircle size={18} weight="fill" />
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest opacity-80">Reject & Minta Revisi — {stage}</div>
            <div className="font-mono font-bold">{drawing.drawing_no}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded" data-testid="reject-close"><X size={18} weight="bold" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-600 mb-1 block">Catatan / Alasan Revisi *</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full border border-slate-300 p-2 text-sm rounded-none focus:outline-none focus:border-rose-500"
              placeholder="Contoh: Dimensi hole Ø12 pada view A salah, ubah ke Ø14. Tolerance flatness belum dicantumkan..."
              data-testid="reject-notes"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-600 mb-1 block">Lampiran Koreksi / Markup (opsional, bisa banyak)</label>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 p-3 text-sm text-slate-500 cursor-pointer hover:border-rose-400 hover:bg-rose-50/40">
              <UploadSimple size={16} weight="bold" /> Pilih file (PDF markup, foto, dll)
              <input type="file" multiple className="hidden" onChange={addFiles} data-testid="reject-file-input" />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1" data-testid="reject-file-list">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-2 py-1">
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-rose-600 hover:text-rose-800" title="Hapus"><Trash size={13} weight="bold" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold uppercase hover:bg-slate-100">Batal</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase disabled:opacity-40" data-testid="reject-submit">
            {busy ? "Mengirim..." : "Reject & Kirim ke Staff"}
          </button>
        </div>
      </div>
    </div>
  );
}
