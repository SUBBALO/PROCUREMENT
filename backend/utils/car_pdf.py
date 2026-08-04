"""Render Corrective Action Report (CAR) ke PDF sesuai format resmi ISO
MKS-F-QAD-004 Rev.02 (PT. Mitra Karya Sarana).

Deterministik (reportlab) — tidak bergantung LibreOffice saat cetak.
Layout mengikuti template Word: kop surat, judul, blok info, 3 seksi berkotak,
dan footer kode form 'MKS-F-QAD-004#Rev.02'.
"""
from __future__ import annotations

import io
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

_ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
_LETTERHEAD = os.path.join(_ASSETS, "letterhead.png")

_HDR_BG = colors.HexColor("#1f2d3d")     # biru gelap untuk header seksi
_LINE = colors.HexColor("#3f4a57")
_LABEL = colors.HexColor("#333333")

_DEPT_LABEL = {
    "engineering": "Engineering", "qc": "Quality Control", "produksi": "Produksi",
    "sales": "Sales", "purchasing": "Purchasing", "store": "Store",
    "document_control": "Document Control", "finance": "Finance",
    "management": "Management", "other": "Lainnya",
}


def _fmt_date(v) -> str:
    if not v:
        return ""
    s = str(v)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).strftime("%d %b %Y")
    except Exception:
        return s[:10]


def _p(text, size=9, bold=False, align=TA_LEFT, color=_LABEL, leading=None):
    style = ParagraphStyle(
        "c", fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=size, leading=leading or (size + 3), textColor=color, alignment=align,
    )
    txt = "" if text is None else str(text)
    txt = txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return Paragraph(txt or "&nbsp;", style)


def _chk(checked: bool) -> str:
    return "[\u00a0X\u00a0]" if checked else "[\u00a0\u00a0\u00a0]"


