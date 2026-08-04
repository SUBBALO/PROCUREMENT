"""NONCONFORMANCE (CAR) — Corrective Action Report terhadap Drawing.

Alur:
  QC / Produksi / Sales menerbitkan NC terhadap 1 atau banyak Drawing.
  Engineering Leader menindaklanjuti: assign ke staff → revisi → terbit ECN.

Status flow: open → assigned → in_progress → closed

Catatan penting:
  - Baseline schema ini SENGAJA dibuat fleksibel. Field detail sesuai template
    NCR resmi perusahaan akan ditambahkan belakangan (extend tanpa breaking).
  - KPI #1 Engineering (Drawing tanpa NC) dihitung dari koleksi ini
    berdasarkan BULAN NC diterbitkan (issued_at) — lihat routers/kpi.py.
  - Auditability: semua perubahan status dicatat di `timeline` + activity_logs.
"""
from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field

from db import db
from deps import (
    get_current_user, log_action, is_admin_like, is_eng_head, is_engineering,
    is_nc_issuer, is_qc, is_production, is_sales,
)

router = APIRouter(tags=["nonconformance"])

# ── Status ──────────────────────────────────────────────────────────────────
STATUS_OPEN = "open"
STATUS_ASSIGNED = "assigned"
STATUS_IN_PROGRESS = "in_progress"
STATUS_CLOSED = "closed"
VALID_STATUSES = {STATUS_OPEN, STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_CLOSED}
STATUS_LABELS = {
    STATUS_OPEN: "Open",
    STATUS_ASSIGNED: "Assigned",
    STATUS_IN_PROGRESS: "In Progress",
    STATUS_CLOSED: "Closed",
}

SEVERITY_LEVELS = {"minor", "major", "critical"}
ISSUER_DEPTS = {"qc", "produksi", "sales"}


# ── GridFS untuk lampiran bukti NC ────────────────────────────────────────────
_gridfs: Optional[AsyncIOMotorGridFSBucket] = None


def _fs() -> AsyncIOMotorGridFSBucket:
    global _gridfs
    if _gridfs is None:
        _gridfs = AsyncIOMotorGridFSBucket(db, bucket_name="nc_attachments")
    return _gridfs


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ext(name: str) -> str:
    return os.path.splitext(name or "")[1].lower()


def _clean(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


def _actor(user: dict) -> dict:
    return {"id": user.get("id"), "name": user.get("name") or user.get("username"),
            "role": user.get("role")}


def _issuer_dept_of(user: dict) -> str:
    if is_qc(user):
        return "qc"
    if is_production(user):
        return "produksi"
    if is_sales(user):
        return "sales"
    return "qc"  # admin-like default; boleh dioverride via payload


async def _next_nc_no() -> str:
    """Format: NC-YY-MM-NN (NN urut per bulan)."""
    now = datetime.now(timezone.utc)
    yy = f"{now.year % 100:02d}"
    mm = f"{now.month:02d}"
    key = f"nc_{now.year}_{now.month}"
    counter = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"value": 1}}, upsert=True, return_document=True,
    )
    seq = (counter or {}).get("value", 1)
    return f"NC-{yy}-{mm}-{seq:02d}"


