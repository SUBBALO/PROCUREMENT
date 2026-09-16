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
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile

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
# Customer name normalization — pindahkan bentuk badan usaha ke belakang
# Contoh: "PT. SPM" -> "SPM, PT" ; "CV Maju Jaya" -> "Maju Jaya, CV"
# ---------------------------------------------------------------------------
_LEGAL_FORM_PATTERNS = [
    (re.compile(r"^(p\.?\s?t\.?)(?=\s|$|[^\w])", re.IGNORECASE), "PT"),
    (re.compile(r"^(c\.?\s?v\.?)(?=\s|$|[^\w])", re.IGNORECASE), "CV"),
    (re.compile(r"^(u\.?\s?d\.?)(?=\s|$|[^\w])", re.IGNORECASE), "UD"),
    (re.compile(r"^(p\.?\s?d\.?)(?=\s|$|[^\w])", re.IGNORECASE), "PD"),
    (re.compile(r"^(perum)(?=\s|$|[^\w])", re.IGNORECASE), "Perum"),
    (re.compile(r"^(persero)(?=\s|$|[^\w])", re.IGNORECASE), "Persero"),
    (re.compile(r"^(koperasi)(?=\s|$|[^\w])", re.IGNORECASE), "Koperasi"),
    (re.compile(r"^(yayasan)(?=\s|$|[^\w])", re.IGNORECASE), "Yayasan"),
    (re.compile(r"^(firma|fa)(?=\s|$|[^\w])", re.IGNORECASE), "Firma"),
]


def normalize_customer_name(name: str) -> str:
    """Pindahkan bentuk badan usaha (PT/CV/UD/PD/Perum/Persero/Firma/Koperasi/Yayasan)
    dari depan ke belakang nama customer. Hanya untuk data baru (saat import).

    Contoh: 'PT. SPM' -> 'SPM, PT' ; 'CV Maju Jaya' -> 'Maju Jaya, CV'.
    Jika tidak ada bentuk badan usaha di depan, nama dikembalikan apa adanya (trim/rapikan spasi).
    """
    s = re.sub(r"\s+", " ", (name or "").strip())
    if not s:
        return ""
    for pat, canon in _LEGAL_FORM_PATTERNS:
        m = pat.match(s)
        if m:
            rest = s[m.end():].strip()
            # buang tanda baca sisa di depan (mis. titik / koma / strip)
            rest = re.sub(r"^[\.\,\-\s]+", "", rest)
            if not rest:
                return canon
            # cegah duplikasi suffix bila sudah ada di belakang
            if re.search(r",\s*" + re.escape(canon) + r"\.?$", rest, re.IGNORECASE):
                return rest
            return f"{rest}, {canon}"
    return s


def _rev_to_int(revision) -> int:
    """Ubah 'Rev-0' / 'Rev.1' / 'Rev 2' / '3' -> int. Default 0."""
    m = re.search(r"(\d+)", str(revision or ""))
    return int(m.group(1)) if m else 0


