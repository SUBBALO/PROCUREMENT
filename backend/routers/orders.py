"""Deliveries + Sales Orders routes."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import _now_iso, get_current_user, log_action, require_store_write, require_write
from models import DeliveryCreate, SOCreate

router = APIRouter(tags=["orders"])


# ---------------- Deliveries (Pengiriman Barang - log only) ----------------
@router.post("/deliveries")
async def create_delivery(payload: DeliveryCreate, current: dict = Depends(require_store_write)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Minimal 1 item")
    if not payload.destination.strip():
        raise HTTPException(status_code=400, detail="Tujuan wajib diisi")
    doc = {
        "id": str(uuid.uuid4()),
        "delivery_date": payload.delivery_date,
        "gate_pass_no": payload.gate_pass_no or "",
        "do_no": payload.do_no or "",
        "destination": payload.destination.strip(),
        "driver_name": payload.driver_name or "",
        "items": [it.model_dump() for it in payload.items],
        "remark": payload.remark or "",
        "created_by": current["id"],
        "created_by_username": current.get("username", ""),
        "created_at": _now_iso(),
    }
    await db.deliveries.insert_one(doc.copy())
    await log_action(current, "create_delivery", "delivery", doc["id"], {
        "destination": doc["destination"], "gate_pass": doc["gate_pass_no"], "items": len(doc["items"]),
    })
    doc.pop("_id", None)
    return doc


@router.get("/deliveries")
async def list_deliveries(
    current: dict = Depends(get_current_user),
    q: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    filt: dict = {}
    if q:
        filt["$or"] = [
            {"destination": {"$regex": q, "$options": "i"}},
            {"gate_pass_no": {"$regex": q, "$options": "i"}},
            {"do_no": {"$regex": q, "$options": "i"}},
            {"driver_name": {"$regex": q, "$options": "i"}},
        ]
    if start_date or end_date:
        d: dict = {}
        if start_date:
            d["$gte"] = start_date
        if end_date:
            d["$lte"] = end_date
        filt["delivery_date"] = d
    total = await db.deliveries.count_documents(filt)
    items = await db.deliveries.find(filt, {"_id": 0}).sort("delivery_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.delete("/deliveries/{did}")
async def delete_delivery(did: str, current: dict = Depends(require_store_write)):
    """Admin + store role only (matches create permission)."""
    res = await db.deliveries.delete_one({"id": did})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pengiriman tidak ditemukan")
    await log_action(current, "delete_delivery", "delivery", did, {})
    return {"ok": True}


# ---------------- Master Sales Order ----------------
@router.get("/sales-orders")
async def list_sales_orders(current: dict = Depends(get_current_user), q: Optional[str] = None):
    filt: dict = {}
    if q:
        filt["$or"] = [
            {"so_no": {"$regex": q, "$options": "i"}},
            {"customer": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.sales_orders.find(filt, {"_id": 0}).sort("so_date", -1).to_list(length=5000)
    return docs


@router.post("/sales-orders")
async def create_so(payload: SOCreate, current: dict = Depends(require_write)):
    so_no = payload.so_no.strip()
    if not so_no:
        raise HTTPException(status_code=400, detail="Nomor SO wajib")
    existing = await db.sales_orders.find_one({"so_no": so_no})
    if existing:
        raise HTTPException(status_code=400, detail=f"SO {so_no} sudah ada")
    doc = {
        "id": str(uuid.uuid4()),
        "so_no": so_no,
        "so_date": payload.so_date,
        "customer": payload.customer.strip(),
        "description": payload.description or "",
        "created_by": current["id"],
        "created_by_username": current.get("username", ""),
        "created_at": _now_iso(),
    }
    await db.sales_orders.insert_one(doc.copy())
    await log_action(current, "create_so", "sales_order", doc["id"], {"so_no": so_no, "customer": doc["customer"]})
    doc.pop("_id", None)
    return doc


@router.put("/sales-orders/{sid}")
async def update_so(sid: str, payload: SOCreate, current: dict = Depends(require_write)):
    so = await db.sales_orders.find_one({"id": sid})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    upd = {
        "so_no": payload.so_no.strip(),
        "so_date": payload.so_date,
        "customer": payload.customer.strip(),
        "description": payload.description or "",
    }
    await db.sales_orders.update_one({"id": sid}, {"$set": upd})
    await log_action(current, "update_so", "sales_order", sid, upd)
    updated = await db.sales_orders.find_one({"id": sid}, {"_id": 0})
    return updated


@router.delete("/sales-orders/{sid}")
async def delete_so(sid: str, current: dict = Depends(require_write)):
    res = await db.sales_orders.delete_one({"id": sid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    await log_action(current, "delete_so", "sales_order", sid, {})
    return {"ok": True}
