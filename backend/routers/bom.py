"""Bill of Material (BOM) module.

Engineering / Admin upload BOM Excel (.xls or .xlsx) → parsed & stored as a revision.
Search by SO No. History of all revisions kept indefinitely. Admin can annotate items
with Available Stock, Qty Purchase, Purchase Due Date, and Remark.
"""
import io
import uuid
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from db import db
from deps import (
    get_current_user,
    log_action,
    require_bom_admin,
    require_bom_upload,
)


router = APIRouter(prefix="/bom", tags=["bom"])


# ------------------------------ Models ------------------------------
class BOMItem(BaseModel):
    item_no: int
    item_name: str
    item_specification: str = ""
    qty: float = 0.0
    uom: str = ""
    material: str = ""
    weight_kg: Optional[float] = None
    remark: str = ""  # e.g. "P1", "P2", "P1&P2"


class BOMAnnotation(BaseModel):
    item_no: int
    available_stock: Optional[float] = None
    qty_purchase: Optional[float] = None
    purchase_due_date: Optional[str] = None
    admin_remark: str = ""


class BOMAnnotationsUpdate(BaseModel):
    annotations: List[BOMAnnotation]


# ------------------------------ Helpers ------------------------------
def _excel_serial_to_iso(v) -> Optional[str]:
    """Convert an Excel date serial number to ISO date string. Excel epoch = 1899-12-30."""
    try:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            s = v.strip().replace(":", "").strip()
            if not s:
                return None
            # Try common formats
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
                try:
                    return datetime.strptime(s, fmt).date().isoformat()
                except ValueError:
                    continue
            return s
        n = float(v)
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=n)).date().isoformat()
    except Exception:
        return None


def _clean_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip().lstrip(":").strip()


def _parse_bom_workbook(rows: List[List]) -> dict:
    """Parse a 2D list of rows (already extracted from either .xls or .xlsx) into BOM header+items.

    Row layout matches the MKS BOM template:
      R4: [TO, ...] ... [BOM.NO., '', ':NNN']
      R5: [DATE, ':dd/mm/yyyy'] ...  [REV.NO., '', ':N']
      R7: labels (PROJECT, ENG.DRW., CUSTOMER, CLASS OF MATERIAL, SO.NO., DELIVERY DATE)
      R8: header values
      R9: item column headers
      R11..: item rows until a blank row or 'NOTES :' row
    """
    def cell(r, c):
        try:
            return rows[r - 1][c - 1]
        except IndexError:
            return ""

    def find_row(startswith_text: str, max_rows: int = 20) -> int:
        for i in range(1, min(max_rows, len(rows)) + 1):
            for j in range(1, min(6, len(rows[i - 1])) + 1):
                v = _clean_str(cell(i, j))
                if v and v.upper().startswith(startswith_text.upper()):
                    return i
        return -1

    header = {}

    # BOM.NO and REV.NO are on R4 and R5 respectively, in columns 12-14
    header["bom_no"] = _clean_str(cell(4, 14) or cell(4, 13) or cell(4, 12))
    header["rev_no_raw"] = _clean_str(cell(5, 14) or cell(5, 13) or cell(5, 12))
    header["to"] = _clean_str(cell(4, 2))
    header["date"] = _excel_serial_to_iso(cell(5, 2)) or _clean_str(cell(5, 2))

    # R7 = labels, R8 = values (columns are shifted per template)
    header["project_name"] = _clean_str(cell(8, 1))
    header["project_dwg"] = _clean_str(cell(8, 4))
    header["customer"] = _clean_str(cell(8, 7))
    header["class_material"] = _clean_str(cell(8, 11))
    header["so_no"] = _clean_str(cell(8, 14))
    header["delivery_date"] = _excel_serial_to_iso(cell(8, 16)) or _clean_str(cell(8, 16))

    # Fallback: if SO no still empty, scan header rows for any col with numeric value
    if not header["so_no"]:
        for c in range(13, 17):
            v = _clean_str(cell(8, c))
            if v and v.isdigit():
                header["so_no"] = v
                break

    # Items start at row 11, stop when either blank or "NOTES" prefix
    items: List[dict] = []
    for r in range(11, len(rows) + 1):
        no_raw = cell(r, 1)
        # stop marker: 'NOTES : ...' anywhere on the row's first col
        first_col = _clean_str(no_raw)
        if first_col.upper().startswith("NOTES") or first_col.upper().startswith("TOTAL WEIGHT"):
            break
        # skip completely-blank rows
        if all((_clean_str(cell(r, c)) == "") for c in range(1, min(18, len(rows[r - 1]) + 1) if rows[r - 1] else 1)):
            continue
        try:
            item_no = int(float(no_raw)) if no_raw not in ("", None) else None
        except (ValueError, TypeError):
            item_no = None
        if item_no is None:
            continue
        items.append({
            "item_no": item_no,
            "item_name": _clean_str(cell(r, 2)),
            "item_specification": _clean_str(cell(r, 3)),
            "qty": float(cell(r, 8) or 0),
            "uom": _clean_str(cell(r, 9)),
            "material": _clean_str(cell(r, 11)),
            "weight_kg": (float(cell(r, 12)) if cell(r, 12) not in ("", None) else None),
            "remark": _clean_str(cell(r, 17)),
        })

    return {"header": header, "items": items}


