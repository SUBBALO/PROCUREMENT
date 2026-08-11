"""Transfer Request Form (CRF-TT) — Purchasing mengajukan pembayaran ke Finance.

- Satu form bisa banyak vendor & banyak baris; tiap baris punya No. Rekening sendiri.
- Tiap baris: opsional kena PPh (persen diisi user), untuk valas ada rate + fee bank.
  Nilai Transfer (IDR) = (nominal × rate) − PPh + fee.
- Master Bank Vendor: auto-isi rekening saat ketik vendor (editable).
- Nomor form: 001/CRF-TT/VIII/2026 (reset tiap bulan).
- Output: cetak PDF + masuk Master List (tab sebelah).
"""
import io
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import db
from deps import get_current_user, log_action
from services.soft_delete import NOT_DELETED_FILTER, soft_delete_one

router = APIRouter(tags=["transfer-requests"])

ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _next_seq(kind: str) -> int:
    now = datetime.utcnow()
    key = f"{kind}:{now.year}-{now.month:02d}"
    doc = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
    )
    if not doc:
        doc = await db.counters.find_one({"_id": key})
    return int(doc.get("seq", 1))


def _fmt_no(seq: int) -> str:
    now = datetime.utcnow()
    return f"{seq:03d}/CRF-TT/{ROMAN[now.month]}/{now.year}"


async def _next_seq_dynamic() -> int:
    """Nomor form berikutnya = (nomor terbesar yang masih ada bulan ini) + 1.
    Dengan begini, jika form dihapus, nomornya kembali bisa dipakai (mis. hapus 003 -> berikutnya 003 lagi;
    hapus semua -> kembali ke 001)."""
    now = datetime.utcnow()
    suffix = f"/CRF-TT/{ROMAN[now.month]}/{now.year}"
    mx = 0
    cursor = db.transfer_requests.find(dict(NOT_DELETED_FILTER), {"form_no": 1, "_id": 0})
    async for d in cursor:
        fn = d.get("form_no", "") or ""
        if fn.endswith(suffix):
            try:
                mx = max(mx, int(fn.split("/")[0]))
            except Exception:
                pass
    return mx + 1



# ----------------------------- Models -----------------------------
class VendorBankIn(BaseModel):
    vendor_name: str
    bank_name: str = ""
    account_no: str = ""
    account_holder: str = ""
    swift: str = ""
    currency: str = "IDR"


class TrfLine(BaseModel):
    vendor_name: str = ""
    invoice_no: str = ""
    description: str = ""
    so_no: str = ""            # nomor Sales Order terkait
    so_customer: str = ""      # nama customer/PT dari SO
    qty: float = 1.0
    uom: str = ""
    currency: str = "IDR"
    amount: float = 0.0        # Total Price (nominal / DPP)
    rate: float = 1.0          # kurs (untuk valas)
    fee: float = 0.0           # fee bank (transfer LN)
    taxed: bool = False        # kena PPh?
    pph_percent: float = 0.0   # persen PPh (diisi user)
    bank_name: str = ""
    account_no: str = ""
    account_holder: str = ""


class TrfIn(BaseModel):
    date: Optional[str] = None
    to_dept: str = "Finance"
    notes: str = ""
    lines: List[TrfLine] = []


def _compute_line(ln: dict) -> dict:
    amount = float(ln.get("amount") or 0)
    rate = float(ln.get("rate") or 1) or 1
    # Fee hanya untuk transfer valas (non-IDR). IDR selalu tanpa fee & rate 1.
    if (ln.get("currency") or "IDR") == "IDR":
        rate = 1.0
        ln["rate"] = 1.0
        ln["fee"] = 0.0
    fee = float(ln.get("fee") or 0)
    base_idr = amount * rate
    pph_amount = (base_idr * float(ln.get("pph_percent") or 0) / 100.0) if ln.get("taxed") else 0.0
    net_transfer = base_idr - pph_amount + fee
    ln["base_idr"] = round(base_idr, 2)
    ln["pph_amount"] = round(pph_amount, 2)
    ln["net_transfer"] = round(net_transfer, 2)
    return ln


