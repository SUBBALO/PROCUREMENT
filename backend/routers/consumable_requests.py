"""Consumable Good Request — Store minta pembelian consumable, Purchasing tandai saat sudah dibeli."""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import _now_iso, get_current_user, log_action
from services.soft_delete import NOT_DELETED_FILTER, merged, soft_delete_one

router = APIRouter(tags=["consumable-requests"])


@router.get("/consumable-requests")
async def list_requests(current: dict = Depends(get_current_user)):
    docs = await db.consumable_requests.find(
        merged({}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("created_at", -1).limit(500).to_list(length=500)
    return docs


@router.post("/consumable-requests")
async def create_request(payload: dict, current: dict = Depends(get_current_user)):
    now = _now_iso()
    items = payload.get("items") or []
    for it in items:
        it.setdefault("id", str(uuid.uuid4()))
        it.setdefault("purchased", False)
        it.setdefault("purchases", [])
    doc = {
        "id": str(uuid.uuid4()),
        "request_date": payload.get("request_date") or now[:10],
        "request_by": payload.get("request_by") or current.get("name") or current.get("username"),
        "notes": payload.get("notes", ""),
        "items": items,
        "status": "open",
        "created_at": now,
        "created_by_id": current.get("id"),
        "created_by_name": current.get("username"),
    }
    await db.consumable_requests.insert_one(doc.copy())
    await log_action(current, "create_consumable_request", "consumable_request", doc["id"],
                     {"item_count": len(items)})
    doc.pop("_id", None)
    return doc


APPROVER_ROLES = {"admin", "super_admin", "supervisor"}


def _can_edit_directly(current: dict, existing: dict) -> bool:
    """True jika user boleh apply perubahan langsung tanpa approval:
    - admin / super_admin / supervisor selalu bisa
    - creator = store & status masih open → bisa edit sendiri (self-serve untuk request-nya sendiri)
    """
    role = current.get("role")
    if role in APPROVER_ROLES:
        return True
    if (
        role == "store"
        and existing.get("created_by_id") == current.get("id")
        and existing.get("status") == "open"
    ):
        return True
    return False


async def _apply_edit(req_id: str, upd: dict, current: dict) -> dict:
    upd = {k: v for k, v in (upd or {}).items() if k in ("request_date", "request_by", "notes", "items", "status")}
    upd["updated_at"] = _now_iso()
    await db.consumable_requests.update_one({"id": req_id}, {"$set": upd})
    await log_action(current, "update_consumable_request", "consumable_request", req_id, {"fields": list(upd.keys())})
    return await db.consumable_requests.find_one({"id": req_id}, {"_id": 0})


async def _create_approval(action: str, req_id: str, payload: dict, current: dict) -> dict:
    """Store submit permintaan Edit/Delete → simpan sebagai pending approval."""
    now = _now_iso()
    ap = {
        "id": str(uuid.uuid4()),
        "request_id": req_id,
        "action": action,               # "edit" | "delete"
        "payload": payload or {},
        "status": "pending",
        "requested_by_id": current.get("id"),
        "requested_by_name": current.get("username") or current.get("name") or "",
        "requested_at": now,
        "reviewed_by_id": None,
        "reviewed_by_name": None,
        "reviewed_at": None,
        "reject_reason": None,
    }
    await db.consumable_request_approvals.insert_one(ap.copy())
    await log_action(current, f"submit_consumable_{action}_approval", "consumable_request", req_id, {"approval_id": ap["id"]})
    ap.pop("_id", None)
    return ap


@router.patch("/consumable-requests/{req_id}")
async def update_request(req_id: str, payload: dict, current: dict = Depends(get_current_user)):
    existing = await db.consumable_requests.find_one({"id": req_id, "deleted_at": {"$exists": False}})
    if not existing:
        raise HTTPException(status_code=404, detail="Request tidak ditemukan")
    if _can_edit_directly(current, existing):
        return await _apply_edit(req_id, payload, current)
    # Role store non-creator (atau status != open) → submit approval
    if current.get("role") not in {"store"} | APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="Tidak berwenang edit request ini")
    ap = await _create_approval("edit", req_id, payload, current)
    return {"pending_approval": True, "approval": ap, "detail": "Permintaan edit dikirim, menunggu persetujuan Admin/Supervisor"}


@router.delete("/consumable-requests/{req_id}")
async def delete_request(req_id: str, current: dict = Depends(get_current_user)):
    existing = await db.consumable_requests.find_one({"id": req_id, "deleted_at": {"$exists": False}})
    if not existing:
        raise HTTPException(status_code=404, detail="Request tidak ditemukan")
    if _can_edit_directly(current, existing):
        await soft_delete_one("consumable_requests", {"id": req_id}, current)
        return {"ok": True}
    if current.get("role") not in {"store"} | APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="Tidak berwenang hapus request ini")
    ap = await _create_approval("delete", req_id, {}, current)
    return {"pending_approval": True, "approval": ap, "detail": "Permintaan hapus dikirim, menunggu persetujuan Admin/Supervisor"}


