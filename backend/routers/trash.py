"""Recycle Bin API — Super Admin can list/restore/purge soft-deleted docs.

Frontend uses this to power the "Recycle Bin" tab in Admin Panel.
Auto-purge job (>30d) is triggered on-demand via POST /auto-purge.
"""
from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from deps import log_action, require_super_admin
from services.soft_delete import (
    AUTO_PURGE_DAYS,
    TRASH_COLLECTIONS,
    purge_expired,
    restore_many,
    trash_summary,
)

router = APIRouter(prefix="/admin/trash", tags=["trash"])


DISPLAY_FIELDS = {
    "transactions": ["id", "invoice_no", "vendor_name", "item_name", "total_price", "currency", "invoice_date"],
    "sales_orders": ["id", "so_no", "customer", "so_date", "description"],
    "store_receipts": ["id", "transaction_id", "item_name", "vendor_name", "qty", "receive_date"],
    "store_issuances": ["id", "so_no", "item_name", "qty", "issue_date", "taker"],
    "store_requests": ["id", "kind", "status", "target_id", "requested_at", "requested_by_name"],
    "deliveries": ["id", "gate_pass_no", "destination", "delivery_date"],
    "boms": ["id", "so_no", "rev_no", "customer", "project_name", "uploaded_at"],
    "inquiries": ["id", "inquiry_no", "title", "customer_name", "status", "created_at"],
    "quotations": ["id", "quotation_no", "customer_name", "total_amount", "currency", "created_at"],
    "customers": ["id", "name", "address", "pic"],
    "users": ["id", "username", "full_name", "role"],
}


class RestoreRequest(BaseModel):
    collection: str
    ids: List[str]


class PurgeRequest(BaseModel):
    collection: str
    ids: List[str]
    confirm_phrase: str  # must equal "PURGE-FOREVER"


@router.get("/summary")
async def get_trash_summary(current: dict = Depends(require_super_admin)):
    counts = await trash_summary()
    return {"collections": counts, "total": sum(counts.values()), "auto_purge_days": AUTO_PURGE_DAYS}


@router.get("/list")
async def list_trash(
    collection: str,
    q: Optional[str] = None,
    limit: int = 200,
    current: dict = Depends(require_super_admin),
):
    if collection not in TRASH_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Collection tidak didukung: {collection}")
    filt: dict = {"deleted_at": {"$exists": True, "$ne": None}}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        # Match any of the display fields containing q
        or_clauses = []
        for f in DISPLAY_FIELDS.get(collection, ["id"]):
            or_clauses.append({f: rx})
        filt["$or"] = or_clauses
    docs = await db[collection].find(filt).sort("deleted_at", -1).limit(limit).to_list(length=limit)
    fields = DISPLAY_FIELDS.get(collection, ["id"])
    out = []
    for d in docs:
        row = {f: d.get(f) for f in fields}
        row["deleted_at"] = d.get("deleted_at")
        row["deleted_by_name"] = d.get("deleted_by_name")
        out.append(row)
    return {"collection": collection, "fields": fields, "items": out, "total": len(out)}


@router.post("/restore")
async def restore_docs(payload: RestoreRequest, current: dict = Depends(require_super_admin)):
    if payload.collection not in TRASH_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Collection tidak didukung: {payload.collection}")
    if not payload.ids:
        raise HTTPException(status_code=400, detail="ids kosong")
    n = await restore_many(payload.collection, {"id": {"$in": payload.ids}})
    await log_action(current, "restore_trash", payload.collection, "-", {"count": n, "ids": payload.ids[:20]})
    return {"restored": n}


@router.post("/purge")
async def purge_docs(payload: PurgeRequest, current: dict = Depends(require_super_admin)):
    """Hard-delete specific items in trash — irreversible. Requires PURGE-FOREVER phrase."""
    if payload.confirm_phrase != "PURGE-FOREVER":
        raise HTTPException(status_code=400, detail="Konfirmasi tidak valid. Ketik 'PURGE-FOREVER' (case-sensitive).")
    if payload.collection not in TRASH_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Collection tidak didukung: {payload.collection}")
    if not payload.ids:
        raise HTTPException(status_code=400, detail="ids kosong")
    res = await db[payload.collection].delete_many({"id": {"$in": payload.ids}, "deleted_at": {"$exists": True, "$ne": None}})
    await log_action(current, "purge_trash", payload.collection, "-", {"count": res.deleted_count, "ids": payload.ids[:20]})
    return {"purged": res.deleted_count}


@router.post("/auto-purge")
async def auto_purge(current: dict = Depends(require_super_admin)):
    """Trigger auto-purge for all docs older than AUTO_PURGE_DAYS."""
    report = await purge_expired()
    total = sum(report.values())
    await log_action(current, "auto_purge_trash", "trash", "-", {"total": total, "breakdown": report})
    return {"purged": total, "breakdown": report, "cutoff_days": AUTO_PURGE_DAYS}
