"""Konversi dokumen Office (Excel/Word) → PDF via LibreOffice headless.

Dipakai lintas modul agar file Excel (costing, nesting, lampiran) bisa dipreview
sebagai halaman GAMBAR di `PdfPreviewModal` — persis seperti PDF, TANPA buka tab
baru / dicegat IDM.

Preview = akurat "sesuai hasil" (rendering LibreOffice). Download tetap file asli
(ditangani endpoint /download masing-masing modul).

Catatan deploy (Windows Server 2012 R2 / Linux):
- Harus ada LibreOffice terinstall. Binary `soffice` dicari otomatis lewat PATH +
  lokasi umum per-OS. Bisa juga override lewat env `SOFFICE_BIN`.
"""
import hashlib
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Ekstensi Office yang bisa dikonversi → PDF (untuk preview image-based)
OFFICE_EXTS = {"xlsx", "xls", "xlsm", "xlsb", "ods", "docx", "doc", "odt", "pptx", "ppt", "odp"}

# ---------------- LibreOffice locator (lintas OS) ----------------
def find_soffice() -> Optional[str]:
    """Cari binary LibreOffice `soffice` di Windows / macOS / Linux.

    Urutan:
    1. env `SOFFICE_BIN` (override eksplisit — berguna di Windows jika path non-standar).
    2. `shutil.which()` — cek PATH sistem.
    3. Lokasi fallback umum per-OS.
    """
    override = os.environ.get("SOFFICE_BIN")
    if override and Path(override).exists():
        return override

    for name in ("soffice", "soffice.exe", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found

    candidates = []
    if sys.platform.startswith("win"):
        pf_candidates = [
            os.environ.get("PROGRAMFILES", r"C:\Program Files"),
            os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
            os.environ.get("PROGRAMW6432", r"C:\Program Files"),
        ]
        for pf in pf_candidates:
            candidates.append(str(Path(pf) / "LibreOffice" / "program" / "soffice.exe"))
    elif sys.platform == "darwin":
        candidates.append("/Applications/LibreOffice.app/Contents/MacOS/soffice")
    else:
        candidates.extend([
            "/usr/bin/soffice",
            "/usr/lib/libreoffice/program/soffice",
            "/usr/bin/libreoffice",
            "/snap/bin/libreoffice",
        ])
    for p in candidates:
        if p and Path(p).exists():
            return p
    return None


# ---------------- Cache PDF hasil konversi ----------------
_PDF_CACHE: dict = {}
_PDF_CACHE_TTL = 300  # detik
_PDF_CACHE_MAX = 32


def _cache_get(key: str):
    entry = _PDF_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > _PDF_CACHE_TTL:
        _PDF_CACHE.pop(key, None)
        return None
    entry["ts"] = time.time()
    return entry["pdf"]


def _cache_set(key: str, pdf: bytes) -> None:
    if len(_PDF_CACHE) >= _PDF_CACHE_MAX:
        oldest = min(_PDF_CACHE.items(), key=lambda kv: kv[1]["ts"])[0]
        _PDF_CACHE.pop(oldest, None)
    _PDF_CACHE[key] = {"pdf": pdf, "ts": time.time()}


# ---------------- Auto-install & pre-warm (Linux) ----------------
_ENSURE_LOCK = threading.Lock()


def _install_libreoffice() -> bool:
    """Install LibreOffice (calc) di container Linux. Robust: apt-get update dulu,
    lalu coba beberapa nama paket. Return True bila soffice akhirnya tersedia."""
    try:
        subprocess.run(["apt-get", "update"], capture_output=True, timeout=180)
    except Exception as e:  # pragma: no cover
        logger.warning("apt-get update gagal (lanjut coba install): %s", e)
    for pkg in (["libreoffice-calc"], ["libreoffice"]):
        try:
            subprocess.run(
                ["apt-get", "install", "-y", "--no-install-recommends", *pkg],
                capture_output=True, timeout=600,
            )
            if find_soffice():
                return True
        except Exception as e:  # pragma: no cover
            logger.error("LibreOffice install (%s) gagal: %s", pkg, e)
    return find_soffice() is not None


def ensure_soffice() -> Optional[str]:
    """Pastikan soffice tersedia; install sekali bila belum (khusus Linux). Thread-safe."""
    s = find_soffice()
    if s:
        return s
    if not sys.platform.startswith("linux"):
        return None
    with _ENSURE_LOCK:
        s = find_soffice()
        if s:
            return s
        _install_libreoffice()
        return find_soffice()


def prewarm_soffice_async() -> None:
    """Pre-warm LibreOffice di background thread saat startup, agar preview Excel
    pertama tidak lambat / timeout. Aman dipanggil berkali-kali."""
    if find_soffice() or not sys.platform.startswith("linux"):
        return
    threading.Thread(target=ensure_soffice, name="soffice-prewarm", daemon=True).start()


def office_to_pdf(raw: bytes, ext: str) -> bytes:
    """Konversi bytes dokumen Office → bytes PDF via LibreOffice headless.

    Args:
        raw: isi file mentah.
        ext: ekstensi tanpa titik (mis. 'xlsx', 'xls', 'docx').

    Returns:
        bytes PDF.

    Raises:
        HTTPException 503 jika LibreOffice tidak tersedia; 500 jika konversi gagal.
    """
    ext = (ext or "").lower().lstrip(".") or "xlsx"
    cache_key = hashlib.sha256(raw).hexdigest() + ":" + ext
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    soffice = find_soffice()

    # Linux container: coba auto-install (robust) sebagai upaya terakhir.
    if not soffice and sys.platform.startswith("linux"):
        soffice = ensure_soffice()

    if not soffice:
        raise HTTPException(
            status_code=503,
            detail=(
                "LibreOffice (soffice) tidak tersedia untuk preview Excel. "
                "Install LibreOffice, atau set env SOFFICE_BIN ke path soffice.exe (Windows) / soffice (Linux/macOS). "
                "File tetap bisa di-Download dalam format aslinya."
            ),
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src = tmp_path / f"in_{uuid.uuid4().hex}.{ext}"
        src.write_bytes(raw)
        # HOME/USERPROFILE override → cegah LibreOffice pollute profil user & lock clash.
        env = {**os.environ, "HOME": str(tmp_path), "USERPROFILE": str(tmp_path)}
        try:
            proc = subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(tmp_path), str(src)],
                capture_output=True, timeout=120, env=env,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="Konversi Excel→PDF timeout (LibreOffice terlalu lama)")
        if proc.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"LibreOffice convert error: {proc.stderr.decode(errors='ignore')[:400]}",
            )
        pdf = src.with_suffix(".pdf")
        if not pdf.exists():
            raise HTTPException(status_code=500, detail="PDF tidak dihasilkan oleh LibreOffice")
        result = pdf.read_bytes()
        _cache_set(cache_key, result)
        return result


def is_office_ext(ext: str) -> bool:
    return (ext or "").lower().lstrip(".") in OFFICE_EXTS