@router.get("/consumable-requests/approvals")
async def list_approvals(status: Optional[str] = "pending", current: dict = Depends(get_current_user)):
    """Approver: lihat semua approvals. Store: lihat approval yg dia submit.
    Query `status`: pending | approved | rejected | all"""
    filt: dict = {}
    if status and status != "all":
        filt["status"] = status
    if current.get("role") not in APPROVER_ROLES:
        filt["requested_by_id"] = current.get("id")
    docs = await db.consumable_request_approvals.find(filt, {"_id": 0}).sort("requested_at", -1).limit(200).to_list(length=200)
    # attach request summary (request_by + status)
    for ap in docs:
        r = await db.consumable_requests.find_one({"id": ap["request_id"]}, {"_id": 0, "request_by": 1, "status": 1, "items": 1})
        if r:
            ap["request_summary"] = {
                "request_by": r.get("request_by"),
                "current_status": r.get("status"),
                "item_count": len(r.get("items") or []),
            }
    return docs


@router.post("/consumable-requests/approvals/{ap_id}/approve")
async def approve_change(ap_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="Tidak berwenang approve")
    ap = await db.consumable_request_approvals.find_one({"id": ap_id})
    if not ap:
        raise HTTPException(status_code=404, detail="Approval tidak ditemukan")
    if ap.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Approval sudah {ap.get('status')}")
    # Apply the change
    if ap["action"] == "edit":
        await _apply_edit(ap["request_id"], ap.get("payload") or {}, current)
    elif ap["action"] == "delete":
        await soft_delete_one("consumable_requests", {"id": ap["request_id"]}, current)
    now = _now_iso()
    await db.consumable_request_approvals.update_one(
        {"id": ap_id},
        {"$set": {"status": "approved", "reviewed_by_id": current.get("id"), "reviewed_by_name": current.get("username"), "reviewed_at": now}},
    )
    await log_action(current, "approve_consumable_change", "consumable_request", ap["request_id"], {"approval_id": ap_id, "action": ap["action"]})
    return {"ok": True}


@router.post("/consumable-requests/approvals/{ap_id}/reject")
async def reject_change(ap_id: str, payload: dict, current: dict = Depends(get_current_user)):
    if current.get("role") not in APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="Tidak berwenang reject")
    reason = (payload or {}).get("reason") or ""
    if not reason.strip():
        raise HTTPException(status_code=400, detail="Alasan reject wajib diisi")
    ap = await db.consumable_request_approvals.find_one({"id": ap_id})
    if not ap:
        raise HTTPException(status_code=404, detail="Approval tidak ditemukan")
    if ap.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Approval sudah {ap.get('status')}")
    now = _now_iso()
    await db.consumable_request_approvals.update_one(
        {"id": ap_id},
        {"$set": {"status": "rejected", "reject_reason": reason.strip(), "reviewed_by_id": current.get("id"), "reviewed_by_name": current.get("username"), "reviewed_at": now}},
    )
    await log_action(current, "reject_consumable_change", "consumable_request", ap["request_id"], {"approval_id": ap_id, "reason": reason})
    return {"ok": True}


