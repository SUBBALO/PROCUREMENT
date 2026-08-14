/**
 * RBAC helper (frontend) — mirror aturan backend deps.py.
 * Costing Price & Harga/Riwayat Pembelian → Super Admin, Admin, Supervisor, Finance,
 * semua Engineering, Sales.
 * DWG & Customer preview-only (tanpa download) → QC, Doc Control, Store, Produksi.
 */
const COSTING_VIEW_ROLES = new Set([
  "super_admin", "admin", "supervisor", "finance",
  "engineering", "eng_head", "eng_leader", "eng_staff",
  "sales", "purchasing", "staff",
]);

const DRAWING_PREVIEW_ONLY_ROLES = new Set([
  "qc", "doc_control", "document_control", "store", "produksi", "production",
]);

// Engineering + Admin/SuperAdmin → boleh Print dari Master Drawing List.
const ENGINEERING_ROLES = new Set([
  "engineering", "eng_head", "eng_leader", "eng_staff",
]);
const PRINT_ROLES = new Set([
  ...ENGINEERING_ROLES, "admin", "super_admin",
]);

export const PRICE_ATTACHMENT_CATEGORIES = new Set(["costing", "costing_prev", "nesting_price"]);
export const DRAWING_ATTACHMENT_CATEGORIES = new Set(["drawing", "customer_ref"]);

export function canViewCosting(role) {
  return COSTING_VIEW_ROLES.has((role || "").toLowerCase());
}

export function isDrawingPreviewOnly(role) {
  return DRAWING_PREVIEW_ONLY_ROLES.has((role || "").toLowerCase());
}

export function isEngineeringRole(role) {
  return ENGINEERING_ROLES.has((role || "").toLowerCase());
}

// Master Drawing List → tombol Print hanya untuk Engineering + Admin/SuperAdmin.
export function canPrintDrawing(role) {
  return PRINT_ROLES.has((role || "").toLowerCase());
}

// Label tampilan role (untuk header, badge, dsb). Key internal tetap.
export const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  finance: "Finance",
  sales: "Sales",
  sales_head: "Direktur",
  eng_leader: "Engineering Leader",
  eng_head: "Engineering Leader",
  engineering: "Engineering",
  eng_staff: "Engineering Staff",
  purchasing: "Purchasing",
  staff: "Purchasing",
  store: "Store",
  qc: "Quality Control",
  doc_control: "Document Control",
  document_control: "Document Control",
  produksi: "Produksi",
  production: "Produksi",
};

export function roleLabel(role) {
  const r = (role || "").toLowerCase();
  return ROLE_LABELS[r] || role || "";
}

