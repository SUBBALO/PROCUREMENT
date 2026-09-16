"""Stock Opname: sesi hitung fisik vs sistem + penyesuaian selisih (audit gudang berkala).

Alur:
1. POST /store/opname            → buat sesi draft, snapshot qty sistem per item
2. PUT  /store/opname/{sid}      → isi qty fisik (draft only, bisa berkali-kali)
3. POST /store/opname/{sid}/finalize → hitung ulang qty sistem TERBARU, buat penyesuaian:
   - selisih (+) → receipt masuk "STOCK OPNAME" (qty_remaining = selisih)
   - selisih (−) → potong FIFO store_receipts + issuance keluar "STOCK OPNAME"
4. Sesi finalized = read-only, jejak audit tersimpan (adjustments per item).

Hanya item yang DIISI qty fisik yang diproses saat finalize (item kosong dilewati).
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from deps import (
    _now_iso,
    can_see_prices,
    log_action,
    require_store_access,
    require_store_write,
)
from services.soft_delete import NOT_DELETED_FILTER, merged, soft_delete_one

router = APIRouter(tags=["stock-opname"])

OPNAME_SOURCE = "STOCK OPNAME"


# ============================ Pydantic models ============================
class OpnameCreate(BaseModel):
    opname_date: Optional[str] = ""       # kosong = hari ini
    note: str = ""
    include_empty: bool = False           # ikutkan item stok 0 (untuk temuan barang tak tercatat)


class OpnameLineInput(BaseModel):
    item_name: str
    is_customer_material: bool = False
    physical_qty: Optional[float] = None  # None = belum dihitung / dilewati
    note: str = ""


class OpnameLinesUpdate(BaseModel):
    lines: List[OpnameLineInput] = Field(default_factory=list)


class OpnameFinalize(BaseModel):
    confirm: str = ""                     # wajib "OPNAME-FINAL"


# ============================ Helpers ============================
async def _system_stock_map() -> dict:
    """Qty sistem per (item_name, is_customer_material) dari store_receipts."""
    pipeline = [
        {"$match": {"deleted_at": {"$exists": False}}},
        {"$group": {
            "_id": {"item": "$item_name", "customer": {"$ifNull": ["$is_customer_material", False]}},
            "qty": {"$sum": "$qty_remaining"},
            "unit": {"$first": "$unit"},
        }},
    ]
    docs = await db.store_receipts.aggregate(pipeline).to_list(length=10000)
    out = {}
    for d in docs:
        key = (d["_id"].get("item") or "", bool(d["_id"].get("customer")))
        if key[0]:
            out[key] = {"qty": float(d.get("qty") or 0), "unit": d.get("unit") or ""}
    return out


async def _next_opname_no() -> str:
    """Nomor otomatis: OPN-YYYYMM-###."""
    prefix = f"OPN-{_now_iso()[:7].replace('-', '')}-"
    docs = await db.stock_opnames.find(
        {"opname_no": {"$regex": f"^{prefix}"}}, {"opname_no": 1}
    ).to_list(length=1000)
    max_n = 0
    for d in docs:
        tail = (d.get("opname_no") or "").rsplit("-", 1)[-1]
        try:
            max_n = max(max_n, int(tail))
        except (TypeError, ValueError):
            pass
    return f"{prefix}{max_n + 1:03d}"


async def _latest_unit_price(item_name: str, is_customer: bool) -> float:
    """Harga satuan receipt terakhir item (untuk nilai adjustment masuk)."""
    filt = {"item_name": item_name}
    if is_customer:
        filt["is_customer_material"] = True
    doc = await db.store_receipts.find_one(
        merged(filt, NOT_DELETED_FILTER), {"unit_price": 1},
        sort=[("receive_date", -1), ("created_at", -1)],
    )
    return float((doc or {}).get("unit_price") or 0)


def _clean(d):
    if d:
        d.pop("_id", None)
    return d


def _hide_prices(session: dict):
    for ln in session.get("items", []):
        ln.pop("unit_price", None)
    for adj in session.get("adjustments", []):
        adj.pop("unit_price", None)
        adj.pop("total_value", None)
    return session