ROLE_LABELS = {
    "super_admin": "Super Admin", "admin": "Admin", "supervisor": "Supervisor",
    "purchasing": "Purchasing", "sales": "Sales", "finance": "Finance",
    "doc_control": "Document Control", "eng_leader": "Engineering Leader",
    "eng_staff": "Engineering", "qc": "QC", "produksi": "Produksi",
}


def _role_label(role: str) -> str:
    if not role:
        return ""
    return ROLE_LABELS.get(role, str(role).replace("_", " ").title())


def _is_admin(current: dict) -> bool:
    return current.get("role") in ("admin", "super_admin") or bool(current.get("is_super_admin"))


def _can_manage(current: dict, doc: dict) -> bool:
    """Admin/Super Admin bisa akses semua. User biasa hanya TRF miliknya sendiri."""
    if _is_admin(current):
        return True
    return doc.get("requested_by") == current.get("id")


def _display_prep_role(name: str, role: str) -> str:
    """Role yang dicetak di form. Khusus Susanto (Super Admin) tampil sebagai 'Purchasing'."""
    if (name or "").strip().lower() == "susanto":
        return "Purchasing"
    return _role_label(role)


def _render_trf_pdf(doc: dict, prep_role: str = "") -> io.BytesIO:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    def _fmt_date(s):
        try:
            from datetime import datetime as _dt
            return _dt.strptime((s or "")[:10], "%Y-%m-%d").strftime("%d-%b-%Y")
        except Exception:
            return s or ""

    def money(v):
        try:
            return f"{float(v):,.2f}"
        except Exception:
            return "0.00"

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=9 * mm, bottomMargin=12 * mm, leftMargin=10 * mm, rightMargin=10 * mm)
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=7)
    inv_style = ParagraphStyle("inv", parent=small, textColor=colors.HexColor("#dc2626"), fontSize=6.5)

    elems = []
    # --- Header: boxed company (top-left) | title (center) | TFR No + Date (right) ---
    comp_box = Table([["PT. MITRA KARYA SARANA"]])
    comp_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, colors.black),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    comp_box.hAlign = "LEFT"
    comp_box.vAlign = "TOP"
    title_st = ParagraphStyle("title", parent=styles["Title"], fontSize=16, alignment=1, spaceAfter=0)
    meta_st = ParagraphStyle("meta", parent=styles["Normal"], fontSize=8, alignment=2)
    header = Table([[
        comp_box,
        Paragraph("TRANSFER REQUEST FORM", title_st),
        Paragraph(f"TFR No. <b>{doc.get('form_no','')}</b><br/>Date: {_fmt_date(doc.get('date',''))}", meta_st),
    ]], colWidths=[82 * mm, 110 * mm, 82 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 0)]))
    elems.append(header)
    elems.append(Spacer(1, 10))

    # --- Line table ---
    head = ["No", "Vendor Name", "Description", "SO", "Qty", "UoM", "Total Price", "Rate", "PPh", "Fee", "Amount (IDR)"]
    rows = [head]
    for ln in doc.get("lines", []):
        bank_bits = " · ".join([b for b in [ln.get("bank_name", ""), ln.get("account_no", ""), ln.get("account_holder", "")] if b])
        vcell = [Paragraph(f"<b>{ln.get('vendor_name','') or '-'}</b>", small)]
        if bank_bits:
            vcell.append(Paragraph(bank_bits, ParagraphStyle("bk", parent=small, textColor=colors.grey, fontSize=6.5)))
        dcell = [Paragraph(ln.get("description", "") or "-", small)]
        if ln.get("invoice_no"):
            dcell.append(Paragraph(f"Invoice No. {ln.get('invoice_no')}", inv_style))
        so_txt = ln.get("so_no", "") or ""
        if ln.get("so_customer"):
            so_txt = f"{so_txt}/{ln.get('so_customer')}" if so_txt else ln.get("so_customer")
        rows.append([
            str(ln.get("no", "")),
            vcell,
            dcell,
            Paragraph(so_txt or "-", small),
            (f"{ln.get('qty')}" if ln.get("qty") not in (None, "") else "-"),
            ln.get("uom", "") or "-",
            f"{ln.get('currency','IDR')} {money(ln.get('amount'))}",
            (f"IDR {money(ln.get('rate'))}"),
            (Paragraph(f"{ln.get('pph_percent',0)}%<br/>-{money(ln.get('pph_amount'))}", ParagraphStyle("pph", parent=small, alignment=2, fontSize=6.5, textColor=colors.HexColor("#dc2626"))) if ln.get("taxed") else "-"),
            f"IDR {money(ln.get('fee'))}",
            f"IDR {money(ln.get('net_transfer'))}",
        ])
    rows.append(["", "", "", "", "", "", "", "", "", "Total IDR", f"{money(doc.get('total_transfer'))}"])
    t = Table(rows, repeatRows=1, colWidths=[9 * mm, 44 * mm, 52 * mm, 26 * mm, 12 * mm, 14 * mm, 30 * mm, 22 * mm, 20 * mm, 22 * mm, 23 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#64748b")),
        ("ALIGN", (6, 1), (10, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (5, -1), "CENTER"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (9, -1), (10, -1), "Helvetica-Bold"),
    ]))
    elems.append(t)
    if doc.get("notes"):
        elems.append(Spacer(1, 8))
        elems.append(Paragraph(f"<b>Catatan:</b> {doc['notes']}", small))

    # --- Signatures: rapat ke kiri, garis = underline nama (sepanjang nama, di bawah nama) ---
    elems.append(Spacer(1, 20))
    sig_head = ParagraphStyle("sh", parent=small, fontSize=9, alignment=0)
    sig_name = ParagraphStyle("sn", parent=small, fontSize=9, alignment=0, fontName="Helvetica-Bold")
    sig_role = ParagraphStyle("sr", parent=small, fontSize=8, alignment=0, textColor=colors.grey)

    def _p(text, st):
        return Paragraph(text or "", st)

    def _fmt_dt_wib(s):
        try:
            from datetime import datetime as _dt, timedelta as _td, timezone as _tz
            s2 = (s or "").replace("Z", "+00:00")
            dd = _dt.fromisoformat(s2)
            if dd.tzinfo is None:
                dd = dd.replace(tzinfo=_tz.utc)
            dd = dd.astimezone(_tz(_td(hours=7)))
            return dd.strftime("%d-%b-%Y %H:%M") + " WIB"
        except Exception:
            return ""

    prep_name = doc.get("requested_by_name", "") or ""
    submit_dt = _fmt_dt_wib(doc.get("created_at", ""))
    sig_dt = ParagraphStyle("sd", parent=small, fontSize=7, alignment=0, textColor=colors.HexColor("#64748b"))
    sign = Table([
        [_p("Prepare By,", sig_head), _p("Checked By,", sig_head), _p("Approved By,", sig_head)],
        [Spacer(1, 15 * mm), Spacer(1, 15 * mm), Spacer(1, 15 * mm)],
        [_p(f"<u>{prep_name}</u>", sig_name), _p("<u>Yully</u>", sig_name), _p("<u>Asiong</u>", sig_name)],
        [_p(prep_role, sig_role), _p("Finance", sig_role), _p("MD", sig_role)],
        [_p(f"Submit: {submit_dt}" if submit_dt else "", sig_dt), _p("", sig_dt), _p("", sig_dt)],
    ], colWidths=[40 * mm, 40 * mm, 40 * mm])
    sign.hAlign = "LEFT"
    sign.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    elems.append(sign)

    pdf.build(elems)
    buf.seek(0)
    return buf



