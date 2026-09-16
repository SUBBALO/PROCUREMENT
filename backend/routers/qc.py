"""Quality Control — Material Incoming Inspection (MII, MKS-F-QAD-002).

Auto-generated whenever Store creates an incoming receipt (manual or PO-based)
where any item has add_to_stock=False. QC users fill IQC data per item and
generate the MII PDF (ISO-registered form, fixed layout).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from db import db
from deps import (
    _now_iso,
    get_current_user,
    is_admin_like,
    is_qc,
    log_action,
)
from services.soft_delete import NOT_DELETED_FILTER, merged

router = APIRouter(tags=["qc"])


# ---------------- Access control ----------------
QC_ACCESS_ROLES = ("qc", "admin", "supervisor", "super_admin", "finance")


def require_qc_access(current: dict = Depends(get_current_user)) -> dict:
    if is_admin_like(current) or is_qc(current) or current.get("role") == "finance":
        return current
    raise HTTPException(status_code=403, detail="Hanya QC & Admin yang punya akses")


def require_qc_write(current: dict = Depends(get_current_user)) -> dict:
    if is_admin_like(current) or is_qc(current):
        return current
    raise HTTPException(status_code=403, detail="Hanya QC & Admin yang bisa input MII")


# ---------------- Models ----------------
class QCItemUpdate(BaseModel):
    receipt_item_id: str
    description: Optional[str] = None  # editable by QC (was auto-copied from Store)
    batch_grade_heat: Optional[str] = ""
    mill_cert_no: Optional[str] = ""
    dimension_spec: Optional[str] = ""
    dimension_actual: Optional[str] = ""
    visual: Optional[str] = ""
    result: Optional[str] = ""  # "" | "ok" | "ng"
    remark: Optional[str] = ""


class QCSavePayload(BaseModel):
    items: List[QCItemUpdate] = Field(default_factory=list)
    inspection_date: Optional[str] = None  # YYYY-MM-DD


# ---------------- Helpers ----------------
def _clean(d: dict) -> dict:
    if not d:
        return d
    d.pop("_id", None)
    return d


async def create_inspection_from_receipts(
    receipt_docs: List[dict],
    source_type: str,
    source_name: str,
    do_no: str,
    po_no: str,
    receive_date: str,
    current: dict,
) -> Optional[dict]:
    """Auto-create a pending QC MII inspection from a batch of receipt docs.
    Only items with add_to_stock=False are inspected. Returns the created doc or None.
    """
    inspect_items = [r for r in receipt_docs if not bool(r.get("add_to_stock", True))]
    if not inspect_items:
        return None

    items_payload = []
    for idx, r in enumerate(inspect_items, 1):
        items_payload.append({
            "receipt_item_id": r.get("id"),
            "no": idx,
            "so_no": r.get("so_no", ""),
            "description": r.get("item_name", ""),
            "qty": float(r.get("qty_received", 0)),
            "unit": r.get("unit", ""),
            # Manual QC fields — filled later
            "batch_grade_heat": "",
            "mill_cert_no": "",
            "dimension_spec": "",
            "dimension_actual": "",
            "visual": "",
            "result": "",
            "remark": "",
        })
    doc = {
        "id": str(uuid.uuid4()),
        "source_type": source_type,   # "supplier" | "customer"
        "source_name": source_name,
        "do_no": do_no or "",
        "po_no": po_no or "",
        "receive_date": receive_date,
        "inspection_date": receive_date,  # default; QC can override on save
        "status": "pending",              # "pending" | "inspected"
        "items": items_payload,
        "inspector_id": None,
        "inspector_name": "",
        "inspected_at": None,
        "leader_id": None,
        "leader_name": "",
        "verified_at": None,
        "created_by": current.get("id"),
        "created_by_name": current.get("name") or current.get("username", ""),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.qc_inspections.insert_one(doc.copy())
    return doc


# ---------------- Endpoints ----------------
@router.get("/qc/stats")
async def qc_stats(current: dict = Depends(require_qc_access)):
    """Dashboard counts: pending / inspected / verified."""
    pending = await db.qc_inspections.count_documents(
        merged({"status": "pending"}, NOT_DELETED_FILTER)
    )
    inspected = await db.qc_inspections.count_documents(
        merged({"status": "inspected"}, NOT_DELETED_FILTER)
    )
    verified = await db.qc_inspections.count_documents(
        merged({"status": "verified"}, NOT_DELETED_FILTER)
    )
    # Count NG items across all inspections
    ng_pipeline = [
        {"$match": merged({}, NOT_DELETED_FILTER)},
        {"$unwind": "$items"},
        {"$match": {"items.result": "ng"}},
        {"$count": "total"},
    ]
    ng_res = await db.qc_inspections.aggregate(ng_pipeline).to_list(length=1)
    ng_total = ng_res[0]["total"] if ng_res else 0
    return {
        "pending": pending,
        "inspected": inspected,
        "verified": verified,
        "ng_items": ng_total,
    }


@router.get("/qc/inspections")
async def list_inspections(
    status: Optional[str] = None,
    q: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 200,
    current: dict = Depends(require_qc_access),
):
    filt: dict = {}
    if status and status in ("pending", "inspected", "verified"):
        filt["status"] = status
    if q and q.strip():
        import re
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [
            {"source_name": rx},
            {"do_no": rx},
            {"po_no": rx},
        ]
    if start_date or end_date:
        rng: dict = {}
        if start_date:
            rng["$gte"] = start_date
        if end_date:
            rng["$lte"] = end_date
        filt["receive_date"] = rng
    docs = await db.qc_inspections.find(merged(filt, NOT_DELETED_FILTER)).sort(
        "created_at", -1
    ).limit(limit).to_list(length=limit)
    for d in docs:
        _clean(d)
    return {"items": docs, "total": len(docs)}


@router.get("/qc/inspections/{inspection_id}")
async def get_inspection(inspection_id: str, current: dict = Depends(require_qc_access)):
    doc = await db.qc_inspections.find_one({"id": inspection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection tidak ditemukan")
    return _clean(doc)


@router.post("/qc/inspections/{inspection_id}/save")
async def save_inspection(
    inspection_id: str,
    payload: QCSavePayload,
    current: dict = Depends(require_qc_write),
):
    """QC inspector saves inspection data.
    Sets status = 'inspected' if all items have a result (ok/ng), else keeps 'pending'.
    """
    doc = await db.qc_inspections.find_one({"id": inspection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection tidak ditemukan")

    # Apply updates by receipt_item_id
    updates = {u.receipt_item_id: u for u in payload.items}
    new_items = []
    all_have_result = True
    for it in doc.get("items", []):
        up = updates.get(it.get("receipt_item_id"))
        if up:
            it = {
                **it,
                "description": (up.description if up.description is not None else it.get("description", "")).strip() if isinstance(up.description, str) else it.get("description", ""),
                "batch_grade_heat": (up.batch_grade_heat or "").strip(),
                "mill_cert_no": (up.mill_cert_no or "").strip(),
                "dimension_spec": (up.dimension_spec or "").strip(),
                "dimension_actual": (up.dimension_actual or "").strip(),
                "visual": (up.visual or "").strip(),
                "result": (up.result or "").strip().lower() if up.result in ("ok", "ng", "", None) else it.get("result", ""),
                "remark": (up.remark or "").strip(),
            }
        if it.get("result") not in ("ok", "ng"):
            all_have_result = False
        new_items.append(it)

    updates_doc = {
        "items": new_items,
        "updated_at": _now_iso(),
    }
    if payload.inspection_date:
        updates_doc["inspection_date"] = payload.inspection_date

    if all_have_result and new_items:
        updates_doc["status"] = "inspected"
        updates_doc["inspector_id"] = current["id"]
        updates_doc["inspector_name"] = current.get("name") or current.get("username", "")
        updates_doc["inspected_at"] = _now_iso()
    else:
        updates_doc["status"] = "pending"

    await db.qc_inspections.update_one({"id": inspection_id}, {"$set": updates_doc})
    await log_action(current, "qc_save_inspection", "qc_inspection", inspection_id, {
        "status": updates_doc.get("status"),
        "items": len(new_items),
    })
    fresh = await db.qc_inspections.find_one({"id": inspection_id})
    return _clean(fresh)


@router.post("/qc/inspections/{inspection_id}/verify")
async def verify_inspection(inspection_id: str, current: dict = Depends(require_qc_write)):
    """QC Leader verifies an inspected form."""
    doc = await db.qc_inspections.find_one({"id": inspection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection tidak ditemukan")
    if doc.get("status") != "inspected":
        raise HTTPException(status_code=400, detail="Hanya inspeksi ber-status 'inspected' yang bisa di-verify")
    await db.qc_inspections.update_one({"id": inspection_id}, {"$set": {
        "status": "verified",
        "leader_id": current["id"],
        "leader_name": current.get("name") or current.get("username", ""),
        "verified_at": _now_iso(),
        "updated_at": _now_iso(),
    }})
    await log_action(current, "qc_verify_inspection", "qc_inspection", inspection_id, {})
    fresh = await db.qc_inspections.find_one({"id": inspection_id})
    return _clean(fresh)


@router.post("/qc/inspections/{inspection_id}/reopen")
async def reopen_inspection(inspection_id: str, current: dict = Depends(require_qc_write)):
    """Revert 'inspected' or 'verified' back to 'pending' for edits."""
    doc = await db.qc_inspections.find_one({"id": inspection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection tidak ditemukan")
    await db.qc_inspections.update_one({"id": inspection_id}, {"$set": {
        "status": "pending",
        "leader_id": None,
        "leader_name": "",
        "verified_at": None,
        "updated_at": _now_iso(),
    }})
    await log_action(current, "qc_reopen_inspection", "qc_inspection", inspection_id, {})
    fresh = await db.qc_inspections.find_one({"id": inspection_id})
    return _clean(fresh)


async def _build_inspection_pdf_bytes(inspection_id: str, current: dict):
    """Bangun PDF MII (Excel template → visual template → hardcode fallback). Balikkan (bytes, filename)."""
    doc = await db.qc_inspections.find_one({"id": inspection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection tidak ditemukan")
    doc = _clean(doc)

    data = {
        "company_name": "PT. MITRA KARYA SARANA",
        "source_type": doc.get("source_type", ""),
        "is_supplier": (doc.get("source_type") == "supplier"),
        "is_customer": (doc.get("source_type") == "customer"),
        "source_name": doc.get("source_name", ""),
        "supplier_name": doc.get("source_name", "") if doc.get("source_type") == "supplier" else "",
        "customer_name": doc.get("source_name", "") if doc.get("source_type") == "customer" else "",
        "do_no": doc.get("do_no", ""),
        "po_no": doc.get("po_no", ""),
        "receive_date": doc.get("receive_date", ""),
        "inspection_date": doc.get("inspection_date", ""),
        "inspector_name": doc.get("inspector_name", ""),
        "leader_name": doc.get("leader_name", ""),
        "print_date": _now_iso()[:10],
        "printed_by": current.get("name") or current.get("username", ""),
        "items": [{
            **it,
            "result_ok": "X" if it.get("result") == "ok" else "",
            "result_ng": "X" if it.get("result") == "ng" else "",
        } for it in doc.get("items", [])],
    }

    used_engine = "hardcode"
    pdf_bytes = None
    try:
        from routers.excel_templates import get_active_xlsx_bytes, render_excel_template
        xlsx_bytes = await get_active_xlsx_bytes("MII")
        if xlsx_bytes:
            pdf_bytes = render_excel_template(xlsx_bytes, data, as_pdf=True)
            used_engine = "excel"
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"MII Excel render failed: {e}")

    if not pdf_bytes:
        tpl = await db.form_templates.find_one(
            {"code": "MII", "is_active": True, "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]},
            {"_id": 0}, sort=[("is_default", -1), ("updated_at", -1)],
        )
        if tpl:
            try:
                from routers.form_templates import _render_pdf
                pdf_bytes = _render_pdf(tpl, data)
                used_engine = "visual"
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"MII visual render failed: {e}")

    if not pdf_bytes:
        from services.mii_pdf import build_mii_pdf
        pdf_bytes = build_mii_pdf(doc)
        used_engine = "hardcode"

    fname = f"MII_{(doc.get('do_no') or doc.get('id'))[:20]}.pdf"
    return pdf_bytes, fname, used_engine


@router.get("/qc/inspections/{inspection_id}/pdf")
async def download_inspection_pdf(inspection_id: str, current: dict = Depends(require_qc_access)):
    pdf_bytes, fname, used_engine = await _build_inspection_pdf_bytes(inspection_id, current)
    await log_action(current, "qc_download_mii_pdf", "qc_inspection", inspection_id, {"engine": used_engine})
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/qc/inspections/{inspection_id}/page-meta")
async def inspection_page_meta(inspection_id: str, current: dict = Depends(require_qc_access)):
    """Metadata halaman MII untuk viewer image-based."""
    from utils.pdf_render import pdf_page_meta
    pdf_bytes, _, _ = await _build_inspection_pdf_bytes(inspection_id, current)
    return pdf_page_meta(pdf_bytes)


@router.get("/qc/inspections/{inspection_id}/page-image")
async def inspection_page_image(inspection_id: str, page: int = 0, scale: float = 2.0,
                                current: dict = Depends(require_qc_access)):
    """Render satu halaman MII menjadi PNG untuk viewer image-based."""
    from utils.pdf_render import pdf_page_png
    pdf_bytes, _, _ = await _build_inspection_pdf_bytes(inspection_id, current)
    try:
        png = pdf_page_png(pdf_bytes, page, scale)
    except IndexError:
        raise HTTPException(status_code=404, detail="Halaman tidak ditemukan")
    import io as _io
    return StreamingResponse(_io.BytesIO(png), media_type="image/png",
                             headers={"Cache-Control": "private, max-age=120"})
