"""PT MKS Material Incoming Inspection (MII) PDF — MKS-F-QAD-002 REV 03.

Fixed ISO-registered layout. Uses the same letterhead as other MKS forms.
"""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
LETTERHEAD_PATH = os.path.join(ASSETS_DIR, "letterhead.png")

# Landscape orientation matches original XLS layout better (wide table)
PAGE_W, PAGE_H = landscape(A4)


def _register_fonts():
    try:
        pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("Body-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        return "Body", "Body-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def _draw_letterhead(c: canvas.Canvas):
    """Draw a small logo/badge top-left; letterhead PNG is A4 portrait so we crop-fit."""
    if os.path.exists(LETTERHEAD_PATH):
        # Show only the top strip of the letterhead — logo + company name area
        try:
            from reportlab.lib.utils import ImageReader
            img = ImageReader(LETTERHEAD_PATH)
            # place top-left, sized ~ 55x14 mm
            c.drawImage(img, 8 * mm, PAGE_H - 24 * mm, width=60 * mm, height=18 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass


def _fmt_date(iso_str: Optional[str]) -> str:
    if not iso_str:
        return ""
    try:
        d = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return d.strftime("%d %b %Y")
    except Exception:
        return str(iso_str)[:10]


def _checkbox(c: canvas.Canvas, x: float, y: float, size: float = 3, checked: bool = False):
    c.setLineWidth(0.6)
    c.setStrokeColor(black)
    c.setFillColor(white)
    c.rect(x, y, size * mm, size * mm, stroke=1, fill=1)
    if checked:
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 0.3 * mm, y + 0.4 * mm, "X")


def build_mii_pdf(inspection: dict) -> bytes:
    body_font, bold_font = _register_fonts()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))

    _draw_letterhead(c)

    # Company name box top-left (like the Excel)
    c.setStrokeColor(black)
    c.setLineWidth(0.7)
    c.rect(70 * mm, PAGE_H - 20 * mm, 60 * mm, 8 * mm, stroke=1, fill=0)
    c.setFillColor(black)
    c.setFont(bold_font, 9)
    c.drawCentredString(100 * mm, PAGE_H - 15 * mm, "PT. MITRA KARYA SARANA")

    # Title
    c.setFont(bold_font, 16)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 30 * mm, "MATERIAL INCOMING INSPECTION")

    # Header — Supplier / Customer checkbox row
    src_is_supplier = (inspection.get("source_type") == "supplier")
    src_is_customer = (inspection.get("source_type") == "customer")
    source_name = inspection.get("source_name", "")
    do_no = inspection.get("do_no", "")
    date_str = _fmt_date(inspection.get("inspection_date") or inspection.get("receive_date"))

    top_y = PAGE_H - 40 * mm
    c.setFont(body_font, 9)

    # Row 1: Supplier Name (checkbox + line) + DO No
    _checkbox(c, 10 * mm, top_y, 3, checked=src_is_supplier)
    c.drawString(14 * mm, top_y + 0.3 * mm, "Supplier Name:")
    c.line(38 * mm, top_y, 130 * mm, top_y)
    if src_is_supplier and source_name:
        c.drawString(40 * mm, top_y + 0.5 * mm, source_name)

    c.drawString(150 * mm, top_y + 0.3 * mm, "DO. No.:")
    c.line(165 * mm, top_y, 240 * mm, top_y)
    if do_no:
        c.drawString(167 * mm, top_y + 0.5 * mm, do_no)

    # Row 2: Supplied by Customer (checkbox + line) + Date
    row2_y = top_y - 6 * mm
    _checkbox(c, 10 * mm, row2_y, 3, checked=src_is_customer)
    c.drawString(14 * mm, row2_y + 0.3 * mm, "Supplied by Customer:")
    c.line(48 * mm, row2_y, 130 * mm, row2_y)
    if src_is_customer and source_name:
        c.drawString(50 * mm, row2_y + 0.5 * mm, source_name)

    c.drawString(200 * mm, row2_y + 0.3 * mm, "Date:")
    c.line(210 * mm, row2_y, 280 * mm, row2_y)
    if date_str:
        c.drawString(212 * mm, row2_y + 0.5 * mm, date_str)

    # ================= TABLE =================
    # Columns (mm):
    # NO | SO.NO | BATCH/GRADE/HEAT | MILL CERT/EDS | DESCRIPTION | QTY | IQC INSPECTION (DIMENTION[SPEC|ACTUAL], VISUAL) | RESULT (OK|NG) | REMARK
    col_widths = [10, 18, 30, 26, 55, 14, 20, 20, 25, 14, 14, 40]
    # 0=NO 1=SO 2=BATCH 3=MILL 4=DESC 5=QTY 6=DIM_SPEC 7=DIM_ACTUAL 8=VISUAL 9=OK 10=NG 11=REMARK
    left_x = 8 * mm
    xs = [left_x]
    for w in col_widths:
        xs.append(xs[-1] + w * mm)

    table_top_y = row2_y - 6 * mm  # top of table header block
    header_h = 12 * mm  # 2 header rows
    row_h = 10 * mm

    # Header background
    c.setFillColor(HexColor("#E5E7EB"))
    c.rect(xs[0], table_top_y - header_h, xs[-1] - xs[0], header_h, stroke=0, fill=1)
    c.setFillColor(black)
    c.setStrokeColor(black)
    c.setLineWidth(0.4)

    # Draw header cells (main headers span both rows for single-line columns)
    def cell_text(x1, x2, y1, y2, text, font_size=8, bold=True):
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2 - font_size * 0.35 / 2.5
        c.setFont(bold_font if bold else body_font, font_size)
        # crude wrap: split by \n
        lines = str(text).split("\n")
        line_h = font_size + 1
        start_y = cy + (len(lines) - 1) * line_h / 2
        for i, ln in enumerate(lines):
            c.drawCentredString(cx, start_y - i * line_h, ln)

    # Grid header outlines
    # Row 1 top y = table_top_y  ; Row 2 top y = table_top_y - 6*mm
    y_hdr_top = table_top_y
    y_hdr_mid = table_top_y - 6 * mm
    y_hdr_bot = table_top_y - header_h

    # Draw header vertical lines
    for i in range(len(xs)):
        c.line(xs[i], y_hdr_top, xs[i], y_hdr_bot)
    c.line(xs[0], y_hdr_top, xs[-1], y_hdr_top)
    c.line(xs[0], y_hdr_bot, xs[-1], y_hdr_bot)

    # Full-height columns: 0 (NO), 1 (SO), 2 (BATCH), 3 (MILL), 4 (DESC), 5 (QTY), 11 (REMARK)
    for i, label in [(0, "NO."), (1, "SO. NO."), (2, "BATCH No.#/GRADE\nMAT'L/Heat No.#"),
                     (3, "MILL CERT/ EDS\nNO."), (4, "DESCRIPTION OF PART"),
                     (5, "QTY"), (11, "REMARK")]:
        cell_text(xs[i], xs[i+1], y_hdr_bot, y_hdr_top, label, font_size=7.5)

    # IQC INSPECTION RESULT (cols 6..8) — top row spans 6-8, bottom row has DIMENTION(sub 6-7) + VISUAL(8)
    c.line(xs[6], y_hdr_mid, xs[9], y_hdr_mid)   # mid split for IQC
    cell_text(xs[6], xs[9], y_hdr_mid, y_hdr_top, "IQC INSPECTION RESULT", font_size=7.5)
    # sub-header: DIMENTION spans 6-7
    c.line(xs[8], y_hdr_mid, xs[8], y_hdr_bot)  # separator between DIMENTION section and VISUAL
    # Actually we need DIMENTION span 6-8 (2 sub cols), VISUAL = col 8
    # Sub-row split for DIMENTION between spec/actual: dividing line already at xs[7]
    cell_text(xs[6], xs[8], y_hdr_mid - 3 * mm, y_hdr_mid, "DIMENTION", font_size=7)
    cell_text(xs[6], xs[7], y_hdr_bot, y_hdr_mid - 3 * mm, "SPEC", font_size=6.5)
    cell_text(xs[7], xs[8], y_hdr_bot, y_hdr_mid - 3 * mm, "ACTUAL", font_size=6.5)
    # Extra horizontal line for DIMENTION/SPEC-ACTUAL sub-header
    c.line(xs[6], y_hdr_mid - 3 * mm, xs[8], y_hdr_mid - 3 * mm)
    cell_text(xs[8], xs[9], y_hdr_bot, y_hdr_mid, "VISUAL", font_size=7)

    # RESULT (cols 9..10) — top row spans 9-10, bottom row OK / NG
    c.line(xs[9], y_hdr_mid, xs[11], y_hdr_mid)
    cell_text(xs[9], xs[11], y_hdr_mid, y_hdr_top, "RESULT", font_size=7.5)
    cell_text(xs[9], xs[10], y_hdr_bot, y_hdr_mid, "OK", font_size=7)
    cell_text(xs[10], xs[11], y_hdr_bot, y_hdr_mid, "NG", font_size=7)

    # ============ Data rows ============
    items = inspection.get("items", []) or []
    # Enforce at least 10 rows for form-like look
    min_rows = max(10, len(items))

    def draw_row_grid(y_top: float, y_bot: float):
        c.line(xs[0], y_bot, xs[-1], y_bot)
        for i in range(len(xs)):
            c.line(xs[i], y_top, xs[i], y_bot)

    style_cell = ParagraphStyle("cell", fontName=body_font, fontSize=7.5, leading=9, alignment=TA_LEFT)
    y_row_top = y_hdr_bot
    for i in range(min_rows):
        y_row_bot = y_row_top - row_h
        draw_row_grid(y_row_top, y_row_bot)
        it = items[i] if i < len(items) else None
        if it:
            # NO
            c.setFont(body_font, 8)
            c.drawCentredString((xs[0] + xs[1]) / 2, y_row_bot + 3.5 * mm, str(it.get("no", i + 1)))
            # SO
            c.drawCentredString((xs[1] + xs[2]) / 2, y_row_bot + 3.5 * mm, str(it.get("so_no", "")))
            # BATCH
            _draw_wrapped(c, str(it.get("batch_grade_heat", "")), xs[2] + 1 * mm, y_row_top - 1 * mm, xs[3] - xs[2] - 2 * mm, style_cell)
            # MILL
            _draw_wrapped(c, str(it.get("mill_cert_no", "")), xs[3] + 1 * mm, y_row_top - 1 * mm, xs[4] - xs[3] - 2 * mm, style_cell)
            # DESC
            _draw_wrapped(c, str(it.get("description", "")), xs[4] + 1 * mm, y_row_top - 1 * mm, xs[5] - xs[4] - 2 * mm, style_cell)
            # QTY
            qty = it.get("qty", 0)
            unit = it.get("unit", "")
            c.setFont(body_font, 8)
            c.drawCentredString((xs[5] + xs[6]) / 2, y_row_bot + 3.5 * mm, f"{qty:g} {unit}")
            # DIM SPEC
            _draw_wrapped(c, str(it.get("dimension_spec", "")), xs[6] + 1 * mm, y_row_top - 1 * mm, xs[7] - xs[6] - 2 * mm, style_cell)
            # DIM ACTUAL
            _draw_wrapped(c, str(it.get("dimension_actual", "")), xs[7] + 1 * mm, y_row_top - 1 * mm, xs[8] - xs[7] - 2 * mm, style_cell)
            # VISUAL
            _draw_wrapped(c, str(it.get("visual", "")), xs[8] + 1 * mm, y_row_top - 1 * mm, xs[9] - xs[8] - 2 * mm, style_cell)
            # OK / NG check
            result = str(it.get("result", "")).lower()
            _checkbox(c, xs[9] + 3 * mm, y_row_bot + 3 * mm, 3, checked=(result == "ok"))
            _checkbox(c, xs[10] + 3 * mm, y_row_bot + 3 * mm, 3, checked=(result == "ng"))
            # REMARK
            _draw_wrapped(c, str(it.get("remark", "")), xs[11] + 1 * mm, y_row_top - 1 * mm, xs[12] - xs[11] - 2 * mm, style_cell)
        y_row_top = y_row_bot

    # ============ Footer ============
    footer_y = y_row_top - 8 * mm
    c.setFont(body_font, 7.5)
    c.drawString(xs[0], footer_y, "Note  : Visual = Check of Appearance  (Dent, Damage, Scratch, Colour)")

    # Signatures
    sig_y = footer_y - 20 * mm
    c.setFont(body_font, 9)
    c.drawString(xs[6], sig_y, "Inspected by,")
    c.drawString(xs[10], sig_y, "Verified by,")

    inspector = inspection.get("inspector_name") or ""
    leader = inspection.get("leader_name") or ""
    c.setFont(body_font, 9)
    c.line(xs[6], sig_y - 15 * mm, xs[6] + 45 * mm, sig_y - 15 * mm)
    c.line(xs[10], sig_y - 15 * mm, xs[10] + 45 * mm, sig_y - 15 * mm)
    c.setFont(bold_font, 8)
    c.drawString(xs[6], sig_y - 18 * mm, f"QC Inspector  {inspector}")
    c.drawString(xs[10], sig_y - 18 * mm, f"QC Leader     {leader}")

    # Doc ID footer
    c.setFont(body_font, 6.5)
    c.setFillColor(HexColor("#64748B"))
    c.drawString(xs[0], 5 * mm, f"MKS-F-QAD-002 REV 03 · Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · MII#{(inspection.get('id') or '')[:8]}")

    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_wrapped(c: canvas.Canvas, text: str, x: float, y_top: float, width_mm: float, style):
    """Draw wrapped text in cell. y_top is the top of the cell (going down)."""
    if not text:
        return
    try:
        para = Paragraph(str(text).replace("\n", "<br/>"), style)
        pw, ph = para.wrap(width_mm, 40 * mm)
        para.drawOn(c, x, y_top - ph - 1 * mm)
    except Exception:
        c.setFont("Helvetica", 7.5)
        c.drawString(x, y_top - 4 * mm, str(text)[:40])
