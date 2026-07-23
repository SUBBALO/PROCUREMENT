"""PO auto-read via Google Gemini API (official SDK).
Uses GEMINI_API_KEY from env. Accepts image (JPG/PNG/WEBP) or PDF, returns
structured transaction fields matching TransactionCreate model."""
import json
import logging
import os
import re
import tempfile
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from deps import require_write

router = APIRouter(tags=["ai"])
logger = logging.getLogger(__name__)


PARSE_PROMPT = """Kamu adalah asisten yang membaca Purchase Order (PO) dari dokumen scan/foto/PDF (bahasa Indonesia atau Inggris).

Ekstrak informasi berikut dan kembalikan **HANYA JSON valid** (tanpa markdown, tanpa komentar):
{
  "vendor_name": "string — nama toko/supplier/PT",
  "po_no": "string — nomor PO",
  "po_date": "YYYY-MM-DD",
  "invoice_no": "string — nomor invoice jika ada, else empty",
  "invoice_date": "YYYY-MM-DD atau kosong",
  "currency": "IDR|SGD|USD",
  "exchange_rate": number (1 untuk IDR),
  "items": [
    { "item_name": "string", "qty": number, "unit": "Ea|Pcs|Set|Lot|Kg|Ltr|Mtr|Box|Roll", "unit_price": number }
  ]
}

Aturan:
- Tanggal Indonesia (12-01-2026, 12 Januari 2026) → konversi ke YYYY-MM-DD.
- Jika mata uang tidak jelas (angka besar tanpa simbol), asumsikan IDR.
- Jika ada simbol SGD/S$, exchange_rate=12000. Jika USD/$, exchange_rate=16000. Default IDR rate=1.
- Angka Indonesia (250.000 = 250000, 1.500,50 = 1500.50) — normalisasi ke float murni.
- Field kosong = string kosong ""; jangan null.
- Jika PO tidak terbaca, return {"error": "PO tidak terbaca"}."""


def _extract_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        text = m.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


async def _pdf_to_image_bytes(pdf_bytes: bytes) -> bytes:
    try:
        import fitz
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF butuh PyMuPDF. Sementara upload JPG/PNG saja.")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if doc.page_count == 0:
        raise HTTPException(status_code=400, detail="PDF kosong")
    page = doc.load_page(0)
    pix = page.get_pixmap(dpi=200)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


@router.post("/transactions/parse-po")
async def parse_po(file: UploadFile = File(...), current: dict = Depends(require_write)):
    """Parse PO image/PDF via Google Gemini API (official SDK)."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY tidak di-set di env")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File terlalu besar (max 10MB)")

    filename = (file.filename or "").lower()
    ct = (file.content_type or "").lower()

    if filename.endswith(".pdf") or "pdf" in ct:
        img_bytes = await _pdf_to_image_bytes(content)
        mime = "image/png"
        suffix = ".png"
    elif filename.endswith((".jpg", ".jpeg")) or "jpeg" in ct:
        img_bytes = content; mime = "image/jpeg"; suffix = ".jpg"
    elif filename.endswith(".png") or "png" in ct:
        img_bytes = content; mime = "image/png"; suffix = ".png"
    elif filename.endswith(".webp") or "webp" in ct:
        img_bytes = content; mime = "image/webp"; suffix = ".webp"
    else:
        raise HTTPException(status_code=400, detail="Format tidak didukung. Upload JPG/PNG/WEBP/PDF")

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model="gemini-flash-latest",
            contents=[
                PARSE_PROMPT,
                types.Part.from_bytes(data=img_bytes, mime_type=mime),
            ],
        )
        raw = resp.text if hasattr(resp, "text") else str(resp)
        logger.info(f"Gemini PO parse raw (first 300): {raw[:300]}")

        try:
            parsed = _extract_json(raw)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM response bukan JSON valid: {e}. Raw: {raw[:200]}")

        if "error" in parsed:
            raise HTTPException(status_code=422, detail=parsed["error"])

        currency = str(parsed.get("currency", "IDR")).upper()
        if currency not in ("IDR", "SGD", "USD"):
            currency = "IDR"
        try:
            rate = float(parsed.get("exchange_rate") or 1)
        except Exception:
            rate = 1.0
        if currency == "IDR":
            rate = 1.0

        items = []
        for it in (parsed.get("items") or []):
            if not it.get("item_name"):
                continue
            try:
                qty = float(it.get("qty") or 0)
                up = float(it.get("unit_price") or 0)
            except Exception:
                continue
            items.append({
                "item_name": str(it["item_name"]).strip(),
                "qty": qty, "unit": str(it.get("unit") or "Ea"),
                "unit_price": up, "total_price": qty * up,
            })

        return {
            "vendor_name": str(parsed.get("vendor_name") or "").strip(),
            "po_no": str(parsed.get("po_no") or "").strip(),
            "po_date": str(parsed.get("po_date") or "").strip(),
            "invoice_no": str(parsed.get("invoice_no") or "").strip(),
            "invoice_date": str(parsed.get("invoice_date") or "").strip(),
            "currency": currency,
            "exchange_rate": rate,
            "items": items,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Gemini parse failed")
        raise HTTPException(status_code=500, detail=f"Gemini error: {e}")
