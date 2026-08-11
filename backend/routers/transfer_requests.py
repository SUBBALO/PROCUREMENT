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
    fee = float(ln.get("fee") or 0)
    base_idr = amount * rate
    pph_amount = (base_idr * float(ln.get("pph_percent") or 0) / 100.0) if ln.get("taxed") else 0.0
    net_transfer = base_idr - pph_amount + fee
    ln["base_idr"] = round(base_idr, 2)
    ln["pph_amount"] = round(pph_amount, 2)
    ln["net_transfer"] = round(net_transfer, 2)
    return ln


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


# ------------------------- Transfer Requests -------------------------
@router.get("/transfer-requests/next-no")
async def preview_next_trf_no(current: dict = Depends(get_current_user)):
    now = datetime.utcnow()
    key = f"crf:{now.year}-{now.month:02d}"
    doc = await db.counters.find_one({"_id": key})
    seq = int(doc.get("seq", 0)) + 1 if doc else 1
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
    seq = await _next_seq("crf")
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
        "created_at": now,
        "updated_at": now,
    }
    await db.transfer_requests.insert_one(dict(doc))
    doc.pop("_id", None)
    await log_action(current, "trf_create", "transfer_requests", doc["id"], {"form_no": doc["form_no"], "total": total_transfer})
    return doc


@router.get("/transfer-requests/{trf_id}")
async def get_trf(trf_id: str, current: dict = Depends(get_current_user)):
    doc = await db.transfer_requests.find_one({"id": trf_id, **NOT_DELETED_FILTER}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="TRF tidak ditemukan")
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

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=12 * mm, rightMargin=12 * mm)
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Title"], fontSize=15, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=7)
    elems = []
    elems.append(Paragraph("TRANSFER REQUEST FORM", h))
    elems.append(Paragraph(f"No: <b>{doc['form_no']}</b> &nbsp;·&nbsp; Tanggal: {doc.get('date','')} &nbsp;·&nbsp; Ditujukan: {doc.get('to_dept','Finance')} &nbsp;·&nbsp; Diajukan: {doc.get('requested_by_name','')}", sub))
    elems.append(Spacer(1, 8))

    def money(v):
        try:
            return f"{float(v):,.2f}"
        except Exception:
            return "0.00"

    inv_style = ParagraphStyle("inv", parent=small, textColor=colors.HexColor("#dc2626"), fontSize=6.5)

    head = ["No", "Vendor Name", "Description", "SO", "Qty", "UoM", "Total Price", "Rate", "PPh", "Fee", "Amount (IDR)"]
    rows = [head]
    for ln in doc.get("lines", []):
        # Vendor cell — nama vendor + bank/rekening di bawah (abu-abu kecil)
        vlines = [ln.get("vendor_name", "") or "-"]
        bank_bits = " · ".join([b for b in [ln.get("bank_name", ""), ln.get("account_no", ""), ln.get("account_holder", "")] if b])
        vcell = [Paragraph(f"<b>{ln.get('vendor_name','') or '-'}</b>", small)]
        if bank_bits:
            vcell.append(Paragraph(bank_bits, ParagraphStyle("bk", parent=small, textColor=colors.grey, fontSize=6.5)))
        # Description cell — uraian + invoice merah
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
    rows.append(["", "", "", "", "", "", "", "", "", "TOTAL", f"IDR {money(doc.get('total_transfer'))}"])
    t = Table(rows, repeatRows=1, colWidths=[8*mm, 52*mm, 62*mm, 26*mm, 12*mm, 12*mm, 30*mm, 26*mm, 22*mm, 26*mm, 34*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#94a3b8")),
        ("ALIGN", (6, 1), (10, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (5, -1), "CENTER"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fee2e2")),
        ("FONTNAME", (9, -1), (10, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    elems.append(t)
    if doc.get("notes"):
        elems.append(Spacer(1, 8))
        elems.append(Paragraph(f"<b>Catatan:</b> {doc['notes']}", small))
    elems.append(Spacer(1, 24))
    sign = Table([["Diajukan oleh", "Disetujui", "Finance"],
                  ["\n\n\n_________________", "\n\n\n_________________", "\n\n\n_________________"],
                  [doc.get("requested_by_name", ""), "", ""]],
                 colWidths=[80*mm, 80*mm, 80*mm])
    sign.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    elems.append(sign)

    pdf.build(elems)
    buf.seek(0)
    fname = doc["form_no"].replace("/", "_") + ".pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fname}"'})
