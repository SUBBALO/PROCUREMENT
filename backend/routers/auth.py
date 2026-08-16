"""Auth, user management, activity log routes."""
import uuid
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

import jwt

from db import db
from deps import _now_iso, get_current_user, log_action, require_admin, require_super_admin, SUPER_ADMIN_USERNAME, is_super_admin_user
from services.soft_delete import NOT_DELETED_FILTER, merged, soft_delete_one
from security import (
    JWT_ALGORITHM,
    JWT_SECRET,
    create_access_token,
    create_refresh_token,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from models import LoginRequest, UserCreate, UserUpdate

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Iter 22 — Security Hardening (Layer 2)
# ═══════════════════════════════════════════════════════════════════════════
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
# Feature toggle — lockout brute-force dimatikan sementara atas permintaan (Feb 2026).
LOGIN_LOCKOUT_ENABLED = False
PASSWORD_MIN_LEN = 10
DEFAULT_PASSWORDS = {"admin123", "riski123", "trisna123", "salma123", "qc12345",
                     "sales12345", "cekcek123", "supervisor123", "test123", "password"}


def _validate_password_strength(password: str) -> None:
    """Enforce policy: min 10 karakter + huruf besar + angka."""
    if not password or len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(status_code=400,
                            detail=f"Password minimal {PASSWORD_MIN_LEN} karakter")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400,
                            detail="Password wajib mengandung minimal 1 huruf BESAR (A-Z)")
    if not re.search(r"[0-9]", password):
        raise HTTPException(status_code=400,
                            detail="Password wajib mengandung minimal 1 angka (0-9)")
    if password.lower() in DEFAULT_PASSWORDS:
        raise HTTPException(status_code=400,
                            detail="Password terlalu umum/lemah, pilih yang unik")


async def _get_lockout_remaining(username: str) -> int:
    """Return remaining seconds sampai lockout expires, atau 0 kalau tidak locked."""
    if not LOGIN_LOCKOUT_ENABLED:
        return 0
    doc = await db.login_attempts.find_one({"username": username})
    if not doc:
        return 0
    locked_until = doc.get("locked_until")
    if not locked_until:
        return 0
    now = datetime.now(timezone.utc)
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    delta = (locked_until - now).total_seconds()
    return int(delta) if delta > 0 else 0


async def _record_failed_login(username: str) -> None:
    if not LOGIN_LOCKOUT_ENABLED:
        return
    doc = await db.login_attempts.find_one({"username": username})
    now = datetime.now(timezone.utc)
    if not doc:
        await db.login_attempts.insert_one({
            "username": username, "count": 1, "last_attempt": now,
        })
        return
    new_count = (doc.get("count") or 0) + 1
    updates = {"count": new_count, "last_attempt": now}
    if new_count >= MAX_FAILED_ATTEMPTS:
        updates["locked_until"] = now + timedelta(minutes=LOCKOUT_MINUTES)
    await db.login_attempts.update_one({"username": username}, {"$set": updates})


async def _clear_failed_login(username: str) -> None:
    await db.login_attempts.delete_one({"username": username})


