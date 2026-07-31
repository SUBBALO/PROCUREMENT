import React, { useState } from "react";
import { X, FileText, Article, Eye } from "@phosphor-icons/react";

/**
 * DrawingViewOnlyModal — preview drawing MKS + drawing Customer secara VIEW-ONLY.
 * Dipakai oleh QC: baca dokumen tanpa tombol download.
 * PDF di-embed via <iframe> dengan parameter #toolbar=0&navpanes=0 untuk menyembunyikan
 * toolbar bawaan browser (termasuk tombol download/print) di Chrome/Edge.
 */
export default function DrawingViewOnlyModal({ drawing, onClose }) {
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const hasCustomer = !!drawing.customer_ref_file_id;
  const [tab, setTab] = useState("mks");

  const mksUrl = `${apiUrl}/api/drawings/${drawing.id}/pdf-stamped#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
  const custUrl = `${apiUrl}/api/drawings/${drawing.id}/customer-ref/preview#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-3" data-testid="qc-view-modal">
      <div className="bg-white w-full max-w-5xl h-[90vh] flex flex-col border border-slate-300 shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center gap-3">
          <Eye size={18} weight="fill" className="text-emerald-400" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Preview View-Only (tanpa download)</div>
            <div className="font-mono font-bold truncate">{drawing.drawing_no}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded" data-testid="qc-view-close" aria-label="Tutup">
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setTab("mks")}
            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px ${tab === "mks" ? "border-emerald-600 text-emerald-700 bg-white" : "border-transparent text-slate-400 hover:text-slate-600"}`}
            data-testid="qc-view-tab-mks"
          >
            <FileText size={15} weight="fill" /> Drawing MKS
          </button>
          <button
            onClick={() => setTab("customer")}
            disabled={!hasCustomer}
            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px disabled:opacity-40 disabled:cursor-not-allowed ${tab === "customer" ? "border-emerald-600 text-emerald-700 bg-white" : "border-transparent text-slate-400 hover:text-slate-600"}`}
            data-testid="qc-view-tab-customer"
          >
            <Article size={15} weight="fill" /> Drawing Customer {!hasCustomer && "(tidak ada)"}
          </button>
        </div>

        {/* Body — embedded PDF */}
        <div className="flex-1 bg-slate-200 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
          {tab === "mks" && (
            <iframe
              key="mks"
              src={mksUrl}
              title="Drawing MKS"
              className="w-full h-full border-0"
              data-testid="qc-view-iframe-mks"
            />
          )}
          {tab === "customer" && hasCustomer && (
            <iframe
              key="customer"
              src={custUrl}
              title="Drawing Customer"
              className="w-full h-full border-0"
              data-testid="qc-view-iframe-customer"
            />
          )}
          {tab === "customer" && !hasCustomer && (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Tidak ada drawing customer untuk drawing ini.
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
          Mode baca saja — QC memeriksa dimensi, tolerance & spesifikasi material. Setelah OK, tutup preview lalu klik <b>TTD &amp; Approve</b>.
        </div>
      </div>
    </div>
  );
}
