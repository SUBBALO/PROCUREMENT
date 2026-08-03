"""Engineering KPI — laporan bulanan (format form resmi, mengikuti gaya KPI Purchasing).

Catatan: Form Excel Engineering TIDAK memakai kolom Bobot (semua KPI setara, target ≥95%).
SKOR KPI = Capaian Aktual (%). Total = rata-rata capaian KPI otomatis.

Semua angka dihitung dari data ERP nyata (auditable) — tiap KPI bisa ditelusur ke record aslinya.
Sumber data:
- drawings          : status='Issued' (drawing rilis), pdf_match_status (validasi MKS),
                      revision, revision_request (NC/reject), updated_at (tgl rilis).
- ecns (kind='ecn') : sumber REVISI drawing/BOM (drawing_no / bom_no yang direvisi).
- boms              : engineering_status='approved', rev_no.
- drawing_requests  : expected_due_date (jadwal) + linked_drawing_ids.
- inquiries         : completed_at vs customer_deadline (on-time costing).
"""
from __future__ import annotations

import calendar
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from deps import get_current_user, is_engineering, is_super_admin_user

router = APIRouter(tags=["engineering_kpi"])

TARGET_TEXT = "≥ 95%"

_KPI_VIEW_ROLES = {"admin", "super_admin", "supervisor", "director", "management"}


def _can_view_kpi(user: dict) -> bool:
    return is_engineering(user) or is_super_admin_user(user) or (user or {}).get("role") in _KPI_VIEW_ROLES


