"""Backup & Restore module — full MongoDB database export/import as JSON.

Only admin (or super admin) can access. Backups include all business collections.
Restore REPLACES existing data — user must confirm with a specific string.
"""
import io
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import db
from deps import get_current_user, log_action, require_admin, require_super_admin


router = APIRouter(prefix="/admin/backup", tags=["backup"])

# Root kode aplikasi + daftar exclude untuk Full Backup (kode + data)
_CODE_ROOT = "/app"
_EXCLUDE_DIRS = {
    "node_modules", ".git", "__pycache__", "build", "dist", ".ruff_cache",
    ".emergent", "venv", ".venv", "env", ".pytest_cache", ".mypy_cache",
    "coverage", "backup", ".cache", ".next",
}
_EXCLUDE_SUFFIX = (".pyc", ".pyo", ".log", ".tar.gz", ".tgz")


def _find_git_root() -> "Path | None":
    root = Path(__file__).resolve().parent
    for _ in range(6):
        if (root / ".git").exists():
            return root
        root = root.parent
    return None


def _git_info() -> dict:
    """Info git ringkas (commit/branch/tanggal/pesan) untuk manifest & panel versi."""
    info = {"commit": "unknown", "branch": "unknown", "date": "unknown", "message": "", "dirty": False}
    root = _find_git_root()
    if not root:
        return info

    def _git(*args):
        try:
            r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=8)
            return r.stdout.strip() if r.returncode == 0 else ""
        except Exception:
            return ""

    info["commit"] = _git("rev-parse", "--short", "HEAD") or "unknown"
    info["branch"] = _git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    info["date"] = _git("log", "-1", "--format=%cI") or "unknown"
    info["message"] = _git("log", "-1", "--format=%s") or ""
    info["dirty"] = bool(_git("status", "--porcelain"))
    return info


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
    "users", "customers", "inquiries", "quotations",
    "sales_orders", "transactions",
    "boms", "bom_reopen_requests",
    "drawings", "drawing_requests", "ecns", "ecn_register",
    "controlled_documents", "form_templates", "excel_form_templates",
    "nonconformances",
    "store_receipts", "store_issuances", "store_requests", "deliveries",
    "transfer_requests", "vendor_banks",
    "counters", "activity_logs",
]

# Koleksi yang TIDAK PERNAH ikut terhapus saat WIPE:
#  - users + signatures (agar admin bisa login & TTD tetap ada)
#  - transfer_requests + vendor_banks (TRF operasional/live)
#  - template konfigurasi form (MII, quotation excel, CAR)
PRESERVE_ON_WIPE = {
    "users",
    "signatures.files", "signatures.chunks",
    "transfer_requests", "vendor_banks",
    "form_templates", "excel_form_templates",
    "car_templates", "car_templates.files", "car_templates.chunks",
}

