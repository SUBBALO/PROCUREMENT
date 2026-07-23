"""Seed dummy data for procurement app.

WARNING: This script WIPES all data collections (except users are re-created).
Runs safely idempotent via wipe-then-seed pattern.
"""
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


COLLECTIONS_TO_WIPE = [
    "transactions",
    "sales_orders",
    "store_receipts",
    "store_issuances",
    "store_requests",
    "deliveries",
    "activity_logs",
]


async def wipe_data():
    print("Wiping collections...")
    for c in COLLECTIONS_TO_WIPE:
        res = await db[c].delete_many({})
        print(f"  - {c}: {res.deleted_count} deleted")
    # Wipe non-admin users; keep any legacy admin so seed_admin() upgrade works
    res = await db.users.delete_many({"role": {"$ne": "admin"}})
    print(f"  - users (non-admin): {res.deleted_count} deleted")


async def seed_users():
    """Admin users: susanto (primary, matches ADMIN_USERNAME env), erwin (secondary).
    Plus one user per non-admin role."""
    users = [
        # username, password, name, role, perms
        ("erwin",     "erwin123",   "Erwin",           "admin",   ["approve_store_requests", "view_store_report"]),
        ("staff01",   "staff123",   "Budi Santoso",    "staff",   []),
        ("store01",   "store123",   "Rina Wulandari",  "store",   []),
        ("finance01", "finance123", "Ahmad Kurniawan", "finance", []),
        ("engineer01","eng123",     "Engineering Team","engineering", []),
        ("sales01",   "sales123",   "Sales Team",      "sales",       []),
    ]
    for uname, pwd, name, role, perms in users:
        existing = await db.users.find_one({"username": uname})
        if existing:
            # Reset password/name/role/perms so seed is authoritative
            await db.users.update_one(
                {"username": uname},
                {"$set": {
                    "password_hash": hash_pw(pwd),
                    "name": name,
                    "role": role,
                    "active": True,
                    "perms": perms,
                }},
            )
            print(f"  ~ user {uname} ({role})")
        else:
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


def _tx(inv_date, proj, po, vendor, item, qty, unit, unit_price, inv_no,
        po_off, rcv_off, to_store, currency="IDR", rate=1.0):
    total = qty * unit_price
    return {
        "id": str(uuid.uuid4()),
        "invoice_date": inv_date,
        "project_no": proj,
        "po_no": po,
        "vendor_name": vendor,
        "item_name": item,
        "qty": qty,
        "unit": unit,
        "unit_price": unit_price,
        "total_price": total,
        "currency": currency,
        "exchange_rate": rate,
        "total_price_idr": total * rate,
        "invoice_no": inv_no,
        "po_date": d(po_off),
        "receive_date": d(rcv_off),
        "notes": "",
        "is_compliant": True,
        "is_completed": True,
        "post_to_store": to_store,
        "created_at": iso_now(),
        "updated_at": iso_now(),
    }


async def seed_transactions():
    # Multi-currency mix: IDR + SGD + USD
    # Exchange rates approx (2026): SGD→IDR ~12000, USD→IDR ~16000
    txs = [
        _tx(d(-30), "SO-2026-001", "PO-2026-001", "PT Sinar Baja", "Plat Besi 5mm", 20, "Pcs", 250000, "INV-001", -35, -28, True),
        _tx(d(-30), "SO-2026-001", "PO-2026-001", "PT Sinar Baja", "Baut M12", 100, "Pcs", 5000, "INV-001", -35, -28, True),
        _tx(d(-25), "SO-2026-002", "PO-2026-002", "CV Maju Jaya", "Kabel NYM 2.5", 50, "Meter", 15000, "INV-002", -30, -20, True),
        # SGD transaction
        _tx(d(-20), "SO-2026-002", "PO-2026-003", "SGP Electronics Pte Ltd", "PLC Siemens S7-1200", 2, "Set", 850.00, "INV-SGP-003", -22, -18, True,
            currency="SGD", rate=12000.0),
        _tx(d(-15), "SO-2026-003", "PO-2026-004", "PT Sinar Baja", "Pipa Galvanis 1/2\"", 40, "Meter", 45000, "INV-004", -18, -12, True),
        _tx(d(-10), "SO-2026-003", "PO-2026-005", "CV Maju Jaya", "Cat Dulux Weathershield", 8, "Kaleng", 425000, "INV-005", -12, -8, False),
        _tx(d(-5), "SO-2026-004", "PO-2026-006", "PT Alat Kantor", "Kertas HVS A4 80gsm", 25, "Rim", 65000, "INV-006", -7, -3, False),
        # USD transaction
        _tx(d(-3), "SO-2026-004", "PO-2026-007", "Fortress Global Inc", "Industrial Bearing SKF 6205", 12, "Pcs", 18.50, "INV-USD-007", -5, -1, True,
            currency="USD", rate=16000.0),
    ]
    await db.transactions.insert_many(txs)
    print(f"  + {len(txs)} transactions (mixed IDR/SGD/USD)")


async def seed_sales_orders():
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
    print("=" * 60)
    print("PROCUREMENT — Reset & Seed")
    print("=" * 60)
    await wipe_data()
    print("\nSeeding fresh data...")
    await seed_users()
    await seed_transactions()
    await seed_sales_orders()
    print("\nDone. Note: primary admin (susanto/admin123) is seeded automatically on backend startup.")


if __name__ == "__main__":
    asyncio.run(main())
