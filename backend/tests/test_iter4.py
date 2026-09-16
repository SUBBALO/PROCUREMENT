"""Iteration 4 backend tests.
Covers:
- GET /api/stats/monthly
- GET /api/deliveries/autocomplete
- POST /api/sales-orders/import/xlsx (staff+admin allowed; finance/store 403; duplicate skip)
- POST /api/deliveries with DeliveryItem.so_no
- Store role read-only on /api/sales-orders
- POST /api/transactions/parse-po (Gemini 3 Flash)
"""
import io
import os
import uuid
from datetime import datetime

import pytest
import requests
from openpyxl import Workbook

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _login(u, p):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, f"login {u} failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("susanto", "admin123")


@pytest.fixture(scope="module")
def staff():
    return _login("staff01", "staff123")


@pytest.fixture(scope="module")
def store():
    return _login("store01", "store123")


@pytest.fixture(scope="module")
def finance():
    return _login("finance01", "finance123")


# ---------- Monthly stats ----------
class TestStatsMonthly:
    def test_shape(self, admin):
        r = admin.get(f"{API}/stats/monthly")
        assert r.status_code == 200
        d = r.json()
        assert "period" in d and "start" in d["period"] and "end" in d["period"]
        assert "total_amount_idr" in d
        assert "transactions" in d
        assert "po_count" in d
        # period.start = first day of current month
        now = datetime.now()
        assert d["period"]["start"] == now.replace(day=1).date().isoformat()
        assert d["period"]["end"] == now.date().isoformat()
        # types
        assert isinstance(d["transactions"], int)
        assert isinstance(d["po_count"], int)
        assert isinstance(d["total_amount_idr"], (int, float))

    def test_finance_can_view(self, finance):
        r = finance.get(f"{API}/stats/monthly")
        assert r.status_code == 200

    def test_store_can_view(self, store):
        r = store.get(f"{API}/stats/monthly")
        assert r.status_code == 200

    def test_unauth(self):
        r = requests.get(f"{API}/stats/monthly")
        assert r.status_code == 401


# ---------- Deliveries autocomplete ----------
class TestDeliveryAutocomplete:
    def test_authenticated(self, admin):
        r = admin.get(f"{API}/deliveries/autocomplete")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("destinations"), list)
        assert isinstance(d.get("drivers"), list)
        # no empty strings
        assert all(x for x in d["destinations"])
        assert all(x for x in d["drivers"])

    def test_finance_can_view(self, finance):
        r = finance.get(f"{API}/deliveries/autocomplete")
        assert r.status_code == 200

    def test_unauth(self):
        r = requests.get(f"{API}/deliveries/autocomplete")
        assert r.status_code == 401

    def test_reflects_created_delivery(self, admin, store):
        dest = f"TEST_DEST_{uuid.uuid4().hex[:6]}"
        drv = f"TEST_DRV_{uuid.uuid4().hex[:6]}"
        payload = {
            "delivery_date": "2026-01-05",
            "gate_pass_no": "GP-TEST-1",
            "do_no": "DO-TEST-1",
            "destination": dest,
            "driver_name": drv,
            "items": [{"item_name": "TEST_ITEM_AC", "qty": 2, "unit": "Ea", "so_no": "SO-AC-1"}],
            "remark": "",
        }
        r = store.post(f"{API}/deliveries", json=payload)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        try:
            r2 = admin.get(f"{API}/deliveries/autocomplete")
            d2 = r2.json()
            assert dest in d2["destinations"]
            assert drv in d2["drivers"]
        finally:
            admin.delete(f"{API}/deliveries/{did}")


# ---------- Delivery items with so_no ----------
class TestDeliveryItemSoNo:
    def test_so_no_stored_and_retrieved(self, admin, store):
        so_val = f"TEST_SO_{uuid.uuid4().hex[:6]}"
        payload = {
            "delivery_date": "2026-01-06",
            "gate_pass_no": "GP-TEST-2",
            "do_no": "DO-TEST-2",
            "destination": "TEST_DEST_SO",
            "driver_name": "TEST_DRV_SO",
            "items": [
                {"item_name": "TEST_ITEM_A", "qty": 1, "unit": "Ea", "so_no": so_val},
                {"item_name": "TEST_ITEM_B", "qty": 3, "unit": "Pcs", "so_no": ""},
            ],
            "remark": "",
        }
        r = store.post(f"{API}/deliveries", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["items"]) == 2
        assert d["items"][0]["so_no"] == so_val
        assert d["items"][1]["so_no"] == ""
        did = d["id"]
        try:
            # verify retrievable via list
            r2 = admin.get(f"{API}/deliveries", params={"q": "TEST_DEST_SO"})
            items = r2.json()["items"]
            found = next((x for x in items if x["id"] == did), None)
            assert found is not None
            assert found["items"][0]["so_no"] == so_val
        finally:
            admin.delete(f"{API}/deliveries/{did}")