# ------------------------- Master Bank Vendor -------------------------
@router.get("/vendor-banks")
async def list_vendor_banks(q: str = "", limit: int = 20, current: dict = Depends(get_current_user)):
    query = dict(NOT_DELETED_FILTER)
    if q:
        query["vendor_name"] = {"$regex": q, "$options": "i"}
    items = await db.vendor_banks.find(query, {"_id": 0}).sort("vendor_name", 1).limit(int(limit)).to_list(int(limit))
    return {"items": items}


@router.post("/vendor-banks")
async def upsert_vendor_bank(payload: VendorBankIn, current: dict = Depends(get_current_user)):
    name = payload.vendor_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama vendor wajib diisi")
    now = _now_iso()
    existing = await db.vendor_banks.find_one({"vendor_name": {"$regex": f"^{name}$", "$options": "i"}, **NOT_DELETED_FILTER})
    data = payload.dict()
    data["vendor_name"] = name
    data["updated_at"] = now
    if existing:
        await db.vendor_banks.update_one({"id": existing["id"]}, {"$set": data})
        out = {**existing, **data}
    else:
        data["id"] = str(uuid.uuid4())
        data["created_at"] = now
        await db.vendor_banks.insert_one(dict(data))
        out = data
    out.pop("_id", None)
    await log_action(current, "vendor_bank_upsert", "vendor_banks", out.get("id"), {"vendor": name})
    return out


