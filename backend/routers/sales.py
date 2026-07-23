"""Sales module — Costing Inquiries and Quotations.

Workflow (Inquiries):
  draft → submitted → in_progress (with PIC engineer names) → awaiting_review →
      accepted / revision_requested (loop back) → closed
"""
import io
import re
import uuid
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from db import db
from deps import get_current_user, log_action
from services.soft_delete import NOT_DELETED_FILTER, merged, soft_delete_one

router = APIRouter(tags=["sales"])

# ---------------------------- Storage ----------------------------
_gridfs: Optional[AsyncIOMotorGridFSBucket] = None


def gridfs() -> AsyncIOMotorGridFSBucket:
    global _gridfs
    if _gridfs is None:
        _gridfs = AsyncIOMotorGridFSBucket(db, bucket_name="inquiry_files")
    return _gridfs


# ---------------------------- Models ----------------------------
class InquiryItem(BaseModel):
    item_name: str
    qty: float = 1.0
    unit: str = "Ea"
    specification: str = ""


class InquiryCreate(BaseModel):
    title: str
    customer_name: str
    customer_deadline: Optional[str] = None  # ISO date
    description: str = ""
    items: List[InquiryItem] = []
    save_as_draft: bool = True


class InquiryUpdate(BaseModel):
    title: Optional[str] = None
    customer_name: Optional[str] = None
    customer_deadline: Optional[str] = None
    description: Optional[str] = None
    items: Optional[List[InquiryItem]] = None


class InquiryAccept(BaseModel):
    pic_engineer_name: str  # required — the actual engineer person responsible


class InquiryProgress(BaseModel):
    note: str
    status: Optional[str] = "in_progress"  # or "awaiting_review"


class InquiryReview(BaseModel):
    approve: bool  # True → accepted, False → revision_requested
    review_note: str = ""


# ---------------------------- Helpers ----------------------------
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


async def _next_number(counter_kind: str) -> int:
    """Atomic monthly counter reset. counter_kind: 'inquiry' | 'quotation'."""
    now = datetime.utcnow()
    key = f"{counter_kind}:{now.year}-{now.month:02d}"
    doc = await db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True,
        return_document=True,
    )
    # After upsert with $inc, seq will be 1 for first, 2 for second, ...
    if not doc:
        doc = await db.counters.find_one({"_id": key})
    return int(doc.get("seq", 1))


async def _new_inquiry_no() -> str:
    now = datetime.utcnow()
    seq = await _next_number("inquiry")
    return f"INQ-{seq:03d}/MKS/{ROMAN[now.month]}/{now.year}"


async def _new_quotation_no() -> str:
    now = datetime.utcnow()
    seq = await _next_number("quotation")
    return f"{seq:03d}/MKS/Q/{ROMAN[now.month]}/{now.year}"


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# =============================================================================
# INQUIRIES
# =============================================================================
@router.post("/inquiries")
async def create_inquiry(payload: InquiryCreate, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Sales & Admin yang bisa buat Inquiry")
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Judul wajib diisi")
    if not payload.customer_name.strip():
        raise HTTPException(status_code=400, detail="Nama customer wajib diisi")

    now = datetime.utcnow().isoformat()
    status = "draft" if payload.save_as_draft else "submitted"
    doc = {
        "id": str(uuid.uuid4()),
        "inquiry_no": await _new_inquiry_no(),
        "title": payload.title.strip(),
        "customer_name": payload.customer_name.strip(),
        "customer_deadline": payload.customer_deadline or "",
        "description": payload.description.strip(),
        "items": [i.model_dump() for i in payload.items],
        "attachments": [],  # list of {id, filename, size, mime, uploaded_at, uploaded_by}
        "status": status,
        "created_by_id": current.get("id"),
        "created_by_name": current.get("name") or current.get("username"),
        "created_at": now,
        "updated_at": now,
        "submitted_at": now if status == "submitted" else None,
        # Engineering side
        "pic_engineer_name": "",       # required at accept time (multi-collab record)
        "accepted_by_id": "",
        "accepted_by_name": "",
        "accepted_at": None,
        "progress_notes": [],           # list of {at, by, note, status}
        "engineer_response_files": [],  # list of attachment ids
        "engineer_response_note": "",
        "completed_at": None,
        # Sales review
        "sales_reviews": [],            # list of {at, by, approve, note}
        "final_status": "",             # accepted / revision_requested (last review)
        "history": [
            {"at": now, "by": current.get("name") or current.get("username"), "action": f"created ({status})"},
        ],
    }
    await db.inquiries.insert_one(doc)
    await log_action(current, "create_inquiry", "inquiry", doc["id"], {"status": status})
    return _clean(doc)


@router.get("/inquiries")
async def list_inquiries(
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100,
    current: dict = Depends(get_current_user),
):
    filt: dict = {}
    role = current.get("role")
    # Sales sees only their own (unless admin)
    if role == "sales":
        filt["created_by_id"] = current.get("id")
    if role == "engineering":
        # Engineers only see submitted onwards (skip drafts)
        filt["status"] = {"$nin": ["draft"]}
    if status and status != "all":
        filt["status"] = status
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"inquiry_no": rx}, {"title": rx}, {"customer_name": rx}]
    docs = await db.inquiries.find(merged(filt, NOT_DELETED_FILTER)).sort("created_at", -1).limit(limit).to_list(length=limit)
    for d in docs:
        _clean(d)
    return {"items": docs, "total": len(docs)}