# ============================ Endpoints ============================
@router.post("/store/opname")
async def create_opname(payload: OpnameCreate, current: dict = Depends(require_store_write)):
    """Buat sesi opname draft + snapshot qty sistem saat ini."""
    stock = await _system_stock_map()
    items = []
    for (item, is_cust), info in sorted(stock.items(), key=lambda kv: kv[0][0].lower()):
        if not payload.include_empty and info["qty"] <= 0:
            continue
        items.append({
            "item_name": item,
            "is_customer_material": is_cust,
            "unit": info["unit"],
            "system_qty": info["qty"],       # snapshot saat sesi dibuat
            "physical_qty": None,            # diisi petugas
            "note": "",
        })
    if not items:
        raise HTTPException(status_code=400, detail="Tidak ada item stok untuk diopname.")
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "opname_no": await _next_opname_no(),
        "opname_date": (payload.opname_date or now[:10]),
        "status": "draft",
        "note": payload.note or "",
        "items": items,
        "adjustments": [],
        "summary": None,
        "created_by": current["id"],
        "created_by_username": current.get("username", ""),
        "created_at": now,
        "updated_at": now,
        "finalized_by_username": "",
        "finalized_at": "",
    }
    await db.stock_opnames.insert_one(doc.copy())
    await log_action(current, "opname_create", "stock_opname", doc["id"], {
        "opname_no": doc["opname_no"], "items": len(items),
    })
    return _clean(doc)


