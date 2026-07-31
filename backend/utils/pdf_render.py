"""Utility render PDF bytes → metadata halaman & gambar PNG per halaman.
Dipakai lintas modul (drawing, lampiran BOM, MII, template) untuk viewer image-based."""
import io
import fitz  # PyMuPDF


def pdf_page_meta(raw: bytes) -> dict:
    """Balikkan {pages, sizes:[{w,h}]} dari bytes PDF."""
    doc = fitz.open(stream=raw, filetype="pdf")
    sizes = [{"w": p.rect.width, "h": p.rect.height} for p in doc]
    n = doc.page_count
    doc.close()
    return {"pages": n, "sizes": sizes}


def pdf_page_png(raw: bytes, page: int = 0, scale: float = 2.0) -> bytes:
    """Render satu halaman PDF (0-indexed) menjadi PNG bytes."""
    doc = fitz.open(stream=raw, filetype="pdf")
    if page < 0 or page >= doc.page_count:
        doc.close()
        raise IndexError("Halaman di luar jangkauan")
    pg = doc[page]
    mat = fitz.Matrix(scale, scale)
    pix = pg.get_pixmap(matrix=mat, alpha=False)
    out = pix.tobytes("png")
    doc.close()
    return out
