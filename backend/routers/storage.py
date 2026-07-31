"""Storage management — track temporary import files (BOM Excel, PDF PO auto-read,
Master List XLSX imports) and let super admin review + delete them.

Files uploaded for ATTACHMENTS (inquiry/engineer response) are NOT tracked here —
those are permanent business documents managed via the sales module.
"""
import io
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel

from db import db
from deps import get_current_user, is_admin_like, log_action, require_super_admin

router = APIRouter(prefix="/storage", tags=["storage"])

_bucket: Optional[AsyncIOMotorGridFSBucket] = None


def _fs() -> AsyncIOMotorGridFSBucket:
    global _bucket
    if _bucket is None:
        _bucket = AsyncIOMotorGridFSBucket(db, bucket_name="temp_uploads")
    return _bucket


async def record_temp_upload(current: dict, module: str, filename: str,
                              content: bytes, mime: str = "",
                              related_entity: str = "", note: str = "") -> str:
    """Save the raw imported file to GridFS `temp_uploads` and log its metadata.
    Returns the temp_upload id. Fire-and-forget on failure (never blocks main flow).
    """
    try:
        fs = _fs()
        gid = await fs.upload_from_stream(
            filename,
            io.BytesIO(content),
            metadata={
                "module": module,
                "uploaded_by_id": current.get("id"),
                "uploaded_by_name": current.get("name") or current.get("username"),
                "uploaded_at": datetime.utcnow().isoformat(),
                "mime": mime,
                "related_entity": related_entity,
                "note": note,
                "size": len(content),
            },
        )
        return str(gid)
    except Exception as e:  # noqa: BLE001
        # Log to server, but never fail the main import
        import logging
        logging.getLogger(__name__).warning(f"Failed to record temp upload: {e}")
        return ""


async def _require_admin_like(current: dict = Depends(get_current_user)):
    if not is_admin_like(current):
        raise HTTPException(status_code=403, detail="Hanya Admin yang bisa lihat Storage")
    return current


@router.get("/temp-files")
async def list_temp_files(
    module: Optional[str] = None,
    limit: int = 200,
    current: dict = Depends(_require_admin_like),
):
    """List temp import files (BOM/PDF/XLSX). Filter by module."""
    filt: dict = {}
    if module:
        filt["metadata.module"] = module
    cur = db.fs_files_temp_uploads.find(
        filt if False else filt,  # placeholder — will use GridFS files collection below
    )

    # GridFS files collection is bucket_name + '.files' → 'temp_uploads.files'
    cursor = db["temp_uploads.files"].find(filt, {"_id": 1, "filename": 1, "length": 1, "uploadDate": 1, "metadata": 1}).sort("uploadDate", -1).limit(limit)
    items = []
    async for f in cursor:
        items.append({
            "id": str(f["_id"]),
            "filename": f.get("filename", ""),
            "size": f.get("length", 0),
            "uploaded_at": (f.get("uploadDate") or datetime.utcnow()).isoformat(),
            "module": (f.get("metadata") or {}).get("module", ""),
            "uploaded_by_name": (f.get("metadata") or {}).get("uploaded_by_name", ""),
            "mime": (f.get("metadata") or {}).get("mime", ""),
            "related_entity": (f.get("metadata") or {}).get("related_entity", ""),
            "note": (f.get("metadata") or {}).get("note", ""),
        })

    # Aggregate module counts + total size
    pipeline = [
        {"$group": {"_id": "$metadata.module", "count": {"$sum": 1}, "total_size": {"$sum": "$length"}}},
    ]
    module_stats = []
    async for s in db["temp_uploads.files"].aggregate(pipeline):
        module_stats.append({"module": s.get("_id") or "unknown", "count": s["count"], "total_size": s["total_size"]})

    grand_total = sum(m["total_size"] for m in module_stats)
    return {
        "items": items,
        "total": len(items),
        "stats_by_module": module_stats,
        "grand_total_size": grand_total,
    }


@router.get("/temp-files/{file_id}/download")
async def download_temp_file(file_id: str, current: dict = Depends(_require_admin_like)):
    fs = _fs()
    try:
        stream = await fs.open_download_stream(ObjectId(file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    buf = io.BytesIO()
    async for chunk in stream:
        buf.write(chunk)
    buf.seek(0)
    filename = stream.filename or "download"
    return StreamingResponse(
        buf,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class BulkDeleteRequest(BaseModel):
    ids: List[str]


@router.delete("/temp-files/{file_id}")
async def delete_temp_file(file_id: str, current: dict = Depends(require_super_admin)):
    fs = _fs()
    try:
        await fs.delete(ObjectId(file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    await log_action(current, "delete_temp_file", "storage", file_id, {})
    return {"ok": True}


@router.post("/temp-files/bulk-delete")
async def bulk_delete_temp_files(payload: BulkDeleteRequest, current: dict = Depends(require_super_admin)):
    fs = _fs()
    deleted = 0
    for fid in payload.ids:
        try:
            await fs.delete(ObjectId(fid))
            deleted += 1
        except Exception:
            pass
    await log_action(current, "bulk_delete_temp_files", "storage", "-", {"count": deleted, "requested": len(payload.ids)})
    return {"ok": True, "deleted": deleted, "requested": len(payload.ids)}


@router.post("/temp-files/purge-older-than")
async def purge_older_than(days: int = 30, current: dict = Depends(require_super_admin)):
    """Purge all temp files older than N days."""
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=days)
    cursor = db["temp_uploads.files"].find({"uploadDate": {"$lt": cutoff}}, {"_id": 1})
    fs = _fs()
    deleted = 0
    async for f in cursor:
        try:
            await fs.delete(f["_id"])
            deleted += 1
        except Exception:
            pass
    await log_action(current, "purge_old_temp_files", "storage", "-", {"days": days, "deleted": deleted})
    return {"ok": True, "deleted": deleted, "days": days}
