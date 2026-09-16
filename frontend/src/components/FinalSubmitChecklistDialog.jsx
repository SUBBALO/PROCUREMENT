import React, { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  CheckCircle, WarningCircle, Package, StackSimple, Cube, CurrencyDollar,
  ArrowRight, PaperPlaneRight, Lock,
} from "@phosphor-icons/react";

/**
 * FinalSubmitChecklistDialog — pengingat WAJIB saat submit drawing TERAKHIR (final) untuk 1 SO.
 * Menampilkan checklist kelengkapan dokumen SO (BOM items + Nesting/AutoCAD/Costing).
 * Item yang BELUM lengkap bisa diklik → diarahkan ke tempat upload/isi.
 * User harus mencentang konfirmasi sebelum bisa "Lanjut Submit Final".
 *
 * Props:
 *   open, status ({counts:{bom_items,nesting,cad,costing}, bom_id}), onClose,
 *   onProceed(), onGoto(target) — target: 'bom' | 'nesting' | 'cad' | 'costing'
 */
export default function FinalSubmitChecklistDialog({ open, status, onClose, onProceed, onGoto }) {
  const [confirmed, setConfirmed] = useState(false);
  const counts = status?.counts || {};

  const items = useMemo(() => ([
    { key: "bom", label: "BOM (Bill of Material)", hint: "Minimal 1 item terisi", icon: Package, ok: (counts.bom_items || 0) > 0, count: counts.bom_items || 0, target: "bom" },
    { key: "nesting", label: "File Nesting", hint: "Layout nesting (PDF/Excel)", icon: StackSimple, ok: (counts.nesting || 0) > 0, count: counts.nesting || 0, target: "nesting" },
    { key: "cad", label: "File AutoCAD (DWG)", hint: "Native CAD", icon: Cube, ok: (counts.cad || 0) > 0, count: counts.cad || 0, target: "cad" },
    { key: "costing", label: "File Costing / Price", hint: "Excel / PDF costing", icon: CurrencyDollar, ok: (counts.costing || 0) > 0, count: counts.costing || 0, target: "costing" },
  ]), [counts]);

  const missingCount = items.filter((i) => !i.ok).length;

  const handleClose = () => { setConfirmed(false); onClose?.(); };
  const handleProceed = () => { setConfirmed(false); onProceed?.(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="rounded-none sm:max-w-[560px] p-0 overflow-hidden" data-testid="final-submit-reminder-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            <Lock size={18} weight="fill" className="text-slate-700" />
            Konfirmasi Submit Final — Drawing Terakhir
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Ini drawing terakhir untuk SO ini. Setelah submit, <b>BOM &amp; Dokumen SO akan terkunci</b>.
            Pastikan semua dokumen berikut sudah lengkap (atau memang tidak diperlukan).
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-2" data-testid="final-submit-checklist">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.key}
                className={`flex items-center gap-3 border px-3 py-2.5 ${it.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                data-testid={`final-checklist-row-${it.key}`}
              >
                <Icon size={20} weight="fill" className={it.ok ? "text-emerald-600" : "text-rose-600"} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{it.label}</div>
                  <div className="text-[11px] text-slate-500">{it.hint}</div>
                </div>
                {it.ok ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    <CheckCircle size={14} weight="fill" /> Lengkap{it.count ? ` (${it.count})` : ""}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onGoto?.(it.target)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-700 border border-rose-300 bg-white hover:bg-rose-100 transition-colors duration-150"
                    data-testid={`final-checklist-goto-${it.key}`}
                  >
                    <WarningCircle size={13} weight="fill" /> Lengkapi <ArrowRight size={12} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}

          {missingCount > 0 && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2" data-testid="final-checklist-warning">
              Ada <b>{missingCount}</b> dokumen belum lengkap. Klik <b>Lengkapi</b> untuk mengunggah, atau centang konfirmasi bila memang tidak diperlukan.
            </div>
          )}

          <label className="flex items-start gap-2 pt-2 cursor-pointer select-none">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(!!v)}
              className="rounded-none mt-0.5"
              data-testid="final-checklist-confirm"
            />
            <span className="text-xs text-slate-700">
              Saya sudah memeriksa kelengkapan dokumen SO (BOM, Nesting, AutoCAD, Costing) dan siap
              melakukan <b>submit final</b>. Dokumen SO akan terkunci setelah ini.
            </span>
          </label>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            className="rounded-none border-slate-300"
            data-testid="final-submit-reminder-check-button"
          >
            Cek Dulu
          </Button>
          <Button
            onClick={handleProceed}
            disabled={!confirmed}
            className="rounded-none bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40 transition-colors duration-150 active:translate-y-[1px]"
            data-testid="final-submit-reminder-continue-button"
          >
            <PaperPlaneRight size={15} weight="bold" className="mr-1.5" />
            Lanjut Submit Final
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
