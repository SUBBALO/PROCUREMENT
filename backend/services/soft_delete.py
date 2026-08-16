"""Soft-delete helpers — Recycle Bin support for MKS ERP.

Any collection that opts in gets a `deleted_at`, `deleted_by`, `deleted_by_name`
field on delete. Reads should include ``NOT_DELETED_FILTER`` so soft-deleted
docs stay hidden.  A background/periodic job purges docs older than
``AUTO_PURGE_DAYS`` (default 30) via ``purge_expired``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from db import db

# Collections that participate in Recycle Bin.
TRASH_COLLECTIONS: List[str] = [
    "transactions", "sales_orders", "store_receipts", "store_issuances",
    "store_requests", "deliveries", "boms", "inquiries", "quotations",
    "customers", "users",
]

# Reads must filter this out.  Older docs (before feature) don't have the
# field — they pass because we use `$exists: False` OR `$eq: null`.
NOT_DELETED_FILTER: dict = {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]}

AUTO_PURGE_DAYS = 30


def merged(*filters: dict) -> dict:
    """Combine multiple $and-style query filters, preserving NOT_DELETED_FILTER."""
    ands: List[dict] = []
    for f in filters:
        if not f:
            continue
        ands.append(f)
    if not ands:
        return {}
    if len(ands) == 1:
        return dict(ands[0])
    return {"$and": ands}


async def soft_delete_one(collection: str, id_filter: dict, current: dict) -> bool:
    """Mark a single document deleted. Returns True if a doc was modified."""
    upd = {
        "$set": {
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": current.get("id"),
            "deleted_by_name": current.get("full_name") or current.get("username"),
        }
    }
    # Ensure we don't re-delete already-deleted docs
    filt = merged(id_filter, NOT_DELETED_FILTER)
    res = await db[collection].update_one(filt, upd)
    return res.modified_count > 0


async def soft_delete_many(collection: str, id_filter: dict, current: dict) -> int:
    upd = {
        "$set": {
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": current.get("id"),
            "deleted_by_name": current.get("full_name") or current.get("username"),
        }
    }
    filt = merged(id_filter, NOT_DELETED_FILTER)
    res = await db[collection].update_many(filt, upd)
    return res.modified_count


async def restore_many(collection: str, id_filter: dict) -> int:
    """Undo soft-delete on the given docs."""
    res = await db[collection].update_many(
        id_filter,
        {"$unset": {"deleted_at": "", "deleted_by": "", "deleted_by_name": ""}},
    )
    return res.modified_count


async def purge_expired(days: int = AUTO_PURGE_DAYS) -> Dict[str, int]:
    """Hard-delete every soft-deleted doc older than ``days`` days.

    Returns a per-collection count so callers can log the report.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    report: Dict[str, int] = {}
    for coll in TRASH_COLLECTIONS:
        res = await db[coll].delete_many({"deleted_at": {"$lte": cutoff}})
        if res.deleted_count:
            report[coll] = res.deleted_count
    return report


async def trash_summary() -> Dict[str, int]:
    out: Dict[str, int] = {}
    for coll in TRASH_COLLECTIONS:
        n = await db[coll].count_documents({"deleted_at": {"$exists": True, "$ne": None}})
        if n:
            out[coll] = n
    return out


# ═══════════════════════════════════════════════════════════════════════════
# Snapshot-based trash (Feb 2026) — untuk koleksi yang query bacanya banyak
# dan belum memakai NOT_DELETED_FILTER (mis. modul Produksi). Saat delete,
# dokumen DIPINDAH ke `trash_snapshots` lalu dihapus dari koleksi sumber,
# sehingga tidak ada risiko dokumen terhapus masih muncul di laporan.
# ═══════════════════════════════════════════════════════════════════════════
SNAPSHOT_COLLECTIONS: List[str] = [
    "production_reports", "fg_release_notes", "production_overtime",
]
TRASH_SNAPSHOT_COLL = "trash_snapshots"


async def snapshot_delete(collection: str, doc: dict, current: dict) -> bool:
    """Move a document into trash_snapshots then hard-delete the original."""
    if not doc or not doc.get("id"):
        return False
    clean = {k: v for k, v in doc.items() if k != "_id"}
    await db[TRASH_SNAPSHOT_COLL].insert_one({
        "id": clean.get("id"),
        "collection": collection,
        "doc": clean,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "deleted_by": current.get("id"),
        "deleted_by_name": current.get("name") or current.get("full_name") or current.get("username"),
    })
    res = await db[collection].delete_one({"id": clean.get("id")})
    return res.deleted_count > 0


async def snapshot_restore(collection: str, ids: List[str]) -> int:
    """Re-insert snapshotted docs back into their source collection."""
    restored = 0
    snaps = await db[TRASH_SNAPSHOT_COLL].find(
        {"collection": collection, "id": {"$in": ids}}
    ).to_list(length=len(ids))
    for s in snaps:
        doc = s.get("doc") or {}
        if not doc.get("id"):
            continue
        exists = await db[collection].find_one({"id": doc["id"]})
        if not exists:
            await db[collection].insert_one(dict(doc))
        await db[TRASH_SNAPSHOT_COLL].delete_one({"collection": collection, "id": doc["id"]})
        restored += 1
    return restored


async def snapshot_purge(collection: str, ids: List[str]) -> int:
    res = await db[TRASH_SNAPSHOT_COLL].delete_many({"collection": collection, "id": {"$in": ids}})
    return res.deleted_count


async def snapshot_summary() -> Dict[str, int]:
    out: Dict[str, int] = {}
    agg = await db[TRASH_SNAPSHOT_COLL].aggregate([
        {"$group": {"_id": "$collection", "n": {"$sum": 1}}},
    ]).to_list(length=100)
    for row in agg:
        out[row["_id"]] = row["n"]
    return out


async def snapshot_purge_expired(days: int = AUTO_PURGE_DAYS) -> Dict[str, int]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    report: Dict[str, int] = {}
    agg = await db[TRASH_SNAPSHOT_COLL].aggregate([
        {"$match": {"deleted_at": {"$lte": cutoff}}},
        {"$group": {"_id": "$collection", "n": {"$sum": 1}}},
    ]).to_list(length=100)
    for row in agg:
        report[row["_id"]] = row["n"]
    await db[TRASH_SNAPSHOT_COLL].delete_many({"deleted_at": {"$lte": cutoff}})
    return report
