"""Backend API tests for PROCUREMENT app (Indonesian).
Uses cookie-based JWT auth (HttpOnly). Covers auth, transactions, KPI, master,
users/admin, store role, finance role, sales-orders, deliveries.
"""
import os
import io
import uuid
from datetime import datetime, timedelta
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


def _login(username, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login {username} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="session")
def store():
    return _login("store01", "store123")


@pytest.fixture(scope="session")
def finance():
    return _login("finance01", "finance123")


@pytest.fixture(scope="session")
def staff():
    return _login("staff01", "staff123")


# ---------------- Auth ----------------
class TestAuth:
    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_login_success_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies
        d = r.json()
        assert d["username"] == "admin"
        assert d["role"] == "admin"

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_admin(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_store(self, store):
        r = store.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "store"

    def test_me_finance(self, finance):
        r = finance.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "finance"

    def test_logout_clears(self):
        s = _login("admin", "admin123")
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ---------------- Transactions ----------------
_created_tx = []

class TestTransactions:
    def test_list_seeded(self, admin):
        r = admin.get(f"{API}/transactions", params={"page_size": 100})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 8, f"Expected >=8 seeded transactions, got {d['total']}"
        # verify shape
        assert "items" in d and len(d["items"]) > 0
        first = d["items"][0]
        for k in ("vendor_name", "item_name", "qty", "unit_price", "total_price"):
            assert k in first

    def test_create_transaction(self, admin):
        payload = {
            "invoice_date": "2025-01-15",
            "project_no": "TEST_SO_001",
            "po_no": f"TEST_PO_{uuid.uuid4().hex[:6]}",
            "vendor_name": "TEST_Vendor_A",
            "item_name": "TEST_Item_Alpha",
            "qty": 10, "unit": "Ea",
            "unit_price": 1000, "total_price": 10000,
            "invoice_no": f"TEST_INV_{uuid.uuid4().hex[:6]}",
        }
        r = admin.post(f"{API}/transactions", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["item_name"] == "TEST_Item_Alpha"
        assert d["total_price"] == 10000
        _created_tx.append(d["id"])
        # verify persisted
        g = admin.get(f"{API}/transactions/{d['id']}")
        assert g.status_code == 200
        assert g.json()["vendor_name"] == "TEST_Vendor_A"

    def test_update_transaction(self, admin):
        assert _created_tx
        tid = _created_tx[0]
        # get current
        cur = admin.get(f"{API}/transactions/{tid}").json()
        cur["qty"] = 25
        cur["total_price"] = 25000
        r = admin.put(f"{API}/transactions/{tid}", json=cur)
        assert r.status_code == 200, r.text
        g = admin.get(f"{API}/transactions/{tid}")
        assert g.json()["qty"] == 25

    def test_master_vendors(self, admin):
        r = admin.get(f"{API}/master/vendors")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_master_items(self, admin):
        r = admin.get(f"{API}/master/items")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_summary(self, admin):
        r = admin.get(f"{API}/stats/summary", params={"year": 2025})
        assert r.status_code == 200
        d = r.json()
        assert "total_transactions" in d
        assert "monthly" in d
        assert "top_vendors" in d

    def test_kpi(self, admin):
        end = datetime.utcnow().date()
        start = end - timedelta(days=60)
        r = admin.get(f"{API}/kpi", params={"start_date": str(start), "end_date": str(end)})
        assert r.status_code == 200, r.text
        d = r.json()
        # KPI response should include scoring keys
        keys = set(d.keys()) if isinstance(d, dict) else set()
        # Look for typical KPI keys
        assert "kpis" in d and isinstance(d["kpis"], list) and len(d["kpis"]) >= 3
        names = [k["name"] for k in d["kpis"]]
        assert any("On Time" in n for n in names)
        assert "total_score" in d


# ---------------- Users / Admin ----------------
_created_users = []

class TestAdminUsers:
    def test_list_users(self, admin):
        r = admin.get(f"{API}/users")
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        usernames = [u["username"] for u in users]
        for u in ("admin", "staff01", "store01", "finance01"):
            assert u in usernames, f"seed user {u} missing"

    def test_create_and_toggle_user(self, admin):
        uname = f"testuser_{uuid.uuid4().hex[:6]}"
        payload = {"username": uname, "password": "testpass123",
                   "name": "Test User", "role": "staff", "active": True}
        r = admin.post(f"{API}/users", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        uid = d["id"]
        _created_users.append(uid)
        assert d["username"] == uname
        assert d["active"] is True

        # toggle active
        r2 = admin.put(f"{API}/users/{uid}", json={"active": False})
        assert r2.status_code == 200, r2.text
        # verify
        lst = admin.get(f"{API}/users").json()
        target = next(u for u in lst if u["id"] == uid)
        assert target["active"] is False

    def test_non_admin_cannot_list_users(self, staff):
        r = staff.get(f"{API}/users")
        assert r.status_code in (401, 403)

    def test_cleanup_created(self, admin):
        for uid in _created_users:
            admin.delete(f"{API}/users/{uid}")


# ---------------- Store role ----------------
class TestStoreRole:
    def test_store_stock_visible(self, store):
        r = store.get(f"{API}/store/stock")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)

    def test_store_pending_grouped(self, store):
        r = store.get(f"{API}/store/pending/grouped")
        assert r.status_code == 200
        d = r.json()
        # Expect some pending (6 seeded post_to_store=true)
        assert isinstance(d, (list, dict))

    def test_store_pending_list(self, store):
        r = store.get(f"{API}/store/pending")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # 6 seeded should appear
        assert len(items) >= 1

    def test_store_can_view_transactions(self, store):
        r = store.get(f"{API}/transactions")
        assert r.status_code == 200


# ---------------- Finance role ----------------
class TestFinanceRole:
    def test_finance_can_view_transactions(self, finance):
        r = finance.get(f"{API}/transactions")
        assert r.status_code == 200

    def test_finance_can_view_stats(self, finance):
        r = finance.get(f"{API}/stats/summary", params={"year": 2025})
        assert r.status_code == 200

    def test_finance_can_view_kpi(self, finance):
        end = datetime.utcnow().date()
        start = end - timedelta(days=60)
        r = finance.get(f"{API}/kpi", params={"start_date": str(start), "end_date": str(end)})
        assert r.status_code == 200

    def test_finance_cannot_post_transaction(self, finance):
        payload = {
            "invoice_date": "2025-01-15", "vendor_name": "X", "item_name": "Y",
            "qty": 1, "unit_price": 1, "total_price": 1,
            "invoice_no": "X", "project_no": "X", "po_no": "X",
        }
        r = finance.post(f"{API}/transactions", json=payload)
        assert r.status_code == 403, f"Expected 403, got {r.status_code} {r.text}"
        # message must specifically mention finance
        assert "Finance" in r.text, f"Expected finance-specific message, got {r.text}"


# ---------------- AuthZ (iteration 2 tightening) ----------------
def _tx_payload():
    return {
        "invoice_date": "2025-01-15",
        "project_no": "TEST_AUTHZ", "po_no": f"TEST_PO_{uuid.uuid4().hex[:6]}",
        "vendor_name": "TEST_V", "item_name": "TEST_I",
        "qty": 1, "unit": "Ea", "unit_price": 1, "total_price": 1,
        "invoice_no": f"TEST_INV_{uuid.uuid4().hex[:6]}",
    }


def _so_payload():
    return {"so_no": f"TEST_SO_{uuid.uuid4().hex[:6]}", "customer": "TEST_C",
            "so_date": "2025-01-15", "notes": "authz"}


def _delivery_payload():
    return {
        "delivery_date": "2025-01-20",
        "gate_pass_no": f"TEST_GP_{uuid.uuid4().hex[:6]}",
        "do_no": f"TEST_DO_{uuid.uuid4().hex[:6]}",
        "destination": "TEST_C", "driver_name": "TEST",
        "items": [{"item_name": "TEST_I", "qty": 1, "unit": "Ea"}], "remark": "authz",
    }


class TestAuthZTransactions:
    def test_store_cannot_post_transaction(self, store):
        r = store.post(f"{API}/transactions", json=_tx_payload())
        assert r.status_code == 403, f"Expected 403, got {r.status_code} {r.text}"
        assert "Store" in r.text

    def test_store_cannot_put_transaction(self, store, admin):
        # need an existing tx id
        lst = admin.get(f"{API}/transactions", params={"page_size": 1}).json()
        assert lst["items"], "No transactions to test PUT against"
        tid = lst["items"][0]["id"]
        r = store.put(f"{API}/transactions/{tid}", json=_tx_payload())
        assert r.status_code == 403

    def test_store_cannot_delete_transaction(self, store, admin):
        lst = admin.get(f"{API}/transactions", params={"page_size": 1}).json()
        tid = lst["items"][0]["id"]
        r = store.delete(f"{API}/transactions/{tid}")
        assert r.status_code == 403

    def test_staff_can_post_transaction(self, staff):
        r = staff.post(f"{API}/transactions", json=_tx_payload())
        assert r.status_code == 200, f"Staff should be allowed, got {r.status_code} {r.text}"
        tid = r.json()["id"]
        # cleanup
        d = staff.delete(f"{API}/transactions/{tid}")
        assert d.status_code == 200


class TestAuthZSalesOrders:
    def test_store_cannot_post_so(self, store):
        r = store.post(f"{API}/sales-orders", json=_so_payload())
        assert r.status_code == 403, f"Expected 403, got {r.status_code} {r.text}"
        assert "Store" in r.text

    def test_store_cannot_delete_so(self, store, admin):
        # create via admin, try delete via store
        created = admin.post(f"{API}/sales-orders", json=_so_payload()).json()
        sid = created["id"]
        r = store.delete(f"{API}/sales-orders/{sid}")
        assert r.status_code == 403
        # cleanup
        admin.delete(f"{API}/sales-orders/{sid}")

    def test_staff_can_post_so(self, staff):
        payload = _so_payload()
        r = staff.post(f"{API}/sales-orders", json=payload)
        assert r.status_code == 200, f"Staff should be allowed, got {r.status_code} {r.text}"
        sid = r.json()["id"]
        # staff should also be able to delete
        d = staff.delete(f"{API}/sales-orders/{sid}")
        assert d.status_code == 200

    def test_finance_cannot_post_so(self, finance):
        r = finance.post(f"{API}/sales-orders", json=_so_payload())
        assert r.status_code == 403
        assert "Finance" in r.text


class TestAuthZDeliveries:
    def test_store_can_post_delivery(self, store):
        r = store.post(f"{API}/deliveries", json=_delivery_payload())
        assert r.status_code in (200, 201), f"Store should be allowed to POST delivery, got {r.status_code} {r.text}"
        did = r.json()["id"]
        # store can delete too
        d = store.delete(f"{API}/deliveries/{did}")
        assert d.status_code == 200, f"Store should be allowed to DELETE delivery, got {d.status_code} {d.text}"

    def test_staff_cannot_delete_delivery(self, admin, staff):
        # admin creates, staff attempts delete
        created = admin.post(f"{API}/deliveries", json=_delivery_payload()).json()
        did = created["id"]
        r = staff.delete(f"{API}/deliveries/{did}")
        assert r.status_code == 403, f"Staff should NOT be allowed to DELETE delivery, got {r.status_code} {r.text}"
        # cleanup
        admin.delete(f"{API}/deliveries/{did}")

    def test_finance_cannot_post_delivery(self, finance):
        r = finance.post(f"{API}/deliveries", json=_delivery_payload())
        assert r.status_code == 403


# ---------------- Sales Orders ----------------
_created_so = []

class TestSalesOrders:
    def test_list_sales_orders(self, admin):
        r = admin.get(f"{API}/sales-orders")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) >= 4, f"Expected >=4 seeded SO, got {len(items)}"

    def test_create_so(self, admin):
        payload = {"so_no": f"TEST_SO_{uuid.uuid4().hex[:6]}",
                   "customer": "TEST_Cust",
                   "so_date": "2025-01-15",
                   "notes": "TEST"}
        r = admin.post(f"{API}/sales-orders", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        _created_so.append(d["id"])
        assert d["so_no"] == payload["so_no"]

    def test_update_so(self, admin):
        assert _created_so
        sid = _created_so[0]
        r = admin.put(f"{API}/sales-orders/{sid}",
                      json={"so_no": f"TEST_SO_{uuid.uuid4().hex[:6]}", "customer": "TEST_Cust_Upd", "so_date": "2025-01-16"})
        assert r.status_code == 200, r.text

    def test_delete_so(self, admin):
        for sid in _created_so:
            r = admin.delete(f"{API}/sales-orders/{sid}")
            assert r.status_code == 200


# ---------------- Deliveries ----------------
class TestDeliveries:
    def test_list_deliveries(self, admin):
        r = admin.get(f"{API}/deliveries")
        assert r.status_code == 200

    def test_create_delivery(self, admin):
        payload = {
            "delivery_date": "2025-01-20",
            "gate_pass_no": f"TEST_GP_{uuid.uuid4().hex[:6]}",
            "do_no": f"TEST_DO_{uuid.uuid4().hex[:6]}",
            "destination": "TEST_Cust",
            "driver_name": "TEST Driver",
            "items": [{"item_name": "TEST_Item", "qty": 5, "unit": "Ea"}],
            "remark": "TEST"
        }
        r = admin.post(f"{API}/deliveries", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["destination"] == "TEST_Cust"


# ---------------- Cleanup transactions ----------------
class TestZCleanup:
    def test_cleanup_test_transactions(self, admin):
        r = admin.get(f"{API}/transactions", params={"q": "TEST_", "page_size": 200})
        for tx in r.json().get("items", []):
            if "TEST_" in (tx.get("item_name","") + tx.get("vendor_name","") + tx.get("invoice_no","")):
                admin.delete(f"{API}/transactions/{tx['id']}")
