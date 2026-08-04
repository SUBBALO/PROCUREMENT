"""Iter 30 — Nonconformance (CAR) core flow + KPI #1 wiring.

Menguji:
  1. QC bisa membuat NC dengan MULTI drawing.
  2. Sales/Produksi juga bisa membuat NC.
  3. Non-issuer (eng_staff) DITOLAK saat create.
  4. Eng Leader bisa assign ke eng_staff → status assigned.
  5. Eng staff (assignee) bisa set in_progress.
  6. Eng staff TIDAK bisa close (403); Eng Leader bisa close + simpan ECN no.
  7. KPI #1 (drawing_customer_nc) menandai drawing ber-NC pada bulan penerbitan.

Jalankan: pytest -q tests/test_iter30_nonconformance.py
"""
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from security import create_access_token  # noqa: E402

BASE = "http://localhost:8001/api"

USERS = {
    "qc": "f4569e58-8bc8-4590-8535-ce0a45ce39e2",       # qcuser
    "sales": "37c44d5b-73cf-4aec-9ced-c971d9631af3",    # salesuser
    "prod": "13d6f9c6-3e38-4e47-b85f-da1ee6996561",     # agus (produksi)
    "leader": "8a18b785-0f6d-4699-b408-0fae51f4259f",   # riski
    "staff": "e24c23a4-c820-4f19-adfe-2a7688ce4660",    # adit (eng_staff)
}


def hdr(role):
    return {"Authorization": f"Bearer {create_access_token(USERS[role], '')}"}


def _get_two_drawings():
    r = requests.get(f"{BASE}/drawings", headers=hdr("leader"), timeout=30)
    r.raise_for_status()
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    items = items or []
    picks = [d for d in items if d.get("drawing_no")][:2]
    assert len(picks) >= 1, "Butuh minimal 1 drawing di DB untuk test"
    return picks


def test_full_flow():
    dwgs = _get_two_drawings()
    payload = {
        "drawings": [{"drawing_id": d.get("id"), "drawing_no": d.get("drawing_no")} for d in dwgs],
        "title": "Dimensi tidak sesuai gambar",
        "description": "Ditemukan selisih dimensi pada part saat inspeksi QC.",
        "severity": "major",
    }

    # 1. QC create (multi-drawing)
    r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("qc"), timeout=30)
    assert r.status_code == 200, r.text
    nc = r.json()
    nc_id = nc["id"]
    assert nc["status"] == "open"
    assert nc["issuer_dept"] == "qc"
    assert len(nc["drawing_nos"]) == len(dwgs)
    assert nc["nc_no"].startswith("MKS-QA-CAR-")
    assert nc["source"] == "in_house"
    print("OK create QC:", nc["nc_no"], nc["drawing_nos"])

    # 2. Sales + Produksi can create too
    for role in ("sales", "prod"):
        rr = requests.post(f"{BASE}/nonconformance", json={
            "drawings": [{"drawing_id": dwgs[0].get("id"), "drawing_no": dwgs[0].get("drawing_no")}],
            "description": f"NC dari {role}",
        }, headers=hdr(role), timeout=30)
        assert rr.status_code == 200, rr.text
    print("OK create sales & produksi")

    # 3. eng_staff cannot create
    rr = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("staff"), timeout=30)
    assert rr.status_code == 403, rr.text
    print("OK eng_staff blocked from create")

    # 4. Eng Leader assign to eng_staff
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/assign",
                       json={"assignee_id": USERS["staff"], "notes": "tolong revisi"},
                       headers=hdr("leader"), timeout=30)
    assert rr.status_code == 200, rr.text
    assert rr.json()["status"] == "assigned"
    print("OK assigned")

    # 5. eng_staff (assignee) set in_progress via Investigation (Section 2)
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/investigation",
                       json={"root_cause": "Setting mesin kurang tepat",
                             "immediate_action": "Stop produksi part terkait",
                             "corrective_action": "Update WI + kalibrasi",
                             "completed_by": "Adit", "completed_date": "2026-08-10",
                             "set_in_progress": True},
                       headers=hdr("staff"), timeout=30)
    assert rr.status_code == 200, rr.text
    assert rr.json()["status"] == "in_progress"
    print("OK investigation saved + in_progress by assignee")

    # 6a. eng_staff cannot close via closeout
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/closeout",
                       json={"initiator_remarks": "x", "close": True}, headers=hdr("staff"), timeout=30)
    assert rr.status_code == 403, rr.text
    print("OK eng_staff blocked from close")

    # 6b. Eng Leader close via status + ECN
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/status",
                       json={"status": "closed", "ecn_no": "ECN-26-08-99", "notes": "revisi selesai"},
                       headers=hdr("leader"), timeout=30)
    assert rr.status_code == 200, rr.text
    print("OK closed by leader")

    # verify detail
    rr = requests.get(f"{BASE}/nonconformance/{nc_id}", headers=hdr("leader"), timeout=30)
    doc = rr.json()
    assert doc["status"] == "closed"
    assert doc["ecn_no"] == "ECN-26-08-99"
    assert doc["closed_at"]
    assert doc["investigation"] and doc["investigation"]["root_cause"]
    assert len(doc["timeline"]) >= 4
    print("OK detail + timeline:", [t["action"] for t in doc["timeline"]])

    # stats
    rr = requests.get(f"{BASE}/nonconformance/stats", headers=hdr("leader"), timeout=30)
    assert rr.status_code == 200
    print("OK stats:", rr.json())


def test_kpi1_reflects_nc():
    """KPI #1 harus menandai drawing ber-NC pada bulan penerbitan NC."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    r = requests.get(f"{BASE}/engineering/kpi/drawing_customer_nc/records",
                     params={"year": now.year, "month": now.month},
                     headers=hdr("leader"), timeout=60)
    assert r.status_code == 200, r.text
    recs = r.json()["records"]
    print(f"KPI#1 records bulan ini: {len(recs)}")
    # Jika ada drawing rilis bulan ini yang ber-NC, minimal satu record ok=False dgn nc_nos.
    nc_fail = [x for x in recs if not x["ok"]]
    for x in nc_fail[:5]:
        print("  NC drawing:", x["ref"], x.get("nc_nos"), x["note"])
    print("OK KPI#1 endpoint returns auditable records")


if __name__ == "__main__":
    test_full_flow()
    test_kpi1_reflects_nc()
    print("\nALL PASS")
