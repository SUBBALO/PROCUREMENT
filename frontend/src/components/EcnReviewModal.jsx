import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Signature, ArrowClockwise, ArrowRight, FilePdf, FileText, Eye, Factory, ShieldCheck, CheckCircle } from "@phosphor-icons/react";
import InlinePdfImageViewer from "./InlinePdfImageViewer";

/**
 * Modal review ECN sebelum TTD — user WAJIB melihat isi ECN & drawing dulu (preview inline
 * berbasis GAMBAR / image-based, konsisten lintas browser & view-only tanpa download),
 * lalu centang konfirmasi, baru bisa TTD. Tidak bisa klik TTD buta.
 */
export default function EcnReviewModal({ item, onClose, onConfirm, busy }) {
  const [reviewed, setReviewed] = useState(false);
  const [view, setView] = useState("sheet");
  const [seen, setSeen] = useState({ drawing: false, sheet: true });
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  if (!item) return null;

  const StageIcon = item.stage === "production" ? Factory : ShieldCheck;

  const showTab = (t) => { setView(t); setSeen((s) => ({ ...s, [t]: true })); };

  const TabBtn = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => showTab(id)}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${
        view === id ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
      data-testid={`ecn-review-tab-${id}`}
    >
      <Icon size={15} weight="bold" /> {label}
      {seen[id] && <CheckCircle size={13} weight="fill" className="text-emerald-500" />}
    </button>
  );

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl rounded-none p-0 gap-0" data-testid="ecn-review-modal">
        <DialogHeader className="px-5 py-3 bg-violet-600 text-white">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Signature size={18} weight="bold" /> Review &amp; TTD ECN · <span className="font-mono">{item.ecn_no}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Kiri: detail ECN */}
          <div className="p-4 space-y-3 border-r border-slate-200 max-h-[74vh] overflow-y-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-300 inline-flex items-center gap-1">
                <StageIcon size={12} weight="fill" /> {item.stage_label}
              </span>
              {item.production_done && item.stage === "qa_qc" && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1"><CheckCircle size={12} weight="fill" /> Produksi OK</span>
              )}
            </div>
            <Info label="No. Drawing" value={`${item.drawing_no || "-"}${item.rev_no != null ? ` · Rev ${item.rev_no}` : ""}`} />
            <Info label="Nomor SO" value={item.so_no} />
            <Info label="Customer" value={item.customer} />
            <Info label="Diajukan oleh" value={item.requested_by} />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Detail Perubahan</div>
              <div className="text-sm bg-slate-50 border border-slate-200 px-2 py-2 space-y-1">
                <div className="text-slate-500 line-through">{item.current_desc || "—"}</div>
                <div className="flex items-center gap-1 text-violet-600 text-xs font-bold"><ArrowRight size={12} weight="bold" /> menjadi</div>
                <div className="text-slate-800 font-semibold">{item.proposed_desc || item.reason || "—"}</div>
              </div>
              {item.reason && <div className="text-xs text-slate-600 mt-1.5"><b>Alasan:</b> {item.reason}</div>}
            </div>
          </div>

          {/* Kanan: preview inline berbasis gambar (view-only, tanpa download) */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center border-b border-slate-200 px-2 bg-slate-50">
              <TabBtn id="drawing" icon={FileText} label="Drawing (MKS)" />
              <TabBtn id="sheet" icon={FilePdf} label="Lembar ECN" />
              <div className="flex-1" />
              <span className="text-[10px] text-slate-400 inline-flex items-center gap-1 pr-2 uppercase tracking-wider font-bold" data-testid="ecn-review-viewonly">
                <Eye size={13} weight="bold" /> Baca-saja
              </span>
            </div>
            {view === "drawing" ? (
              <InlinePdfImageViewer
                key="drawing"
                metaUrl={`/drawings/${item.drawing_id}/page-meta?target=mks`}
                pageUrlBuilder={(n) => `${apiUrl}/api/drawings/${item.drawing_id}/page-image?target=mks&page=${n}&scale=2&stamped=1`}
                emptyMessage="File MKS belum diunggah untuk drawing ini."
                className="h-[60vh]"
              />
            ) : (
              <InlinePdfImageViewer
                key="sheet"
                metaUrl={`/drawings/${item.drawing_id}/ecn-sheet/page-meta`}
                pageUrlBuilder={(n) => `${apiUrl}/api/drawings/${item.drawing_id}/ecn-sheet/page-image?page=${n}&scale=2`}
                emptyMessage="Lembar ECN belum tersedia."
                className="h-[60vh]"
              />
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="ecn-review-confirm-check">
            <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(!!v)} className="mt-0.5" />
            <span className="text-sm text-slate-700 max-w-md">Saya sudah <b>membaca isi ECN & memeriksa drawing</b>, dan menyetujui perubahan ini.</span>
          </label>
          <div className="flex justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300" data-testid="ecn-review-cancel">Batal</Button>
            <Button
              onClick={onConfirm}
              disabled={!reviewed || busy}
              className="rounded-none bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
              data-testid="ecn-review-sign"
            >
              {busy ? <ArrowClockwise size={15} className="animate-spin mr-1.5" /> : <Signature size={15} weight="bold" className="mr-1.5" />}
              TTD &amp; Setuju
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
      <div className="text-slate-800 font-medium text-sm">{value || "-"}</div>
    </div>
  );
}
