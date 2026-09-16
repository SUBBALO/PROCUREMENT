"""PT MKS Quotation PDF Generator.

Renders a Quotation into an A4 PDF using the official kop-surat template
(/app/backend/assets/letterhead.png) as page background, mirroring the layout
of the reference Excel template.
"""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY

try:
    from num2words import num2words
except Exception:  # pragma: no cover
    num2words = None  # type: ignore

ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
LETTERHEAD_PATH = os.path.join(ASSETS_DIR, "letterhead.png")

# Page geometry — A4 portrait
PAGE_W, PAGE_H = A4
TOP_HEADER_MM = 32          # kop-surat header height reserved
BOTTOM_MARGIN_MM = 15
LEFT_MARGIN_MM = 15
RIGHT_MARGIN_MM = 15

CUR_SYMBOL = {"IDR": "Rp", "USD": "$", "SGD": "S$", "EUR": "€", "MYR": "RM"}


def _fmt_money(v: float | int | None, currency: str = "IDR") -> str:
    if v is None:
        v = 0
    try:
        f = float(v)
    except Exception:
        return "-"
    if currency == "IDR":
        return f"{f:,.0f}".replace(",", ".")
    return f"{f:,.2f}"


def _in_words(amount: float | int, currency: str = "IDR", lang: str = "en") -> str:
    if num2words is None:
        return ""
    try:
        n = int(round(float(amount)))
    except Exception:
        return ""
    # Prefer English + currency name; num2words has lang="id" for Indonesian
    lc = "id" if lang == "id" else "en"
    try:
        words = num2words(n, lang=lc)
    except Exception:
        return ""
    cur_label_en = {"IDR": "Rupiah", "USD": "US Dollar", "SGD": "Singapore Dollar", "EUR": "Euro", "MYR": "Malaysian Ringgit"}
    cur_label_id = {"IDR": "Rupiah", "USD": "Dollar Amerika", "SGD": "Dollar Singapura", "EUR": "Euro", "MYR": "Ringgit Malaysia"}
    label = (cur_label_id if lang == "id" else cur_label_en).get(currency, currency)
    only = "Saja" if lang == "id" else "Only"
    return f"{words.title()} {label} {only} #"


def _draw_letterhead(c: canvas.Canvas):
    """Draw kop surat PNG spanning full page as background."""
    if os.path.exists(LETTERHEAD_PATH):
        c.drawImage(LETTERHEAD_PATH, 0, 0, width=PAGE_W, height=PAGE_H,
                    preserveAspectRatio=True, mask="auto")