KPI_DEFS = [
    {"key": "drawing_customer_nc", "no": 1,
     "name_id": "Drawing compliance with standard requirements (internal & external)",
     "description": "No receive NC related drawing",
     "formula_num": "Number of Drawings Release Without Non-Conformity (NC)",
     "formula_den": "Total Drawings Release",
     "target": "100%", "weight": 20,
     "source": "drawings status='Issued' pada bulan tsb; tanpa NC = tidak ada field revision_request (reject customer/head)."},
    {"key": "drawing_no_revision", "no": 2,
     "name_id": "Drawing complies to customer requirements",
     "description": "Minimized Drawing Revision",
     "formula_num": "Number of Drawings Release Without Revision",
     "formula_den": "Total Drawings Release",
     "target": "≥ 95%", "weight": 15,
     "source": "drawings.revision (harus Rev-0) DAN drawing_no tidak ada di ecns(kind='ecn')."},
    {"key": "bom_no_revision", "no": 3,
     "name_id": "BOM compliance rate with project requirements",
     "description": "Minimized BOM Revision & Nesting Error",
     "formula_num": "Number of BOMs Release Without Revision",
     "formula_den": "Total BOMs Release",
     "target": "≥ 95%", "weight": 15,
     "source": "boms.engineering_status='approved', rev_no=0, DAN bom_no tidak ada di ecns(kind='ecn')."},
    {"key": "drawing_ontime", "no": 4,
     "name_id": "On Time Drawing completion against plan schedule",
     "description": "Minimized Drawing Lateness Issued",
     "formula_num": "Number of Drawings On Time (meet schedule)",
     "formula_den": "Total Drawings Release",
     "target": "≥ 95%", "weight": 25,
     "source": "Numerator = drawing rilis yang tgl selesainya ≤ drawing_requests.expected_due_date; Denominator = total drawing status='Issued' bulan tsb (drawing tanpa jadwal DRF tidak dihitung on-time)."},
    {"key": "costing_ontime", "no": 5,
     "name_id": "On Time Costing Completion against due date schedule",
     "description": "Minimized Costing Lateness Issued",
     "formula_num": "Number of Costings Release On Time",
     "formula_den": "Total Costings Completed",
     "target": "≥ 95%", "weight": 15,
     "source": "Numerator = inquiry selesai (completed_at) yang ≤ customer_deadline; Denominator = total inquiry selesai (completed_at) bulan tsb (tanpa deadline tidak dihitung on-time)."},
    {"key": "drawing_template_mks", "no": 6,
     "name_id": "Drawing complies with the standardized template",
     "description": "Drawing compliance with Standards template",
     "formula_num": "Number of Standard-Compliant Drawings",
     "formula_den": "Total Drawings Release",
     "target": "100%", "weight": 10,
     "source": "Numerator = drawing status='Issued' dgn pdf_match_status='verified' (lolos validasi MKS); Denominator = total drawing release bulan tsb."},
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
    if v >= 90:
        return "SANGAT BAIK"
    if v >= 80:
        return "BAIK"
    if v >= 71:
        return "CUKUP"
    return "PERLU PERBAIKAN"


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
            done = (_dwg_date(d) or "")[:10]
            if due:
                ok = done <= str(due)[:10]
                note = f"selesai {done} vs due {str(due)[:10]}"
            else:
                ok = False
                note = f"selesai {done} · tanpa jadwal DRF (tidak dihitung on-time)"
            out.append({"ref": d.get("drawing_no"), "ok": ok, "note": note, "date": done})
        return out

    if key == "costing_ontime":
        out = []
        for i in ctx["inquiries"]:
            comp = i.get("completed_at")
            if not comp or not _in_period(comp, ym):
                continue
            dl = i.get("customer_deadline")
            if dl:
                ok = str(comp)[:10] <= str(dl)[:10]
                note = f"selesai {str(comp)[:10]} vs deadline {str(dl)[:10]}"
            else:
                ok = False
                note = f"selesai {str(comp)[:10]} · tanpa deadline (tidak dihitung on-time)"
            out.append({"ref": i.get("inquiry_no"), "ok": ok, "note": note, "date": str(comp)[:10]})
        return out

    if key == "drawing_template_mks":
        return [{"ref": d.get("drawing_no"), "ok": d.get("pdf_match_status") == "verified",
                 "note": f"pdf_match_status={d.get('pdf_match_status') or '(kosong)'}", "date": (_dwg_date(d) or "")[:10]} for d in issued]

    return []


async def _compute_month(year: int, month: int) -> dict:
    ctx = await _load_ctx()
    ym = f"{year:04d}-{month:02d}"
    kpis = []
    total_score = 0.0
    total_weight = 0
    have_data = False
    for d in KPI_DEFS:
        recs = _kpi_records(ctx, d["key"], ym)
        den = len(recs)
        num = sum(1 for r in recs if r["ok"])
        ach = _pct(num, den)
        weight = d["weight"]
        score = round(ach * weight / 100, 2) if ach is not None else None
        if ach is not None:
            have_data = True
            total_score += score
            total_weight += weight
        kpis.append({
            **{k: d[k] for k in ("key", "no", "name_id", "description", "formula_num", "formula_den", "source", "target", "weight")},
            "numerator": num, "denominator": den,
            "achievement": ach,
            "score": score,
            "category": _category(ach),
        })
    total = round(total_score, 2) if have_data else None
    last_day = calendar.monthrange(year, month)[1]
    return {
        "year": year, "month": month,
        "period": {"start_date": f"{ym}-01", "end_date": f"{year:04d}-{month:02d}-{last_day:02d}"},
        "total_weight": sum(d["weight"] for d in KPI_DEFS),
        "kpis": kpis,
        "total_score": total,
        "category": _category(total),
    }


@router.get("/engineering/kpi")
async def get_kpi(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current: dict = Depends(get_current_user),
):
    if not _can_view_kpi(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Manajemen yang dapat melihat KPI.")
    return await _compute_month(year, month)


@router.get("/engineering/kpi/{key}/records")
async def get_kpi_records(
    key: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current: dict = Depends(get_current_user),
):
    if not _can_view_kpi(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Manajemen yang dapat melihat KPI.")
    meta = KPI_BY_KEY.get(key)
    if not meta:
        raise HTTPException(status_code=404, detail="KPI tidak ditemukan.")
    ctx = await _load_ctx()
    records = _kpi_records(ctx, key, f"{year:04d}-{month:02d}")
    return {"key": key, "name": meta["name_id"], "source": meta["source"],
            "year": year, "month": month, "records": records}
