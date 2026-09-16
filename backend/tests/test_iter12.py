"""Iteration 12 — Admin bulk-delete of store receipts."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def susanto(): return login("susanto", "admin123")


@pytest.fixture(scope="module")
def erwin(): return login("erwin", "erwin123")


@pytest.fixture(scope="module")
def staff(): return login("staff01", "staff123")


@pytest.fixture(scope="module")
def store_u(): return login("store01", "store123")


@pytest.fixture(scope="module")
def finance(): return login("finance01", "finance123")


def _create_receipt(sess, item_name="TEST_IT12_ITEM", qty=10.0, add_to_stock=True, source_name="TEST_IT12_VENDOR"):
    payload = {
        "receive_date": "2026-01-15",
        "source_type": "supplier",
        "source_name": source_name,
        "do_no": "TEST-DO-IT12",
        "po_no": "",
        "items": [{
            "item_name": item_name,
            "qty": qty,
            "unit": "Ea",
            "so_no": "",
            "add_to_stock": add_to_stock,
            "unit_price": 1000.0,
            "remark": "iter12 test",
        }],
    }
    r = sess.post(f"{API}/store/incoming", json=payload)
    assert r.status_code == 200, f"create receipt failed: {r.status_code} {r.text}"
    # fetch back the receipt id via incoming-report
    rep = sess.get(f"{API}/store/incoming-report", params={"q": source_name, "page_size": 50})
    assert rep.status_code == 200
    items = rep.json().get("items", [])
    matching = [x for x in items if x.get("item_name") == item_name]
    assert matching, f"no receipt found for {item_name} in report"
    return matching[0]["id"]


# ---------- ADMIN CAN DELETE ----------
class TestAdminBulkDelete:
    def test_susanto_bulk_delete_receipt(self, susanto):
        rid = _create_receipt(susanto, item_name="TEST_IT12_SUSANTO", source_name="TEST_IT12_V_SUSANTO")
        r = susanto.post(f"{API}/store/receipts/bulk-delete", json={"ids": [rid]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("deleted") == 1
        # verify GET incoming-report no longer includes it
        rep = susanto.get(f"{API}/store/incoming-report", params={"q": "TEST_IT12_V_SUSANTO", "page_size": 50})
        ids_in_report = [x["id"] for x in rep.json().get("items", [])]
        assert rid not in ids_in_report

    def test_erwin_bulk_delete_receipt(self, erwin):
        rid = _create_receipt(erwin, item_name="TEST_IT12_ERWIN", source_name="TEST_IT12_V_ERWIN")
        r = erwin.post(f"{API}/store/receipts/bulk-delete", json={"ids": [rid]})
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 1


# ---------- NON-ADMIN FORBIDDEN ----------
class TestNonAdminForbidden:
    def _try(self, sess, susanto):
        # create receipt as admin first
        rid = _create_receipt(susanto, item_name="TEST_IT12_NA", source_name="TEST_IT12_V_NA")
        r = sess.post(f"{API}/store/receipts/bulk-delete", json={"ids": [rid]})
        # cleanup regardless
        susanto.post(f"{API}/store/receipts/bulk-delete", json={"ids": [rid]})
        return r

    def test_staff_403(self, staff, susanto):
        r = self._try(staff, susanto)
        assert r.status_code == 403, r.text

    def test_store_403(self, store_u, susanto):
        r = self._try(store_u, susanto)
        assert r.status_code == 403, r.text

    def test_finance_403(self, finance, susanto):
        r = self._try(finance, susanto)
        assert r.status_code == 403, r.text


# ---------- CONSUMED PROTECTION ----------
class TestConsumedProtection:
    def test_consumed_blocks_unless_force(self, susanto):
        item = "TEST_IT12_CONSUMED"
        rid = _create_receipt(susanto, item_name=item, qty=10.0, add_to_stock=True, source_name="TEST_IT12_V_CONS")
        # issue part of it
        issue_payload = {"items": [{
            "item_name": item, "qty": 3.0, "so_number": "",
            "taker_name": "IT12Tester", "issue_date": "2026-01-16", "note": "",
        }]}
        ir = susanto.post(f"{API}/store/issue/bulk", json=issue_payload)
        assert ir.status_code == 200, ir.text

        # attempt bulk-delete without force
        r = susanto.post(f"{API}/store/receipts/bulk-delete", json={"ids": [rid]})
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "sudah dipakai" in detail.lower() or "issuance" in detail.lower()

        # retry with force=true
        r2 = susanto.post(f"{API}/store/receipts/bulk-delete", json={"ids": [rid], "force": True})
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("deleted") == 1
        assert data.get("forced_consumed") == 1


# ---------- EDGE CASES ----------
class TestEdgeCases:
    def test_empty_ids_400(self, susanto):
        r = susanto.post(f"{API}/store/receipts/bulk-delete", json={"ids": []})
        assert r.status_code == 400
        assert "tidak ada" in r.json().get("detail", "").lower()

    def test_unknown_id_404(self, susanto):
        r = susanto.post(f"{API}/store/receipts/bulk-delete", json={"ids": ["nonexistent-id-xxx-iter12"]})
        assert r.status_code == 404
