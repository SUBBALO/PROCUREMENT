"""Transaksi Sementara (Purchasing): upload foto nota belanja cash dari HP →
AI (Gemini vision) auto-baca isi nota → masuk list sementara (draft) →
Purchasing cek/koreksi satu-satu → commit ke sistem PERSIS seperti Bulk Transaksi
(stock/log/none) → foto dihapus setelah commit/dibuang (sesuai keputusan user).

Endpoint:
- POST   /temp-transactions/upload            multipart banyak foto → draft "processing", AI jalan di background
- GET    /temp-transactions                   list draft (processing/ready/failed)
- GET    /temp-transactions/photo/{photo_id}  tampilkan foto nota (untuk pembanding saat koreksi)
- PUT    /temp-transactions/{tid}             edit kolom draft
- POST   /temp-transactions/{tid}/commit      masuk sistem (re-use logic bulk-direct) + hapus draft & foto
- POST   /temp-transactions/{tid}/retry       ulangi pembacaan AI (bila failed)
- DELETE /temp-transactions/{tid}             buang draft (foto ikut terhapus bila tak dipakai baris lain)
"""
import asyncio
import json
import os
import re
import uuid
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field

from db import db
from deps import _now_iso, get_current_user, log_action, require_write

router = APIRouter(tags=["temp-transactions"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")

_bucket: Optional[AsyncIOMotorGridFSBucket] = None


def _fs() -> AsyncIOMotorGridFSBucket:
    global _bucket
    if _bucket is None:
        _bucket = AsyncIOMotorGridFSBucket(db, bucket_name="temp_tx_photos")
    return _bucket


# ---------------- Gemini client (lazy, key dari .env, tidak pernah di-log) ----------------
_gemini_client = None


def _gemini():
    global _gemini_client
    if _gemini_client is None:
        api_key = os.environ.get("GEMINI_API_KEY", "").strip().strip('"')
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY belum diisi di backend/.env")
        from google import genai
        # Default: Gemini Developer API (key AI Studio, termasuk format baru "AQ.").
        # Set GEMINI_MODE=vertex di .env hanya bila key khusus Vertex Express.
        mode = os.environ.get("GEMINI_MODE", "developer")
        if mode == "vertex":
            _gemini_client = genai.Client(vertexai=True, api_key=api_key)
        else:
            _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


RECEIPT_PROMPT_BASE = """Baca foto nota/kwitansi belanja (Indonesia) ini dan ekstrak HANYA yang terlihat jelas.
Keluarkan satu objek JSON sesuai skema. Jangan mengarang nilai yang tidak ada — pakai null.
Aturan:
- vendor: nama toko/supplier di nota (null bila tidak terbaca).
- date: tanggal nota format YYYY-MM-DD bila tidak ambigu, selain itu null.
- invoice_no: nomor nota/faktur/struk bila ada.
- line_items: SEMUA baris barang yang dibeli. description = nama barang persis seperti tertulis.
  qty = jumlah (angka). unit = satuan bila tertulis (pcs/kg/m/ltr dst), selain itu null.
  price = HARGA SATUAN per unit dalam Rupiah sebagai angka polos (contoh 12500, bukan "12.500").
  Bila hanya ada harga total baris tanpa qty, isi qty=1 dan price=harga total baris.
  category = tebakan kategori barang berdasarkan namanya.{category_hint}
- JANGAN masukkan baris subtotal, diskon, pajak/PPN, pembulatan, atau TOTAL ke line_items."""


def _build_prompt(known_categories: list) -> str:
    if known_categories:
        opts = ", ".join(known_categories[:40])
        hint = f" PILIH dari daftar kategori yang sudah dipakai perusahaan bila cocok: [{opts}]. Bila tidak ada yang cocok, buat kategori singkat yang masuk akal (bhs Indonesia)."
    else:
        hint = " Buat kategori singkat yang masuk akal (mis. Direct Material, Consumable, Tools, ATK)."
    return RECEIPT_PROMPT_BASE.format(category_hint=hint)


def _extract_receipt_sync(image_bytes: bytes, mime_type: str, known_categories: list) -> dict:
    """Panggil Gemini vision (sync — dijalankan via asyncio.to_thread)."""
    from google.genai import types

    class LineItem(BaseModel):
        description: str = Field(description="Nama barang persis seperti tertulis di nota")
        qty: Optional[float] = Field(default=None, description="Jumlah; null bila tak terbaca")
        unit: Optional[str] = Field(default=None, description="Satuan (pcs/kg/m); null bila tak ada")
        price: Optional[float] = Field(default=None, description="Harga satuan Rupiah; null bila tak terbaca")
        category: Optional[str] = Field(default=None, description="Tebakan kategori barang")

    class Receipt(BaseModel):
        vendor: Optional[str] = None
        date: Optional[str] = None
        invoice_no: Optional[str] = None
        line_items: List[LineItem] = Field(default_factory=list)

    part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    resp = _gemini().models.generate_content(
        model=GEMINI_MODEL,
        contents=[part, _build_prompt(known_categories)],
        config=types.GenerateContentConfig(
            temperature=0,
            response_mime_type="application/json",
            response_schema=Receipt,
        ),
    )
    if not resp.text:
        raise ValueError("AI tidak mengembalikan hasil")
    return Receipt.model_validate(json.loads(resp.text)).model_dump()


UNIT_MAP = {
    "pcs": "Pcs", "pc": "Pcs", "buah": "Pcs", "bh": "Pcs", "unit": "Ea", "ea": "Ea",
    "set": "Set", "lot": "Lot", "kg": "Kg", "gram": "Kg", "ltr": "Ltr", "liter": "Ltr", "l": "Ltr",
    "m": "Mtr", "mtr": "Mtr", "meter": "Mtr", "box": "Box", "dus": "Box", "roll": "Roll", "rol": "Roll",
}


def _norm_unit(u: Optional[str]) -> str:
    if not u:
        return "Ea"
    return UNIT_MAP.get(str(u).strip().lower(), "Ea")


# ---------------- Normalisasi nama supplier ----------------
# "PT. INTERNATIONAL HARDWARE INDO" → "INTERNATIONAL HARDWARE INDO, PT"
# supaya pencarian nama perusahaan gampang (urut abjad nama, bukan "PT").
ENTITY_PREFIXES = ("PT", "CV", "UD", "PD", "FA", "TB")
_ENTITY_TOKENS = {"pt", "cv", "ud", "pd", "fa", "tb", "tbk", "persero"}


def _flip_entity_name(raw: str) -> str:
    s = " ".join((raw or "").split()).strip(" .,")
    if not s:
        return s
    up = s.upper()
    # Sudah format "NAMA, PT" → biarkan
    for p in ENTITY_PREFIXES:
        if up.endswith(f", {p}") or up.endswith(f",{p}"):
            return s
    for p in ENTITY_PREFIXES:
        for sep in (". ", " ", "."):
            pref = f"{p}{sep}"
            if up.startswith(pref) and len(s) > len(pref):
                rest = s[len(pref):].strip(" .,")
                if rest:
                    return f"{rest}, {p}"
    return s


def _vendor_key(name: str) -> str:
    """Kunci pembanding: huruf kecil, tanpa tanda baca, tanpa kata badan usaha."""
    s = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    return "".join(t for t in s.split() if t not in _ENTITY_TOKENS)


async def _resolve_vendor(raw: Optional[str]) -> str:
    """Balik format PT/CV ke belakang; bila supplier sudah pernah terdaftar
    (di transaksi manapun), auto-koreksi ke nama persis yang ada di database."""
    flipped = _flip_entity_name(raw or "")
    key = _vendor_key(flipped)
    if not key:
        return flipped
    vendors = await db.transactions.distinct("vendor_name")
    for v in vendors:
        if v and _vendor_key(v) == key:
            return v  # sudah terdaftar → pakai penulisan dari database
    return flipped


async def _process_photo(temp_id: str, photo_id: str, mime_type: str):
    """Background: baca foto dengan AI, ubah 1 baris 'processing' jadi N baris item 'ready'."""
    now = _now_iso()
    try:
        stream = await _fs().open_download_stream(ObjectId(photo_id))
        image_bytes = await stream.read()
        # Kategori yang sudah dipakai perusahaan → jadi preferensi tebakan AI
        cats = await db.transactions.distinct("category")
        known_categories = sorted({str(c).strip() for c in cats if c and str(c).strip() and str(c).strip() != "Uncategorized"})
        data = await asyncio.to_thread(_extract_receipt_sync, image_bytes, mime_type, known_categories)

        base = await db.temp_transactions.find_one({"id": temp_id})
        if not base:  # sudah dibuang user
            return
        vendor = await _resolve_vendor((data.get("vendor") or "").strip())
        date = (data.get("date") or "") or base.get("invoice_date") or now[:10]
        invoice_no = (data.get("invoice_no") or "").strip()
        items = data.get("line_items") or []

        if not items:
            await db.temp_transactions.update_one({"id": temp_id}, {"$set": {
                "status": "failed",
                "error": "AI tidak menemukan baris barang di foto. Coba foto ulang lebih jelas, atau isi manual lalu commit.",
                "vendor_name": vendor, "invoice_no": invoice_no, "invoice_date": date,
                "updated_at": _now_iso(),
            }})
            return

        # Baris pertama → update doc awal; sisanya → insert baris baru dengan photo_id sama
        def row_fields(it):
            qty = float(it.get("qty") or 1)
            price = float(it.get("price") or 0)
            return {
                "invoice_date": date,
                "vendor_name": vendor,
                "invoice_no": invoice_no,
                "item_name": (it.get("description") or "").strip(),
                "category": (it.get("category") or "").strip(),
                "qty": qty,
                "unit": _norm_unit(it.get("unit")),
                "unit_price": price,
                "total_price": qty * price,
                "status": "ready",
                "error": "",
                "updated_at": _now_iso(),
            }

        await db.temp_transactions.update_one({"id": temp_id}, {"$set": row_fields(items[0])})
        extra = []
        for it in items[1:]:
            extra.append({
                **{k: base.get(k) for k in (
                    "photo_id", "photo_name", "photo_mime", "project_no", "po_no",
                    "currency", "exchange_rate", "stock_mode",
                    "created_by", "created_by_username",
                )},
                "id": str(uuid.uuid4()),
                "created_at": now,
                **row_fields(it),
            })
        if extra:
            await db.temp_transactions.insert_many(extra)
    except Exception as e:  # noqa: BLE001 — simpan pesan aman, tanpa key
        msg = str(e)[:300]
        await db.temp_transactions.update_one({"id": temp_id}, {"$set": {
            "status": "failed", "error": f"Gagal baca AI: {msg}", "updated_at": _now_iso(),
        }})


# ============================ Endpoints ============================
@router.post("/temp-transactions/upload")
async def upload_receipts(
    background: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current: dict = Depends(require_write),
):
    """Upload banyak foto nota sekaligus. Tiap foto → 1 draft 'processing',
    AI membaca di background (list akan ter-update otomatis)."""
    if not files:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 foto nota")
    if not os.environ.get("GEMINI_API_KEY", "").strip():
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY belum dikonfigurasi di server")
    now = _now_iso()
    created = []
    for f in files:
        ctype = (f.content_type or "").lower()
        if ctype not in ALLOWED_TYPES:
            raise HTTPException(status_code=415, detail=f"Format '{f.filename}' tidak didukung (pakai JPG/PNG/WEBP)")
        data = await f.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"File '{f.filename}' kosong")
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail=f"'{f.filename}' terlalu besar (maks 10 MB)")
        photo_id = await _fs().upload_from_stream(f.filename or "nota.jpg", data, metadata={"contentType": ctype})
        doc = {
            "id": str(uuid.uuid4()),
            "photo_id": str(photo_id),
            "photo_name": f.filename or "nota.jpg",
            "photo_mime": ctype,
            "status": "processing",
            "error": "",
            "invoice_date": now[:10],
            "project_no": "",
            "po_no": "",
            "vendor_name": "",
            "item_name": "",
            "category": "",
            "qty": 0,
            "unit": "Ea",
            "unit_price": 0,
            "total_price": 0,
            "currency": "IDR",
            "exchange_rate": 1,
            "invoice_no": "",
            "stock_mode": "none",
            "created_by": current["id"],
            "created_by_username": current.get("username", ""),
            "created_at": now,
            "updated_at": now,
        }
        await db.temp_transactions.insert_one(doc.copy())
        background.add_task(_process_photo, doc["id"], doc["photo_id"], ctype)
        created.append({"id": doc["id"], "photo_name": doc["photo_name"]})
    await log_action(current, "temp_tx_upload", "temp_transaction", "-", {"photos": len(created)})
    return {"uploaded": len(created), "items": created}


