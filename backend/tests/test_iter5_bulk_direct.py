"""Backend tests for iteration 5 — Bulk Transaksi (bulk-direct) + Consumable Request linking.

Covers:
- POST /api/transactions/bulk-direct happy path (2 rows, tx + receipts + add_to_stock).
- Validation errors (400) for missing masuk_stok / qty<=0 / empty vendor / empty item.
- Consumable Request auto-link: mark-purchased triggered on save (open→partial→fulfilled).
- Auto unlink on DELETE /api/transactions/{id} (reverts request to open).
- Finance role blocked from bulk-direct (403).
"""
import os
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://supply-hub-159.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed {username}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("susanto", "admin123")


@pytest.fixture(scope="module")
def store():
    return _login("khairul", "khairul123")


@pytest.fixture(scope="module")
def finance():
    return _login("finance01", "finance123")


# ────────────────── Happy path: 2 rows, mixed masuk_stok ──────────────────
class TestBulkDirectHappy:
    @classmethod
    def setup_class(cls):
        cls.tx_ids = []

    def test_bulk_direct_two_rows(self, admin):
        payload = {"rows": [
            {
                "invoice_date": str(date.today()),
                "vendor_name": "TEST_iter5 Vendor A",
                "item_name": "TEST_iter5 Kabel NYA 2.5",
                "qty": 5, "unit": "Roll",
                "unit_price": 100000,
                "invoice_no": "INV-ITER5-1",
                "masuk_stok": True,
            },
            {
                "invoice_date": str(date.today()),
                "vendor_name": "TEST_iter5 Vendor B",
                "item_name": "TEST_iter5 Isolasi",
                "qty": 3, "unit": "Pcs",
                "unit_price": 5000,
                "invoice_no": "INV-ITER5-2",
                "masuk_stok": False,
            },
        ]}
        r = admin.post(f"{API}/transactions/bulk-direct", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["inserted"] == 2
        assert data["receipts"] == 2
        assert data["with_stock"] == 1
        assert len(data["tx_ids"]) == 2
        TestBulkDirectHappy.tx_ids = data["tx_ids"]

    def test_transactions_persisted(self, admin):
        for tx_id in TestBulkDirectHappy.tx_ids:
            r = admin.get(f"{API}/transactions/{tx_id}", timeout=30)
            assert r.status_code == 200, r.text
            tx = r.json()
            # tanggal terima == tanggal nota
            assert tx.get("receive_date") == tx.get("invoice_date")
            assert tx.get("source") == "bulk-direct"
            assert tx.get("post_to_store") is False

    def test_cleanup_delete(self, admin):
        # Delete created txs (also verifies unlink hook does not raise even w/o link)
        for tx_id in TestBulkDirectHappy.tx_ids:
            r = admin.delete(f"{API}/transactions/{tx_id}", timeout=30)
            assert r.status_code == 200


# ────────────────── Validation errors ──────────────────
class TestBulkDirectValidation:
    def _row_base(self):
        return {
            "invoice_date": str(date.today()),
            "vendor_name": "TEST_iter5 V",
            "item_name": "TEST_iter5 I",
            "qty": 1, "unit_price": 100, "masuk_stok": True,
        }

    def test_empty_rows(self, admin):
        r = admin.post(f"{API}/transactions/bulk-direct", json={"rows": []}, timeout=30)
        assert r.status_code == 400

    def test_missing_masuk_stok(self, admin):
        row = self._row_base()
        row.pop("masuk_stok")
        r = admin.post(f"{API}/transactions/bulk-direct", json={"rows": [row]}, timeout=30)
        assert r.status_code == 400

    def test_qty_zero(self, admin):
        row = self._row_base(); row["qty"] = 0
        r = admin.post(f"{API}/transactions/bulk-direct", json={"rows": [row]}, timeout=30)
        assert r.status_code == 400

    def test_qty_negative(self, admin):
        row = self._row_base(); row["qty"] = -1
        r = admin.post(f"{API}/transactions/bulk-direct", json={"rows": [row]}, timeout=30)
        assert r.status_code == 400

    def test_empty_vendor(self, admin):
        row = self._row_base(); row["vendor_name"] = "  "
        r = admin.post(f"{API}/transactions/bulk-direct", json={"rows": [row]}, timeout=30)
        assert r.status_code == 400

    def test_empty_item(self, admin):
        row = self._row_base(); row["item_name"] = ""
        r = admin.post(f"{API}/transactions/bulk-direct", json={"rows": [row]}, timeout=30)
        assert r.status_code == 400


# ────────────────── Consumable Request linking / unlinking ──────────────────
class TestConsumableRequestLink:
    @classmethod
    def setup_class(cls):
        cls.req_id = None
        cls.item_ids = []
        cls.tx_ids = []

    def test_seed_request(self, store):
        payload = {
            "request_date": str(date.today()),
            "request_by": "TEST_iter5_store",
            "notes": "TEST_iter5 linking",
            "items": [
                {"description": "TEST_iter5 Item A", "qty": 4, "unit": "Pcs", "so": "SO-ITER5"},
                {"description": "TEST_iter5 Item B", "qty": 2, "unit": "Pcs", "so": "SO-ITER5"},
            ],
        }
        r = store.post(f"{API}/consumable-requests", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        TestConsumableRequestLink.req_id = doc["id"]
        TestConsumableRequestLink.item_ids = [it["id"] for it in doc["items"]]
        assert doc["status"] == "open"

    def test_bulk_direct_links_partial(self, admin):
        # Buy only first item → status should transition open → partial
        payload = {"rows": [{
            "invoice_date": str(date.today()),
            "vendor_name": "TEST_iter5 Vendor Link",
            "item_name": "TEST_iter5 Item A actual",
            "qty": 4, "unit": "Pcs",
            "unit_price": 5000, "masuk_stok": True,
            "consumable_request_id": TestConsumableRequestLink.req_id,
            "consumable_request_item_id": TestConsumableRequestLink.item_ids[0],
        }]}
        r = admin.post(f"{API}/transactions/bulk-direct", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        TestConsumableRequestLink.tx_ids.append(data["tx_ids"][0])

        # Verify request transitioned to partial
        lst = admin.get(f"{API}/consumable-requests", timeout=30).json()
        req = next(x for x in lst if x["id"] == TestConsumableRequestLink.req_id)
        assert req["status"] == "partial", f"Expected partial, got {req['status']}"
        item_a = next(it for it in req["items"] if it["id"] == TestConsumableRequestLink.item_ids[0])
        assert item_a["purchased"] is True
        assert any(p.get("transaction_id") == TestConsumableRequestLink.tx_ids[0] for p in item_a["purchases"])

    def test_bulk_direct_links_fulfilled(self, admin):
        # Buy second item → fulfilled
        payload = {"rows": [{
            "invoice_date": str(date.today()),
            "vendor_name": "TEST_iter5 Vendor Link",
            "item_name": "TEST_iter5 Item B actual",
            "qty": 2, "unit": "Pcs",
            "unit_price": 3000, "masuk_stok": False,
            "consumable_request_id": TestConsumableRequestLink.req_id,
            "consumable_request_item_id": TestConsumableRequestLink.item_ids[1],
        }]}
        r = admin.post(f"{API}/transactions/bulk-direct", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        TestConsumableRequestLink.tx_ids.append(r.json()["tx_ids"][0])

        lst = admin.get(f"{API}/consumable-requests", timeout=30).json()
        req = next(x for x in lst if x["id"] == TestConsumableRequestLink.req_id)
        assert req["status"] == "fulfilled", f"Expected fulfilled, got {req['status']}"

    def test_delete_unlinks_first_tx(self, admin):
        # Delete tx for item A → request should revert to partial (item B still purchased)
        r = admin.delete(f"{API}/transactions/{TestConsumableRequestLink.tx_ids[0]}", timeout=30)
        assert r.status_code == 200
        lst = admin.get(f"{API}/consumable-requests", timeout=30).json()
        req = next(x for x in lst if x["id"] == TestConsumableRequestLink.req_id)
        assert req["status"] == "partial", f"Expected partial after unlink, got {req['status']}"
        item_a = next(it for it in req["items"] if it["id"] == TestConsumableRequestLink.item_ids[0])
        assert item_a["purchased"] is False

    def test_delete_unlinks_all(self, admin):
        # Delete tx for item B → back to open
        r = admin.delete(f"{API}/transactions/{TestConsumableRequestLink.tx_ids[1]}", timeout=30)
        assert r.status_code == 200
        lst = admin.get(f"{API}/consumable-requests", timeout=30).json()
        req = next(x for x in lst if x["id"] == TestConsumableRequestLink.req_id)
        assert req["status"] == "open", f"Expected open after unlinking all, got {req['status']}"


# ────────────────── Finance role forbidden ──────────────────
class TestFinanceForbidden:
    def test_finance_blocked_from_bulk_direct(self, finance):
        payload = {"rows": [{
            "invoice_date": str(date.today()),
            "vendor_name": "TEST_iter5 V", "item_name": "TEST_iter5 I",
            "qty": 1, "unit_price": 1, "masuk_stok": True,
        }]}
        r = finance.post(f"{API}/transactions/bulk-direct", json=payload, timeout=30)
        assert r.status_code in (401, 403), f"Finance should be forbidden, got {r.status_code}"
