"""ECN — Engineering Change Notice.

Form pengajuan perubahan isi Drawing dan/atau BOM oleh Engineering.
Alur ringkas: Engineer buat ECN (draft) → submit → Eng Leader review (approve/reject).
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from deps import get_current_user, is_admin_like, is_eng_head, is_engineering, log_action

router = APIRouter(tags=["ecn"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


async def _next_change_no(kind: str) -> str:
    """kind: 'ecr' (dari customer) atau 'ecn' (internal MKS/eng)."""
    now = datetime.now(timezone.utc)
    yy = f"{now.year % 100:02d}"
    mm = f"{now.month:02d}"
    prefix = "ECR" if kind == "ecr" else "ECN"
    key = f"{prefix.lower()}_{now.year}_{now.month}"
    counter = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"value": 1}}, upsert=True, return_document=True,
    )
    seq = (counter or {}).get("value", 1)
    return f"{prefix}-{yy}{mm}-{seq:03d}"


class ECNCreate(BaseModel):
    kind: str = "ecn"                  # ecr = perubahan dari customer | ecn = perubahan internal MKS/eng
    change_type: str = "drawing"      # drawing | bom | both
    drawing_id: Optional[str] = ""
    drawing_no: Optional[str] = ""
    bom_id: Optional[str] = ""
    bom_no: Optional[str] = ""
    so_no: Optional[str] = ""
    customer_name: Optional[str] = ""
    reason: str = ""                   # alasan perubahan
    description: str = ""              # detail perubahan yang diminta
    priority: str = "normal"          # low | normal | high
    submit: bool = False               # True = langsung submit ke Eng Leader


def _can_ecn(user: dict) -> bool:
    return is_engineering(user) or is_admin_like(user)


@router.post("/ecn")
async def create_ecn(payload: ECNCreate, current: dict = Depends(get_current_user)):
    if not _can_ecn(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering yang boleh buat ECR/ECN")
    kind = "ecr" if (payload.kind or "").lower() == "ecr" else "ecn"
    if payload.change_type not in ("drawing", "bom", "both"):
        raise HTTPException(status_code=400, detail="change_type tidak valid")
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Alasan perubahan wajib diisi")
    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="Detail perubahan wajib diisi")

    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "ecn_no": await _next_change_no(kind),
        "change_type": payload.change_type,
        "drawing_id": (payload.drawing_id or "").strip(),
        "drawing_no": (payload.drawing_no or "").strip(),
        "bom_id": (payload.bom_id or "").strip(),
        "bom_no": (payload.bom_no or "").strip(),
        "so_no": (payload.so_no or "").strip(),
        "customer_name": (payload.customer_name or "").strip(),
        "reason": payload.reason.strip(),
        "description": payload.description.strip(),
        "priority": payload.priority if payload.priority in ("low", "normal", "high") else "normal",
        "status": "submitted" if payload.submit else "draft",
        "requested_by": {"id": current["id"], "name": current.get("name") or current.get("username")},
        "reviewed_by": None,
        "review_notes": "",
        "submitted_at": now if payload.submit else None,
        "created_at": now,
        "updated_at": now,
    }
    await db.ecns.insert_one(doc.copy())
    await log_action(current, "ecn_create", "ecns", doc["id"], {"ecn_no": doc["ecn_no"], "type": doc["change_type"]})
    return _clean(doc)


@router.get("/ecn")
async def list_ecn(status: Optional[str] = None, kind: Optional[str] = None, q: Optional[str] = None,
                   current: dict = Depends(get_current_user)):
    if not _can_ecn(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    filt = {"deleted_at": {"$exists": False}}
    if status:
        filt["status"] = status
    if kind:
        filt["kind"] = kind
    if q and q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        filt["$or"] = [{"ecn_no": rx}, {"drawing_no": rx}, {"bom_no": rx}, {"so_no": rx}, {"reason": rx}]
    docs = await db.ecns.find(filt, {"_id": 0}).sort("created_at", -1).limit(300).to_list(length=300)
    return {"items": docs, "total": len(docs)}


@router.get("/ecn/{ecn_id}")
async def get_ecn(ecn_id: str, current: dict = Depends(get_current_user)):
    if not _can_ecn(current):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.ecns.find_one({"id": ecn_id, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="ECN tidak ditemukan")
    return doc


@router.post("/ecn/{ecn_id}/submit")
async def submit_ecn(ecn_id: str, current: dict = Depends(get_current_user)):
    doc = await db.ecns.find_one({"id": ecn_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="ECN tidak ditemukan")
    if doc["status"] != "draft":
        raise HTTPException(status_code=400, detail=f"ECN status {doc['status']}, hanya draft yang bisa submit")
    await db.ecns.update_one({"id": ecn_id}, {"$set": {"status": "submitted", "submitted_at": _now_iso(), "updated_at": _now_iso()}})
    await log_action(current, "ecn_submit", "ecns", ecn_id, {"ecn_no": doc.get("ecn_no")})
    return {"success": True}


class ECNReviewIn(BaseModel):
    action: str            # approve | reject
    notes: str = ""


@router.post("/ecn/{ecn_id}/review")
async def review_ecn(ecn_id: str, payload: ECNReviewIn, current: dict = Depends(get_current_user)):
    if not (is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Eng Leader/Admin yang boleh review ECN")
    doc = await db.ecns.find_one({"id": ecn_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="ECN tidak ditemukan")
    if doc["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Hanya ECN submitted yang bisa direview")
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action harus approve/reject")
    new_status = "approved" if payload.action == "approve" else "rejected"
    await db.ecns.update_one({"id": ecn_id}, {"$set": {
        "status": new_status,
        "reviewed_by": {"id": current["id"], "name": current.get("name") or current.get("username")},
        "review_notes": payload.notes.strip(),
        "reviewed_at": _now_iso(),
        "updated_at": _now_iso(),
    }})
    await log_action(current, "ecn_review", "ecns", ecn_id, {"ecn_no": doc.get("ecn_no"), "action": payload.action})
    return {"success": True, "status": new_status}