# Grup modul untuk WIPE TERPILIH. Tiap modul memetakan ke daftar collection
# (termasuk lampiran GridFS .files/.chunks) yang akan dihapus bila modul dipilih.
WIPE_MODULES = {
    "sales": {
        "label": "Sales (SO, Quotation, Inquiry)",
        "collections": ["sales_orders", "quotations", "inquiries", "inquiry_files.files", "inquiry_files.chunks"],
    },
    "engineering": {
        "label": "Engineering (Drawing, DRF, ECN, Controlled Docs)",
        "collections": [
            "drawings", "drawings.files", "drawings.chunks",
            "drawing_requests", "drawing_requests.files", "drawing_requests.chunks",
            "ecns", "ecn_register",
            "controlled_docs.files", "controlled_docs.chunks", "controlled_documents",
            "revision_files.files", "revision_files.chunks",
        ],
    },
    "bom": {
        "label": "BOM",
        "collections": ["boms", "bom_attachments", "bom_attachments.files", "bom_attachments.chunks", "bom_reopen_requests"],
    },
    "purchasing": {
        "label": "Purchasing (Transaksi PO)",
        "collections": ["transactions"],
    },
    "store": {
        "label": "Store & Delivery",
        "collections": ["store_receipts", "store_issuances", "store_requests", "deliveries"],
    },
    "qc": {
        "label": "QC / Nonconformance",
        "collections": ["nonconformances", "nc_attachments", "nc_attachments.files", "nc_attachments.chunks"],
    },
    "customers": {
        "label": "Customers",
        "collections": ["customers"],
    },
    "counters": {
        "label": "Counters (nomor urut dokumen)",
        "collections": ["counters"],
    },
    "logs": {
        "label": "Activity & Login Logs",
        "collections": ["activity_logs", "login_attempts"],
    },
    "misc": {
        "label": "File lain-lain (fs)",
        "collections": ["fs.files", "fs.chunks"],
    },
}


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
    """Full Backup — bikin tar.gz berisi KODE (code/) + DATA database (data/) + manifest.
    Mandiri (tidak butuh script eksternal). Hanya super_admin.
    """
    # 1) Kumpulkan data semua collection (sama seperti export JSON)
    data_payload = {
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
        data_payload["collections"][coll] = cleaned

    manifest = {
        "app": "MKS Management System",
        "type": "FULL",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": current.get("name") or current.get("username"),
        "git": _git_info(),
        "collections": {c: len(v) for c, v in data_payload["collections"].items()},
        "note": "Berisi kode sumber (code/) + data database (data/). "
                "Restore data lewat Admin Panel; kode ada di folder code/.",
    }

    tmpdir = tempfile.mkdtemp(prefix="mksfull_")
    tar_path = os.path.join(tmpdir, "full.tar.gz")
    data_file = os.path.join(tmpdir, "data.json")
    manifest_file = os.path.join(tmpdir, "manifest.json")
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump(data_payload, f, ensure_ascii=False)
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    def _filter(ti: tarfile.TarInfo):
        parts = ti.name.split("/")
        for p in parts:
            if p in _EXCLUDE_DIRS or p.startswith("_full_restore"):
                return None
        if ti.name.endswith(_EXCLUDE_SUFFIX):
            return None
        return ti

    try:
        with tarfile.open(tar_path, "w:gz") as tar:
            tar.add(manifest_file, arcname="manifest.json")
            tar.add(data_file, arcname="data/mks_data_backup.json")
            tar.add(_CODE_ROOT, arcname="code", filter=_filter)
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Gagal membuat Full Backup: {str(e)[:200]}")

    fname = f"mks_FULL_{datetime.now().strftime('%Y%m%d_%H%M%S')}.tar.gz"
    size = os.path.getsize(tar_path)
    await log_action(current, "download_full_backup", "backup", fname, {"size_bytes": size})

    def iter_file():
        try:
            with open(tar_path, "rb") as f:
                while chunk := f.read(64 * 1024):
                    yield chunk
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    return StreamingResponse(
        iter_file(),
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "Content-Length": str(size),
            "Cache-Control": "no-store",
        },
    )


@router.post("/full-restore")
async def full_restore(
    file: UploadFile = File(...),
    confirm_phrase: str = Form(""),
    mode: str = Form("merge"),
    current: dict = Depends(require_super_admin),
):
    """Restore Full Backup (.tar.gz).
    - DATA otomatis di-restore ke database (mode merge/replace).
    - KODE diekstrak ke folder staging /app/_full_restore_<ts>/ (TIDAK menimpa kode berjalan,
      demi keamanan). Salin manual / pakai GitHub untuk menerapkan kode.
    """
    if confirm_phrase != "RESTORE-FULL":
        raise HTTPException(status_code=400, detail="Konfirmasi tidak valid. Ketik 'RESTORE-FULL' untuk melanjutkan.")
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=400, detail="mode harus 'merge' atau 'replace'")

    content = await file.read()
    tmpdir = tempfile.mkdtemp(prefix="mksrestore_")
    tar_path = os.path.join(tmpdir, "in.tar.gz")
    with open(tar_path, "wb") as f:
        f.write(content)

    data_stats: Dict[str, int] = {}
    code_dir = None
    code_files = 0
    try:
        try:
            tar = tarfile.open(tar_path, "r:gz")
        except tarfile.ReadError:
            raise HTTPException(status_code=400, detail="File bukan .tar.gz Full Backup yang valid")
        with tar:
            # 1) Restore DATA
            data_member = next(
                (m for m in tar.getmembers() if m.name.endswith("data/mks_data_backup.json")),
                None,
            )
            if data_member:
                fobj = tar.extractfile(data_member)
                payload = json.loads(fobj.read().decode("utf-8"))
                collections = payload.get("collections") or {}
                for coll_name, docs in collections.items():
                    if coll_name not in BACKUP_COLLECTIONS or not isinstance(docs, list):
                        continue
                    if mode == "replace":
                        await db[coll_name].delete_many({})
                    cnt = 0
                    for d in docs:
                        if not isinstance(d, dict):
                            continue
                        d.pop("_id", None)
                        if mode == "merge" and d.get("id"):
                            await db[coll_name].update_one({"id": d["id"]}, {"$set": d}, upsert=True)
                        else:
                            await db[coll_name].insert_one(d)
                        cnt += 1
                    data_stats[coll_name] = cnt

            # 2) Ekstrak KODE ke staging (aman dari path traversal)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            code_dir = f"/app/_full_restore_{ts}"
            os.makedirs(code_dir, exist_ok=True)
            for m in tar.getmembers():
                if not m.name.startswith("code/"):
                    continue
                if m.issym() or m.islnk():
                    continue
                if ".." in m.name.split("/"):
                    continue
                tar.extract(m, path=code_dir)
                if m.isfile():
                    code_files += 1
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    total = sum(data_stats.values())
    await log_action(current, "full_restore", "backup", "-",
                     {"mode": mode, "data": data_stats, "code_dir": code_dir, "code_files": code_files})
    return {
        "success": True,
        "mode": mode,
        "data_restored": data_stats,
        "data_total": total,
        "code_files": code_files,
        "code_extracted_to": code_dir,
        "message": (
            f"Data ({total} dokumen) berhasil di-restore ke database. "
            f"Kode ({code_files} file) diekstrak ke '{code_dir}' di server "
            f"(TIDAK menimpa kode berjalan demi keamanan). Untuk menerapkan kode: salin folder tsb "
            f"ke aplikasi lalu restart, atau gunakan GitHub."
        ),
    }



