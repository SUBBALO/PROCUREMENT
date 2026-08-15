"""Production module — Fase 1: visibilitas SO baru untuk Produksi.

Produksi mendapat daftar Sales Order (SO) sejak SO dibuat (walau drawing belum
di-stamp Doc Control), lengkap dengan penanda apakah drawing/BOM sudah ada, dan
bisa 'acknowledge' (tandai sudah dilihat/disiapkan).
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from deps import get_current_user, log_action, is_production, is_admin_like

router = APIRouter(prefix="/production", tags=["production"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _can_view(user: dict) -> bool:
    return is_production(user) or is_admin_like(user)


@router.get("/new-so")
async def list_new_so(scope: str = "unack", current: dict = Depends(get_current_user)):
    """Daftar SO untuk Produksi.
    scope: 'unack' (belum di-acknowledge) | 'all'.
    Mengembalikan info SO + apakah drawing/BOM sudah tersedia (konteks kesiapan).
    """
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")

    q = {"deleted_at": {"$exists": False}}
    if scope == "unack":
        q["prod_ack"] = {"$ne": True}

    sos = await db.sales_orders.find(q, {"_id": 0}).sort("created_at", -1).limit(300).to_list(length=300)

    items = []
    for so in sos:
        so_no = so.get("so_no") or ""
        # Konteks kesiapan: apakah sudah ada drawing / BOM untuk SO ini
        has_drawing = False
        has_bom = False
        if so_no:
            has_drawing = (await db.drawings.count_documents({"so_no": so_no, "deleted_at": {"$exists": False}})) > 0
            has_bom = (await db.boms.count_documents({"so_no": so_no, "deleted_at": {"$exists": False}})) > 0
        # Qty total = jumlah qty semua item pada SO
        so_items = so.get("items") or []
        qty_total = 0.0
        for it in so_items:
            try:
                qty_total += float(it.get("qty", 0) or 0)
            except (TypeError, ValueError):
                pass
        # Deskripsi: pakai field description, fallback gabungan nama item
        desc = so.get("description") or ""
        if not desc and so_items:
            desc = ", ".join([str(it.get("name") or "").strip() for it in so_items if it.get("name")])
        # Item list per baris + total qty release (progress "siap X pcs")
        item_list = [{"name": (it.get("name") or "").strip(), "qty": _f(it.get("qty")), "unit": it.get("unit") or ""} for it in so_items]
        released = 0.0
        if so_no:
            for fr in await db.fg_release_notes.find({"so_no": so_no}, {"_id": 0, "qty": 1}).to_list(length=10000):
                released += _f(fr.get("qty"))
        items.append({
            "id": so.get("id"),
            "so_no": so_no,
            "so_date": so.get("so_date") or (so.get("created_at") or "")[:10],
            "customer": so.get("customer") or "",
            "description": desc,
            "items": item_list,
            "qty_total": qty_total,
            "released": released,
            "balance": max(0, qty_total - released),
            "source_quotation_no": so.get("source_quotation_no") or "",
            "created_at": so.get("created_at") or "",
            "created_by_username": so.get("created_by_username") or "",
            "has_drawing": has_drawing,
            "has_bom": has_bom,
            "prod_ack": bool(so.get("prod_ack")),
            "prod_ack_at": so.get("prod_ack_at") or "",
            "prod_ack_by": so.get("prod_ack_by") or "",
            "prod_started": bool(so.get("prod_started")),
            "prod_started_at": so.get("prod_started_at") or "",
            "prod_started_by": so.get("prod_started_by") or "",
        })

    unack_count = await db.sales_orders.count_documents({"deleted_at": {"$exists": False}, "prod_ack": {"$ne": True}})
    return {"items": items, "count": len(items), "unack_count": unack_count, "scope": scope}


@router.post("/new-so/{so_id}/ack")
async def ack_new_so(so_id: str, current: dict = Depends(get_current_user)):
    """Tandai SO sudah dilihat/disiapkan Produksi."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa acknowledge")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    await db.sales_orders.update_one(
        {"id": so_id},
        {"$set": {
            "prod_ack": True,
            "prod_ack_at": _now_iso(),
            "prod_ack_by": current.get("name") or current.get("username") or "",
        }},
    )
    await log_action(current, "prod_ack_so", "sales_order", so_id, {"so_no": so.get("so_no")})
    return {"ok": True}


@router.post("/new-so/{so_id}/unack")
async def unack_new_so(so_id: str, current: dict = Depends(get_current_user)):
    """Batalkan acknowledge (kembalikan ke daftar SO baru)."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    await db.sales_orders.update_one(
        {"id": so_id},
        {"$set": {"prod_ack": False}, "$unset": {"prod_ack_at": "", "prod_ack_by": ""}},
    )
    await log_action(current, "prod_unack_so", "sales_order", so_id, {"so_no": so.get("so_no")})
    return {"ok": True}


class StartWorkIn(BaseModel):
    start_date: str = ""


@router.post("/new-so/{so_id}/start")
async def start_work_so(so_id: str, payload: StartWorkIn = None, current: dict = Depends(get_current_user)):
    """Tandai Mulai Kerja dengan tanggal yang dipilih Produksi."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa menandai mulai kerja")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    sd = _date_only(payload.start_date) if (payload and payload.start_date) else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    started_at = f"{sd}T00:00:00+00:00"
    await db.sales_orders.update_one(
        {"id": so_id},
        {"$set": {
            "prod_started": True,
            "prod_started_at": started_at,
            "prod_started_by": current.get("name") or current.get("username") or "",
        }},
    )
    await log_action(current, "prod_start_so", "sales_order", so_id, {"so_no": so.get("so_no"), "start_date": sd})
    return {"ok": True}


