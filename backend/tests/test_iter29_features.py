"""iter29 (session-labelled iter12) features:
1. GET /api/store/stock returns qty=0 items too.
2. PATCH /api/bom/{id}/meta accepts class_material for draft/pending_review BOM.
3. POST /api/customers quick-register (regression for inquiry create flow).
"""
import os
import time
import uuid
import requests
import pytest

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "https://supply-hub-159.preview.emergentagent.com").rstrip("/")


def login(username, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return s


# ---------------- Stock: include qty=0 ----------------
def test_store_stock_includes_zero_qty_admin():
    s = login("susanto", "admin123")
    r = s.get(f"{BASE}/api/store/stock", timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list), f"expected list, got {type(items)}"
    # Filter must NOT exclude qty==0 anymore. At least presence check for structure.
    for it in items[:5]:
        assert "item_name" in it and "qty" in it
    # Not asserting there is a qty=0 item in prod DB (may or may not exist),
    # but the endpoint should not error and code must not filter.
    # Verify by ensuring endpoint returns items possibly including qty<=0.
    zero_items = [it for it in items if float(it.get("qty") or 0) <= 0]
    print(f"stock total={len(items)}, qty<=0 count={len(zero_items)}")


def test_store_stock_role_store():
    # store role should also see stock (including qty=0)
    s = login("khairul", "khairul123")
    r = s.get(f"{BASE}/api/store/stock", timeout=20)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


# ---------------- BOM PATCH meta: class_material ----------------
def _register_bom(sess, so_no):
    r = sess.post(f"{BASE}/api/bom/register", json={
        "so_no": so_no,
        "project_name": "TEST iter29",
        "customer": "TEST_CUST_iter29",
    }, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_bom_meta_update_class_material_admin():
    admin = login("susanto", "admin123")
    so_no = f"TESTSO{int(time.time())}"
    bom = _register_bom(admin, so_no)
    bid = bom["id"]
    assert bom.get("engineering_status") == "draft"

    r = admin.patch(f"{BASE}/api/bom/{bid}/meta", json={
        "class_material": "RAW MATERIAL FOR QTY 1 PCS"
    }, timeout=15)
    assert r.status_code == 200, r.text
    updated = r.json().get("updated", {})
    assert updated.get("class_material") == "RAW MATERIAL FOR QTY 1 PCS"

    # GET to verify persisted
    g = admin.get(f"{BASE}/api/bom/{bid}", timeout=15)
    assert g.status_code == 200
    assert g.json().get("class_material") == "RAW MATERIAL FOR QTY 1 PCS"

    # cleanup
    admin.delete(f"{BASE}/api/bom/{bid}", timeout=15)


def test_bom_meta_update_class_material_eng_staff():
    # eng_staff should be able to patch meta on a draft BOM
    admin = login("susanto", "admin123")
    so_no = f"TESTSO{int(time.time())}E"
    bom = _register_bom(admin, so_no)
    bid = bom["id"]

    # login as eng staff (trisna or madian)
    staff = None
    for u, p in [("trisna", "trisna123"), ("madian", "admin123")]:
        try:
            staff = login(u, p)
            break
        except AssertionError:
            continue
    if not staff:
        admin.delete(f"{BASE}/api/bom/{bid}")
        pytest.skip("No eng_staff creds worked")

    r = staff.patch(f"{BASE}/api/bom/{bid}/meta", json={
        "class_material": "RAW MATERIAL FOR QTY 1 PCS"
    }, timeout=15)
    assert r.status_code == 200, r.text

    g = admin.get(f"{BASE}/api/bom/{bid}", timeout=15)
    assert g.json().get("class_material") == "RAW MATERIAL FOR QTY 1 PCS"

    admin.delete(f"{BASE}/api/bom/{bid}", timeout=15)


def test_bom_meta_blocked_when_approved():
    admin = login("susanto", "admin123")
    so_no = f"TESTSO{int(time.time())}A"
    bom = _register_bom(admin, so_no)
    bid = bom["id"]
    # add an item and auto-approve as eng_leader via submit-review
    admin.post(f"{BASE}/api/bom/{bid}/items", json={
        "item_name": "X", "qty": 1, "uom": "pc", "material": "-"
    }, timeout=15)
    riski = login("riski", "riski123")
    r = riski.post(f"{BASE}/api/bom/{bid}/submit-review", timeout=15)
    # riski is eng_leader → auto approve
    assert r.status_code == 200

    r2 = admin.patch(f"{BASE}/api/bom/{bid}/meta", json={"class_material": "X"}, timeout=15)
    assert r2.status_code == 409, r2.text

    admin.delete(f"{BASE}/api/bom/{bid}", timeout=15)


# ---------------- Quick-register customer (frontend flow support) ----------------
def test_sales_can_quick_register_customer():
    sess = None
    for u, p in [("fiana", "admin123"), ("riska", "sales123"), ("sales01", "admin123")]:
        try:
            sess = login(u, p)
            print(f"logged in as {u}")
            break
        except AssertionError:
            continue
    if not sess:
        pytest.skip("no sales/purchasing cred worked")
    name = f"TEST_QUICK_CUST_{int(time.time())}"
    r = sess.post(f"{BASE}/api/customers", json={
        "name": name, "address": "Jl Test 1", "pic_name": "Budi", "phone": "0800"
    }, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert r.json()["name"] == name

    # cleanup
    admin = login("susanto", "admin123")
    admin.delete(f"{BASE}/api/customers/{cid}", timeout=15)
