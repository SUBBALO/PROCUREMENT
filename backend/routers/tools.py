"""Alat Ukur (kalibrasi) + Alat/Tools Produksi (peminjaman).

1) Masterlist Alat Ukur — QC/Produksi:
   - CRUD alat ukur (measurement_tools)
   - Riwayat kalibrasi pihak ke-3 (tool_calibrations) + upload sertifikat (GridFS)
   - Status otomatis: ok / due_soon (H-30) / overdue / never

2) Inventory Alat Produksi — peminjaman:
   - CRUD alat (production_tools)
   - Transaksi pinjam/kembali/hilang (tool_loans) + riwayat per alat
"""
import io
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel

from db import db
from deps import (
    _now_iso,
    get_current_user,
    is_admin_like,
    is_production,
    is_qc,
    log_action,
)

router = APIRouter(tags=["tools"])

CALIB_REMINDER_DAYS = 30  # H-30 default


def _can_access(user: dict) -> bool:
    """QC, Produksi, dan admin-like boleh kelola alat ukur & tools."""
    return is_qc(user) or is_production(user) or is_admin_like(user)


def _guard(user: dict):
    if not _can_access(user):
        raise HTTPException(status_code=403, detail="Hanya QC/Produksi/Admin yang bisa mengakses")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


_cert_bucket = None


def _cert_fs() -> AsyncIOMotorGridFSBucket:
    global _cert_bucket
    if _cert_bucket is None:
        _cert_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="calibration_certs")
    return _cert_bucket


# ═══════════════════════════════════════════════════════════════════════════
# 1) MASTERLIST ALAT UKUR + KALIBRASI
# ═══════════════════════════════════════════════════════════════════════════
class MeasuringToolIn(BaseModel):
    tool_code: str = ""
    name: str
    brand: str = ""
    model: str = ""
    serial_no: str = ""
    size_range: str = ""
    location: str = ""
    holder: str = ""          # penanggung jawab
    status: str = "aktif"     # aktif / rusak / hilang / tidak_dipakai
    notes: str = ""


def _cal_status(due_date: Optional[str], has_cal: bool) -> dict:
    """Hitung status kalibrasi: never / ok / due_soon / overdue + sisa hari."""
    if not has_cal or not due_date:
        return {"cal_status": "never", "days_left": None}
    today = _today()
    try:
        d_due = datetime.strptime(due_date[:10], "%Y-%m-%d").date()
        d_now = datetime.strptime(today, "%Y-%m-%d").date()
        days_left = (d_due - d_now).days
    except Exception:
        return {"cal_status": "never", "days_left": None}
    if days_left < 0:
        return {"cal_status": "overdue", "days_left": days_left}
    if days_left <= CALIB_REMINDER_DAYS:
        return {"cal_status": "due_soon", "days_left": days_left}
    return {"cal_status": "ok", "days_left": days_left}


def _serialize_mtool(t: dict) -> dict:
    out = {
        "id": t.get("id"),
        "tool_code": t.get("tool_code") or "",
        "name": t.get("name") or "",
        "brand": t.get("brand") or "",
        "model": t.get("model") or "",
        "serial_no": t.get("serial_no") or "",
        "size_range": t.get("size_range") or "",
        "location": t.get("location") or "",
        "holder": t.get("holder") or "",
        "status": t.get("status") or "aktif",
        "notes": t.get("notes") or "",
        "last_cal_date": t.get("last_cal_date") or "",
        "last_cal_vendor": t.get("last_cal_vendor") or "",
        "due_date": t.get("due_date") or "",
        "created_at": t.get("created_at") or "",
    }
    out.update(_cal_status(out["due_date"], bool(out["last_cal_date"])))
    return out


async def _next_tool_code(prefix: str, coll) -> str:
    n = await coll.count_documents({})
    return f"{prefix}-{n + 1:04d}"


