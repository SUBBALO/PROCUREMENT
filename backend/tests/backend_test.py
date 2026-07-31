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
    return _login("susanto", "admin123")


@pytest.fixture(scope="session")
def erwin():
    return _login("erwin", "erwin123")


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
        r = requests.post(f"{API}/auth/login", json={"username": "susanto", "password": "wrong"})
        assert r.status_code == 401

    def test_login_success_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"username": "susanto", "password": "admin123"})
        assert r.status_code == 200
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies
        d = r.json()
        assert d["username"] == "susanto"
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
        s = _login("susanto", "admin123")
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
        for u in ("susanto", "erwin", "staff01", "store01", "finance01"):
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


# ==================== ITERATION 3: Multi-currency, Bulk-delete, Incoming Goods, GRN ====================

def _tx_payload_curr(currency="IDR", rate=1.0, qty=2, unit_price=100.0):
    return {
        "invoice_date": "2025-02-10",
        "project_no": "TEST_ITER3",
        "po_no": f"TEST_PO_{uuid.uuid4().hex[:6]}",
        "vendor_name": "TEST_Vendor_Curr",
        "item_name": "TEST_Item_Curr",
        "qty": qty, "unit": "Ea",
        "unit_price": unit_price, "total_price": qty * unit_price,
        "currency": currency, "exchange_rate": rate,
        "invoice_no": f"TEST_INV_{uuid.uuid4().hex[:6]}",
    }


class TestMultiCurrency:
    def test_create_sgd_sets_total_price_idr(self, admin):
        p = _tx_payload_curr("SGD", 12000.0, qty=2, unit_price=100.0)  # total 200 SGD => 2_400_000 IDR
        r = admin.post(f"{API}/transactions", json=p)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["currency"] == "SGD"
        assert d["exchange_rate"] == 12000.0
        assert abs(d["total_price_idr"] - 2_400_000.0) < 1e-6
        # persist check
        g = admin.get(f"{API}/transactions/{d['id']}").json()
        assert abs(g["total_price_idr"] - 2_400_000.0) < 1e-6
        admin.delete(f"{API}/transactions/{d['id']}")

    def test_idr_defaults_rate_1(self, admin):
        p = _tx_payload_curr("IDR", 5.0, qty=3, unit_price=1000.0)  # rate should be forced to 1
        r = admin.post(f"{API}/transactions", json=p)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["currency"] == "IDR"
        assert d["exchange_rate"] == 1.0
        assert d["total_price_idr"] == 3000.0
        admin.delete(f"{API}/transactions/{d['id']}")

    def test_put_recomputes_total_price_idr(self, admin):
        p = _tx_payload_curr("USD", 16000.0, qty=1, unit_price=50.0)  # 800_000 IDR
        r = admin.post(f"{API}/transactions", json=p)
        assert r.status_code == 200
        tid = r.json()["id"]
        # update: change rate to 17000, qty to 2 -> total 100 USD -> 1_700_000
        cur = admin.get(f"{API}/transactions/{tid}").json()
        cur["qty"] = 2
        cur["total_price"] = 100.0
        cur["exchange_rate"] = 17000.0
        u = admin.put(f"{API}/transactions/{tid}", json=cur)
        assert u.status_code == 200, u.text
        g = admin.get(f"{API}/transactions/{tid}").json()
        assert abs(g["total_price_idr"] - 1_700_000.0) < 1e-6
        admin.delete(f"{API}/transactions/{tid}")

    def test_bulk_create_mixed_currency(self, admin):
        payload = {"transactions": [
            _tx_payload_curr("IDR", 1.0, qty=2, unit_price=1000.0),   # 2000
            _tx_payload_curr("SGD", 12000.0, qty=1, unit_price=10.0), # 10*12000 = 120000
            _tx_payload_curr("USD", 16000.0, qty=1, unit_price=5.0),  # 5*16000 = 80000
        ]}
        r = admin.post(f"{API}/transactions/bulk", json=payload)
        assert r.status_code == 200, r.text
        # locate them by project_no
        lst = admin.get(f"{API}/transactions", params={"q": "TEST_ITER3", "page_size": 200}).json()["items"]
        by_curr = {t["currency"]: t for t in lst if t["project_no"] == "TEST_ITER3"}
        # find those we just made (there may be prior fixtures — filter by exact totals)
        idrs = [t for t in lst if t["currency"] == "IDR" and t["total_price"] == 2000]
        sgds = [t for t in lst if t["currency"] == "SGD" and t["total_price"] == 10.0]
        usds = [t for t in lst if t["currency"] == "USD" and t["total_price"] == 5.0]
        assert idrs and abs(idrs[0]["total_price_idr"] - 2000) < 1e-6
        assert sgds and abs(sgds[0]["total_price_idr"] - 120000) < 1e-6
        assert usds and abs(usds[0]["total_price_idr"] - 80000) < 1e-6
        # cleanup
        for t in idrs + sgds + usds:
            admin.delete(f"{API}/transactions/{t['id']}")

    def test_seed_has_sgd_and_usd_with_idr_populated(self, admin):
        lst = admin.get(f"{API}/transactions", params={"page_size": 500}).json()["items"]
        sgd = [t for t in lst if t.get("currency") == "SGD"]
        usd = [t for t in lst if t.get("currency") == "USD"]
        assert len(sgd) >= 1, "Expected at least one SGD seeded transaction"
        assert len(usd) >= 1, "Expected at least one USD seeded transaction"
        for t in sgd + usd:
            assert t.get("total_price_idr", 0) > 0, f"total_price_idr should be populated for {t.get('po_no')}"
            # sanity: total_price_idr == total_price * exchange_rate
            expected = float(t["total_price"]) * float(t["exchange_rate"])
            assert abs(t["total_price_idr"] - expected) < 1e-3