# ---------------- Auth ----------------
def _client_ip(request: Request) -> str:
    """Ambil IP asli klien (dukung reverse proxy via X-Forwarded-For)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    real = request.headers.get("x-real-ip", "")
    if real:
        return real.strip()
    return request.client.host if request.client else "-"


def _client_ua(request: Request) -> str:
    return (request.headers.get("user-agent") or "-")[:300]


async def _record_login_log(username: str, request: Request, success: bool, user: dict = None) -> None:
    """Append-only login log (sukses & gagal) + IP + perangkat."""
    try:
        await db.login_logs.insert_one({
            "id": str(uuid.uuid4()),
            "ts": _now_iso(),
            "username": username,
            "user_id": (user or {}).get("id"),
            "name": (user or {}).get("name", ""),
            "role": (user or {}).get("role", ""),
            "success": bool(success),
            "ip": _client_ip(request),
            "user_agent": _client_ua(request),
        })
    except Exception as e:
        logger.warning(f"login log failed: {e}")


@router.post("/auth/login")
async def login(payload: LoginRequest, response: Response, request: Request):
    username = payload.username.lower().strip()

    # Iter 22 — Cek lockout brute force dulu
    remaining = await _get_lockout_remaining(username)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Akun terkunci karena terlalu banyak percobaan gagal. Coba lagi dalam {remaining // 60}m {remaining % 60}d",
        )

    user = await db.users.find_one(merged({"username": username}, NOT_DELETED_FILTER))
    if not user or not verify_password(payload.password, user["password_hash"]):
        await _record_failed_login(username)
        await _record_login_log(username, request, success=False, user=user)
        rem = await _get_lockout_remaining(username)
        if rem > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Percobaan terlalu banyak — akun terkunci {LOCKOUT_MINUTES} menit",
            )
        raise HTTPException(status_code=401, detail="Username atau password salah")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Akun user dinonaktifkan")

    # Sukses login — clear failed counter
    await _clear_failed_login(username)

    # Iter 22 — Deteksi kalau user login pakai password default → force change
    must_change = bool(user.get("must_change_password")) or \
                  (payload.password.lower() in DEFAULT_PASSWORDS)

    # Session tracking (Feb 2026) — buat sesi aktif + login log dengan IP/perangkat
    sid = str(uuid.uuid4())
    try:
        await db.active_sessions.insert_one({
            "id": sid,
            "user_id": user["id"],
            "username": username,
            "name": user.get("name", ""),
            "role": user.get("role", ""),
            "login_at": _now_iso(),
            "last_seen": _now_iso(),
            "ip": _client_ip(request),
            "user_agent": _client_ua(request),
            "revoked": False,
        })
    except Exception as e:
        logger.warning(f"active session insert failed: {e}")
    await _record_login_log(username, request, success=True, user=user)

    access = create_access_token(user["id"], username, sid=sid)
    refresh = create_refresh_token(user["id"], sid=sid)
    set_auth_cookies(response, access, refresh)
    await log_action(user, "login", "auth", user["id"], {"username": username, "ip": _client_ip(request)})
    return {
        "id": user["id"],
        "username": user["username"],
        "name": user.get("name", ""),
        "role": user["role"],
        "perms": user.get("perms", []),
        "is_super_admin": is_super_admin_user(user),
        "must_change_password": must_change,
        "ui_prefs": user.get("ui_prefs") or {"reduce_motion": True},
        "access": user.get("access") or {},
    }


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            # Akhiri sesi aktif (kalau token membawa sid)
            sid = payload.get("sid")
            if sid:
                await db.active_sessions.delete_one({"id": sid})
            u = await db.users.find_one({"id": payload.get("sub")})
            if u:
                await log_action(u, "logout", "auth", u["id"], {})
        except Exception:
            pass
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


# Valid roles (v2). Legacy roles kept for backwards compat.
VALID_ROLES = (
    "super_admin", "admin", "supervisor", "finance",
    "eng_leader",                          # NEW canonical (Feb 2026)
    "eng_head", "eng_staff", "engineering",  # eng_head = legacy alias for eng_leader; engineering = legacy alias
    "sales", "sales_head", "purchasing", "staff",           # staff = legacy alias for purchasing; sales_head = Kepala Sales (approver costing)
    "store",
    "qc",  # Quality Control — Material Incoming Inspection (MII)
    "doc_control",  # Document Control (Salma) — Digital stamp & controlled document distribution
    "produksi",  # Produksi/Production — lihat BOM & drawing (preview-only, tanpa harga/costing)
)


@router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return {
        "id": current["id"],
        "username": current.get("username", ""),
        "name": current.get("name", ""),
        "role": current["role"],
        "perms": current.get("perms", []),
        "is_super_admin": is_super_admin_user(current),
        "must_change_password": bool(current.get("must_change_password")),
        "ui_prefs": current.get("ui_prefs") or {"reduce_motion": True},
        "access": current.get("access") or {},
    }


class UiPrefsIn(BaseModel):
    reduce_motion: bool


@router.put("/auth/ui-preferences")
async def update_ui_preferences(payload: UiPrefsIn, current: dict = Depends(get_current_user)):
    """Simpan preferensi UI per-user di server (ikut lintas perangkat/browser).
    Saat ini: reduce_motion (Mode Cepat — matikan animasi)."""
    prefs = dict(current.get("ui_prefs") or {})
    prefs["reduce_motion"] = bool(payload.reduce_motion)
    await db.users.update_one({"id": current["id"]}, {"$set": {"ui_prefs": prefs}})
    return {"ok": True, "ui_prefs": prefs}


# Iter 22 — Endpoint ganti password sendiri (untuk force change flow)
class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, current: dict = Depends(get_current_user)):
    """User ganti password sendiri. Wajib memasukkan password lama untuk verifikasi.
    Password baru harus memenuhi policy (min 10 char + uppercase + digit)."""
    user = await db.users.find_one({"id": current["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Password lama salah")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="Password baru tidak boleh sama dengan lama")
    _validate_password_strength(payload.new_password)
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "must_change_password": False,
            "password_changed_at": _now_iso(),
        }},
    )
    await log_action(current, "change_password", "auth", current["id"], {"username": current.get("username")})
    return {"ok": True, "message": "Password berhasil diganti"}


@router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Bawa sid dari refresh token supaya sesi tetap terlacak setelah refresh
        sid = payload.get("sid")
        if sid:
            sess = await db.active_sessions.find_one({"id": sid})
            if sess and sess.get("revoked"):
                raise HTTPException(status_code=401, detail="Sesi Anda telah diakhiri oleh admin. Silakan login ulang.")
        access = create_access_token(user["id"], user.get("username", ""), sid=sid)
        response.set_cookie("access_token", access, httponly=True, secure=False,
                            samesite="lax", max_age=8 * 3600, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ---------------- Users (admin) ----------------
def _sanitize_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "username": u.get("username", ""),
        "name": u.get("name", ""),
        "role": u.get("role", "staff"),
        "active": u.get("active", True),
        "perms": u.get("perms", []),
        "access": u.get("access") or {},
        "must_change_password": bool(u.get("must_change_password")),
        "created_at": u.get("created_at", ""),
    }


@router.get("/users")
async def list_users(current: dict = Depends(require_super_admin)):
    users = await db.users.find(NOT_DELETED_FILTER, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(length=500)
    return [_sanitize_user(u) for u in users]


@router.post("/users")
async def create_user(payload: UserCreate, current: dict = Depends(require_super_admin)):
    username = payload.username.lower().strip()
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username minimal 3 karakter")
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
    role = payload.role if payload.role in VALID_ROLES else "purchasing"
    existing = await db.users.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=400, detail="Username sudah dipakai")
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": hash_password(payload.password),
        "name": (payload.name or username).strip(),
        "role": role,
        "active": True,
        "perms": payload.perms or [],
        "access": payload.access or {},
        "created_at": _now_iso(),
    }
    await db.users.insert_one(user_doc.copy())
    await log_action(current, "create_user", "user", user_doc["id"], {"username": username, "role": role})
    return _sanitize_user(user_doc)


@router.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, current: dict = Depends(require_super_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    updates: dict = {}
    changed: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
        changed["name"] = payload.name.strip()
    if payload.role is not None and payload.role in VALID_ROLES:
        if user_id == current["id"] and payload.role not in ("admin", "super_admin", "supervisor"):
            raise HTTPException(status_code=400, detail="Tidak bisa demote akun sendiri")
        updates["role"] = payload.role
        changed["role"] = payload.role
    if payload.active is not None:
        if user_id == current["id"] and payload.active is False:
            raise HTTPException(status_code=400, detail="Tidak bisa menonaktifkan akun sendiri")
        updates["active"] = bool(payload.active)
        changed["active"] = bool(payload.active)
    if payload.perms is not None:
        updates["perms"] = list(payload.perms)
        changed["perms"] = list(payload.perms)
    if payload.access is not None:
        # {} = clear matrix (kembali ke perilaku role lama). Simpan hanya node yang punya minimal 1 true.
        clean = {}
        for mk, node in (payload.access or {}).items():
            if isinstance(node, dict) and any(bool(node.get(a)) for a in ("create", "edit", "delete", "report", "view", "list")):
                clean[mk] = {a: bool(node.get(a)) for a in ("create", "edit", "delete", "report", "view", "list")}
        updates["access"] = clean
        changed["access"] = f"{len(clean)} modul diatur" if clean else "dikosongkan (role default)"
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
        updates["password_hash"] = hash_password(payload.password)
        changed["password"] = "***"
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        await log_action(current, "update_user", "user", user_id, {"target": user.get("username"), "changes": changed})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return _sanitize_user(updated)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_super_admin)):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa hapus akun sendiri")
    user = await db.users.find_one(merged({"id": user_id}, NOT_DELETED_FILTER))
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    await soft_delete_one("users", {"id": user_id}, current)
    await log_action(current, "delete_user", "user", user_id, {"username": user.get("username")})
    return {"ok": True}


# ---------------- Activity Log ----------------
@router.get("/logs")
async def list_logs(
    current: dict = Depends(require_admin),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    filt: dict = {}
    if user_id:
        filt["user_id"] = user_id
    if action:
        filt["action"] = action
    if entity:
        filt["entity"] = entity
    if start_date or end_date:
        ts: dict = {}
        if start_date:
            ts["$gte"] = start_date
        if end_date:
            ts["$lte"] = end_date + "T23:59:59"
        filt["timestamp"] = ts
    total = await db.activity_logs.count_documents(filt)
    cursor = db.activity_logs.find(filt, {"_id": 0}).sort("timestamp", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ---------------- Login Log & Sesi Aktif (Feb 2026) ----------------
@router.get("/admin/login-logs")
async def list_login_logs(
    current: dict = Depends(require_admin),
    username: Optional[str] = None,
    success: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    """Riwayat login (sukses & gagal) lengkap dengan IP + perangkat."""
    filt: dict = {}
    if username:
        filt["username"] = {"$regex": re.escape(username.strip()), "$options": "i"}
    if success is not None:
        filt["success"] = success
    if start_date or end_date:
        ts: dict = {}
        if start_date:
            ts["$gte"] = start_date
        if end_date:
            ts["$lte"] = end_date + "T23:59:59"
        filt["ts"] = ts
    total = await db.login_logs.count_documents(filt)
    page_size = min(max(page_size, 1), 200)
    cursor = db.login_logs.find(filt, {"_id": 0}).sort("ts", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/admin/active-sessions")
async def list_active_sessions(current: dict = Depends(require_admin)):
    """Sesi aktif (login ≤ 8 jam terakhir, belum logout/revoke). Online = last_seen ≤ 5 menit."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=8)).isoformat()
    online_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    sessions = await db.active_sessions.find(
        {"revoked": {"$ne": True}, "last_seen": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("last_seen", -1).to_list(length=300)
    for s in sessions:
        s["online"] = (s.get("last_seen") or "") >= online_cutoff
    # Bersihkan sesi basi (>8 jam) agar koleksi tetap ringan
    try:
        await db.active_sessions.delete_many({"last_seen": {"$lt": cutoff}})
    except Exception:
        pass
    return {"items": sessions, "total": len(sessions)}


@router.post("/admin/sessions/{sid}/revoke")
async def revoke_session(sid: str, request: Request, current: dict = Depends(require_super_admin)):
    """Akhiri paksa sesi user (super admin). User akan diminta login ulang."""
    # Cegah revoke sesi sendiri yang sedang dipakai
    token = request.cookies.get("access_token")
    if not token:
        auth_hdr = request.headers.get("Authorization", "")
        if auth_hdr.startswith("Bearer "):
            token = auth_hdr[7:]
    if token:
        try:
            my_sid = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM]).get("sid")
            if my_sid == sid:
                raise HTTPException(status_code=400, detail="Tidak bisa mengakhiri sesi Anda sendiri — gunakan Logout")
        except HTTPException:
            raise
        except Exception:
            pass
    sess = await db.active_sessions.find_one({"id": sid})
    if not sess:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan (mungkin sudah berakhir)")
    await db.active_sessions.update_one(
        {"id": sid},
        {"$set": {"revoked": True, "revoked_at": _now_iso(), "revoked_by": current.get("username")}},
    )
    await log_action(current, "revoke_session", "session", sid, {"target": sess.get("username")})
    return {"ok": True, "message": f"Sesi {sess.get('username')} diakhiri"}