@router.get("/qc/measuring-tools")
async def list_measuring_tools(
    q: Optional[str] = None,
    status_filter: Optional[str] = None,   # cal_status: ok/due_soon/overdue/never
    current: dict = Depends(get_current_user),
):
    _guard(current)
    filt: dict = {}
    if q and q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        filt["$or"] = [{"name": rx}, {"tool_code": rx}, {"brand": rx}, {"serial_no": rx}, {"location": rx}, {"holder": rx}]
    rows = await db.measurement_tools.find(filt, {"_id": 0}).sort("tool_code", 1).to_list(length=1000)
    items = [_serialize_mtool(t) for t in rows]
    if status_filter:
        items = [i for i in items if i["cal_status"] == status_filter]
    summary = {"total": len(rows), "ok": 0, "due_soon": 0, "overdue": 0, "never": 0}
    for t in rows:
        s = _serialize_mtool(t)["cal_status"]
        summary[s] = summary.get(s, 0) + 1
    return {"items": items, "summary": summary, "reminder_days": CALIB_REMINDER_DAYS}


@router.post("/qc/measuring-tools")
async def create_measuring_tool(payload: MeasuringToolIn, current: dict = Depends(get_current_user)):
    _guard(current)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama alat wajib diisi")
    code = (payload.tool_code or "").strip() or await _next_tool_code("AU", db.measurement_tools)
    dup = await db.measurement_tools.find_one({"tool_code": code})
    if dup:
        raise HTTPException(status_code=400, detail=f"Kode alat {code} sudah dipakai")
    doc = {
        "id": str(uuid.uuid4()),
        "tool_code": code,
        "name": name,
        "brand": (payload.brand or "").strip(),
        "model": (payload.model or "").strip(),
        "serial_no": (payload.serial_no or "").strip(),
        "size_range": (payload.size_range or "").strip(),
        "location": (payload.location or "").strip(),
        "holder": (payload.holder or "").strip(),
        "status": (payload.status or "aktif").strip(),
        "notes": (payload.notes or "").strip(),
        "last_cal_date": "",
        "last_cal_vendor": "",
        "due_date": "",
        "created_by": current.get("username"),
        "created_at": _now_iso(),
    }
    await db.measurement_tools.insert_one(doc.copy())
    await log_action(current, "create_measuring_tool", "measuring_tool", doc["id"], {"code": code, "name": name})
    return _serialize_mtool(doc)


