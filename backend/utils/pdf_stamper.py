"""PDF Stamper — overlay digital signature stamps + DC stamp to drawing PDF.

Iter 18 — Fleksibel Digital Signature:
- Setiap approval bisa punya x,y (0..1 relative), page, size (S/M/L), dan signature_file_id
- Signature PNG dari user GridFS diambil dan di-overlay di posisi custom yang dipilih approver
- Fallback: kalau approver tidak set posisi → strip lama di bagian bawah halaman 1
- DC Stamp Salma tetap seperti sebelumnya (kotak merah MKS)

Original PDF tidak diubah — stamped version dibuat on-the-fly saat preview/download.
"""
from __future__ import annotations
import io
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
import fitz  # PyMuPDF

# Warna cap tinta
RED_INK = (0.85, 0.15, 0.30)     # merah/pink seperti cap manual MKS
BLUE_INK = (0.10, 0.30, 0.65)    # biru untuk digital signature engineering
GREEN_INK = (0.15, 0.55, 0.30)   # hijau untuk approved signature


def _fmt_date(iso_str: str) -> str:
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y").upper()
    except Exception:
        return str(iso_str)[:10]


def _fmt_datetime(iso_str: str) -> str:
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(iso_str)[:16]


def _draw_dc_stamp(page: fitz.Page, dc_data: dict) -> None:
    """Cap merah 'MKS / [tgl] / DOCUMENT CONTROL' — default pojok kanan atas.
    Kalau dc_data punya 'x','y' (0..1 relatif), pakai posisi custom (klik Salma di UI).
    """
    if not dc_data:
        return
    pw, ph = page.rect.width, page.rect.height
    # Iter 20b — DC stamp lebih compact (65×48)
    box_w, box_h = 65, 48
    if "x" in dc_data and "y" in dc_data:
        cx = float(dc_data["x"]) * pw
        cy = float(dc_data["y"]) * ph
        x0 = max(10, min(pw - box_w - 10, cx - box_w / 2))
        y0 = max(10, min(ph - box_h - 10, cy - box_h / 2))
    else:
        x0 = pw - box_w - 25
        y0 = 25
    rect = fitz.Rect(x0, y0, x0 + box_w, y0 + box_h)
    page.draw_rect(rect, color=RED_INK, width=1.4)
    inner = fitz.Rect(x0 + 2, y0 + 2, x0 + box_w - 2, y0 + box_h - 2)
    page.draw_rect(inner, color=RED_INK, width=0.5)
    # Text MKS di tengah atas
    page.insert_text(
        (x0 + box_w / 2 - 11, y0 + 15),
        "MKS",
        fontsize=11, fontname="helv", color=RED_INK,
    )
    # Tanggal
    date_str = _fmt_date(dc_data.get("at", ""))
    page.insert_text(
        (x0 + box_w / 2 - len(date_str) * 1.8, y0 + 28),
        date_str,
        fontsize=6.5, fontname="helv", color=RED_INK,
    )
    # Footer "DOCUMENT CONTROL"
    page.insert_text(
        (x0 + 3, y0 + box_h - 6),
        "DOCUMENT CONTROL",
        fontsize=4.6, fontname="hebo", color=RED_INK,
    )
    # Info kecil audit (di luar kotak)
    name = dc_data.get("name") or dc_data.get("username") or ""
    if name:
        page.insert_text(
            (x0, y0 + box_h + 9),
            f"by: {name} · {_fmt_datetime(dc_data.get('at', ''))}",
            fontsize=5.5, fontname="helv", color=(0.3, 0.3, 0.3),
        )


