"""
Diagnosa kenapa board 'Progress SO' / TV kosong di server lokal.

Cara pakai (di server lokal, dari folder backend):
    python diagnose_board.py

Script ini memakai MONGO_URL & DB_NAME dari backend/.env (database lokal Anda).
Tidak mengubah data apa pun — hanya membaca & menghitung.
"""
import os
import pymongo
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "test")

print("=" * 60)
print("DIAGNOSA BOARD PROGRESS SO")
print("=" * 60)
print("DB_NAME :", DB_NAME)

client = pymongo.MongoClient(MONGO_URL)
db = client[DB_NAME]

so = db.sales_orders.count_documents({})
dw = db.drawings.count_documents({})
dw_live = db.drawings.count_documents({"deleted_at": {"$exists": False}})
drf = db.drawing_requests.count_documents({})
print("-" * 60)
print("Jumlah dokumen per koleksi:")
print("  sales_orders     :", so)
print("  drawings (total) :", dw, "| aktif (belum dihapus):", dw_live)
print("  drawing_requests :", drf)
print("-" * 60)

dwg_so = [s for s in db.drawings.distinct("so_no") if s]
print("SO unik yang punya 'drawings' :", len(dwg_so))
print("  contoh:", dwg_so[:15])

in_so = db.sales_orders.count_documents({"so_no": {"$in": dwg_so}}) if dwg_so else 0
print("Dari itu, yang JUGA ada di sales_orders :", in_so)
print(">>> INI jumlah SO yang akan MUNCUL di board:", in_so)
print("-" * 60)

# SO yang punya drawing tapi TIDAK ketemu di sales_orders (penyebab tak muncul)
if dwg_so:
    have = set(db.sales_orders.distinct("so_no", {"so_no": {"$in": dwg_so}}))
    missing = [s for s in dwg_so if s not in have]
    if missing:
        print("SO punya drawing tapi TIDAK ada di sales_orders (tak muncul):")
        print("  ", missing[:30])
    else:
        print("Semua SO ber-drawing sudah ada di sales_orders. OK.")

# Contoh so_no dari drawing_requests (sumber SO Document Tracker)
drf_so = [s for s in db.drawing_requests.distinct("so_no") if s]
print("-" * 60)
print("SO unik di drawing_requests (sumber SO Tracker):", len(drf_so))
print("  contoh:", drf_so[:15])
print("=" * 60)

# Kesimpulan otomatis
print("KESIMPULAN:")
if dw_live == 0:
    print("  -> Koleksi 'drawings' KOSONG. Board butuh dokumen drawing.")
    print("     Data drawing belum ada / belum dimigrasikan ke DB lokal.")
elif in_so == 0:
    print("  -> Ada drawing, tapi SO-nya tidak ada di 'sales_orders'.")
    print("     Perlu migrasi 'sales_orders' yang cocok, atau data tidak sinkron.")
else:
    print(f"  -> Seharusnya board menampilkan {in_so} SO. Jika di layar tetap 0,")
    print("     berarti frontend menghubungi backend LAIN (cek REACT_APP_BACKEND_URL saat build).")
print("=" * 60)