async def _get_nc_or_404(nc_id: str) -> dict:
    doc = await db.nonconformances.find_one({"id": nc_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="NC tidak ditemukan")
    return doc


def _can_view(user: dict) -> bool:
    """QC/Produksi/Sales/Engineering/Admin boleh melihat masterlist CAR."""
    return is_nc_issuer(user) or is_engineering(user) or is_admin_like(user)


# ── Payloads ─────────────────────────────────────────────────────────────────
class DrawingRef(BaseModel):
    drawing_id: str = ""
    drawing_no: str = ""


class NonconformanceCreate(BaseModel):
    # Baseline fields (akan di-extend setelah template NCR resmi diterima).
    drawings: List[DrawingRef] = Field(default_factory=list)  # bisa >1 drawing
    title: str = ""                       # ringkasan masalah
    description: str = ""                 # detail temuan/ketidaksesuaian
    severity: str = "major"              # minor | major | critical
    issuer_dept: Optional[str] = None    # override (admin) — default dari role
    so_no: Optional[str] = ""
    customer_name: Optional[str] = ""
    # kolom bebas tambahan untuk menampung field template NCR nanti
    extra: dict = Field(default_factory=dict)


class AssignIn(BaseModel):
    assignee_id: str
    assignee_name: Optional[str] = ""
    notes: str = ""


class StatusIn(BaseModel):
    status: str
    notes: str = ""
    ecn_id: Optional[str] = ""
    ecn_no: Optional[str] = ""


class NoteIn(BaseModel):
    notes: str


# ── CREATE ───────────────────────────────────────────────────────────────────
@router.post("/nonconformance")
async def create_nc(payload: NonconformanceCreate, current: dict = Depends(get_current_user)):
    if not is_nc_issuer(current):
        raise HTTPException(status_code=403, detail="Hanya QC / Produksi / Sales yang boleh menerbitkan NC")

    drawings = [d for d in (payload.drawings or []) if (d.drawing_id or d.drawing_no)]
    if not drawings:
        raise HTTPException(status_code=400, detail="Minimal satu Drawing harus dipilih")
    if not (payload.description or "").strip() and not (payload.title or "").strip():
        raise HTTPException(status_code=400, detail="Deskripsi ketidaksesuaian wajib diisi")

    # Validasi & lengkapi info drawing dari DB (denormalisasi untuk filter/laporan cepat).
    resolved: List[dict] = []
    so_no = (payload.so_no or "").strip()
    customer_name = (payload.customer_name or "").strip()
    for d in drawings:
        q = {"deleted_at": {"$exists": False}}
        if d.drawing_id:
            q["id"] = d.drawing_id
        else:
            q["drawing_no"] = d.drawing_no
        dwg = await db.drawings.find_one(q, {"_id": 0})
        if dwg:
            resolved.append({"drawing_id": dwg.get("id"), "drawing_no": dwg.get("drawing_no"),
                             "so_no": dwg.get("so_no"), "customer_name": dwg.get("customer_name"),
                             "project_name": dwg.get("project_name")})
            so_no = so_no or (dwg.get("so_no") or "")
            customer_name = customer_name or (dwg.get("customer_name") or "")
        else:
            # Izinkan drawing manual (mis. drawing legacy) — simpan apa adanya.
            resolved.append({"drawing_id": d.drawing_id, "drawing_no": d.drawing_no,
                             "so_no": "", "customer_name": "", "project_name": ""})

    sev = payload.severity if payload.severity in SEVERITY_LEVELS else "major"
    dept = (payload.issuer_dept or "").strip().lower()
    if dept not in ISSUER_DEPTS:
        dept = _issuer_dept_of(current)

    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "nc_no": await _next_nc_no(),
        "status": STATUS_OPEN,
        "issuer_dept": dept,
        "issued_by": _actor(current),
        "issued_at": now,               # ← basis bulan untuk KPI #1
        "drawings": resolved,
        "drawing_ids": [r["drawing_id"] for r in resolved if r.get("drawing_id")],
        "drawing_nos": [r["drawing_no"] for r in resolved if r.get("drawing_no")],
        "so_no": so_no,
        "customer_name": customer_name,
        "title": (payload.title or "").strip(),
        "description": (payload.description or "").strip(),
        "severity": sev,
        "assigned_to": None,
        "ecn_id": "",
        "ecn_no": "",
        "closed_at": None,
        "closed_by": None,
        "extra": payload.extra or {},
        "timeline": [{
            "at": now, "action": "created", "by": _actor(current),
            "notes": f"NC diterbitkan oleh {dept.upper()}",
        }],
        "created_at": now,
        "updated_at": now,
    }
    await db.nonconformances.insert_one(doc.copy())
    await log_action(current, "nc_create", "nonconformances", doc["id"],
                     {"nc_no": doc["nc_no"], "drawings": doc["drawing_nos"]})
    return _clean(doc)


