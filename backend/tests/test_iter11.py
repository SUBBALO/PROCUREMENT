"""Iteration 11 — RBAC hardening: super-admin only user management."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://procurement-runner.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def susanto():
    return login("susanto", "admin123")


@pytest.fixture(scope="module")
def erwin():
    return login("erwin", "erwin123")


@pytest.fixture(scope="module")
def staff():
    return login("staff01", "staff123")


@pytest.fixture(scope="module")
def finance():
    return login("finance01", "finance123")


# ---------- AUTH_ME PAYLOAD ----------
class TestAuthMe:
    def test_susanto_is_super_admin(self, susanto):
        r = susanto.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("is_super_admin") is True

    def test_erwin_not_super_admin(self, erwin):
        r = erwin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("is_super_admin") is False

    def test_staff_not_super_admin(self, staff):
        r = staff.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("is_super_admin") is False

    def test_finance_not_super_admin(self, finance):
        r = finance.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("is_super_admin") is False

    def test_login_payload_has_super_admin_flag(self):
        r = requests.post(f"{API}/auth/login", json={"username": "susanto", "password": "admin123"})
        assert r.status_code == 200
        assert r.json().get("is_super_admin") is True
        r2 = requests.post(f"{API}/auth/login", json={"username": "erwin", "password": "erwin123"})
        assert r2.status_code == 200
        assert r2.json().get("is_super_admin") is False


# ---------- SUPER-ADMIN CAN MANAGE USERS ----------
class TestSuperAdminUserMgmt:
    created_id = None

    def test_susanto_list_users(self, susanto):
        r = susanto.get(f"{API}/users")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(u["username"] == "susanto" for u in data)

    def test_susanto_create_user(self, susanto):
        # cleanup first if exists
        r_list = susanto.get(f"{API}/users")
        for u in r_list.json():
            if u["username"] == "testx_iter11":
                susanto.delete(f"{API}/users/{u['id']}")
        payload = {
            "username": "testx_iter11",
            "password": "testxxx",
            "name": "Test X Iter11",
            "role": "staff",
            "perms": [],
        }
        r = susanto.post(f"{API}/users", json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["username"] == "testx_iter11"
        TestSuperAdminUserMgmt.created_id = data["id"]

    def test_susanto_update_user(self, susanto):
        uid = TestSuperAdminUserMgmt.created_id
        assert uid
        r = susanto.put(f"{API}/users/{uid}", json={"name": "Test X Updated"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Test X Updated"

    def test_susanto_delete_user(self, susanto):
        uid = TestSuperAdminUserMgmt.created_id
        assert uid
        r = susanto.delete(f"{API}/users/{uid}")
        assert r.status_code in (200, 204)


# ---------- NON-SUPER-ADMIN BLOCKED ----------
class TestErwinBlocked:
    def test_erwin_list_users_403(self, erwin):
        r = erwin.get(f"{API}/users")
        assert r.status_code == 403
        assert "SUSANTO" in r.json().get("detail", "").upper()

    def test_erwin_create_user_403(self, erwin):
        r = erwin.post(f"{API}/users",
                       json={"username": "hax", "password": "hax123", "name": "hax", "role": "staff"})
        assert r.status_code == 403

    def test_erwin_update_user_403(self, erwin, susanto):
        users = susanto.get(f"{API}/users").json()
        target = next(u for u in users if u["username"] == "staff01")
        r = erwin.put(f"{API}/users/{target['id']}", json={"name": "hacked"})
        assert r.status_code == 403

    def test_erwin_delete_user_403(self, erwin, susanto):
        users = susanto.get(f"{API}/users").json()
        target = next(u for u in users if u["username"] == "staff01")
        r = erwin.delete(f"{API}/users/{target['id']}")
        assert r.status_code == 403


# ---------- ERWIN CAN STILL DO OTHER ADMIN THINGS ----------
class TestErwinOtherAdminActions:
    def test_erwin_can_view_logs(self, erwin):
        r = erwin.get(f"{API}/logs")
        assert r.status_code == 200

    def test_erwin_can_post_transaction(self, erwin):
        payload = {
            "invoice_date": "2026-01-15",
            "vendor_name": "TEST Supplier Iter11",
            "item_name": "Test item",
            "qty": 1,
            "unit": "pcs",
            "unit_price": 10000,
            "total_price": 10000,
            "currency": "IDR",
            "exchange_rate": 1.0,
            "invoice_no": "INV-ITER11-001",
            "notes": "iter11 test",
        }
        r = erwin.post(f"{API}/transactions", json=payload)
        assert r.status_code in (200, 201), r.text

    def test_erwin_can_review_store_request(self, erwin):
        # Verify erwin passes RBAC on the review endpoint (not 403). A bogus id gives 404;
        # any 2xx/404 result means the guard let him through.
        r = erwin.post(f"{API}/store/requests/nonexistent-iter11/review",
                       json={"approve": True, "review_note": "iter11 rbac probe"})
        assert r.status_code != 403, f"Erwin should be allowed to approve, got: {r.status_code} {r.text}"
        assert r.status_code in (200, 400, 404)
