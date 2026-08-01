"""Migrasi satu kali: konversi semua nomor SO numerik lama menjadi kanonik 6 digit (zero-pad).

Contoh: '5251' -> '005251', '1234' -> '001234'. Nilai > 6 digit / non-numerik dibiarkan.

Jalankan: python -m migrations.migrate_so_6digit  (dari folder /app/backend)
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import db  # noqa: E402


def pad6(v):
    if v is None:
        return None, False
    s = str(v).strip()
    if s.isdigit() and len(s) < 6:
        return s.zfill(6), True
    return s, False


async def migrate_simple_field(collection: str, field: str) -> int:
    changed = 0
    cursor = db[collection].find({field: {"$exists": True, "$ne": ""}}, {"_id": 1, field: 1})
    async for doc in cursor:
        new_val, did = pad6(doc.get(field))
        if did and new_val != doc.get(field):
            await db[collection].update_one({"_id": doc["_id"]}, {"$set": {field: new_val}})
            changed += 1
    return changed


async def migrate_array_field(collection: str, array_field: str, sub_field: str) -> int:
    """Update so_no di dalam array of objects (mis. boms.items[].so_no)."""
    changed_docs = 0
    cursor = db[collection].find({array_field: {"$type": "array"}}, {"_id": 1, array_field: 1})
    async for doc in cursor:
        arr = doc.get(array_field) or []
        touched = False
        for item in arr:
            if isinstance(item, dict) and sub_field in item:
                new_val, did = pad6(item.get(sub_field))
                if did and new_val != item.get(sub_field):
                    item[sub_field] = new_val
                    touched = True
        if touched:
            await db[collection].update_one({"_id": doc["_id"]}, {"$set": {array_field: arr}})
            changed_docs += 1
    return changed_docs


async def migrate_nested_obj(collection: str, obj_field: str, sub_field: str) -> int:
    """Update so_no di dalam sub-object (mis. drawings.so_stamp.so_no)."""
    changed = 0
    cursor = db[collection].find({f"{obj_field}.{sub_field}": {"$exists": True}}, {"_id": 1, obj_field: 1})
    async for doc in cursor:
        obj = doc.get(obj_field) or {}
        new_val, did = pad6(obj.get(sub_field))
        if did and new_val != obj.get(sub_field):
            await db[collection].update_one({"_id": doc["_id"]}, {"$set": {f"{obj_field}.{sub_field}": new_val}})
            changed += 1
    return changed


async def main():
    report = {}
    # Simple so_no fields
    for coll in ("sales_orders", "boms", "quotations", "drawings", "transactions"):
        report[f"{coll}.so_no"] = await migrate_simple_field(coll, "so_no")
    # so_requests uses requested_so_no
    report["so_requests.requested_so_no"] = await migrate_simple_field("so_requests", "requested_so_no")
    # Array item so_no
    report["boms.items[].so_no"] = await migrate_array_field("boms", "items", "so_no")
    report["quotations.items[].so_no"] = await migrate_array_field("quotations", "items", "so_no")
    report["inquiries.linked_quotations[].so_no"] = await migrate_array_field("inquiries", "linked_quotations", "so_no")
    report["store_receipts.so_no"] = await migrate_simple_field("store_receipts", "so_no")
    # Nested object
    report["drawings.so_stamp.so_no"] = await migrate_nested_obj("drawings", "so_stamp", "so_no")

    print("=== Migrasi SO → 6 digit selesai ===")
    total = 0
    for k, v in report.items():
        total += v
        print(f"  {k}: {v} dokumen diupdate")
    print(f"TOTAL: {total} dokumen diupdate")


if __name__ == "__main__":
    asyncio.run(main())
