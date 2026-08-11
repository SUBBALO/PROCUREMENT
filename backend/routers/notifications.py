"""Central notifications endpoint — aggregates action-required items across departments per role."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from deps import (
    ADMIN_LIKE_ROLES,
    ENGINEERING_HEAD_ROLES,
    SALES_ROLES,
    DOC_CONTROL_ROLES,
    get_current_user,
    is_admin_like,
    is_doc_control,
    is_eng_head,
    is_super_admin_user,
)

router = APIRouter()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _iso_days_from_now(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


async def _gather_notifications(user: dict) -> dict:
    """Build a categorized notification payload for the given user.
    Returns:
      {
        total_count: int,
        categories: [ {key, label, count, items: [...], severity} ... ],
      }
    Severity: 'info' | 'warn' | 'critical'
    """
    role = user.get("role")
    user_id = user.get("id")
    perms = user.get("perms") or []
    admin_like = is_admin_like(user)
    can_approve = admin_like and "approve_store_requests" in perms
    # Supervisor implicit approve rights per require_approve_perm — mirror that here:
    if role == "supervisor":
        can_approve = True
    # Super admin always can
    if is_super_admin_user(user):
        can_approve = True

    categories = []

    # ------------- ECN menunggu TTD (Produksi / QA-QC) -------------
    role_prod = role in ("produksi", "production")
    role_qc = role == "qc"
    if role_prod or role_qc or admin_like:
        try:
            cand = await db.drawings.find(
                {"approval_status": {"$in": ["controlled", "released"]},
                 "revision_request.ecn.ecn_no": {"$exists": True},
                 "deleted_at": {"$exists": False}},
                {"_id": 0, "id": 1, "drawing_no": 1, "so_no": 1, "revision_request": 1},
            ).to_list(length=100)
            ecn_items = []
            overdue_any = False
            now_dt = datetime.now(timezone.utc)
            for d in cand:
                rr = d.get("revision_request") or {}
                ecn = rr.get("ecn") or {}
                ack = rr.get("ack") or {"stage": "production"}
                st = ack.get("stage", "production")
                if st == "done":
                    continue
                mine = (st == "production" and (role_prod or admin_like)) or (st == "qa_qc" and (role_qc or admin_like))
                if not mine:
                    continue
                if st == "production":
                    since = rr.get("completed_at") or rr.get("requested_at")
                else:
                    since = (ack.get("production") or {}).get("at") or rr.get("requested_at")
                days = None
                overdue = False
                try:
                    if since:
                        sdt = datetime.fromisoformat(str(since).replace("Z", "+00:00"))
                        days = (now_dt - sdt).days
                        overdue = days is not None and days >= 2
                except Exception:
                    pass
                if overdue:
                    overdue_any = True
                ecn_items.append({
                    "id": d.get("id"),
                    "title": (("TERLAMBAT · " if overdue else "") + f"{ecn.get('ecn_no')} menunggu TTD Anda"),
                    "detail": f"{'Acknowledge Produksi' if st == 'production' else 'Tanda Tangan QA/QC'} · {d.get('drawing_no', '')}"
                              + (f" · sudah {days} hari" if days is not None and days > 0 else ""),
                    "sub": f"SO {d.get('so_no', '') or '-'}",
                    "link": "/drawings/pending-my-approval",
                    "kind": "ecn_ttd",
                    "overdue": overdue,
                    "days_waiting": days,
                    "created_at": since,
                })
            if ecn_items:
                ecn_items.sort(key=lambda x: (not x.get("overdue"), -(x.get("days_waiting") or 0)))
                categories.append({
                    "key": "ecn_ttd",
                    "label": "Menunggu TTD ECN" + (" (ada TERLAMBAT)" if overdue_any else ""),
                    "count": len(ecn_items),
                    "severity": "danger" if overdue_any else "warn",
                    "items": ecn_items,
                })
        except Exception:
            pass

    # ------------- SO Baru untuk Produksi (belum di-acknowledge) -------------
    if role_prod or admin_like:
        try:
            new_sos = await db.sales_orders.find(
                {"deleted_at": {"$exists": False}, "prod_ack": {"$ne": True}},
                {"_id": 0, "id": 1, "so_no": 1, "customer": 1, "so_date": 1, "created_at": 1, "description": 1},
            ).sort("created_at", -1).limit(50).to_list(length=50)
            if new_sos:
                so_items = []
                for so in new_sos:
                    so_items.append({
                        "id": so.get("id"),
                        "title": f"SO {so.get('so_no', '') or '-'} · {so.get('customer', '') or '-'}",
                        "detail": so.get("description", "") or "SO baru — siapkan produksi",
                        "sub": f"Tanggal {so.get('so_date') or (so.get('created_at') or '')[:10]}",
                        "link": "/produksi/new-so",
                        "kind": "prod_new_so",
                        "created_at": so.get("created_at"),
                    })
                categories.append({
                    "key": "prod_new_so",
                    "label": "SO Baru — perlu disiapkan Produksi",
                    "count": len(so_items),
                    "severity": "info",
                    "items": so_items,
                })
        except Exception:
            pass

    if can_approve:
        try:
            pending_store = await db.store_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(length=20)
            if pending_store:
                items = [
                    {
                        "id": r.get("id"),
                        "title": f"Koreksi {r.get('type', '?')}",
                        "detail": r.get("reason", "")[:80],
                        "sub": f"{r.get('requested_by_name', '')} · {(r.get('created_at') or '')[:10]}",
                        "link": "/admin",
                        "kind": "store_request",
                        "created_at": r.get("created_at"),
                    } for r in pending_store
                ]
                categories.append({
                    "key": "store_requests",
                    "label": "Permohonan Koreksi Store",
                    "count": len(pending_store),
                    "severity": "warn",
                    "items": items,
                })
        except Exception:
            pass

    # ------------- SO Requests from Engineering (for Admin / Sales / Purchasing) -------------
    if role in ("admin", "super_admin", "supervisor", "sales", "purchasing", "staff"):
        try:
            pending_so_req = await db.so_requests.find(
                {"status": "pending", "deleted_at": {"$exists": False}},
                {"_id": 0},
            ).sort("created_at", -1).limit(20).to_list(length=20)
            if pending_so_req:
                items = [
                    {
                        "id": r.get("id"),
                        "title": f"{r.get('requested_so_no') or '(SO baru)'} — permintaan dari Engineering",
                        "detail": f"{r.get('customer_hint') or '-'} · {r.get('project_hint') or '-'}",
                        "sub": f"Dari: {r.get('requested_by_name', '-')} · {(r.get('created_at') or '')[:10]} · {(r.get('notes') or '')[:60]}",
                        "link": "/so-master",
                        "kind": "so_request",
                        "created_at": r.get("created_at"),
                    } for r in pending_so_req
                ]
                categories.append({
                    "key": "so_requests",
                    "label": "Permintaan SO Baru dari Engineering",
                    "count": len(pending_so_req),
                    "severity": "warn",
                    "items": items,
                })
        except Exception:
            pass

    # ------------- Sales awaiting review (my inquiries) -------------
    if role == "sales":
        pending_review = await db.inquiries.find(
            {"status": "awaiting_review", "created_by_id": user_id, "deleted_at": {"$exists": False}},
            {"_id": 0},
        ).sort("updated_at", -1).limit(20).to_list(length=20)
        if pending_review:
            items = [
                {
                    "id": i.get("id"),
                    "title": f"{i.get('inquiry_no')} — menunggu review",
                    "detail": f"{i.get('title')} · {i.get('customer_name')}",
                    "sub": f"PIC: {i.get('pic_engineer_name', '-')} · Ditugaskan ke: {i.get('assigned_to_name', '-')}",
                    "link": "/sales/inquiries",
                    "kind": "inquiry_review",
                    "created_at": i.get("updated_at"),
                } for i in pending_review
            ]
            categories.append({
                "key": "inquiry_review",
                "label": "Inquiry Menunggu Review Anda",
                "count": len(pending_review),
                "severity": "warn",
                "items": items,
            })

    # ------------- Eng Head — pending assignment -------------
    if is_eng_head(user):
        pending_assign = await db.inquiries.find(
            {"status": "submitted",
             "deleted_at": {"$exists": False},
             "$or": [{"assigned_to_id": ""}, {"assigned_to_id": {"$exists": False}}]},
            {"_id": 0},
        ).sort("submitted_at", -1).limit(20).to_list(length=20)
        if pending_assign:
            items = [
                {
                    "id": i.get("id"),
                    "title": f"{i.get('inquiry_no')} — perlu di-assign",
                    "detail": f"{i.get('title')} · {i.get('customer_name')}",
                    "sub": f"Deadline: {i.get('customer_deadline', '-')} · Dari: {i.get('created_by_name')}",
                    "link": "/engineering/inquiries",
                    "kind": "inquiry_pending_assignment",
                    "created_at": i.get("submitted_at"),
                } for i in pending_assign
            ]
            categories.append({
                "key": "inquiry_pending_assignment",
                "label": "Inquiry Menunggu Assign ke Engineer",
                "count": len(pending_assign),
                "severity": "critical",
                "items": items,
            })

        # Eng Head — inquiries waiting for HEAD review (from staff)
        pending_head = await db.inquiries.find(
            {"status": "pending_head_review", "deleted_at": {"$exists": False}},
            {"_id": 0},
        ).sort("submitted_to_head_at", -1).limit(20).to_list(length=20)
        if pending_head:
            items = [
                {
                    "id": i.get("id"),
                    "title": f"{i.get('inquiry_no')} — review costing",
                    "detail": f"{i.get('title')} · {i.get('customer_name')}",
                    "sub": f"Dari: {i.get('assigned_to_name', '-')} · Kirim: {(i.get('submitted_to_head_at') or '')[:10]}",
                    "link": "/engineering/inquiries",
                    "kind": "inquiry_pending_head_review",
                    "created_at": i.get("submitted_to_head_at"),
                } for i in pending_head
            ]
            categories.append({
                "key": "inquiry_pending_head_review",
                "label": "Costing Engineer Menunggu Review Head",
                "count": len(pending_head),
                "severity": "warn",
                "items": items,
            })

        # Eng Leader — BOMs pending review from engineer (Iter 36 workflow)
        pending_bom_review = await db.boms.find(
            {"engineering_status": "pending_review", "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "bom_no": 1, "so_no": 1, "customer": 1, "project_name": 1,
             "submitted_at": 1, "signatures": 1, "items": 1},
        ).sort("submitted_at", -1).limit(20).to_list(length=20)
        if pending_bom_review:
            items = [
                {
                    "id": b.get("id"),
                    "title": f"{b.get('bom_no')} — BOM review",
                    "detail": f"{b.get('project_name') or '-'} · {b.get('customer') or '-'} · {len(b.get('items') or [])} item",
                    "sub": f"SO: {b.get('so_no', '-')} · Dari: {((b.get('signatures') or {}).get('prepared_by') or {}).get('name', '-')} · Submit: {((b.get('submitted_at') or '')[:10])}",
                    "link": f"/engineering/bom-entry/{b.get('id')}",
                    "kind": "bom_pending_review",
                    "created_at": b.get("submitted_at"),
                } for b in pending_bom_review
            ]
            categories.append({
                "key": "bom_pending_review",
                "label": "BOM Menunggu Review Engineering Leader",
                "count": len(pending_bom_review),
                "severity": "critical",
                "items": items,
            })

        # Eng Leader — BOM Reopen Requests (permintaan edit ulang setelah approved)
        pending_reopen = await db.bom_reopen_requests.find(
            {"status": "pending", "deleted_at": {"$exists": False}},
            {"_id": 0},
        ).sort("created_at", -1).limit(20).to_list(length=20)
        if pending_reopen:
            items = [
                {
                    "id": r.get("id"),
                    "title": f"{r.get('bom_no')} — request edit ulang",
                    "detail": (r.get("reason") or "")[:80],
                    "sub": f"Dari: {r.get('requested_by_name', '-')} · SO {r.get('so_no', '-')} · {(r.get('created_at') or '')[:10]}",
                    "link": f"/engineering/bom-entry/{r.get('bom_id')}",
                    "kind": "bom_reopen_request",
                    "created_at": r.get("created_at"),
                } for r in pending_reopen
            ]
            categories.append({
                "key": "bom_reopen_requests",
                "label": "Permintaan Edit Ulang BOM (Approved)",
                "count": len(pending_reopen),
                "severity": "warn",
                "items": items,
            })

    # ------------- Engineer (any) — BOMs returned to draft with revision notes -------------
    if role in ("eng_staff", "engineering", "eng_leader", "eng_head"):
        # Show BOMs that:
        # - Are in draft
        # - Have at least one revision note
        # - Were prepared by this user (so eng_staff sees only their own returned BOMs)
        query = {
            "engineering_status": "draft",
            "revision_notes.0": {"$exists": True},
            "deleted_at": {"$exists": False},
        }
        if role in ("eng_staff",):
            query["signatures.prepared_by.user_id"] = user_id
        returned = await db.boms.find(query, {"_id": 0, "id": 1, "bom_no": 1, "so_no": 1, "customer": 1,
                                              "project_name": 1, "revision_notes": 1, "review_rejected_at": 1}).sort("review_rejected_at", -1).limit(20).to_list(length=20)
        if returned:
            items = []
            for b in returned:
                notes = b.get("revision_notes") or []
                last = notes[-1] if notes else {}
                items.append({
                    "id": b.get("id"),
                    "title": f"{b.get('bom_no')} — perlu revisi",
                    "detail": (last.get("comment") or "Ada catatan revisi baru")[:80],
                    "sub": f"SO: {b.get('so_no', '-')} · Dari: {last.get('by', '-')} · {(last.get('at') or '')[:10]}",
                    "link": f"/engineering/bom-entry/{b.get('id')}",
                    "kind": "bom_revision_needed",
                    "created_at": b.get("review_rejected_at") or last.get("at"),
                })
            categories.append({
                "key": "bom_revision_needed",
                "label": "BOM Perlu Revisi (Kembali dari Engineering Leader)",
                "count": len(returned),
                "severity": "warn",
                "items": items,
            })

    # ------------- Eng Staff — assigned to me, not yet accepted / need revision -------------
    if role == "eng_staff":
        assigned_to_me = await db.inquiries.find(
            {"status": {"$in": ["submitted", "head_revision"]},
             "assigned_to_id": user_id,
             "deleted_at": {"$exists": False}},
            {"_id": 0},
        ).sort("assigned_at", -1).limit(20).to_list(length=20)
        if assigned_to_me:
            items = []
            for i in assigned_to_me:
                is_revision = i.get("status") == "head_revision"
                items.append({
                    "id": i.get("id"),
                    "title": f"{i.get('inquiry_no')} — {'revisi diminta' if is_revision else 'ditugaskan ke Anda'}",
                    "detail": f"{i.get('title')} · {i.get('customer_name')}",
                    "sub": f"Dari: {i.get('assigned_by_name', '-')} · Deadline customer: {i.get('customer_deadline', '-')}",
                    "link": "/engineering/inquiries",
                    "kind": "inquiry_assigned_to_me",
                    "created_at": i.get("assigned_at"),
                })
            categories.append({
                "key": "inquiry_assigned_to_me",
                "label": "Tugas Engineering Anda",
                "count": len(assigned_to_me),
                "severity": "critical",
                "items": items,
            })

    # ------------- Deadline reminders (upcoming ≤7 days, not accepted/closed) -------------
    # Applies to sales owner + assigned engineer + admin-like
    now_str = datetime.now(timezone.utc).isoformat()[:10]
    upcoming_str = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()[:10]
    deadline_filter = {
        "status": {"$nin": ["accepted", "closed", "draft"]},
        "customer_deadline": {"$gte": "0000-01-01", "$lte": upcoming_str, "$ne": ""},
        "deleted_at": {"$exists": False},
    }
    if role == "sales":
        deadline_filter["created_by_id"] = user_id
    elif role == "eng_staff":
        deadline_filter["assigned_to_id"] = user_id
    elif role in ENGINEERING_HEAD_ROLES:
        pass  # sees all engineering inquiries
    elif admin_like:
        pass
    else:
        deadline_filter = None

    if deadline_filter:
        near = await db.inquiries.find(deadline_filter, {"_id": 0}).sort("customer_deadline", 1).limit(20).to_list(length=20)
        if near:
            items = []
            for i in near:
                try:
                    d = i.get("customer_deadline", "")
                    if not d: continue
                    target = datetime.fromisoformat(d).date()
                    today = datetime.now(timezone.utc).date()
                    diff = (target - today).days
                    label = "Hari ini" if diff == 0 else (f"Lewat {-diff} hari" if diff < 0 else f"Sisa {diff} hari")
                except Exception:
                    label = i.get("customer_deadline", "")
                items.append({
                    "id": i.get("id"),
                    "title": f"{i.get('inquiry_no')} — {label}",
                    "detail": f"{i.get('title')} · {i.get('customer_name')}",
                    "sub": f"Deadline: {i.get('customer_deadline')} · Status: {i.get('status')}",
                    "link": "/sales/inquiries" if role == "sales" else "/engineering/inquiries",
                    "kind": "deadline_upcoming",
                    "created_at": i.get("customer_deadline"),
                })
            if items:
                categories.append({
                    "key": "deadline_upcoming",
                    "label": "Deadline Mendekat / Lewat",
                    "count": len(items),
                    "severity": "warn",
                    "items": items,
                })

    # ------------- BOM revisions (admin/eng only info) -------------
    # skip for now to keep payload light

    # ------------- Low Stock Alerts (Store + Admin-like) -------------
    if role == "store" or admin_like or role == "purchasing":
        try:
            rps = await db.store_reorder_points.find(
                {"deleted_at": {"$exists": False}}, {"_id": 0}
            ).to_list(length=1000)
            low_items = []
            for rp in rps:
                agg = await db.store_receipts.aggregate([
                    {"$match": {"item_name": rp["item_name"], "qty_remaining": {"$gt": 0}}},
                    {"$group": {"_id": None, "total": {"$sum": "$qty_remaining"}}},
                ]).to_list(length=1)
                current_qty = float(agg[0]["total"]) if agg else 0.0
                min_qty = float(rp.get("min_qty") or 0)
                if current_qty < min_qty:
                    shortage = min_qty - current_qty
                    low_items.append({
                        "id": rp.get("id"),
                        "title": f"{rp.get('item_name')} — stok rendah",
                        "detail": f"Tersedia {current_qty:g} {rp.get('unit', '')} · Min {min_qty:g} · Kurang {shortage:g}",
                        "sub": rp.get("note") or "Pertimbangkan pembelian ulang",
                        "link": "/store/stock",
                        "kind": "low_stock",
                        "created_at": rp.get("updated_at") or rp.get("created_at"),
                        "shortage": shortage,
                    })
            low_items.sort(key=lambda x: x["shortage"], reverse=True)
            if low_items:
                categories.append({
                    "key": "low_stock",
                    "label": "Stok Rendah di Bawah Minimum",
                    "count": len(low_items),
                    "severity": "critical",
                    "items": low_items[:20],
                })
        except Exception:
            pass

    # ------------- Event: BOM baru diupload (7 hari terakhir, untuk Purchasing/Admin) -------------
    if role == "purchasing" or admin_like:
        try:
            since_iso = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            recent_boms = await db.boms.find(
                {"uploaded_at": {"$gte": since_iso},
                 "deleted_at": {"$exists": False},
                 # skip BOMs already marked as acknowledged
                 "purchase_notif_dismissed": {"$ne": True}},
                {"_id": 0},
            ).sort("uploaded_at", -1).limit(20).to_list(length=20)
            if recent_boms:
                items = []
                for b in recent_boms:
                    so_no = b.get("so_no", "")
                    if not so_no:
                        continue
                    # Cross-reference: how many BOM items have already been purchased?
                    bom_items = b.get("items", [])
                    total_items = len(bom_items)
                    purchased_count = 0
                    if bom_items:
                        item_names = [it.get("item_name", "") or it.get("material", "") for it in bom_items if (it.get("item_name") or it.get("material"))]
                        if item_names:
                            purchased_count = await db.transactions.count_documents({
                                "project_no": so_no,
                                "item_name": {"$in": item_names},
                                "deleted_at": {"$exists": False},
                            })
                    # If ALL items already purchased, auto-skip
                    if total_items > 0 and purchased_count >= total_items:
                        continue
                    items.append({
                        "id": b.get("id"),
                        "title": f"BOM SO {so_no} Rev.{b.get('rev_no', 0)}",
                        "detail": f"{b.get('customer', '-')} · {b.get('project_name', '')}",
                        "sub": f"{purchased_count}/{total_items} item sudah dibeli · Upload {(b.get('uploaded_at') or '')[:10]}",
                        "link": "/bom",
                        "kind": "bom_new",
                        "created_at": b.get("uploaded_at"),
                        "so_no": so_no,
                        "bom_id": b.get("id"),
                        "purchased_count": purchased_count,
                        "total_items": total_items,
                    })
                if items:
                    categories.append({
                        "key": "bom_new_unpurchased",
                        "label": "BOM Baru — Butuh Pembelian",
                        "count": len(items),
                        "severity": "info",
                        "items": items,
                    })
        except Exception:
            pass

    # ------------- Event: Inquiry stagnan (submitted > 5 hari, sales owner + admin) -------------
    if role == "sales" or admin_like:
        try:
            stale_cutoff = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
            stag_filter: dict = {
                "status": "submitted",
                "submitted_at": {"$lt": stale_cutoff},
                "deleted_at": {"$exists": False},
            }
            if role == "sales":
                stag_filter["created_by_id"] = user_id
            stagnant = await db.inquiries.find(stag_filter, {"_id": 0}).sort("submitted_at", 1).limit(20).to_list(length=20)
            if stagnant:
                items = [
                    {
                        "id": i.get("id"),
                        "title": f"{i.get('inquiry_no')} — stagnan > 5 hari",
                        "detail": f"{i.get('title')} · {i.get('customer_name')}",
                        "sub": f"Submit: {(i.get('submitted_at') or '')[:10]} · Assigned: {i.get('assigned_to_name') or 'BELUM di-assign'}",
                        "link": "/sales/inquiries",
                        "kind": "inquiry_stagnant",
                        "created_at": i.get("submitted_at"),
                    } for i in stagnant
                ]
                categories.append({
                    "key": "inquiry_stagnant",
                    "label": "Inquiry Stagnan (> 5 hari)",
                    "count": len(items),
                    "severity": "warn",
                    "items": items,
                })
        except Exception:
            pass

    total_count = sum(c["count"] for c in categories)
    # Iter 18 — Drawing Approval Pending (Eng Head / QC / Sales / DC Salma)
    try:
        drawing_status = None
        drawing_label = None
        if role in ("eng_leader", "eng_head", "engineering"):
            drawing_status = "pending_eng_head"
            drawing_label = "Drawing Menunggu Approval Anda (Engineering Head)"
        elif role == "qc":
            drawing_status = "pending_qc"
            drawing_label = "Drawing Menunggu Approval QC"
        elif role in SALES_ROLES:
            drawing_status = "pending_sales"
            drawing_label = "Drawing Menunggu Approval Sales"
        elif role in DOC_CONTROL_ROLES:
            drawing_status = "approved"
            drawing_label = "Drawing Siap Di-Stamp Document Control"

        if drawing_status:
            pending_dw = await db.drawings.find(
                {"approval_status": drawing_status, "deleted_at": {"$exists": False}},
                {"_id": 0, "id": 1, "drawing_no": 1, "title": 1, "customer_name": 1,
                 "customer_code": 1, "project_name": 1, "so_no": 1, "updated_at": 1,
                 "submitted_at": 1, "approved_at": 1},
            ).sort("updated_at", -1).limit(30).to_list(length=30)
            if pending_dw:
                items = []
                for d in pending_dw:
                    link = "/document-control/distribution" if drawing_status == "approved" else "/engineering/drawings"
                    items.append({
                        "id": d.get("id"),
                        "title": f"{d.get('drawing_no')} — {'siap stamp' if drawing_status == 'approved' else 'menunggu TTD Anda'}",
                        "detail": f"{d.get('title') or d.get('project_name') or ''} · {d.get('customer_name') or d.get('customer_code') or '-'}",
                        "sub": f"SO: {d.get('so_no', '-')} · {(d.get('updated_at') or d.get('submitted_at') or '')[:10]}",
                        "link": link,
                        "kind": "drawing_pending_approval",
                        "created_at": d.get("updated_at"),
                    })
                categories.append({
                    "key": "drawing_pending_approval",
                    "label": drawing_label,
                    "count": len(items),
                    "severity": "critical" if role in DOC_CONTROL_ROLES else "warn",
                    "items": items,
                })

        # ------------- (Sales) Drawing SIAP DILIHAT (preview sebelum tahap TTD Sales) -------------
        if role in SALES_ROLES and not is_super_admin_user(user):
            my_drfs = await db.drawing_requests.find(
                {"$or": [{"requested_by.user_id": user_id}, {"created_by": user_id}],
                 "deleted_at": {"$exists": False}},
                {"_id": 0, "id": 1},
            ).to_list(length=500)
            my_drf_ids = [r["id"] for r in my_drfs]
            if my_drf_ids:
                viewable = await db.drawings.find(
                    {"from_drf_id": {"$in": my_drf_ids},
                     "approval_status": {"$in": ["pending_eng_head", "pending_qc"]},
                     "file_id": {"$nin": [None, ""]},
                     "deleted_at": {"$exists": False}},
                    {"_id": 0, "id": 1, "drawing_no": 1, "title": 1, "project_name": 1,
                     "customer_name": 1, "customer_code": 1, "so_no": 1, "approval_status": 1,
                     "updated_at": 1, "submitted_at": 1},
                ).sort("updated_at", -1).limit(30).to_list(length=30)
                if viewable:
                    _stage_lbl = {"pending_eng_head": "menunggu TTD Engineering", "pending_qc": "menunggu TTD QC"}
                    _items = []
                    for d in viewable:
                        _items.append({
                            "id": d.get("id"),
                            "title": f"{d.get('drawing_no')} — siap dilihat",
                            "detail": f"{d.get('title') or d.get('project_name') or ''} · {d.get('customer_name') or d.get('customer_code') or '-'}",
                            "sub": f"SO: {d.get('so_no', '-')} · {_stage_lbl.get(d.get('approval_status'), '')}",
                            "link": "/sales/drawing-requests",
                            "kind": "drawing_ready_view",
                            "created_at": d.get("updated_at") or d.get("submitted_at"),
                        })
                    categories.append({
                        "key": "drawing_ready_view",
                        "label": "Drawing Siap Dilihat (Preview)",
                        "count": len(_items),
                        "severity": "info",
                        "items": _items,
                    })
    except Exception:
        pass

    # ------------- Nonconformance (CAR) -------------
    try:
        _ROLE_DEPT = {
            "eng_leader": "engineering", "eng_head": "engineering", "engineering": "engineering",
            "eng_staff": "engineering", "qc": "qc", "produksi": "produksi", "production": "produksi",
            "sales": "sales", "purchasing": "purchasing", "staff": "purchasing", "store": "store",
            "doc_control": "document_control", "document_control": "document_control",
            "finance": "finance", "admin": "management", "super_admin": "management", "supervisor": "management",
        }
        my_dept = _ROLE_DEPT.get(role, "other")
        now_dt = datetime.now(timezone.utc)

        # (a) CAR ditujukan ke dept/user ini & masih aktif → perlu ditindaklanjuti
        active = await db.nonconformances.find(
            {"deleted_at": {"$exists": False},
             "status": {"$in": ["open", "assigned", "in_progress"]},
             "$or": [{"issued_to_dept": my_dept}, {"issued_to_user.id": user_id}, {"assigned_to.id": user_id}]},
            {"_id": 0},
        ).sort("created_at", -1).limit(50).to_list(length=50)
        if active:
            items = []
            overdue_any = False
            for nc in active:
                overdue = False
                erd = nc.get("expected_reply_date")
                if erd:
                    try:
                        overdue = datetime.fromisoformat(str(erd)[:10]).replace(tzinfo=timezone.utc) < now_dt
                    except Exception:
                        overdue = False
                if overdue:
                    overdue_any = True
                obj = ", ".join(nc.get("drawing_nos") or []) if nc.get("link_type") == "drawing" else (nc.get("object_ref") or "-")
                items.append({
                    "id": nc.get("id"),
                    "title": ("TERLAMBAT · " if overdue else "") + f"{nc.get('nc_no')} perlu ditindaklanjuti",
                    "detail": f"{(nc.get('title') or nc.get('description') or '')[:60]}",
                    "sub": f"Objek: {obj[:50]} · dari {(nc.get('issued_by') or {}).get('name', '-')}",
                    "link": "/nonconformance",
                    "kind": "car_followup",
                    "overdue": overdue,
                    "created_at": nc.get("issued_at"),
                })
            items.sort(key=lambda x: (not x.get("overdue"), x.get("created_at") or ""))
            categories.append({
                "key": "car_followup",
                "label": "CAR Perlu Ditindaklanjuti" + (" (ada TERLAMBAT)" if overdue_any else ""),
                "count": len(items),
                "severity": "danger" if overdue_any else "warn",
                "items": items,
            })

        # (b) CAR yang ANDA terbitkan sudah Closed (info untuk penerbit)
        closed_mine = await db.nonconformances.find(
            {"deleted_at": {"$exists": False}, "status": "closed", "issued_by.id": user_id},
            {"_id": 0},
        ).sort("closed_at", -1).limit(20).to_list(length=20)
        # hanya yang closed dalam 30 hari terakhir
        recent = []
        for nc in closed_mine:
            ca = nc.get("closed_at")
            try:
                if ca and (now_dt - datetime.fromisoformat(str(ca).replace("Z", "+00:00"))).days <= 30:
                    recent.append(nc)
            except Exception:
                recent.append(nc)
        if recent:
            categories.append({
                "key": "car_closed",
                "label": "CAR Anda Sudah Ditutup (Closed)",
                "count": len(recent),
                "severity": "info",
                "items": [{
                    "id": nc.get("id"),
                    "title": f"{nc.get('nc_no')} telah Closed",
                    "detail": (nc.get("title") or nc.get("description") or "")[:60],
                    "sub": f"Ditutup: {str(nc.get('closed_at') or '')[:10]}",
                    "link": "/nonconformance",
                    "kind": "car_closed",
                    "created_at": nc.get("closed_at"),
                } for nc in recent],
            })
    except Exception:
        pass

    total_count = sum(c["count"] for c in categories)
    return {
        "role": role,
        "user_id": user_id,
        "generated_at": _now_iso(),
        "total_count": total_count,
        "categories": categories,
    }


@router.get("/notifications")
async def list_notifications(current: dict = Depends(get_current_user)):
    """Return categorized notifications for the current user.
    Each category has a count + items (up to 20 latest) + severity."""
    return await _gather_notifications(current)


@router.get("/notifications/count")
async def notifications_count(current: dict = Depends(get_current_user)):
    """Lightweight total count only — for badge polling."""
    payload = await _gather_notifications(current)
    return {"count": payload["total_count"], "by_category": {c["key"]: c["count"] for c in payload["categories"]}}