async def _find_existing(so_no: str, bom_no: str, revision: str, drawing_no: str):
    """Cari data lama yang sudah ada berdasarkan SO + BOM + Revisi (dan/atau No. DWG).

    Returns dict {exists, bom, drawing, reason} — bom/drawing = dokumen mongo bila ada.
    """
    rev_int = _rev_to_int(revision)
    drawing = None
    if drawing_no:
        drawing = await db.drawings.find_one({
            "drawing_no": drawing_no, "revision": (revision or "Rev-0"),
            "deleted_at": {"$exists": False},
        })
    bom = None
    if so_no and bom_no:
        bom = await db.boms.find_one({
            "so_no": so_no, "bom_no": bom_no, "rev_no": rev_int,
            "deleted_at": {"$exists": False},
        })
    # fallback: kalau ada drawing existing, ambil BOM tertautnya
    if bom is None and drawing is not None and drawing.get("bom_id"):
        bom = await db.boms.find_one({"id": drawing["bom_id"], "deleted_at": {"$exists": False}})

    reasons = []
    if bom:
        reasons.append(f"BOM {bom.get('bom_no') or '-'} (SO {so_no}, {revision})")
    if drawing:
        reasons.append(f"Drawing {drawing_no} ({revision})")
    return {
        "exists": bool(bom or drawing),
        "bom": bom,
        "drawing": drawing,
        "reason": " & ".join(reasons),
    }


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
        "customer": normalize_customer_name(header.get("customer") or ""),
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
# STEP 1b — CHECK DUPLIKAT (SO + BOM + Revisi) → frontend tampilkan Update / Skip
# ---------------------------------------------------------------------------
@router.post("/legacy-import/check")
async def check_duplicate(payload: dict = Body(...), current: dict = Depends(get_current_user)):
    """Cek apakah SO + BOM + Revisi (atau No. DWG + Revisi) sudah ada di sistem.

    Return {exists, reason, bom_id, bom_no, drawing_id, drawing_no, drawing_count}.
    Frontend memakai ini untuk menampilkan pilihan Update / Skip sebelum commit.
    """
    _require_access(current)
    from routers.bom import normalize_so_no

    so_no = normalize_so_no(payload.get("so_no") or "")
    bom_no = (payload.get("bom_no") or "").strip()
    revision = (payload.get("revision") or "Rev-0").strip()
    drawing_no = (payload.get("drawing_no") or "").strip()

    res = await _find_existing(so_no, bom_no, revision, drawing_no)
    bom = res["bom"]
    drawing = res["drawing"]
    drawing_count = 0
    if bom:
        drawing_count = await db.drawings.count_documents({"bom_id": bom["id"], "deleted_at": {"$exists": False}})
    return {
        "exists": res["exists"],
        "reason": res["reason"],
        "bom_id": (bom or {}).get("id"),
        "bom_no": (bom or {}).get("bom_no"),
        "drawing_id": (drawing or {}).get("id"),
        "drawing_no": (drawing or {}).get("drawing_no"),
        "drawing_count": drawing_count,
    }