class TestBulkDelete:
    def _seed(self, sess, n=3):
        ids = []
        for _ in range(n):
            r = sess.post(f"{API}/transactions", json=_tx_payload_curr("IDR"))
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        return ids

    def test_admin_bulk_delete(self, admin):
        ids = self._seed(admin, 3)
        r = admin.post(f"{API}/transactions/bulk-delete", json={"ids": ids})
        assert r.status_code == 200, r.text
        assert r.json()["deleted"] == 3
        # verify gone
        for tid in ids:
            g = admin.get(f"{API}/transactions/{tid}")
            assert g.status_code == 404

    def test_staff_bulk_delete_allowed(self, admin, staff):
        ids = self._seed(admin, 2)
        r = staff.post(f"{API}/transactions/bulk-delete", json={"ids": ids})
        assert r.status_code == 200, r.text
        assert r.json()["deleted"] == 2

    def test_finance_bulk_delete_403(self, admin, finance):
        ids = self._seed(admin, 1)
        r = finance.post(f"{API}/transactions/bulk-delete", json={"ids": ids})
        assert r.status_code == 403
        admin.post(f"{API}/transactions/bulk-delete", json={"ids": ids})

    def test_store_bulk_delete_403(self, admin, store):
        ids = self._seed(admin, 1)
        r = store.post(f"{API}/transactions/bulk-delete", json={"ids": ids})
        assert r.status_code == 403
        admin.post(f"{API}/transactions/bulk-delete", json={"ids": ids})

    def test_empty_ids_400(self, admin):
        r = admin.post(f"{API}/transactions/bulk-delete", json={"ids": []})
        assert r.status_code == 400


