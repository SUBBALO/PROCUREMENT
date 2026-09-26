"""Unit tests for retry/fallback resilience in temp_transactions._extract_receipt_sync.

Mocks temp_transactions._gemini() so no real Gemini API/network is used. Also
verifies the /api/temp-transactions/upload endpoint returns 400 gracefully when
GEMINI_API_KEY is empty (current workspace state).
"""
import io
import os
import sys
import types as _types

import pytest
import requests

# Make backend importable
sys.path.insert(0, "/app/backend")

from routers import temp_transactions as tt  # noqa: E402


# ---------------- Fake Gemini client ----------------
class _FakeResp:
    def __init__(self, text):
        self.text = text


class _FakeModels:
    def __init__(self, behavior):
        # behavior: callable(model, call_index) -> returns _FakeResp OR raises
        self.behavior = behavior
        self.calls = []  # list of dicts: {model, index}

    def generate_content(self, model, contents, config):
        idx = len(self.calls)
        self.calls.append({"model": model, "index": idx})
        return self.behavior(model, idx)


class _FakeClient:
    def __init__(self, behavior):
        self.models = _FakeModels(behavior)


VALID_JSON = (
    '{"vendor":"PT Contoh","date":"2026-01-01","invoice_no":"INV1",'
    '"line_items":[{"description":"Baut M12","qty":10,"unit":"pcs",'
    '"price":5000,"category":"Consumable"}]}'
)


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(tt.time, "sleep", lambda *a, **k: None)


@pytest.fixture
def install_fake(monkeypatch):
    """Return a helper that installs a fake _gemini() with given behavior. Yields
    the fake client so caller can inspect .models.calls."""
    holder = {}

    def _install(behavior):
        fake = _FakeClient(behavior)
        monkeypatch.setattr(tt, "_gemini", lambda: fake)
        holder["client"] = fake
        return fake

    return _install


# ---------------- Case A: transient then success ----------------
def test_case_a_transient_then_success(install_fake):
    def behavior(model, idx):
        if idx < 2:
            raise Exception("503 UNAVAILABLE - model is overloaded")
        return _FakeResp(VALID_JSON)

    fake = install_fake(behavior)
    out = tt._extract_receipt_sync(b"x", "image/jpeg", [])
    assert isinstance(out, dict)
    assert out["vendor"] == "PT Contoh"
    assert out["invoice_no"] == "INV1"
    assert len(out["line_items"]) == 1
    assert out["line_items"][0]["description"] == "Baut M12"
    assert out["line_items"][0]["qty"] == 10
    assert out["line_items"][0]["price"] == 5000
    # 3 calls to same (primary) model
    assert len(fake.models.calls) == 3
    assert all(c["model"] == fake.models.calls[0]["model"] for c in fake.models.calls)


# ---------------- Case B: all transient → friendly error + fallback ----------------
def test_case_b_all_transient_uses_fallback_and_friendly_error(install_fake):
    def behavior(model, idx):
        raise Exception("503 overloaded, please retry later")

    fake = install_fake(behavior)
    with pytest.raises(RuntimeError) as exc_info:
        tt._extract_receipt_sync(b"x", "image/jpeg", [])
    msg = str(exc_info.value).lower()
    assert "sibuk" in msg or "503" in msg
    # All 4 models in the fallback chain were tried
    models_tried = {c["model"] for c in fake.models.calls}
    assert len(models_tried) == 4, f"Expected all fallback models tried, got {models_tried}"
    # Primary retried 3x, each fallback tried once → 3 + 1 + 1 + 1 = 6 calls
    assert len(fake.models.calls) == 6


# ---------------- Case C: non-transient raises immediately ----------------
def test_case_c_non_transient_raises_immediately(install_fake):
    def behavior(model, idx):
        raise ValueError("invalid schema")

    fake = install_fake(behavior)
    with pytest.raises(ValueError, match="invalid schema"):
        tt._extract_receipt_sync(b"x", "image/jpeg", [])
    # Only one call — no retries, no fallback
    assert len(fake.models.calls) == 1


# ---------------- Endpoint graceful check (no GEMINI_API_KEY) ----------------
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    # Fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass


def _login_session(username, password):
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": username, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_upload_endpoint_400_when_no_api_key():
    assert BASE_URL, "REACT_APP_BACKEND_URL missing"
    session = _login_session("erwin", "erwin123")
    # Minimal 1x1 JPEG
    jpeg = bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
        "070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c"
        "1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100"
        "ffc4001f0000010501010101010100000000000000000102030405060708090a0bff"
        "c400b5100002010303020403050504040000017d01020300041105122131410613"
        "51610722711432818191a1082342b1c11552d1f02433627282090a161718191a25"
        "262728292a3435363738393a434445464748494a535455565758595a6364656667"
        "68696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6"
        "a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2"
        "e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd0ffd9"
    )
    files = {"files": ("test.jpg", io.BytesIO(jpeg), "image/jpeg")}
    r = session.post(
        f"{BASE_URL}/api/temp-transactions/upload",
        files=files,
        timeout=20,
    )
    # In workspace GEMINI_API_KEY is empty → expect 400 with detail mentioning GEMINI_API_KEY
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = (r.json().get("detail") or "").upper()
    assert "GEMINI_API_KEY" in detail, f"detail should mention GEMINI_API_KEY, got: {detail}"


def test_backend_healthy_after_tests():
    assert BASE_URL
    r = requests.get(f"{BASE_URL}/api/", timeout=10)
    assert r.status_code == 200
