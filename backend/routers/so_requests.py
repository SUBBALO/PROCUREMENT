"""SO Requests — Engineering requests Sales/Admin to create a new SO.

Engineer typically knows the SO number they need (customer told them),
but only Sales/Admin has permission to register it in Master SO.
This module lets engineer file a request → admin/sales gets notified → creates the SO.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import db
from deps import get_current_user, log_action

router = APIRouter(prefix="/so-requests", tags=["so-requests"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SORequestIn(BaseModel):
    requested_so_no: str = ""      # nomor SO yg diminta (kalau engineer sudah tahu)
    customer_hint: str = ""         # nama customer (kalau tahu)
    project_hint: str = ""          # deskripsi project singkat
    notes: str = ""                 # catatan tambahan dari engineer


@router.post("")
async def create_so_request(payload: SORequestIn, current: dict = Depends(get_current_user)):
    so_no = (payload.requested_so_no or "").strip()
    notes = (payload.notes or "").strip()
    if not so_no and not notes and not payload.customer_hint and not payload.project_hint:
        raise HTTPException(status_code=400, detail="Isi minimal salah satu field (nomor SO, customer, project, atau notes)")

    # Prevent duplicate open request for same SO
    if so_no:
        existing = await db.so_requests.find_one({
            "requested_so_no": so_no,
            "status": "pending",
            "deleted_at": {"$exists": False},
        })
        if existing:
            raise HTTPException(status_code=409, detail=f"Sudah ada request untuk SO {so_no} (status pending)")

        # Also check if SO already exists in master → no need to request
        already = await db.sales_orders.find_one({"so_no": so_no, "deleted_at": {"$exists": False}})
        if already:
            raise HTTPException(status_code=409, detail=f"SO {so_no} sudah ada di Master SO — silakan pilih dari list")

    doc = {
        "id": str(uuid.uuid4()),
        "requested_so_no": so_no,
        "customer_hint": (payload.customer_hint or "").strip(),
        "project_hint": (payload.project_hint or "").strip(),
        "notes": notes,
        "requested_by_id": current.get("id"),
        "requested_by_name": current.get("name") or current.get("username"),
        "requested_by_role": current.get("role"),
        "status": "pending",   # pending | fulfilled | rejected
        "created_at": _now_iso(),
    }
    await db.so_requests.insert_one(doc.copy())
    await log_action(current, "so_request_create", "so_requests", doc["id"], {"so_no": so_no})
    doc.pop("_id", None)
    return {"success": True, "request": doc}


@router.get("")
async def list_so_requests(status: Optional[str] = "pending", current: dict = Depends(get_current_user)):
    filt: dict = {"deleted_at": {"$exists": False}}
    if status and status != "all":
        filt["status"] = status
    # Engineer sees own requests; admin/sales/purchasing sees all
    role = (current or {}).get("role")
    if role in ("eng_staff", "eng_leader", "eng_head", "engineering"):
        filt["requested_by_id"] = current.get("id")
    docs = await db.so_requests.find(filt, {"_id": 0}).sort("created_at", -1).to_list(length=300)
    return {"items": docs, "total": len(docs)}


@router.post("/{req_id}/fulfill")
async def fulfill_so_request(req_id: str, current: dict = Depends(get_current_user)):
    """Mark request as fulfilled (called after admin creates the SO in master)."""
    role = (current or {}).get("role")
    if role not in ("admin", "super_admin", "supervisor", "sales", "purchasing", "staff"):
        raise HTTPException(status_code=403, detail="Hanya Admin/Sales/Purchasing yang bisa fulfill")
    req = await db.so_requests.find_one({"id": req_id, "deleted_at": {"$exists": False}})
    if not req:
        raise HTTPException(status_code=404, detail="Request tidak ditemukan")
    if req.get("status") == "fulfilled":
        return {"success": True, "already": True}
    await db.so_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "fulfilled",
            "fulfilled_by": current.get("name") or current.get("username"),
            "fulfilled_at": _now_iso(),
        }},
    )
    await log_action(current, "so_request_fulfill", "so_requests", req_id, {})
    return {"success": True}


@router.post("/{req_id}/reject")
async def reject_so_request(req_id: str, payload: dict = None, current: dict = Depends(get_current_user)):
    role = (current or {}).get("role")
    if role not in ("admin", "super_admin", "supervisor", "sales", "purchasing", "staff"):
        raise HTTPException(status_code=403, detail="Hanya Admin/Sales/Purchasing yang bisa reject")
    reason = ""
    if isinstance(payload, dict):
        reason = str(payload.get("reason") or "").strip()
    await db.so_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "rejected",
            "rejected_by": current.get("name") or current.get("username"),
            "rejected_at": _now_iso(),
            "rejection_reason": reason,
        }},
    )
    await log_action(current, "so_request_reject", "so_requests", req_id, {"reason": reason})
    return {"success": True}
