"""MKS-F-ENG-001 Drawing Request Form (DRF)

Alur workflow (Iter 19):
  1. SALES buat DRF (New Order atau Repeat Order) di halaman Sales
  2. Sales submit → auto-TTD "Requested By" pakai signature PNG profile
  3. Engineering Leader (Riski) lihat di card "Drawing Request dari Sales" → Accept
  4. Accept → auto-TTD "Received By", navigate ke halaman Register Drawing yg pre-filled
  5. Riski buat drawing normal → approval workflow standard (Eng Head → QC → Sales → DC)
  6. Setelah drawing selesai (approved), status DRF jadi 'completed' → Sales notified

Model DrawingRequest:
    id, form_no (auto: MKS-F-ENG-001/xxx/YYYY)
    request_type: "new_order" | "repeat_order"
    so_no (pilih dari sales_orders)
    ref_so_no (untuk repeat order — SO referensi lama)
    date (default today)
    project_name, customer_code, customer_name
    qty_order: int, unit: str
    material (default "TBA")
    expected_due_date (ISO string)
    attached_files: list of GridFS ids
    referenced_drawings: list of drawing_ids (untuk repeat order)
    status: "draft" | "submitted" | "accepted" | "completed" | "cancelled"
    requested_by: {user_id, name, at}  ← auto saat submit
    received_by: {user_id, name, at}   ← auto saat Eng Leader accept
    linked_drawing_id: str  ← drawing yg dihasilkan Eng dari DRF ini
    created_at, updated_at
"""
from __future__ import annotations
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field

from db import db
from deps import (
    ENGINEERING_HEAD_ROLES, SALES_ROLES,
    get_current_user, is_admin_like, is_eng_head, is_engineering, log_action,
)

router = APIRouter(tags=["drawing_request"])

_fs: AsyncIOMotorGridFSBucket | None = None


def _bucket() -> AsyncIOMotorGridFSBucket:
    global _fs
    if _fs is None:
        _fs = AsyncIOMotorGridFSBucket(db, bucket_name="drawing_requests")
    return _fs


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


async def _next_form_no() -> str:
    """Generate MKS-F-ENG-001/nnn/ROMAN/YYYY (increment per month)."""
    now = datetime.now(timezone.utc)
    yy = now.year
    mm = now.month
    roman = ROMAN[mm - 1]
    # Cari nomor terakhir di bulan+tahun ini
    prefix = f"MKS-F-ENG-001/"
    suffix = f"/{roman}/{yy}"
    docs = await db.drawing_requests.find(
        {"form_no": {"$regex": f"^MKS-F-ENG-001/\\d+/{roman}/{yy}$"}},
        {"form_no": 1},
    ).to_list(length=2000)
    max_n = 0
    for d in docs:
        m = re.match(r"^MKS-F-ENG-001/(\d+)/", d.get("form_no", ""))
        if m:
            try: max_n = max(max_n, int(m.group(1)))
            except: pass
    return f"{prefix}{max_n + 1:03d}{suffix}"


def _sig(user: dict) -> dict:
    return {
        "user_id": user["id"],
        "username": user.get("username", ""),
        "name": user.get("name") or user.get("username", ""),
        "role": user.get("role", ""),
        "at": _now_iso(),
    }


def _clean(d: Optional[dict]) -> Optional[dict]:
    if not d: return d
    d.pop("_id", None)
    return d


def _is_sales(user: dict) -> bool:
    return user.get("role") in SALES_ROLES or is_admin_like(user)


# =========================================================================
# CRUD
# =========================================================================
class DrawingRequestCreate(BaseModel):
    request_type: str = Field(..., pattern="^(new_order|repeat_order)$")
    so_no: str
    ref_so_no: Optional[str] = ""  # untuk repeat order
    ref_so_manual: Optional[bool] = False  # True bila SO lama diinput manual (tidak ada di master)
    date: Optional[str] = ""  # kosong = today
    project_name: str = ""
    customer_code: str = ""
    customer_name: str = ""
    qty_order: float = 1
    unit: str = "pcs"
    material: str = "TBA"
    expected_due_date: Optional[str] = ""
    notes: str = ""
    referenced_drawings: List[str] = []  # array drawing_ids untuk repeat order


