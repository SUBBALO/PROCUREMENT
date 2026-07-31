"""Iter 10 tests — PDF Drawing content validation on BOM attachments.

Covers 4 cases per review request:
 (a) Upload PDF containing drawing_no → match
 (b) Upload PDF with different drawing_no → 400 mismatch with candidates
 (c) Upload PDF blank/no text-layer → 200 with warning
 (d) category != drawing → validator not triggered (upload passes)
"""
from __future__ import annotations
import io
import os
import uuid

import pytest
import requests
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


# --------- helpers ---------
def _pdf_with_text(text: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 14)
    c.drawString(100, 800, "MITRA KARYA SARANA")
    c.drawString(100, 770, "DRAWING NO:")
    c.drawString(100, 750, text)
    c.drawString(100, 720, "Rev: A")
    c.showPage()
    c.save()
    return buf.getvalue()


def _pdf_blank_image_only() -> bytes:
    """Create a PDF with no text-layer (just an empty page/image rectangle)."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    # Draw only shapes — no text objects at all → extract_text() returns empty
    c.rect(50, 50, 500, 700, fill=0)
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "riski", "password": "riski123"}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def test_bom(session):
    """Create a BOM manually with a known drawing_no (using project_dwg since validator
    falls back to project_dwg when drawing_no empty)."""
    dno = f"TEST-DWG-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "so_no": f"TEST-SO-{uuid.uuid4().hex[:6].upper()}",
        "project_name": "TEST Iter10 PDF Validation",
        "project_dwg": dno,
        "customer": "TEST_CUST",
        "class_material": "SS304",
        "delivery_date": "2026-12-31",
        "bom_date": "2026-01-15",
        "remark": "TEST_iter10",
    }
    r = session.post(f"{BASE_URL}/api/bom/register", json=payload, timeout=15)
    assert r.status_code == 200, f"BOM register failed: {r.status_code} {r.text}"
    bom = r.json()
    return {"id": bom["id"], "drawing_no": dno}


# --------- Case (a) match ---------
def test_upload_drawing_pdf_match(session, test_bom):
    pdf = _pdf_with_text(test_bom["drawing_no"])
    files = {"file": (f"drw_match.pdf", pdf, "application/pdf")}
    data = {"category": "drawing", "remark": "TEST match"}
    r = session.post(f"{BASE_URL}/api/bom/{test_bom['id']}/attachments", files=files, data=data, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("success") is True
    assert body.get("validation", {}).get("status") == "match", body


# --------- Case (b) mismatch ---------
def test_upload_drawing_pdf_mismatch(session, test_bom):
    pdf = _pdf_with_text("OTHER-DWG-9999-XYZ")
    files = {"file": ("drw_mismatch.pdf", pdf, "application/pdf")}
    data = {"category": "drawing", "remark": "TEST mismatch"}
    r = session.post(f"{BASE_URL}/api/bom/{test_bom['id']}/attachments", files=files, data=data, timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    body = r.json()
    detail = body.get("detail", {})
    # FastAPI returns detail as dict when we raise with dict
    assert isinstance(detail, dict), f"detail should be dict: {detail}"
    assert "tidak cocok" in (detail.get("message") or "").lower(), detail
    assert isinstance(detail.get("candidates"), list), detail
    assert len(detail.get("candidates")) >= 1, "candidates should list extracted dwg-like tokens"


# --------- Case (c) no text layer → warning ---------
def test_upload_drawing_pdf_no_text_layer(session, test_bom):
    pdf = _pdf_blank_image_only()
    files = {"file": ("drw_blank.pdf", pdf, "application/pdf")}
    data = {"category": "drawing", "remark": "TEST no_text"}
    r = session.post(f"{BASE_URL}/api/bom/{test_bom['id']}/attachments", files=files, data=data, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("success") is True
    assert "warning" in body and body["warning"], f"warning expected: {body}"


# --------- Case (d) other categories skip validation ---------
@pytest.mark.parametrize("category,ext,ctype", [
    ("nesting", "pdf", "application/pdf"),
    ("customer_ref", "pdf", "application/pdf"),
])
def test_upload_non_drawing_categories_skip_validation(session, test_bom, category, ext, ctype):
    # PDF with wrong drawing_no — should still upload since not category=drawing
    pdf = _pdf_with_text("TOTALLY-DIFFERENT-DWG")
    files = {"file": (f"other.{ext}", pdf, ctype)}
    data = {"category": category, "remark": f"TEST cat={category}"}
    r = session.post(f"{BASE_URL}/api/bom/{test_bom['id']}/attachments", files=files, data=data, timeout=30)
    assert r.status_code == 200, f"Expected 200 for category={category}, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("success") is True
    # Should NOT contain validation key (only 'match' status attaches it)
    assert "validation" not in body, f"validation should not be triggered for {category}: {body}"


# --------- Case (e) costing category — Excel skip validation naturally, but also PDF costing not validated ---------
def test_upload_costing_pdf_skips_validation(session, test_bom):
    pdf = _pdf_with_text("WRONG-DWG")
    files = {"file": ("cost.pdf", pdf, "application/pdf")}
    data = {"category": "costing", "remark": "TEST costing"}
    r = session.post(f"{BASE_URL}/api/bom/{test_bom['id']}/attachments", files=files, data=data, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
