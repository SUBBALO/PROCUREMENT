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
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from bson import ObjectId
import fitz  # PyMuPDF

# Warna cap tinta
RED_INK = (0.85, 0.15, 0.30)     # merah/pink seperti cap manual MKS
BLUE_INK = (0.10, 0.30, 0.65)    # biru untuk digital signature engineering
GREEN_INK = (0.15, 0.55, 0.30)   # hijau untuk approved signature

WIB = timezone(timedelta(hours=7))  # Waktu Indonesia Barat (Kepri/UTC+7)


def _fmt_print_dt_wib(iso_str: str = "") -> str:
    """Format waktu print: 'DD MMM YY | hh.mm AM/PM' dalam WIB (UTC+7).
    Kosong → pakai waktu sekarang (server)."""
    try:
        if iso_str:
            dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)
        dt = dt.astimezone(WIB)
        return dt.strftime("%d %b %y | %I.%M %p")
    except Exception:
        return datetime.now(WIB).strftime("%d %b %y | %I.%M %p")


def _text_w(text: str, fontname: str, fontsize: float) -> float:
    try:
        return fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)
    except Exception:
        return len(text) * fontsize * 0.5


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
    cx = x0 + box_w / 2
    # "MKS" — center
    page.insert_text(
        (cx - _text_w("MKS", "helv", 11) / 2, y0 + 16),
        "MKS", fontsize=11, fontname="helv", color=RED_INK,
    )
    # Tanggal — center
    date_str = _fmt_date(dc_data.get("at", ""))
    if date_str:
        page.insert_text(
            (cx - _text_w(date_str, "helv", 6.5) / 2, y0 + 29),
            date_str, fontsize=6.5, fontname="helv", color=RED_INK,
        )
    # Footer "DOCUMENT CONTROL" — center
    page.insert_text(
        (cx - _text_w("DOCUMENT CONTROL", "hebo", 4.6) / 2, y0 + box_h - 6),
        "DOCUMENT CONTROL", fontsize=4.6, fontname="hebo", color=RED_INK,
    )
    # (Caption 'by: nama · tgl' DIHILANGKAN sesuai permintaan — jejak audit tetap di DB & footer print)


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
    # Tinggi kotak menyesuaikan jumlah baris (buang ruang kosong di bawah Due Date)
    row_h = 11
    box_h = int(len(rows) * row_h + 12)
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

    y = y0 + 13
    for label, val in rows:
        page.insert_text((x0 + 4, y), f"{label}", fontsize=6, fontname="hebo", color=RED_INK)
        page.insert_text((x0 + label_col_w, y), f": {val or ''}", fontsize=6, fontname="helv", color=RED_INK)
        y += row_h
    # (Caption 'SO by: nama · tgl' DIHILANGKAN sesuai permintaan)


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



def _draw_approval_sig(page: fitz.Page, approval: dict, x0: float, y0: float,
                       sig_bytes: Optional[bytes] = None) -> None:
    """Satu kotak digital signature approval — stage + GAMBAR TTD (bila ada) + nama + tanggal.
    Digunakan sebagai FALLBACK STRIP di bagian bawah halaman untuk approval yang
    TIDAK memiliki posisi x/y custom. Bila user punya gambar TTD → dirender agar
    tanda tangan benar-benar TERBACA (bukan sekadar teks APPROVED)."""
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
    page.insert_text((x0 + 4, y0 + 10), stage_label,
                     fontsize=7, fontname="hebo", color=color)
    # Area tengah: GAMBAR TTD bila tersedia, jika tidak → teks APPROVED/REJECTED
    if sig_bytes and not is_reject:
        try:
            sig_rect = fitz.Rect(x0 + 4, y0 + 12, x0 + box_w - 4, y0 + 33)
            page.insert_image(sig_rect, stream=sig_bytes, keep_proportion=True, overlay=True)
        except Exception:
            page.insert_text((x0 + 4, y0 + 26), "APPROVED",
                             fontsize=11, fontname="hebo", color=color)
    else:
        page.insert_text((x0 + 4, y0 + 26),
                         "APPROVED" if not is_reject else "REJECTED",
                         fontsize=11, fontname="hebo", color=color)
    # Nama
    name = (approval.get("name") or "")[:18]
    page.insert_text((x0 + 4, y0 + 43), name,
                     fontsize=8, fontname="helv", color=(0.1, 0.1, 0.1))
    # Tanggal
    page.insert_text((x0 + 4, y0 + 52),
                     _fmt_datetime(approval.get("at", "")),
                     fontsize=6.5, fontname="helv", color=(0.35, 0.35, 0.35))