def _register_fonts():
    """Try to use DejaVu (Unicode-safe). Fallback to Helvetica."""
    try:
        pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("Body-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        return "Body", "Body-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def build_quotation_pdf(quo: dict) -> bytes:
    """Build a Quotation PDF (bytes) from a quotation document (dict from DB)."""
    _register_fonts()
    body_font = "Body" if "Body" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold_font = "Body-Bold" if "Body-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _draw_letterhead(c)

    currency = (quo.get("currency") or "IDR").upper()
    cur_sym = CUR_SYMBOL.get(currency, currency)

    # ---- Coordinate helpers (measured from top-left, in mm) ----
    def y_from_top(mm_from_top: float) -> float:
        return PAGE_H - mm_from_top * mm

    LX = LEFT_MARGIN_MM * mm            # left x
    RX = (210 - RIGHT_MARGIN_MM) * mm   # right edge

    # ==== 1. Title (CENTERED) ====
    c.setFont(bold_font, 22)
    c.setFillColor(HexColor("#1E293B"))
    y = y_from_top(48)
    page_center_x = (PAGE_W) / 2
    c.drawCentredString(page_center_x, y, "QUOTATION")
    # underline under centered title
    title_w = c.stringWidth("QUOTATION", bold_font, 22)
    c.setStrokeColor(HexColor("#1E293B"))
    c.setLineWidth(0.6)
    c.line(page_center_x - title_w / 2, y - 1.5 * mm, page_center_x + title_w / 2, y - 1.5 * mm)

    # ==== 2. Customer block (left) + Quote meta (right) ====
    c.setFillColor(black)
    c.setFont(bold_font, 10)
    y = y_from_top(58)
    c.drawString(LX, y, quo.get("customer_name") or "-")

    # Address lines
    c.setFont(body_font, 9)
    addr = (quo.get("customer_address") or "").split("\n")
    y_addr = y_from_top(64)
    for i, line in enumerate(addr[:4]):
        if line.strip():
            c.drawString(LX, y_addr - i * 4.2 * mm, line.strip())

    # Right meta
    c.setFont(body_font, 9)
    meta_x = 130 * mm
    quote_no = quo.get("quotation_no") or "-"
    created = quo.get("created_at") or datetime.utcnow().isoformat()
    try:
        d = datetime.fromisoformat(created.replace("Z", "+00:00"))
        date_str = d.strftime("%A, %d %B %Y")
    except Exception:
        date_str = created[:10]
    # Draw labels + colons at fixed x-positions for perfect alignment
    # (proportional font makes padded-string alignment unreliable)
    label_x = meta_x
    colon_x = meta_x + 22 * mm
    value_x = meta_x + 25 * mm
    y1 = y_from_top(58)
    y2 = y_from_top(63)
    y3 = y_from_top(68)
    c.drawString(label_x, y1, "QUOTE NO")
    c.drawString(colon_x, y1, ":")
    c.drawString(value_x, y1, str(quote_no))
    c.drawString(label_x, y2, "QUOTE DATE")
    c.drawString(colon_x, y2, ":")
    c.drawString(value_x, y2, date_str)
    c.drawString(label_x, y3, "Page")
    c.drawString(colon_x, y3, ":")
    c.drawString(value_x, y3, "1~1")

    # ==== 3. Attention + CC (aligned columns) ====
    y_att = y_from_top(88)
    c.setFont(body_font, 9)
    lbl_x = LX
    col_x = LX + 22 * mm
    val_x = LX + 25 * mm
    c.drawString(lbl_x, y_att, "ATTENTION")
    c.drawString(col_x, y_att, ":")
    c.drawString(val_x, y_att, quo.get("attention") or "-")
    c.drawString(lbl_x, y_att - 5 * mm, "CC")
    c.drawString(col_x, y_att - 5 * mm, ":")
    c.drawString(val_x, y_att - 5 * mm, quo.get("cc") or "-")

    # ==== 4. Intro paragraph ====
    intro_style = ParagraphStyle(
        "intro", fontName=body_font, fontSize=9, leading=11, alignment=TA_JUSTIFY, textColor=black,
    )
    intro_text = (
        "Thank you for your inquiry and support to our company. With pleasure, we submit the quotes to your "
        "kind consideration as follows:"
    )
    p = Paragraph(intro_text, intro_style)
    p.wrapOn(c, RX - LX, 20)
    p.drawOn(c, LX, y_from_top(107))

    # ==== 5. Items table ====
    table_top = y_from_top(118)
    row_h = 6 * mm

    # Column widths in mm
    col_no = 10 * mm
    col_desc = 90 * mm
    col_qty = 15 * mm
    col_unit = 12 * mm
    col_price = 30 * mm
    col_amt = 30 * mm
    col_x = [LX,
             LX + col_no,
             LX + col_no + col_desc,
             LX + col_no + col_desc + col_qty,
             LX + col_no + col_desc + col_qty + col_unit,
             LX + col_no + col_desc + col_qty + col_unit + col_price,
             LX + col_no + col_desc + col_qty + col_unit + col_price + col_amt]

    # Header row
    c.setFillColor(HexColor("#1E293B"))
    c.rect(col_x[0], table_top - row_h, col_x[-1] - col_x[0], row_h, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont(bold_font, 8.5)
    headers = ["NO", "DESCRIPTION", "QTY", "UNIT", f"Unit Price ({currency})", f"AMOUNT ({currency})"]
    aligns = ["c", "l", "r", "c", "r", "r"]
    for i, h in enumerate(headers):
        cx = col_x[i] + 1.5 * mm
        cy = table_top - row_h + 1.8 * mm
        if aligns[i] == "c":
            c.drawCentredString((col_x[i] + col_x[i + 1]) / 2, cy, h)
        elif aligns[i] == "r":
            c.drawRightString(col_x[i + 1] - 1.5 * mm, cy, h)
        else:
            c.drawString(cx, cy, h)

    # Rows
    c.setFillColor(black)
    c.setFont(body_font, 9)
    items = quo.get("items") or []
    y_row = table_top - row_h
    subtotal = 0.0
    for idx, it in enumerate(items, 1):
        # Determine row height by wrapping description
        desc = str(it.get("description") or "")
        style = ParagraphStyle("cell", fontName=body_font, fontSize=9, leading=11)
        para = Paragraph(desc.replace("\n", "<br/>"), style)
        pw, ph = para.wrap(col_desc - 3 * mm, 100 * mm)
        this_h = max(row_h, ph + 2 * mm)

        y_row -= this_h
        # Grid
        c.setStrokeColor(HexColor("#94A3B8"))
        c.setLineWidth(0.4)
        c.line(col_x[0], y_row, col_x[-1], y_row)
        for cx_ in col_x:
            c.line(cx_, y_row, cx_, y_row + this_h)

        # No
        c.drawCentredString((col_x[0] + col_x[1]) / 2, y_row + this_h - 4 * mm, str(idx))
        # Description (Paragraph)
        para.drawOn(c, col_x[1] + 1.5 * mm, y_row + this_h - ph - 1 * mm)
        # QTY
        qty = it.get("qty") or 0
        c.drawRightString(col_x[3] - 1.5 * mm, y_row + this_h - 4 * mm, f"{qty:g}" if isinstance(qty, (int, float)) else str(qty))
        # Unit
        c.drawCentredString((col_x[3] + col_x[4]) / 2, y_row + this_h - 4 * mm, str(it.get("unit") or ""))
        # Unit price
        up = float(it.get("unit_price") or 0)
        c.drawRightString(col_x[5] - 1.5 * mm, y_row + this_h - 4 * mm, _fmt_money(up, currency))
        # Amount
        amt = float(it.get("total_price") or (float(qty or 0) * up))
        subtotal += amt
        c.drawRightString(col_x[6] - 1.5 * mm, y_row + this_h - 4 * mm, _fmt_money(amt, currency))

    # Top border
    c.setStrokeColor(HexColor("#94A3B8"))
    c.setLineWidth(0.4)
    c.line(col_x[0], table_top, col_x[-1], table_top)

    # ==== 6. Notes (manual bullets — from notes_lines) ====
    notes_y = y_row - 6 * mm
    notes_lines_list = quo.get("notes_lines") or []
    notes_text = "\n".join(notes_lines_list) if notes_lines_list else (quo.get("notes") or "").strip()
    if notes_text:
        c.setFont(bold_font, 9)
        c.drawString(LX, notes_y, "Note :")
        style_note = ParagraphStyle("note", fontName=body_font, fontSize=8.5, leading=10.5, alignment=TA_LEFT)
        note_lines = [f"- {ln.strip()}" if not ln.strip().startswith("-") else ln for ln in notes_text.split("\n") if ln.strip()]
        para = Paragraph("<br/>".join(note_lines), style_note)
        pw, ph = para.wrap(RX - LX, 100 * mm)
        para.drawOn(c, LX + 2 * mm, notes_y - ph - 2 * mm)
        notes_y = notes_y - ph - 6 * mm

    # ==== 7. Standard Note (conditional — only if include_standard_note=True) ====
    if quo.get("include_standard_note"):
        disc_style = ParagraphStyle("disc", fontName=body_font, fontSize=8.5, leading=10.5, alignment=TA_JUSTIFY)
        disc_text = (
            "This quotation is based on full quantity order, not valid for partial order and PT. MKS reserves "
            "the right to revise the quotation if there is any deviation or partial order being awarded."
        )
        dp = Paragraph(disc_text, disc_style)
        dw, dh = dp.wrap(RX - LX, 30 * mm)
        dp.drawOn(c, LX, notes_y - dh - 2 * mm)
        notes_y = notes_y - dh - 6 * mm

    # ==== 8. Grand Total row ====
    gt_h = 8 * mm
    gt_top = notes_y - 2 * mm
    # Bar spans from col_x[3] (Unit column start) to end — enough room for label
    c.setFillColor(HexColor("#1E293B"))
    c.rect(col_x[3], gt_top - gt_h, col_x[-1] - col_x[3], gt_h, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont(bold_font, 10)
    # Label right-aligned to just before the amount cell
    c.drawRightString(col_x[5] - 1.5 * mm, gt_top - gt_h + 2.5 * mm, f"GRAND TOTAL ({currency})")
    grand = float(quo.get("total_amount") or subtotal)
    c.drawRightString(col_x[6] - 1.5 * mm, gt_top - gt_h + 2.5 * mm, _fmt_money(grand, currency))

    # ==== 9. In Words ====
    c.setFillColor(black)
    c.setFont(body_font, 9)
    iw_y = gt_top - gt_h - 8 * mm
    iw_en = _in_words(grand, currency, "en")
    iw_id = _in_words(grand, currency, "id")
    c.drawString(LX, iw_y, "In Words :")
    c.setFont(body_font, 9)
    if iw_en:
        c.drawString(LX + 22 * mm, iw_y, iw_en)
    if iw_id:
        c.drawString(LX + 22 * mm, iw_y - 5 * mm, iw_id)

    # ==== 10. Term & Conditions (aligned columns) ====
    tc_y = iw_y - 16 * mm
    c.setFont(bold_font, 10)
    c.drawString(LX, tc_y, "Term & Conditions :")
    c.setFont(body_font, 9)
    payment = quo.get("payment_term") or "-"
    delivery = quo.get("delivery_time") or "-"
    validity = quo.get("validity") or "-"
    tc_label_x = LX + 3 * mm
    tc_colon_x = LX + 45 * mm
    tc_value_x = LX + 48 * mm
    lines = [("- Payment Term", payment), ("- Delivery Time", delivery), ("- Validity", validity)]
    for i, (lbl, val) in enumerate(lines):
        row_y = tc_y - (i + 1) * 5 * mm
        c.drawString(tc_label_x, row_y, lbl)
        c.drawString(tc_colon_x, row_y, ":")
        c.drawString(tc_value_x, row_y, val)

    # ==== 11. Closing paragraph ====
    close_style = ParagraphStyle("close", fontName=body_font, fontSize=9, leading=11, alignment=TA_JUSTIFY)
    close_text = (
        "We trust that above quotation is acceptable to you and we look forward to your favorable reply. "
        "Should you require any further information, please do not hesitate to contact us."
    )
    cp = Paragraph(close_text, close_style)
    cw, ch = cp.wrap(RX - LX, 30 * mm)
    cp.drawOn(c, LX, tc_y - 26 * mm - ch)

    # ==== 12. Signature block ====
    sig_y = 40 * mm
    c.setFont(body_font, 9)
    c.drawString(LX, sig_y, "Yours faithfully,")
    c.setFont(bold_font, 9)
    c.drawString(LX, sig_y - 4 * mm, "PT MITRA KARYA SARANA")

    c.setFont(body_font, 9)
    c.drawString(110 * mm, sig_y, "Approved By :")

    # Sales signature — embed signature image bytes if provided under _sales_signature_png
    sales_sig_bytes = quo.get("_sales_signature_png")  # bytes injected by builder
    if sales_sig_bytes:
        try:
            from reportlab.lib.utils import ImageReader
            img = ImageReader(io.BytesIO(sales_sig_bytes))
            c.drawImage(img, LX, sig_y - 22 * mm, width=32 * mm, height=18 * mm,
                        mask="auto", preserveAspectRatio=True)
        except Exception:
            pass

    # Approver signature (Asiong Lu)
    approver_sig_bytes = quo.get("_approver_signature_png")
    if approver_sig_bytes:
        try:
            from reportlab.lib.utils import ImageReader
            img = ImageReader(io.BytesIO(approver_sig_bytes))
            c.drawImage(img, 110 * mm, sig_y - 22 * mm, width=32 * mm, height=18 * mm,
                        mask="auto", preserveAspectRatio=True)
        except Exception:
            pass

    # Sales sign name (use signature_name if set, else created_by_name)
    signer = (quo.get("signature_name") or quo.get("created_by_name") or "").strip()
    if signer:
        c.setFont(bold_font, 9)
        c.drawString(LX, sig_y - 24 * mm, signer)
        c.setFont(body_font, 8.5)
        c.drawString(LX, sig_y - 28 * mm, quo.get("signature_position") or "Sales Dept.")

    # Approver name
    approver = (quo.get("approver_name") or "").strip()
    if approver:
        c.setFont(bold_font, 9)
        c.drawString(110 * mm, sig_y - 24 * mm, approver)
        c.setFont(body_font, 8.5)
        c.drawString(110 * mm, sig_y - 28 * mm, quo.get("approver_position") or "Business Dev. Manager")

    c.showPage()
    c.save()
    return buf.getvalue()
