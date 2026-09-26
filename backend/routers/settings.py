"""App settings — kelola API key (mis. Gemini) dari dalam aplikasi.

Prioritas sumber key: nilai dari Database (diisi lewat aplikasi) menimpa .env.
Bila DB kosong, fallback ke nilai asli dari backend/.env.
Hanya Super Admin yang boleh melihat/mengubah.
"""
import asyncio
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from deps import get_current_user, is_super_admin_user

router = APIRouter(prefix="/settings", tags=["settings"])

SETTINGS_COLL = "app_settings"
GEMINI_DOC_ID = "gemini_api_key"

# Nilai asli dari .env saat proses start — dipakai sebagai fallback bila key DB dihapus.
_ENV_DEFAULT_GEMINI = os.environ.get("GEMINI_API_KEY", "").strip().strip('"')


async def require_super_admin(current: dict = Depends(get_current_user)) -> dict:
    if not is_super_admin_user(current):
        raise HTTPException(status_code=403, detail="Hanya Super Admin yang boleh mengubah pengaturan ini")
    return current


def _mask(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 10:
        return key[:2] + "…"
    return f"{key[:6]}…{key[-4:]}"


def _apply_gemini_env(key: str):
    """Set/replace GEMINI_API_KEY di proses berjalan & reset cache client (tanpa restart)."""
    os.environ["GEMINI_API_KEY"] = (key or "").strip()
    try:
        from routers.temp_transactions import reset_gemini_client
        reset_gemini_client()
    except Exception:
        pass


async def load_persisted_settings():
    """Dipanggil saat startup: bila DB punya key, timpa os.environ (DB > .env)."""
    doc = await db[SETTINGS_COLL].find_one({"_id": GEMINI_DOC_ID})
    if doc and (doc.get("value") or "").strip():
        _apply_gemini_env(doc["value"].strip())


def _current_status():
    doc_pending = None  # not used; status computed by caller
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    return key


class GeminiKeyIn(BaseModel):
    api_key: str


class GeminiTestIn(BaseModel):
    api_key: str | None = None


async def _gemini_status_payload():
    doc = await db[SETTINGS_COLL].find_one({"_id": GEMINI_DOC_ID})
    db_key = (doc.get("value") if doc else "") or ""
    active = os.environ.get("GEMINI_API_KEY", "").strip()
    if db_key.strip():
        source = "database"
    elif active:
        source = "env"
    else:
        source = "none"
    from routers.temp_transactions import GEMINI_MODEL
    return {
        "configured": bool(active),
        "source": source,
        "masked": _mask(active),
        "model": GEMINI_MODEL,
        "mode": os.environ.get("GEMINI_MODE", "developer"),
        "updated_at": (doc or {}).get("updated_at"),
        "updated_by": (doc or {}).get("updated_by"),
    }


@router.get("/gemini")
async def get_gemini_settings(current: dict = Depends(require_super_admin)):
    return await _gemini_status_payload()


@router.put("/gemini")
async def update_gemini_key(payload: GeminiKeyIn, current: dict = Depends(require_super_admin)):
    key = (payload.api_key or "").strip().strip('"')
    if not key:
        raise HTTPException(status_code=400, detail="API key tidak boleh kosong")
    await db[SETTINGS_COLL].update_one(
        {"_id": GEMINI_DOC_ID},
        {"$set": {
            "value": key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current.get("username"),
        }},
        upsert=True,
    )
    _apply_gemini_env(key)
    return await _gemini_status_payload()


@router.delete("/gemini")
async def delete_gemini_key(current: dict = Depends(require_super_admin)):
    """Hapus key dari DB dan kembalikan ke nilai asli .env (fallback)."""
    await db[SETTINGS_COLL].delete_one({"_id": GEMINI_DOC_ID})
    _apply_gemini_env(_ENV_DEFAULT_GEMINI)
    return await _gemini_status_payload()


def _test_gemini_key_sync(key: str) -> tuple:
    """Validasi key dengan panggilan ringan (list model). Return (ok, message)."""
    try:
        from google import genai
        mode = os.environ.get("GEMINI_MODE", "developer")
        if mode == "vertex":
            client = genai.Client(vertexai=True, api_key=key)
        else:
            client = genai.Client(api_key=key)
        models = list(client.models.list())
        return True, f"Koneksi berhasil. {len(models)} model tersedia."
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        low = msg.lower()
        if "api_key" in low or "api key" in low or "401" in low or "permission" in low or "invalid" in low:
            return False, "API key tidak valid / ditolak Google. Periksa kembali key Anda."
        if "503" in low or "unavailable" in low or "overloaded" in low:
            return False, "Key kemungkinan valid, tapi server Gemini sedang sibuk (503). Coba lagi sebentar."
        return False, f"Gagal koneksi: {msg[:200]}"


@router.post("/gemini/test")
async def test_gemini_key(payload: GeminiTestIn, current: dict = Depends(require_super_admin)):
    key = (payload.api_key or "").strip().strip('"') or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Belum ada API key untuk diuji")
    ok, message = await asyncio.to_thread(_test_gemini_key_sync, key)
    return {"ok": ok, "message": message}
