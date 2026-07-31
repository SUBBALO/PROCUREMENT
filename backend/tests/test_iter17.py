"""Iteration 17 — Backend test for PUT /api/inquiries/{id} edit-draft flow."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(username: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login {username} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def sales_session():
    return _login("sales01", "sales123")


@pytest.fixture(scope="module")
def admin_session():
    return _login("susanto", "admin123")


@pytest.fixture(scope="module")
def eng_session():
    return _login("engineer01", "eng123")


def _create_draft(session, title="TEST_iter17_edit", customer="TEST_Cust"):
    payload = {
        "title": title,
        "customer_name": customer,
        "customer_deadline": "2026-04-01",
        "description": "will be edited",
        "items": [{"item_name": "X1", "qty": 3, "unit": "EA", "specification": ""}],
        "save_as_draft": True,
    }
    r = session.post(f"{API}/inquiries", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "draft"
    return d


class TestEditDraft:
    def test_put_updates_fields_and_persists(self, sales_session):
        d = _create_draft(sales_session)
        inq_id = d["id"]
        update = {
            "title": "TEST_iter17_edit EDITED",
            "customer_name": "TEST_Cust V2",
            "description": "edited desc",
            "items": [
                {"item_name": "X1", "qty": 3, "unit": "EA", "specification": ""},
                {"item_name": "X2", "qty": 5, "unit": "EA", "specification": "spec2"},
            ],
        }
        r = sales_session.put(f"{API}/inquiries/{inq_id}", json=update)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "TEST_iter17_edit EDITED"
        assert body["customer_name"] == "TEST_Cust V2"
        assert len(body["items"]) == 2

        # GET verify persistence
        g = sales_session.get(f"{API}/inquiries/{inq_id}")
        assert g.status_code == 200
        fetched = g.json()
        assert fetched["title"] == "TEST_iter17_edit EDITED"
        assert fetched["customer_name"] == "TEST_Cust V2"
        assert len(fetched["items"]) == 2
        assert fetched["items"][1]["item_name"] == "X2"
        assert fetched["status"] == "draft"

    def test_put_partial_update_keeps_other_fields(self, sales_session):
        d = _create_draft(sales_session, title="TEST_iter17_partial", customer="OrigCust")
        r = sales_session.put(f"{API}/inquiries/{d['id']}", json={"title": "OnlyTitleChanged"})
        assert r.status_code == 200
        g = sales_session.get(f"{API}/inquiries/{d['id']}").json()
        assert g["title"] == "OnlyTitleChanged"
        assert g["customer_name"] == "OrigCust"  # unchanged
        assert len(g["items"]) == 1  # unchanged

    def test_put_rejects_non_draft(self, sales_session):
        d = _create_draft(sales_session, title="TEST_iter17_submit_then_edit")
        # Submit it
        s = sales_session.post(f"{API}/inquiries/{d['id']}/submit")
        assert s.status_code == 200
        assert s.json()["status"] == "submitted"
        # Now try edit → 400
        r = sales_session.put(f"{API}/inquiries/{d['id']}", json={"title": "cannot edit"})
        assert r.status_code == 400, r.text
        assert "draft" in r.json().get("detail", "").lower()

    def test_put_forbids_non_owner_sales(self, sales_session, eng_session, admin_session):
        # Create draft as sales01
        d = _create_draft(sales_session, title="TEST_iter17_owner_check")
        # Engineering cannot even GET (not their inquiry access?), but PUT should 403
        # engineering role is not owner and not admin → 403
        r = eng_session.put(f"{API}/inquiries/{d['id']}", json={"title": "hijack"})
        assert r.status_code == 403, f"Expected 403 for non-owner, got {r.status_code}"

    def test_put_admin_can_edit_any_draft(self, sales_session, admin_session):
        d = _create_draft(sales_session, title="TEST_iter17_admin_edit")
        r = admin_session.put(f"{API}/inquiries/{d['id']}", json={"title": "AdminEdited"})
        assert r.status_code == 200, r.text
        g = sales_session.get(f"{API}/inquiries/{d['id']}").json()
        assert g["title"] == "AdminEdited"

    def test_edit_then_submit_history_has_both(self, sales_session):
        d = _create_draft(sales_session, title="TEST_iter17_history")
        inq_id = d["id"]
        sales_session.put(f"{API}/inquiries/{inq_id}", json={"title": "FinalEdit"})
        sales_session.post(f"{API}/inquiries/{inq_id}/submit")
        g = sales_session.get(f"{API}/inquiries/{inq_id}").json()
        actions = [h["action"] for h in g.get("history", [])]
        assert any("created" in a for a in actions), f"history missing created: {actions}"
        assert any("submitted" in a for a in actions), f"history missing submitted: {actions}"
        assert g["status"] == "submitted"

    def test_put_nonexistent_returns_404(self, sales_session):
        r = sales_session.put(f"{API}/inquiries/does-not-exist-xyz", json={"title": "x"})
        assert r.status_code == 404