# ---------------------------------------------------------------------------
# STEP 2 — COMMIT (buat / update Drawing final + BOM + attachments)
# ---------------------------------------------------------------------------
@router.post("/legacy-import/commit")
async def commit_entry(
    meta: str = Form(...),                              # JSON string: field terverifikasi + items[] + mode
    eng_dwg: UploadFile = File(...),                    # Eng DWG (MKS) — PDF/Word (wajib)
    customer_dwg: Optional[UploadFile] = File(None),    # DWG Customer — PDF/Word (opsional)
    nesting: Optional[UploadFile] = File(None),         # Nesting — PDF/Word (opsional)
    nesting_price: Optional[UploadFile] = File(None),   # Nesting Price — PDF/Excel/Word (opsional)
    bom_files: List[UploadFile] = File(None),           # BOM — Excel (boleh lebih dari 1 sebagai lampiran)
    current: dict = Depends(get_current_user),
):
    """Commit satu box entri → buat/update Drawing (Controlled/final) + BOM + attachments.

    mode (dari meta): 'create' (default) | 'update' | 'skip'.
    - create: buat BOM + Drawing baru (tolak bila SO+BOM+Rev / No.DWG+Rev sudah ada → 409 terstruktur).
    - update: pakai BOM/Drawing lama yang cocok, perbarui item+metadata, ganti file DWG, tambah lampiran.
    - skip: tidak melakukan apa-apa.
    """
    _require_access(current)
    from routers.bom import normalize_so_no, _next_bom_no, _read_workbook, _parse_bom_workbook
    from routers.drawing_register import _fs as drawings_fs
    from routers.bom_attachments import _fs as bom_fs

    try:
        m = json.loads(meta or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Metadata tidak valid (bukan JSON)")

    mode = (m.get("mode") or "create").strip().lower()

    drawing_no = (m.get("drawing_no") or "").strip()
    if not drawing_no:
        raise HTTPException(status_code=400, detail="Nomor Eng DWG wajib diisi")
    if _ext(eng_dwg.filename) not in ("pdf", "doc", "docx"):
        raise HTTPException(status_code=400, detail="File Eng DWG harus PDF atau Word")

    revision = (m.get("revision") or "Rev-0").strip()
    so_no = normalize_so_no(m.get("so_no") or "")
    bom_no = (m.get("bom_no") or "").strip()

    if mode == "skip":
        return {"success": True, "skipped": True, "so_no": so_no, "drawing_no": drawing_no,
                "message": f"Dilewati (skip) — {drawing_no} (SO {so_no}) sudah ada"}

    existing = await _find_existing(so_no, bom_no, revision, drawing_no)
    if mode != "update" and existing["exists"]:
        # create tapi ternyata sudah ada → 409 terstruktur (frontend tawarkan Update/Skip)
        raise HTTPException(status_code=409, detail={
            "code": "DUPLICATE",
            "message": f"{existing['reason']} sudah ada di sistem",
            "bom_id": (existing["bom"] or {}).get("id"),
            "drawing_id": (existing["drawing"] or {}).get("id"),
        })

    customer_raw = (m.get("customer") or m.get("customer_code") or "MKS").strip()
    customer_display = normalize_customer_name(customer_raw) or "MKS"   # 'PT. SPM' -> 'SPM, PT'
    customer_code = customer_display.upper()
    project_name = (m.get("project_name") or "").strip()
    class_material = (m.get("class_material") or "").strip()
    customer_drawing_no = (m.get("customer_drawing_no") or "").strip()
    items = m.get("items") or []
    user_name = current.get("username") or current.get("name")

    # normalisasi daftar file BOM (boleh >1) → simpan semua sebagai lampiran costing
    bom_uploads = [f for f in (bom_files or []) if f is not None and f.filename]

    # Jika items kosong tapi ada BOM excel → parse ulang file BOM pertama di server.
    bom_bytes_map = {}
    if bom_uploads and not items:
        first = bom_uploads[0]
        try:
            raw = await first.read()
            bom_bytes_map[id(first)] = raw
            parsed = _parse_bom_workbook(_read_workbook(raw, first.filename))
            items = parsed.get("items") or []
        except Exception:
            items = []

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
    rev_int = _rev_to_int(revision)
    dfs = drawings_fs()
    bfs = bom_fs()
    legacy_note = "Data Lama (scan TTD manual)"

    # ================= BOM record (create atau update) =================
    existing_bom = existing["bom"] if mode == "update" else None
    if existing_bom:
        bom_id = existing_bom["id"]
        bom_no = existing_bom.get("bom_no") or bom_no
        up = {
            "project_name": project_name or existing_bom.get("project_name"),
            "project_dwg": drawing_no,
            "customer": customer_code,
            "class_material": class_material or existing_bom.get("class_material"),
            "delivery_date": (m.get("delivery_date") or existing_bom.get("delivery_date") or ""),
            "updated_at": now,
            "updated_by": user_name,
        }
        if norm_items:
            up["items"] = norm_items
        await db.boms.update_one({"id": bom_id}, {"$set": up})
    else:
        if not bom_no:
            try:
                bom_no = (await _next_bom_no())["bom_no"]
            except Exception:
                bom_no = f"BOM-LEGACY-{uuid.uuid4().hex[:6].upper()}"
        bom_doc = {
            "id": str(uuid.uuid4()),
            "so_no": so_no,
            "rev_no": rev_int,
            "bom_no": bom_no,
            "project_name": project_name,
            "project_dwg": drawing_no,
            "customer": customer_code,
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

    # ================= Upload Eng DWG =================
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

    # ================= Drawing doc (create atau update) =================
    existing_drawing = existing["drawing"] if mode == "update" else None
    dwg_set = {
        "drawing_no": drawing_no,
        "customer_code": customer_code,
        "customer_name": normalize_customer_name((m.get("customer_name") or customer_raw or "").strip()),
        "title": (m.get("title") or project_name),
        "revision": revision,
        "customer_drawing_no": customer_drawing_no,
        "so_no": so_no,
        "project_name": project_name,
        "class_material": class_material,
        "drawing_date": (m.get("drawing_date") or (existing_drawing or {}).get("drawing_date") or ""),
        "status": "Issued",
        "bom_link_mode": "existing",
        "bom_no": bom_no,
        "bom_id": bom_id,
        "updated_at": now,
        "updated_by": user_name,
        "file_id": str(mks_file_id),
        "filename": eng_dwg.filename,
        "file_uploaded_at": now,
        "file_uploaded_by": user_name,
        "pdf_match_status": "legacy",
        "pdf_match_note": legacy_note,
        "approval_status": "controlled",
        "legacy_import": True,
        "legacy_note": legacy_note,
    }
    if customer_ref_file_id:
        dwg_set["customer_ref_file_id"] = customer_ref_file_id
        dwg_set["customer_ref_filename"] = customer_ref_filename

    if existing_drawing:
        drawing_id = existing_drawing["id"]
        await db.drawings.update_one({"id": drawing_id}, {
            "$set": dwg_set,
            "$push": {"approvals": {
                "stage": "legacy_import_update", "name": user_name, "role": current.get("role"),
                "user_id": current.get("id"), "username": current.get("username"),
                "at": now, "notes": f"{legacy_note} — data diperbarui (update)",
            }},
        })
    else:
        drawing_doc = {
            "id": str(uuid.uuid4()),
            "project_initial": "",
            "drawing_type": (m.get("drawing_type") or "Assembly"),
            "discipline": (m.get("discipline") or "Mechanical"),
            "prepared_by": user_name,
            "request_by_sales": "",
            "checked_by": "",
            "remark": (m.get("remark") or ""),
            "auto_generated": False,
            "id_year_month": None,
            "created_at": now,
            "created_by": user_name,
            "customer_ref_file_id": customer_ref_file_id,
            "customer_ref_filename": customer_ref_filename,
            "approvals": [{
                "stage": "legacy_import", "name": user_name, "role": current.get("role"),
                "user_id": current.get("id"), "username": current.get("username"),
                "at": now, "notes": legacy_note,
            }],
            **dwg_set,
            "created_by_id": current.get("id"),
        }
        await db.drawings.insert_one(drawing_doc.copy())
        drawing_id = drawing_doc["id"]

    # ================= BOM attachments (multi BOM + Nesting + Nesting Price) =================
    attached = []

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

    for bf in bom_uploads:
        await _save_att(bf, "costing", raw_override=bom_bytes_map.get(id(bf)))
    await _save_att(nesting, "nesting")
    await _save_att(nesting_price, "nesting_price")

    action = "legacy_import_update" if existing_drawing or existing_bom else "legacy_import_commit"
    await log_action(current, action, "drawings", drawing_id, {
        "drawing_no": drawing_no, "so_no": so_no, "bom_no": bom_no, "mode": mode,
        "customer_ref": bool(customer_ref_file_id), "attachments": len(attached),
    })

    was_updated = bool(existing_drawing or existing_bom)
    verb = "diperbarui (update)" if was_updated else "masuk Master List (Controlled)"
    return {
        "success": True,
        "updated": was_updated,
        "drawing_id": drawing_id,
        "drawing_no": drawing_no,
        "bom_id": bom_id,
        "bom_no": bom_no,
        "so_no": so_no,
        "customer": customer_display,
        "attachments": attached,
        "message": f"Drawing {drawing_no} (SO {so_no}) {verb} — {legacy_note}",
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
