"""Backend tests for iteration 4 review:
- Consumable Good Request module (list, create, mark-purchased, open-items)
- Quotation & Inquiry Excel export with start_date/end_date/status/q filters
- Sales stats with start_date/end_date
"""
import os
import io
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://supply-hub-159.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("susanto", "admin123")


@pytest.fixture(scope="module")
def store():
    return _login("khairul", "khairul123")


@pytest.fixture(scope="module")
def sales():
    return _login("riska", "riska123")


# ─────────── Consumable Good Request ───────────
class TestConsumableRequests:
    def test_list_returns_list(self, admin):
        r = admin.get(f"{API}/consumable-requests", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_open_items_endpoint(self, admin):
        r = admin.get(f"{API}/consumable-requests/open-items", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_then_get(self, store):
        payload = {
            "request_date": str(date.today()),
            "request_by": "TEST_iter4_khairul",
            "notes": "TEST_iter4 automated",
            "items": [
                {"description": "TEST_iter4 Sarung Tangan", "qty": 10, "unit": "PCS", "so": "SO-TEST", "remarks": "test"},
                {"description": "TEST_iter4 Masker", "qty": 20, "unit": "PCS"},
            ],
        }
        r = store.post(f"{API}/consumable-requests", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "open"
        assert len(doc["items"]) == 2
        assert all("id" in it for it in doc["items"])
        assert doc["request_by"] == "TEST_iter4_khairul"
        # Verify persistence
        lst = store.get(f"{API}/consumable-requests", timeout=30).json()
        assert any(x["id"] == doc["id"] for x in lst)
        # cache id + item ids for next tests
        pytest.iter4_req_id = doc["id"]
        pytest.iter4_item_ids = [it["id"] for it in doc["items"]]

    def test_mark_purchased_partial(self, admin):
        req_id = pytest.iter4_req_id
        item_id = pytest.iter4_item_ids[0]
        r = admin.post(
            f"{API}/consumable-requests/{req_id}/items/{item_id}/mark-purchased",
            json={
                "actual_item_name": "TEST_iter4 Sarung Tangan Karet L",
                "vendor_name": "TEST_iter4 Vendor A",
                "qty_bought": 10,
                "unit": "PCS",
                "po_no": "PO-TEST-4",
                "purchase_date": str(date.today()),
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "partial"
        marked = [it for it in doc["items"] if it["id"] == item_id][0]
        assert marked["purchased"] is True
        assert len(marked["purchases"]) == 1

    def test_mark_purchased_fulfilled(self, admin):
        req_id = pytest.iter4_req_id
        item_id = pytest.iter4_item_ids[1]
        r = admin.post(
            f"{API}/consumable-requests/{req_id}/items/{item_id}/mark-purchased",
            json={
                "actual_item_name": "TEST_iter4 Masker N95",
                "vendor_name": "TEST_iter4 Vendor B",
                "qty_bought": 20,
                "unit": "PCS",
                "po_no": "PO-TEST-5",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "fulfilled"

    def test_open_items_excludes_fulfilled(self, admin):
        # After fulfillment above, TEST_iter4 request items should be gone
        r = admin.get(f"{API}/consumable-requests/open-items", timeout=30)
        assert r.status_code == 200
        rows = r.json()
        req_id = pytest.iter4_req_id
        assert all(x["request_id"] != req_id for x in rows), "Fulfilled req items still appear in open-items"

    def test_mark_nonexistent_item_404(self, admin):
        req_id = pytest.iter4_req_id
        r = admin.post(
            f"{API}/consumable-requests/{req_id}/items/nonexistent-id/mark-purchased",
            json={"vendor_name": "x", "qty_bought": 1},
            timeout=30,
        )
        assert r.status_code == 404


# ─────────── Sales stats with date filters ───────────
class TestSalesStats:
    def test_stats_no_filter(self, sales):
        r = sales.get(f"{API}/sales/stats", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_stats_with_date_range(self, sales):
        # 2026-07 month range
        r = sales.get(f"{API}/sales/stats", params={"start_date": "2026-07-01", "end_date": "2026-07-31"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)


# ─────────── Excel exports ───────────
class TestExcelExports:
    def _assert_xlsx(self, r):
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "excel" in ct or "octet-stream" in ct, f"Unexpected content-type: {ct}"
        assert r.content[:2] == b"PK", "Response not a zip/xlsx"

    def test_quotations_export_no_filter(self, sales):
        r = sales.get(f"{API}/quotations/export/excel", timeout=60)
        self._assert_xlsx(r)

    def test_quotations_export_with_date_range(self, sales):
        r = sales.get(
            f"{API}/quotations/export/excel",
            params={"start_date": "2026-07-01", "end_date": "2026-07-31"},
            timeout=60,
        )
        self._assert_xlsx(r)

    def test_quotations_export_with_status_and_q(self, sales):
        r = sales.get(
            f"{API}/quotations/export/excel",
            params={"start_date": "2026-01-01", "end_date": "2026-12-31", "status": "on_bidding", "q": ""},
            timeout=60,
        )
        self._assert_xlsx(r)

    def test_inquiries_export_no_filter(self, sales):
        r = sales.get(f"{API}/inquiries/export/excel", timeout=60)
        self._assert_xlsx(r)

    def test_inquiries_export_with_date_range(self, sales):
        r = sales.get(
            f"{API}/inquiries/export/excel",
            params={"start_date": "2026-07-01", "end_date": "2026-07-31"},
            timeout=60,
        )
        self._assert_xlsx(r)
