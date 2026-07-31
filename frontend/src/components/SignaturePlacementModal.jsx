import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Warning, Info } from "@phosphor-icons/react";
import PdfStampCanvas from "./PdfStampCanvas";

/**
 * SignaturePlacementModal
 *
 * Approver (Eng Head / QC / Sales) klik "Approve" → modal ini terbuka:
 *   1. Preview PDF drawing (page 1, atau bisa pilih page lain)
 *   2. Klik posisi di PDF untuk letakkan TTD
 *   3. Pilih ukuran (S / M / L) sesuai besar kolom TTD
 *   4. Optional: catatan
 *   5. Klik "Konfirmasi & TTD" → POST /drawings/{id}/approve/{stage}
 *
 * Props:
 *   - drawing: { id, drawing_no, file_id }
 *   - stage: "eng_head" | "qc" | "sales"
 *   - onDone: callback setelah sukses
 *   - onClose: batal
 */
export default function SignaturePlacementModal({ drawing, stage, onDone, onClose }) {
  const { user } = useAuth();
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const sigUrl = `${apiUrl}/api/users/${user.id}/signature`;

  const [hasSig, setHasSig] = useState(null);
  // Iter 40 — placements per-halaman: { [pageNum]: {x,y} }. Key "-1" = semua halaman (mode sama).
  const [placements, setPlacements] = useState({});
  const [size, setSize] = useState("M");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [sameAll, setSameAll] = useState(false);

  const placementList = Object.entries(placements).map(([p, v]) => ({ page: Number(p), x: v.x, y: v.y }));
  const hasPlacement = placementList.length > 0;

  // Iter 20d — Sales TTD wajib input data SO Stamp Produksi (auto-fill ke Salma)
  const isSalesStage = stage === "sales";
  const [soData, setSoData] = useState({
    so_no: drawing.so_no || "",
    po_no: "",
    qty: drawing.qty_order ? `${drawing.qty_order} ${drawing.unit_order || "pcs"}` : "",
    customer: drawing.customer_name || drawing.customer_code || "",
    received_date: new Date().toISOString().slice(0, 10),
    due_date: drawing.expected_due_date || "",
  });
  const setSO = (k, v) => setSoData((s) => ({ ...s, [k]: v }));

  // Iter 22 — Marker preview diperkecil supaya konsisten dengan PDF (kolom title block kecil)
  const sigDims = { S: { w: 4, h: 1.8 }, M: { w: 5.5, h: 2.4 }, L: { w: 8, h: 3.4 } }; // percent of canvas width

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/users/me/signature-meta");
        setHasSig(!!data.has_signature);
      } catch { setHasSig(false); }
    })();
  }, []);

  const onPick = (page, xRel, yRel) => {
    if (sameAll) {
      setPlacements({ "-1": { x: xRel, y: yRel } });
    } else {
      setPlacements((prev) => ({ ...prev, [page]: { x: xRel, y: yRel } }));
    }
  };

  const removePlacement = (page) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[page];
      return next;
    });
  };

  const toggleSameAll = (checked) => {
    setSameAll(checked);
    setPlacements({}); // reset saat ganti mode agar tidak campur
  };

  const doApprove = async () => {
    if (!hasPlacement) return toast.error("Klik posisi TTD di PDF dulu (bisa beda tiap halaman)");
    // Iter 20d — Validasi field SO Data untuk Sales TTD
    if (isSalesStage) {
      if (!soData.so_no.trim()) return toast.error("MKS S.O No wajib diisi (untuk SO Stamp Produksi)");
      if (!soData.qty.trim()) return toast.error("Qty wajib diisi");
    }
    setBusy(true);
    try {
      const placementsPayload = placementList.map((p) => ({ page: p.page, x: p.x, y: p.y, size }));
      const payload = {
        notes: notes.trim(),
        placements: placementsPayload,
        // legacy fields (backward compat) dari placement pertama
        stamp_x: placementList[0].x,
        stamp_y: placementList[0].y,
        stamp_page: placementList[0].page,
        stamp_size: size,
      };
      if (isSalesStage) payload.so_stamp_data = soData;
      // Iter 22 — stage "submit" pakai endpoint submit-for-approval (Prepared By TTD)
      const url = stage === "submit"
        ? `/drawings/${drawing.id}/submit-for-approval`
        : `/drawings/${drawing.id}/approve/${stage}`;
      const { data } = await api.post(url, payload);
      const label = stage === "submit" ? "Prepared By" : stage;
      toast.success(`✓ TTD ${label} berhasil → status: ${data.approval_status}`);
      onDone?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal approve");
    } finally { setBusy(false); }
  };

  const STAGE_LABEL = {
    submit: "Prepared By — Engineer",
    eng_head: "Engineering Head (Riski)",
    qc: "Quality Control (QC)",
    sales: "Sales Approval",
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" data-testid="signature-placement-modal">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-emerald-900 text-white">
        <div>
          <div className="text-[10px] uppercase tracking-widest opacity-80">TTD Digital Drawing — {STAGE_LABEL[stage] || stage}</div>
          <div className="font-mono font-bold text-sm">{drawing.drawing_no}</div>
        </div>
        <div className="text-xs opacity-90">
          {!hasPlacement ? (
            <span className="animate-pulse">👆 Scroll & klik area di PDF untuk letakkan TTD (boleh beda posisi tiap halaman)</span>
          ) : sameAll ? (
            <span>Posisi SAMA di semua halaman · Ukuran <b>{size}</b></span>
          ) : (
            <span>TTD di <b>{placementList.length}</b> halaman: {placementList.map((p) => `Hal.${p.page + 1}`).join(", ")} · Ukuran <b>{size}</b></span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-bold bg-slate-600 hover:bg-slate-500 text-white uppercase tracking-widest"
            data-testid="sig-cancel-btn"
          >
            ✕ Batal
          </button>
          <button
            onClick={doApprove}
            disabled={!hasPlacement || !hasSig || busy}
            className="px-3 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="sig-confirm-approve-btn"
          >
            {busy ? "..." : "✓ Konfirmasi & TTD"}
          </button>
        </div>
      </div>

      {/* Iter 20d — Sales TTD wajib isi data SO untuk auto-fill ke SO Stamp Produksi */}
      {isSalesStage && (
        <div className="px-4 py-3 bg-amber-50 border-b-2 border-amber-500">
          <div className="text-[10px] uppercase tracking-widest font-bold text-amber-800 mb-2">
            📋 Data SO untuk Produksi (auto-terisi di SO Stamp Salma)
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "so_no", lbl: "MKS S.O No *", ph: "4000" },
              { k: "po_no", lbl: "P/O No", ph: "PO-12345" },
              { k: "qty", lbl: "Qty *", ph: "10 pcs" },
              { k: "customer", lbl: "Customer", ph: "THIES, PT" },
              { k: "received_date", lbl: "Received", type: "date" },
              { k: "due_date", lbl: "Due Date", type: "date" },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">{f.lbl}</label>
                <input
                  type={f.type || "text"}
                  value={soData[f.k]}
                  onChange={(e) => setSO(f.k, e.target.value)}
                  placeholder={f.ph || ""}
                  className="w-full h-7 px-2 text-xs bg-white border border-amber-300 focus:border-amber-600 outline-none"
                  data-testid={`sig-so-${f.k}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signature not uploaded warning */}
      {hasSig === false && (
        <div className="p-3 bg-amber-100 border-b-2 border-amber-500 text-amber-900 flex items-center gap-2 text-sm">
          <Warning size={18} weight="fill" />
          <div className="flex-1">
            Anda belum upload TTD digital. Silakan upload dulu di halaman{" "}
            <a href="/profile/signature" target="_blank" rel="noreferrer" className="underline font-bold hover:text-amber-950">My Profile → Tanda Tangan</a>.
          </div>
        </div>
      )}

      {/* Toolbar bawah header — size selector + notes */}
      <div className="px-4 py-2 bg-slate-800 text-white flex items-center gap-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Ukuran TTD:</span>
          {["S", "M", "L"].map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`px-3 py-1 text-xs font-bold uppercase transition ${size === s ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              data-testid={`sig-size-${s}`}
              title={s === "S" ? "Kecil (55×22 pt) - kolom sempit" : s === "M" ? "Sedang (75×30 pt) - default" : "Besar (110×44 pt) - kolom lapang"}
            >
              {s === "S" ? "S · Kecil" : s === "M" ? "M · Sedang" : "L · Besar"}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Catatan (opsional):</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Dimensi sudah OK"
            className="flex-1 h-7 px-2 text-xs bg-slate-900 border border-slate-600 text-white focus:border-emerald-500 outline-none"
            data-testid="sig-notes-input"
          />
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="TTD ditempel di setiap halaman PDF pada posisi yang sama">
            <input
              type="checkbox"
              checked={sameAll}
              onChange={(e) => toggleSameAll(e.target.checked)}
              className="accent-emerald-500 w-3.5 h-3.5"
              data-testid="sig-apply-all-pages"
            />
            <span className="uppercase tracking-widest font-bold text-emerald-300">Posisi sama di semua halaman</span>
          </label>
          <span className="flex items-center gap-1"><Info size={12} /> {sameAll ? "Klik 1x → berlaku semua halaman" : "Klik tiap halaman untuk posisi masing-masing"}</span>
        </div>
      </div>

      {/* Daftar halaman yang sudah diberi TTD (mode per-halaman) */}
      {!sameAll && hasPlacement && (
        <div className="px-4 py-1.5 bg-slate-900 text-white flex items-center gap-2 flex-wrap border-b border-slate-700" data-testid="sig-placement-list">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Sudah ditempel:</span>
          {placementList.sort((a, b) => a.page - b.page).map((p) => (
            <span key={p.page} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-700 text-white text-[10px] font-bold uppercase">
              Hal. {p.page + 1}
              <button onClick={() => removePlacement(p.page)} className="hover:text-rose-300" title="Hapus TTD halaman ini" data-testid={`sig-remove-page-${p.page}`}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* PDF Canvas Area — multi-halaman, bisa di-scroll */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950">
        <PdfStampCanvas
          drawingId={drawing.id}
          target="mks"
          placements={placementList}
          onPick={onPick}
          markerNode={
            <div
              className="border-2 border-emerald-500 bg-emerald-100/40 flex items-center justify-center animate-pulse"
              style={{ width: `${sigDims[size].w * 10}px`, height: `${sigDims[size].h * 10}px` }}
            >
              {hasSig ? (
                <img src={sigUrl} alt="TTD" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-emerald-700 font-bold text-[9px] text-center px-1 leading-tight">
                  TTD ANDA
                  <br />
                  <span className="text-[8px] italic">(upload dulu)</span>
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