@router.post("/consumable-requests/{req_id}/items/{item_id}/mark-purchased")
async def mark_item_purchased(req_id: str, item_id: str, payload: dict,
                              current: dict = Depends(get_current_user)):
    """Purchasing mark that a request item has been bought (with actual purchase details).
    Payload: {actual_item_name, vendor_name, qty_bought, unit, purchase_date, po_no, transaction_id?, source?}
    source: 'offline' (untuk pembelian di luar sistem) or omitted for legacy calls."""
    req = await db.consumable_requests.find_one({"id": req_id, "deleted_at": {"$exists": False}})
    if not req:
        raise HTTPException(status_code=404, detail="Request tidak ditemukan")
    items = req.get("items") or []
    target = None
    for it in items:
        if it.get("id") == item_id:
            target = it
            break
    if not target:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")

    purchase_entry = {
        "purchased_at": _now_iso(),
        "purchased_by": current.get("username"),
        "actual_item_name": payload.get("actual_item_name") or target.get("description"),
        "vendor_name": payload.get("vendor_name", ""),
        "qty_bought": float(payload.get("qty_bought") or 0),
        "unit": payload.get("unit", ""),
        "purchase_date": payload.get("purchase_date") or _now_iso()[:10],
        "po_no": payload.get("po_no", ""),
        "transaction_id": payload.get("transaction_id"),
        "source": payload.get("source") or "offline",
        "note": payload.get("note", ""),
    }
    target.setdefault("purchases", []).append(purchase_entry)
    total_bought = sum(float(p.get("qty_bought") or 0) for p in target["purchases"])
    if total_bought >= float(target.get("qty") or 0):
        target["purchased"] = True

    # Update request status if ALL items are marked purchased
    all_done = all(it.get("purchased") for it in items)
    new_status = "fulfilled" if all_done else "partial"

    await db.consumable_requests.update_one(
        {"id": req_id},
        {"$set": {"items": items, "status": new_status, "updated_at": _now_iso()}},
    )
    await log_action(current, "mark_consumable_item_purchased", "consumable_request", req_id,
                     {"item_id": item_id, "actual": purchase_entry["actual_item_name"], "source": purchase_entry["source"]})
    doc = await db.consumable_requests.find_one({"id": req_id}, {"_id": 0})
    return doc


@router.get("/consumable-requests/search-transactions")
async def search_transactions_for_link(
    q: Optional[str] = None,
    days: int = 60,
    current: dict = Depends(get_current_user),
):
    """Search existing transactions to link with a Consumable Request item (retroactive).
    Filter by item name (fuzzy), vendor, invoice_no, po_no, within last N days (default 60)."""
    from datetime import timedelta
    import re as _re
    cutoff = (datetime.utcnow() - timedelta(days=int(days))).strftime("%Y-%m-%d")
    filt: dict = {"invoice_date": {"$gte": cutoff}}
    if q and q.strip():
        rx = {"$regex": _re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"item_name": rx}, {"vendor_name": rx}, {"invoice_no": rx}, {"po_no": rx}]
    docs = await db.transactions.find(merged(filt, NOT_DELETED_FILTER), {"_id": 0}).sort("invoice_date", -1).to_list(length=100)
    return [
        {
            "id": d.get("id"),
            "invoice_date": d.get("invoice_date"),
            "vendor_name": d.get("vendor_name"),
            "item_name": d.get("item_name"),
            "qty": d.get("qty"),
            "unit": d.get("unit"),
            "unit_price": d.get("unit_price"),
            "po_no": d.get("po_no") or "",
            "invoice_no": d.get("invoice_no") or "",
            "project_no": d.get("project_no") or "",
            "already_linked": bool(d.get("consumable_request_item_id")),
        }
        for d in docs
    ]


@router.post("/consumable-requests/{req_id}/items/{item_id}/link-transaction")
async def link_existing_transaction(
    req_id: str, item_id: str, payload: dict,
    current: dict = Depends(get_current_user),
):
    """Retroactively link an existing transaction to a request item (Opsi A).
    Payload: {transaction_id: str}"""
    tx_id = payload.get("transaction_id")
    if not tx_id:
        raise HTTPException(status_code=400, detail="transaction_id wajib")
    tx = await db.transactions.find_one({"id": tx_id, "deleted_at": {"$exists": False}})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    if tx.get("consumable_request_item_id"):
        raise HTTPException(status_code=400, detail="Transaksi sudah ter-link ke item request lain")

    # Update the tx to point to this request item (so future delete auto-unlinks)
    await db.transactions.update_one(
        {"id": tx_id},
        {"$set": {"consumable_request_id": req_id, "consumable_request_item_id": item_id, "updated_at": _now_iso()}},
    )
    # Register the purchase in the request item
    await link_purchase_to_request(
        req_id, item_id,
        actual_item_name=tx.get("item_name") or "",
        vendor_name=tx.get("vendor_name") or "",
        qty_bought=float(tx.get("qty") or 0),
        unit=tx.get("unit") or "",
        purchase_date=tx.get("invoice_date") or "",
        po_no=tx.get("po_no") or "",
        transaction_id=tx_id, current=current,
    )
    await log_action(current, "link_existing_tx_to_consumable", "consumable_request", req_id,
                     {"item_id": item_id, "transaction_id": tx_id, "vendor": tx.get("vendor_name")})
    doc = await db.consumable_requests.find_one({"id": req_id}, {"_id": 0})
    return doc


