"""Iter6 - Tarik DO Belum PO flow.
Tests:
- GET /api/store/receipts/pending-po (filters, exclusion of already-linked)
- POST /api/transactions single with linked_receipt_id closes the receipt
- POST /api/transactions/bulk with per-item linked_receipt_id
- DELETE /api/transactions/{tx_id} reopens the receipt
- Regression: pending-po excludes receipts with po_no or transaction_id
"""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # Fallback: read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": "susanto", "password": "admin123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def store_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": "khairul", "password": "khairul123"})
    assert r.status_code == 200, f"store login failed: {r.status_code} {r.text}"
    return s


def _create_pending_receipt(store_session, vendor, item, qty=10, so_no="", receive_date="2026-01-15"):
    """Create a pending (no PO) receipt via /store/incoming."""
    payload = {
        "receive_date": receive_date,
        "source_type": "supplier",
        "source_name": vendor,
        "do_no": f"DO-TEST-{uuid.uuid4().hex[:6]}",
        "po_no": "",  # pending — no PO
        "items": [{
            "item_name": item, "qty": qty, "unit": "Ea",
            "so_no": so_no, "add_to_stock": True, "remark": "iter6-test"
        }],
    }
    r = store_session.post(f"{API}/store/incoming", json=payload)
    assert r.status_code == 200, f"create incoming failed: {r.status_code} {r.text}"
    # Get its receipt id via pending-po list
    r2 = store_session.get(f"{API}/store/receipts/pending-po", params={"vendor": vendor})
    assert r2.status_code == 200
    lst = r2.json()
    matches = [d for d in lst if d.get("item_name") == item and d.get("vendor_name") == vendor]
    assert matches, f"newly created receipt not found in pending-po list for vendor={vendor} item={item}"
    return matches[0]


class TestPendingPoEndpoint:
    def test_endpoint_reachable_and_returns_list(self, admin_session):
        r = admin_session.get(f"{API}/store/receipts/pending-po")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_created_receipt_appears(self, store_session):
        vendor = f"TEST_iter6_Vendor_{uuid.uuid4().hex[:6]}"
        rec = _create_pending_receipt(store_session, vendor, "TEST_iter6_ItemA", qty=25)
        assert rec["transaction_id"] in (None, "")  # not yet linked
        assert not rec.get("po_no")
        assert rec.get("source") in ("manual", "bulk-direct")

    def test_vendor_filter_case_insensitive(self, admin_session, store_session):
        vendor = f"TEST_iter6_FilterVendor_{uuid.uuid4().hex[:6]}"
        _create_pending_receipt(store_session, vendor, "TEST_iter6_FilterItem", qty=5)
        # partial + lower-case
        r = admin_session.get(f"{API}/store/receipts/pending-po",
                              params={"vendor": vendor.lower()[:20]})
        assert r.status_code == 200
        assert any(d["vendor_name"] == vendor for d in r.json())

    def test_date_range_filter(self, admin_session, store_session):
        vendor = f"TEST_iter6_DateVendor_{uuid.uuid4().hex[:6]}"
        _create_pending_receipt(store_session, vendor, "TEST_iter6_DateItem", qty=1,
                                receive_date="2026-01-10")
        r = admin_session.get(f"{API}/store/receipts/pending-po",
                              params={"start_date": "2026-01-10", "end_date": "2026-01-10",
                                      "vendor": vendor})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for d in data:
            assert d["receive_date"] >= "2026-01-10" and d["receive_date"] <= "2026-01-10"

    def test_excludes_receipts_with_po_no(self, admin_session, store_session):
        """A receipt created with a PO number should NOT appear in pending-po."""
        vendor = f"TEST_iter6_HasPO_{uuid.uuid4().hex[:6]}"
        payload = {
            "receive_date": "2026-01-16",
            "source_type": "supplier",
            "source_name": vendor,
            "do_no": "DO-HAS-PO",
            "po_no": "PO-ALREADY-EXISTS-999",  # not pending
            "items": [{"item_name": "TEST_iter6_HasPOItem", "qty": 3, "unit": "Ea"}],
        }
        r = store_session.post(f"{API}/store/incoming", json=payload)
        assert r.status_code == 200
        r2 = admin_session.get(f"{API}/store/receipts/pending-po", params={"vendor": vendor})
        assert r2.status_code == 200
        assert all(d.get("po_no") != "PO-ALREADY-EXISTS-999" for d in r2.json())


