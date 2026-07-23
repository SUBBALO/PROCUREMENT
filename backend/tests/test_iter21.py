"""Iter21: Sales/Quotation stats & excel export, Backup/Wipe endpoints."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://procurement-runner.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
XLSX_SIG = b"PK\x03\x04"  # xlsx is a zip


def login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {username}: {r.status_code} {r.text}"
    return s


def H(sess):
    # Backwards-compat: returned dict is used as headers arg; but we now use sessions directly.
    return {}


class _SessWrap:
    def __init__(self, s):
        self.s = s
    def get(self, *a, **kw):
        return self.s.get(*a, **kw)
    def post(self, *a, **kw):
        return self.s.post(*a, **kw)


@pytest.fixture(scope="module")
def tokens():
    fiana_sess = None
    for pw in ("purch123", "purchasing123"):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"username": "fiana", "password": pw})
        if r.status_code == 200:
            fiana_sess = s
            break
    return {
        "susanto": login("susanto", "admin123"),
        "sales01": login("sales01", "sales123"),
        "engineer01": login("engineer01", "eng123"),
        "fiana": fiana_sess,
    }


# ------------------------- Sales stats -------------------------
class TestSalesStats:
    def test_sales_stats_shape(self, tokens):
        r = tokens["sales01"].get(f"{API}/sales/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "inquiries" in d and "quotations" in d
        assert "by_status" in d["inquiries"]
        assert "total" in d["inquiries"]
        for s in ["draft", "submitted", "in_progress", "awaiting_review", "accepted", "revision_requested", "closed"]:
            assert s in d["inquiries"]["by_status"], f"missing status {s}"
        for s in ["on_bidding", "confirm_order", "cancel"]:
            assert s in d["quotations"]["by_status"], f"missing quotation status {s}"

    def test_stats_consistent_with_list(self, tokens):
        r1 = tokens["sales01"].get(f"{API}/sales/stats")
        r2 = tokens["sales01"].get(f"{API}/inquiries")
        assert r1.status_code == 200 and r2.status_code == 200
        stats_total = r1.json()["inquiries"]["total"]
        list_total = len(r2.json().get("items", []))
        # limit=100 default; if list<100 it should match
        if list_total < 100:
            assert stats_total == list_total, f"stats {stats_total} != list {list_total}"

    def test_engineer_stats_excludes_drafts(self, tokens):
        r = tokens["engineer01"].get(f"{API}/sales/stats")
        assert r.status_code == 200
        assert r.json()["inquiries"]["by_status"]["draft"] == 0


# ------------------------- Excel exports -------------------------
class TestExcelExports:
    def test_inquiries_export_sales(self, tokens):
        r = tokens["sales01"].get(f"{API}/inquiries/export/excel")
        assert r.status_code == 200, r.text
        assert XLSX_MIME in r.headers.get("content-type", "")
        assert r.content[:4] == XLSX_SIG

    def test_inquiries_export_engineer(self, tokens):
        r = tokens["engineer01"].get(f"{API}/inquiries/export/excel")
        assert r.status_code == 200
        assert r.content[:4] == XLSX_SIG

    def test_quotations_export_sales(self, tokens):
        r = tokens["sales01"].get(f"{API}/quotations/export/excel")
        assert r.status_code == 200
        assert XLSX_MIME in r.headers.get("content-type", "")
        assert r.content[:4] == XLSX_SIG

    def test_export_requires_auth(self):
        r = requests.get(f"{API}/inquiries/export/excel")
        assert r.status_code in (401, 403)


# ------------------------- Backup / Wipe -------------------------
class TestBackup:
    def test_summary_susanto(self, tokens):
        r = tokens["susanto"].get(f"{API}/admin/backup/summary")
        assert r.status_code == 200
        d = r.json()
        assert "collections" in d and isinstance(d["collections"], dict)
        for k in ["users", "inquiries", "quotations"]:
            assert k in d["collections"]

    def test_export_susanto(self, tokens):
        r = tokens["susanto"].get(f"{API}/admin/backup/export")
        assert r.status_code == 200
        assert "application/json" in r.headers.get("content-type", "")
        data = r.json()
        assert "collections" in data and "backup_id" in data

    def test_wipe_wrong_phrase_susanto(self, tokens):
        r = tokens["susanto"].post(f"{API}/admin/backup/wipe",
            json={"confirm_phrase": "WRONG", "keep_users": True})
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_wipe_no_auth(self):
        r = requests.post(f"{API}/admin/backup/wipe", json={"confirm_phrase": "WRONG"})
        assert r.status_code in (401, 403)

    def test_wipe_non_super_admin_blocked(self, tokens):
        r = tokens["sales01"].post(f"{API}/admin/backup/wipe",
            json={"confirm_phrase": "WIPE-ALL-DATA", "keep_users": True})
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_wipe_purchasing_blocked(self, tokens):
        if not tokens["fiana"]:
            pytest.skip("fiana login failed")
        r = tokens["fiana"].post(f"{API}/admin/backup/wipe",
            json={"confirm_phrase": "WIPE-ALL-DATA", "keep_users": True})
        assert r.status_code == 403

    def test_summary_non_admin_blocked(self, tokens):
        r = tokens["sales01"].get(f"{API}/admin/backup/summary")
        assert r.status_code == 403