class TestImportForcesPostToStoreFalse:
    def test_import_xlsx_forces_post_to_store_false(self, admin):
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.append(["Tanggal Invoice", "Nama Barang", "Nama Toko", "Qty", "Unit Price", "Total Price", "Nomor Invoice"])
        inv_no = f"TEST_IMP_{uuid.uuid4().hex[:6]}"
        ws.append(["2025-03-01", "TEST_Import_Item", "TEST_Import_Vendor", 5, 100, 500, inv_no])
        buf = io.BytesIO(); wb.save(buf); buf.seek(0)
        files = {"file": ("test.xlsx", buf.getvalue(),
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        # remove content-type header for multipart
        s = requests.Session()
        s.cookies.update(admin.cookies)
        r = s.post(f"{API}/transactions/import/xlsx", files=files)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] >= 1
        # verify post_to_store=False
        lst = admin.get(f"{API}/transactions", params={"invoice_no": inv_no}).json()["items"]
        assert lst, "Imported row not found"
        for t in lst:
            assert t.get("post_to_store") is False, f"post_to_store should be False after import, got {t.get('post_to_store')}"
            admin.delete(f"{API}/transactions/{t['id']}")


class TestIncomingGoods:
    def _payload(self, add_flags=(True, False)):
        return {
            "receive_date": "2025-03-15",
            "source_type": "supplier",
            "source_name": "TEST_Supplier_IG",
            "do_no": f"TEST_DO_{uuid.uuid4().hex[:6]}",
            "po_no": "",
            "items": [
                {"item_name": "TEST_IG_Item_A", "qty": 10, "unit": "Ea",
                 "add_to_stock": add_flags[0], "unit_price": 5.0, "remark": "in-stock"},
                {"item_name": "TEST_IG_Item_B", "qty": 4, "unit": "Ea",
                 "add_to_stock": add_flags[1], "unit_price": 3.0, "remark": "habis-pakai"},
            ],
        }

    def test_admin_post_incoming_multi_item(self, admin):
        r = admin.post(f"{API}/store/incoming", json=self._payload())
        assert r.status_code == 200, r.text
        assert r.json()["received"] == 2
        # verify persisted with correct qty_remaining behavior
        rep = admin.get(f"{API}/store/incoming-report",
                        params={"source": "manual", "q": "TEST_IG"}).json()
        by_item = {i["item_name"]: i for i in rep["items"]}
        a = by_item.get("TEST_IG_Item_A")
        b = by_item.get("TEST_IG_Item_B")
        assert a and a["qty_remaining"] == 10.0 and a["add_to_stock"] is True
        assert b and b["qty_remaining"] == 0.0 and b["add_to_stock"] is False
        assert a["source"] == "manual" and b["source"] == "manual"

    def test_store_can_post_incoming(self, store):
        r = store.post(f"{API}/store/incoming", json=self._payload((True, True)))
        assert r.status_code == 200, r.text

    def test_finance_cannot_post_incoming(self, finance):
        r = finance.post(f"{API}/store/incoming", json=self._payload())
        assert r.status_code == 403

    def test_incoming_report_filter_by_source(self, admin):
        r_manual = admin.get(f"{API}/store/incoming-report", params={"source": "manual"})
        assert r_manual.status_code == 200
        for it in r_manual.json()["items"]:
            assert it.get("source") == "manual"
        r_po = admin.get(f"{API}/store/incoming-report", params={"source": "po"})
        assert r_po.status_code == 200
        for it in r_po.json()["items"]:
            assert it.get("source") == "po"

    def test_incoming_report_finance_access(self, finance):
        # store-access allows finance
        r = finance.get(f"{API}/store/incoming-report")
        assert r.status_code == 200


class TestGRNAutoUpdate:
    """POST /store/receive/bulk with invoice_no + receive_date updates source transaction."""

    def _seed_post_to_store_tx(self, admin):
        p = _tx_payload_curr("IDR")
        p["post_to_store"] = True
        p["qty"] = 10
        p["total_price"] = 10 * p["unit_price"]
        p["invoice_no"] = ""  # empty so we can watch it get filled
        r = admin.post(f"{API}/transactions", json=p)
        assert r.status_code == 200, r.text
        return r.json()

    def test_bulk_receive_updates_source_transaction(self, admin, store):
        tx = self._seed_post_to_store_tx(admin)
        new_inv = f"TEST_GRN_INV_{uuid.uuid4().hex[:6]}"
        new_date = "2025-04-01"
        payload = {
            "do_number": f"TEST_DO_{uuid.uuid4().hex[:6]}",
            "invoice_no": new_inv,
            "receive_date": new_date,
            "items": [{"transaction_id": tx["id"], "qty_received": 5, "add_to_stock": True}],
        }
        r = store.post(f"{API}/store/receive/bulk", json=payload)
        assert r.status_code == 200, r.text
        # verify source tx now has invoice_no + receive_date
        g = admin.get(f"{API}/transactions/{tx['id']}").json()
        assert g["invoice_no"] == new_inv
        assert g["receive_date"] == new_date
        admin.delete(f"{API}/transactions/{tx['id']}")

    def test_bulk_receive_add_to_stock_false_sets_qty_remaining_0(self, admin, store):
        tx = self._seed_post_to_store_tx(admin)
        payload = {
            "do_number": "DO_HABIS",
            "invoice_no": f"TEST_HABIS_{uuid.uuid4().hex[:6]}",
            "receive_date": "2025-04-02",
            "items": [{"transaction_id": tx["id"], "qty_received": 3, "add_to_stock": False}],
        }
        r = store.post(f"{API}/store/receive/bulk", json=payload)
        assert r.status_code == 200, r.text
        # find that receipt
        recs = admin.get(f"{API}/store/receipts", params={"transaction_id": tx["id"]}).json()
        assert recs and any(rec["qty_remaining"] == 0.0 and rec["add_to_stock"] is False for rec in recs), \
            f"Expected qty_remaining=0 & add_to_stock=False; got {recs}"
        admin.delete(f"{API}/transactions/{tx['id']}")


class TestAdminDirectToggleAddToStock:
    def test_toggle_off_and_on(self, admin, store):
        # create incoming (add_to_stock=True) and toggle it off/on
        payload = {
            "receive_date": "2025-04-10",
            "source_type": "supplier",
            "source_name": "TEST_Toggle_Sup",
            "items": [{"item_name": "TEST_Toggle_Item", "qty": 7, "add_to_stock": True, "unit_price": 1.0}],
        }
        r = admin.post(f"{API}/store/incoming", json=payload)
        assert r.status_code == 200
        # fetch receipt id
        rep = admin.get(f"{API}/store/incoming-report", params={"q": "TEST_Toggle_Item"}).json()
        rec = next(i for i in rep["items"] if i["item_name"] == "TEST_Toggle_Item")
        rid = rec["id"]
        assert rec["qty_remaining"] == 7.0

        # turn OFF
        r_off = admin.patch(f"{API}/store/receipts/{rid}/flags", json={"add_to_stock": False})
        assert r_off.status_code == 200, r_off.text
        rep2 = admin.get(f"{API}/store/incoming-report", params={"q": "TEST_Toggle_Item"}).json()
        r2 = next(i for i in rep2["items"] if i["id"] == rid)
        assert r2["qty_remaining"] == 0.0 and r2["add_to_stock"] is False

        # turn ON — restored to qty_received
        r_on = admin.patch(f"{API}/store/receipts/{rid}/flags", json={"add_to_stock": True})
        assert r_on.status_code == 200
        rep3 = admin.get(f"{API}/store/incoming-report", params={"q": "TEST_Toggle_Item"}).json()
        r3 = next(i for i in rep3["items"] if i["id"] == rid)
        assert r3["qty_remaining"] == 7.0 and r3["add_to_stock"] is True

    def test_toggle_off_blocked_after_consumption(self, admin, store):
        # create incoming with add_to_stock=True, issue some, then try to toggle off
        item = f"TEST_Consumed_{uuid.uuid4().hex[:6]}"
        payload = {
            "receive_date": "2025-04-11",
            "source_type": "supplier",
            "source_name": "TEST_Cons_Sup",
            "items": [{"item_name": item, "qty": 5, "add_to_stock": True, "unit_price": 2.0}],
        }
        r = admin.post(f"{API}/store/incoming", json=payload)
        assert r.status_code == 200
        # issue 2 out
        issue = {"items": [{"item_name": item, "qty": 2, "taker_name": "TEST_Taker",
                            "issue_date": "2025-04-12", "so_number": "TEST_SO"}]}
        ir = store.post(f"{API}/store/issue/bulk", json=issue)
        assert ir.status_code == 200, ir.text
        rep = admin.get(f"{API}/store/incoming-report", params={"q": item}).json()
        rec = next(i for i in rep["items"] if i["item_name"] == item)
        rid = rec["id"]
        # attempt to turn off
        r_off = admin.patch(f"{API}/store/receipts/{rid}/flags", json={"add_to_stock": False})
        assert r_off.status_code == 400, f"Expected 400 after consumption, got {r_off.status_code} {r_off.text}"


class TestErwinAdmin:
    def test_erwin_login(self, erwin):
        r = erwin.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == "erwin"
        assert d["role"] == "admin"



# ---------------- Cleanup transactions ----------------
class TestZCleanup:
    def test_cleanup_test_transactions(self, admin):
        r = admin.get(f"{API}/transactions", params={"q": "TEST_", "page_size": 200})
        for tx in r.json().get("items", []):
            if "TEST_" in (tx.get("item_name","") + tx.get("vendor_name","") + tx.get("invoice_no","")):
                admin.delete(f"{API}/transactions/{tx['id']}")