# ---------- SO Access ----------
class TestSOAccess:
    def test_store_can_get_sales_orders(self, store):
        r = store.get(f"{API}/sales-orders")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_store_cannot_post_so(self, store):
        r = store.post(f"{API}/sales-orders", json={
            "so_no": f"TEST_SO_STORE_{uuid.uuid4().hex[:4]}",
            "so_date": "2026-01-01", "customer": "X", "description": ""})
        assert r.status_code == 403

    def test_store_cannot_delete_so(self, admin, store):
        # create as admin first
        so_no = f"TEST_SO_DEL_{uuid.uuid4().hex[:4]}"
        r = admin.post(f"{API}/sales-orders", json={
            "so_no": so_no, "so_date": "2026-01-01", "customer": "X", "description": ""})
        assert r.status_code == 200
        sid = r.json()["id"]
        try:
            r2 = store.delete(f"{API}/sales-orders/{sid}")
            assert r2.status_code == 403
        finally:
            admin.delete(f"{API}/sales-orders/{sid}")

    def test_store_cannot_put_so(self, admin, store):
        so_no = f"TEST_SO_PUT_{uuid.uuid4().hex[:4]}"
        r = admin.post(f"{API}/sales-orders", json={
            "so_no": so_no, "so_date": "2026-01-01", "customer": "X", "description": ""})
        sid = r.json()["id"]
        try:
            r2 = store.put(f"{API}/sales-orders/{sid}", json={
                "so_no": so_no, "so_date": "2026-01-01", "customer": "Y", "description": ""})
            assert r2.status_code == 403
        finally:
            admin.delete(f"{API}/sales-orders/{sid}")


# ---------- SO import xlsx ----------
def _make_so_xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.append(["Nomor SO", "Tanggal", "Customer", "Description"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


class TestSOImportXlsx:
    def test_admin_import_and_skip_duplicates(self, admin):
        so_a = f"TEST_SOX_{uuid.uuid4().hex[:6]}"
        so_b = f"TEST_SOX_{uuid.uuid4().hex[:6]}"
        buf = _make_so_xlsx([
            [so_a, "2026-01-05", "Cust A", "desc a"],
            [so_b, "2026-01-06", "Cust B", "desc b"],
        ])
        r = admin.post(
            f"{API}/sales-orders/import/xlsx",
            files={"file": ("sos.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 2
        assert d["skipped_duplicates"] == 0

        # re-upload -> duplicates skipped
        buf.seek(0)
        r2 = admin.post(
            f"{API}/sales-orders/import/xlsx",
            files={"file": ("sos.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["inserted"] == 0
        assert d2["skipped_duplicates"] == 2

        # cleanup
        lst = admin.get(f"{API}/sales-orders", params={"q": "TEST_SOX_"}).json()
        for so in lst:
            admin.delete(f"{API}/sales-orders/{so['id']}")

    def test_staff_can_import(self, staff, admin):
        so_no = f"TEST_STAFFSO_{uuid.uuid4().hex[:6]}"
        buf = _make_so_xlsx([[so_no, "2026-01-05", "Cust", ""]])
        r = staff.post(
            f"{API}/sales-orders/import/xlsx",
            files={"file": ("sos.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1
        # cleanup
        lst = admin.get(f"{API}/sales-orders", params={"q": so_no}).json()
        for so in lst:
            admin.delete(f"{API}/sales-orders/{so['id']}")

    def test_finance_cannot_import(self, finance):
        buf = _make_so_xlsx([["TEST_FINSO_1", "2026-01-05", "X", ""]])
        r = finance.post(
            f"{API}/sales-orders/import/xlsx",
            files={"file": ("sos.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 403

    def test_store_cannot_import(self, store):
        buf = _make_so_xlsx([["TEST_STORESO_1", "2026-01-05", "X", ""]])
        r = store.post(
            f"{API}/sales-orders/import/xlsx",
            files={"file": ("sos.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 403


# ---------- Parse PO ----------
def _make_po_png():
    """Create a PNG with realistic PO text using Pillow."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (900, 700), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        font_small = font
    d.text((30, 20), "PURCHASE ORDER", fill="black", font=font)
    d.text((30, 60), "Vendor: CV BAJA PRIMA", fill="black", font=font_small)
    d.text((30, 90), "PO No: PO/2026/01/9876", fill="black", font=font_small)
    d.text((30, 120), "PO Date: 2026-01-15", fill="black", font=font_small)
    d.text((30, 160), "Currency: IDR", fill="black", font=font_small)
    d.text((30, 210), "Items:", fill="black", font=font)
    d.text((30, 250), "1. Besi Beton 10mm  Qty: 100  Unit: Pcs  Price: 25000", fill="black", font=font_small)
    d.text((30, 285), "2. Semen Gresik 50kg  Qty: 20  Unit: Box  Price: 75000", fill="black", font=font_small)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestParsePO:
    def test_unauth(self):
        r = requests.post(f"{API}/transactions/parse-po",
                          files={"file": ("a.png", b"x", "image/png")})
        assert r.status_code == 401

    def test_unsupported_format(self, admin):
        r = admin.post(
            f"{API}/transactions/parse-po",
            files={"file": ("a.txt", b"hello world", "text/plain")},
        )
        assert r.status_code == 400
        assert "Format tidak didukung" in r.json().get("detail", "")

    def test_empty_file(self, admin):
        r = admin.post(
            f"{API}/transactions/parse-po",
            files={"file": ("a.png", b"", "image/png")},
        )
        assert r.status_code == 400
        assert "kosong" in r.json().get("detail", "").lower()

    def test_valid_png_returns_fields(self, admin):
        png = _make_po_png()
        r = admin.post(
            f"{API}/transactions/parse-po",
            files={"file": ("po.png", png, "image/png")},
            timeout=90,
        )
        if r.status_code == 500 and "EMERGENT_LLM_KEY" in r.text:
            pytest.skip("EMERGENT_LLM_KEY not set")
        assert r.status_code == 200, f"parse-po failed: {r.status_code} {r.text[:500]}"
        d = r.json()
        # required fields present
        for k in ("vendor_name", "po_no", "po_date", "items", "currency", "exchange_rate"):
            assert k in d, f"missing key {k} in {d}"
        assert isinstance(d["items"], list)
        # At least some content extracted
        assert d["vendor_name"] or d["po_no"] or len(d["items"]) > 0, f"empty extraction: {d}"
