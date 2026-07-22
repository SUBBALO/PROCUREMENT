"""PO auto-read via Gemini 3 Flash Vision.
Uses Emergent LLM key from env. Accepts image (JPG/PNG/WEBP) or PDF, returns
structured transaction fields matching TransactionCreate model."""
import base64
import io
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
    {
      "item_name": "string",
      "qty": number,
      "unit": "Ea|Pcs|Set|Lot|Kg|Ltr|Mtr|Box|Roll",
      "unit_price": number
    }
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
    """Extract JSON object from LLM response, tolerant of code fences."""
    text = text.strip()
    # Try fenced block first
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        text = m.group(1)
    # Find outermost {...}
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


async def _pdf_to_image_bytes(pdf_bytes: bytes) -> bytes:
    """Render first page of PDF to PNG bytes. Uses openpyxl-free path.
    Requires pdf2image or pymupdf. We use pymupdf (fitz) if available, else raise."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PDF support butuh PyMuPDF. Install: pip install pymupdf. Sementara upload JPG/PNG saja."
        )
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if doc.page_count == 0:
        raise HTTPException(status_code=400, detail="PDF kosong")
    page = doc.load_page(0)
    pix = page.get_pixmap(dpi=200)  # decent resolution for OCR
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


@router.post("/transactions/parse-po")
async def parse_po(file: UploadFile = File(...), current: dict = Depends(require_write)):
    """Parse a PO image or PDF via Gemini 3 Flash. Returns extracted transaction data.
    Frontend shows the result for user to review before saving.
    Access: admin + staff only (finance and store cannot spend LLM quota)."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY tidak di-set di env")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File terlalu besar (max 10MB)")

    filename = (file.filename or "").lower()
    ct = (file.content_type or "").lower()

    # Convert PDF to PNG (first page); pass through image formats
    if filename.endswith(".pdf") or "pdf" in ct:
        img_bytes = await _pdf_to_image_bytes(content)
        mime = "image/png"
        suffix = ".png"
    elif filename.endswith((".jpg", ".jpeg")) or "jpeg" in ct:
        img_bytes = content
        mime = "image/jpeg"
        suffix = ".jpg"
    elif filename.endswith(".png") or "png" in ct:
        img_bytes = content
        mime = "image/png"
        suffix = ".png"
    elif filename.endswith(".webp") or "webp" in ct:
        img_bytes = content
        mime = "image/webp"
        suffix = ".webp"
    else:
        raise HTTPException(status_code=400, detail="Format tidak didukung. Upload JPG/PNG/WEBP/PDF")

    # emergentintegrations' Gemini path prefers file path — write to temp
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(img_bytes)
            tmp_path = tmp.name

        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

        chat = LlmChat(
            api_key=api_key,
            session_id=f"po-parse-{uuid.uuid4()}",
            system_message="You are a precise document extraction assistant. Return only valid JSON.",
        ).with_model("gemini", "gemini-3-flash-preview")

        file_content = FileContentWithMimeType(file_path=tmp_path, mime_type=mime)
        msg = UserMessage(text=PARSE_PROMPT, file_contents=[file_content])
        # Non-streaming; we need the whole result to parse JSON
        resp = await chat.send_message(msg)
        raw = resp if isinstance(resp, str) else str(resp)
        logger.info(f"Gemini PO parse raw response (first 300 chars): {raw[:300]}")

        try:
            parsed = _extract_json(raw)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM response bukan JSON valid: {e}. Raw: {raw[:200]}")

        if "error" in parsed:
            raise HTTPException(status_code=422, detail=parsed["error"])

        # Sanitize + defaults
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
                "qty": qty,
                "unit": str(it.get("unit") or "Ea"),
                "unit_price": up,
                "total_price": qty * up,
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
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