def _read_workbook(content: bytes, filename: str) -> List[List]:
    """Read either .xls or .xlsx bytes and return a 2D list of cell values."""
    fname = filename.lower()
    if fname.endswith(".xlsx"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
        return [[ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
                for r in range(1, ws.max_row + 1)]
    elif fname.endswith(".xls"):
        import xlrd
        wb = xlrd.open_workbook(file_contents=content)
        ws = wb.sheet_by_index(0)
        return [[ws.cell_value(r, c) for c in range(ws.ncols)] for r in range(ws.nrows)]
    else:
        raise HTTPException(status_code=400, detail="Format tidak didukung. Gunakan .xls atau .xlsx")


# ------------------------------ Endpoints ------------------------------
@router.get("/preparers")
async def bom_preparers(current: dict = Depends(get_current_user)):
    """Distinct list of previously-entered `prepared_by` names for autocomplete."""
    names = await db.boms.distinct("prepared_by")
    return sorted({str(n).strip() for n in names if n and str(n).strip()})


@router.post("/upload")
async def upload_bom(
    file: UploadFile = File(...),
    prepared_by: str = Form(...),
    revision_reason: str = Form(""),
    current: dict = Depends(require_bom_upload),
):
    """Upload a BOM Excel. If SO_NO already exists, auto-creates next revision.
    `prepared_by` is REQUIRED — since Engineering shares one login for 7 people,
    the actual creator name is captured here for audit history.
    `revision_reason` is required for revisions beyond the first."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama file tidak ada")
    if not prepared_by or not prepared_by.strip():
        raise HTTPException(status_code=400, detail="Nama Pembuat BOM wajib diisi")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File kosong")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File terlalu besar (max 10 MB)")

    try:
        rows = _read_workbook(content, file.filename)
        parsed = _parse_bom_workbook(rows)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal parse file: {e}")

    so_no = (parsed["header"].get("so_no") or "").strip()
    if not so_no:
        raise HTTPException(status_code=400, detail="Nomor SO tidak ditemukan di file. Pastikan cell 'PT MKS SO.NO.' terisi.")

    if len(parsed["items"]) == 0:
        raise HTTPException(status_code=400, detail="Tidak ada item terbaca. Periksa format file.")

    # Determine revision
    latest = await db.boms.find_one({"so_no": so_no}, sort=[("rev_no", -1)])
    next_rev = 0 if not latest else int(latest.get("rev_no", 0)) + 1

    if next_rev > 0 and not revision_reason.strip():
        # SO already exists → prompt user for revision reason (frontend catches 409 and shows inline input)
        raise HTTPException(
            status_code=409,
            detail={
                "code": "revision_reason_required",
                "so_no": so_no,
                "latest_rev": int(latest.get("rev_no", 0)),
                "latest_uploaded_by": latest.get("uploaded_by_name") or "",
                "latest_uploaded_at": latest.get("uploaded_at", "")[:19].replace("T", " "),
                "latest_prepared_by": latest.get("prepared_by") or "",
                "message": f"Nomor SO {so_no} sudah ada di database (Rev.{latest.get('rev_no')} diupload oleh {latest.get('uploaded_by_name')} pada {latest.get('uploaded_at','')[:10]}). Silakan isi alasan revisi untuk melanjutkan.",
            },
        )

    doc = {
        "id": str(uuid.uuid4()),
        "so_no": so_no,
        "rev_no": next_rev,
        "bom_no": parsed["header"].get("bom_no") or "",
        "project_name": parsed["header"].get("project_name") or "",
        "project_dwg": parsed["header"].get("project_dwg") or "",
        "customer": parsed["header"].get("customer") or "",
        "class_material": parsed["header"].get("class_material") or "",
        "delivery_date": parsed["header"].get("delivery_date") or "",
        "bom_date": parsed["header"].get("date") or "",
        "prepared_by": prepared_by.strip(),
        "items": parsed["items"],
        "annotations": {},  # keyed by str(item_no) → {available_stock, qty_purchase, purchase_due_date, admin_remark}
        "revision_reason": revision_reason.strip(),
        "uploaded_by_id": current.get("id"),
        "uploaded_by_name": current.get("name") or current.get("username"),
        "uploaded_by_role": current.get("role"),
        "uploaded_at": datetime.utcnow().isoformat(),
        "original_filename": file.filename,
    }
    await db.boms.insert_one(doc)
    await log_action(current, "upload_bom", "bom", doc["id"], {"so_no": so_no, "rev_no": next_rev})

    doc.pop("_id", None)
    return {"success": True, "bom": doc, "message": f"BOM tersimpan sebagai Rev.{next_rev}"}


@router.get("")
async def list_or_search_bom(
    so_no: Optional[str] = None,
    q: Optional[str] = None,
    rev: str = "latest",  # 'latest' | 'all'
    limit: int = 200,
    current: dict = Depends(get_current_user),
):
    """List BOMs. Filters:
      - `so_no`: exact match on SO (backward compat)
      - `q`: fuzzy substring search across so_no / customer / project_name (case-insensitive)
    rev='latest' returns only newest rev per SO. rev='all' returns every revision."""
    import re
    filt: dict = {}
    if so_no:
        filt["so_no"] = so_no.strip()
    elif q and q.strip():
        pattern = re.escape(q.strip())
        rx = {"$regex": pattern, "$options": "i"}
        filt["$or"] = [{"so_no": rx}, {"customer": rx}, {"project_name": rx}]

    if rev == "latest":
        # Aggregation: group by so_no, take max rev
        pipeline = []
        if filt:
            pipeline.append({"$match": filt})
        pipeline.extend([
            {"$sort": {"so_no": 1, "rev_no": -1}},
            {"$group": {"_id": "$so_no", "doc": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$doc"}},
            {"$sort": {"uploaded_at": -1}},
            {"$limit": limit},
        ])
        docs = await db.boms.aggregate(pipeline).to_list(length=limit)
    else:
        docs = await db.boms.find(filt).sort([("so_no", 1), ("rev_no", -1)]).limit(limit).to_list(length=limit)

    for d in docs:
        d.pop("_id", None)
    return {"items": docs, "total": len(docs)}


@router.get("/history/{so_no}")
async def bom_history(so_no: str, current: dict = Depends(get_current_user)):
    """Return every revision for a given SO, newest first."""
    docs = await db.boms.find({"so_no": so_no.strip()}).sort("rev_no", -1).to_list(length=200)
    for d in docs:
        d.pop("_id", None)
    return {"so_no": so_no, "count": len(docs), "revisions": docs}


@router.get("/{bom_id}")
async def get_bom(bom_id: str, current: dict = Depends(get_current_user)):
    doc = await db.boms.find_one({"id": bom_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="BOM tidak ditemukan")
    return doc


@router.patch("/{bom_id}/annotations")
async def update_bom_annotations(
    bom_id: str,
    payload: BOMAnnotationsUpdate,
    current: dict = Depends(require_bom_admin),
):
    """Admin fills Available Stock / Qty Purchase / Purchase Due Date / Remark per item.
    Sends full list; server replaces annotations map."""
    bom = await db.boms.find_one({"id": bom_id})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM tidak ditemukan")

    ann_map = {}
    for a in payload.annotations:
        ann_map[str(a.item_no)] = {
            "available_stock": a.available_stock,
            "qty_purchase": a.qty_purchase,
            "purchase_due_date": a.purchase_due_date,
            "admin_remark": a.admin_remark,
            "updated_at": datetime.utcnow().isoformat(),
            "updated_by": current.get("name") or current.get("username"),
        }
    await db.boms.update_one({"id": bom_id}, {"$set": {"annotations": ann_map}})
    await log_action(current, "annotate_bom", "bom", bom_id, {"count": len(ann_map)})
    return {"success": True, "annotations": ann_map}


@router.delete("/{bom_id}")
async def delete_bom(bom_id: str, current: dict = Depends(require_bom_admin)):
    """Admin can delete a specific BOM revision (rarely used, e.g. mistake upload)."""
    res = await db.boms.delete_one({"id": bom_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="BOM tidak ditemukan")
    await log_action(current, "delete_bom", "bom", bom_id, {})
    return {"success": True}
