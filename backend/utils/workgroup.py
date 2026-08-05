"""Workgroup (SO-level) status & lock helpers.

Aturan LOCK dinamis (Fase 2):
  Sebuah SO/DRF dianggap TERKUNCI ketika semua drawing miliknya sudah
  keluar dari status 'draft' (mis. pending_eng_head/approved/dst).
  Artinya engineer sudah "submit final" seluruh pekerjaan.
  Jika salah satu drawing dikembalikan ke 'draft' (di-reject untuk revisi),
  lock otomatis TERBUKA lagi.
"""
from __future__ import annotations
from typing import List

from db import db


def _drawing_is_draft(d: dict) -> bool:
    return (d.get("approval_status") or "draft") == "draft"


def compute_locked(drawings: List[dict]) -> bool:
    """Locked bila ada minimal 1 drawing dan tidak ada satupun yang masih draft."""
    if not drawings:
        return False
    return all(not _drawing_is_draft(d) for d in drawings)


async def so_locked_by_bom(bom_id: str) -> bool:
    """Cek apakah SO (via bom_id bersama) sudah terkunci (semua drawing non-draft)."""
    if not bom_id:
        return False
    drawings = await db.drawings.find(
        {"bom_id": bom_id, "deleted_at": {"$exists": False}},
        {"_id": 0, "approval_status": 1},
    ).to_list(length=1000)
    return compute_locked(drawings)


async def workgroup_status(drf_id: str) -> dict:
    """Hitung status SO-level untuk 1 DRF: total drawing, jumlah draft,
    status lock, dan kelengkapan dokumen (BOM items + Nesting/CAD/Costing)."""
    drawings = await db.drawings.find(
        {"from_drf_id": drf_id, "deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "approval_status": 1, "bom_id": 1, "bom_no": 1,
         "drawing_no": 1, "file_id": 1},
    ).to_list(length=1000)

    total = len(drawings)
    draft_count = sum(1 for d in drawings if _drawing_is_draft(d))
    locked = compute_locked(drawings)

    bom_id = ""
    bom_no = ""
    for d in drawings:
        if d.get("bom_id"):
            bom_id = d["bom_id"]
            bom_no = d.get("bom_no") or ""
            break

    bom_items = 0
    counts = {"nesting": 0, "cad": 0, "costing": 0}
    if bom_id:
        bom = await db.boms.find_one({"id": bom_id}, {"_id": 0, "items": 1, "bom_no": 1})
        bom_items = len((bom or {}).get("items") or [])
        if not bom_no:
            bom_no = (bom or {}).get("bom_no") or ""
        atts = await db.bom_attachments.find(
            {"bom_id": bom_id, "deleted_at": {"$exists": False}},
            {"_id": 0, "category": 1},
        ).to_list(length=1000)
        for a in atts:
            c = a.get("category")
            if c in counts:
                counts[c] += 1

    return {
        "drf_id": drf_id,
        "bom_id": bom_id,
        "bom_no": bom_no,
        "total_drawings": total,
        "draft_count": draft_count,
        "submitted_count": total - draft_count,
        "locked": locked,
        "counts": {"bom_items": bom_items, **counts},
    }