@router.get("/summary")
async def backup_summary(current: dict = Depends(require_admin)):
    """Ringkasan — jumlah dokumen per collection (SEMUA collection, dinamis),
    agar tidak ada data yang tersembunyi. Koleksi internal GridFS (.chunks) disembunyikan."""
    counts = {}
    total = 0
    names = await db.list_collection_names()
    for coll in sorted(names):
        if coll.endswith(".chunks"):
            continue  # binary internal GridFS, sembunyikan dari ringkasan
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
    confirm_phrase: str                      # must equal "WIPE-ALL-DATA"
    keep_users: bool = True                  # default: users tetap ada (agar admin bisa login)
    modules: Optional[List[str]] = None      # None/[] = full wipe; else hanya modul terpilih


@router.get("/wipe-preview")
async def wipe_preview(current: dict = Depends(require_super_admin)):
    """Ringkasan jumlah dokumen per MODUL yang akan terhapus (untuk konfirmasi ganda).
    Menghitung dokumen (mengabaikan .chunks GridFS). Hanya Super Admin."""
    modules = []
    grand_total = 0
    for key, mod in WIPE_MODULES.items():
        count = 0
        for coll in mod["collections"]:
            if coll.endswith(".chunks"):
                continue
            try:
                count += await db[coll].count_documents({})
            except Exception:
                pass
        modules.append({"key": key, "label": mod["label"], "count": count})
        grand_total += count
    return {"modules": modules, "grand_total": grand_total}


@router.post("/wipe")
async def wipe_database(payload: WipeRequest, current: dict = Depends(require_super_admin)):
    """DANGER — Hapus data bisnis. Dua mode:
      • FULL (modules kosong): hapus SEMUA collection kecuali yang dipertahankan.
      • TERPILIH (modules diisi): hapus hanya collection dari modul yang dipilih.

    SELALU DIPERTAHANKAN: users + signatures (login & TTD), transfer_requests +
    vendor_banks (TRF live), dan template form (MII/quotation/CAR).

    Hanya Super Admin (susanto). Harus konfirmasi phrase 'WIPE-ALL-DATA'.
    """
    if payload.confirm_phrase != "WIPE-ALL-DATA":
        raise HTTPException(
            status_code=400,
            detail="Konfirmasi tidak valid. Ketik 'WIPE-ALL-DATA' (case-sensitive) untuk melanjutkan.",
        )

    stats: Dict[str, int] = {}
    names = await db.list_collection_names()

    if payload.modules:
        # ---- WIPE TERPILIH ----
        target = set()
        for m in payload.modules:
            mod = WIPE_MODULES.get(m)
            if mod:
                target.update(mod["collections"])
        target -= PRESERVE_ON_WIPE  # jaga-jaga
        for coll in names:
            if coll in target:
                res = await db[coll].delete_many({})
                if res.deleted_count:
                    stats[coll] = res.deleted_count
        await log_action(current, "wipe_database_selective", "backup", "-",
                         {"modules": payload.modules, "stats": stats})
        return {"success": True, "mode": "selective", "modules": payload.modules,
                "total_deleted": sum(stats.values()), "collections": stats}

    # ---- WIPE FULL ----
    for coll in names:
        if coll in PRESERVE_ON_WIPE:
            continue
        res = await db[coll].delete_many({})
        if res.deleted_count:
            stats[coll] = res.deleted_count

    if not payload.keep_users:
        me_username = (current.get("username") or "").lower().strip()
        res = await db.users.delete_many({"username": {"$ne": me_username}})
        if res.deleted_count:
            stats["users"] = res.deleted_count

    await log_action(current, "wipe_database", "backup", "-", {"stats": stats, "keep_users": payload.keep_users})
    return {"success": True, "mode": "full", "total_deleted": sum(stats.values()), "collections": stats}
