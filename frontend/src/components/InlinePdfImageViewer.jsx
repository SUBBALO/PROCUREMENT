import React, { useEffect, useState, useCallback, useRef } from "react";
import api from "../lib/api";
import {
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowClockwise,
  FileX,
  CircleNotch,
} from "@phosphor-icons/react";

/** Ganti/atur parameter `scale` pada URL page-image (untuk resolusi progresif). */
function withScale(url, scale) {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("scale", String(scale));
    return u.toString();
  } catch {
    return url;
  }
}

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
  // Resolusi progresif: skala rendah dulu (cepat), pertajam saat di-zoom.
  const serverScale = zoom <= 1.05 ? 1.25 : zoom <= 1.7 ? 2 : 3;

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
                <LazyPage
                  key={n}
                  index={n}
                  pages={pages}
                  size={size}
                  zoom={zoom}
                  src={withScale(pageUrlBuilder(n), serverScale)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LazyPage — hanya memuat gambar halaman saat mendekati viewport (IntersectionObserver).
 * Mengurangi beban render server dari "semua halaman sekaligus" → per-halaman saat terlihat.
 */
function LazyPage({ index, pages, size, zoom, src }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(index === 0); // halaman pertama langsung dimuat

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" } // pra-muat sedikit sebelum terlihat
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="flex flex-col items-center w-full">
      <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">
        Halaman {index + 1} / {pages}
      </div>
      <div
        className="bg-white shadow-lg border border-slate-200 relative"
        style={{
          width: `min(${820 * zoom}px, ${94 * zoom}%)`,
          aspectRatio: `${size.w} / ${size.h}`,
        }}
      >
        {visible ? (
          <img
            src={src}
            alt={`Halaman ${index + 1}`}
            loading="lazy"
            className="w-full h-full object-contain select-none"
            draggable={false}
            data-testid={`inline-pdf-page-${index}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300" data-testid={`inline-pdf-page-${index}-placeholder`}>
            <CircleNotch size={22} className="animate-spin" weight="bold" />
          </div>
        )}
      </div>
    </div>
  );
}