class TestSingleTxLinkedReceipt:
    def test_create_tx_closes_receipt(self, admin_session, store_session):
        vendor = f"TEST_iter6_Single_{uuid.uuid4().hex[:6]}"
        rec = _create_pending_receipt(store_session, vendor, "TEST_iter6_SingleItem", qty=20)
        rid = rec["id"]

        po_no = f"PO-ITER6-{uuid.uuid4().hex[:6]}"
        inv_no = f"INV-ITER6-{uuid.uuid4().hex[:6]}"
        tx_payload = {
            "invoice_date": "2026-01-20",
            "project_no": "SO-ITER6-1",
            "po_no": po_no,
            "vendor_name": vendor,
            "category": "Uncategorized",
            "item_name": "TEST_iter6_SingleItem",
            "qty": 20,
            "unit": "Ea",
            "unit_price": 1500.0,
            "total_price": 30000.0,
            "invoice_no": inv_no,
            "linked_receipt_id": rid,
        }
        r = admin_session.post(f"{API}/transactions", json=tx_payload)
        assert r.status_code == 200, f"create tx failed: {r.status_code} {r.text}"
        tx = r.json()
        tx_id = tx["id"]

        # Verify the receipt was closed: check via incoming-report (contains all fields)
        r2 = admin_session.get(f"{API}/store/incoming-report",
                               params={"q": po_no, "page_size": 50})
        assert r2.status_code == 200
        items = r2.json()["items"]
        row = next((it for it in items if it["id"] == rid), None)
        assert row is not None, f"receipt {rid} not found in incoming-report q={po_no}"
        assert row["transaction_id"] == tx_id
        assert row["po_no"] == po_no
        assert row["invoice_no"] == inv_no
        assert float(row["unit_price"]) == 1500.0
        assert row.get("so_no") == "SO-ITER6-1"

        # And should no longer appear in pending-po
        r3 = admin_session.get(f"{API}/store/receipts/pending-po", params={"vendor": vendor})
        assert r3.status_code == 200
        assert all(d["id"] != rid for d in r3.json())

        # DELETE reverts: transaction_id=null, po_no='', invoice_no=''
        r4 = admin_session.delete(f"{API}/transactions/{tx_id}")
        assert r4.status_code == 200

        r5 = admin_session.get(f"{API}/store/receipts/pending-po", params={"vendor": vendor})
        assert r5.status_code == 200
        reverted = next((d for d in r5.json() if d["id"] == rid), None)
        assert reverted is not None, "receipt should reappear in pending-po after tx delete"
        assert reverted.get("transaction_id") in (None, "")
        assert reverted.get("po_no", "") == ""
        assert reverted.get("invoice_no", "") == ""


class TestBulkTxLinkedReceipts:
    def test_bulk_closes_each_linked_receipt(self, admin_session, store_session):
        vendor = f"TEST_iter6_Bulk_{uuid.uuid4().hex[:6]}"
        rec1 = _create_pending_receipt(store_session, vendor, "TEST_iter6_BulkItem_A", qty=5)
        rec2 = _create_pending_receipt(store_session, vendor, "TEST_iter6_BulkItem_B", qty=7)

        po_no = f"POBULK-{uuid.uuid4().hex[:6]}"
        inv_no = f"INVBULK-{uuid.uuid4().hex[:6]}"

        def _tx(item, qty, rid):
            return {
                "invoice_date": "2026-01-21", "project_no": "SO-BULK-6", "po_no": po_no,
                "vendor_name": vendor, "category": "Uncategorized", "item_name": item,
                "qty": qty, "unit": "Ea", "unit_price": 100.0, "total_price": qty * 100.0,
                "invoice_no": inv_no, "linked_receipt_id": rid,
            }

        r = admin_session.post(f"{API}/transactions/bulk", json={
            "transactions": [
                _tx("TEST_iter6_BulkItem_A", 5, rec1["id"]),
                _tx("TEST_iter6_BulkItem_B", 7, rec2["id"]),
            ]
        })
        assert r.status_code == 200, f"bulk create failed: {r.status_code} {r.text}"
        assert r.json()["inserted"] == 2

        # Verify both receipts closed and each linked to a DIFFERENT tx id
        rep = admin_session.get(f"{API}/store/incoming-report",
                                params={"q": po_no, "page_size": 50})
        assert rep.status_code == 200
        rows = {row["id"]: row for row in rep.json()["items"]}
        assert rec1["id"] in rows and rec2["id"] in rows
        r1 = rows[rec1["id"]]
        r2 = rows[rec2["id"]]
        assert r1["po_no"] == po_no and r2["po_no"] == po_no
        assert r1["invoice_no"] == inv_no and r2["invoice_no"] == inv_no
        assert r1["transaction_id"] and r2["transaction_id"]
        assert r1["transaction_id"] != r2["transaction_id"], \
            "each receipt should be linked to its own tx id, not shared"


class TestRegressionConsumableRequestStillWorks:
    def test_create_tx_without_linked_receipt_does_not_break(self, admin_session):
        """Simple sanity: create+delete a tx without linked_receipt_id and consumable_request_id."""
        payload = {
            "invoice_date": "2026-01-22", "project_no": "",
            "po_no": f"PO-REG-{uuid.uuid4().hex[:6]}",
            "vendor_name": "TEST_iter6_RegVendor",
            "category": "Uncategorized",
            "item_name": "TEST_iter6_RegItem", "qty": 1, "unit": "Ea",
            "unit_price": 10.0, "total_price": 10.0, "invoice_no": "",
        }
        r = admin_session.post(f"{API}/transactions", json=payload)
        assert r.status_code == 200
        tx_id = r.json()["id"]
        r2 = admin_session.delete(f"{API}/transactions/{tx_id}")
        assert r2.status_code == 200
