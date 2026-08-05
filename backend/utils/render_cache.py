"""Cache render viewer (image-based) — mempercepat buka drawing/gambar.

Dua cache LRU thread-safe berbasis-isi (content-addressed):
- PNG_CACHE  : hasil render 1 halaman PDF → PNG (kunci = hash isi sumber + halaman + skala).
- STAMP_CACHE: hasil build PDF ber-stamp (kunci = hash isi + target + peran + state).

Karena kunci mengikuti ISI sumber, hasil tidak mungkin basi: bila drawing/stamp/
tanda tangan berubah, isi bytes berubah → kunci berubah → render ulang otomatis.
"""
from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from typing import Optional


class _LRUBytes:
    def __init__(self, max_items: int = 240, max_bytes: int = 320 * 1024 * 1024):
        self.max_items = max_items
        self.max_bytes = max_bytes
        self._d: "OrderedDict[str, bytes]" = OrderedDict()
        self._size = 0
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[bytes]:
        with self._lock:
            v = self._d.get(key)
            if v is not None:
                self._d.move_to_end(key)
            return v

    def set(self, key: str, val: bytes) -> None:
        if val is None:
            return
        with self._lock:
            if key in self._d:
                self._size -= len(self._d.pop(key))
            self._d[key] = val
            self._size += len(val)
            while self._d and (len(self._d) > self.max_items or self._size > self.max_bytes):
                _, old = self._d.popitem(last=False)
                self._size -= len(old)

    def clear(self) -> None:
        with self._lock:
            self._d.clear()
            self._size = 0


PNG_CACHE = _LRUBytes()
STAMP_CACHE = _LRUBytes(max_items=120, max_bytes=256 * 1024 * 1024)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def render_png_cached(src_bytes: bytes, page: int, scale: float) -> bytes:
    """Render satu halaman PDF → PNG, dengan cache berbasis-isi."""
    import fitz  # PyMuPDF

    key = f"{sha(src_bytes)}:{page}:{round(float(scale), 3)}"
    cached = PNG_CACHE.get(key)
    if cached is not None:
        return cached
    doc = fitz.open(stream=src_bytes, filetype="pdf")
    try:
        if page < 0 or page >= doc.page_count:
            raise IndexError("Halaman di luar jangkauan")
        pix = doc.load_page(page).get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        png = pix.tobytes("png")
    finally:
        doc.close()
    PNG_CACHE.set(key, png)
    return png


def png_etag(src_bytes: bytes, page: int, scale: float) -> str:
    """ETag stabil untuk 1 halaman render (dipakai validasi cache browser / 304)."""
    return '"' + hashlib.sha256(
        f"{sha(src_bytes)}:{page}:{round(float(scale), 3)}".encode()
    ).hexdigest()[:32] + '"'