def _draw_so_stamp(page: fitz.Page, so_data: dict) -> None:
    """Iter 20b — SO Stamp kotak merah untuk Produksi.
    Fields yang dicetak (semua manual isi Salma):
        so_no, po_no, qty, customer, received_date, due_date

    Posisi custom via so_data['x'], so_data['y'] (0..1 relative), atau default di bawah DC stamp.
    """
    if not so_data:
        return
    pw, ph = page.rect.width, page.rect.height

    # 6 baris field: label + value
    rows = [
        ("MKS S.O No.", so_data.get("so_no", "")),
        ("P/O No.",     so_data.get("po_no", "")),
        ("Qty",         so_data.get("qty", "")),
        ("Customer",    so_data.get("customer", "")),
        ("Received",    so_data.get("received_date", "")),
        ("Due Date",    so_data.get("due_date", "")),
    ]

    # Iter 21 — Auto-fit width berdasarkan konten (fontsize 6pt, ~3.5 pt/char)
    # min 80, max 200 px. Label column fixed 40, value column dinamis.
    label_col_w = 42
    max_val_chars = max((len(str(v)) for _, v in rows), default=0)
    val_col_w = max(30, min(150, max_val_chars * 3.4 + 8))
    box_w = int(label_col_w + val_col_w + 8)
    box_w = max(80, min(200, box_w))
    box_h = 90
    if "x" in so_data and "y" in so_data:
        cx = float(so_data["x"]) * pw
        cy = float(so_data["y"]) * ph
        x0 = max(10, min(pw - box_w - 10, cx - box_w / 2))
        y0 = max(10, min(ph - box_h - 10, cy - box_h / 2))
    else:
        x0 = pw - box_w - 25
        y0 = 90
    rect = fitz.Rect(x0, y0, x0 + box_w, y0 + box_h)
    page.draw_rect(rect, color=RED_INK, width=1.3)
    inner = fitz.Rect(x0 + 2, y0 + 2, x0 + box_w - 2, y0 + box_h - 2)
    page.draw_rect(inner, color=RED_INK, width=0.4)

    y = y0 + 12
    for label, val in rows:
        page.insert_text((x0 + 4, y), f"{label}", fontsize=6, fontname="hebo", color=RED_INK)
        page.insert_text((x0 + label_col_w, y), f": {val or ''}", fontsize=6, fontname="helv", color=RED_INK)
        y += 12
    # Audit line di luar kotak
    name = so_data.get("name") or so_data.get("username") or ""
    if name:
        page.insert_text((x0, y0 + box_h + 9),
                         f"SO by: {name} · {_fmt_datetime(so_data.get('at', ''))}",
                         fontsize=5.5, fontname="helv", color=(0.3, 0.3, 0.3))


def _draw_placed_signature(
    page: fitz.Page,
    approval: dict,
    signature_png_bytes: Optional[bytes],
) -> None:
    """Iter 18 — Approval TTD dengan posisi custom yang dipilih approver di UI.

    Butuh approval punya field:
        x, y (0..1 relative), size ('S'|'M'|'L'), stage, name, at, notes
    Kalau signature_png_bytes ada → paste image PNG.
    Selalu tampilkan text tanggal+jam kecil di bawah signature.
    """
    if approval.get("x") is None or approval.get("y") is None:
        return

    pw, ph = page.rect.width, page.rect.height
    size_key = (approval.get("size") or "M").upper()
    # Iter 22 — Ukuran signature diperkecil agar muat di kolom title block yang sempit
    # (kolom TTD asli MKS ~10-15mm × 8-12mm). Menghilangkan tanggal/jam di bawah stamp
    # supaya tidak makan tempat, PNG signature saja.
    dims = {
        "S": (30, 14),   # ~10 × 5 mm — untuk kolom sangat sempit
        "M": (42, 18),   # ~15 × 6 mm — default sesuai kolom title block
        "L": (60, 24),   # ~21 × 8 mm — kalau butuh lebih terlihat
    }
    w, h = dims.get(size_key, dims["M"])
    cx = float(approval["x"]) * pw
    cy = float(approval["y"]) * ph
    x0 = max(2, min(pw - w - 2, cx - w / 2))
    y0 = max(2, min(ph - h - 2, cy - h / 2))
    sig_rect = fitz.Rect(x0, y0, x0 + w, y0 + h)

    is_reject = (approval.get("stage") or "").startswith("reject_")
    if is_reject:
        # Reject → kotak merah tanpa gambar
        page.draw_rect(sig_rect, color=(0.75, 0.15, 0.15), width=1.2)
        page.insert_text((x0 + 2, y0 + 10), "REJECTED",
                         fontsize=9, fontname="hebo", color=(0.75, 0.15, 0.15))
    elif signature_png_bytes:
        try:
            page.insert_image(sig_rect, stream=signature_png_bytes, overlay=True, keep_proportion=True)
        except Exception:
            # Fallback text kalau image gagal load
            page.insert_text((x0 + 2, y0 + h / 2), approval.get("name", "")[:20],
                             fontsize=7, fontname="hebo", color=BLUE_INK)
    else:
        # Tidak ada signature image → text nama saja
        page.insert_text((x0 + 2, y0 + h / 2), approval.get("name", "")[:20],
                         fontsize=8, fontname="hebo", color=BLUE_INK)

    # Iter 22 — Hilangkan tanggal & jam di bawah stamp (user request):
    # "cukup sign png aja tanpa tanggal jam, krn kolom sngt kecil".
    # Info tanggal tetap tersimpan di database & bisa dilihat di Riwayat TTD Saya.



