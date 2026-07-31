"""
Backend regression tests for Inquiry multi-level review workflow and
MCL PDF / BOM dismiss endpoints (iteration 1).

Covers:
- Login flow (session cookie)
- submit-to-head, head-review (approve + revise)
- attachments upload to engineer slot
- MCL PDF/XLSX generation
- BOM dismiss-purchase-notif
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://supply-hub-159.preview.emergentagent.com").rstrip("/")

# ---------- helpers ----------
def login(username: str, password: str):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {username}: {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return login("susanto", "admin123")


@pytest.fixture(scope="module")
def eng_head_session():
    return login("riski", "riski123")


@pytest.fixture(scope="module")
def eng_staff_session():
    return login("trisna", "trisna123")


@pytest.fixture(scope="module")
def purchasing_session():
    return login("staff01", "staff123")


# ---------- Auth / credentials sanity ----------
class TestAuth:
    def test_riski_password(self):
        login("riski", "riski123")

    def test_trisna_password(self):
        login("trisna", "trisna123")

    def test_wrong_password_rejected(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "riski", "password": "wrong"}, timeout=10)
        assert r.status_code == 401


# ---------- Inquiry review flow ----------
INQ_ID = "e37774fe-7407-48cc-9384-248b377efc0d"  # INQ-043 seeded in DB


def _get_inquiry(session, inq_id=INQ_ID):
    r = session.get(f"{BASE_URL}/api/inquiries", timeout=15)
    assert r.status_code == 200
    for it in r.json()["items"]:
        if it["id"] == inq_id:
            return it
    pytest.skip(f"seed inquiry {inq_id} not present")


class TestInquiryFlow:
    def test_inquiry_readable(self, admin_session):
        inq = _get_inquiry(admin_session)
        assert inq["assigned_to_name"] == "Trisna"

    def test_head_revise_then_engineer_resubmit(self, eng_head_session, eng_staff_session):
        # Ensure we are at a known state — put it to head_revision
        inq = _get_inquiry(eng_head_session)
        # If status is awaiting_review or pending_head_review we can't request revise on awaiting_review;
        # skip re-setup if already head_revision
        if inq["status"] == "pending_head_review":
            r = eng_head_session.post(
                f"{BASE_URL}/api/inquiries/{INQ_ID}/head-review",
                json={"approve": False, "note": "regression: request revision"},
                timeout=15,
            )
            assert r.status_code == 200
            assert r.json()["status"] == "head_revision"
            assert r.json()["head_revision_note"] == "regression: request revision"
        elif inq["status"] != "head_revision":
            pytest.skip(f"inquiry not in a state we can revise (status={inq['status']})")

        # Engineer uploads a file to engineer slot then submits to head
        files = {"file": ("regression.txt", io.BytesIO(b"regression content"), "text/plain")}
        r = eng_staff_session.post(
            f"{BASE_URL}/api/inquiries/{INQ_ID}/attachments",
            files=files,
            data={"slot": "engineer"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["filename"] == "regression.txt"

        r = eng_staff_session.post(
            f"{BASE_URL}/api/inquiries/{INQ_ID}/submit-to-head",
            data={"note": "regression: resubmit after revision"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending_head_review"
        assert body["engineer_response_note"] == "regression: resubmit after revision"
        # File must appear in engineer_response_files
        filenames = [f["filename"] for f in body.get("engineer_response_files", [])]
        assert "regression.txt" in filenames

        # Now head approves
        r = eng_head_session.post(
            f"{BASE_URL}/api/inquiries/{INQ_ID}/head-review",
            json={"approve": True, "note": "regression: approve"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "awaiting_review"
        assert r.json()["head_review_note"] == "regression: approve"


# ---------- MCL PDF regression ----------
class TestMCLPDF:
    def test_incoming_report_lists_receipts(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/store/incoming-report", timeout=15)
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert len(items) > 0, "no incoming receipts to test PDF"
        self._rid = items[0]["id"]

    def test_mcl_pdf_valid(self, admin_session):
        items = admin_session.get(f"{BASE_URL}/api/store/incoming-report", timeout=15).json().get("items", [])
        if not items:
            pytest.skip("no incoming receipts")
        rid = items[0]["id"]
        r = admin_session.get(f"{BASE_URL}/api/store/incoming/mcl/{rid}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF"), "response body is not a PDF"
        assert len(r.content) > 1000

    def test_mcl_xlsx_valid(self, admin_session):
        items = admin_session.get(f"{BASE_URL}/api/store/incoming-report", timeout=15).json().get("items", [])
        if not items:
            pytest.skip("no incoming receipts")
        rid = items[0]["id"]
        r = admin_session.get(f"{BASE_URL}/api/store/incoming/mcl/{rid}", timeout=30)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "excel" in ct or "octet-stream" in ct


# ---------- BOM dismiss regression ----------
class TestBOMDismiss:
    def test_dismiss_and_verify(self, admin_session, purchasing_session):
        r = admin_session.get(f"{BASE_URL}/api/bom", timeout=15)
        assert r.status_code == 200
        boms = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        # Pick any BOM
        if not boms:
            pytest.skip("no BOM in DB")
        bid = boms[0]["id"]

        r = purchasing_session.post(f"{BASE_URL}/api/bom/{bid}/dismiss-purchase-notif", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify flag now True
        r = admin_session.get(f"{BASE_URL}/api/bom/{bid}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("purchase_notif_dismissed") is True

    def test_notifications_have_bom_purchased_count(self, purchasing_session):
        r = purchasing_session.get(f"{BASE_URL}/api/notifications", timeout=15)
        assert r.status_code == 200
        cats = r.json().get("categories", [])
        bom_cat = next((c for c in cats if c["key"] == "bom_new_unpurchased"), None)
        if bom_cat and bom_cat["items"]:
            item = bom_cat["items"][0]
            # detail should contain "X/Y item sudah dibeli"
            assert "purchased_count" in item
            assert "total_items" in item
            assert "sudah dibeli" in (item.get("sub") or item.get("detail") or "")