def _draw_approval_strip(page: fitz.Page, approvals: List[dict],
                         signature_bytes_map: Optional[dict] = None) -> None:
    """Strip approval di bawah halaman — max 4 kotak (submit / eng_head / qc / sales)."""
    signature_bytes_map = signature_bytes_map or {}
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
        _draw_approval_sig(page, a, x_start + i * (box_w + gap), y0,
                           sig_bytes=signature_bytes_map.get(a.get("user_id")))


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
    """Footer kecil (jejak print) di bawah halaman: 'Printed by: X | DD MMM YY | hh.mm AM/PM' (WIB)."""
    stamp = printed_at if printed_at else _fmt_print_dt_wib()
    text = f"Printed by: {printed_by} | {stamp} WIB"
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
    # Pisah approval dengan posisi custom vs fallback (no position).
    # Iter 40 — dukung `placements`: list [{page,x,y,size?}] agar tiap halaman bisa beda posisi.
    def _has_pos(a: dict) -> bool:
        if a.get("placements"):
            return True
        return a.get("x") is not None and a.get("y") is not None
    placed = [a for a in approvals if _has_pos(a) and not (a.get("stage") or "").startswith("reject_")]
    # Reject tetap digambar sebagai kotak (punya posisi atau placements)
    placed += [a for a in approvals if _has_pos(a) and (a.get("stage") or "").startswith("reject_")]
    fallback = [a for a in approvals if not _has_pos(a)]

    def _placements_for(obj: dict):
        """Balikkan list placement untuk sebuah stamp/approval.
        - Kalau ada `placements` → pakai itu.
        - Kalau tidak → satu placement dari x/y/page/size legacy.
        """
        pls = obj.get("placements")
        if pls:
            out = []
            for pl in pls:
                if pl is None:
                    continue
                out.append({
                    "page": pl.get("page"),
                    "x": pl.get("x"),
                    "y": pl.get("y"),
                    "size": pl.get("size") or obj.get("size"),
                })
            return out
        return [{
            "page": obj.get("page"),
            "x": obj.get("x"),
            "y": obj.get("y"),
            "size": obj.get("size"),
        }]

    def _pl_on_page(pl: dict, pnum: int) -> bool:
        pg = pl.get("page")
        if pg is None:
            return True
        try:
            pg = int(pg)
        except (TypeError, ValueError):
            return True
        return pg < 0 or pg == pnum

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for pnum, page in enumerate(doc):
        # 1. Render placed signatures — dukung posisi berbeda tiap halaman via placements.
        for appr in placed:
            sig_bytes = signature_bytes_map.get(appr.get("user_id"))
            for pl in _placements_for(appr):
                if pl.get("x") is None or pl.get("y") is None:
                    continue
                if _pl_on_page(pl, pnum):
                    merged = {**appr, "x": pl.get("x"), "y": pl.get("y"), "size": pl.get("size") or appr.get("size")}
                    _draw_placed_signature(page, merged, sig_bytes)

        # 2. DC stamp — dukung placements per halaman; default SEMUA halaman.
        if dc_stamp:
            for pl in _placements_for(dc_stamp):
                if _pl_on_page(pl, pnum):
                    if pl.get("x") is not None and pl.get("y") is not None:
                        _draw_dc_stamp(page, {**dc_stamp, "x": pl.get("x"), "y": pl.get("y")})
                    else:
                        _draw_dc_stamp(page, {k: v for k, v in dc_stamp.items() if k not in ("x", "y")})
        # 2b. SO stamp untuk Produksi — dukung placements per halaman; default SEMUA halaman.
        if so_stamp:
            for pl in _placements_for(so_stamp):
                if _pl_on_page(pl, pnum):
                    if pl.get("x") is not None and pl.get("y") is not None:
                        _draw_so_stamp(page, {**so_stamp, "x": pl.get("x"), "y": pl.get("y")})
                    else:
                        _draw_so_stamp(page, {k: v for k, v in so_stamp.items() if k not in ("x", "y")})
        # 3. Fallback strip di halaman 1 untuk approval tanpa posisi custom
        if pnum == 0 and fallback:
            _draw_approval_strip(page, [a for a in fallback if not (a.get("stage") or "").startswith("reject_")],
                                 signature_bytes_map=signature_bytes_map)

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



