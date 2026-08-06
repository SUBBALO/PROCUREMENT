import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";

/**
 * Standardized back navigation — cukup satu tombol "Kembali ke Halaman Sebelumnya".
 * Menggunakan browser history back().
 */
export default function BackLink({ testid = "back-link", label = "Kembali ke Halaman Sebelumnya" }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      data-testid={testid}
      className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]"
    >
      <ArrowLeft size={16} weight="bold" /> {label}
    </button>
  );
}
