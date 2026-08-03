import React, { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import {
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowClockwise,
  FileX,
  CircleNotch,
} from "@phosphor-icons/react";

/**
 * InlinePdfImageViewer — pratinjau dokumen PDF berbasis GAMBAR (render server-side per halaman)
 * yang tampil INLINE (bukan iframe). Konsisten di semua browser & aman untuk peran view-only
 * (tidak ada tombol download/print — murni baca).
 *
 * Sumber data:
 *   - metaUrl: path relatif ke /api yang mengembalikan {pages, sizes:[{w,h}], message?}
 *   - pageUrlBuilder(page): fungsi -> URL absolut gambar PNG halaman ke-`page` (0-indexed)
 *
 * Empty-state ramah bila pages === 0 (mis. file MKS belum diunggah).
 *
 * Props:
 *   metaUrl (string, wajib)
 *   pageUrlBuilder (fn(page)=>string, wajib)
 *   emptyMessage (string) — pesan bila tidak ada halaman
 *   reloadKey (any) — ubah nilainya untuk memaksa reload
 *   className (string)
 */
export default function InlinePdfImageViewer({
  metaUrl,
  pageUrlBuilder,
  emptyMessage = "Dokumen belum tersedia untuk pratinjau.",
  reloadKey = 0,
  className = "",
}) {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(1);

  const load = useCallback(async () => {
    setMeta(null);
    setErr("");
    try {
      const { data } = await api.get(metaUrl);
      setMeta(data);
    } catch (e) {
      setErr(e.response?.data?.detail || "Dokumen tidak tersedia untuk pratinjau.");
    }
  }, [metaUrl, reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = meta?.pages || 0;
  const loading = !meta && !err;
  const isEmpty = meta && pages === 0;

  return (
    <div className={`relative flex flex-col bg-slate-100 ${className}`} data-testid="inline-pdf-viewer">
      {/* Zoom controls — hanya muncul saat ada halaman */}
      {pages > 0 && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-slate-900/85 backdrop-blur px-1.5 py-1 rounded-md shadow-lg">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            className="p-1.5 text-white hover:bg-white/15 rounded transition-colors"
            title="Perkecil"
            data-testid="inline-pdf-zoom-out"
          >
            <MagnifyingGlassMinus size={14} weight="bold" />
          </button>
          <span className="text-[11px] text-white w-9 text-center tabular-nums" data-testid="inline-pdf-zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            className="p-1.5 text-white hover:bg-white/15 rounded transition-colors"
            title="Perbesar"
            data-testid="inline-pdf-zoom-in"
          >
            <MagnifyingGlassPlus size={14} weight="bold" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {loading && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500" data-testid="inline-pdf-loading">
            <CircleNotch size={26} className="animate-spin text-violet-500" weight="bold" />
            <span className="text-xs font-medium">Memuat halaman dokumen…</span>
          </div>
        )}

        {err && (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center" data-testid="inline-pdf-error">
            <FileX size={38} className="text-rose-400" weight="duotone" />
            <p className="text-sm text-slate-600 max-w-xs">{err}</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded transition-colors"
              data-testid="inline-pdf-retry"
            >
              <ArrowClockwise size={13} weight="bold" /> Coba lagi
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center" data-testid="inline-pdf-empty">
            <FileX size={38} className="text-slate-300" weight="duotone" />
            <p className="text-sm text-slate-500 max-w-xs">{meta?.message || emptyMessage}</p>
          </div>
        )}

        {pages > 0 && (
          <div className="flex flex-col items-center gap-4 pb-4">
            {Array.from({ length: pages }).map((_, n) => {
              const size = (meta.sizes && meta.sizes[n]) || { w: 595, h: 842 };
              return (
                <div key={n} className="flex flex-col items-center w-full">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">
                    Halaman {n + 1} / {pages}
                  </div>
                  <div
                    className="bg-white shadow-lg border border-slate-200"
                    style={{
                      width: `min(${820 * zoom}px, ${94 * zoom}%)`,
                      aspectRatio: `${size.w} / ${size.h}`,
                    }}
                  >
                    <img
                      src={pageUrlBuilder(n)}
                      alt={`Halaman ${n + 1}`}
                      className="w-full h-full object-contain select-none"
                      draggable={false}
                      data-testid={`inline-pdf-page-${n}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
