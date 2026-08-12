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
from routers import backup as backup_router
from routers import trash as trash_router
from routers import bom as bom_router
from routers import orders as orders_router
from routers import sales as sales_router
from routers import store as store_router
from routers import transactions as transactions_router
from routers import notifications as notifications_router
from routers import storage as storage_router
from routers import search as search_router
from routers import consumable_requests as consumable_requests_router
from routers import form_templates as form_templates_router
from routers import excel_templates as excel_templates_router
from routers import qc as qc_router
from routers import material_costing as material_costing_router
from routers import bom_attachments as bom_attachments_router
from routers import drawing_register as drawing_register_router
from routers import drawing_requests as drawing_requests_router
from routers import so_tracker as so_tracker_router
from routers import controlled_documents as controlled_documents_router
from routers import ecn as ecn_router
from routers import transfer_requests as transfer_requests_router
from routers import stock_opname as stock_opname_router


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
api_router.include_router(bom_router.router)
api_router.include_router(sales_router.router)
api_router.include_router(backup_router.router)
api_router.include_router(trash_router.router)
api_router.include_router(notifications_router.router)
api_router.include_router(storage_router.router)
api_router.include_router(search_router.router)
api_router.include_router(consumable_requests_router.router)
api_router.include_router(form_templates_router.router)
api_router.include_router(excel_templates_router.router)
api_router.include_router(qc_router.router)
api_router.include_router(material_costing_router.router)
api_router.include_router(bom_attachments_router.router)
api_router.include_router(drawing_register_router.router)
api_router.include_router(drawing_requests_router.router)
api_router.include_router(so_tracker_router.router)
api_router.include_router(controlled_documents_router.router)
api_router.include_router(ecn_router.router)
api_router.include_router(transfer_requests_router.router)
api_router.include_router(stock_opname_router.router)


# SO Requests — Engineering asks Sales/Admin to create SO
from routers import so_requests as so_requests_router  # noqa: E402
api_router.include_router(so_requests_router.router)

# Legacy Import — bulk import data lama (BOM + DWG MKS + DWG Customer) ke Master List
from routers import legacy_import as legacy_import_router  # noqa: E402
api_router.include_router(legacy_import_router.router)

# Engineering KPI — laporan bulanan (auditable, dihitung dari data ERP)
from routers import kpi as kpi_router  # noqa: E402
api_router.include_router(kpi_router.router)

# Nonconformance (CAR) — QC/Produksi/Sales terbitkan NC atas Drawing; Eng Leader tindak lanjut → ECN
from routers import nonconformance as nonconformance_router  # noqa: E402
api_router.include_router(nonconformance_router.router)

from routers import production as production_router  # noqa: E402
api_router.include_router(production_router.router)


@api_router.get("/")
async def root():
    return {"message": "Laporan Pembelian API"}


# Public download for presentation materi ERP MKS (dipakai user untuk presentasi)
from fastapi.responses import FileResponse  # noqa: E402
import os as _os  # noqa: E402


@api_router.get("/presentation/erp-pptx")
async def download_erp_presentation_pptx():
    path = "/app/PRESENTASI_ERP_MKS.pptx"
    if not _os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Presentation file not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="MKS-Management-System-Presentation.pptx",
    )


@api_router.get("/presentation/erp-md")
async def download_erp_presentation_md():
    path = "/app/PRESENTASI_ERP_MKS.md"
    if not _os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Presentation markdown not found")
    return FileResponse(path, media_type="text/markdown",
                        filename="MKS-Management-System-Presentation.md")


@api_router.get("/presentation/security-whitepaper-pdf")
async def download_security_whitepaper_pdf():
    path = "/app/SECURITY_WHITEPAPER.pdf"
    if not _os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Whitepaper PDF not found")
    return FileResponse(path, media_type="application/pdf",
                        filename="MKS-Security-Whitepaper.pdf")


@api_router.get("/presentation/security-whitepaper-md")
async def download_security_whitepaper_md():
    path = "/app/SECURITY_WHITEPAPER.md"
    if not _os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Whitepaper markdown not found")
    return FileResponse(path, media_type="text/markdown",
                        filename="MKS-Security-Whitepaper.md")