def _draw_approval_sig(page: fitz.Page, approval: dict, x0: float, y0: float) -> None:
    """Satu kotak digital signature approval — text APPROVED + nama + role + tanggal.
    Digunakan sebagai FALLBACK STRIP di bagian bawah halaman untuk approval yang
    TIDAK memiliki posisi x/y custom (mis. approval lama sebelum Iter 18)."""
    box_w, box_h = 110, 55
    rect = fitz.Rect(x0, y0, x0 + box_w, y0 + box_h)
    is_reject = (approval.get("stage") or "").startswith("reject_")
    color = (0.75, 0.15, 0.15) if is_reject else GREEN_INK
    page.draw_rect(rect, color=color, width=1.2)
    stage_label = {
        "eng_head": "ENG HEAD REVIEW",
        "qc": "QC CHECK",
        "sales": "SALES APPROVAL",
        "submit": "SUBMITTED",
    }.get(approval.get("stage"), (approval.get("stage") or "").upper())
    if is_reject:
        stage_label = "REJECTED"

    # Header stage
    page.insert_text((x0 + 4, y0 + 11), stage_label,
                     fontsize=7, fontname="hebo", color=color)
    # APPROVED / REJECTED besar
    page.insert_text((x0 + 4, y0 + 26),
                     "APPROVED" if not is_reject else "REJECTED",
                     fontsize=11, fontname="hebo", color=color)
    # Nama
    name = (approval.get("name") or "")[:18]
    page.insert_text((x0 + 4, y0 + 38), name,
                     fontsize=8, fontname="helv", color=(0.1, 0.1, 0.1))
    # Tanggal
    page.insert_text((x0 + 4, y0 + 50),
                     _fmt_datetime(approval.get("at", "")),
                     fontsize=6.5, fontname="helv", color=(0.35, 0.35, 0.35))


def _draw_approval_strip(page: fitz.Page, approvals: List[dict]) -> None:
    """Strip approval di bawah halaman — max 4 kotak (submit / eng_head / qc / sales)."""
    # Filter hanya yang bukan reject, ambil unique stage terakhir
    latest_per_stage = {}
    for a in approvals:
        st = a.get("stage")
        if not st or st.startswith("reject_"):
            continue
        latest_per_stage[st] = a
    order = ["submit", "eng_head", "qc", "sales"]
    stamps = [latest_per_stage[s] for s in order if s in latest_per_stage]
    if not stamps:
        return
    pw, ph = page.rect.width, page.rect.height
    strip_h = 65
    y0 = ph - strip_h - 20
    box_w = 110
    gap = 8
    total_w = len(stamps) * box_w + (len(stamps) - 1) * gap
    x_start = (pw - total_w) / 2
    # Label kecil
    page.insert_text((x_start, y0 - 5),
                     "DIGITAL APPROVAL SIGNATURES",
                     fontsize=6.5, fontname="hebo", color=(0.4, 0.4, 0.4))
    for i, a in enumerate(stamps):
        _draw_approval_sig(page, a, x_start + i * (box_w + gap), y0)


def _draw_watermark(page: fitz.Page, text: str = "UNCONTROLLED COPY WHEN PRINTED") -> None:
    """Watermark diagonal minimal — Iter 20:
    - 2 baris diagonal (kiri-atas & kanan-bawah) supaya jelas ada watermark tapi tidak menutupi
    - Opacity SANGAT rendah (0.14) supaya drawing terbaca jelas
    - Warna gray 0.88 (hampir putih) — mata tetap tangkap tapi tidak ganggu
    """
    pw, ph = page.rect.width, page.rect.height
    fontsize = min(pw, ph) / 28  # font size kecil
    watermark_color = (0.72, 0.72, 0.76)   # sedikit lebih gelap dari sebelumnya (0.88)
    opacity = 0.20                          # 20% (user preference)

    text_len = len(text) * fontsize * 0.42
    # 2 posisi diagonal: 1/3 & 2/3 halaman (tersebar rapi tapi tidak menumpuk)
    positions = [
        (pw * 0.33, ph * 0.33),
        (pw * 0.67, ph * 0.67),
    ]
    for (cx, cy) in positions:
        tw = fitz.TextWriter(page.rect, color=watermark_color, opacity=opacity)
        tw.append(fitz.Point(cx - text_len / 2, cy), text, fontsize=fontsize, font=fitz.Font("hebo"))
        tw.write_text(page, morph=(fitz.Point(cx, cy), fitz.Matrix(-30)))