def build_car_pdf(nc: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=33 * mm, bottomMargin=14 * mm, title=f"CAR {nc.get('nc_no','')}",
    )
    content_w = doc.width
    story = []

    # ── Judul (kop surat digambar sebagai background di _on_page) ──
    title = Table([[_p("CORRECTIVE ACTION REPORT (CAR)", 12, bold=True, align=TA_CENTER, color=colors.white)]],
                  colWidths=[content_w])
    title.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _HDR_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(title)

    # ── Blok info header ──
    def lbl(t):
        return _p(t, 8.5, bold=True)

    def val(t):
        return _p(t, 8.5)

    info = Table([
        [lbl("CAR No"), val(nc.get("nc_no", "")), lbl("Date of Issue"), val(_fmt_date(nc.get("issued_at")))],
        [lbl("Issued by"), val((nc.get("issued_by") or {}).get("name", "")), lbl("Sign & Date"), val("")],
        [lbl("Issued to"),
         val(_DEPT_LABEL.get(nc.get("issued_to_dept"), nc.get("issued_to") or "")
             + ((" · " + nc["issued_to_user"]["name"]) if nc.get("issued_to_user") else "")),
         lbl("Expected reply date"), val(_fmt_date(nc.get("expected_reply_date")))],
    ], colWidths=[content_w * 0.16, content_w * 0.40, content_w * 0.20, content_w * 0.24])
    info.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef1f4")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#eef1f4")),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(info)

    inv = nc.get("investigation") or {}
    clo = nc.get("closeout") or {}

    def section_header(text):
        t = Table([[_p(text, 9, bold=True, color=colors.white)]], colWidths=[content_w])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), _HDR_BG),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    def field_box(label, value, min_h=16):
        inner = Table([[_p(label, 8.5, bold=True)], [_p(value, 9)]], colWidths=[content_w])
        inner.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 1), (-1, 1), min_h),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f6f8fa")),
        ]))
        return inner

    # Objek NC ringkas untuk konteks (drawing / incoming / dll).
    if nc.get("link_type") == "drawing" and nc.get("drawing_nos"):
        obj_ctx = "Drawing: " + ", ".join(nc["drawing_nos"])
    elif nc.get("object_ref"):
        obj_ctx = nc["object_ref"]
    else:
        obj_ctx = ""

    # ── SECTION 1 ──
    story.append(section_header("NONCONFORMANCE INFORMATION (Completed by CAR Initiator)"))
    desc = nc.get("description") or ""
    if obj_ctx:
        desc = (f"Objek: {obj_ctx}\n\n" if desc else f"Objek: {obj_ctx}") + desc
    story.append(field_box("Description of Nonconformance:", desc, min_h=34))
    src = nc.get("source")
    chk_row = Table([[_p(f"{_chk(src == 'in_house')} IN-HOUSE", 9),
                      _p(f"{_chk(src == 'external')} EXTERNAL", 9)]],
                    colWidths=[content_w * 0.5, content_w * 0.5])
    chk_row.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(chk_row)

    # ── SECTION 2 ──
    story.append(section_header("INVESTIGATION & ACTION PLANS (Completed by Responsible Dept./Assignee)"))
    story.append(field_box("Root Cause(s):", inv.get("root_cause", ""), min_h=24))
    story.append(field_box("Immediate Action(s) Taken:", inv.get("immediate_action", ""), min_h=24))
    story.append(field_box("Corrective Action(s) to eliminate the root cause(s) of NC:", inv.get("corrective_action", ""), min_h=24))
    sign2 = Table([
        [_p("Actions Completed By / Date:", 8.5, bold=True), _p("Approved by Dept. Head / Date:", 8.5, bold=True)],
        [_p((inv.get("completed_by") or "") + ("  /  " + _fmt_date(inv.get("completed_date")) if inv.get("completed_date") else ""), 9),
         _p((inv.get("dept_head_name") or "") + ("  /  " + _fmt_date(inv.get("dept_head_date")) if inv.get("dept_head_date") else ""), 9)],
        [_p("(Name and Signature)", 7.5, align=TA_CENTER), _p("(Name and Signature)", 7.5, align=TA_CENTER)],
    ], colWidths=[content_w * 0.5, content_w * 0.5])
    sign2.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 20), ("BOTTOMPADDING", (0, 2), (-1, 2), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f6f8fa")),
    ]))
    story.append(sign2)

    # ── SECTION 3 ──
    story.append(section_header("CAR CLOSEOUT INFORMATION (Completed by Initiator or MR)"))
    story.append(field_box("Remarks from Initiator:", clo.get("initiator_remarks", ""), min_h=22))
    risk = bool(clo.get("risk_review"))
    risk_row = Table([[_p(
        "Review of risks and opportunities assessment:\u00a0\u00a0\u00a0"
        f"{_chk(risk)} Yes\u00a0\u00a0\u00a0\u00a0{_chk(not risk)} No\u00a0\u00a0\u00a0(if yes please attached)", 9)]],
        colWidths=[content_w])
    risk_row.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(risk_row)
    sign3 = Table([
        [_p("Effectiveness of Actions taken reviewed by Initiator / Date", 8.5, bold=True),
         _p("Approved by QA / Date:", 8.5, bold=True)],
        [_p((clo.get("effectiveness_reviewed_by") or "") + ("  /  " + _fmt_date(clo.get("effectiveness_date")) if clo.get("effectiveness_date") else ""), 9),
         _p((clo.get("qa_approved_by") or "") + ("  /  " + _fmt_date(clo.get("qa_date")) if clo.get("qa_date") else ""), 9)],
        [_p("(Name and Signature)", 7.5, align=TA_CENTER), _p("(Name and Signature)", 7.5, align=TA_CENTER)],
    ], colWidths=[content_w * 0.5, content_w * 0.5])
    sign3.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 20), ("BOTTOMPADDING", (0, 2), (-1, 2), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f6f8fa")),
    ]))
    story.append(sign3)

    def _on_page(canvas, _doc):
        canvas.saveState()
        # Kop surat / letterhead sebagai background full-page
        if os.path.exists(_LETTERHEAD):
            try:
                canvas.drawImage(_LETTERHEAD, 0, 0, width=A4[0], height=A4[1],
                                 preserveAspectRatio=False, mask="auto")
            except Exception:
                pass
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(_LABEL)
        canvas.drawString(14 * mm, 7 * mm, "MKS-F-QAD-004#Rev.02")
        canvas.drawRightString(A4[0] - 14 * mm, 7 * mm, f"Status: {str(nc.get('status','')).upper()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return buf.getvalue()
