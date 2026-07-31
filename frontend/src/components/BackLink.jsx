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
      className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900 transition-colors"
    >
      <ArrowLeft size={12} weight="bold" /> {label}
    </button>
  );
}