@router.get("/consumable-requests/open-items")
async def list_open_items(current: dict = Depends(get_current_user)):
    """Flat list of items still needing purchase (for use in transaction input dropdown)."""
    reqs = await db.consumable_requests.find(
        merged({"status": {"$in": ["open", "partial"]}}, NOT_DELETED_FILTER),
        {"_id": 0},
    ).sort("created_at", -1).to_list(length=200)
    out = []
    for r in reqs:
        for it in r.get("items") or []:
            if it.get("purchased"):
                continue
            out.append({
                "request_id": r["id"],
                "item_id": it["id"],
                "request_date": r.get("request_date"),
                "request_by": r.get("request_by"),
                "description": it.get("description"),
                "qty": it.get("qty"),
                "so": it.get("so"),
                "remarks": it.get("remarks"),
                "unit": it.get("unit") or "",
            })
    return out


# =============================================================================
# Helpers used by transactions router to auto-link purchases → mark-purchased
# =============================================================================
async def link_purchase_to_request(
    request_id: str,
    item_id: str,
    *,
    actual_item_name: str,
    vendor_name: str,
    qty_bought: float,
    unit: str,
    purchase_date: str,
    po_no: str,
    transaction_id: str,
    current: dict,
) -> None:
    """Idempotent: append a purchase entry keyed by transaction_id; recompute item status."""
    req = await db.consumable_requests.find_one({"id": request_id, "deleted_at": {"$exists": False}})
    if not req:
        return
    items = req.get("items") or []
    for it in items:
        if it.get("id") != item_id:
            continue
        purchases = it.setdefault("purchases", [])
        # Remove any existing entry for this transaction_id (idempotent update)
        purchases = [p for p in purchases if p.get("transaction_id") != transaction_id]
        purchases.append({
            "purchased_at": _now_iso(),
            "purchased_by": current.get("username"),
            "actual_item_name": actual_item_name or it.get("description"),
            "vendor_name": vendor_name or "",
            "qty_bought": float(qty_bought or 0),
            "unit": unit or "",
            "purchase_date": purchase_date or _now_iso()[:10],
            "po_no": po_no or "",
            "transaction_id": transaction_id,
        })
        it["purchases"] = purchases
        total_bought = sum(float(p.get("qty_bought") or 0) for p in purchases)
        it["purchased"] = total_bought >= float(it.get("qty") or 0)
        break
    all_done = all(x.get("purchased") for x in items) if items else False
    any_bought = any((x.get("purchases") or []) for x in items)
    new_status = "fulfilled" if all_done else ("partial" if any_bought else "open")
    await db.consumable_requests.update_one(
        {"id": request_id},
        {"$set": {"items": items, "status": new_status, "updated_at": _now_iso()}},
    )


async def unlink_purchase_from_request(
    request_id: str, item_id: str, *, transaction_id: str
) -> None:
    """Remove a purchase entry (invoked when a linked transaction is deleted)."""
    req = await db.consumable_requests.find_one({"id": request_id, "deleted_at": {"$exists": False}})
    if not req:
        return
    items = req.get("items") or []
    for it in items:
        if it.get("id") != item_id:
            continue
        purchases = [p for p in (it.get("purchases") or []) if p.get("transaction_id") != transaction_id]
        it["purchases"] = purchases
        total_bought = sum(float(p.get("qty_bought") or 0) for p in purchases)
        it["purchased"] = total_bought >= float(it.get("qty") or 0)
        break
    all_done = all(x.get("purchased") for x in items) if items else False
    any_bought = any((x.get("purchases") or []) for x in items)
    new_status = "fulfilled" if all_done else ("partial" if any_bought else "open")
    await db.consumable_requests.update_one(
        {"id": request_id},
        {"$set": {"items": items, "status": new_status, "updated_at": _now_iso()}},
    )