app.include_router(api_router)


# ═══════════════════════════════════════════════════════════════════════════
# Granular Permission Enforcement (Accurate-style) — Centralized Layer
# ═══════════════════════════════════════════════════════════════════════════
# Non-regresif: hanya user yang PUNYA `access` matrix (diatur Super Admin) yang
# di-enforce. Super Admin selalu bypass. User tanpa `access` => perilaku role lama.
from starlette.responses import JSONResponse  # noqa: E402
from security import decode_token  # noqa: E402
from permissions import (  # noqa: E402
    menu_key_for_path, action_for, is_exempt, check_access,
)
from deps import is_super_admin_user  # noqa: E402


@app.middleware("http")
async def enforce_permissions(request, call_next):
    path = request.url.path
    method = request.method.upper()
    # Hanya jaga API; lewati preflight & non-API
    if method == "OPTIONS" or not path.startswith("/api/"):
        return await call_next(request)
    sub_path = path[4:]  # buang '/api'
    if is_exempt(sub_path):
        return await call_next(request)
    menu_key = menu_key_for_path(sub_path)
    if menu_key is None:
        # Endpoint tak terpetakan => tidak di-enforce (bebas)
        return await call_next(request)
    # Ambil token (cookie atau Bearer). Kalau tidak ada, biarkan endpoint yang balas 401.
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return await call_next(request)
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return await call_next(request)
        user = await db.users.find_one({"id": payload.get("sub")})
    except Exception:
        return await call_next(request)
    if not user:
        return await call_next(request)
    # Super Admin selalu bypass
    if is_super_admin_user(user):
        return await call_next(request)
    access = user.get("access")
    if not access:
        # User belum diatur matrix-nya => perilaku role lama (tidak berubah)
        return await call_next(request)
    action = action_for(method, sub_path)
    if not check_access(access, menu_key, action):
        return JSONResponse(
            status_code=403,
            content={"detail": f"Akses ditolak: Anda tidak memiliki izin '{action}' untuk modul ini."},
        )
    return await call_next(request)


# ═══════════════════════════════════════════════════════════════════════════
# Iter 22 — Security Headers Middleware (Layer 2)
# ═══════════════════════════════════════════════════════════════════════════
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    # Standard security headers untuk mitigate XSS, clickjacking, MIME sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS hanya efektif kalau HTTPS. Aman ditambahkan (browser skip di HTTP).
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

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
        # PENTING: JANGAN pernah menimpa password admin yang sudah ada.
        # (Dulu password di-reset ke ADMIN_PASSWORD tiap startup → menyebabkan
        #  password yang sudah diganti user kembali ke default saat restart.)
        # Cukup pastikan role/perms/active benar; password milik user dipertahankan.
        updates: dict = {}
        if "approve_store_requests" not in (existing.get("perms") or []):
            updates["perms"] = list(set((existing.get("perms") or []) + ["approve_store_requests"]))
        if existing.get("role") != "admin":
            updates["role"] = "admin"
        if existing.get("active") is False:
            updates["active"] = True
        if updates:
            await db.users.update_one({"username": admin_username}, {"$set": updates})
            logger.info(f"Ensured admin role/perms (password preserved): {admin_username}")


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
    await db.form_templates.create_index("code")
    # Nonconformance (CAR) indexes
    try:
        await db.nonconformances.create_index("issued_at")
        await db.nonconformances.create_index("status")
        await db.nonconformances.create_index("issuer_dept")
        await db.nonconformances.create_index("drawing_nos")
        await db.nonconformances.create_index("assigned_to.id")
        await db.nonconformances.create_index("issued_by.id")
        await db.nc_attachments.create_index("nc_id")
    except Exception as e:
        logger.warning(f"nonconformance index skip: {e}")
    # Drawings & performa viewer/list (koleksi paling sering dibuka)
    try:
        await db.drawings.create_index("id")
        await db.drawings.create_index("so_no")
        await db.drawings.create_index("drawing_no")
        await db.drawings.create_index("created_at")
        await db.drawings.create_index("approval_status")
        await db.drawings.create_index("approved_at")
        await db.drawings.create_index("deleted_at")
        await db.car_templates.create_index("active")
        await db.drawing_requests.create_index("status")
        await db.drawing_requests.create_index("created_at")
        await db.ecns.create_index("kind")
        await db.ecns.create_index("created_at")
    except Exception as e:
        logger.warning(f"drawings/perf index skip: {e}")
    await seed_admin()
    await seed_form_templates()
    # Pre-warm LibreOffice (background) agar preview Excel siap sebelum request pertama.
    try:
        from utils.office_render import prewarm_soffice_async
        prewarm_soffice_async()
    except Exception:
        pass
    # One-time migration: Riski role renamed eng_head → eng_leader (Feb 2026)
    try:
        migrated = await db.users.update_one(
            {"username": "riski", "role": "eng_head"},
            {"$set": {"role": "eng_leader"}},
        )
        if migrated.modified_count:
            logger.info("Migrated user riski: eng_head → eng_leader")
    except Exception as e:
        logger.warning(f"riski role migration skipped: {e}")

    # Auto-heal legacy BOMs that have 0 items + no engineering_status → set to draft (idempotent)
    try:
        heal = await db.boms.update_many(
            {
                "deleted_at": {"$exists": False},
                "$or": [{"items": {"$exists": False}}, {"items": {"$size": 0}}],
                "engineering_status": {"$exists": False},
            },
            {"$set": {"engineering_status": "draft"}},
        )
        if heal.modified_count:
            logger.info(f"Auto-healed {heal.modified_count} legacy empty BOMs → engineering_status=draft")
    except Exception as e:
        logger.warning(f"legacy BOM auto-heal skipped: {e}")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()


