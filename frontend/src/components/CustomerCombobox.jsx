import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { CaretDown, Check, Plus, MagnifyingGlass, X } from "@phosphor-icons/react";

/**
 * CustomerCombobox
 * Autocomplete dropdown untuk memilih Master Customer.
 * - value: nama customer terpilih (string)
 * - onChange: (name, customerObj?) => void
 * - placeholder, className, disabled, testId opsional
 * - allowCreate: (default true) show "+ Tambah Customer Baru" jika tidak match
 */
export default function CustomerCombobox({
  value,
  onChange,
  placeholder = "Cari / pilih customer...",
  className = "",
  disabled = false,
  testId = "customer-combobox",
  allowCreate = true,
  autoFocus = false,
}) {
  const { user } = useAuth();
  const canCreateRole = ["sales", "admin", "super_admin", "supervisor"].includes(user?.role || "");
  const showCreate = allowCreate && canCreateRole;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/customers", { params: { limit: 500 } });
      setCustomers(data?.items || []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.pic || "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  const exactMatch = useMemo(
    () =>
      customers.find(
        (c) => (c.name || "").toLowerCase() === (query || "").trim().toLowerCase(),
      ),
    [customers, query],
  );

  const pick = (name, obj) => {
    onChange(name, obj);
    setQuery("");
    setOpen(false);
  };

  const createCustomer = async () => {
    const name = (query || "").trim();
    if (!name) return;
    if (exactMatch) return pick(exactMatch.name, exactMatch);
    setCreating(true);
    try {
      const { data } = await api.post("/customers", { name });
      toast.success(`Customer "${data.name}" dibuat`);
      // Refresh list
      await loadCustomers();
      pick(data.name, data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal buat customer");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`} data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        data-testid={`${testId}-trigger`}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        className="w-full h-9 px-3 border border-slate-300 rounded-none bg-white text-left text-sm flex items-center justify-between hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? "text-slate-900 truncate" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              data-testid={`${testId}-clear`}
              onClick={(e) => {
                e.stopPropagation();
                onChange("", null);
              }}
              className="p-0.5 hover:bg-slate-100 rounded"
              title="Clear"
            >
              <X size={12} weight="bold" className="text-slate-500" />
            </span>
          )}
          <CaretDown size={12} weight="bold" className="text-slate-500" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-300 shadow-lg rounded-none">
          <div className="flex items-center border-b border-slate-200 px-2">
            <MagnifyingGlass size={14} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              data-testid={`${testId}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ketik nama customer..."
              className="h-9 px-2 text-sm w-full focus:outline-none bg-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length > 0) {
                    pick(filtered[0].name, filtered[0]);
                  } else if (showCreate && query.trim()) {
                    createCustomer();
                  }
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-60 overflow-y-auto" data-testid={`${testId}-list`}>
            {loading ? (
              <div className="p-3 text-xs text-slate-500 text-center">Memuat...</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-xs text-slate-500 text-center">
                {query ? `Tidak ada customer cocok "${query}"` : "Belum ada data customer"}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id || c.name}
                  type="button"
                  data-testid={`${testId}-opt-${c.name}`}
                  onClick={() => pick(c.name, c)}
                  className="w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center justify-between border-b border-slate-100"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-900 truncate">{c.name}</div>
                    {c.pic && <div className="text-[11px] text-slate-500 truncate">PIC: {c.pic}</div>}
                  </div>
                  {value === c.name && <Check size={14} weight="bold" className="text-emerald-600 shrink-0" />}
                </button>
              ))
            )}
          </div>
          {showCreate && query.trim() && !exactMatch && (
            <button
              type="button"
              disabled={creating}
              data-testid={`${testId}-create`}
              onClick={createCustomer}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sky-700 hover:bg-sky-50 border-t border-slate-200 font-semibold uppercase tracking-wide disabled:opacity-50"
            >
              <Plus size={12} weight="bold" />
              {creating ? "Menyimpan..." : `Tambah customer baru: "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
