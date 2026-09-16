import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass, ChatText, Receipt, ListChecks, ShoppingCart, Truck, Storefront, Buildings, Package, X, ArrowRight } from "@phosphor-icons/react";
import api from "../lib/api";

/**
 * Global cross-module search — opens on Cmd/Ctrl+K.
 * Fetches /api/search/global?q=... and lets user jump to any inquiry/quotation/BOM/SO/vendor/item.
 */
const ICONS = {
  inquiry: ChatText,
  quotation: Receipt,
  bom: ListChecks,
  sales_order: ShoppingCart,
  purchase: ShoppingCart,
  delivery: Truck,
  vendor: Buildings,
  item: Package,
};

const TYPE_COLORS = {
  inquiry: "text-rose-600 border-rose-200 bg-rose-50",
  quotation: "text-emerald-600 border-emerald-200 bg-emerald-50",
  bom: "text-amber-600 border-amber-200 bg-amber-50",
  sales_order: "text-sky-600 border-sky-200 bg-sky-50",
  vendor: "text-violet-600 border-violet-200 bg-violet-50",
  item: "text-slate-600 border-slate-200 bg-slate-50",
};

const TYPE_LABEL = {
  inquiry: "Inquiry",
  quotation: "Quotation",
  bom: "BOM",
  sales_order: "Sales Order",
  vendor: "Vendor",
  item: "Item",
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Register global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      setActiveIdx(0);
    } else {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Debounced search
  const runSearch = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/search/global?q=${encodeURIComponent(query.trim())}`);
      setResults(data.results || []);
      setActiveIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const goTo = (r) => {
    setOpen(false);
    const path = r.search_param && r.search_value
      ? `${r.link}?${r.search_param}=${encodeURIComponent(r.search_value)}`
      : r.link;
    navigate(path);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      e.preventDefault();
      goTo(results[activeIdx]);
    }
  };

  return (
    <>
      {/* Trigger button in navbar */}
      <button
        data-testid="global-search-trigger"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.1em] font-semibold text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-3 py-1.5 bg-white transition-colors"
        title="Cari (Ctrl+K)"
      >
        <MagnifyingGlass size={14} weight="bold" />
        <span className="hidden sm:inline">Cari</span>
        <kbd className="hidden md:inline text-[10px] font-mono bg-slate-100 border border-slate-300 rounded px-1 text-slate-500">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-4"
          onClick={() => setOpen(false)}
          data-testid="global-search-overlay"
        >
          <div
            className="w-full max-w-2xl bg-white border border-slate-300 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <MagnifyingGlass size={18} weight="bold" className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                data-testid="global-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Cari inquiry, quotation, BOM, SO, vendor, atau item…"
                className="flex-1 border-0 outline-none text-sm placeholder:text-slate-400 bg-transparent"
              />
              {q && (
                <button onClick={() => setQ("")} className="p-1 text-slate-400 hover:text-slate-900">
                  <X size={14} weight="bold" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-900" title="Tutup (Esc)">
                <kbd className="text-[10px] font-mono bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5">Esc</kbd>
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {loading && (
                <div className="p-6 text-center text-xs text-slate-400 italic">Mencari…</div>
              )}
              {!loading && q.trim().length >= 2 && results.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-400">
                  <MagnifyingGlass size={28} weight="duotone" className="inline text-slate-300 mb-2" />
                  <div>Tidak ada hasil untuk <b className="text-slate-600 font-mono">"{q}"</b></div>
                </div>
              )}
              {!loading && q.trim().length < 2 && (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  Ketik minimal 2 huruf untuk mulai mencari…
                </div>
              )}

              {!loading && results.map((r, idx) => {
                const Icon = ICONS[r.type] || Package;
                const cls = TYPE_COLORS[r.type] || TYPE_COLORS.item;
                const active = idx === activeIdx;
                return (
                  <button
                    key={`${r.type}-${r.id}-${idx}`}
                    data-testid={`search-result-${idx}`}
                    onClick={() => goTo(r)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 flex items-center gap-3 group ${active ? "bg-slate-50" : "hover:bg-slate-50"}`}
                  >
                    <div className={`w-9 h-9 flex items-center justify-center border ${cls} shrink-0`}>
                      <Icon size={16} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-[9px] uppercase tracking-[0.15em] font-bold ${cls.split(" ")[0]}`}>
                          {TYPE_LABEL[r.type] || r.type}
                        </span>
                        <span className="font-mono font-bold text-sm text-slate-900 truncate">{r.title}</span>
                      </div>
                      <div className="text-xs text-slate-600 truncate">{r.subtitle}</div>
                      {r.meta && <div className="text-[10px] text-slate-400 truncate">{r.meta}</div>}
                    </div>
                    <ArrowRight size={14} weight="bold" className={`shrink-0 text-slate-300 ${active ? "text-slate-900 translate-x-1" : ""} transition-all`} />
                  </button>
                );
              })}
            </div>

            {/* Footer legend */}
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">
              <div className="flex items-center gap-3">
                <span><kbd className="font-mono bg-white border border-slate-300 rounded px-1">↑↓</kbd> navigasi</span>
                <span><kbd className="font-mono bg-white border border-slate-300 rounded px-1">Enter</kbd> buka</span>
                <span><kbd className="font-mono bg-white border border-slate-300 rounded px-1">Esc</kbd> tutup</span>
              </div>
              <div className="text-slate-400">{results.length} hasil</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
