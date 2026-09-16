"""QC Material Incoming Inspection (MII) tests — iteration 9."""
import os
import uuid
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": "susanto", "password": "admin123"})
    assert r.status_code == 200, f"login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def qc_user(admin_session):
    """Create a qc user if not present."""
    payload = {"username": "qc01", "password": "qc12345", "role": "qc", "name": "QC Inspector 01"}
    r = admin_session.post(f"{API}/users", json=payload)
    # accept created or duplicate
    if r.status_code not in (200, 201, 400, 409):
        pytest.skip(f"cannot create qc user: {r.status_code} {r.text}")
    return payload


@pytest.fixture(scope="module")
def qc_session(qc_user):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": qc_user["username"], "password": qc_user["password"]})
    if r.status_code != 200:
        pytest.skip(f"qc login failed: {r.text}")
    return s


# ---------------- Auto-create on manual incoming ----------------
class TestAutoCreateManual:
    def test_manual_incoming_nonstock_creates_qc(self, admin_session):
        do_no = f"TEST-DO-{uuid.uuid4().hex[:8]}"
        payload = {
            "source_type": "supplier",
            "source_name": "TEST_Supplier_A",
            "po_no": f"TEST-PO-{uuid.uuid4().hex[:6]}",
            "do_no": do_no,
            "receive_date": "2026-01-15",
            "items": [
                {"item_name": "Steel Plate 10mm", "qty": 5, "unit": "Ea",
                 "so_no": "SO-001", "add_to_stock": False, "remark": ""},
                {"item_name": "Bolt M8", "qty": 100, "unit": "Pcs",
                 "so_no": "SO-002", "add_to_stock": False, "remark": ""},
            ],
        }
        r = admin_session.post(f"{API}/store/incoming", json=payload)
        assert r.status_code == 200, r.text
        # list and find our QC inspection
        r2 = admin_session.get(f"{API}/qc/inspections", params={"q": do_no})
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert len(items) >= 1, "QC inspection was not auto-created"
        insp = items[0]
        assert insp["status"] == "pending"
        assert insp["do_no"] == do_no
        assert insp["source_type"] == "supplier"
        assert len(insp["items"]) == 2
        # QC fields empty by default
        for it in insp["items"]:
            assert it["batch_grade_heat"] == ""
            assert it["mill_cert_no"] == ""
            assert it["result"] == ""
            assert it["so_no"] in ("SO-001", "SO-002")
        pytest.qc_pending_id = insp["id"]

    def test_all_stock_does_not_create_qc(self, admin_session):
        do_no = f"TEST-DOSTK-{uuid.uuid4().hex[:8]}"
        payload = {
            "source_type": "supplier",
            "source_name": "TEST_Supplier_B",
            "po_no": "",
            "do_no": do_no,
            "receive_date": "2026-01-15",
            "items": [
                {"item_name": "Screw", "qty": 50, "unit": "Pcs",
                 "so_no": "", "add_to_stock": True, "remark": ""},
            ],
        }
        r = admin_session.post(f"{API}/store/incoming", json=payload)
        assert r.status_code == 200, r.text
        r2 = admin_session.get(f"{API}/qc/inspections", params={"q": do_no})
        assert r2.status_code == 200
        assert r2.json()["total"] == 0, "QC should not be created for all-stock receipts"


# ---------------- Save / Verify / Reopen ----------------
class TestQCLifecycle:
    def test_partial_save_keeps_pending(self, admin_session):
        insp_id = getattr(pytest, "qc_pending_id", None)
        if not insp_id:
            pytest.skip("no pending inspection from previous test")
        r = admin_session.get(f"{API}/qc/inspections/{insp_id}")
        doc = r.json()
        items = doc["items"]
        payload = {
            "items": [
                {"receipt_item_id": items[0]["receipt_item_id"],
                 "batch_grade_heat": "B1", "mill_cert_no": "MC1",
                 "dimension_spec": "10mm", "dimension_actual": "10.1mm",
                 "visual": "OK", "result": "ok", "remark": ""},
                # second left empty
            ],
        }
        r = admin_session.post(f"{API}/qc/inspections/{insp_id}/save", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"

    def test_full_save_transitions_inspected(self, admin_session):
        insp_id = getattr(pytest, "qc_pending_id", None)
        if not insp_id:
            pytest.skip()
        r = admin_session.get(f"{API}/qc/inspections/{insp_id}")
        items = r.json()["items"]
        payload = {
            "items": [
                {"receipt_item_id": items[0]["receipt_item_id"],
                 "batch_grade_heat": "B1", "mill_cert_no": "MC1",
                 "dimension_spec": "10mm", "dimension_actual": "10.1mm",
                 "visual": "OK", "result": "ok", "remark": "good"},
                {"receipt_item_id": items[1]["receipt_item_id"],
                 "batch_grade_heat": "B2", "mill_cert_no": "MC2",
                 "dimension_spec": "M8", "dimension_actual": "M8",
                 "visual": "Dent", "result": "ng", "remark": "damaged"},
            ],
            "inspection_date": "2026-01-16",
        }
        r = admin_session.post(f"{API}/qc/inspections/{insp_id}/save", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "inspected"
        assert data["inspector_name"]
        assert data["inspected_at"]

    def test_verify_only_inspected(self, admin_session):
        insp_id = getattr(pytest, "qc_pending_id", None)
        if not insp_id:
            pytest.skip()
        r = admin_session.post(f"{API}/qc/inspections/{insp_id}/verify")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "verified"
        assert r.json()["leader_name"]
        # re-verify should fail
        r2 = admin_session.post(f"{API}/qc/inspections/{insp_id}/verify")
        assert r2.status_code == 400

    def test_reopen_reverts_to_pending(self, admin_session):
        insp_id = getattr(pytest, "qc_pending_id", None)
        if not insp_id:
            pytest.skip()
        r = admin_session.post(f"{API}/qc/inspections/{insp_id}/reopen")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending"
        assert data.get("leader_name") in (None, "")

    def test_verify_pending_returns_400(self, admin_session):
        insp_id = getattr(pytest, "qc_pending_id", None)
        if not insp_id:
            pytest.skip()
        # after reopen, status=pending
        r = admin_session.post(f"{API}/qc/inspections/{insp_id}/verify")
        assert r.status_code == 400


# ---------------- PDF & Stats ----------------
class TestPDFAndStats:
    def test_pdf_download(self, admin_session):
        insp_id = getattr(pytest, "qc_pending_id", None)
        if not insp_id:
            pytest.skip()
        r = admin_session.get(f"{API}/qc/inspections/{insp_id}/pdf")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:8].startswith(b"%PDF-1."), f"not a pdf: {r.content[:20]}"
        assert len(r.content) > 10_000, f"PDF too small: {len(r.content)}"
        cd = r.headers.get("content-disposition", "")
        assert "filename=" in cd

    def test_stats(self, admin_session):
        r = admin_session.get(f"{API}/qc/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("pending", "inspected", "verified", "ng_items"):
            assert k in d
            assert isinstance(d[k], int)


# ---------------- Role restriction ----------------
class TestRoleRestriction:
    def test_qc_user_can_access_qc(self, qc_session):
        r = qc_session.get(f"{API}/qc/stats")
        assert r.status_code == 200

    def test_qc_user_forbidden_on_purchasing(self, qc_session):
        # try purchasing write endpoint
        r = qc_session.post(f"{API}/transactions", json={"vendor_name": "x", "items": []})
        assert r.status_code in (403, 422), f"expected 403/422, got {r.status_code}"
