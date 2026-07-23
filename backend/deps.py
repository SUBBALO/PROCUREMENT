"""FastAPI dependencies + role guards + audit log helper.

Role matrix:
  admin   — full access (except user-management restricted to super admin)
  staff   — purchasing write (transactions, SO); no admin/store operations
  store   — store operations only; no purchasing/SO writes
  finance — read-only across the board (sees prices)

Super admin: only the username matching env SUPER_ADMIN_USERNAME (default 'susanto')
can manage users (create/edit/delete).
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request

from db import db
from security import decode_token

logger = logging.getLogger(__name__)

SUPER_ADMIN_USERNAME = os.environ.get("SUPER_ADMIN_USERNAME", "susanto").lower().strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user or user.get("deleted_at"):
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("active") is False:
            raise HTTPException(status_code=403, detail="Akun user dinonaktifkan")
        user.pop("password_hash", None)
        user.pop("_id", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(current: dict = Depends(get_current_user)) -> dict:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya admin yang bisa mengakses")
    return current


async def require_super_admin(current: dict = Depends(get_current_user)) -> dict:
    """User-management is restricted to the primary admin only (env SUPER_ADMIN_USERNAME,
    default 'susanto'). Other admins can still perform every other admin action."""
    if (current.get("username") or "").lower().strip() != SUPER_ADMIN_USERNAME:
        raise HTTPException(
            status_code=403,
            detail=f"Hanya {SUPER_ADMIN_USERNAME.upper()} yang bisa mengelola user",
        )
    return current


async def require_approve_perm(current: dict = Depends(get_current_user)) -> dict:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya admin yang bisa approve")
    if "approve_store_requests" not in (current.get("perms") or []):
        raise HTTPException(status_code=403, detail="Anda tidak berwenang menyetujui permohonan Store")
    return current


async def require_write(current: dict = Depends(get_current_user)) -> dict:
    """Guard for purchasing writes (transactions, sales-orders).
    Allowed: admin, staff. Blocked: finance (read-only), store, engineering, sales."""
    role = current.get("role")
    if role == "finance":
        raise HTTPException(status_code=403, detail="Akun Finance hanya untuk view — tidak bisa mengubah data")
    if role == "store":
        raise HTTPException(status_code=403, detail="Akun Store tidak berwenang mengubah data purchasing/SO")
    if role == "engineering":
        raise HTTPException(status_code=403, detail="Akun Engineering hanya berwenang di modul BOM")
    if role == "sales":
        raise HTTPException(status_code=403, detail="Akun Sales tidak berwenang mengubah data purchasing")
    return current


STORE_ACCESS_ROLES = ("admin", "store", "finance")


async def require_store_access(current: dict = Depends(get_current_user)) -> dict:
    if current.get("role") not in STORE_ACCESS_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return current


async def require_store_write(current: dict = Depends(get_current_user)) -> dict:
    if current.get("role") not in ("admin", "store"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return current


async def require_bom_upload(current: dict = Depends(get_current_user)) -> dict:
    """Only Engineering and Admin can upload BOM files."""
    if current.get("role") not in ("engineering", "admin"):
        raise HTTPException(status_code=403, detail="Hanya Engineering & Admin yang bisa upload BOM")
    return current


async def require_bom_admin(current: dict = Depends(get_current_user)) -> dict:
    """Only Admin can annotate BOM (Available Stock, Qty Purchase, Remarks)."""
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya Admin yang bisa mengisi annotasi BOM")
    return current


def can_see_prices(user: dict) -> bool:
    role = user.get("role")
    if role == "store":
        return False
    if role in ("admin", "finance"):
        return True
    return "view_store_report" in (user.get("perms") or [])


async def log_action(actor: dict, action: str, entity: str, entity_id: str,
                     details: Optional[dict] = None) -> None:
    """Fire-and-forget audit log. Errors are swallowed to not disrupt main flow."""
    try:
        await db.activity_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": actor.get("id"),
            "username": actor.get("username", ""),
            "user_name": actor.get("name", ""),
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "details": details or {},
            "timestamp": _now_iso(),
        })
    except Exception as e:
        logger.warning(f"Failed to log action {action}: {e}")
