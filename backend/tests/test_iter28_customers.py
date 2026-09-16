"""iter28: verify /api/customers list & create + regression on sales flows."""
import os
import requests
import time

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "https://supply-hub-159.preview.emergentagent.com").rstrip("/")


def login(username, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return s


def test_admin_list_customers():
    s = login("susanto", "admin123")
    r = s.get(f"{BASE}/api/customers", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "total" in body
    assert isinstance(body["items"], list)


def test_admin_create_customer_then_list_and_delete():
    s = login("susanto", "admin123")
    name = f"TEST_CUST_{int(time.time())}"
    r = s.post(f"{BASE}/api/customers", json={"name": name}, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert r.json()["name"] == name

    # duplicate should 400
    r2 = s.post(f"{BASE}/api/customers", json={"name": name}, timeout=15)
    assert r2.status_code == 400

    # list contains it
    r3 = s.get(f"{BASE}/api/customers", params={"q": name}, timeout=15)
    assert r3.status_code == 200
    assert any(c["name"] == name for c in r3.json()["items"])

    # cleanup
    s.delete(f"{BASE}/api/customers/{cid}", timeout=15)


def test_sales_can_create_customer():
    import pytest
    # Try known sales users; skip if none work
    for u, p in [("riska", "sales123"), ("sales01", "admin123"), ("sales01", "sales123")]:
        r = requests.post(f"{BASE}/api/auth/login", json={"username": u, "password": p}, timeout=15)
        if r.status_code == 200:
            s = requests.Session()
            s.cookies.update(r.cookies)
            name = f"TEST_CUST_SALES_{int(time.time())}"
            rc = s.post(f"{BASE}/api/customers", json={"name": name}, timeout=15)
            assert rc.status_code == 200, rc.text
            cid = rc.json()["id"]
            a = login("susanto", "admin123")
            a.delete(f"{BASE}/api/customers/{cid}", timeout=15)
            return
    pytest.skip("No sales user credentials valid")


def test_store_cannot_create_customer():
    s = login("khairul", "khairul123")
    r = s.post(f"{BASE}/api/customers", json={"name": "TEST_STORE_BLOCK"}, timeout=15)
    assert r.status_code == 403


def test_quotations_reachable():
    s = login("susanto", "admin123")
    r = s.get(f"{BASE}/api/quotations", timeout=15)
    assert r.status_code == 200
    assert "items" in r.json()


def test_inquiries_reachable():
    s = login("susanto", "admin123")
    r = s.get(f"{BASE}/api/inquiries", timeout=15)
    assert r.status_code == 200
    assert "items" in r.json()
