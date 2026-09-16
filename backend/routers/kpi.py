"""Engineering KPI — laporan bulanan (format form resmi, mengikuti gaya KPI Purchasing).

Metodologi (sesuai form): tiap KPI punya BOBOT (Achievement Weight, total 100%).
SKOR KPI = Capaian Aktual (%) × Bobot / 100. TOTAL = Σ skor, dinormalisasi terhadap
bobot KPI yang punya data (agar bulan dengan data parsial tidak salah kategori).

Semua angka dihitung dari data ERP nyata (auditable) — tiap KPI bisa ditelusur ke record aslinya.
Sumber data:
- drawings          : status='Issued' (drawing rilis), pdf_match_status (validasi MKS),
                      revision, tanggal rilis = controlled_at (stamp DocCon; beku) → drawing_date → updated_at.
- ecns (kind='ecn') : sumber REVISI drawing/BOM — hanya ECN yang terbit ≤ akhir bulan pelaporan
                      (laporan bulan lama tidak berubah karena ECN baru).
- boms              : engineering_status='approved', rev_no.
- drawing_requests  : expected_due_date (jadwal) + linked_drawing_ids.
- inquiries         : completed_at vs customer_deadline (on-time costing).
"""
from __future__ import annotations

import calendar
from datetime import datetime, timezone
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
     "source": "drawings status='Issued' pada bulan tsb; drawing dianggap ber-NC bila ada Nonconformance (CAR) terbit (issued_at) di bulan laporan. Drawing rilis bulan sebelumnya yang kena NC bulan ini ikut masuk denominator sebagai gagal (NC dinilai pada bulan NC diterbitkan)."},
    {"key": "drawing_no_revision", "no": 2,
     "name_id": "Drawing complies to customer requirements",
     "description": "Minimized Drawing Revision",
     "formula_num": "Number of Drawings Release Without Revision",
     "formula_den": "Total Drawings Release",
     "target": "≥ 95%", "weight": 15,
     "source": "drawings.revision (harus Rev-0) DAN drawing_no tidak ada di ecns(kind='ecn') yang terbit ≤ akhir bulan pelaporan."},
    {"key": "bom_no_revision", "no": 3,
     "name_id": "BOM compliance rate with project requirements",
     "description": "Minimized BOM Revision & Nesting Error",
     "formula_num": "Number of BOMs Release Without Revision",
     "formula_den": "Total BOMs Release",
     "target": "≥ 95%", "weight": 15,
     "source": "boms.engineering_status='approved', rev_no=0, DAN bom_no tidak ada di ecns(kind='ecn') yang terbit ≤ akhir bulan pelaporan."},
    {"key": "drawing_ontime", "no": 4,
     "name_id": "On Time Drawing completion against plan schedule",
     "description": "Minimized Drawing Lateness Issued",
     "formula_num": "Number of Drawings On Time (meet schedule)",
     "formula_den": "Total Drawings Release",
     "target": "≥ 95%", "weight": 25,
     "source": "Numerator = drawing rilis yang tgl selesainya ≤ drawing_requests.expected_due_date; Denominator = total drawing status='Issued' bulan tsb. Drawing tanpa jadwal DRF dihitung TIDAK on-time (masuk denominator, gagal)."},
    {"key": "costing_ontime", "no": 5,
     "name_id": "On Time Costing Completion against due date schedule",
     "description": "Minimized Costing Lateness Issued",
     "formula_num": "Number of Costings Release On Time",
     "formula_den": "Total Costings Completed",
     "target": "≥ 95%", "weight": 15,
     "source": "Numerator = inquiry selesai (completed_at) yang ≤ customer_deadline; Denominator = total inquiry selesai (completed_at) bulan tsb. Inquiry tanpa deadline customer dihitung TIDAK on-time (masuk denominator, gagal) — pastikan Sales mengisi Customer Deadline."},
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
    ecn_docs = await db.ecns.find(
        {"kind": "ecn"},
        {"_id": 0, "drawing_no": 1, "bom_no": 1, "created_at": 1},
    ).to_list(length=None)
    # Nonconformance (CAR) — untuk KPI #1. Map: drawing_no → list {nc_no, ym, id, severity}.
    nc_by_dwg: dict = {}
    ncs = await db.nonconformances.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "nc_no": 1, "issued_at": 1, "drawing_nos": 1, "severity": 1},
    ).to_list(length=None)
    for nc in ncs:
        ym = str(nc.get("issued_at") or "")[:7]
        for dno in (nc.get("drawing_nos") or []):
            if not dno:
                continue
            nc_by_dwg.setdefault(dno, []).append({
                "nc_no": nc.get("nc_no"), "ym": ym, "id": nc.get("id"),
                "severity": nc.get("severity"), "issued_at": nc.get("issued_at"),
            })
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
            "ecn_docs": ecn_docs, "due_by_dwg": due_by_dwg,
            "nc_by_dwg": nc_by_dwg}


def _ecn_sets(ctx: dict, ym: str):
    """ECN yang terbit ≤ akhir bulan pelaporan (period-stable: ECN baru tidak
    mengubah laporan bulan lama). ECN tanpa tanggal ikut dihitung (konservatif)."""
    dwg, bom = set(), set()
    for e in ctx.get("ecn_docs", []):
        created = str(e.get("created_at") or "")[:7]
        if created and created > ym:
            continue
        if e.get("drawing_no"):
            dwg.add(e["drawing_no"])
        if e.get("bom_no"):
            bom.add(e["bom_no"])
    return dwg, bom


