"""Backup & Restore module — full MongoDB database export/import as JSON.

Only admin (or super admin) can access. Backups include all business collections.
Restore REPLACES existing data — user must confirm with a specific string.
"""
import io
import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import db
from deps import get_current_user, log_action, require_admin, require_super_admin


router = APIRouter(prefix="/admin/backup", tags=["backup"])


# ---------------- Version / Git Info ----------------
@router.get("/version")
async def get_version(_: dict = Depends(require_admin)):
    """Return current git commit / branch info so Admin can see which build is running.

    Useful for Windows on-prem installs — admin can compare local vs remote (GitHub)
    to know whether an update is available. Returns 'unknown' if not a git repo.
    """
    info = {"commit": "unknown", "branch": "unknown", "date": "unknown", "message": "", "dirty": False}
    # Find the git root by walking upwards from this file
    root = Path(__file__).resolve().parent
    for _ in range(6):
        if (root / ".git").exists():
            break
        root = root.parent
    if not (root / ".git").exists():
        info["error"] = "Not a git repository — install pakai zip? Untuk auto-update pakai git clone."
        return info
    try:
        def _git(*args):
            r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=8)
            return r.stdout.strip() if r.returncode == 0 else ""
        info["commit"] = _git("rev-parse", "--short", "HEAD") or "unknown"
        info["branch"] = _git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
        info["date"] = _git("log", "-1", "--format=%cI") or "unknown"
        info["message"] = _git("log", "-1", "--format=%s") or ""
        status = _git("status", "--porcelain")
        info["dirty"] = bool(status)
        # Also check remote for updates (fetch head — read-only, needs network)
        try:
            subprocess.run(["git", "-C", str(root), "fetch", "--quiet"], capture_output=True, timeout=10)
            local = _git("rev-parse", "HEAD")
            remote = _git("rev-parse", "@{u}")
            if local and remote and local != remote:
                behind = _git("rev-list", "--count", "HEAD..@{u}")
                info["update_available"] = True
                info["commits_behind"] = int(behind) if behind.isdigit() else 0
            else:
                info["update_available"] = False
                info["commits_behind"] = 0
        except Exception:
            info["update_available"] = None  # check failed (offline / no upstream)
    except Exception as e:
        info["error"] = str(e)[:200]
    return info


# Collections that are safe to snapshot/restore
BACKUP_COLLECTIONS = [
    "users", "transactions", "sales_orders", "store_receipts", "store_issuances",
    "store_requests", "deliveries", "boms", "inquiries", "quotations", "counters",
    "activity_logs",
]

# Collections wiped during "reset database" — excludes users (kept so admins can still login)
WIPE_COLLECTIONS = [
    "transactions", "sales_orders", "store_receipts", "store_issuances",
    "store_requests", "deliveries", "boms", "inquiries", "quotations",
    "customers",
    "counters", "activity_logs",
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


@router.get("/full-download")
async def download_full_backup(current: dict = Depends(require_super_admin)):
    """Trigger CLI backup script & stream the resulting tar.gz to admin.
    Only super_admin can trigger this (contains code + env)."""
    import subprocess
    from pathlib import Path

    script = "/app/scripts/backup_full_cli.sh"
    if not Path(script).exists():
        raise HTTPException(status_code=500, detail=f"Backup script tidak ditemukan: {script}")

    # Run script (blocking, up to 5 min)
    try:
        proc = subprocess.run(["bash", script], capture_output=True, timeout=300)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Backup process timeout (>5 min). Cek disk & Mongo.")
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Backup script gagal: {proc.stderr.decode()[:300]}")

    # Find the just-created backup file
    backup_dir = Path("/backup/procurement")
    files = sorted(backup_dir.glob("mks_FULL_*.tar.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise HTTPException(status_code=500, detail="Backup file tidak ditemukan setelah script selesai")
    latest = files[0]

    await log_action(current, "download_full_backup", "backup", latest.name,
                     {"size_bytes": latest.stat().st_size})

    def iter_file():
        with open(latest, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'attachment; filename="{latest.name}"',
            "Content-Length": str(latest.stat().st_size),
            "Cache-Control": "no-store",
        },
    )


@router.get("/full-list")
async def list_full_backups(current: dict = Depends(require_super_admin)):
    """List existing full backup files with size & timestamp."""
    from pathlib import Path
    backup_dir = Path("/backup/procurement")
    if not backup_dir.exists():
        return {"backups": [], "backup_dir": str(backup_dir), "total_size_mb": 0}
    items = []
    total_size = 0
    for p in sorted(backup_dir.glob("*.tar.gz"), key=lambda x: x.stat().st_mtime, reverse=True):
        st = p.stat()
        items.append({
            "filename": p.name,
            "size_mb": round(st.st_size / (1024 * 1024), 2),
            "created_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            "type": "FULL" if "FULL" in p.name else "DATA",
        })
        total_size += st.st_size
    return {
        "backups": items,
        "backup_dir": str(backup_dir),
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "count": len(items),
    }



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



# =============================================================================
# WIPE / RESET
# =============================================================================
class WipeRequest(BaseModel):
    confirm_phrase: str          # must equal "WIPE-ALL-DATA"
    keep_users: bool = True      # default: users tetap ada (agar admin bisa login)


@router.post("/wipe")
async def wipe_database(payload: WipeRequest, current: dict = Depends(require_super_admin)):
    """DANGER — Hapus semua data bisnis (transaksi, SO, Store, BOM, Inquiry, Quotation,
    Customer, counters, activity_logs). User tetap dipertahankan agar login masih bisa.

    Hanya Super Admin (susanto) yang bisa. Harus konfirmasi phrase 'WIPE-ALL-DATA'.
    """
    if payload.confirm_phrase != "WIPE-ALL-DATA":
        raise HTTPException(
            status_code=400,
            detail="Konfirmasi tidak valid. Ketik 'WIPE-ALL-DATA' (case-sensitive) untuk melanjutkan.",
        )

    stats: Dict[str, int] = {}
    for coll in WIPE_COLLECTIONS:
        res = await db[coll].delete_many({})
        stats[coll] = res.deleted_count

    # Optional: bersihkan users selain super admin
    if not payload.keep_users:
        me_username = (current.get("username") or "").lower().strip()
        res = await db.users.delete_many({"username": {"$ne": me_username}})
        stats["users"] = res.deleted_count

    await log_action(current, "wipe_database", "backup", "-", {"stats": stats, "keep_users": payload.keep_users})
    total = sum(stats.values())
    return {"success": True, "total_deleted": total, "collections": stats}