@router.post("/new-so/{so_id}/unstart")
async def unstart_work_so(so_id: str, current: dict = Depends(get_current_user)):
    """Batalkan status Mulai Kerja."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    await db.sales_orders.update_one(
        {"id": so_id},
        {"$set": {"prod_started": False}, "$unset": {"prod_started_at": "", "prod_started_by": ""}},
    )
    await log_action(current, "prod_unstart_so", "sales_order", so_id, {"so_no": so.get("so_no")})
    return {"ok": True}



# ==========================================================================
# Daily Production Report
# Satu baris = satu record di koleksi `production_reports`.
# 1 tanggal bisa punya banyak baris (operator/SO/proses berbeda).
# ==========================================================================

class ProductionReportIn(BaseModel):
    report_date: str = ""          # YYYY-MM-DD
    operator_name: str = ""
    so_no: str = ""
    customer: str = ""
    process: str = ""
    qty_ok: float = 0
    qty_ng: float = 0
    work_start: str = ""           # HH:MM
    work_end: str = ""             # HH:MM
    machine_no: str = ""
    remarks: str = ""


def _f(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _serialize_report(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "report_date": r.get("report_date") or "",
        "operator_name": r.get("operator_name") or "",
        "so_no": r.get("so_no") or "",
        "customer": r.get("customer") or "",
        "process": r.get("process") or "",
        "qty_ok": _f(r.get("qty_ok")),
        "qty_ng": _f(r.get("qty_ng")),
        "work_start": r.get("work_start") or "",
        "work_end": r.get("work_end") or "",
        "machine_no": r.get("machine_no") or "",
        "remarks": r.get("remarks") or "",
        "created_by_username": r.get("created_by_username") or "",
        "created_at": r.get("created_at") or "",
        "updated_at": r.get("updated_at") or "",
    }


@router.get("/report-options")
async def report_options(current: dict = Depends(get_current_user)):
    """Data pendukung form: daftar operator (user Produksi + histori), mesin,
    proses, remark yang pernah dipakai, dan daftar SO (untuk auto-isi customer)."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")

    # Operator: user role produksi/production + nama operator yang pernah diinput
    prod_users = await db.users.find(
        {"role": {"$in": ["production", "produksi"]}, "active": {"$ne": False}},
        {"_id": 0, "name": 1, "username": 1},
    ).to_list(length=500)
    op_set = set()
    for u in prod_users:
        nm = (u.get("name") or u.get("username") or "").strip()
        if nm:
            op_set.add(nm)
    for nm in await db.production_reports.distinct("operator_name"):
        if nm and str(nm).strip():
            op_set.add(str(nm).strip())

    machines = sorted({str(m).strip() for m in await db.production_reports.distinct("machine_no") if m and str(m).strip()})
    processes = sorted({str(p).strip() for p in await db.production_reports.distinct("process") if p and str(p).strip()})
    remarks = sorted({str(x).strip() for x in await db.production_reports.distinct("remarks") if x and str(x).strip()})

    # SO options — untuk auto-isi customer saat pilih SO
    sos = await db.sales_orders.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0, "so_no": 1, "customer": 1},
    ).sort("so_no", 1).to_list(length=5000)
    so_opts = []
    seen = set()
    for s in sos:
        sn = (s.get("so_no") or "").strip()
        if sn and sn not in seen:
            seen.add(sn)
            so_opts.append({"so_no": sn, "customer": s.get("customer") or ""})

    return {
        "operators": sorted(op_set),
        "machines": machines,
        "processes": processes,
        "remarks": remarks,
        "sos": so_opts,
    }


@router.get("/reports/masterlist")
async def reports_masterlist(
    month: Optional[str] = None,       # YYYY-MM
    date: Optional[str] = None,        # YYYY-MM-DD (override month)
    operator: Optional[str] = None,
    so_no: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    """Masterlist semua baris report dengan filter bulan/tanggal/operator/SO."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")

    filt = _build_report_filter(month, date, operator, so_no)
    rows = await db.production_reports.find(filt, {"_id": 0}).sort("report_date", -1).to_list(length=100000)
    rows.sort(key=lambda r: (r.get("report_date") or "", r.get("created_at") or ""), reverse=True)
    items = [_serialize_report(r) for r in rows]
    total_ok = sum(i["qty_ok"] for i in items)
    total_ng = sum(i["qty_ng"] for i in items)
    return {"items": items, "count": len(items), "total_ok": total_ok, "total_ng": total_ng}


def _build_report_filter(month, date, operator, so_no) -> dict:
    filt: dict = {}
    if date:
        filt["report_date"] = date
    elif month:
        filt["report_date"] = {"$regex": f"^{month}"}
    if operator:
        filt["operator_name"] = {"$regex": operator, "$options": "i"}
    if so_no:
        filt["so_no"] = {"$regex": so_no, "$options": "i"}
    return filt


@router.get("/reports/masterlist.xlsx")
async def reports_masterlist_xlsx(
    month: Optional[str] = None,
    date: Optional[str] = None,
    operator: Optional[str] = None,
    so_no: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    """Export Excel masterlist report (mengikuti filter yang sama)."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")

    import io
    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook

    filt = _build_report_filter(month, date, operator, so_no)
    rows = await db.production_reports.find(filt, {"_id": 0}).to_list(length=100000)
    rows.sort(key=lambda r: (r.get("report_date") or "", r.get("created_at") or ""))

    wb = Workbook()
    ws = wb.active
    ws.title = "Daily Production Report"
    headers = ["Tanggal", "Operator", "SO No", "Customer", "Process",
               "Qty OK", "Qty NG", "Jam Mulai", "Jam Selesai", "Machine No", "Remarks"]
    ws.append(headers)
    for r in rows:
        rr = _serialize_report(r)
        ws.append([
            rr["report_date"], rr["operator_name"], rr["so_no"], rr["customer"], rr["process"],
            rr["qty_ok"], rr["qty_ng"], rr["work_start"], rr["work_end"], rr["machine_no"], rr["remarks"],
        ])
    widths = [12, 20, 16, 24, 20, 9, 9, 11, 11, 14, 30]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + i)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    tag = date or month or datetime.now().strftime("%Y%m")
    fname = f"daily_production_report_{tag}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/reports")
async def list_reports(date: Optional[str] = None, current: dict = Depends(get_current_user)):
    """Daily Production Report — daftar baris untuk 1 tanggal (default: hari ini)."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    d = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = await db.production_reports.find({"report_date": d}, {"_id": 0}).to_list(length=100000)
    rows.sort(key=lambda r: r.get("created_at") or "")
    items = [_serialize_report(r) for r in rows]
    total_ok = sum(i["qty_ok"] for i in items)
    total_ng = sum(i["qty_ng"] for i in items)
    return {"date": d, "items": items, "count": len(items), "total_ok": total_ok, "total_ng": total_ng}


@router.post("/reports")
async def create_report(payload: ProductionReportIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa input")
    rd = (payload.report_date or "").strip() or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Blok operator yang absen (Tidak Hadir / MC-Sakit) pada tanggal tsb
    op_name = (payload.operator_name or "").strip()
    if op_name:
        emp = await db.production_employees.find_one({"name": {"$regex": f"^{op_name}$", "$options": "i"}, "active": {"$ne": False}})
        if emp:
            att = await db.production_attendance.find_one({"date": rd, "employee_id": emp.get("id")})
            if att and att.get("status") in ATTEND_BLOCKED:
                label = "MC/Sakit" if att.get("status") == "mc_sakit" else "Tidak Hadir"
                raise HTTPException(status_code=400, detail=f"{op_name} berstatus {label} pada {rd}. Tidak bisa input Daily Production untuk operator ini.")
    doc = {
        "id": str(uuid.uuid4()),
        "report_date": rd,
        "operator_name": (payload.operator_name or "").strip(),
        "so_no": (payload.so_no or "").strip(),
        "customer": (payload.customer or "").strip(),
        "process": (payload.process or "").strip(),
        "qty_ok": _f(payload.qty_ok),
        "qty_ng": _f(payload.qty_ng),
        "work_start": (payload.work_start or "").strip(),
        "work_end": (payload.work_end or "").strip(),
        "machine_no": (payload.machine_no or "").strip(),
        "remarks": (payload.remarks or "").strip(),
        "created_by": current.get("id"),
        "created_by_username": current.get("name") or current.get("username") or "",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.production_reports.insert_one(doc)
    await log_action(current, "create_production_report", "production_report", doc["id"], {"date": rd, "so_no": doc["so_no"]})
    return _serialize_report(doc)


@router.put("/reports/{report_id}")
async def update_report(report_id: str, payload: ProductionReportIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    existing = await db.production_reports.find_one({"id": report_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Report tidak ditemukan")
    updates = {
        "report_date": (payload.report_date or existing.get("report_date") or "").strip(),
        "operator_name": (payload.operator_name or "").strip(),
        "so_no": (payload.so_no or "").strip(),
        "customer": (payload.customer or "").strip(),
        "process": (payload.process or "").strip(),
        "qty_ok": _f(payload.qty_ok),
        "qty_ng": _f(payload.qty_ng),
        "work_start": (payload.work_start or "").strip(),
        "work_end": (payload.work_end or "").strip(),
        "machine_no": (payload.machine_no or "").strip(),
        "remarks": (payload.remarks or "").strip(),
        "updated_at": _now_iso(),
    }
    await db.production_reports.update_one({"id": report_id}, {"$set": updates})
    await log_action(current, "update_production_report", "production_report", report_id, {"so_no": updates["so_no"]})
    merged = {**existing, **updates}
    return _serialize_report(merged)


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa menghapus")
    existing = await db.production_reports.find_one({"id": report_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Report tidak ditemukan")
    await db.production_reports.delete_one({"id": report_id})
    await log_action(current, "delete_production_report", "production_report", report_id, {"so_no": existing.get("so_no")})
    return {"ok": True}


# ==========================================================================
# Finished Goods Release Note (FGRN) + Daily Monitoring Job Progress
# ==========================================================================

def _so_qty_total(so: dict) -> float:
    t = 0.0
    for it in so.get("items") or []:
        try:
            t += float(it.get("qty", 0) or 0)
        except (TypeError, ValueError):
            pass
    return t


def _so_desc(so: dict) -> str:
    d = so.get("description") or ""
    if not d:
        d = ", ".join([str(it.get("name") or "").strip() for it in (so.get("items") or []) if it.get("name")])
    return d


def _date_only(s: str) -> str:
    return (s or "")[:10]


def _days_between(start: str, end: str) -> int:
    """Selisih hari kalender antara dua tanggal ISO (YYYY-MM-DD...)."""
    try:
        a = datetime.fromisoformat(_date_only(start))
        b = datetime.fromisoformat(_date_only(end))
        return max(0, (b - a).days)
    except Exception:
        return 0


def _working_days(start: str, end: str, holidays: set = None) -> int:
    """NETWORKDAYS.INTL weekend=11 (hanya Minggu) minus hari libur nasional.
    Jumlah hari kerja dari start s/d end (inklusif), kecualikan Minggu & tanggal libur."""
    holidays = holidays or set()
    try:
        a = datetime.fromisoformat(_date_only(start))
        b = datetime.fromisoformat(_date_only(end))
    except Exception:
        return 0
    if b < a:
        return 0
    cnt = 0
    cur = a
    guard = 0
    while cur <= b and guard < 3000:
        iso = cur.strftime("%Y-%m-%d")
        if cur.weekday() != 6 and iso not in holidays:  # 6 = Minggu
            cnt += 1
        cur += timedelta(days=1)
        guard += 1
    return cnt


class FrnIn(BaseModel):
    frn_date: str = ""
    release_no: str = ""
    so_no: str = ""
    customer: str = ""
    description: str = ""
    qty: float = 0
    qc_comment: str = ""


def _serialize_frn(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "frn_date": r.get("frn_date") or "",
        "release_no": r.get("release_no") or "",
        "so_no": r.get("so_no") or "",
        "customer": r.get("customer") or "",
        "description": r.get("description") or "",
        "qty": _f(r.get("qty")),
        "qc_comment": r.get("qc_comment") or "",
        "created_by_username": r.get("created_by_username") or "",
        "created_at": r.get("created_at") or "",
    }


@router.get("/so-brief")
async def so_brief(started_only: bool = False, current: dict = Depends(get_current_user)):
    """Ringkasan SO untuk dropdown FGRN / Job Progress: so_no, customer, deskripsi, qty total."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    filt = {"deleted_at": {"$exists": False}}
    if started_only:
        filt["prod_started"] = True
    sos = await db.sales_orders.find(filt, {"_id": 0}).sort("so_no", 1).to_list(length=10000)
    # Total qty release per SO untuk hitung balance
    frn_rows = await db.fg_release_notes.find({}, {"_id": 0, "so_no": 1, "qty": 1}).to_list(length=100000)
    released = {}
    for fr in frn_rows:
        sn = fr.get("so_no") or ""
        released[sn] = released.get(sn, 0) + _f(fr.get("qty"))
    items = []
    for so in sos:
        sn = so.get("so_no") or ""
        qt = _so_qty_total(so)
        rel = released.get(sn, 0)
        items.append({
            "so_id": so.get("id"),
            "so_no": sn,
            "customer": so.get("customer") or "",
            "description": _so_desc(so),
            "qty_total": qt,
            "released": rel,
            "balance": max(0, qt - rel),
            "due_date": _date_only(so.get("due_date") or ""),
            "date_received": _date_only(so.get("prod_started_at") or ""),
        })
    return {"items": items}


async def _validate_frn_qty(so_no: str, new_qty: float, exclude_id: str = None):
    """Tolak jika total qty release (existing + baru) melebihi SO qty."""
    if not so_no:
        return
    so = await db.sales_orders.find_one({"so_no": so_no, "deleted_at": {"$exists": False}})
    if not so:
        return
    so_qty = _so_qty_total(so)
    if so_qty <= 0:
        return
    q = {"so_no": so_no}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    existing = await db.fg_release_notes.find(q, {"_id": 0, "qty": 1}).to_list(length=100000)
    existing_sum = sum(_f(e.get("qty")) for e in existing)
    balance = so_qty - existing_sum
    if new_qty > balance:
        raise HTTPException(status_code=400, detail=f"Qty melebihi sisa SO. Sisa balance: {balance:g} (SO qty {so_qty:g}, sudah rilis {existing_sum:g})")


@router.get("/frn")
async def list_frn(so_no: Optional[str] = None, month: Optional[str] = None,
                   date: Optional[str] = None, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    filt = {}
    if so_no:
        filt["so_no"] = {"$regex": so_no, "$options": "i"}
    if date:
        filt["frn_date"] = date
    elif month:
        filt["frn_date"] = {"$regex": f"^{month}"}
    rows = await db.fg_release_notes.find(filt, {"_id": 0}).to_list(length=100000)
    rows.sort(key=lambda r: (r.get("frn_date") or "", r.get("created_at") or ""), reverse=True)
    return {"items": [_serialize_frn(r) for r in rows]}


@router.post("/frn")
async def create_frn(payload: FrnIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa input")
    frn_date = (payload.frn_date or "").strip() or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    so_no = (payload.so_no or "").strip()
    customer = (payload.customer or "").strip()
    description = (payload.description or "").strip()
    # Auto-lengkapi customer & deskripsi dari SO bila kosong
    if so_no and (not customer or not description):
        so = await db.sales_orders.find_one({"so_no": so_no, "deleted_at": {"$exists": False}})
        if so:
            customer = customer or (so.get("customer") or "")
            description = description or _so_desc(so)
    # Auto nomor release note bila kosong
    release_no = (payload.release_no or "").strip()
    if not release_no:
        seq = (await db.fg_release_notes.count_documents({})) + 1
        release_no = f"RN-{datetime.now(timezone.utc).strftime('%Y%m')}-{seq:04d}"
    await _validate_frn_qty(so_no, _f(payload.qty))
    doc = {
        "id": str(uuid.uuid4()),
        "frn_date": frn_date,
        "release_no": release_no,
        "so_no": so_no,
        "customer": customer,
        "description": description,
        "qty": _f(payload.qty),
        "qc_comment": (payload.qc_comment or "").strip(),
        "created_by": current.get("id"),
        "created_by_username": current.get("name") or current.get("username") or "",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.fg_release_notes.insert_one(doc)
    await log_action(current, "create_frn", "fg_release_note", doc["id"], {"so_no": so_no, "qty": doc["qty"]})
    return _serialize_frn(doc)


@router.put("/frn/{frn_id}")
async def update_frn(frn_id: str, payload: FrnIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    existing = await db.fg_release_notes.find_one({"id": frn_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Release note tidak ditemukan")
    await _validate_frn_qty((payload.so_no or "").strip(), _f(payload.qty), exclude_id=frn_id)
    updates = {
        "frn_date": (payload.frn_date or existing.get("frn_date") or "").strip(),
        "release_no": (payload.release_no or existing.get("release_no") or "").strip(),
        "so_no": (payload.so_no or "").strip(),
        "customer": (payload.customer or "").strip(),
        "description": (payload.description or "").strip(),
        "qty": _f(payload.qty),
        "qc_comment": (payload.qc_comment or "").strip(),
        "updated_at": _now_iso(),
    }
    await db.fg_release_notes.update_one({"id": frn_id}, {"$set": updates})
    await log_action(current, "update_frn", "fg_release_note", frn_id, {"so_no": updates["so_no"]})
    return _serialize_frn({**existing, **updates})


@router.delete("/frn/{frn_id}")
async def delete_frn(frn_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa menghapus")
    existing = await db.fg_release_notes.find_one({"id": frn_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Release note tidak ditemukan")
    await db.fg_release_notes.delete_one({"id": frn_id})
    await log_action(current, "delete_frn", "fg_release_note", frn_id, {"so_no": existing.get("so_no")})
    return {"ok": True}


class JobProgressIn(BaseModel):
    pic: str = ""
    remarks: str = ""


@router.get("/job-progress")
async def job_progress(current: dict = Depends(get_current_user)):
    """Daily Monitoring Job Progress — semua SO yang sudah 'Mulai Kerja' (per SO).
    Qty Finished diambil dari total qty Finished Goods Release Note untuk SO tsb.
    Selesai bila total release >= SO Qty; Days dihitung dari Date Received s/d selesai
    (atau s/d hari ini bila belum selesai)."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")

    sos = await db.sales_orders.find(
        {"prod_started": True, "deleted_at": {"$exists": False}}, {"_id": 0}
    ).sort("prod_started_at", 1).to_list(length=10000)

    # Agregasi qty release per SO
    frn_rows = await db.fg_release_notes.find({}, {"_id": 0, "so_no": 1, "qty": 1, "frn_date": 1}).to_list(length=100000)
    frn_sum = {}
    frn_last = {}
    for r in frn_rows:
        sn = r.get("so_no") or ""
        frn_sum[sn] = frn_sum.get(sn, 0) + _f(r.get("qty"))
        d = _date_only(r.get("frn_date") or "")
        if d and (sn not in frn_last or d > frn_last[sn]):
            frn_last[sn] = d

    jp_docs = await db.job_progress.find({}, {"_id": 0}).to_list(length=10000)
    jp_map = {d.get("so_id"): d for d in jp_docs}

    # Actual working days per SO diambil dari Daily Production Report:
    # jumlah tanggal berbeda di mana SO tsb benar-benar dikerjakan.
    pr_rows = await db.production_reports.find(
        {"so_no": {"$nin": ["", None]}}, {"_id": 0, "so_no": 1, "report_date": 1}
    ).to_list(length=200000)
    work_dates = {}
    for pr in pr_rows:
        sn = pr.get("so_no") or ""
        d = _date_only(pr.get("report_date") or "")
        if sn and d:
            work_dates.setdefault(sn, set()).add(d)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Set tanggal libur nasional untuk perhitungan Working Date Target
    hol_docs = await db.holidays.find({}, {"_id": 0, "date": 1}).to_list(length=5000)
    holidays = {_date_only(h.get("date") or "") for h in hol_docs if h.get("date")}
    items = []
    for so in sos:
        so_id = so.get("id")
        so_no = so.get("so_no") or ""
        so_qty = _so_qty_total(so)
        qty_finished = frn_sum.get(so_no, 0)
        jp = jp_map.get(so_id, {})
        date_received = _date_only(so.get("prod_started_at") or "")
        finished = so_qty > 0 and qty_finished >= so_qty

        finished_at = jp.get("finished_at") or ""
        # Sinkron status selesai
        if finished and not finished_at:
            finished_at = frn_last.get(so_no) or today
            await db.job_progress.update_one({"so_id": so_id}, {"$set": {"finished_at": finished_at, "so_no": so_no}}, upsert=True)
        elif not finished and finished_at:
            finished_at = ""
            await db.job_progress.update_one({"so_id": so_id}, {"$set": {"finished_at": ""}}, upsert=True)

        end_for_days = finished_at if (finished and finished_at) else today
        days = _days_between(date_received, end_for_days) if date_received else 0

        due_date = _date_only(so.get("due_date") or "")   # otomatis dari SO
        pct = (qty_finished / so_qty) if so_qty > 0 else 0
        awd = sorted(work_dates.get(so_no, set()))
        actual_working_days = len(awd)
        # Working Date Target = hari kerja (exclude Minggu) dari mulai kerja s/d Due Date
        working_date_target = _working_days(date_received, due_date, holidays) if (date_received and due_date) else 0
        # Productivity = Working Date Target / Actual Working Day (%)
        productivity = round((working_date_target / actual_working_days) * 100, 1) if actual_working_days > 0 else 0

        items.append({
            "so_id": so_id,
            "so_no": so_no,
            "customer": so.get("customer") or "",
            "description": _so_desc(so),
            "so_qty": so_qty,
            "date_received": date_received,
            "due_date": due_date,
            "plan_start": date_received,                       # otomatis = tgl mulai kerja produksi
            "plan_finish": finished_at if (finished and finished_at) else "",  # otomatis saat qty release completed
            "days": days,
            "working_date_target": working_date_target,
            "actual_working_days": actual_working_days,        # dari Daily Production Report
            "actual_working_dates": awd,
            "productivity": productivity,
            "qty_finished": qty_finished,
            "qty_balance": max(0, so_qty - qty_finished),
            "percent": round(pct * 100, 1),
            "pic": jp.get("pic") or "",
            "remarks": jp.get("remarks") or "",
            "finished": finished,
            "finished_at": finished_at,
            "status": "FINISHED" if finished else "PROSES",
        })
    total = len(items)
    finished_count = sum(1 for i in items if i["finished"])
    return {"items": items, "count": total, "finished": finished_count, "in_progress": total - finished_count}


@router.put("/job-progress/{so_id}")
async def update_job_progress(so_id: str, payload: JobProgressIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    so = await db.sales_orders.find_one({"id": so_id, "deleted_at": {"$exists": False}})
    if not so:
        raise HTTPException(status_code=404, detail="SO tidak ditemukan")
    updates = {
        "so_id": so_id,
        "so_no": so.get("so_no") or "",
        "pic": (payload.pic or "").strip(),
        "remarks": (payload.remarks or "").strip(),
        "updated_at": _now_iso(),
    }
    await db.job_progress.update_one({"so_id": so_id}, {"$set": updates}, upsert=True)
    await log_action(current, "update_job_progress", "job_progress", so_id, {"so_no": updates["so_no"]})
    return {"ok": True}



# ==========================================================================
# Master Hari Libur Nasional (untuk perhitungan Working Date Target)
# ==========================================================================

class HolidayIn(BaseModel):
    date: str = ""       # YYYY-MM-DD
    name: str = ""


@router.get("/holidays")
async def list_holidays(year: Optional[str] = None, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    filt = {}
    if year:
        filt["date"] = {"$regex": f"^{year}"}
    rows = await db.holidays.find(filt, {"_id": 0}).to_list(length=5000)
    rows.sort(key=lambda r: r.get("date") or "")
    items = [{"id": r.get("id"), "date": r.get("date") or "", "name": r.get("name") or ""} for r in rows]
    return {"items": items, "count": len(items)}


@router.post("/holidays")
async def create_holiday(payload: HolidayIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa input")
    date = _date_only((payload.date or "").strip())
    if not date:
        raise HTTPException(status_code=400, detail="Tanggal wajib diisi")
    existing = await db.holidays.find_one({"date": date})
    if existing:
        await db.holidays.update_one({"date": date}, {"$set": {"name": (payload.name or "").strip()}})
        return {"id": existing.get("id"), "date": date, "name": (payload.name or "").strip()}
    doc = {
        "id": str(uuid.uuid4()),
        "date": date,
        "name": (payload.name or "").strip(),
        "created_at": _now_iso(),
    }
    await db.holidays.insert_one(doc)
    await log_action(current, "create_holiday", "holiday", doc["id"], {"date": date})
    return {"id": doc["id"], "date": date, "name": doc["name"]}


@router.delete("/holidays/{holiday_id}")
async def delete_holiday(holiday_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa menghapus")
    existing = await db.holidays.find_one({"id": holiday_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Hari libur tidak ditemukan")
    await db.holidays.delete_one({"id": holiday_id})
    await log_action(current, "delete_holiday", "holiday", holiday_id, {"date": existing.get("date")})
    return {"ok": True}



# ==========================================================================
# Absensi Kehadiran Produksi (employee master + attendance harian)
# ==========================================================================

# Status yang dianggap TIDAK bekerja (operator diblok di Daily Production)
ATTEND_BLOCKED = {"mc_sakit", "tidak_hadir"}
ATTEND_STATUSES = ["hadir", "terlambat", "ijin_keluar", "ijin_pulang", "night_shift", "mc_sakit", "tidak_hadir", "insitu"]


class EmployeeIn(BaseModel):
    name: str = ""
    designation: str = ""


class AttendanceEntry(BaseModel):
    employee_id: str = ""
    name: str = ""
    status: str = "hadir"
    out_time: str = ""
    plan_in_time: str = ""
    actual_in_time: str = ""
    home_time: str = ""
    insitu_location: str = ""
    insitu_start: str = ""
    insitu_est_finish: str = ""
    insitu_actual_finish: str = ""
    note: str = ""


class AttendanceBulk(BaseModel):
    date: str = ""
    entries: list[AttendanceEntry] = []


@router.get("/employees")
async def list_employees(current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    rows = await db.production_employees.find({"active": {"$ne": False}}, {"_id": 0}).to_list(length=5000)
    rows.sort(key=lambda r: (r.get("name") or "").lower())
    return {"items": [{"id": r.get("id"), "name": r.get("name") or "", "badge_no": r.get("badge_no") or "", "designation": r.get("designation") or ""} for r in rows]}


@router.post("/employees")
async def create_employee(payload: EmployeeIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa input")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama wajib diisi")
    existing = await db.production_employees.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}, "active": {"$ne": False}})
    if existing:
        return {"id": existing.get("id"), "name": existing.get("name")}
    doc = {"id": str(uuid.uuid4()), "name": name, "designation": (payload.designation or "").strip(), "active": True, "created_at": _now_iso()}
    await db.production_employees.insert_one(doc)
    return {"id": doc["id"], "name": name, "designation": doc["designation"]}


@router.put("/employees/{emp_id}")
async def update_employee(emp_id: str, payload: EmployeeIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama wajib diisi")
    existing = await db.production_employees.find_one({"id": emp_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan")
    await db.production_employees.update_one({"id": emp_id}, {"$set": {"name": name, "designation": (payload.designation or "").strip()}})
    # Sinkronkan nama di attendance agar konsisten
    await db.production_attendance.update_many({"employee_id": emp_id}, {"$set": {"name": name}})
    return {"id": emp_id, "name": name, "designation": (payload.designation or "").strip()}


@router.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa menghapus")
    await db.production_employees.update_one({"id": emp_id}, {"$set": {"active": False}})
    return {"ok": True}


def _serialize_att(a: dict) -> dict:
    return {
        "employee_id": a.get("employee_id") or "",
        "name": a.get("name") or "",
        "status": a.get("status") or "hadir",
        "out_time": a.get("out_time") or "",
        "plan_in_time": a.get("plan_in_time") or "",
        "actual_in_time": a.get("actual_in_time") or "",
        "home_time": a.get("home_time") or "",
        "insitu_location": a.get("insitu_location") or "",
        "insitu_start": a.get("insitu_start") or "",
        "insitu_est_finish": a.get("insitu_est_finish") or "",
        "insitu_actual_finish": a.get("insitu_actual_finish") or "",
        "note": a.get("note") or "",
    }


@router.get("/attendance/month")
async def attendance_month(month: Optional[str] = None, current: dict = Depends(get_current_user)):
    """Rekap absensi 1 bulan: karyawan x tanggal."""
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    import calendar as _cal
    m = month or datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        yy, mm = int(m[:4]), int(m[5:7])
        ndays = _cal.monthrange(yy, mm)[1]
    except Exception:
        yy = datetime.now(timezone.utc).year; mm = datetime.now(timezone.utc).month
        ndays = _cal.monthrange(yy, mm)[1]
        m = f"{yy:04d}-{mm:02d}"
    days = [f"{m}-{d:02d}" for d in range(1, ndays + 1)]
    emps = await db.production_employees.find({"active": {"$ne": False}}, {"_id": 0}).to_list(length=5000)
    emps.sort(key=lambda r: (r.get("name") or "").lower())
    att = await db.production_attendance.find({"date": {"$regex": f"^{m}"}}, {"_id": 0}).to_list(length=50000)
    records = {}
    for a in att:
        records.setdefault(a.get("employee_id"), {})[a.get("date")] = a.get("status") or "hadir"
    return {
        "month": m, "days": days,
        "employees": [{"id": e.get("id"), "name": e.get("name") or "", "designation": e.get("designation") or ""} for e in emps],
        "records": records, "statuses": ATTEND_STATUSES,
    }


@router.get("/attendance")
async def get_attendance(date: Optional[str] = None, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    d = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    emps = await db.production_employees.find({"active": {"$ne": False}}, {"_id": 0}).to_list(length=5000)
    emps.sort(key=lambda r: (r.get("name") or "").lower())
    att = await db.production_attendance.find({"date": d}, {"_id": 0}).to_list(length=5000)
    att_map = {a.get("employee_id"): a for a in att}
    items = []
    for e in emps:
        a = att_map.get(e.get("id"))
        base = {"designation": e.get("designation") or "", "badge_no": e.get("badge_no") or ""}
        if a:
            items.append({**_serialize_att(a), **base})
        else:
            items.append({**_serialize_att({}), "employee_id": e.get("id"), "name": e.get("name") or "", "status": "hadir", **base})
    return {"date": d, "items": items, "statuses": ATTEND_STATUSES}


@router.post("/attendance")
async def save_attendance(payload: AttendanceBulk, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa input")
    d = (payload.date or "").strip() or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for e in payload.entries:
        doc = {
            "date": d, "employee_id": e.employee_id, "name": (e.name or "").strip(),
            "status": e.status or "hadir",
            "out_time": e.out_time or "", "plan_in_time": e.plan_in_time or "", "actual_in_time": e.actual_in_time or "",
            "home_time": e.home_time or "",
            "insitu_location": e.insitu_location or "", "insitu_start": e.insitu_start or "",
            "insitu_est_finish": e.insitu_est_finish or "", "insitu_actual_finish": e.insitu_actual_finish or "",
            "note": e.note or "", "updated_at": _now_iso(),
        }
        await db.production_attendance.update_one({"date": d, "employee_id": e.employee_id}, {"$set": doc}, upsert=True)
    await log_action(current, "save_attendance", "attendance", d, {"count": len(payload.entries)})
    return {"ok": True, "count": len(payload.entries)}



# ==========================================================================
# Overtime Request + rekap OT bulanan
# ==========================================================================

class OvertimeIn(BaseModel):
    ot_date: str = ""
    ot_no: str = ""
    name: str = ""
    so_no: str = ""
    customer: str = ""
    ot_start: str = ""
    ot_end: str = ""
    ot_hours: Optional[float] = None   # isi manual jumlah jam lembur (opsional; override jam mulai/selesai)


class OvertimeRulesIn(BaseModel):
    weekday_start: str = "16:00"
    saturday_start: str = "15:00"
    holiday_work_start: str = "08:00"
    holiday_work_end: str = "16:00"
    holiday_break_hours: float = 1
    rounding: str = "floor"          # floor | half | round
    wd_first_mult: float = 1.5       # hari kerja/Sabtu jam ke-1
    wd_rest_mult: float = 2.0        # hari kerja/Sabtu jam ke-2 dst
    hol_normal_hours: int = 7        # Minggu/libur jam ke-1..N
    hol_normal_mult: float = 2.0
    hol_8th_mult: float = 3.0        # jam ke-(N+1)
    hol_extra_mult: float = 4.0      # jam berikutnya


# Aturan lembur default (dari referensi Gaji Trial.xlsx / Depnaker 6-hari kerja)
DEFAULT_OT_RULES = {
    "weekday_start": "16:00",
    "saturday_start": "15:00",
    "holiday_work_start": "08:00",
    "holiday_work_end": "16:00",
    "holiday_break_hours": 1,
    "rounding": "floor",
    "wd_first_mult": 1.5,
    "wd_rest_mult": 2.0,
    "hol_normal_hours": 7,
    "hol_normal_mult": 2.0,
    "hol_8th_mult": 3.0,
    "hol_extra_mult": 4.0,
}


async def _get_ot_rules() -> dict:
    doc = await db.production_overtime_rules.find_one({"_id": "default"}) or {}
    rules = {**DEFAULT_OT_RULES}
    for k in DEFAULT_OT_RULES:
        if doc.get(k) is not None:
            rules[k] = doc[k]
    return rules


def _time_to_min(t: str) -> int:
    try:
        h, m = [int(x) for x in (t or "").split(":")[:2]]
        return h * 60 + m
    except Exception:
        return 0


def _round_hours(mins: int, mode: str) -> float:
    """Bulatkan durasi menit menjadi jam sesuai mode."""
    if mins <= 0:
        return 0.0
    if mode == "half":            # kelipatan 0.5 jam (bulat ke bawah)
        return (mins // 30) * 0.5
    if mode == "round":           # bulat terdekat ke jam penuh
        return float(round(mins / 60.0))
    return float(mins // 60)      # floor: bulat ke bawah ke jam penuh


def _ot_day_type(ot_date: str, holidays: set) -> str:
    iso = _date_only(ot_date)
    try:
        wd = datetime.fromisoformat(iso).weekday()   # Sen=0 .. Sab=5, Min=6
    except Exception:
        wd = 0
    if iso in holidays or wd == 6:
        return "holiday"
    if wd == 5:
        return "saturday"
    return "weekday"


def _calc_overtime(ot_date: str, start: str, end: str, rules: dict, holidays: set, manual_hours=None) -> dict:
    """Hitung jam lembur + rincian pengali (1.5x/2x/3x/4x) + jam tertimbang.
    - manual_hours: jika diisi, dipakai langsung sbg jumlah jam lembur (spt entri manual di Excel).
    - Untuk Minggu/libur, jam istirahat otomatis dikurangi (mis. 08:00-16:00 = 8 jam - 1 = 7 jam)
      HANYA bila jam dihitung dari jam mulai/selesai (bukan input manual).
    """
    day_type = _ot_day_type(ot_date, holidays)
    manual = manual_hours is not None and str(manual_hours) != "" and float(manual_hours) > 0
    if manual:
        ot_hours = float(manual_hours)
        raw_hours = ot_hours
    else:
        mins = _time_to_min(end) - _time_to_min(start)
        if mins < 0:
            mins += 24 * 60  # lewat tengah malam
        raw_hours = round(mins / 60.0, 2)
        ot_hours = _round_hours(mins, rules.get("rounding") or "floor")
        if day_type == "holiday":
            ot_hours = max(0.0, ot_hours - float(rules.get("holiday_break_hours", 1) or 0))
    x15 = x2 = x3 = x4 = 0.0
    if day_type == "holiday":
        n = int(rules.get("hol_normal_hours", 7))
        x2 = min(ot_hours, float(n))
        rem = ot_hours - x2
        x3 = 1.0 if rem >= 1 else rem
        rem = max(0.0, rem - 1)
        x4 = rem
        weighted = (x2 * float(rules.get("hol_normal_mult", 2.0))
                    + x3 * float(rules.get("hol_8th_mult", 3.0))
                    + x4 * float(rules.get("hol_extra_mult", 4.0)))
    else:
        x15 = 1.0 if ot_hours >= 1 else ot_hours
        x2 = max(0.0, ot_hours - 1)
        weighted = (x15 * float(rules.get("wd_first_mult", 1.5))
                    + x2 * float(rules.get("wd_rest_mult", 2.0)))
    label = {"holiday": "Minggu/Libur", "saturday": "Sabtu", "weekday": "Hari Kerja"}[day_type]
    return {
        "day_type": day_type,
        "day_label": label,
        "raw_hours": round(raw_hours, 2),
        "ot_hours": round(ot_hours, 2),
        "manual": manual,
        "x15": round(x15, 2), "x2": round(x2, 2), "x3": round(x3, 2), "x4": round(x4, 2),
        "weighted_hours": round(weighted, 2),
    }


@router.get("/overtime-rules")
async def get_overtime_rules(current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    return {"rules": await _get_ot_rules()}


@router.put("/overtime-rules")
async def update_overtime_rules(payload: OvertimeRulesIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengubah master lembur")
    doc = {**payload.dict(), "_id": "default", "updated_at": _now_iso(),
           "updated_by": current.get("name") or current.get("username") or ""}
    await db.production_overtime_rules.update_one({"_id": "default"}, {"$set": doc}, upsert=True)
    await log_action(current, "update_overtime_rules", "overtime_rules", "default", {})
    return {"ok": True, "rules": await _get_ot_rules()}


@router.get("/overtime")
async def list_overtime(month: Optional[str] = None, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    m = month or datetime.now(timezone.utc).strftime("%Y-%m")
    rules = await _get_ot_rules()
    hol_docs = await db.holidays.find({}, {"_id": 0, "date": 1}).to_list(length=5000)
    holidays = {_date_only(h.get("date") or "") for h in hol_docs if h.get("date")}
    rows = await db.production_overtime.find({"ot_date": {"$regex": f"^{m}"}}, {"_id": 0}).to_list(length=50000)
    rows.sort(key=lambda r: (r.get("ot_date") or "", r.get("created_at") or ""), reverse=True)
    items, summary = [], {}
    for r in rows:
        calc = _calc_overtime(r.get("ot_date") or "", r.get("ot_start") or "", r.get("ot_end") or "", rules, holidays, r.get("ot_hours"))
        items.append({**{k: r.get(k) or "" for k in ["id", "ot_date", "ot_no", "name", "so_no", "customer", "ot_start", "ot_end"]},
                      "hours": calc["ot_hours"], **calc})
        nm = r.get("name") or "-"
        s = summary.setdefault(nm, {"name": nm, "total_hours": 0.0, "x15": 0.0, "x2": 0.0, "x3": 0.0, "x4": 0.0, "weighted_hours": 0.0})
        s["total_hours"] = round(s["total_hours"] + calc["ot_hours"], 2)
        s["x15"] = round(s["x15"] + calc["x15"], 2)
        s["x2"] = round(s["x2"] + calc["x2"], 2)
        s["x3"] = round(s["x3"] + calc["x3"], 2)
        s["x4"] = round(s["x4"] + calc["x4"], 2)
        s["weighted_hours"] = round(s["weighted_hours"] + calc["weighted_hours"], 2)
    summary_list = sorted(summary.values(), key=lambda x: -x["total_hours"])
    return {
        "month": m, "items": items, "summary": summary_list, "rules": rules,
        "total_hours": round(sum(s["total_hours"] for s in summary.values()), 2),
        "total_weighted": round(sum(s["weighted_hours"] for s in summary.values()), 2),
    }


@router.post("/overtime/preview")
async def preview_overtime(payload: OvertimeIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa mengakses")
    rules = await _get_ot_rules()
    hol_docs = await db.holidays.find({}, {"_id": 0, "date": 1}).to_list(length=5000)
    holidays = {_date_only(h.get("date") or "") for h in hol_docs if h.get("date")}
    return _calc_overtime(payload.ot_date or "", payload.ot_start or "", payload.ot_end or "", rules, holidays, payload.ot_hours)


@router.post("/overtime")
async def create_overtime(payload: OvertimeIn, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa input")
    od = _date_only((payload.ot_date or "").strip()) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    so_no = (payload.so_no or "").strip()
    customer = (payload.customer or "").strip()
    if so_no and not customer:
        so = await db.sales_orders.find_one({"so_no": so_no, "deleted_at": {"$exists": False}})
        if so:
            customer = so.get("customer") or ""
    ot_no = (payload.ot_no or "").strip()
    if not ot_no:
        seq = (await db.production_overtime.count_documents({})) + 1
        ot_no = f"OT-{datetime.now(timezone.utc).strftime('%Y%m')}-{seq:04d}"
    doc = {
        "id": str(uuid.uuid4()), "ot_date": od, "ot_no": ot_no, "name": (payload.name or "").strip(),
        "so_no": so_no, "customer": customer, "ot_start": (payload.ot_start or "").strip(),
        "ot_end": (payload.ot_end or "").strip(),
        "ot_hours": (float(payload.ot_hours) if (payload.ot_hours is not None and str(payload.ot_hours) != "") else None),
        "created_by_username": current.get("name") or current.get("username") or "",
        "created_at": _now_iso(),
    }
    await db.production_overtime.insert_one(doc)
    await log_action(current, "create_overtime", "overtime", doc["id"], {"name": doc["name"], "so_no": so_no})
    return {"ok": True, "id": doc["id"], "ot_no": ot_no}


@router.delete("/overtime/{ot_id}")
async def delete_overtime(ot_id: str, current: dict = Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(status_code=403, detail="Hanya Produksi/Admin yang bisa menghapus")
    await db.production_overtime.delete_one({"id": ot_id})
    return {"ok": True}