@router.get("/store/opname")
async def list_opnames(
    current: dict = Depends(require_store_access),
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    filt: dict = {}
    if status and status != "all":
        filt["status"] = status
    total = await db.stock_opnames.count_documents(merged(filt, NOT_DELETED_FILTER))
    docs = await db.stock_opnames.find(
        merged(filt, NOT_DELETED_FILTER),
        {"_id": 0, "items": 0, "adjustments": 0},  # list ringan tanpa detail baris
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": docs}


@router.get("/store/opname/{sid}")
async def get_opname(sid: str, current: dict = Depends(require_store_access)):
    doc = await db.stock_opnames.find_one(merged({"id": sid}, NOT_DELETED_FILTER), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Sesi opname tidak ditemukan")
    if not can_see_prices(current):
        _hide_prices(doc)
    return doc


@router.put("/store/opname/{sid}")
async def update_opname_lines(sid: str, payload: OpnameLinesUpdate, current: dict = Depends(require_store_write)):
    """Simpan hasil hitung fisik (draft only). Kirim hanya baris yang berubah juga boleh."""
    doc = await db.stock_opnames.find_one(merged({"id": sid}, NOT_DELETED_FILTER))
    if not doc:
        raise HTTPException(status_code=404, detail="Sesi opname tidak ditemukan")
    if doc.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Sesi sudah difinalisasi, tidak bisa diubah.")

    incoming = {(ln.item_name, bool(ln.is_customer_material)): ln for ln in payload.lines}
    updated = 0
    for it in doc.get("items", []):
        key = (it["item_name"], bool(it.get("is_customer_material")))
        ln = incoming.get(key)
        if ln is None:
            continue
        if ln.physical_qty is not None and ln.physical_qty < 0:
            raise HTTPException(status_code=400, detail=f"Qty fisik '{it['item_name']}' tidak boleh negatif.")
        it["physical_qty"] = ln.physical_qty
        it["note"] = (ln.note or "").strip()
        updated += 1

    await db.stock_opnames.update_one(
        {"id": sid},
        {"$set": {"items": doc["items"], "updated_at": _now_iso()}},
    )
    return {"ok": True, "updated": updated}


@router.post("/store/opname/{sid}/finalize")
async def finalize_opname(sid: str, payload: OpnameFinalize, current: dict = Depends(require_store_write)):
    """Terapkan penyesuaian selisih. Qty sistem dihitung ULANG saat finalize
    (bukan snapshot) supaya transaksi yang terjadi selama penghitungan tetap akurat."""
    if payload.confirm != "OPNAME-FINAL":
        raise HTTPException(status_code=400, detail="Konfirmasi salah. Ketik persis: OPNAME-FINAL")
    doc = await db.stock_opnames.find_one(merged({"id": sid}, NOT_DELETED_FILTER))
    if not doc:
        raise HTTPException(status_code=404, detail="Sesi opname tidak ditemukan")
    if doc.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Sesi sudah difinalisasi.")

    counted = [it for it in doc.get("items", []) if it.get("physical_qty") is not None]
    if not counted:
        raise HTTPException(status_code=400, detail="Belum ada item yang diisi qty fisik.")

    fresh = await _system_stock_map()
    now = _now_iso()
    opname_date = doc.get("opname_date") or now[:10]
    adjustments = []
    n_match = n_plus = n_minus = 0
    total_plus = total_minus = 0.0

    for it in counted:
        item = it["item_name"]
        is_cust = bool(it.get("is_customer_material"))
        unit = it.get("unit") or "Ea"
        phys = float(it["physical_qty"])
        sys_now = float(fresh.get((item, is_cust), {}).get("qty") or 0)
        diff = phys - sys_now
        it["system_qty_final"] = sys_now
        it["diff"] = diff

        if abs(diff) < 1e-9:
            n_match += 1
            continue

        note = f"Penyesuaian Stock Opname {doc['opname_no']}" + (f" — {it.get('note')}" if it.get("note") else "")
        if diff > 0:
            # Barang fisik LEBIH → receipt masuk penyesuaian
            unit_price = await _latest_unit_price(item, is_cust)
            rec = {
                "id": str(uuid.uuid4()),
                "transaction_id": None,
                "source": "opname",
                "source_type": "supplier",
                "is_customer_material": is_cust,
                "po_no": "", "invoice_no": "",
                "vendor_name": OPNAME_SOURCE,
                "customer_name": "",
                "item_name": item,
                "unit": unit,
                "unit_price": unit_price,
                "do_number": doc["opname_no"],
                "so_no": "",
                "qty_received": diff,
                "qty_remaining": diff,
                "receive_date": opname_date,
                "mcl_done": False, "mif_done": False,
                "note": note,
                "opname_id": doc["id"],
                "created_by": current["id"],
                "created_by_username": current.get("username", ""),
                "created_at": now,
            }
            await db.store_receipts.insert_one(rec)
            adjustments.append({
                "item_name": item, "is_customer_material": is_cust, "unit": unit,
                "kind": "IN", "qty": diff, "unit_price": unit_price,
                "total_value": diff * unit_price, "ref_id": rec["id"],
            })
            n_plus += 1
            total_plus += diff
        else:
            # Barang fisik KURANG → potong FIFO + catat issuance
            need = -diff
            batches = await db.store_receipts.find(
                merged({"item_name": item, "qty_remaining": {"$gt": 0}}, NOT_DELETED_FILTER)
            ).sort([("receive_date", 1), ("created_at", 1)]).to_list(length=1000)
            if is_cust:
                batches = [b for b in batches if bool(b.get("is_customer_material"))]
            else:
                batches = [b for b in batches if not bool(b.get("is_customer_material"))]
            available = sum(float(b.get("qty_remaining") or 0) for b in batches)
            take_total = min(need, available)  # tidak bisa memotong lebih dari sistem
            remaining = take_total
            allocations = []
            for b in batches:
                if remaining <= 1e-9:
                    break
                take = min(float(b["qty_remaining"]), remaining)
                allocations.append({
                    "receipt_id": b["id"], "qty": take,
                    "unit_price": float(b.get("unit_price", 0)),
                    "vendor_name": b.get("vendor_name", ""),
                    "receive_date": b.get("receive_date"),
                })
                await db.store_receipts.update_one({"id": b["id"]}, {"$inc": {"qty_remaining": -take}})
                remaining -= take
            total_cost = sum(a["qty"] * a["unit_price"] for a in allocations)
            iss = {
                "id": str(uuid.uuid4()),
                "item_name": item,
                "unit": unit,
                "qty": take_total,
                "issue_date": opname_date,
                "taker_name": OPNAME_SOURCE,
                "so_number": doc["opname_no"],
                "note": note,
                "allocations": allocations,
                "total_cost": total_cost,
                "avg_unit_price": (total_cost / take_total) if take_total else 0,
                "opname_id": doc["id"],
                "created_by": current["id"],
                "created_by_username": current.get("username", ""),
                "created_at": now,
            }
            await db.store_issuances.insert_one(iss)
            adjustments.append({
                "item_name": item, "is_customer_material": is_cust, "unit": unit,
                "kind": "OUT", "qty": take_total,
                "unit_price": iss["avg_unit_price"],
                "total_value": total_cost, "ref_id": iss["id"],
            })
            n_minus += 1
            total_minus += take_total

    summary = {
        "counted": len(counted),
        "skipped": len(doc.get("items", [])) - len(counted),
        "matched": n_match,
        "plus_items": n_plus,
        "minus_items": n_minus,
        "total_qty_plus": total_plus,
        "total_qty_minus": total_minus,
    }
    await db.stock_opnames.update_one({"id": sid}, {"$set": {
        "items": doc["items"],
        "adjustments": adjustments,
        "summary": summary,
        "status": "finalized",
        "finalized_by": current["id"],
        "finalized_by_username": current.get("username", ""),
        "finalized_at": now,
        "updated_at": now,
    }})
    await log_action(current, "opname_finalize", "stock_opname", sid, {
        "opname_no": doc["opname_no"], **summary,
    })
    out = await db.stock_opnames.find_one({"id": sid}, {"_id": 0})
    if not can_see_prices(current):
        _hide_prices(out)
    return out


@router.delete("/store/opname/{sid}")
async def delete_opname(sid: str, current: dict = Depends(require_store_write)):
    doc = await db.stock_opnames.find_one(merged({"id": sid}, NOT_DELETED_FILTER))
    if not doc:
        raise HTTPException(status_code=404, detail="Sesi opname tidak ditemukan")
    if doc.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Sesi finalized tidak bisa dihapus (jejak audit).")
    await soft_delete_one("stock_opnames", {"id": sid}, current)
    await log_action(current, "opname_delete", "stock_opname", sid, {"opname_no": doc.get("opname_no")})
    return {"ok": True}
