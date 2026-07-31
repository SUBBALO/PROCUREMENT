import React from "react";

/**
 * Reusable sort dropdown for list tables.
 *
 * Usage:
 *   const [sortBy, setSortBy] = useState("created_desc");
 *   <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTS} />
 *   const sorted = useMemo(() => sortItems(items, sortBy, SORT_OPTS), [items, sortBy]);
 *
 * Options is an array: [{value, label, sort: (a,b) => number}]
 */
export function SortDropdown({ value, onChange, options, testid = "sort-dropdown", className = "" }) {
  return (
    <select
      data-testid={testid}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-none border border-slate-300 text-xs px-2 focus:border-emerald-600 focus:outline-none bg-white ${className}`}
      title="Urutkan"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * Apply a sort by value against the provided options array. Falls back to identity if not found.
 */
export function sortItems(items, value, options) {
  const opt = options.find((o) => o.value === value);
  if (!opt || !opt.sort) return items;
  return [...items].sort(opt.sort);
}

// Common comparator helpers
const s = (v) => (v == null ? "" : String(v));
export const cmpStr = (a, b) => s(a).localeCompare(s(b), "id", { sensitivity: "base" });
export const cmpDateStr = (a, b) => s(a).localeCompare(s(b));
export const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);

/** Preset sort option factories for common list types */
export const dateSortOpts = (dateKey = "created_at", label = "Tanggal") => [
  { value: `${dateKey}_desc`, label: `${label}: Baru → Lama`, sort: (a, b) => cmpDateStr(b[dateKey], a[dateKey]) },
  { value: `${dateKey}_asc`, label: `${label}: Lama → Baru`, sort: (a, b) => cmpDateStr(a[dateKey], b[dateKey]) },
];

export const nameSortOpts = (nameKey = "name", label = "Nama") => [
  { value: `${nameKey}_asc`, label: `${label}: A → Z`, sort: (a, b) => cmpStr(a[nameKey], b[nameKey]) },
  { value: `${nameKey}_desc`, label: `${label}: Z → A`, sort: (a, b) => cmpStr(b[nameKey], a[nameKey]) },
];
