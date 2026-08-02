import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Signature, ArrowClockwise, ArrowRight, FilePdf, FileText, ArrowSquareOut, Factory, ShieldCheck, CheckCircle } from "@phosphor-icons/react";

/**
 * Modal review ECN sebelum TTD — user WAJIB melihat isi ECN & drawing dulu,
 * lalu centang konfirmasi, baru bisa TTD. Tidak bisa klik TTD buta.
 */
export default function EcnReviewModal({ item, onClose, onConfirm, busy }) {
  const [reviewed, setReviewed] = useState(false);
  const [seenDrawing, setSeenDrawing] = useState(false);
  const [seenSheet, setSeenSheet] = useState(false);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  if (!item) return null;

  const openDrawing = () => {
    window.open(`${apiUrl}/api/drawings/${item.drawing_id}/pdf-stamped`, "_blank");
    setSeenDrawing(true);
  };
  const openSheet = () => {
    window.open(`${apiUrl}/api/drawings/${item.drawing_id}/ecn-sheet`, "_blank");
    setSeenSheet(true);
  };

  const StageIcon = item.stage === "production" ? Factory : ShieldCheck;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl rounded-none p-0 gap-0" data-testid="ecn-review-modal">
        <DialogHeader className="px-5 py-3 bg-violet-600 text-white">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Signature size={18} weight="bold" /> Review & TTD ECN · <span className="font-mono">{item.ecn_no}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-300 inline-flex items-center gap-1">
              <StageIcon size={12} weight="fill" /> {item.stage_label}
            </span>
            {item.production_done && item.stage === "qa_qc" && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1"><CheckCircle size={12} weight="fill" /> Produksi sudah TTD</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="No. Drawing" value={`${item.drawing_no || "-"}${item.rev_no != null ? ` · Rev ${item.rev_no}` : ""}`} />
            <Info label="Nomor SO" value={item.so_no} />
            <Info label="Customer" value={item.customer} />
            <Info label="Diajukan oleh" value={item.requested_by} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Detail Perubahan</div>
            <div className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 px-3 py-2">
              <span className="text-slate-500 line-through flex-1">{item.current_desc || "—"}</span>
              <ArrowRight size={16} weight="bold" className="text-violet-500 shrink-0" />
              <span className="text-slate-800 font-semibold flex-1">{item.proposed_desc || item.reason || "—"}</span>
            </div>
            {item.reason && <div className="text-xs text-slate-600 mt-1.5"><b>Alasan/Tujuan:</b> {item.reason}</div>}
          </div>

          {/* Wajib review: buka Drawing & Lembar ECN */}
          <div className="border border-amber-300 bg-amber-50 p-3 space-y-2">
            <div className="text-xs font-bold text-amber-800">Wajib review sebelum TTD:</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={openDrawing} variant="outline" className="rounded-none flex-1 justify-start border-slate-300" data-testid="ecn-review-open-drawing">
                <FileText size={15} weight="bold" className="mr-2 text-sky-600" /> Lihat Drawing (MKS)
                {seenDrawing && <CheckCircle size={14} weight="fill" className="ml-auto text-emerald-600" />}
                {!seenDrawing && <ArrowSquareOut size={13} className="ml-auto text-slate-400" />}
              </Button>
              <Button onClick={openSheet} variant="outline" className="rounded-none flex-1 justify-start border-slate-300" data-testid="ecn-review-open-sheet">
                <FilePdf size={15} weight="bold" className="mr-2 text-rose-600" /> Lihat Lembar ECN
                {seenSheet && <CheckCircle size={14} weight="fill" className="ml-auto text-emerald-600" />}
                {!seenSheet && <ArrowSquareOut size={13} className="ml-auto text-slate-400" />}
              </Button>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="ecn-review-confirm-check">
            <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(!!v)} className="mt-0.5" />
            <span className="text-sm text-slate-700">Saya sudah <b>membaca isi ECN dan memeriksa drawing</b> di atas, dan menyetujui perubahan ini.</span>
          </label>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300" data-testid="ecn-review-cancel">Batal</Button>
          <Button
            onClick={onConfirm}
            disabled={!reviewed || busy}
            className="rounded-none bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
            data-testid="ecn-review-sign"
          >
            {busy ? <ArrowClockwise size={15} className="animate-spin mr-1.5" /> : <Signature size={15} weight="bold" className="mr-1.5" />}
            TTD & Setuju
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
      <div className="text-slate-800 font-medium">{value || "-"}</div>
    </div>
  );
}
