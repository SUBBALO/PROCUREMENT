"""Iter 3: Sales role Accept/Minta Revisi open access (no ownership gate).

Verifies:
  - Sales user who is NOT the creator can POST /inquiries/{id}/review
  - Approve → status='accepted'
  - Revise → status='revision_requested'
  - Regression: super_admin can still review
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def login(username, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def sess_susanto():
    return login("susanto", "admin123")


@pytest.fixture(scope="module")
def sess_riska():
    return login("riska", "riska123")


@pytest.fixture(scope="module")
def sess_riski():
    return login("riski", "riski123")


@pytest.fixture(scope="module")
def sess_trisna():
    return login("trisna", "trisna123")


@pytest.fixture(scope="module")
def sess_sales01():
    return login("sales01", "sales123")


def _who(sess):
    r = sess.get(f"{BASE_URL}/api/auth/me")
    r.raise_for_status()
    return r.json()


def _create_awaiting_review_inquiry(sess_sales_creator, sess_riski, sess_trisna, title):
    """Seed pipeline: sales creates inquiry (not-draft) → riski assigns to trisna → trisna submits → riski approves → awaiting_review."""
    # 1. Sales creates inquiry directly submitted
    r = sess_sales_creator.post(f"{BASE_URL}/api/inquiries", json={
        "title": title,
        "customer_name": "TEST_CUST",
        "project_name": "TEST_PROJ",
        "description": "seed for iter3",
        "items": [{"item_name": "Widget", "qty": 1, "unit": "Ea", "specification": ""}],
        "save_as_draft": False,
    })
    assert r.status_code == 200, r.text
    inq = r.json()
    inq_id = inq["id"]
    assert inq["status"] == "submitted"

    # 2. Riski (eng_head) assigns to trisna
    trisna = _who(sess_trisna)
    r = sess_riski.post(f"{BASE_URL}/api/inquiries/{inq_id}/assign", json={
        "engineer_id": trisna["id"], "engineer_name": trisna.get("name") or "Trisna",
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"

    # 3. Trisna submits to head
    r = sess_trisna.post(f"{BASE_URL}/api/inquiries/{inq_id}/submit-to-head",
                        data={"note": "done"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending_head_review"

    # 4. Riski approves → awaiting_review
    r = sess_riski.post(f"{BASE_URL}/api/inquiries/{inq_id}/head-review",
                        json={"approve": True, "note": "ok"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "awaiting_review"
    return inq_id, inq


class TestSalesReviewOpenAccess:

    def test_non_owner_sales_can_accept(self, sess_susanto, sess_riska, sess_riski, sess_trisna, sess_sales01):
        """Riska (sales) can review an inquiry created by sales01, not by herself."""
        inq_id, inq = _create_awaiting_review_inquiry(
            sess_sales01, sess_riski, sess_trisna, "TEST_iter3_accept_by_nonowner"
        )
        creator_id = inq["created_by_id"]
        riska = _who(sess_riska)
        assert creator_id != riska["id"], "precondition: riska must NOT be creator"

        # Attempt review as riska (not owner)
        r = sess_riska.post(f"{BASE_URL}/api/inquiries/{inq_id}/review",
                             json={"approve": True, "review_note": "TEST_iter3 accept from non-owner"})
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body["status"] == "accepted"
        assert body["final_status"] == "accepted"
        # sales_reviews should contain riska's entry
        assert any(sr.get("by") for sr in body.get("sales_reviews", []))
        # GET to verify persistence
        g = sess_riska.get(f"{BASE_URL}/api/inquiries/{inq_id}")
        assert g.status_code == 200
        assert g.json()["status"] == "accepted"

    def test_non_owner_sales_can_request_revision(self, sess_sales01, sess_riska, sess_riski, sess_trisna):
        inq_id, inq = _create_awaiting_review_inquiry(
            sess_sales01, sess_riski, sess_trisna, "TEST_iter3_revise_by_nonowner"
        )
        r = sess_riska.post(f"{BASE_URL}/api/inquiries/{inq_id}/review",
                             json={"approve": False, "review_note": "TEST_iter3 please revise"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "revision_requested"
        assert body["final_status"] == "revision_requested"
        last = body["sales_reviews"][-1]
        assert last["approve"] is False
        assert "revise" in last["note"].lower()

    def test_super_admin_can_still_review(self, sess_susanto, sess_sales01, sess_riski, sess_trisna):
        inq_id, _ = _create_awaiting_review_inquiry(
            sess_sales01, sess_riski, sess_trisna, "TEST_iter3_review_by_admin"
        )
        r = sess_susanto.post(f"{BASE_URL}/api/inquiries/{inq_id}/review",
                              json={"approve": True, "review_note": "admin OK"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "accepted"

    def test_non_awaiting_review_status_rejected(self, sess_riska, sess_sales01):
        """Sanity: reviewing a submitted/draft inquiry returns 400."""
        r = sess_sales01.post(f"{BASE_URL}/api/inquiries", json={
            "title": "TEST_iter3_draft", "customer_name": "TEST_CUST",
            "save_as_draft": True,
        })
        assert r.status_code == 200
        draft_id = r.json()["id"]
        rev = sess_riska.post(f"{BASE_URL}/api/inquiries/{draft_id}/review",
                               json={"approve": True, "review_note": "x"})
        assert rev.status_code == 400
