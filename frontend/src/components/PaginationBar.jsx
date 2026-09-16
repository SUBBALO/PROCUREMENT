import React, { useMemo, useState, useEffect } from "react";

/**
 * usePagination — hook untuk membagi array menjadi halaman.
 * @param {Array} data - data lengkap (setelah filter/search)
 * @param {number} defaultPerPage
 * @returns { page, setPage, perPage, setPerPage, pageCount, pagedData }
 */
export function usePagination(data, defaultPerPage = 20) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const total = Array.isArray(data) ? data.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // Reset ke page 1 jika data mengecil / filter berubah
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [pageCount, page]);

  const pagedData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const start = (page - 1) * perPage;
    return data.slice(start, start + perPage);
  }, [data, page, perPage]);

  return { page, setPage, perPage, setPerPage, pageCount, pagedData, total };
}

/**
 * PaginationBar — compact style: ‹ 1 / N ›  + dropdown per-page (10/20/50/100)
 * Auto-hide when total <= perPage (nothing to paginate).
 */
export default function PaginationBar({
  page,
  setPage,
  perPage,
  setPerPage,
  pageCount,
  total,
  label = "baris",
  showAlwaysPerPage = true,
  className = "",
  testIdPrefix = "pagination",
}) {
  if (!total && !showAlwaysPerPage) return null;

  const goto = (n) => {
    const v = Math.max(1, Math.min(pageCount, Number(n) || 1));
    setPage(v);
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 justify-between text-xs text-slate-600 px-2 py-1.5 border-t bg-slate-50 ${className}`}
      data-testid={`${testIdPrefix}-bar`}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">Total: {total.toLocaleString("id-ID")} {label}</span>
        <span className="text-slate-400">•</span>
        <label className="flex items-center gap-1">
          Baris/hal:
          <select
            className="border rounded px-1 py-0.5 bg-white text-xs"
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            data-testid={`${testIdPrefix}-per-page`}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="px-2 py-0.5 rounded border bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => goto(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          data-testid={`${testIdPrefix}-prev`}
        >
          ‹
        </button>
        <input
          type="number"
          min={1}
          max={pageCount}
          value={page}
          onChange={(e) => setPage(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))}
          className="w-12 border rounded px-1 py-0.5 text-center bg-white text-xs"
          data-testid={`${testIdPrefix}-page-input`}
        />
        <span className="text-slate-500">/ {pageCount}</span>
        <button
          type="button"
          className="px-2 py-0.5 rounded border bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => goto(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          data-testid={`${testIdPrefix}-next`}
        >
          ›
        </button>
      </div>
    </div>
  );
}