# ---------------- Permission Registry (Accurate-style granular access) ----------------
@router.get("/permissions/registry")
async def permissions_registry(current: dict = Depends(require_super_admin)):
    """Registry modul/aktivitas + daftar aksi untuk membangun matrix hak akses di Admin Panel.
    Hanya Super Admin. Frontend memakai ini agar selalu sinkron dengan backend."""
    from permissions import REGISTRY, ACTIONS, ACTION_LABELS
    return {"registry": REGISTRY, "actions": ACTIONS, "action_labels": ACTION_LABELS}



# ---------------- Signature Upload (per user) ----------------
import io
from bson import ObjectId
from fastapi import File, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

_sig_bucket = None


def _sig_fs() -> AsyncIOMotorGridFSBucket:
    global _sig_bucket
    if _sig_bucket is None:
        _sig_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="signatures")
    return _sig_bucket


@router.post("/users/{user_id}/signature")
async def upload_signature(
    user_id: str,
    file: UploadFile = File(...),
    current: dict = Depends(get_current_user),
):
    """Upload signature image (PNG/JPG). Users can upload their own; admin/super_admin can upload for anyone."""
    if user_id != current.get("id") and (current.get("username") or "").lower().strip() != SUPER_ADMIN_USERNAME:
        # allow admin-like
        from deps import is_admin_like
        if not is_admin_like(current):
            raise HTTPException(status_code=403, detail="Hanya diri sendiri atau admin yang bisa upload TTD")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File terlalu besar (max 2MB)")
    mime = (file.content_type or "").lower()
    ext = (file.filename or "").lower().split(".")[-1]
    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/webp") and ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Hanya PNG/JPG/WebP yang diterima (disarankan PNG background transparan)")

    fs = _sig_fs()
    # Delete previous signature if any
    if target.get("signature_gridfs_id"):
        try:
            await fs.delete(ObjectId(target["signature_gridfs_id"]))
        except Exception:
            pass

    gid = await fs.upload_from_stream(
        file.filename or f"signature_{user_id}.png",
        io.BytesIO(content),
        metadata={"user_id": user_id, "mime": mime, "size": len(content), "uploaded_at": _now_iso()},
    )
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"signature_gridfs_id": str(gid), "signature_mime": mime, "signature_uploaded_at": _now_iso()}},
    )
    await log_action(current, "upload_signature", "user", user_id, {"mime": mime, "size": len(content)})
    return {"ok": True, "signature_gridfs_id": str(gid)}


