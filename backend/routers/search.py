"""Cross-module global search + SO drill-down / timeline endpoint."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import get_current_user
from routers.bom import normalize_so_no
from services.soft_delete import NOT_DELETED_FILTER, merged

router = APIRouter(tags=["search"])


@router.get("/search/global")
async def global_search(q: str, limit: int = 8, current: dict = Depends(get_current_user)):
    """Cross-module fuzzy search: inquiries, quotations, BOMs, sales orders, vendors, items.

    Returns categorized results with links to open each entity.
    Case-insensitive substring match.
    """
    q = (q or "").strip()
    if not q or len(q) < 2:
        return {"query": q, "results": [], "count": 0}

    rx = {"$regex": q, "$options": "i"}
    role = (current.get("role") or "").lower()
    is_admin_like = role in ("super_admin", "admin", "supervisor", "finance") or current.get("is_super_admin")
    user_id = current.get("id")

    results = []

    # ---- Inquiries (Sales/Eng/Admin) ----
    inq_filter: dict = {
        "$or": [
            {"inquiry_no": rx}, {"title": rx}, {"customer_name": rx},
            {"pic_engineer_name": rx}, {"description": rx},
        ],
    }
    if role == "sales":
        inq_filter["created_by_id"] = user_id
    try:
        inqs = await db.inquiries.find(merged(inq_filter, NOT_DELETED_FILTER), {"_id": 0})\
            .sort("updated_at", -1).limit(limit).to_list(length=limit)
        for i in inqs:
            results.append({
                "type": "inquiry",
                "id": i.get("id"),
                "title": i.get("inquiry_no") or "Inquiry",
                "subtitle": f"{i.get('title', '')} · {i.get('customer_name', '-')}",
                "meta": f"Status: {i.get('status', '-')} · Deadline: {i.get('customer_deadline', '-')}",
                "link": "/sales/inquiries",
                "search_param": "open",
                "search_value": i.get("id"),
            })
    except Exception:
        pass

    # ---- Quotations ----
    quo_filter: dict = {
        "$or": [
            {"quotation_no": rx}, {"customer": rx}, {"attention": rx},
            {"so_no": rx}, {"project_name": rx},
        ],
    }
    if role == "sales":
        quo_filter["created_by_id"] = user_id
    try:
        quos = await db.quotations.find(merged(quo_filter, NOT_DELETED_FILTER), {"_id": 0})\
            .sort("created_at", -1).limit(limit).to_list(length=limit)
        for x in quos:
            results.append({
                "type": "quotation",
                "id": x.get("id"),
                "title": x.get("quotation_no") or "Quotation",
                "subtitle": f"{x.get('customer', '-')} · SO {x.get('so_no', '-')}",
                "meta": f"Status: {x.get('status', '-')} · Total {x.get('currency', 'IDR')} {int(x.get('total_amount', 0)):,}",
                "link": "/sales/quotations",
                "search_param": "open",
                "search_value": x.get("id"),
            })
    except Exception:
        pass

    # ---- BOMs ----
    try:
        # Also normalize the query if numeric — user may search 005221 → should match 5221
        q_norm = normalize_so_no(q)
        bom_filter = {
            "$or": [
                {"so_no": rx}, {"bom_no": rx}, {"customer": rx},
                {"project_name": rx}, {"project_dwg": rx},
                {"so_no": q_norm} if q_norm else {"so_no": rx},
            ],
        }
        boms = await db.boms.find(merged(bom_filter, NOT_DELETED_FILTER), {"_id": 0})\
            .sort("uploaded_at", -1).limit(limit).to_list(length=limit)
        for b in boms:
            results.append({
                "type": "bom",
                "id": b.get("id"),
                "title": f"BOM SO {b.get('so_no')} Rev.{b.get('rev_no', 1)}",
                "subtitle": f"{b.get('customer', '-')} · {b.get('project_name', '-')}",
                "meta": f"Prepared: {b.get('prepared_by', '-')} · Upload: {(b.get('uploaded_at') or '')[:10]}",
                "link": "/bom",
                "search_param": "open",
                "search_value": b.get("id"),
            })
    except Exception:
        pass

    # ---- Sales Orders (Master SO) ----
    try:
        so_filter = {"$or": [{"so_no": rx}, {"customer": rx}, {"description": rx}]}
        q_norm = normalize_so_no(q)
        if q_norm:
            so_filter["$or"].append({"so_no": q_norm})
        sos = await db.sales_orders.find(merged(so_filter, NOT_DELETED_FILTER), {"_id": 0})\
            .sort("so_date", -1).limit(limit).to_list(length=limit)
        for s in sos:
            results.append({
                "type": "sales_order",
                "id": s.get("id"),
                "title": f"SO {s.get('so_no')}",
                "subtitle": f"{s.get('customer', '-')} · {s.get('description', '')}",
                "meta": f"Tanggal SO: {s.get('so_date', '-')}",
                "link": f"/timeline/{s.get('so_no')}",  # deep-link to SO timeline
                "search_param": "",
                "search_value": "",
            })
    except Exception:
        pass

    # ---- Vendors (from transactions distinct) - only for purchasing/admin ----
    if is_admin_like or role in ("purchasing", "finance"):
        try:
            vendor_agg = await db.transactions.aggregate([
                {"$match": merged({"vendor_name": rx}, NOT_DELETED_FILTER)},
                {"$group": {"_id": "$vendor_name", "count": {"$sum": 1}, "total_idr": {"$sum": "$total_price_idr"}, "last": {"$max": "$invoice_date"}}},
                {"$sort": {"count": -1}},
                {"$limit": limit},
            ]).to_list(length=limit)
            for v in vendor_agg:
                results.append({
                    "type": "vendor",
                    "id": v["_id"],
                    "title": v["_id"] or "(no name)",
                    "subtitle": f"{v.get('count', 0)} transaksi · last {v.get('last', '-')}",
                    "meta": f"Total IDR {int(v.get('total_idr', 0)):,}",
                    "link": "/master",
                    "search_param": "q",
                    "search_value": v["_id"],
                })
        except Exception:
            pass

    # ---- Items (from transactions distinct) - purchasing/admin/store ----
    if is_admin_like or role in ("purchasing", "store"):
        try:
            item_agg = await db.transactions.aggregate([
                {"$match": merged({"item_name": rx}, NOT_DELETED_FILTER)},
                {"$group": {"_id": "$item_name", "count": {"$sum": 1}, "last_vendor": {"$last": "$vendor_name"}}},
                {"$sort": {"count": -1}},
                {"$limit": limit},
            ]).to_list(length=limit)
            for it in item_agg:
                results.append({
                    "type": "item",
                    "id": it["_id"],
                    "title": it["_id"] or "(no name)",
                    "subtitle": f"{it.get('count', 0)} pembelian · vendor terakhir: {it.get('last_vendor', '-')}",
                    "meta": "",
                    "link": "/master",
                    "search_param": "q",
                    "search_value": it["_id"],
                })
        except Exception:
            pass

    return {"query": q, "count": len(results), "results": results}


# =============================================================================
# SO Timeline / Drill-down: fetch all related entities for a given SO number
# =============================================================================
@router.get("/timeline/so/{so_no}")
async def so_timeline(so_no: str, current: dict = Depends(get_current_user)):
    """Return a complete timeline of everything related to a specific SO number."""
    so_no_norm = normalize_so_no(so_no)
    if not so_no_norm:
        raise HTTPException(status_code=400, detail="SO number tidak valid")

    role = (current.get("role") or "").lower()
    is_store = role == "store"

    # Master SO
    master = await db.sales_orders.find_one(
        {"so_no": so_no_norm, "deleted_at": {"$exists": False}}, {"_id": 0}
    )

    # Inquiries
    inquiries = await db.inquiries.find(
        merged({"so_no": so_no_norm}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("created_at", 1).to_list(length=100)

    # Quotations
    quotations = await db.quotations.find(
        merged({"so_no": so_no_norm}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("created_at", 1).to_list(length=100)

    # BOMs (all revisions)
    boms = await db.boms.find(
        merged({"so_no": so_no_norm}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("rev_no", 1).to_list(length=100)

    # Purchase transactions (project_no matches SO)
    txs = await db.transactions.find(
        merged({"project_no": so_no_norm}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("invoice_date", 1).to_list(length=500)

    # Redact pricing fields if Store role
    if is_store:
        for t in txs:
            for k in ("unit_price", "total_price", "total_price_idr", "currency", "exchange_rate"):
                t.pop(k, None)
        if quotations:
            for x in quotations:
                for k in ("total_amount", "currency", "items"):
                    x.pop(k, None)

    # Deliveries linked (via items list containing this SO)
    deliveries = await db.deliveries.find(
        merged({"items.so_no": so_no_norm}, NOT_DELETED_FILTER), {"_id": 0}
    ).sort("delivery_date", 1).to_list(length=100)

    # Build unified timeline events
    events = []
    for i in inquiries:
        events.append({
            "when": i.get("created_at") or i.get("submitted_at") or "",
            "type": "inquiry",
            "icon": "chat",
            "title": f"Inquiry {i.get('inquiry_no', '-')}",
            "detail": f"{i.get('title', '')} — {i.get('status', '')}",
            "actor": i.get("created_by_name", "-"),
            "link": "/sales/inquiries",
            "link_id": i.get("id"),
        })
    for q in quotations:
        events.append({
            "when": q.get("created_at", ""),
            "type": "quotation",
            "icon": "invoice",
            "title": f"Quotation {q.get('quotation_no', '-')} Rev.{q.get('rev_no', 0)}",
            "detail": f"Status: {q.get('status', '-')}" + ("" if is_store else f" · Total: {int(q.get('total_amount', 0) or 0):,}"),
            "actor": q.get("created_by_name", "-"),
            "link": "/sales/quotations",
            "link_id": q.get("id"),
        })
    for b in boms:
        events.append({
            "when": b.get("uploaded_at", ""),
            "type": "bom",
            "icon": "list",
            "title": f"BOM Rev.{b.get('rev_no', 1)} diupload",
            "detail": f"{len(b.get('items', []))} item · Reason: {b.get('revision_reason') or '(rev pertama)'}",
            "actor": b.get("uploaded_by_name") or b.get("prepared_by") or "-",
            "link": "/bom",
            "link_id": b.get("id"),
        })
    for t in txs:
        detail = f"{t.get('item_name', '')} · qty {t.get('qty', 0)} {t.get('unit', '')}"
        if not is_store:
            detail += f" · {t.get('currency', 'IDR')} {int(t.get('total_price', 0) or 0):,}"
        events.append({
            "when": t.get("invoice_date", ""),
            "type": "purchase",
            "icon": "cart",
            "title": f"PO {t.get('po_no', '-')} — {t.get('vendor_name', '-')}",
            "detail": detail,
            "actor": t.get("created_by_username") or "-",
            "link": "/master",
            "link_id": None,
        })
    for d in deliveries:
        events.append({
            "when": d.get("delivery_date", ""),
            "type": "delivery",
            "icon": "truck",
            "title": f"Pengiriman → {d.get('destination', '-')}",
            "detail": f"{len(d.get('items', []))} item",
            "actor": d.get("created_by_username", "-"),
            "link": "/deliveries",
            "link_id": d.get("id"),
        })

    # Sort by when (empty strings go to end)
    events.sort(key=lambda x: (x["when"] or "9999", x["type"]))

    # Summary counters
    summary = {
        "so_no": so_no_norm,
        "master_so": master,
        "counts": {
            "inquiries": len(inquiries),
            "quotations": len(quotations),
            "bom_revisions": len(boms),
            "purchases": len(txs),
            "deliveries": len(deliveries),
        },
    }
    # If not store, add total spend
    if not is_store:
        totals_by_cur: dict = {}
        for t in txs:
            c = t.get("currency", "IDR")
            totals_by_cur[c] = totals_by_cur.get(c, 0.0) + float(t.get("total_price", 0) or 0)
        summary["totals_by_currency"] = totals_by_cur

    return {
        "summary": summary,
        "events": events,
        "price_hidden": is_store,
    }
