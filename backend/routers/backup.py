"""Backup & Restore module — full MongoDB database export/import as JSON.

Only admin (or super admin) can access. Backups include all business collections.
Restore REPLACES existing data — user must confirm with a specific string.
"""
import io
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import db
from deps import get_current_user, log_action, require_admin


router = APIRouter(prefix="/admin/backup", tags=["backup"])

# Collections that are safe to snapshot/restore
BACKUP_COLLECTIONS = [
    "users", "transactions", "sales_orders", "store_receipts", "store_issuances",
    "store_requests", "deliveries", "boms", "inquiries", "quotations", "counters",
    "activity_logs",
]


def _serialize(v):
    """Convert Mongo values (ObjectId/datetime) to JSON-safe types."""
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


@router.get("/export")
async def export_backup(current: dict = Depends(require_admin)):
    """Full database backup as a downloadable JSON file."""
    payload = {
        "backup_id": str(uuid.uuid4()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": current.get("name") or current.get("username"),
        "app": "MKS Management System",
        "collections": {},
    }
    for coll in BACKUP_COLLECTIONS:
        docs = await db[coll].find({}).to_list(length=None)
        cleaned = []
        for d in docs:
            d.pop("_id", None)
            cleaned.append(json.loads(json.dumps(d, default=_serialize)))
        payload["collections"][coll] = cleaned

    buf = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    filename = f"mks_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    await log_action(current, "export_backup", "backup", payload["backup_id"], {
        "collections": {c: len(v) for c, v in payload["collections"].items()},
    })

    return StreamingResponse(
        buf,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/summary")
async def backup_summary(current: dict = Depends(require_admin)):
    """Quick summary — doc counts per collection, for the Admin UI."""
    counts = {}
    total = 0
    for coll in BACKUP_COLLECTIONS:
        n = await db[coll].count_documents({})
        counts[coll] = n
        total += n
    return {"collections": counts, "total_documents": total, "generated_at": datetime.now(timezone.utc).isoformat()}


class RestoreRequest(BaseModel):
    confirm_phrase: str  # must equal 'RESTORE-CONFIRM' or similar


@router.post("/import")
async def import_backup(
    file: UploadFile = File(...),
    confirm_phrase: str = Form(""),
    mode: str = Form("merge"),  # 'merge' (upsert by id) or 'replace' (wipe + insert)
    current: dict = Depends(require_admin),
):
    """Restore from a previously-exported backup JSON.

    - `mode=merge`: upsert docs by `id` field per collection (default, safer)
    - `mode=replace`: DELETES ALL docs in each backup collection then inserts (irreversible)
    - `confirm_phrase` must be 'RESTORE-CONFIRM' to authorize (extra safety)
    """
    if confirm_phrase != "RESTORE-CONFIRM":
        raise HTTPException(status_code=400, detail="Konfirmasi tidak valid. Ketik 'RESTORE-CONFIRM' untuk melanjutkan.")
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=400, detail="mode harus 'merge' atau 'replace'")

    try:
        content = await file.read()
        payload = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File JSON tidak valid: {e}")

    collections = payload.get("collections") or {}
    if not isinstance(collections, dict):
        raise HTTPException(status_code=400, detail="Format backup tidak valid (missing 'collections')")

    stats: Dict[str, int] = {}
    for coll_name, docs in collections.items():
        if coll_name not in BACKUP_COLLECTIONS:
            continue
        if not isinstance(docs, list):
            continue
        if mode == "replace":
            await db[coll_name].delete_many({})
        inserted = 0
        upserted = 0
        for d in docs:
            if not isinstance(d, dict):
                continue
            d.pop("_id", None)
            if mode == "merge" and d.get("id"):
                res = await db[coll_name].update_one({"id": d["id"]}, {"$set": d}, upsert=True)
                if res.upserted_id: inserted += 1
                else: upserted += 1
            else:
                await db[coll_name].insert_one(d)
                inserted += 1
        stats[coll_name] = inserted + upserted

    await log_action(current, "import_backup", "backup", "-", {"mode": mode, "stats": stats})
    return {"success": True, "mode": mode, "restored": stats, "backup_source_id": payload.get("backup_id")}
