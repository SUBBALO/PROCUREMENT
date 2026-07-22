"""Seed dummy data for procurement app testing."""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def iso_now(offset_days: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).isoformat()


def d(offset_days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).date().isoformat()


async def seed_users():
    users = [
        ("staff01", "staff123", "Budi Santoso", "staff", []),
        ("store01", "store123", "Rina Wulandari", "store", []),
        ("finance01", "finance123", "Ahmad Kurniawan", "finance", []),
    ]
    for uname, pwd, name, role, perms in users:
        if await db.users.find_one({"username": uname}):
            continue
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": uname,
            "password_hash": hash_pw(pwd),
            "name": name,
            "role": role,
            "active": True,
            "perms": perms,
            "created_at": iso_now(),
        })
        print(f"  + user {uname} ({role})")


async def seed_transactions():
    if await db.transactions.count_documents({}) > 0:
        print("  transactions already exist, skipping")
        return
    txs = [
        # (invoice_date, project_no, po_no, vendor, item, qty, unit, unit_price, invoice_no, po_date_offset, receive_date_offset, post_to_store)
        (d(-30), "SO-2026-001", "PO-2026-001", "PT Sinar Baja", "Plat Besi 5mm", 20, "Pcs", 250000, "INV-001", -35, -28, True),
        (d(-30), "SO-2026-001", "PO-2026-001", "PT Sinar Baja", "Baut M12", 100, "Pcs", 5000, "INV-001", -35, -28, True),
        (d(-25), "SO-2026-002", "PO-2026-002", "CV Maju Jaya", "Kabel NYM 2.5", 50, "Meter", 15000, "INV-002", -30, -20, True),
        (d(-20), "SO-2026-002", "PO-2026-003", "PT Elektrindo", "Saklar Broco", 30, "Pcs", 35000, "INV-003", -22, -18, True),
        (d(-15), "SO-2026-003", "PO-2026-004", "PT Sinar Baja", "Pipa Galvanis 1/2\"", 40, "Meter", 45000, "INV-004", -18, -12, True),
        (d(-10), "SO-2026-003", "PO-2026-005", "CV Maju Jaya", "Cat Dulux Weathershield", 8, "Kaleng", 425000, "INV-005", -12, -8, False),
        (d(-5), "SO-2026-004", "PO-2026-006", "PT Alat Kantor", "Kertas HVS A4 80gsm", 25, "Rim", 65000, "INV-006", -7, -3, False),
        (d(-3), "SO-2026-004", "PO-2026-007", "PT Elektrindo", "Lampu LED 15W Philips", 24, "Pcs", 85000, "INV-007", -5, -1, True),
    ]
    docs = []
    now = iso_now()
    for row in txs:
        (inv_date, proj, po, vendor, item, qty, unit, price, inv_no, po_off, rcv_off, to_store) = row
        docs.append({
            "id": str(uuid.uuid4()),
            "invoice_date": inv_date,
            "project_no": proj,
            "po_no": po,
            "vendor_name": vendor,
            "item_name": item,
            "qty": qty,
            "unit": unit,
            "unit_price": price,
            "total_price": qty * price,
            "invoice_no": inv_no,
            "po_date": d(po_off),
            "receive_date": d(rcv_off),
            "notes": "",
            "is_compliant": True,
            "is_completed": True,
            "post_to_store": to_store,
            "created_at": now,
            "updated_at": now,
        })
    await db.transactions.insert_many(docs)
    print(f"  + {len(docs)} transactions")


async def seed_sales_orders():
    if await db.sales_orders.count_documents({}) > 0:
        print("  sales_orders already exist, skipping")
        return
    sos = [
        ("SO-2026-001", d(-40), "PT Cahaya Nusantara", "Instalasi listrik gedung A"),
        ("SO-2026-002", d(-35), "PT Bumi Persada", "Renovasi pabrik unit 2"),
        ("SO-2026-003", d(-25), "CV Anugerah Sejati", "Perbaikan atap workshop"),
        ("SO-2026-004", d(-15), "PT Adikarya Sentosa", "Pengadaan alat kantor Q1"),
    ]
    docs = []
    now = iso_now()
    for so_no, so_date, customer, desc in sos:
        docs.append({
            "id": str(uuid.uuid4()),
            "so_no": so_no,
            "so_date": so_date,
            "customer": customer,
            "description": desc,
            "created_by": "seed",
            "created_by_username": "seed",
            "created_at": now,
        })
    await db.sales_orders.insert_many(docs)
    print(f"  + {len(docs)} sales orders")


async def main():
    print("Seeding dummy data...")
    await seed_users()
    await seed_transactions()
    await seed_sales_orders()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
