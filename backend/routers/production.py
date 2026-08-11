"""Production module — Fase 1: visibilitas SO baru untuk Produksi.

Produksi mendapat daftar Sales Order (SO) sejak SO dibuat (walau drawing belum
di-stamp Doc Control), lengkap dengan penanda apakah drawing/BOM sudah ada, dan
bisa 'acknowledge' (tandai sudah dilihat/disiapkan).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import get_current_user, log_action, is_production, is_admin_like

router = APIRouter(prefix="/production", tags=["production"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _can_view(user: dict) -> bool:
    return is_production(user) or is_admin_like(user)


@router.get("/new-so")
async def list_new_so(scope: str = "unack", current: dict = Depends(get_current_user)):
    """Daftar SO untuk Produksi.
    scope: 'unack' (belum di-acknowledge) | 'all'.
    Mengembalikan info SO + apakah drawing/BOM sudah tersedia (konteks kesiapan).
    """
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")

    q = {"deleted_at": {"$exists": False}}
    if scope == "unack":
        q["prod_ack"] = {"$ne": True}

    sos = await db.sales_orders.find(q, {"_id": 0}).sort("created_at", -1).limit(300).to_list(length=300)

    items = []
    for so in sos:
        so_no = so.get("so_no") or ""
        # Konteks kesiapan: apakah sudah ada drawing / BOM untuk SO ini
        has_drawing = False
        has_bom = False
        if so_no:
            has_drawing = (await db.drawings.count_documents({"so_no": so_no, "deleted_at": {"$exists": False}})) > 0
            has_bom = (await db.boms.count_documents({"so_no": so_no, "deleted_at": {"$exists": False}})) > 0
        items.append({
            "id": so.get("id"),
            "so_no": so_no,
            "so_date": so.get("so_date") or (so.get("created_at") or "")[:10],
            "customer": so.get("customer") or "",
            "description": so.get("description") or "",
            "source_quotation_no": so.get("source_quotation_no") or "",
            "created_at": so.get("created_at") or "",
            "created_by_username": so.get("created_by_username") or "",
            "has_drawing": has_drawing,
            "has_bom": has_bom,
            "prod_ack": bool(so.get("prod_ack")),
            "prod_ack_at": so.get("prod_ack_at") or "",
            "prod_ack_by": so.get("prod_ack_by") or "",
        })

    unack_count = await db.sales_orders.count_documents({"deleted_at": {"$exists": False}, "prod_ack": {"$ne": True}})
    return {"items": items, "count": len(items), "unack_count": unack_count, "scope": scope}


@router.post("/new-so/{so_id}/ack")
async def ack_new_so(so_id: str, current: dict = Depends(get_current_user)):
    """Tandai SO sudah dilihat/disiapkan Produksi."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa acknowledge")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    await db.sales_orders.update_one(
        {"id": so_id},
        {"$set": {
            "prod_ack": True,
            "prod_ack_at": _now_iso(),
            "prod_ack_by": current.get("name") or current.get("username") or "",
        }},
    )
    await log_action(current, "prod_ack_so", "sales_order", so_id, {"so_no": so.get("so_no")})
    return {"ok": True}


@router.post("/new-so/{so_id}/unack")
async def unack_new_so(so_id: str, current: dict = Depends(get_current_user)):
    """Batalkan acknowledge (kembalikan ke daftar SO baru)."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    await db.sales_orders.update_one(
        {"id": so_id},
        {"$set": {"prod_ack": False}, "$unset": {"prod_ack_at": "", "prod_ack_by": ""}},
    )
    await log_action(current, "prod_unack_so", "sales_order", so_id, {"so_no": so.get("so_no")})
    return {"ok": True}
