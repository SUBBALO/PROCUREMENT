import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Stamp, MagnifyingGlass, ArrowClockwise, Eye, FileText, Paperclip } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfStampCanvas from "../components/PdfStampCanvas";

/**
 * Document Distribution Record — Dashboard khusus Admin Document Control (Salma).
 * Menampilkan drawings yang:
 *   - approval_status = "approved" (belum di-stamp) → siap di-stamp
 *   - approval_status = "controlled" (sudah di-stamp) → sudah didistribusi
 */
export default function DocumentDistributionRecordPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("pending"); // "pending" | "controlled"
  const [pdfModal, setPdfModal] = useState(null);
  const [stampMode, setStampMode] = useState(null); // {drawing, x, y}
  const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-red-600 text-sm";

  const canAccess = ["doc_control", "document_control", "admin", "super_admin"].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/drawings`, { params: { limit: 500 } });
      const all = data.items || data || [];
      // Iter 20 — Pending tab: drawing approved yang belum SEMUA dokumennya di-stamp
      // (yang sudah fully controlled → pindah ke tab controlled)
      const list = all.filter((d) => {
        if (tab === "pending") {
          if (d.approval_status !== "approved") return false;
          return true; // include semua approved (baik belum ada stamp, atau sebagian)
        } else {
          return d.approval_status === "controlled";
        }
      });
      const filtered = q.trim()
        ? list.filter((d) => [d.drawing_no, d.project_name, d.customer_name, d.customer_code].some(
            (v) => (v || "").toLowerCase().includes(q.toLowerCase())
          ))
        : list;
      setItems(filtered);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat data");
    } finally { setLoading(false); }
  }, [tab, q]);

  useEffect(() => { if (canAccess) load(); }, [load, canAccess]);
  const pag = usePagination(items, 20);

  // Iter 20 — stampMode = { drawing, target: "mks"|"customer_ref"|"extra", extra_id }
  const openStampPicker = (drawing, target = "mks", extra_id = "") =>
    setStampMode({ drawing, target, extra_id, x: null, y: null });

  const doStamp = async (mode, x = null, y = null) => {
    const notes = window.prompt("Notes verifikasi (opsional):") || "";
    try {
      const body = { notes, target: mode.target };
      if (mode.extra_id) body.extra_id = mode.extra_id;
      if (x !== null && y !== null) { body.stamp_x = x; body.stamp_y = y; }
      const { data } = await api.post(`/drawings/${mode.drawing.id}/stamp-controlled`, body);
      const label = mode.target === "mks" ? "Drawing MKS" : mode.target === "customer_ref" ? "Customer Ref" : "Extra File";
      if (data.all_stamped) {
        toast.success(`✓ Semua dokumen sudah di-stamp. Drawing sekarang CONTROLLED.`);
      } else {
        toast.success(`✓ ${label} di-stamp. Lanjut stamp dokumen berikutnya.`);
      }
      setStampMode(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal stamp");
    }
  };

  if (!canAccess) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <BackLink to="/" />
        <Card className="p-8 border-2 border-rose-300 bg-rose-50 rounded-none text-center">
          <div className="text-rose-800 font-bold text-lg mb-2">Akses Ditolak</div>
          <div className="text-sm text-rose-600">Halaman ini khusus untuk Admin Document Control.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink to="/" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Document Distribution Record
          </h1>
          <div className="text-xs text-slate-500 mt-1">Dashboard Admin Document Control — verifikasi & stamp digital untuk distribusi resmi</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "pending", label: "🕐 Menunggu Stamp DC", color: "bg-amber-100 text-amber-800 border-amber-500" },
          { key: "controlled", label: "✓ Controlled Documents", color: "bg-indigo-100 text-indigo-800 border-indigo-500" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px ${tab === t.key ? t.color : "border-transparent text-slate-500 hover:text-slate-800"}`}
            data-testid={`ddr-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input
            className={`${inputCls} w-72`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari drawing no / project / customer..."
            data-testid="ddr-search"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500">{items.length} drawing</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Drawing No</th>
                <th className="text-left p-3">Project · Customer</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Tgl Approved</th>
                <th className="text-left p-3">Dokumen · Status Stamp</th>
              </tr>
            </thead>
            <tbody data-testid="ddr-list">
              {loading && (<tr><td colSpan={5} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-slate-400">
                {tab === "pending" ? "Tidak ada drawing menunggu stamp." : "Belum ada controlled document."}
              </td></tr>)}
              {pag.pagedData.map((d) => {
                const apiUrl = process.env.REACT_APP_BACKEND_URL;
                const extras = d.additional_files || [];
                const isControlled = tab === "controlled";
                return (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`ddr-row-${d.drawing_no}`}>
                  <td className="p-3 font-mono font-semibold text-slate-800 align-top">{d.drawing_no}</td>
                  <td className="p-3 align-top">
                    <div>{d.project_name || "-"}</div>
                    <div className="text-xs text-slate-500">{d.customer_name || d.customer_code || "-"}</div>
                  </td>
                  <td className="p-3 font-mono text-xs align-top">{d.so_no || "-"}</td>
                  <td className="p-3 text-xs align-top">{d.approved_at ? new Date(d.approved_at).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="p-3 align-top">
                    <div className="space-y-1.5">
                      {/* MKS Drawing */}
                      <DocRowItem
                        label="Drawing MKS"
                        icon="📐"
                        previewUrl={`${apiUrl}/api/drawings/${d.id}/pdf-stamped`}
                        isStamped={!!d.dc_stamp}
                        onStamp={() => openStampPicker(d, "mks")}
                        showStampBtn={!isControlled}
                        testid={`ddr-mks-${d.drawing_no}`}
                      />
                      {/* Customer Reference */}
                      {d.customer_ref_file_id && (
                        <DocRowItem
                          label={`Customer Drawing ${d.customer_ref_filename ? "· " + d.customer_ref_filename : ""}`}
                          icon="📎"
                          previewUrl={`${apiUrl}/api/drawings/${d.id}/customer-ref/preview`}
                          isStamped={!!d.customer_ref_dc_stamp}
                          onStamp={() => openStampPicker(d, "customer_ref")}
                          showStampBtn={!isControlled}
                          testid={`ddr-ref-${d.drawing_no}`}
                        />
                      )}
                      {/* Extra Files */}
                      {extras.map((ex) => (
                        <DocRowItem
                          key={ex.id}
                          label={`${ex.label || "Extra"} · ${ex.filename}`}
                          icon="📄"
                          previewUrl={`${apiUrl}/api/drawings/${d.id}/extras/${ex.id}/preview`}
                          isStamped={!!ex.dc_stamp}
                          onStamp={() => openStampPicker(d, "extra", ex.id)}
                          showStampBtn={!isControlled}
                          testid={`ddr-extra-${d.drawing_no}-${ex.id.slice(0, 6)}`}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="drawing" testIdPrefix="ddr-pag" />
      </Card>

      {pdfModal && <PdfViewerModal drawing={pdfModal} onClose={() => setPdfModal(null)} />}
      {stampMode && <StampPositionPicker mode={stampMode} onConfirm={(x, y) => doStamp(stampMode, x, y)} onClose={() => setStampMode(null)} />}
    </div>
  );
}

/**
 * StampPositionPicker — Salma klik area putih PDF untuk letakkan cap DC.
 * Pakai iframe untuk preview PDF + overlay div transparan menangkap click.
 * Note: iframe click blocked cross-origin, jadi kita render PDF sebagai image (page 1) via canvas.
 * Simplification: gunakan img/iframe + overlay click detector di parent div.
 */
function StampPositionPicker({ mode, onConfirm, onClose }) {
  const { drawing, target, extra_id } = mode;
  const targetLabel = target === "customer_ref" ? "Customer Drawing" : target === "extra" ? "Extra File" : "Drawing MKS";
  const [pos, setPos] = React.useState(null);

  const marker = (
    <div
      className="border-4 border-red-600 bg-red-500/20 flex flex-col items-center justify-center text-red-800 font-bold animate-pulse"
      style={{ width: "120px", height: "92px" }}
    >
      <div className="text-2xl leading-none">MKS</div>
      <div className="text-[9px] mt-1">{new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</div>
      <div className="text-[8px] mt-1 font-black">DOCUMENT CONTROL</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col" data-testid="stamp-picker-modal">
      <div className="flex items-center justify-between p-3 bg-red-900 text-white shrink-0">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-80">Pilih Posisi Stamp Document Control — {targetLabel}</div>
          <div className="font-mono font-bold">{drawing.drawing_no}</div>
        </div>
        <div className="text-xs opacity-90 text-center">
          {pos ? (
            <span>Posisi hal. {pos.page + 1}: {(pos.xRel * 100).toFixed(0)}% × {(pos.yRel * 100).toFixed(0)}% · <b className="text-amber-300">stamp otomatis di SEMUA halaman</b></span>
          ) : (
            <span className="animate-pulse">👆 Scroll & klik area PDF untuk letakkan stamp (berlaku ke semua halaman)</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-bold bg-slate-600 hover:bg-slate-500 text-white uppercase tracking-widest"
          >
            ✕ Batal
          </button>
          <button
            onClick={() => pos && onConfirm(pos.xRel, pos.yRel)}
            disabled={!pos}
            className="px-3 py-1 text-xs font-bold bg-red-700 hover:bg-red-600 text-white uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="stamp-confirm-btn"
          >
            ✓ Konfirmasi & Stamp
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 bg-slate-900">
        <PdfStampCanvas
          drawingId={drawing.id}
          target={target}
          extraId={extra_id || ""}
          pos={pos}
          allPages
          onPick={(page, xRel, yRel) => setPos({ page, xRel, yRel })}
          markerNode={marker}
        />
      </div>
    </div>
  );
}

/**
 * DocRowItem — Baris untuk satu dokumen dalam Document Distribution Record.
 * Menampilkan: icon + label + link Preview + badge Stamped/Belum + tombol "Stamp Posisi" (kalau bukan tab controlled).
 */
function DocRowItem({ label, icon, previewUrl, isStamped, onStamp, showStampBtn, testid }) {
  return (
    <div className="flex items-center gap-2 border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50" data-testid={testid}>
      <span className="text-base">{icon}</span>
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="flex-1 text-xs font-semibold text-slate-800 hover:text-sky-700 hover:underline truncate"
        title={label}
      >
        {label}
      </a>
      {isStamped ? (
        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-400 text-[9px] font-bold uppercase whitespace-nowrap">
          ✓ Stamped
        </span>
      ) : (
        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-400 text-[9px] font-bold uppercase whitespace-nowrap">
          ⚠ Belum
        </span>
      )}
      {showStampBtn && !isStamped && (
        <button
          onClick={onStamp}
          className="px-2 py-0.5 bg-red-700 hover:bg-red-800 text-white text-[9px] font-bold uppercase whitespace-nowrap"
          data-testid={`${testid}-stamp-btn`}
        >
          Stamp Posisi →
        </button>
      )}
      {showStampBtn && isStamped && (
        <button
          onClick={onStamp}
          className="px-2 py-0.5 bg-slate-600 hover:bg-slate-700 text-white text-[9px] font-bold uppercase whitespace-nowrap"
          title="Re-stamp / ganti posisi"
          data-testid={`${testid}-restamp-btn`}
        >
          Re-stamp
        </button>
      )}
    </div>
  );
}


/**
 * PDF Viewer Modal with iframe (browser-native zoom controls).
 * Fase 6 — full-screen PDF viewer.
 */
export function PdfViewerModal({ drawing, onClose }) {
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const pdfUrl = `${apiUrl}/api/drawings/${drawing.id}/pdf-stamped`;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" data-testid="pdf-viewer-modal">
      <div className="flex items-center justify-between p-2 bg-slate-900 text-white">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-70">PDF Preview — with digital stamps</div>
          <div className="font-mono font-bold text-sm">{drawing.drawing_no}</div>
        </div>
        <div className="flex gap-2">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white uppercase tracking-widest"
          >
            Buka di Tab Baru
          </a>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white uppercase tracking-widest"
            data-testid="pdf-modal-close"
          >
            ✕ Tutup
          </button>
        </div>
      </div>
      <iframe
        title={`PDF ${drawing.drawing_no}`}
        src={pdfUrl}
        className="flex-1 w-full bg-white"
        data-testid="pdf-viewer-iframe"
      />
    </div>
  );
}