@router.delete("/vendor-banks/{vb_id}")
async def delete_vendor_bank(vb_id: str, current: dict = Depends(get_current_user)):
    ok = await soft_delete_one("vendor_banks", {"id": vb_id}, current)
    if not ok:
        raise HTTPException(status_code=404, detail="Data rekening tidak ditemukan")
    await log_action(current, "vendor_bank_delete", "vendor_banks", vb_id, {})
    return {"success": True}


# ------------------------- Transfer Requests -------------------------
@router.get("/transfer-requests/next-no")
async def preview_next_trf_no(current: dict = Depends(get_current_user)):
    seq = await _next_seq_dynamic()
    return {"form_no": _fmt_no(seq)}


@router.get("/transfer-requests")
async def list_trf(q: str = "", limit: int = 300, current: dict = Depends(get_current_user)):
    query = dict(NOT_DELETED_FILTER)
    if q:
        query["$or"] = [
            {"form_no": {"$regex": q, "$options": "i"}},
            {"lines.vendor_name": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
        ]
    items = await db.transfer_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(int(limit)).to_list(int(limit))
    return {"items": items, "total": len(items)}


@router.post("/transfer-requests")
async def create_trf(payload: TrfIn, current: dict = Depends(get_current_user)):
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Minimal 1 baris pembayaran")
    seq = await _next_seq_dynamic()
    now = _now_iso()
    lines = []
    for i, ln in enumerate(payload.lines, start=1):
        d = ln.dict()
        d["no"] = i
        _compute_line(d)
        lines.append(d)
        # simpan/perbarui master bank vendor bila ada info rekening
        if d.get("vendor_name") and (d.get("account_no") or d.get("bank_name")):
            vname = d["vendor_name"].strip()
            exist = await db.vendor_banks.find_one({"vendor_name": {"$regex": f"^{vname}$", "$options": "i"}, **NOT_DELETED_FILTER})
            vb = {
                "vendor_name": vname, "bank_name": d.get("bank_name", ""),
                "account_no": d.get("account_no", ""), "account_holder": d.get("account_holder", ""),
                "currency": d.get("currency", "IDR"), "updated_at": now,
            }
            if exist:
                await db.vendor_banks.update_one({"id": exist["id"]}, {"$set": vb})
            else:
                vb["id"] = str(uuid.uuid4()); vb["created_at"] = now
                await db.vendor_banks.insert_one(dict(vb))

    total_transfer = round(sum(l["net_transfer"] for l in lines), 2)
    doc = {
        "id": str(uuid.uuid4()),
        "form_no": _fmt_no(seq),
        "date": payload.date or now[:10],
        "to_dept": payload.to_dept or "Finance",
        "notes": payload.notes or "",
        "lines": lines,
        "total_transfer": total_transfer,
        "status": "diajukan",
        "requested_by": current.get("id"),
        "requested_by_name": current.get("name") or current.get("username"),
        "requested_by_role": current.get("role", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db.transfer_requests.insert_one(dict(doc))
    doc.pop("_id", None)
    await log_action(current, "trf_create", "transfer_requests", doc["id"], {"form_no": doc["form_no"], "total": total_transfer})
    return doc


@router.put("/transfer-requests/{trf_id}")
async def update_trf(trf_id: str, payload: TrfIn, current: dict = Depends(get_current_user)):
    existing = await db.transfer_requests.find_one({"id": trf_id, **NOT_DELETED_FILTER})
    if not existing:
        raise HTTPException(status_code=404, detail="TRF tidak ditemukan")
    if not _can_manage(current, existing):
        raise HTTPException(status_code=403, detail="Anda hanya bisa mengedit TRF milik sendiri")
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Minimal 1 baris pembayaran")
    now = _now_iso()
    lines = []
    for i, ln in enumerate(payload.lines, start=1):
        d = ln.dict()
        d["no"] = i
        _compute_line(d)
        lines.append(d)
        if d.get("vendor_name") and (d.get("account_no") or d.get("bank_name")):
            vname = d["vendor_name"].strip()
            exist = await db.vendor_banks.find_one({"vendor_name": {"$regex": f"^{vname}$", "$options": "i"}, **NOT_DELETED_FILTER})
            vb = {
                "vendor_name": vname, "bank_name": d.get("bank_name", ""),
                "account_no": d.get("account_no", ""), "account_holder": d.get("account_holder", ""),
                "currency": d.get("currency", "IDR"), "updated_at": now,
            }
            if exist:
                await db.vendor_banks.update_one({"id": exist["id"]}, {"$set": vb})
            else:
                vb["id"] = str(uuid.uuid4()); vb["created_at"] = now
                await db.vendor_banks.insert_one(dict(vb))
    total_transfer = round(sum(l["net_transfer"] for l in lines), 2)
    update_fields = {
        "date": payload.date or existing.get("date"),
        "notes": payload.notes or "",
        "lines": lines,
        "total_transfer": total_transfer,
        "updated_at": now,
        "updated_by_name": current.get("name") or current.get("username"),
    }
    await db.transfer_requests.update_one({"id": trf_id}, {"$set": update_fields})
    await log_action(current, "trf_update", "transfer_requests", trf_id, {"form_no": existing.get("form_no"), "total": total_transfer})
    doc = await db.transfer_requests.find_one({"id": trf_id, **NOT_DELETED_FILTER}, {"_id": 0})
    return doc


@router.get("/transfer-requests/{trf_id}")
async def get_trf(trf_id: str, current: dict = Depends(get_current_user)):
    doc = await db.transfer_requests.find_one({"id": trf_id, **NOT_DELETED_FILTER}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="TRF tidak ditemukan")
    if not _can_manage(current, doc):
        raise HTTPException(status_code=403, detail="TRF ini milik user lain. Hanya pemilik atau Admin yang bisa membuka.")
    return doc


@router.delete("/transfer-requests/{trf_id}")
async def delete_trf(trf_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("admin", "super_admin") and not current.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Hanya Admin yang boleh menghapus TRF")
    ok = await soft_delete_one("transfer_requests", {"id": trf_id}, current)
    if not ok:
        raise HTTPException(status_code=404, detail="TRF tidak ditemukan")
    return {"success": True}


@router.get("/transfer-requests/{trf_id}/pdf")
async def trf_pdf(trf_id: str, current: dict = Depends(get_current_user)):
    doc = await db.transfer_requests.find_one({"id": trf_id, **NOT_DELETED_FILTER}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="TRF tidak ditemukan")
    if not _can_manage(current, doc):
        raise HTTPException(status_code=403, detail="TRF ini milik user lain. Hanya pemilik atau Admin yang bisa mencetak.")
    prep_role = doc.get("requested_by_role") or ""
    if not prep_role and doc.get("requested_by"):
        u = await db.users.find_one({"id": doc["requested_by"]})
        prep_role = (u or {}).get("role", "")
    buf = _render_trf_pdf(doc, _display_prep_role(doc.get("requested_by_name", ""), prep_role))
    fname = doc["form_no"].replace("/", "_") + ".pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fname}"'})


@router.post("/transfer-requests/preview-pdf")
async def trf_preview_pdf(payload: TrfIn, current: dict = Depends(get_current_user)):
    """Render PDF dari data yang belum disimpan (preview sebelum simpan)."""
    lines = []
    for i, ln in enumerate(payload.lines, start=1):
        d = ln.dict()
        d["no"] = i
        _compute_line(d)
        lines.append(d)
    total = round(sum(l.get("net_transfer", 0) for l in lines), 2)
    seq = await _next_seq_dynamic()
    doc = {
        "form_no": _fmt_no(seq),
        "date": payload.date or _now_iso()[:10],
        "to_dept": payload.to_dept or "Finance",
        "notes": payload.notes or "",
        "lines": lines,
        "total_transfer": total,
        "requested_by_name": current.get("name") or current.get("username"),
        "created_at": _now_iso(),
    }
    buf = _render_trf_pdf(doc, _display_prep_role(current.get("name") or current.get("username"), current.get("role", "")))
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="TRF_preview.pdf"'})
