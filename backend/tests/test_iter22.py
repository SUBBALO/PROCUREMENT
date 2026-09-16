"""Iter22 tests — PDF Quotation, Recycle Bin (soft-delete/restore/purge), permission gating."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def _sess(u, p):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _sess("susanto", "admin123")


@pytest.fixture(scope="module")
def sales_s():
    return _sess("sales01", "sales123")


@pytest.fixture(scope="module")
def fiana_s():
    return _sess("fiana", "purch123")


# ---------------- PDF Quotation ----------------

@pytest.fixture(scope="module")
def some_qid(admin_s):
    r = admin_s.get(f"{BASE}/quotations?limit=5", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    if not items:
        pytest.skip("No quotations available")
    return items[0]["id"]


class TestQuotationPDF:
    def test_pdf_super_admin(self, admin_s, some_qid):
        r = admin_s.get(f"{BASE}/quotations/{some_qid}/pdf", timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        assert r.content.startswith(b"%PDF")
        assert len(r.content) > 5000, f"PDF suspiciously small: {len(r.content)}"

    def test_pdf_sales(self, sales_s, some_qid):
        r = sales_s.get(f"{BASE}/quotations/{some_qid}/pdf", timeout=60)
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF")

    def test_pdf_anon_401(self, some_qid):
        r = requests.get(f"{BASE}/quotations/{some_qid}/pdf", timeout=30)
        assert r.status_code in (401, 403)

    def test_pdf_not_found(self, admin_s):
        r = admin_s.get(f"{BASE}/quotations/does-not-exist-xyz/pdf", timeout=30)
        assert r.status_code == 404


# ---------------- Recycle Bin ----------------

def _mk_tx(sess, suffix="A"):
    payload = {
        "invoice_no": f"TEST_ITER22_TRASH_{suffix}",
        "invoice_date": "2026-01-15",
        "vendor_name": "TEST Vendor Trash",
        "item_name": "TEST Item Trash",
        "qty": 1,
        "unit": "pcs",
        "unit_price": 1000,
        "currency": "IDR",
        "total_price": 1000,
        "category": "Others",
    }
    r = sess.post(f"{BASE}/transactions", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return body.get("id") or body.get("_id")


class TestRecycleBinFlow:
    def test_full_flow(self, admin_s):
        # CREATE
        tx = _mk_tx(admin_s, "FLOW")
        # DELETE
        r = admin_s.delete(f"{BASE}/transactions/{tx}", timeout=30)
        assert r.status_code in (200, 204), r.text
        # (a) not in list
        r = admin_s.get(f"{BASE}/transactions?q=TEST_ITER22_TRASH_FLOW", timeout=30)
        body = r.json()
        items = body.get("items") if isinstance(body, dict) else body
        assert tx not in [it.get("id") for it in items]
        # (b) summary counts >= 1
        r = admin_s.get(f"{BASE}/admin/trash/summary", timeout=30)
        assert r.status_code == 200
        summ = r.json()
        assert summ.get("collections", {}).get("transactions", 0) >= 1
        assert summ.get("auto_purge_days") == 30
        # (c) list has our tx with metadata
        r = admin_s.get(f"{BASE}/admin/trash/list?collection=transactions&q=TEST_ITER22_TRASH_FLOW", timeout=30)
        assert r.status_code == 200
        found = [it for it in r.json()["items"] if it.get("id") == tx]
        assert found, "deleted tx not in trash list"
        assert found[0].get("deleted_at")
        assert found[0].get("deleted_by_name")
        # (d) restore
        r = admin_s.post(f"{BASE}/admin/trash/restore",
                         json={"collection": "transactions", "ids": [tx]}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("restored", 0) >= 1
        r = admin_s.get(f"{BASE}/transactions?q=TEST_ITER22_TRASH_FLOW", timeout=30)
        body = r.json()
        items = body.get("items") if isinstance(body, dict) else body
        assert tx in [it.get("id") for it in items]
        # cleanup: delete + purge to keep DB clean
        admin_s.delete(f"{BASE}/transactions/{tx}", timeout=30)
        admin_s.post(f"{BASE}/admin/trash/purge",
                     json={"collection": "transactions", "ids": [tx], "confirm_phrase": "PURGE-FOREVER"}, timeout=30)

    def test_purge_wrong_phrase_400(self, admin_s):
        tx = _mk_tx(admin_s, "PWRONG")
        admin_s.delete(f"{BASE}/transactions/{tx}", timeout=30)
        r = admin_s.post(f"{BASE}/admin/trash/purge",
                         json={"collection": "transactions", "ids": [tx], "confirm_phrase": "WRONG"}, timeout=30)
        assert r.status_code == 400
        # Restore for cleanup then hard purge
        admin_s.post(f"{BASE}/admin/trash/purge",
                     json={"collection": "transactions", "ids": [tx], "confirm_phrase": "PURGE-FOREVER"}, timeout=30)

    def test_purge_hard_delete(self, admin_s):
        tx = _mk_tx(admin_s, "PHARD")
        admin_s.delete(f"{BASE}/transactions/{tx}", timeout=30)
        r = admin_s.post(f"{BASE}/admin/trash/purge",
                         json={"collection": "transactions", "ids": [tx], "confirm_phrase": "PURGE-FOREVER"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("purged", 0) >= 1
        # Verify: absent from trash list
        r = admin_s.get(f"{BASE}/admin/trash/list?collection=transactions&q=TEST_ITER22_TRASH_PHARD", timeout=30)
        found = [it for it in r.json()["items"] if it.get("id") == tx]
        assert not found

    def test_auto_purge(self, admin_s):
        r = admin_s.post(f"{BASE}/admin/trash/auto-purge", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("cutoff_days") == 30
        assert "purged" in body


# ---------------- Permission gating ----------------

class TestTrashPermissions:
    def test_summary_forbidden(self, fiana_s):
        r = fiana_s.get(f"{BASE}/admin/trash/summary", timeout=30)
        assert r.status_code == 403

    def test_list_forbidden(self, fiana_s):
        r = fiana_s.get(f"{BASE}/admin/trash/list?collection=transactions", timeout=30)
        assert r.status_code == 403

    def test_restore_forbidden(self, fiana_s):
        r = fiana_s.post(f"{BASE}/admin/trash/restore",
                         json={"collection": "transactions", "ids": ["x"]}, timeout=30)
        assert r.status_code == 403

    def test_purge_forbidden(self, fiana_s):
        r = fiana_s.post(f"{BASE}/admin/trash/purge",
                         json={"collection": "transactions", "ids": ["x"], "confirm_phrase": "PURGE-FOREVER"}, timeout=30)
        assert r.status_code == 403

    def test_anonymous_401(self):
        r = requests.get(f"{BASE}/admin/trash/summary", timeout=30)
        assert r.status_code in (401, 403)


# ---------------- Regression ----------------

class TestRegressionIter21:
    def test_backup_export(self, admin_s):
        r = admin_s.get(f"{BASE}/admin/backup/export", timeout=60)
        assert r.status_code == 200

    def test_wipe_wrong_phrase(self, admin_s):
        r = admin_s.post(f"{BASE}/admin/backup/wipe",
                        json={"confirm_phrase": "WRONG", "keep_users": True}, timeout=30)
        assert r.status_code == 400

    def test_sales_stats(self, sales_s):
        r = sales_s.get(f"{BASE}/sales/stats", timeout=30)
        assert r.status_code == 200
        # quotation stats is computed in the same payload / on frontend — no dedicated /quotations/stats endpoint
        body = r.json()
        assert isinstance(body, dict)
