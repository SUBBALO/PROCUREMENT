"""Engineering KPI — laporan bulanan yang dihitung dari data ERP nyata (auditable).

Setiap KPI mengembalikan: nilai, target, pembilang/penyebut, mode (auto/manual),
sumber data (audit trail), dan endpoint detail untuk menelusuri record aslinya.

Sumber data (agar jelas saat audit):
- drawings          : status='Issued' (drawing rilis), pdf_match_status (validasi MKS),
                      revision, revision_request (NC/reject), updated_at (tgl rilis).
- ecns (kind='ecn') : sumber REVISI drawing/BOM (drawing_no / bom_no yang direvisi).
- boms              : engineering_status='approved', rev_no.
- drawing_requests  : expected_due_date (jadwal rencana) + linked_drawing_ids.
- inquiries         : completed_at vs customer_deadline (on-time costing).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from deps import get_current_user, is_engineering

router = APIRouter(tags=["engineering_kpi"])

TARGET = 95.0  # target semua KPI (≥ 95%)


def _ym(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _date_of(*vals) -> Optional[str]:
    for v in vals:
        if v:
            return str(v)
    return None


def _in_period(iso: Optional[str], ym: str) -> bool:
    return bool(iso) and str(iso)[:7] == ym


def _pct(num: int, den: int):
    return round(num / den * 100, 1) if den else None


async def _compute(year: int, month: int) -> dict:
    ym = _ym(year, month)

    drawings = await db.drawings.find({}).to_list(length=None)
    boms = await db.boms.find({}).to_list(length=None)
    inquiries = await db.inquiries.find({}).to_list(length=None)
    drfs = await db.drawing_requests.find({}).to_list(length=None)

    # Set drawing_no / bom_no yang PERNAH direvisi (ECN, bukan ECR)
    ecn_dwg = set(x for x in await db.ecns.distinct("drawing_no", {"kind": "ecn"}) if x)
    ecn_bom = set(x for x in await db.ecns.distinct("bom_no", {"kind": "ecn"}) if x)

    # Map drawing_id -> expected_due_date (dari DRF)
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

    def dwg_date(d):
        return _date_of(d.get("updated_at"), d.get("drawing_date"), d.get("created_at"))

    # Drawing "rilis" pada periode = status Issued & tgl rilis di bulan tsb
    issued = [d for d in drawings if str(d.get("status") or "").lower() == "issued" and _in_period(dwg_date(d), ym)]

    kpis = []

    # ---- KPI 1: Drawing sesuai kebutuhan customer (tanpa NC) ----
    den1 = len(issued)
    recs1 = [{"ref": d.get("drawing_no"), "ok": not bool(d.get("revision_request")),
              "note": "Ada revision_request (NC/reject)" if d.get("revision_request") else "Tidak ada NC"} for d in issued]
    num1 = sum(1 for r in recs1 if r["ok"])
    kpis.append({
        "key": "drawing_customer_nc", "no": 1,
        "name": "Drawing sesuai kebutuhan customer (tanpa NC)",
        "mode": "auto", "target": TARGET, "unit": "%",
        "numerator": num1, "denominator": den1, "value": _pct(num1, den1),
        "source": "drawings status='Issued' pada bulan ini; NC = adanya field revision_request (reject customer/head).",
        "num_label": "Drawing tanpa NC", "den_label": "Total drawing rilis",
    })

    # ---- KPI 2: Drawing tanpa revisi (compliance standar) ----
    den2 = len(issued)
    recs2 = []
    for d in issued:
        rev = str(d.get("revision") or "").strip()
        revised = (rev not in ("", "Rev-0", "REV-0", "rev-0")) or (d.get("drawing_no") in ecn_dwg)
        recs2.append({"ref": d.get("drawing_no"), "ok": not revised,
                      "note": f"revision={rev or '-'}" + (" · ada ECN" if d.get("drawing_no") in ecn_dwg else "")})
    num2 = sum(1 for r in recs2 if r["ok"])
    kpis.append({
        "key": "drawing_no_revision", "no": 2,
        "name": "Drawing tanpa revisi (sesuai standar)",
        "mode": "auto", "target": TARGET, "unit": "%",
        "numerator": num2, "denominator": den2, "value": _pct(num2, den2),
        "source": "drawings.revision (harus Rev-0) DAN drawing_no tidak ada di ecns(kind='ecn').",
        "num_label": "Drawing tanpa revisi", "den_label": "Total drawing rilis",
    })

    # ---- KPI 3: BOM tanpa revisi (compliance project) ----
    def bom_date(b):
        return _date_of(b.get("bom_date"), b.get("uploaded_at"), b.get("created_at"))
    approved_bom = [b for b in boms if str(b.get("engineering_status") or "").lower() == "approved" and _in_period(bom_date(b), ym)]
    den3 = len(approved_bom)
    recs3 = []
    for b in approved_bom:
        revised = (int(b.get("rev_no") or 0) > 0) or (b.get("bom_no") in ecn_bom)
        recs3.append({"ref": b.get("bom_no"), "ok": not revised,
                      "note": f"rev_no={b.get('rev_no', 0)}" + (" · ada ECN" if b.get("bom_no") in ecn_bom else "")})
    num3 = sum(1 for r in recs3 if r["ok"])
    kpis.append({
        "key": "bom_no_revision", "no": 3,
        "name": "BOM tanpa revisi (sesuai project)",
        "mode": "auto", "target": TARGET, "unit": "%",
        "numerator": num3, "denominator": den3, "value": _pct(num3, den3),
        "source": "boms.engineering_status='approved', rev_no=0, DAN bom_no tidak ada di ecns(kind='ecn').",
        "num_label": "BOM tanpa revisi", "den_label": "Total BOM approved",
    })

    # ---- KPI 4: On-Time Drawing completion ----
    recs4 = []
    for d in issued:
        due = due_by_dwg.get(d.get("id"))
        if not due:
            continue
        done = (dwg_date(d) or "")[:10]
        ok = done <= str(due)[:10]
        recs4.append({"ref": d.get("drawing_no"), "ok": ok, "note": f"selesai {done} vs due {str(due)[:10]}"})
    den4 = len(recs4)
    num4 = sum(1 for r in recs4 if r["ok"])
    kpis.append({
        "key": "drawing_ontime", "no": 4,
        "name": "On-Time Drawing completion",
        "mode": "auto", "target": TARGET, "unit": "%",
        "numerator": num4, "denominator": den4, "value": _pct(num4, den4),
        "source": "Tgl rilis drawing vs drawing_requests.expected_due_date (hanya drawing yang punya jadwal DRF).",
        "num_label": "Drawing tepat waktu", "den_label": "Drawing ber-jadwal",
    })

    # ---- KPI 5: On-Time Costing completion ----
    recs5 = []
    for i in inquiries:
        comp = i.get("completed_at")
        dl = i.get("customer_deadline")
        if not comp or not _in_period(comp, ym) or not dl:
            continue
        ok = str(comp)[:10] <= str(dl)[:10]
        recs5.append({"ref": i.get("inquiry_no"), "ok": ok, "note": f"selesai {str(comp)[:10]} vs deadline {str(dl)[:10]}"})
    den5 = len(recs5)
    num5 = sum(1 for r in recs5 if r["ok"])
    kpis.append({
        "key": "costing_ontime", "no": 5,
        "name": "On-Time Costing completion",
        "mode": "auto", "target": TARGET, "unit": "%",
        "numerator": num5, "denominator": den5, "value": _pct(num5, den5),
        "source": "inquiries.completed_at vs customer_deadline (hanya inquiry yang selesai & punya deadline).",
        "num_label": "Costing tepat waktu", "den_label": "Costing ber-deadline",
    })

    # ---- KPI 6: Drawing sesuai template standar (validasi MKS) ----
    validated = [d for d in drawings if str(d.get("pdf_match_status") or "") in ("verified", "warning") and _in_period(dwg_date(d), ym)]
    recs6 = [{"ref": d.get("drawing_no"), "ok": d.get("pdf_match_status") == "verified",
              "note": f"pdf_match_status={d.get('pdf_match_status')}"} for d in validated]
    den6 = len(recs6)
    num6 = sum(1 for r in recs6 if r["ok"])
    kpis.append({
        "key": "drawing_template_mks", "no": 6,
        "name": "Drawing sesuai template standar (MKS)",
        "mode": "auto", "target": TARGET, "unit": "%",
        "numerator": num6, "denominator": den6, "value": _pct(num6, den6),
        "source": "drawings.pdf_match_status: 'verified' = lolos validasi MKS; 'warning' = tidak sesuai (legacy dikecualikan).",
        "num_label": "Lolos validasi MKS", "den_label": "Drawing tervalidasi",
    })

    # ---- KPI 7: Response time isu produksi (≤ 2 jam) — MANUAL ----
    kpis.append({
        "key": "response_time", "no": 7,
        "name": "Response time isu produksi (≤ 2 jam)",
        "mode": "manual", "target": TARGET, "unit": "%",
        "numerator": None, "denominator": None, "value": None,
        "source": "Belum ada sistem tiket/log isu produksi di ERP — input MANUAL oleh Eng Leader.",
        "num_label": "Respon ≤ 2 jam", "den_label": "Total isu",
    })

    auto_vals = [k["value"] for k in kpis if k["mode"] == "auto" and k["value"] is not None]
    overall = round(sum(auto_vals) / len(auto_vals), 1) if auto_vals else None

    if overall is None:
        cat = None
    elif overall >= 95:
        cat = "Excellent"
    elif overall >= 85:
        cat = "Good"
    elif overall >= 71:
        cat = "Fair"
    else:
        cat = "Poor"

    return {
        "year": year, "month": month, "period": ym,
        "target": TARGET,
        "overall_score": overall,
        "category": cat,
        "kpis": kpis,
    }


@router.get("/engineering/kpi")
async def get_kpi(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current: dict = Depends(get_current_user),
):
    if not is_engineering(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering yang dapat melihat KPI.")
    return await _compute(year, month)


@router.get("/engineering/kpi/{key}/records")
async def get_kpi_records(
    key: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current: dict = Depends(get_current_user),
):
    """Detail record penyusun sebuah KPI (untuk audit / telusur)."""
    if not is_engineering(current):
        raise HTTPException(status_code=403, detail="Hanya Engineering yang dapat melihat KPI.")
    data = await _compute(year, month)
    kpi = next((k for k in data["kpis"] if k["key"] == key), None)
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI tidak ditemukan.")
    # Hitung ulang records untuk key ini (disimpan sementara di _compute via closure tidak tersedia,
    # jadi kita hitung ringkas kembali dengan memanggil detail builder).
    records = await _records_for(key, year, month)
    return {"key": key, "name": kpi["name"], "source": kpi["source"], "records": records}


async def _records_for(key: str, year: int, month: int) -> list:
    ym = _ym(year, month)
    drawings = await db.drawings.find({}).to_list(length=None)

    def dwg_date(d):
        return _date_of(d.get("updated_at"), d.get("drawing_date"), d.get("created_at"))

    ecn_dwg = set(x for x in await db.ecns.distinct("drawing_no", {"kind": "ecn"}) if x)
    ecn_bom = set(x for x in await db.ecns.distinct("bom_no", {"kind": "ecn"}) if x)
    issued = [d for d in drawings if str(d.get("status") or "").lower() == "issued" and _in_period(dwg_date(d), ym)]

    if key == "drawing_customer_nc":
        return [{"ref": d.get("drawing_no"), "ok": not bool(d.get("revision_request")),
                 "note": "Ada revision_request (NC)" if d.get("revision_request") else "Tidak ada NC",
                 "date": (dwg_date(d) or "")[:10]} for d in issued]
    if key == "drawing_no_revision":
        out = []
        for d in issued:
            rev = str(d.get("revision") or "").strip()
            revised = (rev not in ("", "Rev-0", "REV-0", "rev-0")) or (d.get("drawing_no") in ecn_dwg)
            out.append({"ref": d.get("drawing_no"), "ok": not revised,
                        "note": f"revision={rev or '-'}" + (" · ada ECN" if d.get("drawing_no") in ecn_dwg else ""),
                        "date": (dwg_date(d) or "")[:10]})
        return out
    if key == "bom_no_revision":
        boms = await db.boms.find({}).to_list(length=None)
        def bom_date(b):
            return _date_of(b.get("bom_date"), b.get("uploaded_at"), b.get("created_at"))
        approved_bom = [b for b in boms if str(b.get("engineering_status") or "").lower() == "approved" and _in_period(bom_date(b), ym)]
        out = []
        for b in approved_bom:
            revised = (int(b.get("rev_no") or 0) > 0) or (b.get("bom_no") in ecn_bom)
            out.append({"ref": b.get("bom_no"), "ok": not revised,
                        "note": f"rev_no={b.get('rev_no', 0)}" + (" · ada ECN" if b.get("bom_no") in ecn_bom else ""),
                        "date": (bom_date(b) or "")[:10]})
        return out
    if key == "drawing_ontime":
        drfs = await db.drawing_requests.find({}).to_list(length=None)
        due_by_dwg = {}
        for r in drfs:
            due = r.get("expected_due_date")
            if not due:
                continue
            ids = list(r.get("linked_drawing_ids") or [])
            if r.get("linked_drawing_id"):
                ids.append(r.get("linked_drawing_id"))
            for did in ids:
                due_by_dwg[did] = due
        out = []
        for d in issued:
            due = due_by_dwg.get(d.get("id"))
            if not due:
                continue
            done = (dwg_date(d) or "")[:10]
            out.append({"ref": d.get("drawing_no"), "ok": done <= str(due)[:10],
                        "note": f"selesai {done} vs due {str(due)[:10]}", "date": done})
        return out
    if key == "costing_ontime":
        inquiries = await db.inquiries.find({}).to_list(length=None)
        out = []
        for i in inquiries:
            comp = i.get("completed_at")
            dl = i.get("customer_deadline")
            if not comp or not _in_period(comp, ym) or not dl:
                continue
            out.append({"ref": i.get("inquiry_no"), "ok": str(comp)[:10] <= str(dl)[:10],
                        "note": f"selesai {str(comp)[:10]} vs deadline {str(dl)[:10]}", "date": str(comp)[:10]})
        return out
    if key == "drawing_template_mks":
        validated = [d for d in drawings if str(d.get("pdf_match_status") or "") in ("verified", "warning") and _in_period(dwg_date(d), ym)]
        return [{"ref": d.get("drawing_no"), "ok": d.get("pdf_match_status") == "verified",
                 "note": f"pdf_match_status={d.get('pdf_match_status')}", "date": (dwg_date(d) or "")[:10]} for d in validated]
    return []
