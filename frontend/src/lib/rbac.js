/**
 * RBAC helper (frontend) — mirror aturan backend deps.py.
 * Costing Price & Harga/Riwayat Pembelian → Super Admin, Admin, Supervisor, Finance,
 * semua Engineering, Sales.
 * DWG & Customer preview-only (tanpa download) → QC, Doc Control, Store, Produksi.
 */
const COSTING_VIEW_ROLES = new Set([
  "super_admin", "admin", "supervisor", "finance",
  "engineering", "eng_head", "eng_leader", "eng_staff",
  "sales",
]);

const DRAWING_PREVIEW_ONLY_ROLES = new Set([
  "qc", "doc_control", "document_control", "store", "produksi", "production",
]);

export const PRICE_ATTACHMENT_CATEGORIES = new Set(["costing", "costing_prev", "nesting_price"]);
export const DRAWING_ATTACHMENT_CATEGORIES = new Set(["drawing", "customer_ref"]);

export function canViewCosting(role) {
  return COSTING_VIEW_ROLES.has((role || "").toLowerCase());
}

export function isDrawingPreviewOnly(role) {
  return DRAWING_PREVIEW_ONLY_ROLES.has((role || "").toLowerCase());
}