def _is_rev0(rev_val) -> bool:
    """Normalisasi nilai revisi: '', '0', '00', 'Rev-0', 'REV 0', 'rev.0' → revisi awal."""
    s = str(rev_val or "").strip().lower()
    for pref in ("rev", "revision"):
        if s.startswith(pref):
            s = s[len(pref):]
    s = s.strip(" .-_")
    return s in ("", "0", "00")


def _dwg_date(d):
    # Tanggal rilis BEKU: controlled_at (stamp DocCon) → drawing_date → updated_at → created_at.
    # (updated_at sengaja bukan prioritas — berubah tiap edit sehingga drawing bisa "pindah bulan".)
    return _date_of(d.get("controlled_at"), d.get("drawing_date"), d.get("updated_at"), d.get("created_at"))


def _bom_date(b):
    return _date_of(b.get("bom_date"), b.get("uploaded_at"), b.get("created_at"))


def _kpi_records(ctx: dict, key: str, ym: str) -> list:
    drawings = ctx["drawings"]
    issued = [d for d in drawings if str(d.get("status") or "").lower() == "issued" and _in_period(_dwg_date(d), ym)]
    ecn_dwg, ecn_bom = _ecn_sets(ctx, ym)

    if key == "drawing_customer_nc":
        # KPI #1: Drawing tanpa NC. Basis = record Nonconformance (CAR) yang
        # DITERBITKAN pada bulan tsb (issued_at bulan = ym) — sesuai kesepakatan
        # "dinilai pada bulan NC diterbitkan". Auditable via nc_no.
        # Drawing LAMA (rilis bulan sebelumnya) yang kena NC bulan ini juga ikut
        # menurunkan KPI bulan ini (masuk denominator sebagai gagal).
        nc_by_dwg = ctx.get("nc_by_dwg", {})
        out = []
        issued_nos = set()
        for d in issued:
            dno = d.get("drawing_no")
            issued_nos.add(dno)
            ncs_this_month = [n for n in nc_by_dwg.get(dno, []) if n.get("ym") == ym]
            has_nc = bool(ncs_this_month)
            if has_nc:
                nc_refs = ", ".join(n.get("nc_no") or "-" for n in ncs_this_month)
                note = f"Ada NC ({nc_refs})"
            else:
                note = "Tidak ada NC"
            out.append({
                "ref": dno, "ok": not has_nc, "note": note,
                "date": (_dwg_date(d) or "")[:10],
                "nc_ids": [n.get("id") for n in ncs_this_month],
                "nc_nos": [n.get("nc_no") for n in ncs_this_month],
            })
        # NC bulan ini untuk drawing yang TIDAK rilis bulan ini (rilis bulan lama)
        for dno, ncs in nc_by_dwg.items():
            if dno in issued_nos:
                continue
            ncs_this_month = [n for n in ncs if n.get("ym") == ym]
            if not ncs_this_month:
                continue
            nc_refs = ", ".join(n.get("nc_no") or "-" for n in ncs_this_month)
            out.append({
                "ref": dno, "ok": False,
                "note": f"Ada NC ({nc_refs}) — drawing rilis bulan sebelumnya",
                "date": (ncs_this_month[0].get("issued_at") or "")[:10],
                "nc_ids": [n.get("id") for n in ncs_this_month],
                "nc_nos": [n.get("nc_no") for n in ncs_this_month],
            })
        return out

    if key == "drawing_no_revision":
        out = []
        for d in issued:
            rev = str(d.get("revision") or "").strip()
            revised = (not _is_rev0(rev)) or (d.get("drawing_no") in ecn_dwg)
            out.append({"ref": d.get("drawing_no"), "ok": not revised,
                        "note": f"revision={rev or '-'}" + (" · ada ECN" if d.get("drawing_no") in ecn_dwg else ""),
                        "date": (_dwg_date(d) or "")[:10]})
        return out

    if key == "bom_no_revision":
        approved = [b for b in ctx["boms"] if str(b.get("engineering_status") or "").lower() == "approved" and _in_period(_bom_date(b), ym)]
        out = []
        for b in approved:
            revised = (int(b.get("rev_no") or 0) > 0) or (b.get("bom_no") in ecn_bom)
            out.append({"ref": b.get("bom_no"), "ok": not revised,
                        "note": f"rev_no={b.get('rev_no', 0)}" + (" · ada ECN" if b.get("bom_no") in ecn_bom else ""),
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
                note = f"selesai {done} · tanpa jadwal DRF → dihitung TIDAK on-time"
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
                note = f"selesai {str(comp)[:10]} · tanpa deadline customer → dihitung TIDAK on-time"
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
    total = round(total_score / total_weight * 100, 2) if (have_data and total_weight) else None
    last_day = calendar.monthrange(year, month)[1]
    return {
        "year": year, "month": month,
        "period": {"start_date": f"{ym}-01", "end_date": f"{year:04d}-{month:02d}-{last_day:02d}"},
        "total_weight": sum(d["weight"] for d in KPI_DEFS),
        "counted_weight": total_weight,  # bobot KPI yang punya data — dasar normalisasi Total
        "kpis": kpis,
        "total_score": total,
        "category": _category(total),
    }


@router.get("/engineering/kpi")
async def get_kpi(
    year: int = Query(None),
    month: int = Query(None, ge=1, le=12),
    current: dict = Depends(get_current_user),
):
    if not _can_view_kpi(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering/Manajemen yang dapat melihat KPI.")
    # Default ke periode berjalan bila year/month tidak dikirim.
    if not year or not month:
        _now = datetime.now(timezone.utc)
        year = year or _now.year
        month = month or _now.month
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
