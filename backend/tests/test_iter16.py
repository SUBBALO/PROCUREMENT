"""Iteration 16 backend tests: BOM upload prepared_by required, 409 revision flow,
/bom/preparers autocomplete, and fuzzy `q` search."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
BOM_FILE = "/tmp/bom/BOM.xls"


def _session(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"login failed {username}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def eng():
    return _session("engineer01", "eng123")


@pytest.fixture(scope="module")
def admin():
    return _session("susanto", "admin123")


# ------------------------ prepared_by required ------------------------
class TestPreparedByRequired:
    def test_upload_without_prepared_by_returns_422(self, eng):
        with open(BOM_FILE, "rb") as f:
            r = eng.post(
                f"{API}/bom/upload",
                files={"file": ("BOM.xls", f, "application/vnd.ms-excel")},
            )
        # pydantic/FastAPI Form(...) missing → 422
        assert r.status_code in (400, 422), f"unexpected {r.status_code} {r.text[:200]}"

    def test_upload_empty_prepared_by_returns_400(self, eng):
        with open(BOM_FILE, "rb") as f:
            r = eng.post(
                f"{API}/bom/upload",
                files={"file": ("BOM.xls", f, "application/vnd.ms-excel")},
                data={"prepared_by": "   "},
            )
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text[:200]}"


# ------------------------ 409 revision_reason_required ------------------------
class TestRevisionFlow:
    def test_upload_existing_so_without_reason_returns_409_structured(self, eng):
        with open(BOM_FILE, "rb") as f:
            r = eng.post(
                f"{API}/bom/upload",
                files={"file": ("BOM.xls", f, "application/vnd.ms-excel")},
                data={"prepared_by": "Sudirman"},
            )
        assert r.status_code == 409, f"expected 409 got {r.status_code} {r.text[:200]}"
        body = r.json()
        detail = body.get("detail")
        # detail must be OBJECT, not string
        assert isinstance(detail, dict), f"detail must be dict, got {type(detail).__name__}: {detail}"
        assert detail.get("code") == "revision_reason_required"
        assert detail.get("so_no") == "005221"
        assert isinstance(detail.get("latest_rev"), int)
        assert "latest_uploaded_by" in detail
        assert "message" in detail
        assert "latest_prepared_by" in detail

    def test_upload_with_reason_creates_next_rev(self, eng):
        # capture current latest rev
        r0 = eng.get(f"{API}/bom/history/005221")
        prev_latest = r0.json()["revisions"][0]["rev_no"]

        with open(BOM_FILE, "rb") as f:
            r = eng.post(
                f"{API}/bom/upload",
                files={"file": ("BOM.xls", f, "application/vnd.ms-excel")},
                data={
                    "prepared_by": "Andi Test",
                    "revision_reason": "iter16 auto test",
                },
            )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("success") is True
        bom = body["bom"]
        assert bom["rev_no"] == prev_latest + 1
        assert bom["prepared_by"] == "Andi Test"
        assert bom["revision_reason"] == "iter16 auto test"

        # GET to verify persistence
        g = eng.get(f"{API}/bom/{bom['id']}")
        assert g.status_code == 200
        fetched = g.json()
        assert fetched["prepared_by"] == "Andi Test"
        assert fetched["revision_reason"] == "iter16 auto test"
        assert fetched["so_no"] == "005221"


# ------------------------ /bom/preparers ------------------------
class TestPreparers:
    def test_preparers_returns_sorted_distinct(self, eng):
        r = eng.get(f"{API}/bom/preparers")
        assert r.status_code == 200
        names = r.json()
        assert isinstance(names, list)
        # After previous test, 'Andi Test' and 'Sudirman' should be present
        assert "Andi Test" in names
        assert "Sudirman" in names
        # sorted
        assert names == sorted(names)


# ------------------------ q fuzzy search ------------------------
class TestSearch:
    def test_q_by_so(self, eng):
        r = eng.get(f"{API}/bom", params={"q": "005221"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert all(it["so_no"] == "005221" for it in items)

    def test_q_by_customer_case_insensitive(self, eng):
        r = eng.get(f"{API}/bom", params={"q": "yokohama"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert any("YOKOHAMA" in it.get("customer", "").upper() for it in items)

    def test_q_by_project(self, eng):
        r = eng.get(f"{API}/bom", params={"q": "PALLET"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert any("PALLET" in it.get("project_name", "").upper() for it in items)

    def test_q_no_match(self, eng):
        r = eng.get(f"{API}/bom", params={"q": "xyzabc_nomatch"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 0

    def test_so_exact_backward_compat(self, eng):
        r = eng.get(f"{API}/bom", params={"so_no": "005221"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert all(it["so_no"] == "005221" for it in items)