# ── LIST ─────────────────────────────────────────────────────────────────────
@router.get("/nonconformance")
async def list_nc(
    status: Optional[str] = None,
    issuer_dept: Optional[str] = None,
    drawing_no: Optional[str] = None,
    assignee_id: Optional[str] = None,
    mine: bool = False,
    q: Optional[str] = None,
    month: Optional[str] = Query(None, description="Filter bulan YYYY-MM (berdasar issued_at)"),
    current: dict = Depends(get_current_user),
):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    filt: dict = {"deleted_at": {"$exists": False}}
    if status:
        filt["status"] = status
    if issuer_dept:
        filt["issuer_dept"] = issuer_dept
    if drawing_no:
        filt["drawing_nos"] = {"$regex": drawing_no.strip(), "$options": "i"}
    if assignee_id:
        filt["assigned_to.id"] = assignee_id
    if mine:
        filt["issued_by.id"] = current.get("id")
    if month and len(month) == 7:
        filt["issued_at"] = {"$regex": f"^{month}"}
    if q and q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        filt["$or"] = [{"nc_no": rx}, {"title": rx}, {"description": rx},
                       {"so_no": rx}, {"customer_name": rx}, {"drawing_nos": rx}]
    docs = await db.nonconformances.find(filt, {"_id": 0}).sort("created_at", -1).limit(500).to_list(length=500)
    return {"items": docs, "total": len(docs)}