async def seed_form_templates():
    """Seed default MCL & MII templates if none active exists."""
    await _seed_mcl_template()
    await seed_mii_template()


async def _seed_mcl_template():
    # Skip if any non-deleted MCL exists
    existing = await db.form_templates.find_one({
        "code": "MCL",
        "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
    })
    if existing:
        return
    # Default MCL layout ~ A4 portrait (210 x 297 mm), 1 page
    default_mcl = {
        "id": str(uuid.uuid4()),
        "code": "MCL",
        "name": "Material Control Label (Default)",
        "description": "Template default MCL — silakan geser/edit sesuai kebutuhan.",
        "page_width_mm": 210,
        "page_height_mm": 297,
        "elements": [
            # Border pinggir halaman
            {"id": str(uuid.uuid4()), "type": "rect", "x": 10, "y": 10, "w": 190, "h": 277, "stroke": 1, "line_width": 0.7},
            # Logo (kiri atas)
            {"id": str(uuid.uuid4()), "type": "logo", "x": 15, "y": 13, "w": 30, "h": 20, "src": "COMPANY_LOGO"},
            # Company name (tengah atas)
            {"id": str(uuid.uuid4()), "type": "field", "x": 50, "y": 15, "w": 110, "h": 8, "binding": "company_name",
             "font_size": 14, "bold": True, "align": "center"},
            {"id": str(uuid.uuid4()), "type": "text", "x": 50, "y": 24, "w": 110, "h": 6, "content": "MATERIAL CONTROL LABEL",
             "font_size": 11, "bold": True, "align": "center"},
            # Garis pemisah
            {"id": str(uuid.uuid4()), "type": "line", "x": 10, "y": 34, "x2": 200, "y2": 34, "line_width": 0.7},
            # Header info (kiri)
            {"id": str(uuid.uuid4()), "type": "text", "x": 15, "y": 40, "w": 30, "h": 6, "content": "Tgl Terima", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 45, "y": 40, "w": 5, "h": 6, "content": ":", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "field", "x": 50, "y": 40, "w": 60, "h": 6, "binding": "receive_date", "font_size": 10},

            {"id": str(uuid.uuid4()), "type": "text", "x": 15, "y": 47, "w": 30, "h": 6, "content": "Vendor", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 45, "y": 47, "w": 5, "h": 6, "content": ":", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "field", "x": 50, "y": 47, "w": 90, "h": 6, "binding": "vendor_name", "font_size": 10},

            # Header info (kanan)
            {"id": str(uuid.uuid4()), "type": "text", "x": 115, "y": 40, "w": 25, "h": 6, "content": "PO No", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 140, "y": 40, "w": 5, "h": 6, "content": ":", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "field", "x": 145, "y": 40, "w": 55, "h": 6, "binding": "po_no", "font_size": 10},

            {"id": str(uuid.uuid4()), "type": "text", "x": 115, "y": 47, "w": 25, "h": 6, "content": "DO/SJ", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 140, "y": 47, "w": 5, "h": 6, "content": ":", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "field", "x": 145, "y": 47, "w": 55, "h": 6, "binding": "do_number", "font_size": 10},

            # Table
            {"id": str(uuid.uuid4()), "type": "table", "x": 15, "y": 60, "w": 180, "h": 200,
             "columns": [
                 {"label": "No", "binding": "__index__", "w": 12, "align": "center"},
                 {"label": "SO No", "binding": "so_no", "w": 28},
                 {"label": "Nama Barang", "binding": "item_name", "w": 90},
                 {"label": "Qty", "binding": "qty_received", "w": 18, "align": "right"},
                 {"label": "Unit", "binding": "unit", "w": 18, "align": "center"},
                 {"label": "Tgl", "binding": "receive_date", "w": 14, "align": "center"},
             ],
             "rows_source": "items", "row_height": 8, "font_size": 9, "header_bold": True, "border": True},

            # Footer signature
            {"id": str(uuid.uuid4()), "type": "text", "x": 20, "y": 270, "w": 60, "h": 6, "content": "Dicetak Oleh:", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 20, "y": 276, "w": 60, "h": 6, "binding": "printed_by", "font_size": 10, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 130, "y": 270, "w": 60, "h": 6, "content": "Diperiksa Oleh:", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "text", "x": 130, "y": 282, "w": 60, "h": 4, "content": "(______________________)", "font_size": 9},
        ],
        "is_active": True,
        "is_default": True,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "updated_by": "system",
    }
    await db.form_templates.insert_one(default_mcl)
    logger.info("Seeded default MCL form template")