@router.get("/inquiries/pending-count")
async def inquiries_pending_count(current: dict = Depends(get_current_user)):
    """Engineering: pending 'submitted' inquiries. Sales: pending 'awaiting_review' from their own."""
    role = current.get("role")
    if role == "engineering":
        n = await db.inquiries.count_documents({"status": "submitted"})
        return {"role": role, "count": n, "kind": "pending_engineering"}
    if role == "sales":
        n = await db.inquiries.count_documents({
            "status": "awaiting_review",
            "created_by_id": current.get("id"),
        })
        return {"role": role, "count": n, "kind": "awaiting_review"}
    if role == "admin":
        n = await db.inquiries.count_documents({"status": {"$in": ["submitted", "awaiting_review"]}})
        return {"role": role, "count": n, "kind": "all_active"}
    return {"role": role, "count": 0}


@router.get("/inquiries/{inq_id}")
async def get_inquiry(inq_id: str, current: dict = Depends(get_current_user)):
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    # Access: sales owner, engineering, admin
    role = current.get("role")
    if role == "sales" and d.get("created_by_id") != current.get("id"):
        raise HTTPException(status_code=403, detail="Bukan Inquiry Anda")
    return _clean(d)


@router.put("/inquiries/{inq_id}")
async def update_inquiry_draft(inq_id: str, payload: InquiryUpdate, current: dict = Depends(get_current_user)):
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    if d.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Hanya draft yang bisa diedit")
    if current.get("id") != d.get("created_by_id") and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bukan Inquiry Anda")

    up = {"updated_at": datetime.utcnow().isoformat()}
    if payload.title is not None: up["title"] = payload.title.strip()
    if payload.customer_name is not None: up["customer_name"] = payload.customer_name.strip()
    if payload.customer_deadline is not None: up["customer_deadline"] = payload.customer_deadline
    if payload.description is not None: up["description"] = payload.description.strip()
    if payload.items is not None: up["items"] = [i.model_dump() for i in payload.items]
    await db.inquiries.update_one({"id": inq_id}, {"$set": up})
    updated = await db.inquiries.find_one({"id": inq_id})
    return _clean(updated)


@router.post("/inquiries/{inq_id}/submit")
async def submit_inquiry(inq_id: str, current: dict = Depends(get_current_user)):
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    if d.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Hanya draft yang bisa disubmit")
    if current.get("id") != d.get("created_by_id") and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bukan Inquiry Anda")

    now = datetime.utcnow().isoformat()
    entry = {"at": now, "by": current.get("name") or current.get("username"), "action": "submitted to engineering"}
    await db.inquiries.update_one(
        {"id": inq_id},
        {"$set": {"status": "submitted", "submitted_at": now, "updated_at": now},
         "$push": {"history": entry}},
    )
    await log_action(current, "submit_inquiry", "inquiry", inq_id, {})
    updated = await db.inquiries.find_one({"id": inq_id})
    return _clean(updated)


