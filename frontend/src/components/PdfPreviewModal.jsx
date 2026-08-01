import React, { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { X, MagnifyingGlassPlus, MagnifyingGlassMinus, DownloadSimple, Printer, ArrowClockwise } from "@phosphor-icons/react";

/**
 * PdfPreviewModal — viewer PDF baca berbasis GAMBAR (render server-side page-image).
 * Menggantikan "buka tab baru" yang sering kena blokir popup / dicegat IDM.
 *
 * Fitur: scroll semua halaman, zoom, PRINT (cetak halaman gambar), dan DOWNLOAD (file asli).
 * Print & Download tersedia untuk SEMUA role.
 *
 * MODE A (drawing): beri `drawingId` + `target`/`targets`.
 * MODE B (generik): beri `metaUrl` (path relatif ke /api) + `pageUrlBuilder(page)` +
 *   opsional `downloadUrl`. Dipakai untuk lampiran BOM, MII, template, dll.
 *
 * Props:
 *   - drawingId, target ("mks"|"customer_ref"|"extra"), targets [{key,label,extraId?}], extraId
 *   - metaUrl (string, generic), pageUrlBuilder (fn(page)->string, generic)
 *   - stamped (bool, default true untuk drawing)
 *   - title, subtitle
 *   - downloadUrl (string) — file asli untuk di-download
 *   - onClose
 */
export default function PdfPreviewModal({
  drawingId,
  target = "mks",
  targets = null,
  extraId = "",
  metaUrl = "",
  pageUrlBuilder = null,
  stamped = true,
  title = "Preview Dokumen",
  subtitle = "",
  downloadUrl = "",
  noDownload = false,
  onClose,
}) {
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const generic = !!metaUrl;
  const tabList = generic
    ? [{ key: "__generic__", label: "Dokumen" }]
    : ((targets && targets.length) ? targets : [{ key: target, label: "Dokumen", extraId }]);
  const [activeKey, setActiveKey] = useState(tabList[0].key);
  const active = tabList.find((t) => t.key === activeKey) || tabList[0];
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(1);
  const [printing, setPrinting] = useState(false);

  // Default download URL untuk mode drawing bila tidak diberikan.
  // noDownload=true (mis. role QC/Store/Produksi/DocControl) → paksa sembunyikan tombol download.
  const effectiveDownloadUrl = noDownload ? "" : (downloadUrl || (!generic && drawingId
    ? (active.key === "customer_ref"
        ? `${apiUrl}/api/drawings/${drawingId}/customer-ref/download`
        : `${apiUrl}/api/drawings/${drawingId}/pdf-stamped`)
    : ""));

  const load = useCallback(async () => {
    setMeta(null); setErr("");
    try {
      if (generic) {
        const { data } = await api.get(metaUrl);
        setMeta(data);
      } else {
        const params = { target: active.key };
        if (active.extraId) params.extra_id = active.extraId;
        const { data } = await api.get(`/drawings/${drawingId}/page-meta`, { params });
        setMeta(data);
      }
    } catch (e) {
      setErr(e.response?.data?.detail || "Dokumen tidak tersedia untuk preview");
    }
  }, [drawingId, active.key, active.extraId, generic, metaUrl]);

  useEffect(() => { load(); }, [load]);

  const imgUrl = (n) => {
    if (generic && pageUrlBuilder) return pageUrlBuilder(n);
    const p = new URLSearchParams({ target: active.key, page: String(n), scale: "2" });
    if (active.extraId) p.set("extra_id", active.extraId);
    if (stamped) p.set("stamped", "1");
    return `${apiUrl}/api/drawings/${drawingId}/page-image?${p.toString()}`;
  };

  const doPrint = () => {
    setPrinting(true);
    // beri waktu gambar (yang sudah ter-cache) untuk render di print-root
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(false), 500);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black/80 flex flex-col" data-testid="pdf-preview-modal">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-3 bg-slate-900 text-white shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Preview Dokumen</div>
          <div className="font-mono font-bold truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-300 truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} className="p-2 bg-slate-700 hover:bg-slate-600 rounded" title="Perkecil" data-testid="pdf-zoom-out"><MagnifyingGlassMinus size={16} weight="bold" /></button>
          <span className="text-xs w-12 text-center tabular-nums" data-testid="pdf-zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="p-2 bg-slate-700 hover:bg-slate-600 rounded" title="Perbesar" data-testid="pdf-zoom-in"><MagnifyingGlassPlus size={16} weight="bold" /></button>
          <button onClick={doPrint} disabled={!meta} className="ml-2 inline-flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold uppercase tracking-widest disabled:opacity-40" title="Cetak" data-testid="pdf-print">
            <Printer size={15} weight="bold" /> Print
          </button>
          {effectiveDownloadUrl && (
            <a href={effectiveDownloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold uppercase tracking-widest" data-testid="pdf-download">
              <DownloadSimple size={15} weight="bold" /> Download
            </a>
          )}
          <button onClick={onClose} className="ml-1 p-2 bg-rose-600 hover:bg-rose-500 rounded" title="Tutup" data-testid="pdf-preview-close" aria-label="Tutup"><X size={16} weight="bold" /></button>
        </div>
      </div>

      {/* Doc tabs */}
      {tabList.length > 1 && (
        <div className="flex bg-slate-800 border-b border-slate-700 shrink-0">
          {tabList.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveKey(t.key); setZoom(1); }}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px ${activeKey === t.key ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              data-testid={`pdf-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950">
        {err && (
          <div className="max-w-md mx-auto mt-10 text-center">
            <div className="text-rose-300 text-sm bg-rose-900/50 p-4 rounded" data-testid="pdf-preview-error">{err}</div>
            <button onClick={load} className="mt-3 inline-flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded"><ArrowClockwise size={14} /> Coba lagi</button>
          </div>
        )}
        {!err && !meta && (
          <div className="text-slate-300 text-sm p-10 text-center animate-pulse" data-testid="pdf-preview-loading">Memuat halaman dokumen…</div>
        )}
        {meta && (
          <div className="flex flex-col items-center gap-5 pb-10">
            {Array.from({ length: meta.pages }).map((_, n) => {
              const size = (meta.sizes && meta.sizes[n]) || { w: 210, h: 297 };
              return (
                <div key={`${active.key}-${n}`} className="flex flex-col items-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Halaman {n + 1} / {meta.pages}</div>
                  <div className="bg-white shadow-2xl" style={{ width: `min(${1000 * zoom}px, ${95 * zoom}vw)`, aspectRatio: `${size.w} / ${size.h}` }}>
                    <img src={imgUrl(n)} alt={`Halaman ${n + 1}`} className="w-full h-full object-contain select-none" draggable={false} data-testid={`pdf-preview-page-${n}`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Print area (tersembunyi di layar; muncul saat window.print) */}
      {printing && meta && (
        <div id="pdf-print-root">
          {Array.from({ length: meta.pages }).map((_, n) => (
            <img key={`print-${n}`} src={imgUrl(n)} alt={`Halaman ${n + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}