async def seed_mii_template():
    """Seed default MII template (landscape A4) matching MKS-F-QAD-002 REV 03."""
    existing = await db.form_templates.find_one({
        "code": "MII",
        "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
    })
    if existing:
        return
    # Landscape A4: 297 x 210 mm
    PW, PH = 297, 210
    default_mii = {
        "id": str(uuid.uuid4()),
        "code": "MII",
        "name": "Material Incoming Inspection (Default)",
        "description": "Template default MII (ISO MKS-F-QAD-002 REV 03) — landscape A4. Edit posisi elemen sesuai kebutuhan.",
        "page_width_mm": PW,
        "page_height_mm": PH,
        "elements": [
            # Border
            {"id": str(uuid.uuid4()), "type": "rect", "x": 5, "y": 5, "w": PW - 10, "h": PH - 10, "stroke": 1, "line_width": 0.7},
            # Logo (top-left)
            {"id": str(uuid.uuid4()), "type": "logo", "x": 8, "y": 8, "w": 55, "h": 16, "src": "COMPANY_LOGO"},
            # Company name box (top-center)
            {"id": str(uuid.uuid4()), "type": "rect", "x": 110, "y": 10, "w": 77, "h": 8, "stroke": 1, "line_width": 0.5},
            {"id": str(uuid.uuid4()), "type": "field", "x": 110, "y": 12, "w": 77, "h": 4, "binding": "company_name", "font_size": 9, "bold": True, "align": "center"},
            # Title
            {"id": str(uuid.uuid4()), "type": "text", "x": 60, "y": 22, "w": 177, "h": 8, "content": "MATERIAL INCOMING INSPECTION", "font_size": 14, "bold": True, "align": "center"},
            # Header — Supplier / DO
            {"id": str(uuid.uuid4()), "type": "checkbox", "x": 8, "y": 34, "w": 4, "h": 4, "binding": "is_supplier"},
            {"id": str(uuid.uuid4()), "type": "text", "x": 13, "y": 34, "w": 28, "h": 5, "content": "Supplier Name:", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 41, "y": 34, "w": 90, "h": 5, "binding": "supplier_name", "font_size": 9, "underline": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 145, "y": 34, "w": 20, "h": 5, "content": "DO. No.:", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 165, "y": 34, "w": 60, "h": 5, "binding": "do_no", "font_size": 9, "underline": True},
            # Header — Customer / Date
            {"id": str(uuid.uuid4()), "type": "checkbox", "x": 8, "y": 41, "w": 4, "h": 4, "binding": "is_customer"},
            {"id": str(uuid.uuid4()), "type": "text", "x": 13, "y": 41, "w": 38, "h": 5, "content": "Supplied by Customer:", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 51, "y": 41, "w": 80, "h": 5, "binding": "customer_name", "font_size": 9, "underline": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 145, "y": 41, "w": 20, "h": 5, "content": "Date:", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 165, "y": 41, "w": 60, "h": 5, "binding": "inspection_date", "font_size": 9, "underline": True},
            # Table
            {"id": str(uuid.uuid4()), "type": "table", "x": 8, "y": 50, "w": PW - 16, "h": 120,
             "columns": [
                 {"label": "NO.", "binding": "__index__", "w": 8, "align": "center"},
                 {"label": "SO. NO.", "binding": "so_no", "w": 16, "align": "center"},
                 {"label": "BATCH No.#/GRADE MAT'L/Heat No.#", "binding": "batch_grade_heat", "w": 32},
                 {"label": "MILL CERT/ EDS NO.", "binding": "mill_cert_no", "w": 26},
                 {"label": "DESCRIPTION OF PART", "binding": "description", "w": 50},
                 {"label": "QTY", "binding": "qty", "w": 12, "align": "right"},
                 {"label": "SPEC", "binding": "dimension_spec", "w": 20, "align": "center", "group": "DIMENTION"},
                 {"label": "ACTUAL", "binding": "dimension_actual", "w": 20, "align": "center", "group": "DIMENTION"},
                 {"label": "VISUAL", "binding": "visual", "w": 24, "group": "IQC INSPECTION RESULT"},
                 {"label": "OK", "binding": "result_ok", "w": 10, "align": "center", "group": "RESULT"},
                 {"label": "NG", "binding": "result_ng", "w": 10, "align": "center", "group": "RESULT"},
                 {"label": "REMARK", "binding": "remark", "w": 33},
             ],
             "rows_source": "items", "row_height": 9, "font_size": 7.5, "header_bold": True, "border": True, "min_rows": 10},
            # Note
            {"id": str(uuid.uuid4()), "type": "text", "x": 8, "y": 175, "w": 180, "h": 4,
             "content": "Note : Visual = Check of Appearance (Dent, Damage, Scratch, Colour)", "font_size": 7.5, "italic": True},
            # Signatures
            {"id": str(uuid.uuid4()), "type": "text", "x": 60, "y": 185, "w": 40, "h": 4, "content": "Inspected by,", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 60, "y": 195, "w": 60, "h": 5, "binding": "inspector_name", "font_size": 9, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 60, "y": 200, "w": 40, "h": 4, "content": "QC Inspector", "font_size": 8},
            {"id": str(uuid.uuid4()), "type": "text", "x": 200, "y": 185, "w": 40, "h": 4, "content": "Verified by,", "font_size": 9},
            {"id": str(uuid.uuid4()), "type": "field", "x": 200, "y": 195, "w": 60, "h": 5, "binding": "leader_name", "font_size": 9, "bold": True},
            {"id": str(uuid.uuid4()), "type": "text", "x": 200, "y": 200, "w": 40, "h": 4, "content": "QC Leader", "font_size": 8},
            # Doc code footer
            {"id": str(uuid.uuid4()), "type": "text", "x": 8, "y": 205, "w": 80, "h": 3, "content": "MKS-F-QAD-002 REV 03", "font_size": 6.5},
        ],
        "is_active": True,
        "is_default": True,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "updated_by": "system",
    }
    await db.form_templates.insert_one(default_mii)
    logger.info("Seeded default MII form template")
