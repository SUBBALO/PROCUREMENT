import React, { useEffect, useState } from "react";
import api from "../lib/api";

/**
 * PdfStampCanvas — render SEMUA halaman PDF sebagai gambar yang bisa di-scroll,
 * lalu klik halaman mana pun untuk menaruh posisi stamp.
 *
 * Mengatasi 2 masalah lama:
 *   1. Tidak bisa scroll ke bawah (dulu pakai <iframe pointer-events-none> ber-aspect-ratio tetap).
 *   2. Hanya halaman 1 yang terlihat / bisa di-stamp.
 *
 * Props:
 *   - drawingId          : id drawing
 *   - target             : "mks" | "customer_ref" | "extra"
 *   - extraId            : id file extra (kalau target="extra")
 *   - pos                : { page, xRel, yRel } | null  — posisi yang dipilih
 *   - onPick(page, x, y) : callback saat user klik area PDF
 *   - markerNode         : elemen React untuk ditampilkan sebagai preview stamp
 *   - allPages           : bool — tampilkan marker di SEMUA halaman (DC / SO stamp)
 *   - accent             : warna border marker halaman aktif (opsional)
 */
export default function PdfStampCanvas({
  drawingId,
  target = "mks",
  extraId = "",
  pos,
  onPick,
  markerNode,
  allPages = false,
}) {
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setMeta(null);
    setErr("");
    (async () => {
      try {
        const params = { target };
        if (extraId) params.extra_id = extraId;
        const { data } = await api.get(`/drawings/${drawingId}/page-meta`, { params });
        if (alive) setMeta(data);
      } catch (e) {
        if (alive) setErr(e.response?.data?.detail || "Gagal memuat halaman PDF");
      }
    })();
    return () => { alive = false; };
  }, [drawingId, target, extraId]);

  const handleClick = (pageIdx, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const yRel = (e.clientY - rect.top) / rect.height;
    onPick?.(pageIdx, Math.min(1, Math.max(0, xRel)), Math.min(1, Math.max(0, yRel)));
  };

  const imgUrl = (n) => {
    const p = new URLSearchParams({ target, page: String(n), scale: "2" });
    if (extraId) p.set("extra_id", extraId);
    return `${apiUrl}/api/drawings/${drawingId}/page-image?${p.toString()}`;
  };

  if (err) {
    return <div className="text-white text-sm p-6 bg-rose-900/60 rounded" data-testid="stamp-canvas-error">{err}</div>;
  }
  if (!meta) {
    return <div className="text-white text-sm p-6 animate-pulse" data-testid="stamp-canvas-loading">Memuat halaman PDF…</div>;
  }

  return (
    <div className="flex flex-col items-center gap-5 pb-16 w-full" data-testid="stamp-canvas">
      {Array.from({ length: meta.pages }).map((_, n) => {
        const size = (meta.sizes && meta.sizes[n]) || { w: 210, h: 297 };
        const showMarker = pos && (allPages || pos.page === n);
        const isActive = pos && pos.page === n;
        return (
          <div key={n} className="flex flex-col items-center w-full">
            <div className="text-[10px] text-slate-300 uppercase tracking-widest mb-1">
              Halaman {n + 1} / {meta.pages}
            </div>
            <div
              className={`relative bg-white shadow-2xl cursor-crosshair ${isActive ? "ring-2 ring-emerald-400" : ""}`}
              style={{ width: "min(1000px, 90vw)", aspectRatio: `${size.w} / ${size.h}` }}
              onClick={(e) => handleClick(n, e)}
              data-testid={`stamp-page-${n}`}
            >
              <img
                src={imgUrl(n)}
                alt={`Halaman ${n + 1}`}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
              />
              {showMarker && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${pos.xRel * 100}%`,
                    top: `${pos.yRel * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  data-testid={`stamp-marker-page-${n}`}
                >
                  {markerNode}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