@router.put("/qc/measuring-tools/{tool_id}")
async def update_measuring_tool(tool_id: str, payload: MeasuringToolIn, current: dict = Depends(get_current_user)):
    _guard(current)
    existing = await db.measurement_tools.find_one({"id": tool_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    code = (payload.tool_code or "").strip() or existing.get("tool_code")
    dup = await db.measurement_tools.find_one({"tool_code": code, "id": {"$ne": tool_id}})
    if dup:
        raise HTTPException(status_code=400, detail=f"Kode alat {code} sudah dipakai")
    updates = {
        "tool_code": code,
        "name": (payload.name or "").strip(),
        "brand": (payload.brand or "").strip(),
        "model": (payload.model or "").strip(),
        "serial_no": (payload.serial_no or "").strip(),
        "size_range": (payload.size_range or "").strip(),
        "location": (payload.location or "").strip(),
        "holder": (payload.holder or "").strip(),
        "status": (payload.status or "aktif").strip(),
        "notes": (payload.notes or "").strip(),
        "updated_at": _now_iso(),
    }
    await db.measurement_tools.update_one({"id": tool_id}, {"$set": updates})
    await log_action(current, "update_measuring_tool", "measuring_tool", tool_id, {"code": code})
    return _serialize_mtool({**existing, **updates})


@router.delete("/qc/measuring-tools/{tool_id}")
async def delete_measuring_tool(tool_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    existing = await db.measurement_tools.find_one({"id": tool_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    # hapus sertifikat GridFS milik alat ini
    cals = await db.tool_calibrations.find({"tool_id": tool_id}).to_list(length=500)
    fs = _cert_fs()
    for c in cals:
        if c.get("cert_file_id"):
            try:
                await fs.delete(ObjectId(c["cert_file_id"]))
            except Exception:
                pass
    await db.tool_calibrations.delete_many({"tool_id": tool_id})
    await db.measurement_tools.delete_one({"id": tool_id})
    await log_action(current, "delete_measuring_tool", "measuring_tool", tool_id,
                     {"code": existing.get("tool_code"), "name": existing.get("name")})
    return {"ok": True}


# ---------------- Kalibrasi ----------------
@router.get("/qc/measuring-tools/{tool_id}/calibrations")
async def list_calibrations(tool_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    rows = await db.tool_calibrations.find({"tool_id": tool_id}, {"_id": 0}).sort("cal_date", -1).to_list(length=200)
    return {"items": rows}


@router.post("/qc/measuring-tools/{tool_id}/calibrations")
async def add_calibration(
    tool_id: str,
    vendor: str = Form(...),
    cal_date: str = Form(...),
    due_date: str = Form(...),
    cert_no: str = Form(""),
    result: str = Form("pass"),
    notes: str = Form(""),
    file: Optional[UploadFile] = File(None),
    current: dict = Depends(get_current_user),
):
    _guard(current)
    tool = await db.measurement_tools.find_one({"id": tool_id})
    if not tool:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    vendor = (vendor or "").strip()
    if not vendor:
        raise HTTPException(status_code=400, detail="Vendor kalibrasi wajib diisi")
    if not cal_date or not due_date:
        raise HTTPException(status_code=400, detail="Tanggal kalibrasi & jatuh tempo wajib diisi")
    if due_date < cal_date:
        raise HTTPException(status_code=400, detail="Tanggal jatuh tempo tidak boleh sebelum tanggal kalibrasi")

    cert_file_id, cert_mime, cert_filename = None, None, None
    if file is not None:
        content = await file.read()
        if content:
            if len(content) > 10 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="File sertifikat terlalu besar (max 10MB)")
            mime = (file.content_type or "").lower()
            ext = (file.filename or "").lower().split(".")[-1]
            allowed_mime = ("application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp")
            if mime not in allowed_mime and ext not in ("pdf", "png", "jpg", "jpeg", "webp"):
                raise HTTPException(status_code=400, detail="Hanya PDF/PNG/JPG yang diterima untuk sertifikat")
            gid = await _cert_fs().upload_from_stream(
                file.filename or f"cert_{tool_id}.pdf",
                io.BytesIO(content),
                metadata={"tool_id": tool_id, "mime": mime, "size": len(content), "uploaded_at": _now_iso()},
            )
            cert_file_id, cert_mime, cert_filename = str(gid), mime, (file.filename or "sertifikat.pdf")

    doc = {
        "id": str(uuid.uuid4()),
        "tool_id": tool_id,
        "tool_code": tool.get("tool_code"),
        "vendor": vendor,
        "cert_no": (cert_no or "").strip(),
        "cal_date": cal_date[:10],
        "due_date": due_date[:10],
        "result": (result or "pass").strip(),
        "notes": (notes or "").strip(),
        "cert_file_id": cert_file_id,
        "cert_mime": cert_mime,
        "cert_filename": cert_filename,
        "created_by": current.get("name") or current.get("username"),
        "created_at": _now_iso(),
    }
    await db.tool_calibrations.insert_one(doc.copy())
    # Update ringkasan kalibrasi TERBARU di master alat (berdasar cal_date terbesar)
    latest = await db.tool_calibrations.find({"tool_id": tool_id}).sort("cal_date", -1).limit(1).to_list(length=1)
    if latest:
        await db.measurement_tools.update_one({"id": tool_id}, {"$set": {
            "last_cal_date": latest[0].get("cal_date"),
            "last_cal_vendor": latest[0].get("vendor"),
            "due_date": latest[0].get("due_date"),
        }})
    await log_action(current, "add_calibration", "measuring_tool", tool_id,
                     {"vendor": vendor, "cal_date": cal_date[:10], "due_date": due_date[:10]})
    doc.pop("_id", None)
    return doc


@router.delete("/qc/calibrations/{cal_id}")
async def delete_calibration(cal_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    cal = await db.tool_calibrations.find_one({"id": cal_id})
    if not cal:
        raise HTTPException(status_code=404, detail="Data kalibrasi tidak ditemukan")
    if cal.get("cert_file_id"):
        try:
            await _cert_fs().delete(ObjectId(cal["cert_file_id"]))
        except Exception:
            pass
    await db.tool_calibrations.delete_one({"id": cal_id})
    # refresh ringkasan di master
    tool_id = cal.get("tool_id")
    latest = await db.tool_calibrations.find({"tool_id": tool_id}).sort("cal_date", -1).limit(1).to_list(length=1)
    upd = {"last_cal_date": "", "last_cal_vendor": "", "due_date": ""}
    if latest:
        upd = {"last_cal_date": latest[0].get("cal_date"), "last_cal_vendor": latest[0].get("vendor"),
               "due_date": latest[0].get("due_date")}
    await db.measurement_tools.update_one({"id": tool_id}, {"$set": upd})
    await log_action(current, "delete_calibration", "measuring_tool", tool_id, {"cal_id": cal_id})
    return {"ok": True}


@router.get("/qc/calibrations/cert/{file_id}")
async def download_cert(file_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    try:
        stream = await _cert_fs().open_download_stream(ObjectId(file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="File sertifikat tidak ditemukan")
    buf = io.BytesIO()
    async for chunk in stream:
        buf.write(chunk)
    buf.seek(0)
    meta = stream.metadata or {}
    mime = meta.get("mime") or "application/pdf"
    fname = stream.filename or "sertifikat.pdf"
    return StreamingResponse(buf, media_type=mime,
                             headers={"Content-Disposition": f'inline; filename="{fname}"',
                                      "Cache-Control": "private, max-age=300"})


@router.get("/qc/measuring-tools-reminders")
async def calibration_reminders(current: dict = Depends(get_current_user)):
    """Alat yang due_soon (H-30) atau overdue — untuk badge & notifikasi."""
    _guard(current)
    rows = await db.measurement_tools.find({}, {"_id": 0}).to_list(length=1000)
    due_soon, overdue = [], []
    for t in rows:
        s = _serialize_mtool(t)
        if s["cal_status"] == "due_soon":
            due_soon.append(s)
        elif s["cal_status"] == "overdue":
            overdue.append(s)
    return {"due_soon": due_soon, "overdue": overdue,
            "count": len(due_soon) + len(overdue), "reminder_days": CALIB_REMINDER_DAYS}


# ═══════════════════════════════════════════════════════════════════════════
# 2) INVENTORY ALAT PRODUKSI + PEMINJAMAN
# ═══════════════════════════════════════════════════════════════════════════
class ProdToolIn(BaseModel):
    tool_code: str = ""
    name: str
    brand: str = ""
    spec: str = ""
    location: str = ""
    condition: str = "baik"   # baik / rusak
    notes: str = ""


class BorrowIn(BaseModel):
    borrower_name: str
    purpose: str = ""
    so_no: str = ""
    borrow_date: str = ""
    est_return_date: str = ""


class ReturnIn(BaseModel):
    return_date: str = ""
    condition: str = "baik"   # baik / rusak
    note: str = ""


class MissingIn(BaseModel):
    note: str = ""


def _serialize_ptool(t: dict) -> dict:
    return {
        "id": t.get("id"),
        "tool_code": t.get("tool_code") or "",
        "name": t.get("name") or "",
        "brand": t.get("brand") or "",
        "spec": t.get("spec") or "",
        "location": t.get("location") or "",
        "condition": t.get("condition") or "baik",
        "status": t.get("status") or "available",  # available/borrowed/missing/maintenance
        "holder_name": t.get("holder_name") or "",
        "held_since": t.get("held_since") or "",
        "est_return_date": t.get("est_return_date") or "",
        "notes": t.get("notes") or "",
        "created_at": t.get("created_at") or "",
    }


@router.get("/production/tools")
async def list_prod_tools(
    q: Optional[str] = None,
    status_filter: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    _guard(current)
    filt: dict = {}
    if q and q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        filt["$or"] = [{"name": rx}, {"tool_code": rx}, {"brand": rx}, {"location": rx}, {"holder_name": rx}]
    if status_filter:
        filt["status"] = status_filter
    rows = await db.production_tools.find(filt, {"_id": 0}).sort("tool_code", 1).to_list(length=1000)
    all_rows = await db.production_tools.find({}, {"status": 1}).to_list(length=2000)
    summary = {"total": len(all_rows), "available": 0, "borrowed": 0, "missing": 0, "maintenance": 0}
    for t in all_rows:
        s = t.get("status") or "available"
        summary[s] = summary.get(s, 0) + 1
    return {"items": [_serialize_ptool(t) for t in rows], "summary": summary}


@router.post("/production/tools")
async def create_prod_tool(payload: ProdToolIn, current: dict = Depends(get_current_user)):
    _guard(current)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama alat wajib diisi")
    code = (payload.tool_code or "").strip() or await _next_tool_code("TL", db.production_tools)
    dup = await db.production_tools.find_one({"tool_code": code})
    if dup:
        raise HTTPException(status_code=400, detail=f"Kode alat {code} sudah dipakai")
    doc = {
        "id": str(uuid.uuid4()),
        "tool_code": code,
        "name": name,
        "brand": (payload.brand or "").strip(),
        "spec": (payload.spec or "").strip(),
        "location": (payload.location or "").strip(),
        "condition": (payload.condition or "baik").strip(),
        "status": "available",
        "holder_name": "",
        "held_since": "",
        "est_return_date": "",
        "notes": (payload.notes or "").strip(),
        "created_by": current.get("username"),
        "created_at": _now_iso(),
    }
    await db.production_tools.insert_one(doc.copy())
    await log_action(current, "create_prod_tool", "production_tool", doc["id"], {"code": code, "name": name})
    return _serialize_ptool(doc)


@router.put("/production/tools/{tool_id}")
async def update_prod_tool(tool_id: str, payload: ProdToolIn, current: dict = Depends(get_current_user)):
    _guard(current)
    existing = await db.production_tools.find_one({"id": tool_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    code = (payload.tool_code or "").strip() or existing.get("tool_code")
    dup = await db.production_tools.find_one({"tool_code": code, "id": {"$ne": tool_id}})
    if dup:
        raise HTTPException(status_code=400, detail=f"Kode alat {code} sudah dipakai")
    updates = {
        "tool_code": code,
        "name": (payload.name or "").strip(),
        "brand": (payload.brand or "").strip(),
        "spec": (payload.spec or "").strip(),
        "location": (payload.location or "").strip(),
        "condition": (payload.condition or "baik").strip(),
        "notes": (payload.notes or "").strip(),
        "updated_at": _now_iso(),
    }
    await db.production_tools.update_one({"id": tool_id}, {"$set": updates})
    await log_action(current, "update_prod_tool", "production_tool", tool_id, {"code": code})
    return _serialize_ptool({**existing, **updates})


@router.delete("/production/tools/{tool_id}")
async def delete_prod_tool(tool_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    existing = await db.production_tools.find_one({"id": tool_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    if (existing.get("status") or "available") == "borrowed":
        raise HTTPException(status_code=400, detail="Alat sedang dipinjam — kembalikan dulu sebelum menghapus")
    await db.production_tools.delete_one({"id": tool_id})
    await log_action(current, "delete_prod_tool", "production_tool", tool_id,
                     {"code": existing.get("tool_code"), "name": existing.get("name")})
    return {"ok": True}


# ---------------- Pinjam / Kembali / Hilang ----------------
@router.post("/production/tools/{tool_id}/borrow")
async def borrow_tool(tool_id: str, payload: BorrowIn, current: dict = Depends(get_current_user)):
    _guard(current)
    tool = await db.production_tools.find_one({"id": tool_id})
    if not tool:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    status = tool.get("status") or "available"
    if status == "borrowed":
        raise HTTPException(status_code=400, detail=f"Alat sedang dipinjam oleh {tool.get('holder_name') or '-'}")
    if status == "missing":
        raise HTTPException(status_code=400, detail="Alat berstatus HILANG — tandai ditemukan dulu")
    borrower = (payload.borrower_name or "").strip()
    if not borrower:
        raise HTTPException(status_code=400, detail="Nama peminjam wajib diisi")
    bdate = (payload.borrow_date or "").strip()[:10] or _today()
    loan = {
        "id": str(uuid.uuid4()),
        "tool_id": tool_id,
        "tool_code": tool.get("tool_code"),
        "tool_name": tool.get("name"),
        "borrower_name": borrower,
        "purpose": (payload.purpose or "").strip(),
        "so_no": (payload.so_no or "").strip(),
        "borrow_date": bdate,
        "est_return_date": (payload.est_return_date or "").strip()[:10],
        "status": "out",   # out / returned / missing
        "return_date": "",
        "return_condition": "",
        "note": "",
        "created_by": current.get("name") or current.get("username"),
        "created_at": _now_iso(),
    }
    await db.tool_loans.insert_one(loan.copy())
    await db.production_tools.update_one({"id": tool_id}, {"$set": {
        "status": "borrowed",
        "holder_name": borrower,
        "held_since": bdate,
        "est_return_date": loan["est_return_date"],
        "current_loan_id": loan["id"],
    }})
    await log_action(current, "borrow_tool", "production_tool", tool_id,
                     {"borrower": borrower, "code": tool.get("tool_code")})
    loan.pop("_id", None)
    return loan


@router.post("/production/tools/{tool_id}/return")
async def return_tool(tool_id: str, payload: ReturnIn, current: dict = Depends(get_current_user)):
    _guard(current)
    tool = await db.production_tools.find_one({"id": tool_id})
    if not tool:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    loan = await db.tool_loans.find_one({"tool_id": tool_id, "status": "out"})
    if not loan:
        raise HTTPException(status_code=400, detail="Tidak ada peminjaman aktif untuk alat ini")
    rdate = (payload.return_date or "").strip()[:10] or _today()
    cond = (payload.condition or "baik").strip()
    await db.tool_loans.update_one({"id": loan["id"]}, {"$set": {
        "status": "returned", "return_date": rdate,
        "return_condition": cond, "note": (payload.note or "").strip(),
        "returned_by": current.get("name") or current.get("username"),
    }})
    new_status = "maintenance" if cond == "rusak" else "available"
    await db.production_tools.update_one({"id": tool_id}, {"$set": {
        "status": new_status, "condition": cond,
        "holder_name": "", "held_since": "", "est_return_date": "", "current_loan_id": None,
    }})
    await log_action(current, "return_tool", "production_tool", tool_id,
                     {"borrower": loan.get("borrower_name"), "condition": cond})
    return {"ok": True, "status": new_status}


@router.post("/production/tools/{tool_id}/missing")
async def mark_tool_missing(tool_id: str, payload: MissingIn, current: dict = Depends(get_current_user)):
    _guard(current)
    tool = await db.production_tools.find_one({"id": tool_id})
    if not tool:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    loan = await db.tool_loans.find_one({"tool_id": tool_id, "status": "out"})
    if loan:
        await db.tool_loans.update_one({"id": loan["id"]}, {"$set": {
            "status": "missing", "note": (payload.note or "").strip(),
        }})
    await db.production_tools.update_one({"id": tool_id}, {"$set": {
        "status": "missing",
        "notes": (payload.note or tool.get("notes") or "").strip(),
    }})
    await log_action(current, "tool_missing", "production_tool", tool_id,
                     {"code": tool.get("tool_code"), "last_holder": tool.get("holder_name")})
    return {"ok": True}


@router.post("/production/tools/{tool_id}/found")
async def mark_tool_found(tool_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    tool = await db.production_tools.find_one({"id": tool_id})
    if not tool:
        raise HTTPException(status_code=404, detail="Alat tidak ditemukan")
    if (tool.get("status") or "") not in ("missing", "maintenance"):
        raise HTTPException(status_code=400, detail="Alat tidak berstatus hilang/maintenance")
    await db.production_tools.update_one({"id": tool_id}, {"$set": {
        "status": "available", "condition": "baik",
        "holder_name": "", "held_since": "", "est_return_date": "", "current_loan_id": None,
    }})
    await log_action(current, "tool_found", "production_tool", tool_id, {"code": tool.get("tool_code")})
    return {"ok": True}


@router.get("/production/tools/{tool_id}/history")
async def tool_history(tool_id: str, current: dict = Depends(get_current_user)):
    _guard(current)
    rows = await db.tool_loans.find({"tool_id": tool_id}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    return {"items": rows}


@router.get("/production/tools-borrowers")
async def tool_borrower_options(current: dict = Depends(get_current_user)):
    """Opsi peminjam: karyawan produksi aktif."""
    _guard(current)
    rows = await db.production_employees.find(
        {"active": {"$ne": False}}, {"_id": 0, "name": 1}
    ).sort("name", 1).to_list(length=500)
    return {"names": [r.get("name") for r in rows if r.get("name")]}