@router.get("/users/me/signature-meta")
async def my_signature_meta(current: dict = Depends(get_current_user)):
    """Return metadata TTD user saat ini (has_signature bool + tanggal upload).
    Frontend memakai ini untuk cek apakah user sudah upload TTD."""
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return {
        "has_signature": bool(user.get("signature_gridfs_id")),
        "signature_uploaded_at": user.get("signature_uploaded_at"),
        "signature_mime": user.get("signature_mime"),
    }


@router.get("/users/{user_id}/signature")
async def get_signature(user_id: str, current: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id})
    if not user or not user.get("signature_gridfs_id"):
        raise HTTPException(status_code=404, detail="User belum upload TTD")
    fs = _sig_fs()
    try:
        stream = await fs.open_download_stream(ObjectId(user["signature_gridfs_id"]))
    except Exception:
        raise HTTPException(status_code=404, detail="TTD tidak ditemukan di storage")
    buf = io.BytesIO()
    async for chunk in stream:
        buf.write(chunk)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type=user.get("signature_mime") or "image/png",
        headers={"Content-Disposition": f'inline; filename="signature_{user_id}.png"',
                 "Cache-Control": "private, max-age=300"},
    )


@router.delete("/users/{user_id}/signature")
async def delete_signature(user_id: str, current: dict = Depends(get_current_user)):
    if user_id != current.get("id"):
        from deps import is_admin_like
        if not is_admin_like(current):
            raise HTTPException(status_code=403, detail="Tidak berwenang")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if user.get("signature_gridfs_id"):
        fs = _sig_fs()
        try:
            await fs.delete(ObjectId(user["signature_gridfs_id"]))
        except Exception:
            pass
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"signature_gridfs_id": "", "signature_mime": "", "signature_uploaded_at": ""}},
    )
    await log_action(current, "delete_signature", "user", user_id, {})
    return {"ok": True}