@router.get("/temp-transactions")
async def list_temp_transactions(current: dict = Depends(require_write)):
    docs = await db.temp_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    processing = sum(1 for d in docs if d.get("status") == "processing")
    return {"total": len(docs), "processing": processing, "items": docs}


@router.get("/temp-transactions/photo/{photo_id}")
async def get_photo(photo_id: str, current: dict = Depends(get_current_user)):
    try:
        stream = await _fs().open_download_stream(ObjectId(photo_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Foto tidak ditemukan")
    meta = stream.metadata or {}

    async def gen():
        while True:
            chunk = await stream.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(gen(), media_type=meta.get("contentType", "image/jpeg"))


class TempTxUpdate(BaseModel):
    invoice_date: Optional[str] = None
    project_no: Optional[str] = None
    po_no: Optional[str] = None
    vendor_name: Optional[str] = None
    item_name: Optional[str] = None
    category: Optional[str] = None
    qty: Optional[float] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    invoice_no: Optional[str] = None
    stock_mode: Optional[str] = None


@router.put("/temp-transactions/{tid}")
async def update_temp_transaction(tid: str, payload: TempTxUpdate, current: dict = Depends(require_write)):
    doc = await db.temp_transactions.find_one({"id": tid})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "stock_mode" in upd and upd["stock_mode"] not in ("stock", "log", "none"):
        raise HTTPException(status_code=400, detail="stock_mode harus stock/log/none")
    # Nama supplier: balik format PT/CV + auto-koreksi ke nama terdaftar
    if upd.get("vendor_name"):
        upd["vendor_name"] = await _resolve_vendor(upd["vendor_name"])
    # qty/harga berubah → hitung ulang total bila total tidak dikirim eksplisit
    if ("qty" in upd or "unit_price" in upd) and "total_price" not in upd:
        q = float(upd.get("qty", doc.get("qty") or 0))
        p = float(upd.get("unit_price", doc.get("unit_price") or 0))
        upd["total_price"] = q * p
    # Draft failed yang diisi manual boleh langsung dianggap siap
    if doc.get("status") == "failed" and (upd.get("item_name") or doc.get("item_name")):
        upd["status"] = "ready"
        upd["error"] = ""
    upd["updated_at"] = _now_iso()
    await db.temp_transactions.update_one({"id": tid}, {"$set": upd})
    out = await db.temp_transactions.find_one({"id": tid}, {"_id": 0})
    return out


async def _delete_photo_if_orphan(photo_id: str):
    if not photo_id:
        return
    still = await db.temp_transactions.count_documents({"photo_id": photo_id})
    if still == 0:
        try:
            await _fs().delete(ObjectId(photo_id))
        except Exception:
            pass


class CommitBody(BaseModel):
    stock_mode: Optional[str] = None  # override tujuan saat commit (stock/log/none)


class CommitBatchBody(BaseModel):
    ids: List[str] = Field(default_factory=list)


def _validate_commit_doc(doc: dict, sm: str) -> Optional[str]:
    """Return pesan error bila draft belum layak commit, None bila OK."""
    if doc.get("status") == "processing":
        return "Masih dibaca AI — tunggu selesai dulu"
    if sm not in ("stock", "log", "none"):
        return "Pilih tujuan: Masuk Stok / Log Only / Tidak"
    if not (doc.get("vendor_name") or "").strip():
        return "Nama Supplier wajib diisi dulu"
    if not (doc.get("item_name") or "").strip():
        return "Nama Barang wajib diisi dulu"
    if float(doc.get("qty") or 0) <= 0:
        return "Qty harus > 0"
    return None


async def _commit_one(doc: dict, sm: str, current: dict) -> dict:
    """Commit 1 draft memakai logic Bulk Transaksi, lalu hapus draft + foto orphan."""
    from routers.transactions import bulk_direct_create
    row = {
        "invoice_date": doc.get("invoice_date"),
        "project_no": doc.get("project_no") or "",
        "po_no": doc.get("po_no") or "",
        "vendor_name": doc.get("vendor_name"),
        "item_name": doc.get("item_name"),
        "category": (doc.get("category") or "").strip() or "Uncategorized",
        "qty": float(doc.get("qty") or 0),
        "unit": doc.get("unit") or "Ea",
        "unit_price": float(doc.get("unit_price") or 0),
        "total_price": float(doc.get("total_price") or 0),
        "currency": doc.get("currency") or "IDR",
        "exchange_rate": float(doc.get("exchange_rate") or 1),
        "invoice_no": doc.get("invoice_no") or "",
        "stock_mode": sm,
        "notes": f"Dari Transaksi Sementara (foto nota: {doc.get('photo_name', '')})",
    }
    result = await bulk_direct_create({"rows": [row]}, current)
    photo_id = doc.get("photo_id") or ""
    await db.temp_transactions.delete_one({"id": doc["id"]})
    await _delete_photo_if_orphan(photo_id)
    return result


@router.post("/temp-transactions/commit-batch")
async def commit_batch(payload: CommitBatchBody, current: dict = Depends(require_write)):
    """Masukkan banyak draft tercentang sekaligus. Tiap baris divalidasi sendiri —
    yang gagal dilaporkan per baris, yang valid tetap masuk."""
    if not payload.ids:
        raise HTTPException(status_code=400, detail="Tidak ada baris dipilih")
    committed, failed = [], []
    for tid in payload.ids:
        doc = await db.temp_transactions.find_one({"id": tid})
        if not doc:
            failed.append({"id": tid, "item": "?", "error": "Draft tidak ditemukan"})
            continue
        sm = doc.get("stock_mode") or "none"
        err = _validate_commit_doc(doc, sm)
        if err:
            failed.append({"id": tid, "item": doc.get("item_name") or doc.get("photo_name", "?"), "error": err})
            continue
        try:
            await _commit_one(doc, sm, current)
            committed.append({"id": tid, "item": doc.get("item_name"), "stock_mode": sm})
        except HTTPException as e:
            failed.append({"id": tid, "item": doc.get("item_name") or "?", "error": str(e.detail)})
        except Exception as e:  # noqa: BLE001
            failed.append({"id": tid, "item": doc.get("item_name") or "?", "error": str(e)[:150]})
    await log_action(current, "temp_tx_commit_batch", "temp_transaction", "-", {
        "committed": len(committed), "failed": len(failed),
    })
    return {"ok": True, "committed": len(committed), "failed": failed, "items": committed}


@router.post("/temp-transactions/{tid}/commit")
async def commit_temp_transaction(tid: str, payload: CommitBody, current: dict = Depends(require_write)):
    """Masukkan 1 draft ke sistem — memakai logic yang SAMA dengan Bulk Transaksi
    (transaksi + incoming/stok sesuai pilihan), lalu draft & foto dihapus."""
    doc = await db.temp_transactions.find_one({"id": tid})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan")
    sm = payload.stock_mode or doc.get("stock_mode") or "none"
    err = _validate_commit_doc(doc, sm)
    if err:
        raise HTTPException(status_code=400, detail=err)
    result = await _commit_one(doc, sm, current)
    await log_action(current, "temp_tx_commit", "temp_transaction", tid, {
        "item": doc.get("item_name"), "vendor": doc.get("vendor_name"), "stock_mode": sm,
    })
    return {"ok": True, "committed": 1, "stock_mode": sm, "tx_ids": result.get("tx_ids", [])}


@router.post("/temp-transactions/{tid}/retry")
async def retry_temp_transaction(tid: str, background: BackgroundTasks, current: dict = Depends(require_write)):
    doc = await db.temp_transactions.find_one({"id": tid})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan")
    if doc.get("status") != "failed":
        raise HTTPException(status_code=400, detail="Hanya draft gagal yang bisa diulang")
    await db.temp_transactions.update_one({"id": tid}, {"$set": {"status": "processing", "error": "", "updated_at": _now_iso()}})
    background.add_task(_process_photo, tid, doc.get("photo_id"), doc.get("photo_mime") or "image/jpeg")
    return {"ok": True}


@router.delete("/temp-transactions/{tid}")
async def delete_temp_transaction(tid: str, current: dict = Depends(require_write)):
    doc = await db.temp_transactions.find_one({"id": tid})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan")
    photo_id = doc.get("photo_id") or ""
    await db.temp_transactions.delete_one({"id": tid})
    await _delete_photo_if_orphan(photo_id)
    await log_action(current, "temp_tx_discard", "temp_transaction", tid, {"item": doc.get("item_name", "")})
    return {"ok": True}
