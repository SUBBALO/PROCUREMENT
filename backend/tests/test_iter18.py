"""Iteration 18 backend tests — draft submit fix, customers CRUD, backup admin-only."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"


def _login(u, p):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=20)
    assert r.status_code == 200, f"login {u}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def sales(): return _login("sales01", "sales123")


@pytest.fixture(scope="module")
def admin(): return _login("susanto", "admin123")


@pytest.fixture(scope="module")
def eng(): return _login("engineer01", "eng123")


# ============ Inquiry draft → submit flow (primary bug) ============
class TestDraftSubmit:
    def test_sales_create_draft_and_submit(self, sales):
        r = sales.post(f"{API}/inquiries", json={
            "title": "TEST_iter18 draft submit", "customer_name": "TEST_iter18 Cust",
            "description": "d", "items": [{"item_name": "Item A", "qty": 2, "unit": "Ea"}],
            "save_as_draft": True,
        })
        assert r.status_code == 200, r.text
        inq = r.json()
        assert inq["status"] == "draft"
        iid = inq["id"]

        r2 = sales.post(f"{API}/inquiries/{iid}/submit")
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "submitted"

        r3 = sales.get(f"{API}/inquiries/{iid}")
        assert r3.status_code == 200
        assert r3.json()["status"] == "submitted"

    def test_submit_non_draft_fails(self, sales):
        r = sales.post(f"{API}/inquiries", json={
            "title": "TEST_iter18 no-resubmit", "customer_name": "X", "save_as_draft": True,
        })
        iid = r.json()["id"]
        sales.post(f"{API}/inquiries/{iid}/submit")
        r2 = sales.post(f"{API}/inquiries/{iid}/submit")
        assert r2.status_code == 400

    def test_admin_can_submit_others_draft(self, sales, admin):
        r = sales.post(f"{API}/inquiries", json={
            "title": "TEST_iter18 admin-submits", "customer_name": "Y", "save_as_draft": True,
        })
        iid = r.json()["id"]
        r2 = admin.post(f"{API}/inquiries/{iid}/submit")
        assert r2.status_code == 200
        assert r2.json()["status"] == "submitted"


# ============ Customers CRUD ============
class TestCustomers:
    def test_list_ok(self, sales):
        r = sales.get(f"{API}/customers")
        assert r.status_code == 200
        assert "items" in r.json()

    def test_crud_flow(self, sales):
        name = "TEST_iter18 Customer AAA"
        r = sales.post(f"{API}/customers", json={"name": name, "pic": "PIC1"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["name"] == name

        r2 = sales.post(f"{API}/customers", json={"name": name})
        assert r2.status_code == 400

        r3 = sales.put(f"{API}/customers/{cid}", json={"pic": "PIC2"})
        assert r3.status_code == 200
        assert r3.json()["pic"] == "PIC2"

        r4 = sales.get(f"{API}/customers", params={"q": name})
        assert any(c["id"] == cid and c["pic"] == "PIC2" for c in r4.json()["items"])

        r5 = sales.delete(f"{API}/customers/{cid}")
        assert r5.status_code == 200
        r6 = sales.delete(f"{API}/customers/{cid}")
        assert r6.status_code == 404

    def test_engineer_cannot_create(self, eng):
        r = eng.post(f"{API}/customers", json={"name": "TEST_iter18 blocked"})
        assert r.status_code == 403

    def test_name_required(self, sales):
        r = sales.post(f"{API}/customers", json={"name": ""})
        assert r.status_code == 400


# ============ Backup admin-only ============
class TestBackup:
    def test_summary_admin(self, admin):
        r = admin.get(f"{API}/admin/backup/summary")
        assert r.status_code == 200, r.text
        j = r.json()
        assert "collections" in j and "total_documents" in j
        assert j["collections"].get("inquiries", -1) >= 0

    def test_summary_forbidden_sales(self, sales):
        r = sales.get(f"{API}/admin/backup/summary")
        assert r.status_code == 403

    def test_export_admin(self, admin):
        r = admin.get(f"{API}/admin/backup/export")
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        payload = r.json()
        assert "collections" in payload and "inquiries" in payload["collections"]

    def test_export_forbidden_sales(self, sales):
        r = sales.get(f"{API}/admin/backup/export")
        assert r.status_code == 403


# ============ Engineer role gating ============
class TestEngineerGating:
    def test_engineer_cannot_create_inquiry(self, eng):
        r = eng.post(f"{API}/inquiries", json={
            "title": "eng-blocked", "customer_name": "X", "save_as_draft": True,
        })
        assert r.status_code == 403

    def test_engineer_list_excludes_drafts(self, sales, eng):
        r = sales.post(f"{API}/inquiries", json={
            "title": "TEST_iter18 eng-list-check", "customer_name": "Z", "save_as_draft": True,
        })
        iid = r.json()["id"]
        r2 = eng.get(f"{API}/inquiries")
        assert r2.status_code == 200
        assert not any(i["id"] == iid for i in r2.json()["items"])