@router.post("/drawing-requests")
async def create_drawing_request(
    payload: DrawingRequestCreate,
    current: dict = Depends(get_current_user),
):
    """Sales membuat DRF baru (status draft)."""
    if not _is_sales(current):
        raise HTTPException(status_code=403, detail="Hanya Sales yang boleh buat Drawing Request")
    if not payload.so_no.strip():
        raise HTTPException(status_code=400, detail="SO wajib dipilih")

    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "form_no": await _next_form_no(),
        "request_type": payload.request_type,
        "so_no": payload.so_no.strip(),
        "ref_so_no": (payload.ref_so_no or "").strip(),
        "ref_so_manual": bool(payload.ref_so_manual),
        "date": payload.date or now[:10],
        "project_name": payload.project_name.strip(),
        "customer_code": payload.customer_code.strip(),
        "customer_name": payload.customer_name.strip(),
        "qty_order": payload.qty_order,
        "unit": payload.unit,
        "material": payload.material or "TBA",
        "expected_due_date": payload.expected_due_date or "",
        "notes": payload.notes,
        "referenced_drawings": payload.referenced_drawings or [],
        "attached_files": [],
        "status": "draft",
        "requested_by": None,
        "received_by": None,
        "linked_drawing_id": None,
        "created_by": current["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.drawing_requests.insert_one(doc.copy())
    await log_action(current, "drf_create", "drawing_requests", doc["id"], {"form_no": doc["form_no"], "so_no": doc["so_no"]})
    return _clean(doc)


@router.get("/drawing-requests")
async def list_drawing_requests(
    status: Optional[str] = None,
    scope: Optional[str] = None,  # "mine" | "for_engineering" | "for_sales_ttd"
    current: dict = Depends(get_current_user),
):
    """List DRF dengan filter."""
    filt: dict = {"deleted_at": {"$exists": False}}
    if status: filt["status"] = status
    if scope == "mine":
        filt["created_by"] = current["id"]
    elif scope == "for_engineering":
        # Engineering Head lihat request yg:
        # - status "submitted" (belum di-accept)
        # - status "accepted" tapi belum ada linked drawing
        # - status "in_progress" (drawing sudah dibuat, masih dikerjakan) — untuk tracking
        filt["$or"] = [
            {"status": "submitted"},
            {"status": "accepted", "linked_drawing_id": {"$in": [None, ""]}},
            {"status": "in_progress"},
        ]
    elif scope == "for_sales_ttd":
        # Sales lihat DRF yg drawing-nya sudah completed (butuh TTD approval Sales)
        filt["status"] = "completed"
        filt["created_by"] = current["id"]
    docs = await db.drawing_requests.find(filt, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return {"items": docs, "total": len(docs)}


@router.get("/drawing-requests/pending-count-for-engineering")
async def pending_count_for_eng(current: dict = Depends(get_current_user)):
    """Untuk badge card di Eng Portal."""
    if not (is_eng_head(current) or is_admin_like(current)):
        return {"count": 0}
    n = await db.drawing_requests.count_documents({
        "$or": [
            {"status": "submitted"},
            {"status": "accepted", "linked_drawing_id": {"$in": [None, ""]}},
        ],
        "deleted_at": {"$exists": False},
    })
    return {"count": n}


@router.get("/drawing-requests/engineering-users")
async def drf_engineering_users(current: dict = Depends(get_current_user)):
    """Daftar user Engineering untuk dropdown assign (dipakai Eng Leader saat accept DRF).
    Didefinisikan SEBELUM route /{drf_id} agar tidak tertangkap sebagai id."""
    if not (is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Eng Leader/Admin")
    from deps import ENGINEERING_ROLES
    users = await db.users.find(
        {"role": {"$in": list(ENGINEERING_ROLES)}, "active": {"$ne": False}},
        {"_id": 0, "id": 1, "username": 1, "name": 1, "role": 1},
    ).sort("name", 1).to_list(length=200)
    return {"items": users}


@router.get("/drawing-requests/my-queue")
async def my_job_queue(current: dict = Depends(get_current_user)):
    """Antrian job untuk eng staff yang login: DRF yang di-assign ke dia.
    - pending (accepted, belum start) → perlu klik TERIMA
    - in_progress → sudah diterima, sedang dikerjakan.
    Didefinisikan SEBELUM route /{drf_id} agar tidak tertangkap sebagai id."""
    uid = current.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    docs = await db.drawing_requests.find(
        {"assigned_engineer_id": uid,
         "status": {"$in": ["accepted", "in_progress"]},
         "deleted_at": {"$exists": False}},
        {"_id": 0},
    ).sort("assigned_at", -1).to_list(length=200)
    pending, working = [], []
    for d in docs:
        d = _clean(d)
        if d.get("work_started_at"):
            working.append(d)
        else:
            pending.append(d)
    return {"pending": pending, "in_progress": working,
            "pending_count": len(pending), "in_progress_count": len(working)}



@router.get("/engineering/workload")
async def engineering_workload(current: dict = Depends(get_current_user)):
    """Monitor beban kerja per engineer (Eng Leader / Admin / Engineering).
    Beban aktif = DRF aktif + Drawing aktif + Inquiry costing aktif + ECN/revisi aktif.
    Level: normal (<=3), busy (4-6), overload (>6). Diurutkan dari paling berat."""
    if not (is_engineering(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering / Admin")
    from deps import ENGINEERING_ROLES
    users = await db.users.find(
        {"role": {"$in": list(ENGINEERING_ROLES)}, "active": {"$ne": False}, "deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "username": 1, "name": 1, "role": 1},
    ).sort("name", 1).to_list(length=200)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _overdue(v):
        return bool(v) and str(v)[:10] < today

    stats = {u["id"]: {
        "user_id": u["id"], "name": u.get("name") or u.get("username"),
        "username": u.get("username"), "role": u.get("role"),
        "drf": 0, "drawing": 0, "inquiry": 0, "ecn": 0, "overdue": 0, "total": 0,
    } for u in users}

    # DRF aktif (accepted + in_progress)
    drfs = await db.drawing_requests.find(
        {"status": {"$in": ["accepted", "in_progress"]}, "deleted_at": {"$exists": False}},
        {"_id": 0, "assigned_engineer_id": 1, "expected_due_date": 1, "due_date": 1},
    ).to_list(length=2000)
    for d in drfs:
        uid = d.get("assigned_engineer_id")
        if uid in stats:
            stats[uid]["drf"] += 1
            if _overdue(d.get("expected_due_date") or d.get("due_date")):
                stats[uid]["overdue"] += 1

    # Drawing aktif (belum controlled/released) + ECN/revisi aktif
    drs = await db.drawings.find(
        {"approval_status": {"$nin": ["controlled", "released"]}, "deleted_at": {"$exists": False}},
        {"_id": 0, "assigned_to_user_id": 1, "revision_request": 1},
    ).to_list(length=8000)
    for d in drs:
        uid = d.get("assigned_to_user_id")
        if uid in stats:
            stats[uid]["drawing"] += 1
        rr = d.get("revision_request") or {}
        if rr.get("status") in ("pending", "in_progress"):
            euid = rr.get("requested_by_id") or d.get("assigned_to_user_id")
            if euid in stats:
                stats[euid]["ecn"] += 1

    # Inquiry costing aktif (di-assign, belum selesai/tolak)
    inqs = await db.inquiries.find(
        {"assigned_to_id": {"$nin": ["", None]},
         "status": {"$nin": ["completed", "rejected", "cancelled", "draft"]},
         "deleted_at": {"$exists": False}},
        {"_id": 0, "assigned_to_id": 1, "due_date": 1, "target_date": 1},
    ).to_list(length=3000)
    for iq in inqs:
        uid = iq.get("assigned_to_id")
        if uid in stats:
            stats[uid]["inquiry"] += 1
            if _overdue(iq.get("due_date") or iq.get("target_date")):
                stats[uid]["overdue"] += 1

    out = []
    for s in stats.values():
        s["total"] = s["drf"] + s["drawing"] + s["inquiry"] + s["ecn"]
        s["level"] = "overload" if s["total"] > 6 else ("busy" if s["total"] >= 4 else "normal")
        out.append(s)
    out.sort(key=lambda x: (x["total"], x["overdue"]), reverse=True)

    summary = {
        "engineers": len(out),
        "total_active": sum(s["total"] for s in out),
        "overload": len([s for s in out if s["level"] == "overload"]),
        "busy": len([s for s in out if s["level"] == "busy"]),
        "normal": len([s for s in out if s["level"] == "normal"]),
        "overdue": sum(s["overdue"] for s in out),
    }
    return {"items": out, "summary": summary, "thresholds": {"busy": 4, "overload": 7}}


@router.get("/drawing-requests/{drf_id}")
async def get_drawing_request(drf_id: str, current: dict = Depends(get_current_user)):
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    return doc


@router.put("/drawing-requests/{drf_id}")
async def update_drawing_request(
    drf_id: str,
    payload: DrawingRequestCreate,
    current: dict = Depends(get_current_user),
):
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["status"] not in ("draft",):
        raise HTTPException(status_code=400, detail="DRF sudah submitted, tidak bisa edit")
    if doc["created_by"] != current["id"] and not is_admin_like(current):
        raise HTTPException(status_code=403, detail="Bukan pemilik DRF")

    upd = payload.model_dump()
    upd["updated_at"] = _now_iso()
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": upd})
    out = await db.drawing_requests.find_one({"id": drf_id}, {"_id": 0})
    return out


# =========================================================================
# Submit & Accept flow
# =========================================================================
@router.post("/drawing-requests/{drf_id}/submit")
async def submit_drawing_request(drf_id: str, current: dict = Depends(get_current_user)):
    """Sales submit DRF → auto-TTD Requested By, status = submitted."""
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["status"] != "draft":
        raise HTTPException(status_code=400, detail=f"DRF sudah {doc['status']}")
    if doc["created_by"] != current["id"] and not is_admin_like(current):
        raise HTTPException(status_code=403, detail="Bukan pemilik DRF")

    upd = {
        "status": "submitted",
        "requested_by": _sig(current),
        "submitted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": upd})
    await log_action(current, "drf_submit", "drawing_requests", drf_id, {"form_no": doc.get("form_no")})
    out = await db.drawing_requests.find_one({"id": drf_id}, {"_id": 0})
    return out


@router.post("/drawing-requests/{drf_id}/accept")
async def accept_drawing_request(drf_id: str, current: dict = Depends(get_current_user)):
    """Eng Leader accept DRF → auto-TTD Received By, status = accepted."""
    if not (is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering Head yang boleh accept")
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["status"] != "submitted":
        raise HTTPException(status_code=400, detail=f"DRF status = {doc['status']}, harus 'submitted' dulu")

    upd = {
        "status": "accepted",
        "received_by": _sig(current),
        "accepted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": upd})
    await log_action(current, "drf_accept", "drawing_requests", drf_id, {"form_no": doc.get("form_no")})
    out = await db.drawing_requests.find_one({"id": drf_id}, {"_id": 0})
    return out


class AcceptAssignIn(BaseModel):
    assigned_engineer_id: str
    assigned_engineer_name: Optional[str] = ""


@router.post("/drawing-requests/{drf_id}/accept-assign")
async def accept_and_assign_drf(
    drf_id: str,
    payload: AcceptAssignIn,
    current: dict = Depends(get_current_user),
):
    """Eng Leader accept DRF + langsung tunjuk 1 engineer yang mengerjakan.
    Eng Leader TIDAK mengisi kolom lain — hanya menugaskan siapa yang kerja."""
    if not (is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya Engineering Leader yang boleh accept & assign")
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["status"] not in ("submitted", "accepted"):
        raise HTTPException(status_code=400, detail=f"DRF status = {doc['status']}, harus 'submitted' dulu")
    eng = await db.users.find_one({"id": payload.assigned_engineer_id})
    if not eng:
        raise HTTPException(status_code=404, detail="Engineer tidak ditemukan")
    if not is_engineering(eng):
        raise HTTPException(status_code=400, detail="User yang dipilih bukan Engineering")

    upd = {
        "status": "accepted",
        "assigned_engineer_id": eng["id"],
        "assigned_engineer_name": payload.assigned_engineer_name or eng.get("name") or eng.get("username"),
        "assigned_by": current.get("name") or current.get("username"),
        "assigned_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if not doc.get("received_by"):
        upd["received_by"] = _sig(current)
        upd["accepted_at"] = _now_iso()
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": upd})
    await log_action(current, "drf_accept_assign", "drawing_requests", drf_id,
                     {"form_no": doc.get("form_no"), "engineer": upd["assigned_engineer_name"]})
    out = await db.drawing_requests.find_one({"id": drf_id}, {"_id": 0})
    return _clean(out)


@router.post("/drawing-requests/{drf_id}/start-work")
async def start_work_drf(drf_id: str, current: dict = Depends(get_current_user)):
    """Eng staff (yang di-assign) KLIK TERIMA → mulai kerja.
    Set work_started_at (Tanggal Start Kerja) + status in_progress.
    Per SO: sekali terima = start kerja untuk semua drawing di SO ini."""
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    assignee = doc.get("assigned_engineer_id")
    is_assignee = assignee and current.get("id") == assignee
    if not (is_assignee or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya engineer yang ditugaskan yang bisa menerima job ini")
    if not assignee:
        raise HTTPException(status_code=400, detail="DRF belum di-assign ke engineer manapun")
    if doc.get("status") not in ("accepted", "in_progress"):
        raise HTTPException(status_code=400, detail=f"DRF harus sudah di-accept & di-assign dulu (status: {doc.get('status')})")
    # Idempotent: kalau sudah pernah start, jangan overwrite tanggalnya.
    if doc.get("work_started_at"):
        return _clean(doc)
    now = _now_iso()
    upd = {
        "status": "in_progress",
        "work_started_at": now,
        "work_started_by": current.get("name") or current.get("username"),
        "updated_at": now,
    }
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": upd})
    # Denormalisasi tanggal ke drawing yang sudah ada (jika sudah di-generate sebelumnya)
    await db.drawings.update_many(
        {"from_drf_id": drf_id, "deleted_at": {"$exists": False}},
        {"$set": {"work_started_at": now,
                  "request_received_at": doc.get("accepted_at"),
                  "updated_at": now}},
    )
    await log_action(current, "drf_start_work", "drawing_requests", drf_id, {"form_no": doc.get("form_no")})
    out = await db.drawing_requests.find_one({"id": drf_id}, {"_id": 0})
    return _clean(out)




class GenerateDrawingIn(BaseModel):
    project_initial: str = ""
    drawing_type: str = "Assembly"   # Assembly | Part
    title: str = ""
    discipline: str = "Mechanical"
    customer_drawing_no: str = ""    # Nomor DWG customer (opsional)


class GenerateDrawingsIn(BaseModel):
    drawings: List[GenerateDrawingIn]
    class_material: str = ""


@router.post("/drawing-requests/{drf_id}/generate-drawings")
async def generate_drawings_for_drf(
    drf_id: str,
    payload: GenerateDrawingsIn,
    current: dict = Depends(get_current_user),
):
    """Engineer yang ditugaskan generate 1+ nomor drawing untuk DRF ini.
    Semua drawing berbagi SATU BOM (1 BOM bisa untuk banyak drawing).
    New Order: user tentukan mau berapa drawing → generate nomor sebanyak itu."""
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    # Hanya engineer yang ditugaskan (atau Eng Leader/Admin) yang boleh
    assignee = doc.get("assigned_engineer_id")
    is_assignee = assignee and current.get("id") == assignee
    if not (is_assignee or is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya engineer yang ditugaskan yang boleh mengerjakan DRF ini")
    if doc["status"] not in ("accepted", "in_progress"):
        raise HTTPException(status_code=400, detail=f"DRF harus di-accept & di-assign dulu (status sekarang: {doc['status']})")
    if not payload.drawings:
        raise HTTPException(status_code=400, detail="Minimal 1 drawing")

    # Lazy import untuk hindari circular import
    from routers.drawing_register import create_drawing, DrawingIn

    assigned_name = doc.get("assigned_engineer_name") or (current.get("name") or current.get("username"))
    customer_code = (doc.get("customer_code") or "MKS").upper().strip() or "MKS"
    created = []
    shared_bom_id = ""
    for idx, d in enumerate(payload.drawings):
        if idx == 0:
            bom_mode, bom_id = "create_new", ""
        else:
            bom_mode, bom_id = ("existing", shared_bom_id) if shared_bom_id else ("none", "")
        din = DrawingIn(
            customer_code=customer_code,
            customer_name=doc.get("customer_name") or "",
            project_initial=(d.project_initial or "").strip(),
            drawing_type=d.drawing_type or "Assembly",
            title=d.title or "",
            discipline=d.discipline or "Mechanical",
            customer_drawing_no=(d.customer_drawing_no or "").strip(),
            so_no=doc.get("so_no") or "",
            project_name=doc.get("project_name") or "",
            class_material=payload.class_material or "",
            prepared_by=assigned_name,
            from_drf_id=drf_id,
            assigned_to_user_id=assignee or current.get("id"),
            assigned_to_name=assigned_name,
            bom_link_mode=bom_mode,
            bom_id=bom_id,
        )
        dr = await create_drawing(din, current)
        if idx == 0:
            shared_bom_id = dr.get("bom_id") or ""
        created.append(dr)

    linked_ids = [d["id"] for d in created]
    await db.drawing_requests.update_one(
        {"id": drf_id},
        {"$set": {
            "status": "in_progress",
            "linked_drawing_id": linked_ids[0] if linked_ids else None,
            "linked_drawing_ids": (doc.get("linked_drawing_ids") or []) + linked_ids,
            "shared_bom_id": shared_bom_id,
            "updated_at": _now_iso(),
        }},
    )
    await log_action(current, "drf_generate_drawings", "drawing_requests", drf_id,
                     {"form_no": doc.get("form_no"), "count": len(created)})
    return {"success": True, "drawings": created, "shared_bom_id": shared_bom_id}


class PullRepeatIn(BaseModel):
    source_drawing_ids: List[str]
    class_material: str = ""


@router.post("/drawing-requests/{drf_id}/pull-repeat")
async def pull_repeat_drawings(
    drf_id: str,
    payload: PullRepeatIn,
    current: dict = Depends(get_current_user),
):
    """Repeat Order — tarik-otomatis data drawing lama menjadi drawing baru di DRF ini.
    Untuk tiap source drawing yang dipilih:
      - Buat drawing baru (nomor DWG baru) yang meng-clone metadata drawing lama.
      - Drawing pertama membuat BOM baru dgn meng-clone item + attachment (nesting/costing→costing_prev)
        dari BOM lama (source_bom_id). Drawing berikutnya berbagi BOM yang sama.
      - File level-drawing (MKS drawing, Customer drawing, additional files/nesting) di-clone
        sebagai reference-copy (share GridFS id) → auto attached, editable/replace via Work Order.
    BOM autofilled & editable bila ada perubahan Qty.
    """
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    assignee = doc.get("assigned_engineer_id")
    is_assignee = assignee and current.get("id") == assignee
    if not (is_assignee or is_eng_head(current) or is_admin_like(current)):
        raise HTTPException(status_code=403, detail="Hanya engineer yang ditugaskan yang boleh mengerjakan DRF ini")
    if doc["status"] not in ("accepted", "in_progress"):
        raise HTTPException(status_code=400, detail=f"DRF harus di-accept & di-assign dulu (status sekarang: {doc['status']})")
    if not payload.source_drawing_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 drawing lama untuk ditarik")

    from routers.drawing_register import create_drawing, DrawingIn

    assigned_name = doc.get("assigned_engineer_name") or (current.get("name") or current.get("username"))
    customer_code = (doc.get("customer_code") or "MKS").upper().strip() or "MKS"
    created = []
    shared_bom_id = doc.get("shared_bom_id") or ""

    for source_id in payload.source_drawing_ids:
        src = await db.drawings.find_one({"id": source_id, "deleted_at": {"$exists": False}})
        if not src:
            raise HTTPException(status_code=404, detail=f"Drawing sumber {source_id} tidak ditemukan")

        if not shared_bom_id:
            bom_mode = "create_new"
            bom_id = ""
            source_bom_id = src.get("bom_id") or ""
        else:
            bom_mode = "existing"
            bom_id = shared_bom_id
            source_bom_id = ""

        din = DrawingIn(
            customer_code=(src.get("customer_code") or customer_code).upper().strip(),
            customer_name=doc.get("customer_name") or src.get("customer_name") or "",
            project_initial=(src.get("project_initial") or "").strip(),
            drawing_type=src.get("drawing_type") or "Assembly",
            title=src.get("title") or "",
            discipline=src.get("discipline") or "Mechanical",
            customer_drawing_no=(src.get("customer_drawing_no") or "").strip(),
            so_no=doc.get("so_no") or "",
            project_name=doc.get("project_name") or src.get("project_name") or "",
            class_material=payload.class_material or src.get("class_material") or "",
            prepared_by=assigned_name,
            from_drf_id=drf_id,
            assigned_to_user_id=assignee or current.get("id"),
            assigned_to_name=assigned_name,
            bom_link_mode=bom_mode,
            bom_id=bom_id,
            source_bom_id=source_bom_id,
        )
        dr = await create_drawing(din, current)
        if not shared_bom_id:
            shared_bom_id = dr.get("bom_id") or ""

        # Clone file level-drawing dari drawing lama (reference-copy, share GridFS id).
        clone_set = {
            "is_repeat_pulled": True,
            "pulled_from_drawing_id": src.get("id"),
            "pulled_from_drawing_no": src.get("drawing_no"),
            "updated_at": _now_iso(),
        }
        if src.get("file_id"):
            clone_set["file_id"] = src.get("file_id")
            clone_set["filename"] = src.get("filename")
            clone_set["file_uploaded_at"] = _now_iso()
        if src.get("customer_ref_file_id"):
            clone_set["customer_ref_file_id"] = src.get("customer_ref_file_id")
            clone_set["customer_ref_filename"] = src.get("customer_ref_filename")
            clone_set["customer_ref_uploaded_at"] = _now_iso()
        src_extras = src.get("additional_files") or []
        if src_extras:
            cloned_extras = []
            for e in src_extras:
                ne = {**e}
                ne["id"] = str(uuid.uuid4())
                ne["copied_from_drawing"] = src.get("id")
                cloned_extras.append(ne)
            clone_set["additional_files"] = cloned_extras
        await db.drawings.update_one({"id": dr["id"]}, {"$set": clone_set})
        dr.update(clone_set)
        created.append(dr)

    linked_ids = [d["id"] for d in created]
    await db.drawing_requests.update_one(
        {"id": drf_id},
        {"$set": {
            "status": "in_progress",
            "linked_drawing_id": (doc.get("linked_drawing_id") or (linked_ids[0] if linked_ids else None)),
            "linked_drawing_ids": (doc.get("linked_drawing_ids") or []) + linked_ids,
            "shared_bom_id": shared_bom_id,
            "updated_at": _now_iso(),
        }},
    )
    await log_action(current, "drf_pull_repeat", "drawing_requests", drf_id,
                     {"form_no": doc.get("form_no"), "count": len(created)})
    return {"success": True, "drawings": created, "shared_bom_id": shared_bom_id}


@router.post("/drawing-requests/{drf_id}/link-drawing")
async def link_drawing_to_drf(
    drf_id: str,
    payload: dict,
    current: dict = Depends(get_current_user),
):
    """Setelah Eng buat drawing, link drawing_id ke DRF ini."""
    drawing_id = payload.get("drawing_id")
    if not drawing_id:
        raise HTTPException(status_code=400, detail="drawing_id wajib")
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    upd = {
        "linked_drawing_id": drawing_id,
        "status": "in_progress",
        "updated_at": _now_iso(),
    }
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": upd})
    return {"success": True}


@router.post("/drawing-requests/{drf_id}/cancel")
async def cancel_drf(drf_id: str, current: dict = Depends(get_current_user)):
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["created_by"] != current["id"] and not is_admin_like(current):
        raise HTTPException(status_code=403, detail="Bukan pemilik")
    if doc["status"] in ("completed",):
        raise HTTPException(status_code=400, detail="DRF sudah selesai, tidak bisa cancel")
    await db.drawing_requests.update_one({"id": drf_id}, {"$set": {"status": "cancelled", "updated_at": _now_iso()}})
    return {"success": True}


# =========================================================================
# Attachments (multi-file upload untuk lampiran DRF)
# =========================================================================
@router.post("/drawing-requests/{drf_id}/attachments")
async def upload_drf_attachment(
    drf_id: str,
    file: UploadFile = File(...),
    current: dict = Depends(get_current_user),
):
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["created_by"] != current["id"] and not is_admin_like(current):
        raise HTTPException(status_code=403, detail="Bukan pemilik")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File > 20 MB")

    fid = await _bucket().upload_from_stream(
        file.filename or "attachment",
        content,
        metadata={"drf_id": drf_id, "content_type": file.content_type, "user_id": current["id"]},
    )
    entry = {
        "file_id": str(fid),
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content),
        "uploaded_at": _now_iso(),
        "uploaded_by": current.get("name") or current.get("username"),
    }
    await db.drawing_requests.update_one(
        {"id": drf_id},
        {"$push": {"attached_files": entry}, "$set": {"updated_at": _now_iso()}},
    )
    return entry


@router.get("/drawing-requests/{drf_id}/attachments/{file_id}/download")
async def download_drf_attachment(drf_id: str, file_id: str, current: dict = Depends(get_current_user)):
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    entry = next((f for f in (doc.get("attached_files") or []) if f["file_id"] == file_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    try:
        stream = await _bucket().open_download_stream(ObjectId(file_id))
        raw = await stream.read()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File tidak bisa dibaca: {e}")
    return StreamingResponse(
        io.BytesIO(raw),
        media_type=entry.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{entry.get("filename")}"'},
    )


@router.delete("/drawing-requests/{drf_id}/attachments/{file_id}")
async def delete_drf_attachment(drf_id: str, file_id: str, current: dict = Depends(get_current_user)):
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    if doc["created_by"] != current["id"] and not is_admin_like(current):
        raise HTTPException(status_code=403, detail="Bukan pemilik")
    if doc.get("status") not in ("draft",):
        raise HTTPException(status_code=400, detail="Sudah submitted, tidak bisa hapus file")
    try:
        await _bucket().delete(ObjectId(file_id))
    except Exception:
        pass
    await db.drawing_requests.update_one(
        {"id": drf_id},
        {"$pull": {"attached_files": {"file_id": file_id}}},
    )
    return {"success": True}


# =========================================================================
# Attachment preview (image-based, view-only) — dipakai popup Antrian DRF
# =========================================================================
def _entry_is_pdf(entry: dict) -> bool:
    ct = (entry.get("content_type") or "").lower()
    fn = (entry.get("filename") or "").lower()
    return "pdf" in ct or fn.endswith(".pdf")


async def _attachment_raw(drf_id: str, file_id: str) -> tuple:
    doc = await db.drawing_requests.find_one({"id": drf_id, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="DRF tidak ditemukan")
    entry = next((f for f in (doc.get("attached_files") or []) if f["file_id"] == file_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    try:
        stream = await _bucket().open_download_stream(ObjectId(file_id))
        raw = await stream.read()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File tidak bisa dibaca: {e}")
    return raw, entry


@router.get("/drawing-requests/{drf_id}/attachments/{file_id}/page-meta")
async def drf_attachment_page_meta(drf_id: str, file_id: str, current: dict = Depends(get_current_user)):
    """Metadata halaman untuk preview image-based lampiran DRF (PDF)."""
    raw, entry = await _attachment_raw(drf_id, file_id)
    if not _entry_is_pdf(entry):
        raise HTTPException(status_code=400, detail="Preview gambar hanya untuk PDF")
    from utils.pdf_render import pdf_page_meta
    return pdf_page_meta(raw)


@router.get("/drawing-requests/{drf_id}/attachments/{file_id}/page-image")
async def drf_attachment_page_image(
    drf_id: str, file_id: str, page: int = 0, scale: float = 2.0,
    current: dict = Depends(get_current_user),
):
    """Render 1 halaman lampiran DRF (PDF) sebagai PNG untuk viewer view-only."""
    raw, entry = await _attachment_raw(drf_id, file_id)
    if not _entry_is_pdf(entry):
        raise HTTPException(status_code=400, detail="Preview gambar hanya untuk PDF")
    from utils.pdf_render import pdf_page_png
    from fastapi.responses import Response
    try:
        png = pdf_page_png(raw, page=page, scale=scale)
    except IndexError:
        raise HTTPException(status_code=404, detail="Halaman tidak ada")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"File bukan PDF valid: {e}")
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})