# ============================================================================
# OBSOLETE overlay — dipakai Controlled Document Register saat dokumen direvisi.
# Versi lama otomatis diberi cap "OBSOLETE" merah diagonal (view-only).
# ============================================================================
def _draw_obsolete(page: "fitz.Page", text: str = "OBSOLETE") -> None:
    pw, ph = page.rect.width, page.rect.height
    fontsize = min(pw, ph) / 7
    text_len = len(text) * fontsize * 0.55
    cx, cy = pw / 2, ph / 2
    tw = fitz.TextWriter(page.rect, color=(0.80, 0.12, 0.12), opacity=0.30)
    tw.append(fitz.Point(cx - text_len / 2, cy), text, fontsize=fontsize, font=fitz.Font("hebo"))
    tw.write_text(page, morph=(fitz.Point(cx, cy), fitz.Matrix(-35)))


def apply_obsolete(pdf_bytes: bytes, text: str = "OBSOLETE") -> bytes:
    """Overlay cap OBSOLETE merah diagonal di semua halaman."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page in doc:
        _draw_obsolete(page, text)
    out = io.BytesIO()
    doc.save(out, deflate=True)
    doc.close()
    return out.getvalue()


def _draw_obsolete_stamp_at(page: "fitz.Page", xrel: float, yrel: float, text: str = "OBSOLETE") -> None:
    """Cap OBSOLETE berbentuk kotak merah pada posisi (relatif) yang dipilih user —
    mirip stamp Controlled (bukan watermark penuh halaman)."""
    pw, ph = page.rect.width, page.rect.height
    w = pw * 0.22
    h = w * 0.34
    cx = max(w / 2, min(pw - w / 2, xrel * pw))
    cy = max(h / 2, min(ph - h / 2, yrel * ph))
    rect = fitz.Rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    red = (0.80, 0.12, 0.12)
    # kotak + garis tepi ganda
    page.draw_rect(rect, color=red, width=2.2)
    page.draw_rect(rect + (3, 3, -3, -3), color=red, width=0.8)
    # teks OBSOLETE di tengah
    fs = h * 0.42
    tw = fitz.TextWriter(page.rect, color=red)
    tlen = len(text) * fs * 0.58
    tw.append(fitz.Point(cx - tlen / 2, cy + fs * 0.35), text, fontsize=fs, font=fitz.Font("hebo"))
    tw.write_text(page)


def apply_obsolete_at(pdf_bytes: bytes, page_index=None, x: float = 0.5, y: float = 0.5, text: str = "OBSOLETE") -> bytes:
    """Overlay cap OBSOLETE berposisi. page_index None/<0 = semua halaman."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for i, page in enumerate(doc):
        if page_index is None or page_index < 0 or page_index == i:
            _draw_obsolete_stamp_at(page, x, y, text)
    out = io.BytesIO()
    doc.save(out, deflate=True)
    doc.close()
    return out.getvalue()
