import React, { useRef, useState } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import BackLink from "../components/BackLink";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Camera, Images, UploadSimple, X, CheckCircle, ListChecks } from "@phosphor-icons/react";

/** Halaman upload foto nota — dibuat besar & sederhana supaya nyaman dipakai dari HP. */
export default function TempUploadPage() {
  const nav = useNavigate();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const addFiles = (list) => {
    const arr = Array.from(list || []).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    setFiles((prev) => [...prev, ...arr.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
  };

  const removeAt = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const upload = async () => {
    if (files.length === 0) return toast.error("Pilih atau foto nota dulu");
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f.file));
      const { data } = await api.post("/temp-transactions/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDone(data.uploaded);
      setFiles([]);
      toast.success(`${data.uploaded} foto terkirim — AI sedang membaca nota`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <BackLink />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Upload Nota Belanja
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Foto nota cash dari HP — bisa banyak sekaligus. AI membaca otomatis, hasilnya masuk{" "}
          <b>Transaksi Sementara</b> untuk Anda cek sebelum masuk sistem.
        </p>
      </div>

      {/* Tombol besar ramah jempol */}
      <div className="grid grid-cols-2 gap-3">
        <button
          data-testid="btn-camera"
          onClick={() => cameraRef.current?.click()}
          className="border-2 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 flex flex-col items-center justify-center gap-2 py-8"
        >
          <Camera size={34} weight="duotone" />
          <span className="text-sm font-bold uppercase tracking-[0.08em]">Foto Kamera</span>
        </button>
        <button
          data-testid="btn-gallery"
          onClick={() => galleryRef.current?.click()}
          className="border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex flex-col items-center justify-center gap-2 py-8"
        >
          <Images size={34} weight="duotone" />
          <span className="text-sm font-bold uppercase tracking-[0.08em]">Pilih dari Galeri</span>
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="input-camera" />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="input-gallery" />

      {/* Preview foto terpilih */}
      {files.length > 0 && (
        <Card className="rounded-none border-slate-200 shadow-none p-3">
          <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600 mb-2">{files.length} foto siap dikirim</div>
          <div className="grid grid-cols-3 gap-2" data-testid="preview-grid">
            {files.map((f, i) => (
              <div key={i} className="relative border border-slate-200">
                <img src={f.url} alt={`nota ${i + 1}`} className="w-full h-28 object-cover" />
                <button
                  data-testid={`preview-del-${i}`}
                  onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 bg-red-600 text-white p-1"
                  title="Hapus foto ini"
                >
                  <X size={12} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Button
        data-testid="upload-submit"
        onClick={upload}
        disabled={uploading || files.length === 0}
        className="w-full rounded-none h-12 bg-slate-900 hover:bg-slate-800 text-white text-sm uppercase tracking-[0.12em] font-bold"
      >
        <UploadSimple size={18} weight="bold" className="mr-2" />
        {uploading ? "Mengirim..." : `Kirim ${files.length || ""} Foto & Baca AI`}
      </Button>

      {done > 0 && (
        <Card className="rounded-none border-emerald-300 bg-emerald-50 shadow-none p-4" data-testid="upload-done">
          <div className="flex items-center gap-2 text-emerald-900 text-sm font-semibold">
            <CheckCircle size={18} weight="fill" className="text-emerald-600" /> {done} foto terkirim — AI sedang membaca
          </div>
          <p className="text-xs text-emerald-800 mt-1">Hasil pembacaan masuk ke list Transaksi Sementara. Anda bisa lanjut foto nota lain, atau cek hasilnya sekarang.</p>
          <Button
            data-testid="goto-review"
            onClick={() => nav("/purchasing/temp-transactions")}
            variant="outline"
            className="mt-3 rounded-none h-10 w-full border-emerald-400 text-emerald-800 hover:bg-emerald-100 text-xs uppercase tracking-[0.1em] font-bold"
          >
            <ListChecks size={16} weight="bold" className="mr-1.5" /> Buka Transaksi Sementara
          </Button>
        </Card>
      )}
    </div>
  );
}