# ── STATS (untuk badge/queue) ─────────────────────────────────────────────────
@router.get("/nonconformance/stats")
async def nc_stats(current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    base = {"deleted_at": {"$exists": False}}
    out = {"total": await db.nonconformances.count_documents(base)}
    for s in VALID_STATUSES:
        out[s] = await db.nonconformances.count_documents({**base, "status": s})
    # NC belum tuntas (untuk badge Engineering Leader)
    out["open_or_active"] = await db.nonconformances.count_documents(
        {**base, "status": {"$in": [STATUS_OPEN, STATUS_ASSIGNED, STATUS_IN_PROGRESS]}})
    return out


# ── DETAIL ───────────────────────────────────────────────────────────────────
@router.get("/nonconformance/{nc_id}")
async def get_nc(nc_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return _clean(await _get_nc_or_404(nc_id))


# ── ASSIGN (Eng Leader) ───────────────────────────────────────────────────────
@router.post("/nonconformance/{nc_id}/assign")
async def assign_nc(nc_id: str, payload: AssignIn, current: dict = Depends(get_current_user)):
    if not (is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering Leader/Admin yang bisa assign NC")
    doc = await _get_nc_or_404(nc_id)
    if doc["status"] == STATUS_CLOSED:
        raise HTTPException(status_code=400, detail="NC sudah Closed")

    assignee = await db.users.find_one({"id": payload.assignee_id}, {"_id": 0, "password_hash": 0})
    if not assignee:
        raise HTTPException(status_code=404, detail="User assignee tidak ditemukan")
    if not is_engineering(assignee):
        raise HTTPException(status_code=400, detail="Assignee harus staff Engineering")

    now = _now_iso()
    assigned = {"id": assignee["id"], "name": assignee.get("name") or assignee.get("username"),
                "role": assignee.get("role")}
    await db.nonconformances.update_one({"id": nc_id}, {
        "$set": {"assigned_to": assigned, "status": STATUS_ASSIGNED, "updated_at": now},
        "$push": {"timeline": {"at": now, "action": "assigned", "by": _actor(current),
                               "notes": f"Ditugaskan ke {assigned['name']}. {payload.notes}".strip()}},
    })
    await log_action(current, "nc_assign", "nonconformances", nc_id,
                     {"nc_no": doc.get("nc_no"), "assignee": assigned["name"]})
    return {"success": True, "status": STATUS_ASSIGNED, "assigned_to": assigned}


# ── UPDATE STATUS ─────────────────────────────────────────────────────────────
@router.post("/nonconformance/{nc_id}/status")
async def update_status(nc_id: str, payload: StatusIn, current: dict = Depends(get_current_user)):
    new_status = (payload.status or "").strip().lower()
    if new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status tidak valid. Pilih: {sorted(VALID_STATUSES)}")
    doc = await _get_nc_or_404(nc_id)

    # RBAC: Eng staff (assignee) boleh in_progress; Eng Leader/Admin boleh semua transisi.
    is_leader = is_eng_head(current) or is_admin_like(current)
    is_assignee = (doc.get("assigned_to") or {}).get("id") == current.get("id")
    if new_status == STATUS_CLOSED and not is_leader:
        raise HTTPException(status_code=403, detail="Hanya Engineering Leader/Admin yang bisa menutup (Closed) NC")
    if new_status == STATUS_IN_PROGRESS and not (is_leader or is_assignee):
        raise HTTPException(status_code=403, detail="Hanya assignee atau Eng Leader yang bisa set In Progress")
    if new_status in (STATUS_OPEN, STATUS_ASSIGNED) and not is_leader:
        raise HTTPException(status_code=403, detail="Hanya Engineering Leader/Admin yang bisa mengubah status ini")

    now = _now_iso()
    updates = {"status": new_status, "updated_at": now}
    if payload.ecn_id or payload.ecn_no:
        updates["ecn_id"] = (payload.ecn_id or "").strip()
        updates["ecn_no"] = (payload.ecn_no or "").strip()
    if new_status == STATUS_CLOSED:
        updates["closed_at"] = now
        updates["closed_by"] = _actor(current)

    note_txt = f"Status → {STATUS_LABELS[new_status]}."
    if payload.ecn_no:
        note_txt += f" ECN: {payload.ecn_no}."
    if payload.notes:
        note_txt += f" {payload.notes}"
    await db.nonconformances.update_one({"id": nc_id}, {
        "$set": updates,
        "$push": {"timeline": {"at": now, "action": f"status_{new_status}",
                               "by": _actor(current), "notes": note_txt.strip()}},
    })
    await log_action(current, "nc_status", "nonconformances", nc_id,
                     {"nc_no": doc.get("nc_no"), "status": new_status, "ecn_no": payload.ecn_no})
    return {"success": True, "status": new_status}


# ── ADD NOTE (timeline) ───────────────────────────────────────────────────────
@router.post("/nonconformance/{nc_id}/note")
async def add_note(nc_id: str, payload: NoteIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if not (payload.notes or "").strip():
        raise HTTPException(status_code=400, detail="Catatan kosong")
    doc = await _get_nc_or_404(nc_id)
    now = _now_iso()
    await db.nonconformances.update_one({"id": nc_id}, {
        "$set": {"updated_at": now},
        "$push": {"timeline": {"at": now, "action": "note", "by": _actor(current),
                               "notes": payload.notes.strip()}},
    })
    return {"success": True}


# ── DELETE (soft) ─────────────────────────────────────────────────────────────
@router.delete("/nonconformance/{nc_id}")
async def delete_nc(nc_id: str, current: dict = Depends(get_current_user)):
    doc = await _get_nc_or_404(nc_id)
    # Penerbit boleh membatalkan selama masih Open; Admin boleh kapan saja.
    is_owner = (doc.get("issued_by") or {}).get("id") == current.get("id")
    if not (is_admin_like(current) or (is_owner and doc["status"] == STATUS_OPEN)):
        raise HTTPException(status_code=403, detail="Hanya Admin atau penerbit (saat status Open) yang bisa menghapus NC")
    await db.nonconformances.update_one({"id": nc_id}, {"$set": {
        "deleted_at": _now_iso(), "deleted_by": current.get("username")}})
    await log_action(current, "nc_delete", "nonconformances", nc_id, {"nc_no": doc.get("nc_no")})
    return {"success": True}


# ── ATTACHMENTS (bukti foto/pdf) ──────────────────────────────────────────────
ATTACH_ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".xlsx", ".xls", ".doc", ".docx"}


@router.get("/nonconformance/{nc_id}/attachments")
async def list_nc_attachments(nc_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    await _get_nc_or_404(nc_id)
    docs = await db.nc_attachments.find(
        {"nc_id": nc_id, "deleted_at": {"$exists": False}},
        {"_id": 0, "file_id": 0},
    ).sort("uploaded_at", -1).to_list(length=200)
    return {"nc_id": nc_id, "items": docs, "total": len(docs)}


@router.post("/nonconformance/{nc_id}/attachments")
async def upload_nc_attachment(
    nc_id: str,
    file: UploadFile = File(...),
    remark: str = Form(""),
    current: dict = Depends(get_current_user),
):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await _get_nc_or_404(nc_id)
    ext = _ext(file.filename)
    if ext not in ATTACH_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Ekstensi {ext} tidak diizinkan. Boleh: {sorted(ATTACH_ALLOWED_EXT)}")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File > 50 MB tidak diizinkan")

    fs = _fs()
    file_id = await fs.upload_from_stream(
        file.filename, content,
        metadata={"content_type": file.content_type, "nc_id": nc_id},
    )
    att = {
        "id": str(uuid.uuid4()),
        "nc_id": nc_id,
        "filename": file.filename,
        "file_id": str(file_id),
        "content_type": file.content_type,
        "size_bytes": len(content),
        "remark": remark or "",
        "uploaded_at": _now_iso(),
        "uploaded_by": current.get("name") or current.get("username"),
    }
    await db.nc_attachments.insert_one(att.copy())
    await log_action(current, "nc_attachment_upload", "nonconformances", nc_id,
                     {"nc_no": doc.get("nc_no"), "filename": file.filename})
    att.pop("file_id", None)
    return {"success": True, "attachment": att}


async def _nc_attach_or_404(nc_id: str, attach_id: str) -> dict:
    a = await db.nc_attachments.find_one({"id": attach_id, "nc_id": nc_id, "deleted_at": {"$exists": False}})
    if not a:
        raise HTTPException(status_code=404, detail="Lampiran tidak ditemukan")
    return a


async def _nc_pdf_bytes(nc_id: str, attach_id: str) -> bytes:
    a = await _nc_attach_or_404(nc_id, attach_id)
    ext = _ext(a["filename"]).lstrip(".")
    stream = await _fs().open_download_stream(ObjectId(a["file_id"]))
    raw = await stream.read()
    if ext == "pdf":
        return raw
    from utils.office_render import is_office_ext, office_to_pdf
    if is_office_ext(ext):
        return office_to_pdf(raw, ext)
    # Gambar (jpg/png/webp) → bungkus ke PDF via PyMuPDF agar viewer image-based konsisten
    if ext in ("jpg", "jpeg", "png", "webp"):
        import fitz  # PyMuPDF
        img_doc = fitz.open(stream=raw, filetype=ext)
        pdf_bytes = img_doc.convert_to_pdf()
        return pdf_bytes
    raise HTTPException(status_code=400, detail=f"Preview belum didukung untuk .{ext}")


@router.get("/nonconformance/{nc_id}/attachments/{attach_id}/page-meta")
async def nc_attach_page_meta(nc_id: str, attach_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    from utils.pdf_render import pdf_page_meta
    raw = await _nc_pdf_bytes(nc_id, attach_id)
    try:
        return pdf_page_meta(raw)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="File tidak dapat dirender sebagai halaman gambar")


@router.get("/nonconformance/{nc_id}/attachments/{attach_id}/page-image")
async def nc_attach_page_image(nc_id: str, attach_id: str, page: int = 0, scale: float = 2.0,
                               current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    from utils.pdf_render import pdf_page_png
    raw = await _nc_pdf_bytes(nc_id, attach_id)
    try:
        png = pdf_page_png(raw, page, scale)
    except IndexError:
        raise HTTPException(status_code=404, detail="Halaman tidak ditemukan")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="File tidak dapat dirender sebagai halaman gambar")
    return StreamingResponse(io.BytesIO(png), media_type="image/png",
                             headers={"Cache-Control": "private, max-age=300"})


@router.get("/nonconformance/{nc_id}/attachments/{attach_id}/download")
async def download_nc_attachment(nc_id: str, attach_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    a = await _nc_attach_or_404(nc_id, attach_id)
    stream = await _fs().open_download_stream(ObjectId(a["file_id"]))
    raw = await stream.read()
    return StreamingResponse(
        io.BytesIO(raw),
        media_type=a.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{a["filename"]}"'},
    )


@router.delete("/nonconformance/{nc_id}/attachments/{attach_id}")
async def delete_nc_attachment(nc_id: str, attach_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    a = await _nc_attach_or_404(nc_id, attach_id)
    try:
        await _fs().delete(ObjectId(a["file_id"]))
    except Exception:
        pass
    await db.nc_attachments.update_one({"id": attach_id}, {"$set": {
        "deleted_at": _now_iso(), "deleted_by": current.get("username")}})
    return {"success": True}
