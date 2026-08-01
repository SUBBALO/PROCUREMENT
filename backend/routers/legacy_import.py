"""Bulk Import Data Lama → Drawing Master List.

Alur:
1. ANALYZE: upload file BOM Excel → sistem auto-detect (extract) header + items → prefill
   tabel verifikasi di frontend (bisa diedit sebelum masuk sistem).
2. COMMIT: kirim metadata final + file (PDF DWG MKS wajib, PDF Customer opsional,
   file BOM/costing boleh lebih dari satu) → sistem membuat:
     - Drawing (approval_status = 'controlled' / status 'Issued') → langsung final di Master List.
       Ditandai legacy_import = True + catatan "Data Lama (scan TTD manual)".
     - BOM record (dari items yang diverifikasi).
     - BOM attachments untuk setiap file BOM/costing (bisa dipreview sebagai gambar).

Akses: super_admin / admin / supervisor / Engineering Leader (eng_head / eng_leader).
"""
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from db import db
from deps import get_current_user, log_action, is_admin_like, is_eng_head

router = APIRouter(tags=["legacy-import"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_access(current: dict):
    if not (is_admin_like(current) or is_eng_head(current)):
        raise HTTPException(
            status_code=403,
            detail="Hanya Admin / Super Admin / Engineering Leader yang boleh Import Data Lama",
        )


def _ext(name: str) -> str:
    name = (name or "").lower()
    return name.rsplit(".", 1)[-1] if "." in name else ""


# ---------------------------------------------------------------------------
# STEP 1 — ANALYZE (auto-detect isi BOM Excel untuk prefill verifikasi)
# ---------------------------------------------------------------------------
@router.post("/legacy-import/analyze")
async def analyze_bom(file: UploadFile = File(...), current: dict = Depends(get_current_user)):
    """Baca file BOM Excel & auto-extract header + items untuk prefill (tidak menyimpan apa pun)."""
    _require_access(current)
    from routers.bom import _read_workbook, _parse_bom_workbook

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    ext = _ext(file.filename)
    if ext not in ("xlsx", "xls", "xlsm"):
        raise HTTPException(status_code=400, detail="File analisa harus Excel (.xlsx/.xls/.xlsm)")
    try:
        rows = _read_workbook(content, file.filename)
        parsed = _parse_bom_workbook(rows)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca BOM: {e}")

    header = parsed.get("header") or {}
    items = parsed.get("items") or []
    suggested = {
        "drawing_no": header.get("project_dwg") or "",
        "customer_drawing_no": "",
        "so_no": header.get("so_no") or "",
        "project_name": header.get("project_name") or "",
        "customer": header.get("customer") or "",
        "class_material": header.get("class_material") or "",
        "bom_no": header.get("bom_no") or "",
        "delivery_date": header.get("delivery_date") or "",
        "drawing_date": header.get("date") or "",
        "revision": "Rev-0",
    }
    return {
        "filename": file.filename,
        "suggested": suggested,
        "items": items,
        "items_count": len(items),
    }


# ---------------------------------------------------------------------------
# STEP 2 — COMMIT (buat drawing final + BOM + attachments)
# ---------------------------------------------------------------------------
@router.post("/legacy-import/commit")
async def commit_entry(
    meta: str = Form(...),                              # JSON string: field terverifikasi + items[]
    eng_dwg: UploadFile = File(...),                    # Eng DWG (MKS) — PDF/Word (wajib)
    customer_dwg: Optional[UploadFile] = File(None),    # DWG Customer — PDF/Word (opsional)
    nesting: Optional[UploadFile] = File(None),         # Nesting — PDF/Word (opsional)
    nesting_price: Optional[UploadFile] = File(None),   # Nesting Price — PDF/Excel/Word (opsional)
    bom_file: Optional[UploadFile] = File(None),        # BOM — Excel (opsional)
    current: dict = Depends(get_current_user),
):
    """Commit satu box entri → buat Drawing (Controlled/final) + BOM + attachments."""
    _require_access(current)
    from routers.bom import normalize_so_no, _next_bom_no, _read_workbook, _parse_bom_workbook
    from routers.drawing_register import _fs as drawings_fs
    from routers.bom_attachments import _fs as bom_fs

    try:
        m = json.loads(meta or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Metadata tidak valid (bukan JSON)")

    drawing_no = (m.get("drawing_no") or "").strip()
    if not drawing_no:
        raise HTTPException(status_code=400, detail="Nomor Eng DWG wajib diisi")
    if _ext(eng_dwg.filename) not in ("pdf", "doc", "docx"):
        raise HTTPException(status_code=400, detail="File Eng DWG harus PDF atau Word")

    revision = (m.get("revision") or "Rev-0").strip()
    dup = await db.drawings.find_one({
        "drawing_no": drawing_no, "revision": revision, "deleted_at": {"$exists": False},
    })
    if dup:
        raise HTTPException(status_code=409, detail=f"Drawing '{drawing_no}' {revision} sudah ada di sistem")

    so_no = normalize_so_no(m.get("so_no") or "")
    customer_code = (m.get("customer") or m.get("customer_code") or "MKS").strip()
    project_name = (m.get("project_name") or "").strip()
    class_material = (m.get("class_material") or "").strip()
    customer_drawing_no = (m.get("customer_drawing_no") or "").strip()
    items = m.get("items") or []
    user_name = current.get("username") or current.get("name")

    # Jika items kosong tapi ada BOM excel → parse ulang di server (aman).
    bom_bytes = None
    if bom_file is not None and bom_file.filename:
        bom_bytes = await bom_file.read()
        if bom_bytes and not items:
            try:
                parsed = _parse_bom_workbook(_read_workbook(bom_bytes, bom_file.filename))
                items = parsed.get("items") or []
            except Exception:
                items = []

    # --- 1) BOM record ---
    bom_no = (m.get("bom_no") or "").strip()
    if not bom_no:
        try:
            bom_no = (await _next_bom_no())["bom_no"]
        except Exception:
            bom_no = f"BOM-LEGACY-{uuid.uuid4().hex[:6].upper()}"
    norm_items = []
    for idx, it in enumerate(items, start=1):
        norm_items.append({
            "item_no": it.get("item_no") or idx,
            "item_name": it.get("item_name") or "",
            "item_specification": it.get("item_specification") or "",
            "qty": float(it.get("qty") or 0),
            "uom": it.get("uom") or "",
            "material": it.get("material") or "",
            "weight_kg": it.get("weight_kg"),
            "remark": it.get("remark") or "",
        })
    now = _now_iso()
    bom_doc = {
        "id": str(uuid.uuid4()),
        "so_no": so_no,
        "rev_no": 0,
        "bom_no": bom_no,
        "project_name": project_name,
        "project_dwg": drawing_no,
        "customer": customer_code.upper(),
        "class_material": class_material,
        "delivery_date": (m.get("delivery_date") or ""),
        "bom_date": (m.get("drawing_date") or datetime.now(timezone.utc).date().isoformat()),
        "prepared_by": user_name,
        "items": norm_items,
        "annotations": {},
        "revision_reason": "",
        "auto_generated": False,
        "source": "legacy_import",
        "is_repeat": False,
        "legacy_import": True,
        "uploaded_by_id": current.get("id"),
        "uploaded_by_name": user_name,
        "uploaded_by_role": current.get("role"),
        "uploaded_at": now,
        "engineering_status": "approved",
        "signatures": {"prepared_by": None, "checked_by": None, "acknowledged_by": None, "approved_by": None},
    }
    await db.boms.insert_one(bom_doc.copy())
    bom_id = bom_doc["id"]

    # --- 2) Upload Eng DWG (bucket 'drawings' → drawing.file_id) ---
    dfs = drawings_fs()
    mks_bytes = await eng_dwg.read()
    if not mks_bytes:
        raise HTTPException(status_code=400, detail="File Eng DWG kosong")
    mks_file_id = await dfs.upload_from_stream(
        eng_dwg.filename, mks_bytes,
        metadata={"content_type": eng_dwg.content_type, "drawing_no": drawing_no, "legacy": True},
    )

    customer_ref_file_id = None
    customer_ref_filename = None
    if customer_dwg is not None and customer_dwg.filename:
        cust_bytes = await customer_dwg.read()
        if cust_bytes:
            if _ext(customer_dwg.filename) not in ("pdf", "doc", "docx", "jpg", "jpeg", "png"):
                raise HTTPException(status_code=400, detail="File DWG Customer harus PDF/Word/gambar")
            cid = await dfs.upload_from_stream(
                customer_dwg.filename, cust_bytes,
                metadata={"content_type": customer_dwg.content_type, "drawing_no": drawing_no, "legacy": True, "kind": "customer_ref"},
            )
            customer_ref_file_id = str(cid)
            customer_ref_filename = customer_dwg.filename

    # --- 3) Drawing doc (langsung controlled/final) ---
    legacy_note = "Data Lama (scan TTD manual)"
    drawing_doc = {
        "id": str(uuid.uuid4()),
        "drawing_no": drawing_no,
        "customer_code": customer_code.upper(),
        "customer_name": (m.get("customer_name") or "").strip(),
        "project_initial": "",
        "drawing_type": (m.get("drawing_type") or "Assembly"),
        "title": (m.get("title") or project_name),
        "revision": revision,
        "discipline": (m.get("discipline") or "Mechanical"),
        "customer_drawing_no": customer_drawing_no,
        "so_no": so_no,
        "project_name": project_name,
        "class_material": class_material,
        "prepared_by": user_name,
        "request_by_sales": "",
        "checked_by": "",
        "drawing_date": (m.get("drawing_date") or ""),
        "status": "Issued",
        "remark": (m.get("remark") or ""),
        "bom_link_mode": "existing",
        "bom_no": bom_no,
        "bom_id": bom_id,
        "auto_generated": False,
        "id_year_month": None,
        "created_at": now,
        "created_by": user_name,
        "updated_at": now,
        "updated_by": user_name,
        "file_id": str(mks_file_id),
        "filename": eng_dwg.filename,
        "file_uploaded_at": now,
        "file_uploaded_by": user_name,
        "customer_ref_file_id": customer_ref_file_id,
        "customer_ref_filename": customer_ref_filename,
        "pdf_match_status": "legacy",
        "pdf_match_note": legacy_note,
        "approval_status": "controlled",
        "approvals": [{
            "stage": "legacy_import", "name": user_name, "role": current.get("role"),
            "user_id": current.get("id"), "username": current.get("username"),
            "at": now, "notes": legacy_note,
        }],
        "legacy_import": True,
        "legacy_note": legacy_note,
    }
    await db.drawings.insert_one(drawing_doc.copy())

    # --- 4) BOM attachments: BOM(costing) + Nesting + Nesting Price ---
    attached = []
    bfs = bom_fs()

    async def _save_att(up: UploadFile, category: str, raw_override=None):
        if up is None or not up.filename:
            return
        raw = raw_override if raw_override is not None else await up.read()
        if not raw:
            return
        fid = await bfs.upload_from_stream(
            up.filename, raw,
            metadata={"content_type": up.content_type, "bom_id": bom_id, "category": category, "legacy": True},
        )
        att = {
            "id": str(uuid.uuid4()), "bom_id": bom_id, "so_no": so_no, "category": category,
            "filename": up.filename, "file_id": str(fid), "content_type": up.content_type,
            "size_bytes": len(raw), "remark": "Legacy import", "uploaded_at": now,
            "uploaded_by": user_name, "legacy_import": True,
        }
        await db.bom_attachments.insert_one(att.copy())
        attached.append({"filename": up.filename, "category": category})

    if bom_file is not None and bom_file.filename:
        await _save_att(bom_file, "costing", raw_override=bom_bytes)
    await _save_att(nesting, "nesting")
    await _save_att(nesting_price, "nesting_price")

    await log_action(current, "legacy_import_commit", "drawings", drawing_doc["id"], {
        "drawing_no": drawing_no, "so_no": so_no, "bom_no": bom_no,
        "customer_ref": bool(customer_ref_file_id), "attachments": len(attached),
    })

    return {
        "success": True,
        "drawing_id": drawing_doc["id"],
        "drawing_no": drawing_no,
        "bom_id": bom_id,
        "bom_no": bom_no,
        "so_no": so_no,
        "attachments": attached,
        "message": f"Drawing {drawing_no} (SO {so_no}) masuk Master List (Controlled) — {legacy_note}",
    }



@router.post("/legacy-import/add-drawing")
async def add_drawing_to_bom(
    meta: str = Form(...),                              # JSON: {bom_id, drawing_no, customer_drawing_no, revision}
    eng_dwg: UploadFile = File(...),                    # Eng DWG (PDF/Word)
    customer_dwg: Optional[UploadFile] = File(None),
    current: dict = Depends(get_current_user),
):
    """Tambah DWG tambahan (drawing terpisah) ke BOM/SO yang sudah dibuat (multiple DWG)."""
    _require_access(current)
    from routers.drawing_register import _fs as drawings_fs

    try:
        m = json.loads(meta or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Metadata tidak valid (bukan JSON)")

    bom_id = (m.get("bom_id") or "").strip()
    drawing_no = (m.get("drawing_no") or "").strip()
    if not bom_id or not drawing_no:
        raise HTTPException(status_code=400, detail="bom_id & drawing_no wajib")
    if _ext(eng_dwg.filename) not in ("pdf", "doc", "docx"):
        raise HTTPException(status_code=400, detail="File Eng DWG harus PDF atau Word")

    bom = await db.boms.find_one({"id": bom_id})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM tidak ditemukan")

    revision = (m.get("revision") or "Rev-0").strip()
    dup = await db.drawings.find_one({"drawing_no": drawing_no, "revision": revision, "deleted_at": {"$exists": False}})
    if dup:
        raise HTTPException(status_code=409, detail=f"Drawing '{drawing_no}' {revision} sudah ada")

    now = _now_iso()
    user_name = current.get("username") or current.get("name")
    so_no = bom.get("so_no") or ""
    legacy_note = "Data Lama (scan TTD manual)"
    dfs = drawings_fs()

    mks_bytes = await eng_dwg.read()
    if not mks_bytes:
        raise HTTPException(status_code=400, detail="File Eng DWG kosong")
    mks_file_id = await dfs.upload_from_stream(
        eng_dwg.filename, mks_bytes,
        metadata={"content_type": eng_dwg.content_type, "drawing_no": drawing_no, "legacy": True},
    )
    customer_ref_file_id = None
    customer_ref_filename = None
    if customer_dwg is not None and customer_dwg.filename:
        cust_bytes = await customer_dwg.read()
        if cust_bytes:
            cid = await dfs.upload_from_stream(
                customer_dwg.filename, cust_bytes,
                metadata={"content_type": customer_dwg.content_type, "drawing_no": drawing_no, "legacy": True, "kind": "customer_ref"},
            )
            customer_ref_file_id = str(cid)
            customer_ref_filename = customer_dwg.filename

    drawing_doc = {
        "id": str(uuid.uuid4()),
        "drawing_no": drawing_no,
        "customer_code": (bom.get("customer") or "MKS"),
        "customer_name": "",
        "project_initial": "",
        "drawing_type": "Assembly",
        "title": bom.get("project_name") or "",
        "revision": revision,
        "discipline": "Mechanical",
        "customer_drawing_no": (m.get("customer_drawing_no") or "").strip(),
        "so_no": so_no,
        "project_name": bom.get("project_name") or "",
        "class_material": bom.get("class_material") or "",
        "prepared_by": user_name,
        "request_by_sales": "",
        "checked_by": "",
        "drawing_date": (m.get("drawing_date") or bom.get("bom_date") or ""),
        "status": "Issued",
        "remark": "",
        "bom_link_mode": "existing",
        "bom_no": bom.get("bom_no") or "",
        "bom_id": bom_id,
        "auto_generated": False,
        "id_year_month": None,
        "created_at": now, "created_by": user_name,
        "updated_at": now, "updated_by": user_name,
        "file_id": str(mks_file_id),
        "filename": eng_dwg.filename,
        "file_uploaded_at": now, "file_uploaded_by": user_name,
        "customer_ref_file_id": customer_ref_file_id,
        "customer_ref_filename": customer_ref_filename,
        "pdf_match_status": "legacy",
        "pdf_match_note": legacy_note,
        "approval_status": "controlled",
        "approvals": [{
            "stage": "legacy_import", "name": user_name, "role": current.get("role"),
            "user_id": current.get("id"), "username": current.get("username"),
            "at": now, "notes": legacy_note,
        }],
        "legacy_import": True,
        "legacy_note": legacy_note,
    }
    await db.drawings.insert_one(drawing_doc.copy())
    await log_action(current, "legacy_import_add_drawing", "drawings", drawing_doc["id"],
                     {"drawing_no": drawing_no, "so_no": so_no, "bom_id": bom_id})
    return {"success": True, "drawing_id": drawing_doc["id"], "drawing_no": drawing_no,
            "bom_id": bom_id, "so_no": so_no,
            "message": f"Drawing tambahan {drawing_no} (SO {so_no}) masuk Master List (Controlled)"}
