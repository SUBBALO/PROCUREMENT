"""Auth, user management, activity log routes."""
import uuid
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response

import jwt

from db import db
from deps import _now_iso, get_current_user, log_action, require_admin, require_super_admin, SUPER_ADMIN_USERNAME
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


# ---------------- Auth ----------------
@router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    username = payload.username.lower().strip()
    user = await db.users.find_one(merged({"username": username}, NOT_DELETED_FILTER))
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Akun user dinonaktifkan")
    access = create_access_token(user["id"], username)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    await log_action(user, "login", "auth", user["id"], {"username": username})
    return {
        "id": user["id"],
        "username": user["username"],
        "name": user.get("name", ""),
        "role": user["role"],
        "perms": user.get("perms", []),
        "is_super_admin": (user.get("username") or "").lower().strip() == SUPER_ADMIN_USERNAME,
    }


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            u = await db.users.find_one({"id": payload.get("sub")})
            if u:
                await log_action(u, "logout", "auth", u["id"], {})
        except Exception:
            pass
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return {
        "id": current["id"],
        "username": current.get("username", ""),
        "name": current.get("name", ""),
        "role": current["role"],
        "perms": current.get("perms", []),
        "is_super_admin": (current.get("username") or "").lower().strip() == SUPER_ADMIN_USERNAME,
    }


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
        access = create_access_token(user["id"], user.get("username", ""))
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
    role = payload.role if payload.role in ("admin", "staff", "store", "finance") else "staff"
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
    if payload.role is not None and payload.role in ("admin", "staff", "store", "finance"):
        if user_id == current["id"] and payload.role != "admin":
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
