"""Render Corrective Action Report (CAR) ke PDF PERSIS format resmi ISO
MKS-F-QAD-004 Rev.02 (PT. Mitra Karya Sarana) — tanpa kop surat.

Deterministik (reportlab). Layout mengikuti dokumen resmi:
header (logo kecil + nama PT + judul + CAR No | Date/Issued by/Sign/Issued to/Expected),
Section 1 Nonconformance Information (+ checkbox IN-HOUSE/EXTERNAL),
Section 2 Investigation & Action Plans, Section 3 CAR Closeout,
footer 'MKS-F-QAD-004#Rev.02'.
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
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

_GRAY = colors.HexColor("#d3d3d3")       # header seksi (abu terang)
_LINE = colors.black
_TXT = colors.black

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


def _p(text, size=9, bold=False, align=TA_LEFT, color=_TXT, leading=None, raw=False):
    style = ParagraphStyle(
        "c", fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=size, leading=leading or (size + 3), textColor=color, alignment=align,
    )
    if raw:
        return Paragraph(text or "&nbsp;", style)
    txt = "" if text is None else str(text)
    txt = txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return Paragraph(txt or "&nbsp;", style)


def _lv(label, value, size=8.5):
    """Label bold + value pada baris yang sama."""
    return _p(f"<b>{label}</b> {value or ''}", size, raw=True)


def _box(checked: bool):
    """Kotak checkbox kecil (kosong / silang)."""
    inner = _p("X", 8, bold=True, align=TA_CENTER) if checked else _p("", 8)
    b = Table([[inner]], colWidths=[9], rowHeights=[9])
    b.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.7, _LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return b


def build_car_pdf(nc: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=12 * mm, bottomMargin=14 * mm, title=f"CAR {nc.get('nc_no','')}",
    )
    W = doc.width
    inv = nc.get("investigation") or {}
    clo = nc.get("closeout") or {}
    to_label = _DEPT_LABEL.get(nc.get("issued_to_dept"), nc.get("issued_to") or "")
    if nc.get("issued_to_user"):
        to_label += " · " + nc["issued_to_user"]["name"]

    story = []

    # ── HEADER ─────────────────────────────────────────────────────────────
    logo_box = Table([[_p("<b>PT MITRA KARYA SARANA</b>", 7.5, align=TA_CENTER, raw=True)]],
                     colWidths=[W * 0.42 - 8])
    logo_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, _LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    left_cell = [
        logo_box, Spacer(1, 4),
        _p("PT. Mitra Karya Sarana", 11, bold=True, align=TA_CENTER),
        _p("Corrective Action Report (CAR)", 11, bold=True, align=TA_CENTER),
        Spacer(1, 3),
        _lv("CAR No :", nc.get("nc_no", ""), 9),
    ]

    right_inner = Table([
        [_lv("Date of Issue :", _fmt_date(nc.get("issued_at"))), ""],
        [_lv("Issued by :", (nc.get("issued_by") or {}).get("name", "")), _lv("Sign & Date :", "")],
        [_lv("Issued to :", to_label), ""],
        [_lv("Expected reply date :", _fmt_date(nc.get("expected_reply_date"))), ""],
    ], colWidths=[W * 0.29, W * 0.29])
    right_inner.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, _LINE),
        ("SPAN", (0, 0), (1, 0)), ("SPAN", (0, 2), (1, 2)), ("SPAN", (0, 3), (1, 3)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))

    header = Table([[left_cell, right_inner]], colWidths=[W * 0.42, W * 0.58])
    header.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, _LINE), ("LINEAFTER", (0, 0), (0, 0), 0.8, _LINE),
        ("VALIGN", (0, 0), (0, 0), "TOP"), ("VALIGN", (1, 0), (1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (0, 0), 5), ("BOTTOMPADDING", (0, 0), (0, 0), 5),
        ("LEFTPADDING", (0, 0), (0, 0), 6), ("RIGHTPADDING", (0, 0), (0, 0), 6),
        ("TOPPADDING", (1, 0), (1, 0), 0), ("BOTTOMPADDING", (1, 0), (1, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 0), ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ]))
    story.append(header)

    # ── helpers ──
    def sect(text):
        t = Table([[_p(text, 9, bold=True)]], colWidths=[W])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), _GRAY),
            ("BOX", (0, 0), (-1, -1), 0.8, _LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    def big_box(flow_list, pad_bottom=26, width=W):
        t = Table([[flow_list]], colWidths=[width])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, _LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), pad_bottom),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    def ulabel(text):
        return _p(f"<u>{text}</u>", 8.5, bold=True, raw=True)

    # objek NC untuk konteks
    if nc.get("link_type") == "drawing" and nc.get("drawing_nos"):
        obj_ctx = "Drawing: " + ", ".join(nc["drawing_nos"])
    else:
        obj_ctx = nc.get("object_ref") or ""

    # ── SECTION 1 ──
    story.append(sect("NONCONFORMANCE INFORMATION (Completed by CAR Initiator)"))
    desc = nc.get("description") or ""
    desc_flow = [ulabel("Description of Nonconformance :")]
    if obj_ctx:
        desc_flow.append(_p(f"<i>Objek: {obj_ctx}</i>", 8.5, raw=True))
    desc_flow.append(Spacer(1, 2))
    desc_flow.append(_p(desc, 9))
    desc_cell = Table([[desc_flow]], colWidths=[W * 0.82])
    desc_cell.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                   ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 30),
                                   ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]))
    src = nc.get("source")
    checks = Table([
        [_box(src == "in_house"), _p("IN-HOUSE", 8.5)],
        [_box(src == "external"), _p("EXTERNAL", 8.5)],
    ], colWidths=[12, W * 0.18 - 24])
    checks.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
    ]))
    row1 = Table([[desc_cell, checks]], colWidths=[W * 0.82, W * 0.18])
    row1.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, _LINE), ("LINEAFTER", (0, 0), (0, 0), 0.8, _LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(row1)

    # ── SECTION 2 ──
    story.append(sect("INVESTIGATION & ACTION PLANS (Completed by Responsible Dept./Assignee)"))
    inv_flow = [
        ulabel("Root Cause(s) :"), _p(inv.get("root_cause", ""), 9), Spacer(1, 10),
        ulabel("Immediate Action (s) Taken :"), _p(inv.get("immediate_action", ""), 9), Spacer(1, 10),
        ulabel("Corrective Action(s) to eliminate the root cause(s) of NC :"), _p(inv.get("corrective_action", ""), 9),
    ]
    if inv.get("preventive_action"):
        inv_flow += [Spacer(1, 6), ulabel("Preventive Action :"), _p(inv.get("preventive_action"), 9)]
    story.append(big_box(inv_flow, pad_bottom=18))

    def sign_row(l_lbl, l_val, r_lbl, r_val):
        t = Table([
            [_p(l_lbl, 8.5, bold=True), _p(r_lbl, 8.5, bold=True)],
            [_p(l_val, 9), _p(r_val, 9)],
            [_p("(Name and Signature)", 7.5, align=TA_CENTER), _p("(Name and Signature)", 7.5, align=TA_CENTER)],
        ], colWidths=[W * 0.5, W * 0.5])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, _LINE), ("LINEAFTER", (0, 0), (0, -1), 0.8, _LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 1), (-1, 1), 18),
            ("BOTTOMPADDING", (0, 2), (-1, 2), 3), ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    story.append(sign_row(
        "Actions Completed By / Date :",
        (inv.get("completed_by") or "") + ("  /  " + _fmt_date(inv.get("completed_date")) if inv.get("completed_date") else ""),
        "Approved by Dept. Head / Date :",
        (inv.get("dept_head_name") or "") + ("  /  " + _fmt_date(inv.get("dept_head_date")) if inv.get("dept_head_date") else ""),
    ))

    # ── SECTION 3 ──
    story.append(sect("CAR CLOSEOUT INFORMATION (Completed by Initiator or MR)"))
    story.append(big_box([ulabel("Remarks from Initiator :"), _p(clo.get("initiator_remarks", ""), 9)], pad_bottom=18))
    risk = bool(clo.get("risk_review"))
    risk_row = Table([[
        _p("Review of risks and opportunities assessment :", 8.5, bold=True),
        _box(risk), _p("Yes", 8.5), _box(not risk), _p("No", 8.5),
        _p("<i>(if yes please attached)</i>", 8, raw=True),
    ]], colWidths=[W * 0.42, 14, 32, 14, 28, W - (W * 0.42) - 88])
    risk_row.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, _LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(risk_row)
    story.append(sign_row(
        "Effectiveness of Actions taken reviewed by Initiator / Date",
        (clo.get("effectiveness_reviewed_by") or "") + ("  /  " + _fmt_date(clo.get("effectiveness_date")) if clo.get("effectiveness_date") else ""),
        "Approved by QA / Date :",
        (clo.get("qa_approved_by") or "") + ("  /  " + _fmt_date(clo.get("qa_date")) if clo.get("qa_date") else ""),
    ))

    def _on_page(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(_TXT)
        canvas.drawString(14 * mm, 7 * mm, "MKS-F-QAD-004#Rev.02")
        canvas.drawRightString(A4[0] - 14 * mm, 7 * mm, f"Status: {str(nc.get('status','')).upper()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return buf.getvalue()


# ── Lampiran bukti (foto + PDF) di-append setelah form utama ──────────────────
_IMG_EXT = {"jpg", "jpeg", "png", "webp"}


def merge_attachments(main_pdf: bytes, attachments: list) -> bytes:
    """Gabungkan lampiran bukti ke PDF CAR.

    - Foto (jpg/jpeg/png/webp) → dijadikan halaman A4 tersendiri (dengan judul
      "LAMPIRAN n: <nama file>" + remark), gambar di-fit menjaga proporsi.
    - PDF → seluruh halamannya di-append apa adanya, didahului 1 baris penanda.

    Setiap attachment: {"filename": str, "content": bytes, "remark": str}.
    Lampiran yang gagal dibaca akan dilewati agar cetak CAR tetap berjalan.
    """
    if not attachments:
        return main_pdf
    import os as _os

    import fitz  # PyMuPDF

    out = fitz.open(stream=main_pdf, filetype="pdf")
    A4W, A4H = fitz.paper_size("a4")   # (595, 842) pt
    margin = 40
    idx = 0
    for att in attachments:
        content = att.get("content")
        if not content:
            continue
        fname = att.get("filename") or "lampiran"
        remark = (att.get("remark") or "").strip()
        ext = _os.path.splitext(fname)[1].lower().lstrip(".")
        idx += 1
        try:
            if ext == "pdf":
                page = out.new_page(width=A4W, height=A4H)
                page.insert_text((margin, margin), f"LAMPIRAN {idx}: {fname}",
                                 fontsize=11, fontname="helv", color=(0, 0, 0))
                if remark:
                    page.insert_text((margin, margin + 16), remark,
                                     fontsize=8, fontname="helv", color=(0.3, 0.3, 0.3))
                src = fitz.open(stream=content, filetype="pdf")
                out.insert_pdf(src)
                src.close()
            elif ext in _IMG_EXT:
                page = out.new_page(width=A4W, height=A4H)
                page.insert_text((margin, margin), f"LAMPIRAN {idx}: {fname}",
                                 fontsize=11, fontname="helv", color=(0, 0, 0))
                if remark:
                    page.insert_text((margin, margin + 16), remark,
                                     fontsize=8, fontname="helv", color=(0.3, 0.3, 0.3))
                top = margin + (34 if remark else 22)
                rect = fitz.Rect(margin, top, A4W - margin, A4H - margin)
                page.insert_image(rect, stream=content, keep_proportion=True)
            else:
                idx -= 1  # jenis tak didukung, tidak dihitung
        except Exception:
            continue
    data = out.tobytes()
    out.close()
    return data