def _draw_print_footer(page: fitz.Page, printed_by: str, printed_at: str = "") -> None:
    """Footer kecil di bawah setiap halaman: 'Printed by: X | Date | Time'."""
    if not printed_at:
        printed_at = datetime.now().strftime("%d %B %Y | %H:%M")
    text = f"Printed by: {printed_by} | {printed_at}"
    pw, ph = page.rect.width, page.rect.height
    page.insert_text(
        (25, ph - 8),
        text,
        fontsize=7, fontname="helv", color=(0.3, 0.3, 0.3),
    )


def _stamp_on_page(stamp: dict, pnum: int) -> bool:
    """Tentukan apakah stamp/signature digambar di halaman `pnum`.

    Aturan:
      - Tidak ada key 'page' (None)           → SEMUA halaman (default).
      - 'page' < 0 (mis. -1 = "all pages")    → SEMUA halaman.
      - 'page' >= 0                            → hanya halaman itu.
    """
    pg = (stamp or {}).get("page")
    if pg is None:
        return True
    try:
        pg = int(pg)
    except (TypeError, ValueError):
        return True
    return pg < 0 or pg == pnum


def apply_stamps(
    pdf_bytes: bytes,
    approvals: Optional[List[dict]] = None,
    dc_stamp: Optional[dict] = None,
    watermark_uncontrolled: bool = False,
    printed_by: str = "",
    signature_bytes_map: Optional[dict] = None,
    so_stamp: Optional[dict] = None,
) -> bytes:
    """Load original PDF, overlay stamps, return stamped PDF bytes.

    signature_bytes_map: dict {user_id: PNG bytes} — untuk render signature image
        approver di posisi custom x,y yang mereka pilih. Kalau None → cuma text stamp.
    """
    signature_bytes_map = signature_bytes_map or {}
    approvals = approvals or []
    # Pisah approval dengan posisi custom vs fallback (no position)
    placed = [a for a in approvals if a.get("x") is not None and a.get("y") is not None and not (a.get("stage") or "").startswith("reject_")]
    fallback = [a for a in approvals if a.get("x") is None or a.get("y") is None]

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for pnum, page in enumerate(doc):
        # 1. Render placed signatures.
        #    page = -1 → SEMUA halaman; page None → halaman 0 (perilaku lama); selain itu halaman terpilih.
        for appr in placed:
            ap = appr.get("page")
            try:
                ap_int = 0 if ap is None else int(ap)
            except (TypeError, ValueError):
                ap_int = 0
            if ap_int < 0 or ap_int == pnum:
                sig_bytes = signature_bytes_map.get(appr.get("user_id"))
                _draw_placed_signature(page, appr, sig_bytes)

        # 2. DC stamp — default SEMUA halaman (PDF multi-halaman wajib di-stamp tiap halaman).
        #    Kalau dc_stamp punya 'page' >= 0 → hanya halaman itu.
        if dc_stamp and _stamp_on_page(dc_stamp, pnum):
            _draw_dc_stamp(page, dc_stamp)
        # 2b. SO stamp untuk Produksi — default SEMUA halaman.
        if so_stamp and _stamp_on_page(so_stamp, pnum):
            _draw_so_stamp(page, so_stamp)
        # 3. Fallback strip di halaman 1 untuk approval tanpa posisi custom
        if pnum == 0 and fallback:
            _draw_approval_strip(page, fallback)

        # 4. Watermark di semua halaman (kalau uncontrolled)
        if watermark_uncontrolled:
            _draw_watermark(page)
        # 5. Print footer
        if printed_by:
            _draw_print_footer(page, printed_by)
    out = io.BytesIO()
    doc.save(out, deflate=True)
    doc.close()
    return out.getvalue()