@router.post("/inquiries/{inq_id}/accept")
async def accept_inquiry(inq_id: str, payload: InquiryAccept, current: dict = Depends(get_current_user)):
    """Engineering accepts and specifies PIC engineer name (multi-collab OK)."""
    if current.get("role") not in ("engineering", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Engineering yang bisa accept")
    if not payload.pic_engineer_name.strip():
        raise HTTPException(status_code=400, detail="Nama PIC Engineer wajib diisi")
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    if d.get("status") not in ("submitted", "revision_requested"):
        raise HTTPException(status_code=400, detail=f"Status saat ini '{d.get('status')}' tidak bisa di-accept")

    now = datetime.utcnow().isoformat()
    who = current.get("name") or current.get("username")
    entry = {"at": now, "by": who, "action": f"accepted (PIC: {payload.pic_engineer_name.strip()})"}
    await db.inquiries.update_one(
        {"id": inq_id},
        {"$set": {
            "status": "in_progress",
            "pic_engineer_name": payload.pic_engineer_name.strip(),
            "accepted_by_id": current.get("id"),
            "accepted_by_name": who,
            "accepted_at": now,
            "updated_at": now,
        },
         "$push": {"history": entry}},
    )
    await log_action(current, "accept_inquiry", "inquiry", inq_id, {"pic": payload.pic_engineer_name})
    updated = await db.inquiries.find_one({"id": inq_id})
    return _clean(updated)


@router.post("/inquiries/{inq_id}/progress")
async def add_progress(inq_id: str, payload: InquiryProgress, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("engineering", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Engineering yang bisa update progress")
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    if d.get("status") not in ("in_progress", "awaiting_review"):
        raise HTTPException(status_code=400, detail=f"Status saat ini '{d.get('status')}' tidak bisa update progress")

    now = datetime.utcnow().isoformat()
    entry = {"at": now, "by": current.get("name") or current.get("username"), "note": payload.note.strip(), "status": payload.status}
    upd = {"$push": {"progress_notes": entry, "history": {"at": now, "by": entry["by"], "action": f"progress: {payload.note[:60]}"}},
           "$set": {"updated_at": now}}
    if payload.status == "awaiting_review":
        upd["$set"]["status"] = "awaiting_review"
        upd["$set"]["completed_at"] = now
    await db.inquiries.update_one({"id": inq_id}, upd)
    updated = await db.inquiries.find_one({"id": inq_id})
    return _clean(updated)


@router.post("/inquiries/{inq_id}/complete")
async def complete_inquiry(inq_id: str, note: str = Form(""), current: dict = Depends(get_current_user)):
    """Engineering marks work done → awaiting_review. Attachments uploaded separately."""
    if current.get("role") not in ("engineering", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Engineering yang bisa complete")
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    if d.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail="Hanya inquiry yang in_progress bisa di-complete")

    now = datetime.utcnow().isoformat()
    who = current.get("name") or current.get("username")
    entry = {"at": now, "by": who, "action": "engineering completed"}
    await db.inquiries.update_one(
        {"id": inq_id},
        {"$set": {"status": "awaiting_review", "engineer_response_note": note.strip(),
                  "completed_at": now, "updated_at": now},
         "$push": {"history": entry}},
    )
    await log_action(current, "complete_inquiry", "inquiry", inq_id, {})
    updated = await db.inquiries.find_one({"id": inq_id})
    return _clean(updated)


@router.post("/inquiries/{inq_id}/review")
async def review_inquiry(inq_id: str, payload: InquiryReview, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Sales yang bisa review")
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")
    if current.get("role") == "sales" and d.get("created_by_id") != current.get("id"):
        raise HTTPException(status_code=403, detail="Bukan Inquiry Anda")
    if d.get("status") != "awaiting_review":
        raise HTTPException(status_code=400, detail="Belum bisa direview (status bukan awaiting_review)")

    now = datetime.utcnow().isoformat()
    who = current.get("name") or current.get("username")
    new_status = "accepted" if payload.approve else "revision_requested"
    entry = {"at": now, "by": who, "approve": payload.approve, "note": payload.review_note.strip()}
    hist = {"at": now, "by": who, "action": f"reviewed → {new_status}: {payload.review_note[:60]}"}
    await db.inquiries.update_one(
        {"id": inq_id},
        {"$set": {"status": new_status, "final_status": new_status, "updated_at": now},
         "$push": {"sales_reviews": entry, "history": hist}},
    )
    await log_action(current, "review_inquiry", "inquiry", inq_id, {"approve": payload.approve})
    updated = await db.inquiries.find_one({"id": inq_id})
    return _clean(updated)


# ---------------------------- Attachments (GridFS) ----------------------------
@router.post("/inquiries/{inq_id}/attachments")
async def upload_attachment(
    inq_id: str,
    file: UploadFile = File(...),
    slot: str = Form("sales"),  # 'sales' (attach ke inquiry) atau 'engineer' (hasil kerja engineer)
    current: dict = Depends(get_current_user),
):
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")

    role = current.get("role")
    if slot == "sales":
        if role not in ("sales", "admin") or (role == "sales" and d.get("created_by_id") != current.get("id")):
            raise HTTPException(status_code=403, detail="Tidak berwenang upload ke sales attachments")
    elif slot == "engineer":
        if role not in ("engineering", "admin"):
            raise HTTPException(status_code=403, detail="Hanya Engineering yang bisa upload response files")
    else:
        raise HTTPException(status_code=400, detail="slot harus 'sales' atau 'engineer'")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File terlalu besar (max 25 MB)")

    fs = gridfs()
    file_id = await fs.upload_from_stream(
        file.filename or "attachment",
        io.BytesIO(content),
        metadata={"inquiry_id": inq_id, "slot": slot, "uploaded_by": current.get("name") or current.get("username")},
    )
    meta = {
        "id": str(file_id),
        "filename": file.filename or "attachment",
        "size": len(content),
        "mime": file.content_type or "application/octet-stream",
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by": current.get("name") or current.get("username"),
        "slot": slot,
    }
    field = "attachments" if slot == "sales" else "engineer_response_files"
    await db.inquiries.update_one({"id": inq_id}, {"$push": {field: meta}})
    return meta


@router.get("/inquiries/{inq_id}/attachments/{file_id}/download")
async def download_attachment(inq_id: str, file_id: str, current: dict = Depends(get_current_user)):
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")

    # Locate metadata for filename
    meta = None
    for att in (d.get("attachments") or []) + (d.get("engineer_response_files") or []):
        if att.get("id") == file_id:
            meta = att
            break
    if not meta:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")

    fs = gridfs()
    try:
        stream = await fs.open_download_stream(ObjectId(file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="File tidak ditemukan di storage")

    buf = io.BytesIO()
    async for chunk in stream:
        buf.write(chunk)
    buf.seek(0)
    filename = meta.get("filename") or "download"
    return StreamingResponse(
        buf,
        media_type=meta.get("mime") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/inquiries/{inq_id}/attachments/{file_id}")
async def delete_attachment(inq_id: str, file_id: str, current: dict = Depends(get_current_user)):
    d = await db.inquiries.find_one({"id": inq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Inquiry tidak ditemukan")

    # Determine which slot & permission
    for field in ("attachments", "engineer_response_files"):
        for att in d.get(field, []):
            if att.get("id") == file_id:
                role = current.get("role")
                slot = att.get("slot")
                if slot == "sales" and role not in ("sales", "admin"):
                    raise HTTPException(status_code=403, detail="Tidak berwenang")
                if slot == "engineer" and role not in ("engineering", "admin"):
                    raise HTTPException(status_code=403, detail="Tidak berwenang")
                await db.inquiries.update_one({"id": inq_id}, {"$pull": {field: {"id": file_id}}})
                try:
                    await gridfs().delete(ObjectId(file_id))
                except Exception:
                    pass
                return {"success": True}
    raise HTTPException(status_code=404, detail="File tidak ditemukan")


# =============================================================================
# QUOTATIONS  (data-only, PDF generation next iteration)
# =============================================================================
class QuotationCreate(BaseModel):
    inquiry_id: Optional[str] = None  # optional link to inquiry
    customer_name: str
    customer_address: str = ""
    attention: str = ""
    cc: str = ""
    items: List[dict] = []  # [{no, description, qty, unit}]
    notes_lines: List[str] = []  # bullet notes
    in_words: str = ""
    total_amount: float = 0.0
    currency: str = "IDR"
    payment_term: str = ""
    delivery_time: str = ""
    validity: str = ""
    signature_name: str = "Mr. Nicholas Jacky. C"
    signature_position: str = "Sales Dept"
    approver_name: str = "Mr. Asiong Lu"
    approver_position: str = "Business Dev. Manager"


@router.post("/quotations")
async def create_quotation(payload: QuotationCreate, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Sales yang bisa buat Quotation")
    if not payload.customer_name.strip():
        raise HTTPException(status_code=400, detail="Customer wajib diisi")

    doc = {
        "id": str(uuid.uuid4()),
        "quotation_no": await _new_quotation_no(),
        **payload.model_dump(),
        "created_by_id": current.get("id"),
        "created_by_name": current.get("name") or current.get("username"),
        "created_at": datetime.utcnow().isoformat(),
        "status": "on_bidding",  # on_bidding | confirm_order | cancel
    }
    await db.quotations.insert_one(doc)
    await log_action(current, "create_quotation", "quotation", doc["id"], {"quotation_no": doc["quotation_no"]})
    return _clean(doc)


@router.get("/quotations")
async def list_quotations(q: Optional[str] = None, limit: int = 100, current: dict = Depends(get_current_user)):
    filt: dict = {}
    if current.get("role") == "sales":
        filt["created_by_id"] = current.get("id")
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [
            {"quotation_no": rx},
            {"customer_name": rx},
            {"attention": rx},
            {"items.description": rx},
        ]
    docs = await db.quotations.find(merged(filt, NOT_DELETED_FILTER)).sort("created_at", -1).limit(limit).to_list(length=limit)
    for d in docs:
        _clean(d)
    return {"items": docs, "total": len(docs)}


@router.get("/quotations/{qid}")
async def get_quotation(qid: str, current: dict = Depends(get_current_user)):
    d = await db.quotations.find_one({"id": qid})
    if not d:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    return _clean(d)


@router.get("/quotations/{qid}/pdf")
async def download_quotation_pdf(qid: str, current: dict = Depends(get_current_user)):
    """Generate & stream Quotation PDF with PT MKS letterhead."""
    from services.quotation_pdf import build_quotation_pdf
    d = await db.quotations.find_one({"id": qid})
    if not d:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    # Try to enrich address from master customer if not stored on quotation
    if not d.get("customer_address") and d.get("customer_name"):
        cust = await db.customers.find_one({"name": d["customer_name"]})
        if cust and cust.get("address"):
            d["customer_address"] = cust["address"]
    pdf_bytes = build_quotation_pdf(_clean(d))
    await log_action(current, "download_quotation_pdf", "quotations", qid, {"quotation_no": d.get("quotation_no")})
    safe_no = re.sub(r"[^A-Za-z0-9._-]+", "_", d.get("quotation_no") or qid)
    fname = f"Quotation_{safe_no}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )



class QuotationStatusUpdate(BaseModel):
    status: str  # on_bidding | confirm_order | cancel


# =============================================================================
# CUSTOMERS MASTER
# =============================================================================
class CustomerCreate(BaseModel):
    name: str
    address: str = ""
    pic: str = ""  # Person In Charge / Attention person
    phone: str = ""
    email: str = ""
    notes: str = ""


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    pic: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


@router.get("/customers")
async def list_customers(q: Optional[str] = None, limit: int = 500, current: dict = Depends(get_current_user)):
    filt: dict = {}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"name": rx}, {"pic": rx}]
    docs = await db.customers.find(merged(filt, NOT_DELETED_FILTER)).sort("name", 1).limit(limit).to_list(length=limit)
    for d in docs:
        _clean(d)
    return {"items": docs, "total": len(docs)}


@router.post("/customers")
async def create_customer(payload: CustomerCreate, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Sales & Admin yang bisa kelola customer")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Nama customer wajib diisi")
    existing = await db.customers.find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Customer '{payload.name}' sudah ada")
    doc = {
        "id": str(uuid.uuid4()),
        **{k: v.strip() if isinstance(v, str) else v for k, v in payload.model_dump().items()},
        "name": payload.name.strip(),
        "created_at": datetime.utcnow().isoformat(),
        "created_by_name": current.get("name") or current.get("username"),
    }
    await db.customers.insert_one(doc)
    await log_action(current, "create_customer", "customer", doc["id"], {"name": doc["name"]})
    return _clean(doc)


@router.put("/customers/{cid}")
async def update_customer(cid: str, payload: CustomerUpdate, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Sales & Admin yang bisa edit customer")
    up = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not up:
        raise HTTPException(status_code=400, detail="Tidak ada perubahan")
    up["updated_at"] = datetime.utcnow().isoformat()
    res = await db.customers.update_one({"id": cid}, {"$set": up})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer tidak ditemukan")
    updated = await db.customers.find_one({"id": cid})
    return _clean(updated)


@router.delete("/customers/{cid}")
async def delete_customer(cid: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Tidak berwenang")
    ok = await soft_delete_one("customers", {"id": cid}, current)
    if not ok:
        raise HTTPException(status_code=404, detail="Customer tidak ditemukan")
    await log_action(current, "delete_customer", "customer", cid, {})
    return {"success": True}


@router.patch("/quotations/{qid}/status")
async def update_quotation_status(qid: str, payload: QuotationStatusUpdate, current: dict = Depends(get_current_user)):
    if current.get("role") not in ("sales", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Sales yang bisa update status")
    if payload.status not in ("on_bidding", "confirm_order", "cancel"):
        raise HTTPException(status_code=400, detail="Status tidak valid")
    res = await db.quotations.update_one({"id": qid}, {"$set": {"status": payload.status, "status_updated_at": datetime.utcnow().isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quotation tidak ditemukan")
    await log_action(current, "quotation_status", "quotation", qid, {"status": payload.status})
    updated = await db.quotations.find_one({"id": qid})
    return _clean(updated)


# =============================================================================
# STATS / DASHBOARD
# =============================================================================
INQUIRY_STATUSES = ["draft", "submitted", "in_progress", "awaiting_review", "accepted", "revision_requested", "closed"]
QUOTATION_STATUSES = ["on_bidding", "confirm_order", "cancel"]


@router.get("/sales/stats")
async def sales_stats(current: dict = Depends(get_current_user)):
    """Aggregated dashboard for Sales & Engineering: Inquiry & Quotation counts by status."""
    role = current.get("role")
    # Sales sees only own inquiries; Engineering sees all non-draft; admin sees everything
    inq_filter: dict = {}
    quo_filter: dict = {}
    if role == "sales":
        inq_filter["created_by_id"] = current.get("id")
        quo_filter["created_by_id"] = current.get("id")
    if role == "engineering":
        inq_filter["status"] = {"$nin": ["draft"]}

    # Inquiries breakdown
    inq_pipeline = [{"$match": merged(inq_filter, NOT_DELETED_FILTER)}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    inq_agg = await db.inquiries.aggregate(inq_pipeline).to_list(length=None)
    inq_counts = {s: 0 for s in INQUIRY_STATUSES}
    for r in inq_agg:
        s = r["_id"] or "draft"
        inq_counts[s] = r["count"]
    inq_total = sum(inq_counts.values())

    # Quotations breakdown
    quo_pipeline = [{"$match": merged(quo_filter, NOT_DELETED_FILTER)}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    quo_agg = await db.quotations.aggregate(quo_pipeline).to_list(length=None)
    quo_counts = {s: 0 for s in QUOTATION_STATUSES}
    for r in quo_agg:
        s = r["_id"] or "on_bidding"
        quo_counts[s] = r["count"]
    quo_total = sum(quo_counts.values())

    # Quotation value totals by status (per currency, biar tidak salah mix)
    val_pipeline = [{"$match": merged(quo_filter, NOT_DELETED_FILTER)}, {"$group": {"_id": {"status": "$status", "currency": "$currency"}, "sum": {"$sum": "$total_amount"}}}]
    val_agg = await db.quotations.aggregate(val_pipeline).to_list(length=None)
    quo_values: dict = {}
    for r in val_agg:
        st = r["_id"].get("status") or "on_bidding"
        cur = r["_id"].get("currency") or "IDR"
        quo_values.setdefault(st, {})[cur] = float(r.get("sum") or 0)

    return {
        "inquiries": {"total": inq_total, "by_status": inq_counts},
        "quotations": {"total": quo_total, "by_status": quo_counts, "values_by_status": quo_values},
        "role": role,
    }


# =============================================================================
# EXCEL EXPORTS
# =============================================================================
def _xl_header_style(cell):
    cell.font = Font(bold=True, color="FFFFFF", size=10)
    cell.fill = PatternFill("solid", fgColor="1E293B")
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color="94A3B8")
    cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)


def _xl_data_border(cell):
    thin = Side(style="thin", color="E2E8F0")
    cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)


@router.get("/inquiries/export/excel")
async def export_inquiries_excel(
    status: Optional[str] = None,
    q: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    """Export Inquiry list ke Excel (respect same visibility rules as GET /inquiries)."""
    filt: dict = {}
    role = current.get("role")
    if role == "sales":
        filt["created_by_id"] = current.get("id")
    if role == "engineering":
        filt["status"] = {"$nin": ["draft"]}
    if status and status != "all":
        filt["status"] = status
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"inquiry_no": rx}, {"title": rx}, {"customer_name": rx}]
    docs = await db.inquiries.find(merged(filt, NOT_DELETED_FILTER)).sort("created_at", -1).to_list(length=None)

    wb = Workbook()
    ws = wb.active
    ws.title = "Inquiries"
    headers = ["No", "No Inquiry", "Judul", "Customer", "Deadline", "Status", "PIC Engineer",
               "Jumlah Item", "Dibuat Oleh", "Tanggal Buat", "Diterima Oleh", "Tanggal Selesai"]
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=i, value=h)
        _xl_header_style(c)
    ws.row_dimensions[1].height = 26

    for i, d in enumerate(docs, start=2):
        row = [
            i - 1,
            d.get("inquiry_no"),
            d.get("title"),
            d.get("customer_name"),
            d.get("customer_deadline") or "",
            (d.get("status") or "").upper(),
            d.get("pic_engineer_name") or "",
            len(d.get("items") or []),
            d.get("created_by_name") or "",
            (d.get("created_at") or "")[:10],
            d.get("accepted_by_name") or "",
            (d.get("completed_at") or "")[:10] if d.get("completed_at") else "",
        ]
        for j, v in enumerate(row, 1):
            c = ws.cell(row=i, column=j, value=v)
            _xl_data_border(c)
            c.font = Font(size=10)
            c.alignment = Alignment(vertical="center", wrap_text=True)

    widths = [5, 22, 40, 28, 12, 14, 20, 8, 18, 12, 18, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"Inquiries_MKS_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    await log_action(current, "export_inquiries_excel", "inquiries", "-", {"rows": len(docs)})
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/quotations/export/excel")
async def export_quotations_excel(q: Optional[str] = None, current: dict = Depends(get_current_user)):
    filt: dict = {}
    if current.get("role") == "sales":
        filt["created_by_id"] = current.get("id")
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"quotation_no": rx}, {"customer_name": rx}, {"attention": rx}, {"items.description": rx}]
    docs = await db.quotations.find(merged(filt, NOT_DELETED_FILTER)).sort("created_at", -1).to_list(length=None)

    wb = Workbook()
    ws = wb.active
    ws.title = "Quotations"
    headers = ["No", "No Quotation", "Tanggal", "Customer", "Attention", "CC",
               "Jumlah Item", "Currency", "Total Amount", "Status", "Payment Term", "Delivery", "Validity", "Sales"]
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=i, value=h)
        _xl_header_style(c)
    ws.row_dimensions[1].height = 26

    for i, d in enumerate(docs, start=2):
        row = [
            i - 1,
            d.get("quotation_no"),
            (d.get("created_at") or "")[:10],
            d.get("customer_name"),
            d.get("attention") or "",
            d.get("cc") or "",
            len(d.get("items") or []),
            d.get("currency") or "IDR",
            float(d.get("total_amount") or 0),
            (d.get("status") or "").upper(),
            d.get("payment_term") or "",
            d.get("delivery_time") or "",
            d.get("validity") or "",
            d.get("created_by_name") or "",
        ]
        for j, v in enumerate(row, 1):
            c = ws.cell(row=i, column=j, value=v)
            _xl_data_border(c)
            c.font = Font(size=10)
            if j == 9:  # Total Amount
                c.number_format = '#,##0.00'
                c.alignment = Alignment(horizontal="right", vertical="center")
            else:
                c.alignment = Alignment(vertical="center", wrap_text=True)

    widths = [5, 24, 12, 28, 20, 20, 8, 10, 18, 14, 24, 20, 22, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"Quotations_MKS_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    await log_action(current, "export_quotations_excel", "quotations", "-", {"rows": len(docs)})
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )

