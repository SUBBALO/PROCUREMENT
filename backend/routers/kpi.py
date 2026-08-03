"""Engineering KPI — laporan bulanan (format mengikuti Excel "KPI MKS ENG Rev.0").

Tabel per-tahun: tiap KPI punya nilai per bulan (Jan..Des) + Actual (rata-rata) + Skor + Kategori.
Semua angka dihitung dari data ERP nyata (auditable): setiap sel bulan bisa ditelusur ke record aslinya.

Sumber data:
- drawings          : status='Issued' (drawing rilis), pdf_match_status (validasi MKS),
                      revision, revision_request (NC/reject), updated_at (tgl rilis).
- ecns (kind='ecn') : sumber REVISI drawing/BOM (drawing_no / bom_no yang direvisi).
- boms              : engineering_status='approved', rev_no.
- drawing_requests  : expected_due_date (jadwal) + linked_drawing_ids.
- inquiries         : completed_at vs customer_deadline (on-time costing).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from deps import get_current_user, is_engineering, is_super_admin_user

router = APIRouter(tags=["engineering_kpi"])

TARGET = 95.0

_KPI_VIEW_ROLES = {"admin", "super_admin", "supervisor", "director", "management"}


def _can_view_kpi(user: dict) -> bool:
    return is_engineering(user) or is_super_admin_user(user) or (user or {}).get("role") in _KPI_VIEW_ROLES


# Metadata KPI (urutan & teks mengikuti form Excel yang teregister)
KPI_DEFS = [
    {"key": "drawing_customer_nc", "no": 1,
     "name": "Drawing complies to customer requirements",
     "name_id": "Drawing sesuai kebutuhan customer (tanpa NC)",
     "formula": "(Jumlah Drawing Release tanpa Non-Conformity / Total Drawing Release) × 100%",
     "mode": "auto", "cat": "E",
     "num_label": "tanpa NC", "den_label": "total drawing rilis",
     "source": "drawings status='Issued' pada bulan tsb; NC = adanya field revision_request (reject customer/head)."},
    {"key": "drawing_no_revision", "no": 2,
     "name": "Drawing compliance with standard requirements",
     "name_id": "Drawing tanpa revisi (sesuai standar internal & eksternal)",
     "formula": "(Jumlah Drawing Release tanpa Revisi / Total Drawing Release) × 100%",
     "mode": "auto", "cat": "E",
     "num_label": "tanpa revisi", "den_label": "total drawing rilis",
     "source": "drawings.revision (harus Rev-0) DAN drawing_no tidak ada di ecns(kind='ecn')."},
    {"key": "bom_no_revision", "no": 3,
     "name": "BOM compliance rate with project requirements",
     "name_id": "BOM tanpa revisi (sesuai project)",
     "formula": "(Jumlah BOM Release tanpa Revisi / Total BOM Release) × 100%",
     "mode": "auto", "cat": "E",
     "num_label": "tanpa revisi", "den_label": "total BOM approved",
     "source": "boms.engineering_status='approved', rev_no=0, DAN bom_no tidak ada di ecns(kind='ecn')."},
    {"key": "drawing_ontime", "no": 4,
     "name": "On Time Drawing completion against plan schedule",
     "name_id": "On-Time Drawing completion (sesuai jadwal)",
     "formula": "(Jumlah Drawing selesai tepat waktu / Total Drawing ber-jadwal) × 100%",
     "mode": "auto", "cat": "E",
     "num_label": "tepat waktu", "den_label": "drawing ber-jadwal",
     "source": "Tgl rilis drawing vs drawing_requests.expected_due_date (hanya drawing yang punya jadwal DRF)."},
    {"key": "costing_ontime", "no": 5,
     "name": "On Time Costing Completion against due date schedule",
     "name_id": "On-Time Costing completion (sesuai due date)",
     "formula": "(Jumlah Costing selesai tepat waktu / Total Costing ber-deadline) × 100%",
     "mode": "auto", "cat": "S",
     "num_label": "tepat waktu", "den_label": "costing ber-deadline",
     "source": "inquiries.completed_at vs customer_deadline (hanya inquiry selesai & punya deadline)."},
    {"key": "drawing_template_mks", "no": 6,
     "name": "Drawing complies with the standardized template",
     "name_id": "Drawing sesuai template standar (MKS)",
     "formula": "(Jumlah Drawing sesuai template MKS / Total Drawing tervalidasi) × 100%",
     "mode": "auto", "cat": "E",
     "num_label": "lolos MKS", "den_label": "drawing tervalidasi",
     "source": "drawings.pdf_match_status: 'verified'=lolos validasi MKS; 'warning'=tidak sesuai (legacy dikecualikan)."},
]
KPI_BY_KEY = {k["key"]: k for k in KPI_DEFS}


def _date_of(*vals) -> Optional[str]:
    for v in vals:
        if v:
            return str(v)
    return None


def _in_period(iso: Optional[str], ym: str) -> bool:
    return bool(iso) and str(iso)[:7] == ym


def _pct(num: int, den: int):
    return round(num / den * 100, 1) if den else None


def _category(v):
    if v is None:
        return None
    if v >= 95:
        return "Luar Biasa"
    if v >= 85:
        return "Baik"
    if v >= 71:
        return "Cukup"
    return "Kurang"


async def _load_ctx():
    drawings = await db.drawings.find({}).to_list(length=None)
    boms = await db.boms.find({}).to_list(length=None)
    inquiries = await db.inquiries.find({}).to_list(length=None)
    drfs = await db.drawing_requests.find({}).to_list(length=None)
    ecn_dwg = set(x for x in await db.ecns.distinct("drawing_no", {"kind": "ecn"}) if x)
    ecn_bom = set(x for x in await db.ecns.distinct("bom_no", {"kind": "ecn"}) if x)
    due_by_dwg: dict = {}
    for r in drfs:
        due = r.get("expected_due_date")
        if not due:
            continue
        ids = list(r.get("linked_drawing_ids") or [])
        if r.get("linked_drawing_id"):
            ids.append(r.get("linked_drawing_id"))
        for did in ids:
            due_by_dwg[did] = due
    return {"drawings": drawings, "boms": boms, "inquiries": inquiries,
            "ecn_dwg": ecn_dwg, "ecn_bom": ecn_bom, "due_by_dwg": due_by_dwg}


def _dwg_date(d):
    return _date_of(d.get("updated_at"), d.get("drawing_date"), d.get("created_at"))


def _bom_date(b):
    return _date_of(b.get("bom_date"), b.get("uploaded_at"), b.get("created_at"))


def _kpi_records(ctx: dict, key: str, ym: str) -> list:
    """Record penyusun sebuah KPI pada satu bulan (ym='YYYY-MM'). Sumber tunggal untuk
    nilai bulanan & audit. Setiap record: {ref, ok, note, date}."""
    drawings = ctx["drawings"]
    issued = [d for d in drawings if str(d.get("status") or "").lower() == "issued" and _in_period(_dwg_date(d), ym)]

    if key == "drawing_customer_nc":
        return [{"ref": d.get("drawing_no"), "ok": not bool(d.get("revision_request")),
                 "note": "Ada revision_request (NC)" if d.get("revision_request") else "Tidak ada NC",
                 "date": (_dwg_date(d) or "")[:10]} for d in issued]

    if key == "drawing_no_revision":
        out = []
        for d in issued:
            rev = str(d.get("revision") or "").strip()
            revised = (rev not in ("", "Rev-0", "REV-0", "rev-0")) or (d.get("drawing_no") in ctx["ecn_dwg"])
            out.append({"ref": d.get("drawing_no"), "ok": not revised,
                        "note": f"revision={rev or '-'}" + (" · ada ECN" if d.get("drawing_no") in ctx["ecn_dwg"] else ""),
                        "date": (_dwg_date(d) or "")[:10]})
        return out

    if key == "bom_no_revision":
        approved = [b for b in ctx["boms"] if str(b.get("engineering_status") or "").lower() == "approved" and _in_period(_bom_date(b), ym)]
        out = []
        for b in approved:
            revised = (int(b.get("rev_no") or 0) > 0) or (b.get("bom_no") in ctx["ecn_bom"])
            out.append({"ref": b.get("bom_no"), "ok": not revised,
                        "note": f"rev_no={b.get('rev_no', 0)}" + (" · ada ECN" if b.get("bom_no") in ctx["ecn_bom"] else ""),
                        "date": (_bom_date(b) or "")[:10]})
        return out

    if key == "drawing_ontime":
        out = []
        for d in issued:
            due = ctx["due_by_dwg"].get(d.get("id"))
            if not due:
                continue
            done = (_dwg_date(d) or "")[:10]
            out.append({"ref": d.get("drawing_no"), "ok": done <= str(due)[:10],
                        "note": f"selesai {done} vs due {str(due)[:10]}", "date": done})
        return out

    if key == "costing_ontime":
        out = []
        for i in ctx["inquiries"]:
            comp = i.get("completed_at")
            dl = i.get("customer_deadline")
            if not comp or not _in_period(comp, ym) or not dl:
                continue
            out.append({"ref": i.get("inquiry_no"), "ok": str(comp)[:10] <= str(dl)[:10],
                        "note": f"selesai {str(comp)[:10]} vs deadline {str(dl)[:10]}", "date": str(comp)[:10]})
        return out

    if key == "drawing_template_mks":
        validated = [d for d in drawings if str(d.get("pdf_match_status") or "") in ("verified", "warning") and _in_period(_dwg_date(d), ym)]
        return [{"ref": d.get("drawing_no"), "ok": d.get("pdf_match_status") == "verified",
                 "note": f"pdf_match_status={d.get('pdf_match_status')}", "date": (_dwg_date(d) or "")[:10]} for d in validated]

    return []  # response_time (manual) & unknown


def _month_metric(ctx: dict, key: str, year: int, month: int):
    if KPI_BY_KEY[key]["mode"] == "manual":
        return {"value": None, "num": None, "den": None}
    recs = _kpi_records(ctx, key, f"{year:04d}-{month:02d}")
    den = len(recs)
    num = sum(1 for r in recs if r["ok"])
    return {"value": _pct(num, den), "num": num, "den": den}


async def _compute_year(year: int) -> dict:
    ctx = await _load_ctx()
    kpis = []
    for d in KPI_DEFS:
        monthly = {}
        vals = []
        for m in range(1, 13):
            mm = _month_metric(ctx, d["key"], year, m)
            monthly[m] = mm
            if mm["value"] is not None:
                vals.append(mm["value"])
        actual = round(sum(vals) / len(vals), 1) if vals else None
        kpis.append({
            **{k: d[k] for k in ("key", "no", "name", "name_id", "formula", "mode", "cat", "num_label", "den_label", "source")},
            "target": TARGET, "unit": "%",
            "monthly": monthly,
            "actual": actual,
            "achieved": (actual is not None and actual >= TARGET),
            "category": _category(actual),
        })
    auto_actuals = [k["actual"] for k in kpis if k["mode"] == "auto" and k["actual"] is not None]
    overall = round(sum(auto_actuals) / len(auto_actuals), 1) if auto_actuals else None
    return {"year": year, "target": TARGET, "overall_score": overall,
            "overall_category": _category(overall), "kpis": kpis}


@router.get("/engineering/kpi")
async def get_kpi(
    year: int = Query(...),
    current: dict = Depends(get_current_user),
):
    if not _can_view_kpi(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Manajemen yang dapat melihat KPI.")
    return await _compute_year(year)


@router.get("/engineering/kpi/{key}/records")
async def get_kpi_records(
    key: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current: dict = Depends(get_current_user),
):
    """Detail record penyusun sebuah KPI pada bulan tertentu (untuk audit / telusur)."""
    if not _can_view_kpi(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Manajemen yang dapat melihat KPI.")
    meta = KPI_BY_KEY.get(key)
    if not meta:
        raise HTTPException(status_code=404, detail="KPI tidak ditemukan.")
    ctx = await _load_ctx()
    records = _kpi_records(ctx, key, f"{year:04d}-{month:02d}")
    return {"key": key, "name": meta["name_id"], "source": meta["source"],
            "year": year, "month": month, "records": records}
