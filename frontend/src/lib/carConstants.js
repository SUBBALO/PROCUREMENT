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

const ADMIN_LIKE = ["admin", "super_admin", "supervisor"];
const ENG_LEADER = ["eng_leader", "eng_head", "engineering"];
const ENG_ALL = ["eng_leader", "eng_head", "engineering", "eng_staff"];
const ISSUER = ["qc", "produksi", "production", "sales"];

export const isAdminLike = (u) => ADMIN_LIKE.includes(u?.role);
export const isCarLeader = (u) => ENG_LEADER.includes(u?.role) || isAdminLike(u);
export const isCarEng = (u) => ENG_ALL.includes(u?.role);
export const isCarIssuer = (u) => ISSUER.includes(u?.role) || isAdminLike(u);
export const isCarQc = (u) => u?.role === "qc";
