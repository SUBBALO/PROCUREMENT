"""Form Template Editor — visual A4 designer (drag-drop) with data bindings.

Templates saved as JSON layout (elements array). Backend renders to PDF via reportlab.

Element shape:
{
  "id": "uuid",
  "type": "text|field|image|logo|rect|line|table",
  "x": 10, "y": 10,           # mm from top-left of page
  "w": 100, "h": 20,          # mm
  "content": "...",           # for text
  "binding": "vendor_name",   # for field: dotted path into data
  "font_size": 12, "bold": false, "italic": false,
  "align": "left|center|right",
  "src": "COMPANY_LOGO",      # for image/logo
  "stroke": 1,                # for rect/line (0 = no border)
  # for line: use x,y (start) and x2,y2 (end)
  "x2": 10, "y2": 20,
  # for table:
  "columns": [{"label":"No","binding":"__index__","w":10}, ...],
  "rows_source": "items",     # key in data dict
  "header_bold": true,
  "row_height": 8,
  "border": true
}
"""
import io
import uuid
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from db import db
from deps import _now_iso, get_current_user, log_action
from services.soft_delete import NOT_DELETED_FILTER, merged, soft_delete_one

from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import black, HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

router = APIRouter(tags=["form-templates"])

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
LOGO_CANDIDATES = ["logo.png", "logo.jpg", "letterhead.png", "kop_surat.webp"]
ADMIN_ROLES = {"admin", "super_admin", "supervisor"}


# -------- Data bindings schema (available fields per form code) --------
FORM_BINDINGS = {
    "MCL": {
        "label": "Material Control Label",
        "top_fields": [
            {"key": "company_name", "label": "Nama Perusahaan"},
            {"key": "receive_date", "label": "Tanggal Terima"},
            {"key": "vendor_name", "label": "Nama Vendor"},
            {"key": "po_no", "label": "Nomor PO"},
            {"key": "do_number", "label": "Nomor DO / Surat Jalan"},
            {"key": "invoice_no", "label": "Nomor Invoice"},
            {"key": "print_date", "label": "Tanggal Cetak"},
            {"key": "printed_by", "label": "Dicetak Oleh"},
        ],
        "rows_source": "items",
        "row_fields": [
            {"key": "__index__", "label": "No. Urut"},
            {"key": "so_no", "label": "SO No"},
            {"key": "item_name", "label": "Nama Barang"},
            {"key": "qty_received", "label": "Qty"},
            {"key": "unit", "label": "Unit"},
            {"key": "receive_date", "label": "Tanggal Terima"},
        ],
    },
    "SURAT_JALAN_STORE": {
        "label": "Surat Jalan Keluar (Store)",
        "top_fields": [
            {"key": "company_name", "label": "Nama Perusahaan"},
            {"key": "issue_date", "label": "Tanggal Keluar"},
            {"key": "taker_name", "label": "Pengambil"},
            {"key": "so_number", "label": "Nomor SO"},
            {"key": "notes", "label": "Catatan"},
            {"key": "print_date", "label": "Tanggal Cetak"},
        ],
        "rows_source": "items",
        "row_fields": [
            {"key": "__index__", "label": "No. Urut"},
            {"key": "item_name", "label": "Nama Barang"},
            {"key": "qty", "label": "Qty"},
            {"key": "unit", "label": "Unit"},
            {"key": "vendor_name", "label": "Vendor Asal"},
        ],
    },
    "MII": {
        "label": "Material Incoming Inspection (MKS-F-QAD-002)",
        "top_fields": [
            {"key": "company_name", "label": "Nama Perusahaan"},
            {"key": "source_type", "label": "Sumber (supplier/customer)"},
            {"key": "source_name", "label": "Nama Supplier/Customer"},
            {"key": "do_no", "label": "DO No"},
            {"key": "po_no", "label": "PO No"},
            {"key": "inspection_date", "label": "Tanggal Inspeksi"},
            {"key": "inspector_name", "label": "QC Inspector"},
            {"key": "leader_name", "label": "QC Leader"},
            {"key": "print_date", "label": "Tanggal Cetak"},
        ],
        "rows_source": "items",
        "row_fields": [
            {"key": "__index__", "label": "No. Urut"},
            {"key": "so_no", "label": "SO No"},
            {"key": "batch_grade_heat", "label": "Batch/Grade/Heat"},
            {"key": "mill_cert_no", "label": "Mill Cert/EDS No"},
            {"key": "description", "label": "Description of Part"},
            {"key": "qty", "label": "Qty"},
            {"key": "unit", "label": "Unit"},
            {"key": "dimension_spec", "label": "Dimention SPEC"},
            {"key": "dimension_actual", "label": "Dimention ACTUAL"},
            {"key": "visual", "label": "Visual"},
            {"key": "result_ok", "label": "Result OK (X)"},
            {"key": "result_ng", "label": "Result NG (X)"},
            {"key": "remark", "label": "Remark"},
        ],
    },
}


