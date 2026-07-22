"""FastAPI app bootstrap: mount routers, CORS, startup (indexes + admin seed).

Domain modules:
  - routers/auth.py         → /auth, /users, /logs
  - routers/transactions.py → /transactions, /master, /stats, /kpi
  - routers/store.py        → /store
  - routers/orders.py       → /deliveries, /sales-orders
"""
import logging
import os
import uuid

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db, mongo_client
from deps import _now_iso
from security import hash_password, verify_password
from routers import auth as auth_router
from routers import ai as ai_router
from routers import orders as orders_router
from routers import store as store_router
from routers import transactions as transactions_router

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Laporan Pembelian API")

# Combine all domain routers under a single /api prefix
api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router.router)
api_router.include_router(transactions_router.router)
api_router.include_router(store_router.router)
api_router.include_router(orders_router.router)
api_router.include_router(ai_router.router)


@api_router.get("/")
async def root():
    return {"message": "Laporan Pembelian API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed_admin():
    admin_username = os.environ.get("ADMIN_USERNAME", "admin").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    legacy = await db.users.find_one({"role": "admin", "username": {"$exists": False}})
    if legacy:
        await db.users.update_one(
            {"id": legacy["id"]},
            {"$set": {"username": admin_username, "active": True}}
        )
        logger.info(f"Migrated legacy admin to username: {admin_username}")

    existing = await db.users.find_one({"username": admin_username})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": admin_username,
            "password_hash": hash_password(admin_password),
            "name": "Admin Utama",
            "role": "admin",
            "active": True,
            "perms": ["approve_store_requests"],
            "created_at": _now_iso(),
        })
        logger.info(f"Seeded admin: {admin_username}")
    else:
        updates: dict = {}
        if not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        if "approve_store_requests" not in (existing.get("perms") or []):
            updates["perms"] = list(set((existing.get("perms") or []) + ["approve_store_requests"]))
        updates.setdefault("role", "admin")
        updates.setdefault("active", True)
        if updates:
            await db.users.update_one({"username": admin_username}, {"$set": updates})
            logger.info(f"Updated admin: {admin_username}")


@app.on_event("startup")
async def startup():
    # Drop legacy email index if present, add unique username index
    try:
        info = await db.users.index_information()
        if "email_1" in info:
            await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("username", unique=True, sparse=True)
    await db.transactions.create_index("invoice_date")
    await db.transactions.create_index("vendor_name")
    await db.transactions.create_index("item_name")
    await db.transactions.create_index("invoice_no")
    await db.activity_logs.create_index("timestamp")
    await db.activity_logs.create_index("user_id")
    await db.store_receipts.create_index("item_name")
    await db.store_receipts.create_index("transaction_id")
    await db.store_receipts.create_index("qty_remaining")
    await db.store_issuances.create_index("issue_date")
    await db.store_issuances.create_index("item_name")
    await db.store_requests.create_index("status")
    await db.store_requests.create_index("requested_by")
    await db.deliveries.create_index("delivery_date")
    await db.sales_orders.create_index("so_no", unique=True)
    await db.sales_orders.create_index("so_date")
    await seed_admin()


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
