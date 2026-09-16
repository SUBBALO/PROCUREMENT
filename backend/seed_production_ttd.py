"""Seed akun Produksi (Agus = kepala produksi, + 1 staff) dan generate TTD PNG
untuk agus, prodstaff, qcuser agar tombol TTD digital menampilkan gambar tanda tangan."""
import asyncio, io, os, uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from PIL import Image, ImageDraw, ImageFont
import sys
sys.path.insert(0, os.path.dirname(__file__))
from security import hash_password


def _now():
    return datetime.now(timezone.utc).isoformat()


def make_sig_png(name: str) -> bytes:
    """Buat PNG tanda tangan sederhana (transparan) berisi nama gaya tulisan tangan."""
    W, H = 420, 130
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = None
    for fp in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, 46)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()
    ink = (17, 39, 92, 255)  # tinta biru tua
    d.text((20, 30), name, fill=ink, font=font)
    # garis tanda tangan
    d.line([(18, 100), (W - 20, 100)], fill=(90, 90, 90, 180), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "test_database")
    c = AsyncIOMotorClient(mongo_url)
    db = c[db_name]
    sig_fs = AsyncIOMotorGridFSBucket(db, bucket_name="signatures")

    # 1) Akun Produksi
    users = [
        # username, password, name, role, extra
        ("agus", "agus123", "Agus", "produksi", {"job_title": "Kepala Produksi", "also_sales": True}),
        ("prodstaff", "prod123", "Staff Produksi", "produksi", {"job_title": "Staff Produksi"}),
    ]
    for username, pwd, name, role, extra in users:
        existing = await db.users.find_one({"username": username})
        doc = {
            "username": username,
            "name": name,
            "role": role,
            "password_hash": hash_password(pwd),
            "perms": [],
            "updated_at": _now(),
            **extra,
        }
        if existing:
            await db.users.update_one({"username": username}, {"$set": doc})
            print(f"updated user {username}")
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = _now()
            await db.users.insert_one(doc)
            print(f"created user {username} ({role})")

    # reset password qcuser agar bisa dites
    qc = await db.users.find_one({"username": "qcuser"})
    if qc:
        await db.users.update_one({"username": "qcuser"}, {"$set": {"password_hash": hash_password("qc12345")}})
        print("reset qcuser password -> qc12345")

    # 2) Generate TTD PNG untuk agus, prodstaff, qcuser (kalau belum ada)
    for username in ("agus", "prodstaff", "qcuser"):
        u = await db.users.find_one({"username": username})
        if not u:
            continue
        if u.get("signature_gridfs_id"):
            print(f"{username} sudah punya TTD, skip")
            continue
        png = make_sig_png(u.get("name") or username)
        gid = await sig_fs.upload_from_stream(
            f"signature_{username}.png", io.BytesIO(png),
            metadata={"user_id": u["id"], "mime": "image/png", "size": len(png), "uploaded_at": _now()},
        )
        await db.users.update_one({"id": u["id"]}, {"$set": {
            "signature_gridfs_id": str(gid), "signature_mime": "image/png", "signature_uploaded_at": _now(),
        }})
        print(f"generated TTD PNG for {username}")

    print("DONE")


if __name__ == "__main__":
    asyncio.run(main())
