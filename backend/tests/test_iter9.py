"""Iter-9 tests: approval pill pending-count endpoint + full request → review flow."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"


def _login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"login {username} failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("susanto", "admin123")


@pytest.fixture(scope="module")
def store():
    return _login("store01", "store123")


# ---------- pending-count RBAC ----------
class TestPendingCountRBAC:
    def test_admin_can_get(self, admin):
        r = admin.get(f"{API}/store/requests/pending-count")
        assert r.status_code == 200
        assert "count" in r.json()
        assert isinstance(r.json()["count"], int)

    def test_store_forbidden(self, store):
        r = store.get(f"{API}/store/requests/pending-count")
        assert r.status_code == 403

    def test_finance_forbidden(self):
        s = _login("finance01", "finance123")
        r = s.get(f"{API}/store/requests/pending-count")
        assert r.status_code == 403

    def test_unauth(self):
        r = requests.get(f"{API}/store/requests/pending-count")
        assert r.status_code == 401


# ---------- End-to-end approval flow ----------
class TestApprovalFlow:
    def test_create_receipt_request_and_review(self, admin, store):
        # Step 1: baseline
        r0 = admin.get(f"{API}/store/requests/pending-count").json()["count"]

        # Step 2: create manual receipt as store01
        rc = store.post(f"{API}/store/incoming", json={
            "receive_date": "2026-01-15",
            "source_type": "supplier",
            "source_name": "TEST_iter9_supplier",
            "do_no": f"TEST_DO_iter9_{__import__('uuid').uuid4().hex[:6]}",
            "po_no": "",
            "items": [{"item_name": "TEST_iter9_ItemA", "qty": 3, "unit": "Ea",
                       "add_to_stock": True, "unit_price": 100.0, "remark": "iter9"}],
        })
        assert rc.status_code == 200, f"incoming failed: {rc.status_code} {rc.text}"
        # Fetch receipt id via report
        rep = store.get(f"{API}/store/incoming-report", params={"q": "TEST_iter9_ItemA"}).json()
        rid = rep["items"][0]["id"]

        # Step 3: store submits delete request
        rr = store.post(f"{API}/store/requests", json={
            "target_type": "receipt",
            "target_id": rid,
            "action_type": "delete",
            "reason": "TEST_iter9 approval flow validation",
        })
        assert rr.status_code == 200, rr.text
        req = rr.json()
        assert req["status"] == "pending"
        req_id = req["id"]

        # Step 4: admin pending-count increments by 1
        r1 = admin.get(f"{API}/store/requests/pending-count").json()["count"]
        assert r1 == r0 + 1, f"expected {r0+1} got {r1}"

        # Step 5: admin lists pending
        listing = admin.get(f"{API}/store/requests", params={"status": "pending"})
        assert listing.status_code == 200
        assert any(x["id"] == req_id for x in listing.json())

        # Step 6: admin approves → receipt deleted + count decrements
        rev = admin.post(f"{API}/store/requests/{req_id}/review", json={"approve": True, "review_note": "TEST_ok"})
        assert rev.status_code == 200, rev.text

        r2 = admin.get(f"{API}/store/requests/pending-count").json()["count"]
        assert r2 == r0, f"expected {r0} got {r2}"

    def test_store_cannot_review(self, admin, store):
        # Create a request, then try to review as store
        items = store.get(f"{API}/master/items").json()
        import uuid as _u
        rc = store.post(f"{API}/store/incoming", json={
            "receive_date": "2026-01-15", "source_type": "supplier",
            "source_name": "TEST_iter9_rbac_supplier",
            "do_no": f"TEST_DO_iter9_rbac_{_u.uuid4().hex[:6]}",
            "po_no": "",
            "items": [{"item_name": "TEST_iter9_rbac_Item", "qty": 1, "unit": "Ea",
                       "add_to_stock": True, "unit_price": 100.0, "remark": "iter9_rbac"}],
        }).json()
        assert rc.get("received") == 1
        rep = store.get(f"{API}/store/incoming-report", params={"q": "TEST_iter9_rbac_Item"}).json()
        rid = rep["items"][0]["id"]
        rr = store.post(f"{API}/store/requests", json={
            "target_type": "receipt", "target_id": rid,
            "action_type": "delete", "reason": "TEST_iter9_rbac",
        }).json()
        # store attempts review
        r = store.post(f"{API}/store/requests/{rr['id']}/review", json={"approve": True})
        assert r.status_code == 403
        # cleanup: admin rejects
        admin.post(f"{API}/store/requests/{rr['id']}/review", json={"approve": False, "review_note": "cleanup"})
