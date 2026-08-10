"""
Backfill koleksi 'sales_orders' dari 'drawing_requests' / 'drawings'.

Kenapa perlu? Board Progress SO / TV hanya menampilkan SO yang punya record
di koleksi 'sales_orders' (dicocokkan dgn 'drawings'). Jika 'sales_orders' kosong,
board kosong walaupun drawing_requests ada.

Script ini membuat record sales_orders minimal untuk setiap so_no yang:
  - punya drawing / drawing_request, TAPI
  - belum ada di sales_orders.

AMAN:
  - Default DRY-RUN (hanya menampilkan yang AKAN dibuat, tidak menulis).
  - Menulis ke DB HANYA jika dijalankan dengan argumen  --apply
  - Idempotent: SO yang sudah ada tidak diduplikasi.

Cara pakai (di folder backend server lokal):
  python backfill_sales_orders.py           # lihat dulu (dry-run)
  python backfill_sales_orders.py --apply    # benar-benar mengisi data
"""
import os
import sys
import uuid
from datetime import datetime, timezone

import pymongo
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

APPLY = "--apply" in sys.argv

client = pymongo.MongoClient(os.environ["MONGO_URL"])
db = client[os.environ.get("DB_NAME", "test")]

now_iso = datetime.now(timezone.utc).isoformat()

# Kumpulkan so_no dari drawings + drawing_requests
so_from_dwg = {s for s in db.drawings.distinct("so_no") if s}
so_from_drf = {s for s in db.drawing_requests.distinct("so_no") if s}
all_so = so_from_dwg | so_from_drf

# so_no yang sudah ada di sales_orders (biar tidak dobel)
existing = {s for s in db.sales_orders.distinct("so_no") if s}
missing = sorted(all_so - existing)

print("=" * 60)
print("BACKFILL SALES_ORDERS", "(DRY-RUN)" if not APPLY else "(APPLY / MENULIS)")
print("=" * 60)
print("DB              :", os.environ.get("DB_NAME"))
print("SO dari drawings:", len(so_from_dwg))
print("SO dari DRF     :", len(so_from_drf))
print("Sudah ada di SO :", len(existing))
print("Akan dibuat     :", len(missing))
print("-" * 60)

created = 0
for sono in missing:
    # Ambil data referensi dari DRF (kalau ada) untuk customer/description/tanggal
    drf = db.drawing_requests.find_one({"so_no": sono}, sort=[("created_at", -1)])
    customer = (drf.get("customer_name") or drf.get("customer") or "").strip() if drf else ""
    description = (drf.get("project_name") or drf.get("notes") or "").strip() if drf else ""
    so_date = ""
    if drf:
        so_date = (drf.get("date") or (drf.get("created_at") or "")[:10] or "")
    if not so_date:
        so_date = now_iso[:10]

    doc = {
        "id": str(uuid.uuid4()),
        "so_no": sono,
        "so_date": so_date,
        "customer": customer,
        "customer_address": "",
        "po_customer_no": "",
        "description": description,
        "sales_name": "",
        "currency": "IDR",
        "source_quotation_no": "",
        "items": [],
        "total_amount": 0,
        "created_by": "backfill",
        "created_by_username": "backfill",
        "created_by_name": "Data Repair (backfill)",
        "created_at": now_iso,
        "backfilled": True,  # penanda: record hasil backfill
    }
    print(f"  + {sono:<16} customer='{customer}'  tanggal={so_date}  desc='{description[:30]}'")
    if APPLY:
        db.sales_orders.insert_one(doc)
        created += 1

print("-" * 60)
if APPLY:
    print(f"SELESAI. {created} record sales_orders dibuat.")
    print("Refresh board TV: http://<IP>:3000/tv/so-progress")
else:
    print("Ini DRY-RUN (belum menulis). Jalankan lagi dengan  --apply  untuk benar-benar mengisi:")
    print("    python backfill_sales_orders.py --apply")
print("=" * 60)
