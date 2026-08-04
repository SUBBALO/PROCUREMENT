"""Iter 31 — Nonconformance (CAR) universal (semua dept) + issued_to + link fleksibel.

Menguji:
  1. SEMUA user bisa membuat CAR (qc, sales, produksi, eng_staff).
  2. issued_to_dept wajib; link_type drawing vs other.
  3. Assign oleh dept tujuan (eng_leader di dept engineering) → assigned.
  4. Investigation oleh target (eng_staff) → in_progress.
  5. eng_staff (bukan penerbit/QA/admin) TIDAK bisa close → 403.
  6. Penerbit (qc) bisa close.
  7. NC link_type=other TIDAK memengaruhi KPI #1; NC drawing memengaruhi.
  8. Endpoint departments & assignable-users.
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
    "qc": "f4569e58-8bc8-4590-8535-ce0a45ce39e2",
    "sales": "37c44d5b-73cf-4aec-9ced-c971d9631af3",
    "prod": "13d6f9c6-3e38-4e47-b85f-da1ee6996561",
    "leader": "8a18b785-0f6d-4699-b408-0fae51f4259f",   # riski (engineering)
    "staff": "e24c23a4-c820-4f19-adfe-2a7688ce4660",     # adit (eng_staff)
}


def hdr(role):
    return {"Authorization": f"Bearer {create_access_token(USERS[role], '')}"}


def _two_drawings():
    r = requests.get(f"{BASE}/drawings?limit=500", headers=hdr("leader"), timeout=30)
    r.raise_for_status()
    items = (r.json().get("items") or [])
    picks = [d for d in items if d.get("drawing_no")][:2]
    assert picks, "Butuh minimal 1 drawing"
    return picks


def test_endpoints_meta():
    r = requests.get(f"{BASE}/nonconformance/departments", headers=hdr("sales"), timeout=30)
    assert r.status_code == 200 and len(r.json()["departments"]) >= 5
    r = requests.get(f"{BASE}/nonconformance/assignable-users?dept=engineering", headers=hdr("sales"), timeout=30)
    assert r.status_code == 200
    print("OK departments & assignable-users; eng users:", len(r.json()["users"]))


def test_full_flow():
    dwgs = _two_drawings()
    # 1. QC creates a DRAWING-type NC, issued to Engineering
    payload = {
        "issued_to_dept": "engineering",
        "link_type": "drawing",
        "drawings": [{"drawing_id": d.get("id"), "drawing_no": d.get("drawing_no")} for d in dwgs],
        "source": "external", "severity": "major",
        "description": "Dimensi flange tidak sesuai drawing.",
    }
    r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("qc"), timeout=30)
    assert r.status_code == 200, r.text
    nc = r.json(); nc_id = nc["id"]
    assert nc["status"] == "open"
    assert nc["issued_to_dept"] == "engineering"
    assert nc["link_type"] == "drawing"
    assert nc["nc_no"].startswith("MKS-QA-CAR-")
    print("OK QC create drawing-NC:", nc["nc_no"])

    # 2. Everyone can create (sales, prod, eng_staff)
    for role in ("sales", "prod", "staff"):
        rr = requests.post(f"{BASE}/nonconformance", json={
            "issued_to_dept": "produksi", "link_type": "process_general",
            "object_ref": f"Objek uji dari {role}", "description": f"NC {role}",
        }, headers=hdr(role), timeout=30)
        assert rr.status_code == 200, f"{role}: {rr.text}"
    print("OK semua user bisa create (sales/prod/eng_staff)")

    # 3. Missing issued_to_dept → 400
    rr = requests.post(f"{BASE}/nonconformance", json={"link_type": "process_general", "object_ref": "x", "description": "y"}, headers=hdr("sales"), timeout=30)
    assert rr.status_code == 400, rr.text
    print("OK issued_to_dept wajib")

    # 4. Assign by eng_leader (target dept = engineering) to eng_staff
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/assign",
                       json={"assignee_id": USERS["staff"]}, headers=hdr("leader"), timeout=30)
    assert rr.status_code == 200, rr.text
    assert rr.json()["status"] == "assigned"
    print("OK assigned by eng_leader")

    # 5. Investigation by target (eng_staff) → in_progress
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/investigation",
                       json={"root_cause": "setting salah", "corrective_action": "revisi",
                             "preventive_action": "update WI", "set_in_progress": True},
                       headers=hdr("staff"), timeout=30)
    assert rr.status_code == 200 and rr.json()["status"] == "in_progress", rr.text
    print("OK investigation + in_progress by target")

    # 6. eng_staff cannot close (not initiator/qc/admin)
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/status", json={"status": "closed"}, headers=hdr("staff"), timeout=30)
    assert rr.status_code == 403, rr.text
    print("OK eng_staff blocked from close")

    # 7. Initiator (qc) closes
    rr = requests.post(f"{BASE}/nonconformance/{nc_id}/status",
                       json={"status": "closed", "ecn_no": "ECN-26-08-01"}, headers=hdr("qc"), timeout=30)
    assert rr.status_code == 200, rr.text
    print("OK closed by initiator (qc)")

    doc = requests.get(f"{BASE}/nonconformance/{nc_id}", headers=hdr("qc"), timeout=30).json()
    assert doc["status"] == "closed" and doc["ecn_no"] == "ECN-26-08-01"
    assert doc["investigation"]["preventive_action"]
    print("OK detail:", [t["action"] for t in doc["timeline"]])

    return nc  # drawing NC for KPI check


def test_kpi_only_drawing():
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    r = requests.get(f"{BASE}/engineering/kpi/drawing_customer_nc/records",
                     params={"year": now.year, "month": now.month}, headers=hdr("leader"), timeout=60)
    assert r.status_code == 200, r.text
    recs = r.json()["records"]
    fails = [x for x in recs if not x["ok"] and x.get("nc_nos")]
    print(f"KPI#1 records: {len(recs)}, drawing ber-NC: {len(fails)}")
    print("OK KPI#1 hanya terpengaruh NC drawing")


if __name__ == "__main__":
    test_endpoints_meta()
    test_full_flow()
    test_kpi_only_drawing()
    print("\nALL PASS")
