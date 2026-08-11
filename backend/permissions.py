"""Sistem hak akses granular ala Accurate untuk ERP MKS.

- Registry modul/aktivitas + kolom aksi (create/edit/delete/report/view/list).
- Peta path -> menu_key & metode -> aksi untuk enforcement TERPUSAT.
- Aman dari regresi: hanya user yang PUNYA `access` (diatur Super Admin) yang di-enforce.
  User tanpa `access` => perilaku role lama (tidak berubah).
"""
import re

ACTIONS = ["create", "edit", "delete", "report", "view", "list"]
ACTION_LABELS = {"create": "Create", "edit": "Edit", "delete": "Delete",
                 "report": "Report", "view": "View", "list": "List"}

# Registry modul -> daftar aktivitas (key unik + label + prefix path API tanpa /api)
# `prefixes` dipakai untuk enforcement terpusat (match longest-prefix).
REGISTRY = [
    {"module": "Sales", "activities": [
        {"key": "sales_inquiry", "label": "Inquiry", "prefixes": ["/inquiries"]},
        {"key": "sales_quotation", "label": "Quotation", "prefixes": ["/quotations"]},
        {"key": "sales_order", "label": "Sales Order", "prefixes": ["/sales-orders", "/so-requests", "/so-tracker"]},
        {"key": "sales_customer", "label": "Customer", "prefixes": ["/customers"]},
    ]},
    {"module": "Engineering", "activities": [
        {"key": "eng_drawing_request", "label": "Drawing Request (DRF)", "prefixes": ["/drawing-requests"]},
        {"key": "eng_drawing_register", "label": "Drawing Register", "prefixes": ["/drawing-register", "/drawings"]},
        {"key": "eng_ecn", "label": "ECN", "prefixes": ["/ecn"]},
    ]},
    {"module": "Purchasing", "activities": [
        {"key": "pur_transfer_request", "label": "Transfer Request (TRF)", "prefixes": ["/transfer-requests", "/vendor-banks"]},
        {"key": "pur_order", "label": "Purchase Order", "prefixes": ["/orders"]},
    ]},
    {"module": "Store", "activities": [
        {"key": "store_stock", "label": "Store / Barang", "prefixes": ["/store", "/storage"]},
        {"key": "store_consumable", "label": "Consumable Request", "prefixes": ["/consumable-requests"]},
    ]},
    {"module": "Quality Control", "activities": [
        {"key": "qc_mii", "label": "Material Incoming Inspection", "prefixes": ["/qc"]},
        {"key": "qc_ncr", "label": "Non-Conformance (NCR)", "prefixes": ["/nonconformance"]},
    ]},
    {"module": "Document Control", "activities": [
        {"key": "doc_controlled", "label": "Controlled Documents", "prefixes": ["/controlled-documents"]},
        {"key": "doc_forms", "label": "Form Templates", "prefixes": ["/form-templates"]},
    ]},
    {"module": "Production", "activities": [
        {"key": "prod_bom", "label": "BOM", "prefixes": ["/bom", "/bom-attachments"]},
        {"key": "prod_costing", "label": "Material Costing", "prefixes": ["/material-costing"]},
    ]},
    {"module": "Transaksi & Lainnya", "activities": [
        {"key": "trx_transaction", "label": "Input Transaksi", "prefixes": ["/transactions"]},
        {"key": "trx_excel_tpl", "label": "Excel Templates", "prefixes": ["/excel-templates"]},
    ]},
    {"module": "Admin", "activities": [
        {"key": "adm_users", "label": "User Management", "prefixes": ["/users"]},
        {"key": "adm_backup", "label": "Backup & Restore", "prefixes": ["/backup", "/trash"]},
    ]},
]

# Bangun peta prefix -> menu_key (urut dari prefix terpanjang untuk longest-match)
_PREFIX_MAP = []
for grp in REGISTRY:
    for act in grp["activities"]:
        for p in act["prefixes"]:
            _PREFIX_MAP.append((p, act["key"]))
_PREFIX_MAP.sort(key=lambda x: len(x[0]), reverse=True)

ALL_MENU_KEYS = [a["key"] for g in REGISTRY for a in g["activities"]]

# Endpoint yang TIDAK pernah di-enforce (kebutuhan dasar semua user)
EXEMPT_PREFIXES = ["/auth", "/notifications", "/search", "/kpi", "/ai", "/legacy-import"]

_REPORT_HINT = re.compile(r"(pdf|report|export|download|print)", re.IGNORECASE)


def menu_key_for_path(path: str):
    """path tanpa prefix /api. Kembalikan menu_key atau None (tak dipetakan => bebas)."""
    for prefix, key in _PREFIX_MAP:
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "?"):
            return key
    return None


def action_for(method: str, path: str) -> str:
    m = method.upper()
    if m == "GET":
        return "report" if _REPORT_HINT.search(path) else "view"
    if m == "POST":
        return "report" if _REPORT_HINT.search(path) else "create"
    if m in ("PUT", "PATCH"):
        return "edit"
    if m == "DELETE":
        return "delete"
    return "view"


def is_exempt(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in EXEMPT_PREFIXES)


def check_access(access: dict, menu_key: str, action: str) -> bool:
    """True jika diizinkan. GET(view) juga lolos bila punya `list`; sebaliknya."""
    node = (access or {}).get(menu_key) or {}
    if node.get(action):
        return True
    if action == "view" and node.get("list"):
        return True
    if action == "list" and node.get("view"):
        return True
    return False
