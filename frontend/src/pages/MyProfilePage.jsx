import React, { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { UploadSimple, Trash, CheckCircle, Warning, User } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";

/**
 * MyProfilePage — halaman untuk user upload/kelola Tanda Tangan Digital (TTD).
 *
 * Setiap user (Eng Head / QC / Sales / DC / Admin) upload gambar TTD sendiri
 * (PNG transparan disarankan). TTD ini akan otomatis ditempel di PDF Drawing
 * pada posisi yang dipilih approver saat approve.
 *
 * Rekomendasi: PNG background transparan, ~200 × 80 px, max 2 MB.
 */
export default function MyProfilePage() {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewKey, setPreviewKey] = useState(Date.now());
  const fileRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users/me/signature-meta");
      setMeta(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat TTD");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doUpload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File terlalu besar. Maksimum 2 MB.");
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error("Hanya PNG / JPG / WebP.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/users/${user.id}/signature`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("✓ TTD berhasil diupload");
      setPreviewKey(Date.now());
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    } finally { setUploading(false); }
  };

  const doDelete = async () => {
    if (!window.confirm("Hapus TTD Anda? Anda perlu upload ulang untuk approve drawing selanjutnya.")) return;
    try {
      await api.delete(`/users/${user.id}/signature`);
      toast.success("TTD dihapus");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const sigUrl = `${apiUrl}/api/users/${user?.id}/signature?t=${previewKey}`;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-sky-600 mb-1">
          <User size={14} weight="fill" /> Profile
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Tanda Tangan Digital
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload gambar tanda tangan Anda. TTD ini akan otomatis ditempel di PDF Drawing pada posisi
          yang Anda pilih saat approve. Rekomendasi: <b>PNG transparan</b>, ukuran ± 200 × 80 px, max 2 MB.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 p-6">
        {loading ? (
          <div className="text-center py-8 text-slate-400">Memuat...</div>
        ) : meta?.has_signature ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
              <CheckCircle size={20} weight="fill" /> TTD sudah tersimpan
              {meta.signature_uploaded_at && (
                <span className="text-slate-500 text-xs font-normal ml-2">
                  ({new Date(meta.signature_uploaded_at).toLocaleString("id-ID")})
                </span>
              )}
            </div>
            <div className="border-2 border-dashed border-slate-300 bg-slate-50 p-4 flex items-center justify-center min-h-[160px]">
              <img
                src={sigUrl}
                alt="TTD Anda"
                className="max-h-[140px] max-w-full object-contain"
                data-testid="signature-preview-img"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-none bg-sky-700 hover:bg-sky-800 text-white"
                data-testid="signature-replace-btn"
              >
                <UploadSimple size={14} weight="bold" className="mr-1.5" />
                {uploading ? "Uploading..." : "Ganti TTD"}
              </Button>
              <Button
                onClick={doDelete}
                variant="destructive"
                className="rounded-none bg-rose-700 hover:bg-rose-800 text-white"
                data-testid="signature-delete-btn"
              >
                <Trash size={14} weight="bold" className="mr-1.5" /> Hapus
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold">
              <Warning size={20} weight="fill" /> Anda belum upload TTD
            </div>
            <div
              className="border-2 border-dashed border-slate-300 bg-slate-50 hover:border-sky-500 hover:bg-sky-50 cursor-pointer p-8 text-center transition-colors"
              onClick={() => fileRef.current?.click()}
              data-testid="signature-upload-dropzone"
            >
              <UploadSimple size={48} weight="duotone" className="text-slate-400 mx-auto mb-3" />
              <div className="text-sm font-semibold text-slate-700">Klik untuk pilih file TTD</div>
              <div className="text-xs text-slate-500 mt-1">
                PNG transparan direkomendasikan · ± 200 × 80 px · max 2 MB
              </div>
            </div>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-none bg-sky-700 hover:bg-sky-800 text-white w-full"
              data-testid="signature-upload-btn"
            >
              <UploadSimple size={14} weight="bold" className="mr-1.5" />
              {uploading ? "Uploading..." : "Upload TTD"}
            </Button>
          </div>
        )}

        <input
          type="file"
          ref={fileRef}
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { doUpload(e.target.files?.[0]); e.target.value = ""; }}
          className="hidden"
          data-testid="signature-file-input"
        />
      </Card>

      <Card className="rounded-none border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">💡 Tips Membuat TTD Digital</div>
        <ul className="text-xs text-amber-900 space-y-1 list-disc pl-4">
          <li>Tulis TTD di kertas putih, foto/scan → edit di aplikasi remove.bg atau Photoshop untuk hapus background</li>
          <li>Simpan sebagai <b>PNG dengan transparansi</b> (bukan JPG) supaya bisa overlay di drawing tanpa kotak putih</li>
          <li>Ukuran ideal: ± 200 × 80 pixel — jangan terlalu besar</li>
          <li>Setelah upload, TTD Anda akan otomatis muncul di PDF drawing pada posisi yang Anda pilih saat approve</li>
        </ul>
      </Card>
    </div>
  );
}