def _resolve_binding(data: dict, path: str, default=""):
    """Resolve dotted path in data dict."""
    if not path:
        return default
    parts = path.split(".")
    cur = data
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return default
    return cur if cur is not None else default


def _logo_path() -> Optional[Path]:
    for name in LOGO_CANDIDATES:
        p = ASSETS_DIR / name
        if p.exists():
            return p
    return None


# --------------- CRUD ---------------
@router.get("/form-templates")
async def list_templates(current: dict = Depends(get_current_user)):
    docs = await db.form_templates.find(
        merged({}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("code", 1).to_list(length=500)
    return docs


@router.get("/form-templates/bindings/{code}")
async def get_bindings(code: str, current: dict = Depends(get_current_user)):
    schema = FORM_BINDINGS.get(code.upper())
    if not schema:
        raise HTTPException(status_code=404, detail=f"Binding schema untuk '{code}' tidak ditemukan")
    return schema


@router.get("/form-templates/{tid}")
async def get_template(tid: str, current: dict = Depends(get_current_user)):
    doc = await db.form_templates.find_one(merged({"id": tid}, NOT_DELETED_FILTER), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    return doc


@router.get("/form-templates/by-code/{code}/active")
async def get_active_by_code(code: str, current: dict = Depends(get_current_user)):
    doc = await db.form_templates.find_one(
        merged({"code": code.upper(), "is_active": True}, NOT_DELETED_FILTER),
        {"_id": 0},
        sort=[("is_default", -1), ("updated_at", -1)],
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"Tidak ada template aktif untuk {code}")
    return doc


@router.post("/form-templates")
async def create_template(payload: dict, current: dict = Depends(get_current_user)):
    if current.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Hanya admin yang boleh membuat template")
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "code": (payload.get("code") or "").upper().strip(),
        "name": payload.get("name") or "Template Baru",
        "description": payload.get("description", ""),
        "page_width_mm": payload.get("page_width_mm") or 210,
        "page_height_mm": payload.get("page_height_mm") or 297,
        "elements": payload.get("elements") or [],
        "is_active": bool(payload.get("is_active", True)),
        "is_default": bool(payload.get("is_default", False)),
        "created_at": now,
        "updated_at": now,
        "updated_by": current.get("username"),
    }
    if not doc["code"]:
        raise HTTPException(status_code=400, detail="Field 'code' wajib diisi (mis. MCL)")
    await db.form_templates.insert_one(doc.copy())
    await log_action(current, "create_form_template", "form_template", doc["id"], {"code": doc["code"]})
    doc.pop("_id", None)
    return doc


@router.patch("/form-templates/{tid}")
async def update_template(tid: str, payload: dict, current: dict = Depends(get_current_user)):
    if current.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Hanya admin yang boleh mengubah template")
    existing = await db.form_templates.find_one(merged({"id": tid}, NOT_DELETED_FILTER))
    if not existing:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    upd = {"updated_at": _now_iso(), "updated_by": current.get("username")}
    for k in ("name", "description", "elements", "is_active", "is_default", "page_width_mm", "page_height_mm"):
        if k in payload:
            upd[k] = payload[k]
    await db.form_templates.update_one({"id": tid}, {"$set": upd})
    await log_action(current, "update_form_template", "form_template", tid, {"fields": list(upd.keys())})
    doc = await db.form_templates.find_one({"id": tid}, {"_id": 0})
    return doc


@router.delete("/form-templates/{tid}")
async def delete_template(tid: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Hanya admin yang boleh menghapus template")
    n = await soft_delete_one("form_templates", {"id": tid}, current)
    if not n:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    await log_action(current, "delete_form_template", "form_template", tid, {})
    return {"deleted": 1}


# --------------- RENDER ENGINE ---------------
def _render_pdf(template: dict, data: dict) -> bytes:
    """Render template + data into PDF bytes using reportlab."""
    page_w_mm = float(template.get("page_width_mm") or 210)
    page_h_mm = float(template.get("page_height_mm") or 297)
    page_w = page_w_mm * mm
    page_h = page_h_mm * mm

    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=(page_w, page_h))

    def to_pt_x(x_mm): return x_mm * mm
    def to_pt_y(y_mm): return page_h - (y_mm * mm)  # invert Y (reportlab uses bottom-left)

    def set_font(size=10, bold=False, italic=False):
        base = "Helvetica"
        if bold and italic: name = f"{base}-BoldOblique"
        elif bold: name = f"{base}-Bold"
        elif italic: name = f"{base}-Oblique"
        else: name = base
        c.setFont(name, size)

    def draw_text(text, x_mm, y_mm, w_mm=None, h_mm=None, font_size=10, bold=False, italic=False, align="left"):
        text = "" if text is None else str(text)
        set_font(font_size, bold, italic)
        text = text.replace("\r", "")
        lines = text.split("\n")
        line_h_pt = font_size * 1.2
        # Anchor at top of box: draw line-by-line
        base_y_pt = to_pt_y(y_mm) - font_size  # baseline of first line
        for i, ln in enumerate(lines):
            y_line = base_y_pt - i * line_h_pt
            if h_mm is not None and (y_line < to_pt_y(y_mm + h_mm)):
                break  # overflow
            if align == "center":
                cx = to_pt_x(x_mm + (w_mm or 0) / 2)
                c.drawCentredString(cx, y_line, ln)
            elif align == "right":
                rx = to_pt_x(x_mm + (w_mm or 0))
                c.drawRightString(rx, y_line, ln)
            else:
                c.drawString(to_pt_x(x_mm), y_line, ln)

    # Iterate elements
    elements = template.get("elements") or []
    for el in elements:
        etype = el.get("type")
        x = float(el.get("x") or 0)
        y = float(el.get("y") or 0)
        w = float(el.get("w") or 0)
        h = float(el.get("h") or 0)

        if etype == "text":
            draw_text(
                el.get("content", ""), x, y, w, h,
                font_size=int(el.get("font_size", 10)),
                bold=bool(el.get("bold")), italic=bool(el.get("italic")),
                align=el.get("align", "left"),
            )
        elif etype == "field":
            val = _resolve_binding(data, el.get("binding", ""), el.get("placeholder", ""))
            draw_text(
                val, x, y, w, h,
                font_size=int(el.get("font_size", 10)),
                bold=bool(el.get("bold")), italic=bool(el.get("italic")),
                align=el.get("align", "left"),
            )
        elif etype in ("image", "logo"):
            src = el.get("src") or "COMPANY_LOGO"
            path = _logo_path() if src == "COMPANY_LOGO" else (ASSETS_DIR / src if src else None)
            if path and path.exists():
                try:
                    c.drawImage(str(path), to_pt_x(x), to_pt_y(y + h),
                                width=w * mm, height=h * mm, preserveAspectRatio=True, mask="auto")
                except Exception:
                    pass
        elif etype == "rect":
            stroke = 1 if el.get("stroke", 1) else 0
            c.setLineWidth(float(el.get("line_width", 0.5)))
            c.rect(to_pt_x(x), to_pt_y(y + h), w * mm, h * mm, stroke=stroke, fill=0)
        elif etype == "line":
            x2 = float(el.get("x2") or (x + w))
            y2 = float(el.get("y2") or y)
            c.setLineWidth(float(el.get("line_width", 0.5)))
            c.line(to_pt_x(x), to_pt_y(y), to_pt_x(x2), to_pt_y(y2))
        elif etype == "table":
            cols = el.get("columns") or []
            rows_key = el.get("rows_source") or "items"
            rows = data.get(rows_key) or []
            row_h = float(el.get("row_height") or 8)
            header_bold = bool(el.get("header_bold", True))
            font_size = int(el.get("font_size", 9))
            border = bool(el.get("border", True))
            padding = 1.5  # mm
            # Header
            cx = x
            set_font(font_size, header_bold)
            for col in cols:
                cw = float(col.get("w") or 20)
                if border:
                    c.setLineWidth(0.4)
                    c.rect(to_pt_x(cx), to_pt_y(y + row_h), cw * mm, row_h * mm, stroke=1, fill=0)
                draw_text(col.get("label", ""), cx + padding, y + padding + 1, cw - 2 * padding, row_h,
                          font_size=font_size, bold=header_bold, align=col.get("align", "left"))
                cx += cw
            # Rows
            row_y = y + row_h
            for idx, row in enumerate(rows):
                if row_y + row_h > y + h:
                    break  # stop if overflow container
                cx = x
                for col in cols:
                    cw = float(col.get("w") or 20)
                    key = col.get("binding", "")
                    if key == "__index__":
                        val = idx + 1
                    else:
                        val = row.get(key, "") if isinstance(row, dict) else ""
                    if border:
                        c.setLineWidth(0.3)
                        c.rect(to_pt_x(cx), to_pt_y(row_y + row_h), cw * mm, row_h * mm, stroke=1, fill=0)
                    draw_text(val, cx + padding, row_y + padding + 1, cw - 2 * padding, row_h,
                              font_size=font_size, align=col.get("align", "left"))
                    cx += cw
                row_y += row_h

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()


@router.post("/form-templates/{tid}/render")
async def render_template(tid: str, payload: dict, current: dict = Depends(get_current_user)):
    """Render template with provided data payload → PDF stream."""
    doc = await db.form_templates.find_one(merged({"id": tid}, NOT_DELETED_FILTER), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    data = payload.get("data") or {}
    # Attach some defaults
    data.setdefault("company_name", "PT. MITRA KARYA SARANA")
    data.setdefault("print_date", _now_iso()[:10])
    data.setdefault("printed_by", current.get("username", ""))
    pdf = _render_pdf(doc, data)
    fname = payload.get("filename") or f"{doc.get('code','FORM')}_{_now_iso()[:10]}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )


@router.post("/form-templates/{tid}/preview")
async def preview_template(tid: str, current: dict = Depends(get_current_user)):
    """Render template with sample data → PDF (for editor preview)."""
    doc = await db.form_templates.find_one(merged({"id": tid}, NOT_DELETED_FILTER), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    sample = {
        "company_name": "PT. MITRA KARYA SARANA",
        "receive_date": "2026-02-08",
        "vendor_name": "PT VENDOR CONTOH JAYA",
        "po_no": "PO-2026-001",
        "do_number": "SJ-2026-011",
        "invoice_no": "INV-2026-99",
        "print_date": _now_iso()[:10],
        "printed_by": current.get("username", ""),
        "taker_name": "BAGIAN PRODUKSI",
        "so_number": "SO-4097",
        "notes": "Contoh preview",
        "issue_date": _now_iso()[:10],
        "items": [
            {"so_no": "SO-4097", "item_name": "Industrial Bearing SKF 6205", "qty_received": 10, "qty": 10, "unit": "Pcs", "receive_date": "2026-02-08", "vendor_name": "PT VENDOR CONTOH"},
            {"so_no": "SO-4097", "item_name": "Sample Item 2 dengan nama panjang", "qty_received": 25, "qty": 5, "unit": "Meter", "receive_date": "2026-02-08", "vendor_name": "PT ANOTHER"},
            {"so_no": "SO-4098", "item_name": "Contoh Item 3", "qty_received": 3, "qty": 3, "unit": "Set", "receive_date": "2026-02-08", "vendor_name": "PT VENDOR CONTOH"},
        ],
    }
    pdf = _render_pdf(doc, sample)
    fname = f"preview_{doc.get('code','form')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )
