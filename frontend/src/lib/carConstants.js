// Konstanta & helper bersama untuk modul Nonconformance (CAR) — MKS-F-QAD-004.

export const CAR_STATUS_LABEL = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  closed: "Closed",
};

export const CAR_STATUS_CLS = {
  open: "bg-amber-100 text-amber-800 border-amber-500",
  assigned: "bg-sky-100 text-sky-800 border-sky-500",
  in_progress: "bg-teal-100 text-teal-800 border-teal-500",
  closed: "bg-emerald-100 text-emerald-800 border-emerald-500",
};

export const SEVERITY_LABEL = { minor: "Minor", major: "Major", critical: "Critical" };
export const SEVERITY_CLS = {
  minor: "bg-slate-100 text-slate-700 border-slate-400",
  major: "bg-amber-100 text-amber-800 border-amber-500",
  critical: "bg-rose-100 text-rose-800 border-rose-500",
};

export const SOURCE_LABEL = { in_house: "IN-HOUSE", external: "EXTERNAL" };
export const SOURCE_CLS = {
  in_house: "bg-indigo-100 text-indigo-800 border-indigo-500",
  external: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-500",
};

export const DEPT_LABEL = { qc: "QC", produksi: "Produksi", sales: "Sales" };

// Departemen tujuan (Issued To) — CAR berlaku semua dept.
export const DEPARTMENTS = [
  { key: "engineering", label: "Engineering" },
  { key: "qc", label: "Quality Control" },
  { key: "produksi", label: "Produksi" },
  { key: "sales", label: "Sales" },
  { key: "purchasing", label: "Purchasing" },
  { key: "store", label: "Store" },
  { key: "document_control", label: "Document Control" },
  { key: "finance", label: "Finance" },
  { key: "management", label: "Management" },
  { key: "other", label: "Lainnya" },
];
export const DEPT_FULL_LABEL = DEPARTMENTS.reduce((a, d) => ((a[d.key] = d.label), a), {});

export const LINK_TYPE_LABEL = { drawing: "Drawing", other: "Objek/Proses Lain" };

const ADMIN_LIKE = ["admin", "super_admin", "supervisor"];

const ROLE_DEPT = {
  eng_leader: "engineering", eng_head: "engineering", engineering: "engineering", eng_staff: "engineering",
  qc: "qc", produksi: "produksi", production: "produksi", sales: "sales",
  purchasing: "purchasing", staff: "purchasing", store: "store",
  doc_control: "document_control", document_control: "document_control",
  finance: "finance", admin: "management", super_admin: "management", supervisor: "management",
};
export const roleToDept = (role) => ROLE_DEPT[role] || "other";

export const isAdminLike = (u) => ADMIN_LIKE.includes(u?.role);
// CAR berlaku SEMUA departemen → semua user boleh menerbitkan.
export const isCarIssuer = (u) => !!u;
export const isCarQc = (u) => u?.role === "qc";
