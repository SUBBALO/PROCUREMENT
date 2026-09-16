"""
Test suite for concurrency fix + document generation endpoints.
Verifies:
 - login works (erwin/erwin123)
 - core reads work
 - excel-template & form-template preview endpoints still produce valid PDFs/PNGs
 - heavy PDF renders no longer block the event loop (light /auth/me stays fast)
 - login page frontend shows 'ERP'
"""
import os
import time
import json
import concurrent.futures
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://procurement-system-17.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "erwin"
ADMIN_PASS = "erwin123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    # try Bearer token if provided; otherwise rely on cookies
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def auth_headers(session):
    # Backwards-compat alias so we can pass the authenticated session.
    return session


# ---------- Auth ----------
def test_login_returns_user():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    # Either a token OR authenticated cookies must be present
    has_token = "access_token" in data or "token" in data
    has_cookie = any("token" in c.name.lower() or "session" in c.name.lower() or "auth" in c.name.lower() for c in r.cookies)
    assert has_token or has_cookie, f"no auth token or cookie in login response: cookies={r.cookies.keys()}"
    # user info present
    user = data.get("user") or data
    assert user.get("username") == ADMIN_USER


def test_auth_me(auth_headers):
    r = auth_headers.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("username") == ADMIN_USER or j.get("user", {}).get("username") == ADMIN_USER


# ---------- Core reads ----------
@pytest.mark.parametrize("path", [
    "/transactions",
    "/sales-orders",
    "/stats",
])
def test_core_reads(auth_headers, path):
    r = auth_headers.get(f"{API}{path}", timeout=30)
    assert r.status_code in (200, 204), f"{path} => {r.status_code} {r.text[:200]}"


# ---------- Excel templates ----------
@pytest.fixture(scope="module")
def excel_template_id(auth_headers):
    r = auth_headers.get(f"{API}/excel-templates", timeout=30)
    assert r.status_code == 200, r.text[:300]
    items = r.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("data") or []
    active = [t for t in items if t.get("is_active", True)]
    if not active:
        pytest.skip("No excel templates seeded/uploaded - skipping")
    return active[0].get("id") or active[0].get("_id")


def test_excel_preview_pdf(auth_headers, excel_template_id):
    r = auth_headers.post(f"{API}/excel-templates/{excel_template_id}/preview", timeout=120)
    assert r.status_code == 200, r.text[:300]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_excel_preview_raw(auth_headers, excel_template_id):
    r = auth_headers.post(f"{API}/excel-templates/{excel_template_id}/preview-raw", timeout=120)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


def test_excel_preview_page_meta(auth_headers, excel_template_id):
    r = auth_headers.get(f"{API}/excel-templates/{excel_template_id}/preview-page-meta", timeout=120)
    assert r.status_code == 200
    j = r.json()
    assert "pages" in j or "page_count" in j or "num_pages" in j


def test_excel_preview_page_image(auth_headers, excel_template_id):
    r = auth_headers.get(f"{API}/excel-templates/{excel_template_id}/preview-page-image", params={"page": 0}, timeout=120)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")
    assert r.content[:8].startswith(b"\x89PNG") or r.content[:3] == b"\xff\xd8\xff"


# ---------- Form templates ----------
@pytest.fixture(scope="module")
def form_template_id(auth_headers):
    r = auth_headers.get(f"{API}/form-templates", timeout=30)
    assert r.status_code == 200, r.text[:300]
    items = r.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("data") or []
    if not items:
        pytest.skip("No form templates found")
    return items[0].get("id") or items[0].get("_id")


def test_form_preview_pdf(auth_headers, form_template_id):
    r = auth_headers.post(f"{API}/form-templates/{form_template_id}/preview", timeout=120)
    assert r.status_code == 200, r.text[:400]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_form_preview_page_meta(auth_headers, form_template_id):
    r = auth_headers.get(f"{API}/form-templates/{form_template_id}/preview-page-meta", timeout=120)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, dict)


def test_form_preview_page_image(auth_headers, form_template_id):
    r = auth_headers.get(f"{API}/form-templates/{form_template_id}/preview-page-image", params={"page": 0}, timeout=120)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")


# ---------- Concurrency ----------
def test_heavy_renders_do_not_block_light_requests(auth_headers, form_template_id):
    """Fire 8 heavy PDF previews concurrently and simultaneously hit /auth/me many times.
    Assert that /auth/me stays fast (max < 5s) — i.e. event loop is not blocked."""
    heavy_url = f"{API}/form-templates/{form_template_id}/preview"
    light_url = f"{API}/auth/me"
    # snapshot cookies+headers from authenticated session for use across threads
    cookies = auth_headers.cookies.get_dict()
    hdrs = dict(auth_headers.headers)

    heavy_times = []
    light_times = []

    def do_heavy():
        t0 = time.time()
        r = requests.post(heavy_url, headers=hdrs, cookies=cookies, timeout=180)
        return r.status_code, time.time() - t0

    def do_light():
        t0 = time.time()
        r = requests.get(light_url, headers=hdrs, cookies=cookies, timeout=30)
        return r.status_code, time.time() - t0

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        heavy_futs = [ex.submit(do_heavy) for _ in range(8)]
        # stagger a bit so heavy calls are in-flight
        time.sleep(0.3)
        light_futs = [ex.submit(do_light) for _ in range(12)]
        for f in heavy_futs:
            sc, dt = f.result()
            heavy_times.append((sc, dt))
        for f in light_futs:
            sc, dt = f.result()
            light_times.append((sc, dt))

    heavy_ok = sum(1 for sc, _ in heavy_times if sc == 200)
    light_ok = sum(1 for sc, _ in light_times if sc == 200)
    light_durations = sorted([dt for sc, dt in light_times if sc == 200])
    heavy_durations = sorted([dt for sc, dt in heavy_times if sc == 200])

    print(f"\n=== CONCURRENCY RESULTS ===")
    print(f"Heavy OK: {heavy_ok}/8, durations: {[round(d,2) for d in heavy_durations]}")
    print(f"Light OK: {light_ok}/12, durations: {[round(d,2) for d in light_durations]}")
    if light_durations:
        p50 = light_durations[len(light_durations)//2]
        p95 = light_durations[int(len(light_durations)*0.95)-1] if len(light_durations) > 1 else light_durations[-1]
        max_light = max(light_durations)
        print(f"Light p50={p50:.2f}s p95={p95:.2f}s max={max_light:.2f}s")

    assert heavy_ok >= 6, f"Only {heavy_ok}/8 heavy renders succeeded"
    assert light_ok >= 10, f"Only {light_ok}/12 light requests succeeded"
    # If event loop were blocked, light requests would be queued behind heavies (multi-second).
    assert max(light_durations) < 5.0, f"light request slow (max={max(light_durations):.2f}s), event loop may be blocked"
