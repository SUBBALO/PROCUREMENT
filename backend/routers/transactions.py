"""Transactions CRUD + master lists + dashboard stats + KPI + Excel I/O."""
import io
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook

from db import db
from deps import _now_iso, get_current_user, log_action, require_write
from models import BulkCreateRequest, BulkDeleteRequest, Transaction, TransactionCreate

router = APIRouter(tags=["transactions"])


def _clean_doc(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _compute_idr(doc: dict) -> None:
    """Compute total_price_idr from total_price × exchange_rate.
    Ensures currency + exchange_rate defaults are present."""
    curr = (doc.get("currency") or "IDR").upper()
    rate = float(doc.get("exchange_rate") or 1.0)
    if curr == "IDR":
        rate = 1.0
    doc["currency"] = curr
    doc["exchange_rate"] = rate
    doc["total_price_idr"] = float(doc.get("total_price") or 0) * rate


# ---------------- Transactions ----------------
@router.post("/transactions", response_model=Transaction)
async def create_transaction(payload: TransactionCreate, current: dict = Depends(require_write)):
    now = _now_iso()
    tx = payload.model_dump()
    tx["id"] = str(uuid.uuid4())
    tx["created_at"] = now
    tx["updated_at"] = now
    _compute_idr(tx)
    await db.transactions.insert_one(tx.copy())
    await log_action(current, "create_transaction", "transaction", tx["id"], {
        "vendor": tx.get("vendor_name"), "item": tx.get("item_name"),
        "invoice_no": tx.get("invoice_no"), "total": tx.get("total_price"),
        "currency": tx.get("currency"), "total_idr": tx.get("total_price_idr"),
    })
    return _clean_doc(tx)


@router.post("/transactions/bulk")
async def bulk_create(payload: BulkCreateRequest, current: dict = Depends(require_write)):
    now = _now_iso()
    docs = []
    for t in payload.transactions:
        d = t.model_dump()
        d["id"] = str(uuid.uuid4())
        d["created_at"] = now
        d["updated_at"] = now
        _compute_idr(d)
        docs.append(d)
    if docs:
        await db.transactions.insert_many([d.copy() for d in docs])
        first = docs[0]
        await log_action(current, "bulk_create_transaction", "transaction", "-", {
            "count": len(docs), "vendor": first.get("vendor_name"),
            "invoice_no": first.get("invoice_no"), "currency": first.get("currency"),
        })
    return {"inserted": len(docs)}


@router.post("/transactions/bulk-delete")
async def bulk_delete_transactions(payload: BulkDeleteRequest, current: dict = Depends(require_write)):
    if not payload.ids:
        raise HTTPException(status_code=400, detail="Tidak ada ID yang dipilih")
    res = await db.transactions.delete_many({"id": {"$in": payload.ids}})
    await log_action(current, "bulk_delete_transaction", "transaction", "-", {
        "count": res.deleted_count, "requested": len(payload.ids),
    })
    return {"deleted": res.deleted_count}


@router.get("/transactions")
async def list_transactions(
    current: dict = Depends(get_current_user),
    q: Optional[str] = None,
    vendor: Optional[str] = None,
    project_no: Optional[str] = None,
    po_no: Optional[str] = None,
    invoice_no: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: str = "invoice_date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 50,
):
    filt: dict = {}
    if q:
        filt["$or"] = [
            {"item_name": {"$regex": q, "$options": "i"}},
            {"vendor_name": {"$regex": q, "$options": "i"}},
            {"invoice_no": {"$regex": q, "$options": "i"}},
            {"project_no": {"$regex": q, "$options": "i"}},
            {"po_no": {"$regex": q, "$options": "i"}},
        ]
    if vendor:
        filt["vendor_name"] = {"$regex": vendor, "$options": "i"}
    if project_no:
        filt["project_no"] = {"$regex": project_no, "$options": "i"}
    if po_no:
        filt["po_no"] = {"$regex": po_no, "$options": "i"}
    if invoice_no:
        filt["invoice_no"] = {"$regex": invoice_no, "$options": "i"}
    if start_date or end_date:
        date_filt = {}
        if start_date:
            date_filt["$gte"] = start_date
        if end_date:
            date_filt["$lte"] = end_date
        filt["invoice_date"] = date_filt

    direction = -1 if sort_dir == "desc" else 1
    total = await db.transactions.count_documents(filt)
    cursor = db.transactions.find(filt, {"_id": 0}).sort(sort_by, direction).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/transactions/{tx_id}")
async def get_transaction(tx_id: str, current: dict = Depends(get_current_user)):
    doc = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return doc


@router.put("/transactions/{tx_id}", response_model=Transaction)
async def update_transaction(tx_id: str, payload: TransactionCreate, current: dict = Depends(require_write)):
    existing = await db.transactions.find_one({"id": tx_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    upd = payload.model_dump()
    upd["updated_at"] = _now_iso()
    _compute_idr(upd)
    await db.transactions.update_one({"id": tx_id}, {"$set": upd})
    doc = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    await log_action(current, "update_transaction", "transaction", tx_id, {
        "vendor": upd.get("vendor_name"), "item": upd.get("item_name"),
        "invoice_no": upd.get("invoice_no"), "total": upd.get("total_price"),
        "currency": upd.get("currency"),
    })
    return doc


@router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, current: dict = Depends(require_write)):
    existing = await db.transactions.find_one({"id": tx_id})
    res = await db.transactions.delete_one({"id": tx_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    if existing:
        await log_action(current, "delete_transaction", "transaction", tx_id, {
            "vendor": existing.get("vendor_name"), "item": existing.get("item_name"),
            "invoice_no": existing.get("invoice_no"), "total": existing.get("total_price"),
        })
    return {"ok": True}


# ---------------- Master lists ----------------
@router.get("/master/vendors")
async def master_vendors(current: dict = Depends(get_current_user)):
    vendors = await db.transactions.distinct("vendor_name")
    return sorted([v for v in vendors if v])


@router.get("/master/items")
async def master_items(current: dict = Depends(get_current_user)):
    pipeline = [
        {"$sort": {"invoice_date": -1, "created_at": -1}},
        {"$group": {
            "_id": "$item_name",
            "last_price": {"$first": "$unit_price"},
            "last_vendor": {"$first": "$vendor_name"},
            "last_date": {"$first": "$invoice_date"},
            "unit": {"$first": "$unit"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$limit": 5000},
    ]
    result = await db.transactions.aggregate(pipeline).to_list(length=5000)
    return [{"item_name": r["_id"], "last_price": r["last_price"], "last_vendor": r["last_vendor"],
             "last_date": r["last_date"], "unit": r.get("unit", "Ea"), "count": r["count"]}
            for r in result if r["_id"]]


# ---------------- Dashboard Stats ----------------
@router.get("/stats/summary")
async def stats_summary(current: dict = Depends(get_current_user), year: Optional[int] = None):
    match: dict = {}
    if year:
        match["invoice_date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}

    total_count = await db.transactions.count_documents(match)

    agg_total = await db.transactions.aggregate([
        {"$match": match},
        {"$group": {"_id": None, "total": {"$sum": "$total_price"}}}
    ]).to_list(length=1)
    total_amount = agg_total[0]["total"] if agg_total else 0

    top_vendors = await db.transactions.aggregate([
        {"$match": match},
        {"$group": {"_id": "$vendor_name", "total": {"$sum": "$total_price"}, "count": {"$sum": 1}}},
        {"$sort": {"total": -1}},
        {"$limit": 8},
    ]).to_list(length=8)

    monthly = await db.transactions.aggregate([
        {"$match": match},
        {"$group": {"_id": {"$substr": ["$invoice_date", 0, 7]}, "total": {"$sum": "$total_price"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(length=200)

    vendors = await db.transactions.distinct("vendor_name", match)
    items = await db.transactions.distinct("item_name", match)

    return {
        "total_transactions": total_count,
        "total_amount": total_amount,
        "unique_vendors": len(vendors),
        "unique_items": len(items),
        "top_vendors": [{"vendor": v["_id"] or "-", "total": v["total"], "count": v["count"]} for v in top_vendors],
        "monthly": [{"month": m["_id"], "total": m["total"], "count": m["count"]} for m in monthly],
    }


# ---------------- KPI Purchasing ----------------
@router.get("/kpi")
async def kpi_report(
    current: dict = Depends(get_current_user),
    start_date: str = Query(...),
    end_date: str = Query(...),
    ontime_grace_days: int = 7,
):
    match = {"invoice_date": {"$gte": start_date, "$lte": end_date}}
    txs = await db.transactions.find(match, {"_id": 0}).to_list(length=200000)

    groups: dict = defaultdict(list)
    for t in txs:
        po_no = (t.get("po_no") or "").strip()
        inv_no = (t.get("invoice_no") or "").strip()
        key = po_no if po_no else (f"INV:{inv_no}" if inv_no else f"ID:{t.get('id')}")
        groups[key].append(t)

    total_po = len(groups)
    on_time_po = 0
    compliant_po = 0
    completed_po = 0
    late_details = []

    for key, items in groups.items():
        po_on_time = True
        for it in items:
            pd = it.get("po_date")
            rd = it.get("receive_date")
            if not pd or not rd:
                po_on_time = False
                break
            try:
                pd_d = datetime.strptime(pd, "%Y-%m-%d").date()
                rd_d = datetime.strptime(rd, "%Y-%m-%d").date()
                if rd_d > pd_d + timedelta(days=ontime_grace_days):
                    po_on_time = False
                    break
            except Exception:
                po_on_time = False
                break
        if po_on_time:
            on_time_po += 1
        else:
            first = items[0]
            late_details.append({
                "po_no": key,
                "vendor": first.get("vendor_name", ""),
                "invoice_no": first.get("invoice_no", ""),
                "po_date": first.get("po_date"),
                "receive_date": first.get("receive_date"),
                "item_name": first.get("item_name", ""),
            })

        if all(it.get("is_compliant", True) for it in items):
            compliant_po += 1
        if all(it.get("is_completed", True) for it in items):
            completed_po += 1

    def pct(n, d):
        return round((n / d) * 100, 2) if d else 0.0

    on_time_pct = pct(on_time_po, total_po)
    compliant_pct = pct(compliant_po, total_po)
    completed_pct = pct(completed_po, total_po)

    score_on_time = round(on_time_pct * 0.40, 2)
    score_compliance = round(compliant_pct * 0.35, 2)
    score_completion = round(completed_pct * 0.25, 2)
    total_score = round(score_on_time + score_compliance + score_completion, 2)

    if total_score >= 90:
        category = "SANGAT BAIK"
    elif total_score >= 80:
        category = "BAIK"
    elif total_score >= 71:
        category = "CUKUP"
    else:
        category = "PERLU PERBAIKAN"

    return {
        "period": {"start_date": start_date, "end_date": end_date, "ontime_grace_days": ontime_grace_days},
        "total_po": total_po,
        "kpis": [
            {
                "no": 1, "name": "On Time Delivery",
                "description": "Persentase pengiriman barang dari supplier yang diterima tepat waktu sesuai dengan jadwal (ETA)",
                "formula_num": "Jumlah On Time Shipment", "formula_den": "Total PO",
                "target": "≥ 90%", "weight": 40,
                "numerator": on_time_po, "denominator": total_po,
                "achievement": on_time_pct, "score": score_on_time, "max_score": 40,
            },
            {
                "no": 2, "name": "Compliance Quality",
                "description": "Persentase pengiriman barang dari supplier yang diterima sesuai dengan pemesanan (spesifikasi)",
                "formula_num": "Jumlah Pembelian yang sesuai Spesifikasi", "formula_den": "Total PO",
                "target": "≥ 98%", "weight": 35,
                "numerator": compliant_po, "denominator": total_po,
                "achievement": compliant_pct, "score": score_compliance, "max_score": 35,
            },
            {
                "no": 3, "name": "PO Completion Rate",
                "description": "Persentase Purchase Order yang berhasil diselesaikan dalam periode tertentu sebagai indikator efektivitas proses procurement",
                "formula_num": "Jumlah PO selesai", "formula_den": "Total PO",
                "target": "≥ 90%", "weight": 25,
                "numerator": completed_po, "denominator": total_po,
                "achievement": completed_pct, "score": score_completion, "max_score": 25,
            },
        ],
        "total_score": total_score,
        "category": category,
        "late_details": late_details[:100],
    }


# ---------------- Excel Import/Export ----------------
EXPORT_HEADERS = [
    "Tanggal Invoice", "Nomor Project (SO)", "Nomor PO", "Nama Toko", "Nama Barang",
    "Qty", "Unit", "Unit Price", "Total Price", "Nomor Invoice", "Tanggal PO", "Tanggal Terima", "Catatan"
]


def _to_date_str(val: Any) -> Optional[str]:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    if isinstance(val, date):
        return val.isoformat()
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except Exception:
            pass
    return s


def _to_float(val: Any) -> float:
    if val is None or val == "":
        return 0.0
    try:
        return float(val)
    except Exception:
        try:
            return float(str(val).replace(",", "").replace(".", ""))
        except Exception:
            return 0.0


@router.get("/transactions/export/xlsx")
async def export_xlsx(current: dict = Depends(get_current_user)):
    docs = await db.transactions.find({}, {"_id": 0}).sort("invoice_date", 1).to_list(length=100000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Laporan Pembelian"
    ws.append(EXPORT_HEADERS)
    for d in docs:
        ws.append([
            d.get("invoice_date", ""), d.get("project_no", ""), d.get("po_no", ""),
            d.get("vendor_name", ""), d.get("item_name", ""), d.get("qty", 0),
            d.get("unit", ""), d.get("unit_price", 0), d.get("total_price", 0),
            d.get("invoice_no", ""), d.get("po_date", ""), d.get("receive_date", ""), d.get("notes", ""),
        ])
    for col_idx, header in enumerate(EXPORT_HEADERS, 1):
        max_len = max([len(str(header))] + [len(str(ws.cell(row=r, column=col_idx).value or "")) for r in range(2, min(ws.max_row, 100) + 1)])
        ws.column_dimensions[chr(64 + col_idx) if col_idx <= 26 else 'A'].width = min(max_len + 2, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"laporan_pembelian_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/transactions/import/xlsx")
async def import_xlsx(file: UploadFile = File(...), current: dict = Depends(get_current_user)):
    content = await file.read()
    try:
        wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File Excel tidak valid: {e}")

    inserted = 0
    errors: List[str] = []
    now = _now_iso()

    for sn in wb.sheetnames:
        ws = wb[sn]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        header_row_idx = None
        header_map = {}
        for i, row in enumerate(rows[:5]):
            row_str = [str(c).strip().lower() if c is not None else "" for c in row]
            if any("tanggal" in c or "invoice date" in c for c in row_str) and any("nama" in c or "description" in c or "item" in c for c in row_str):
                header_row_idx = i
                for idx, cell in enumerate(row_str):
                    header_map[idx] = cell
                break
        if header_row_idx is None:
            continue

        def find_col(*keywords) -> Optional[int]:
            for idx, cell in header_map.items():
                for kw in keywords:
                    if kw in cell:
                        return idx
            return None

        col_date = find_col("tanggal invoice", "invoice date", "tanggal")
        col_so = find_col("project", "so")
        col_po = find_col("purchase order", "po no", "po")
        col_vendor = find_col("toko", "vendor", "supplier")
        col_item = find_col("nama barang", "detail description", "description", "item")
        col_qty = find_col("qty", "quantity")
        col_unit = find_col("item unit", "unit", "satuan")
        col_price = find_col("harga", "unit price", "price")
        col_total = find_col("jumlah", "amount", "total")
        col_inv = find_col("nomor invoice", "invoice no")
        col_podate = find_col("po date", "purchase order po date", "tanggal po")
        col_recv = find_col("receive", "terima")

        docs = []
        for row in rows[header_row_idx + 1:]:
            if row is None or all(c is None or c == "" for c in row):
                continue
            try:
                item_name = row[col_item] if col_item is not None and col_item < len(row) else None
                if not item_name:
                    continue
                d = {
                    "id": str(uuid.uuid4()),
                    "invoice_date": _to_date_str(row[col_date]) if col_date is not None and col_date < len(row) else "",
                    "project_no": str(row[col_so]) if col_so is not None and col_so < len(row) and row[col_so] not in (None, "") else "",
                    "po_no": str(row[col_po]) if col_po is not None and col_po < len(row) and row[col_po] not in (None, "") else "",
                    "vendor_name": str(row[col_vendor]).strip() if col_vendor is not None and col_vendor < len(row) and row[col_vendor] else "",
                    "item_name": str(item_name).strip(),
                    "qty": _to_float(row[col_qty]) if col_qty is not None and col_qty < len(row) else 0,
                    "unit": str(row[col_unit]).strip() if col_unit is not None and col_unit < len(row) and row[col_unit] else "Ea",
                    "unit_price": _to_float(row[col_price]) if col_price is not None and col_price < len(row) else 0,
                    "total_price": _to_float(row[col_total]) if col_total is not None and col_total < len(row) else 0,
                    "currency": "IDR",
                    "exchange_rate": 1.0,
                    "invoice_no": str(row[col_inv]) if col_inv is not None and col_inv < len(row) and row[col_inv] not in (None, "") else "",
                    "po_date": _to_date_str(row[col_podate]) if col_podate is not None and col_podate < len(row) else None,
                    "receive_date": _to_date_str(row[col_recv]) if col_recv is not None and col_recv < len(row) else None,
                    "notes": "",
                    # Import from Excel: NEVER auto-post to store (staff decides later per row)
                    "post_to_store": False,
                    "is_compliant": True,
                    "is_completed": True,
                    "created_at": now,
                    "updated_at": now,
                }
                if d["total_price"] == 0 and d["qty"] and d["unit_price"]:
                    d["total_price"] = d["qty"] * d["unit_price"]
                d["total_price_idr"] = d["total_price"]  # IDR default
                if not d["invoice_date"]:
                    continue
                docs.append(d)
            except Exception as e:
                errors.append(f"Sheet {sn}: {e}")

        if docs:
            await db.transactions.insert_many([d.copy() for d in docs])
            inserted += len(docs)

    return {"inserted": inserted, "errors": errors[:20]}
