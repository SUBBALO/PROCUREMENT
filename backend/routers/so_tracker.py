"""SO Document Tracker — progress per-SO (1 SO ≈ 1 DRF: banyak drawing + 1 BOM bersama).

Mendukung penyelesaian PARTIAL:
  - BOM bisa "siap dibeli" (purchase_ready) walau drawing belum lengkap → penanda utk Purchasing.
  - Tiap drawing bisa ditandai "terbit partial" (dirilis duluan) + alasan.

Semua endpoint read bisa diakses semua Engineering + Admin.
Menandai partial/purchase-ready: PIC drawing yang ditunjuk, atau Eng Leader/Admin.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from deps import get_current_user, is_admin_like, is_eng_head, is_engineering, log_action

router = APIRouter(prefix="/so-tracker", tags=["so_tracker"])

# Status drawing yang dianggap "sudah terbit"
RELEASED_STATUSES = {"approved", "controlled", "released"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(d: dict) -> dict:
    if d and "_id" in d:
        d.pop("_id", None)
    return d


def _is_released(dw: dict) -> bool:
    return (dw.get("approval_status") in RELEASED_STATUSES) or bool(dw.get("partial_released"))


async def _bom_for(drf: dict, drawings: list) -> Optional[dict]:
    bom_id = drf.get("shared_bom_id") or (drawings[0].get("bom_id") if drawings else None)
    if not bom_id:
        return None
    return await db.boms.find_one({"id": bom_id}, {"_id": 0})


def _bom_summary(bom: Optional[dict]) -> dict:
    if not bom:
        return {"exists": False, "bom_no": None, "status": None, "items_count": 0,
                "purchase_ready": False, "purchase_ready_reason": "", "purchase_ready_at": None}
    return {
        "exists": True,
        "bom_id": bom.get("id"),
        "bom_no": bom.get("bom_no"),
        "status": bom.get("engineering_status") or "draft",
        "items_count": len(bom.get("items") or []),
        "purchase_ready": bool(bom.get("purchase_ready")),
        "purchase_ready_reason": bom.get("purchase_ready_reason") or "",
        "purchase_ready_at": bom.get("purchase_ready_at"),
        "purchase_ready_by": bom.get("purchase_ready_by"),
    }


@router.get("")
async def list_so_tracker(q: Optional[str] = None, current: dict = Depends(get_current_user)):
    """Daftar SO (DRF yang sudah accepted/in_progress/completed) + ringkasan progress."""
    if not (is_engineering(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Admin")
    filt = {"status": {"$in": ["accepted", "in_progress", "completed"]},
            "deleted_at": {"$exists": False}}
    if q and q.strip():
        import re
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"so_no": rx}, {"form_no": rx}, {"customer_name": rx},
                       {"project_name": rx}, {"assigned_engineer_name": rx}]
    drfs = await db.drawing_requests.find(filt, {"_id": 0}).sort("accepted_at", -1).to_list(length=500)
    items = []
    for drf in drfs:
        drawings = await db.drawings.find(
            {"from_drf_id": drf["id"], "deleted_at": {"$exists": False}}, {"_id": 0}
        ).to_list(length=500)
        total = len(drawings)
        released = sum(1 for d in drawings if _is_released(d))
        partial = sum(1 for d in drawings if d.get("partial_released"))
        bom = await _bom_for(drf, drawings)
        bs = _bom_summary(bom)
        all_done = total > 0 and released == total
        items.append({
            "drf_id": drf["id"],
            "so_no": drf.get("so_no"),
            "form_no": drf.get("form_no"),
            "customer_name": drf.get("customer_name"),
            "project_name": drf.get("project_name"),
            "assigned_engineer_name": drf.get("assigned_engineer_name"),
            "drf_status": drf.get("status"),
            "accepted_at": drf.get("accepted_at"),
            "work_started_at": drf.get("work_started_at"),
            "drawings_total": total,
            "drawings_released": released,
            "drawings_partial": partial,
            "all_drawings_done": all_done,
            "bom": bs,
        })
    return {"items": items, "total": len(items)}


@router.get("/{drf_id}")
async def get_so_tracker_detail(drf_id: str, current: dict = Depends(get_current_user)):
    """Detail tracker 1 SO: info DRF + BOM + daftar drawing dgn status & tanggal."""
    if not (is_engineering(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Admin")
    drf = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not drf:
        raise HTTPException(status_code=404, detail="SO/DRF tidak ditemukan")
    drawings = await db.drawings.find(
        {"from_drf_id": drf_id, "deleted_at": {"$exists": False}}, {"_id": 0}
    ).sort("drawing_no", 1).to_list(length=500)
    bom = await _bom_for(drf, drawings)
    dwg_out = []
    for d in drawings:
        dwg_out.append({
            "id": d.get("id"),
            "drawing_no": d.get("drawing_no"),
            "title": d.get("title"),
            "drawing_type": d.get("drawing_type"),
            "approval_status": d.get("approval_status") or "draft",
            "work_category": d.get("work_category") or "",
            "assigned_to_id": d.get("assigned_to_id"),
            "assigned_to_name": d.get("assigned_to_name"),
            "request_received_at": d.get("request_received_at"),
            "work_started_at": d.get("work_started_at"),
            "work_completed_at": d.get("work_completed_at"),
            "released": _is_released(d),
            "partial_released": bool(d.get("partial_released")),
            "partial_release_reason": d.get("partial_release_reason") or "",
            "partial_released_at": d.get("partial_released_at"),
            "partial_released_by": d.get("partial_released_by"),
        })
    return {
        "drf": {
            "id": drf["id"], "so_no": drf.get("so_no"), "form_no": drf.get("form_no"),
            "customer_name": drf.get("customer_name"), "project_name": drf.get("project_name"),
            "assigned_engineer_id": drf.get("assigned_engineer_id"),
            "assigned_engineer_name": drf.get("assigned_engineer_name"),
            "status": drf.get("status"), "accepted_at": drf.get("accepted_at"),
            "work_started_at": drf.get("work_started_at"),
        },
        "bom": _bom_summary(bom),
        "drawings": dwg_out,
    }


class PartialReleaseIn(BaseModel):
    released: bool = True
    reason: str = ""


@router.post("/drawing/{drawing_id}/partial-release")
async def mark_drawing_partial(drawing_id: str, payload: PartialReleaseIn, current: dict = Depends(get_current_user)):
    """Tandai drawing "terbit partial" (dirilis duluan) + alasan.
    Izin: PIC drawing (assignee), Eng Leader, atau Admin."""
    dw = await db.drawings.find_one({"id": drawing_id, "deleted_at": {"$exists": False}})
    if not dw:
        raise HTTPException(status_code=404, detail="Drawing tidak ditemukan")
    if not (is_engineering(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering / Admin yang bisa menandai partial")
    now = _now_iso()
    who = current.get("name") or current.get("username")
    if payload.released:
        reason = (payload.reason or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Alasan terbit partial wajib diisi")
        upd = {"partial_released": True, "partial_release_reason": reason,
               "partial_released_at": now, "partial_released_by": who, "updated_at": now}
    else:
        upd = {"partial_released": False, "partial_release_reason": "",
               "partial_released_at": None, "partial_released_by": None, "updated_at": now}
    await db.drawings.update_one({"id": drawing_id}, {"$set": upd})
    await log_action(current, "drawing_partial_release", "drawings", drawing_id,
                     {"released": payload.released, "reason": payload.reason})
    return {"success": True, **upd}


class PurchaseReadyIn(BaseModel):
    ready: bool = True
    reason: str = ""


@router.post("/bom/{bom_id}/purchase-ready")
async def mark_bom_purchase_ready(bom_id: str, payload: PurchaseReadyIn, current: dict = Depends(get_current_user)):
    """Tandai BOM "siap dibeli" → penanda utk Purchasing (walau drawing belum lengkap) + alasan.
    Izin: semua Engineering / Admin."""
    if not (is_engineering(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Admin")
    bom = await db.boms.find_one({"id": bom_id})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM tidak ditemukan")
    now = _now_iso()
    who = current.get("name") or current.get("username")
    if payload.ready:
        reason = (payload.reason or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Alasan/catatan untuk Purchasing wajib diisi")
        upd = {"purchase_ready": True, "purchase_ready_reason": reason,
               "purchase_ready_at": now, "purchase_ready_by": who, "updated_at": now}
    else:
        upd = {"purchase_ready": False, "purchase_ready_reason": "",
               "purchase_ready_at": None, "purchase_ready_by": None, "updated_at": now}
    await db.boms.update_one({"id": bom_id}, {"$set": upd})
    await log_action(current, "bom_purchase_ready", "boms", bom_id,
                     {"ready": payload.ready, "reason": payload.reason})
    return {"success": True, **upd}
