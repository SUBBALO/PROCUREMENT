import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import {
  Dialog, DialogContent, DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import PdfPreviewModal from "./PdfPreviewModal";
import SignaturePlacementModal from "./SignaturePlacementModal";
import {
  FileText, StackSimple, Cube, CurrencyDollar, Package, CheckCircle, WarningCircle,
  Signature, Eye, X, MagnifyingGlass, ArrowClockwise, ClockCounterClockwise,
} from "@phosphor-icons/react";

/**
 * EngLeaderReviewDialog — popup masterlist review dokumen 1 SO untuk Eng Leader.
 * Kiri: tabel dense semua dokumen (drawing + Nesting/AutoCAD/Costing).
 * Kanan: detail + aksi (Approve & TTD / Tandai OK / Minta Revisi) + riwayat.
 * Semua dokumen tetap tampil walau sebagian sudah TTD (audit 1 SO lengkap).
 */

const DOC_META = {
  drawing: { label: "Drawing", icon: FileText },
  nesting: { label: "Nesting", icon: StackSimple },
  cad: { label: "AutoCAD", icon: Cube },
  costing: { label: "Costing", icon: CurrencyDollar },
};

function drawingStatus(d) {
  const s = d.approval_status || "draft";
  if (s === "draft") return { key: "draft", label: "Belum disubmit", cls: "border-slate-200 bg-slate-100 text-slate-700" };
  if (s === "pending_eng_head") return { key: "review", label: "Perlu Review", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  return { key: "done", label: s.replace("pending_", "→ ").toUpperCase(), cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}
function attachStatus(a) {
  const s = a.review_status;
  if (s === "ok") return { key: "ok", label: "OK", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (s === "revise") return { key: "revise", label: "Minta Revisi", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  return { key: "pending", label: "Belum direview", cls: "border-slate-200 bg-slate-100 text-slate-700" };
}

export default function EngLeaderReviewDialog({ open, onClose, drfId, bomId, bomNo, soNo, onReload }) {
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const [drawings, setDrawings] = useState([]);
  const [atts, setAtts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selKey, setSelKey] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviseMode, setReviseMode] = useState(false);
  const [reviseNotes, setReviseNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [sigDrawing, setSigDrawing] = useState(null);

  const load = useCallback(async () => {
    if (!open || !drfId) return;
    setLoading(true);
    try {
      const { data: dw } = await api.get(`/drawings?from_drf_id=${drfId}`);
      const dItems = (dw.items || dw || []).slice().sort((a, b) => (a.drawing_no || "").localeCompare(b.drawing_no || ""));
      setDrawings(dItems);
      if (bomId) {
        const { data: at } = await api.get(`/bom/${bomId}/attachments`);
        setAtts(at.items || []);
      } else {
        setAtts([]);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat dokumen review");
    } finally {
      setLoading(false);
    }
  }, [open, drfId, bomId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!open) { setSelKey(""); setReviseMode(false); setReviseNotes(""); } }, [open]);

  // Build combined document rows
  const rows = useMemo(() => {
    const out = [];
    drawings.forEach((d) => {
      out.push({
        key: `dwg-${d.id}`, kind: "drawing", id: d.id, name: d.drawing_no || "(no dwg)",
        sub: d.title || d.project_name || "", raw: d, status: drawingStatus(d),
        updated: d.updated_at || d.submitted_at,
      });
    });
    atts.forEach((a) => {
      const cat = ["nesting", "cad", "costing"].includes(a.category) ? a.category : null;
      if (!cat) return; // hanya dokumen SO non-drawing
      out.push({
        key: `att-${a.id}`, kind: cat, id: a.id, name: a.filename || cat,
        sub: DOC_META[cat].label, raw: a, status: attachStatus(a),
        updated: a.reviewed_at || a.uploaded_at,
      });
    });
    return out;
  }, [drawings, atts]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status.key !== statusFilter) return false;
      if (q.trim() && !`${r.name} ${r.sub}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, q, statusFilter]);

  const selected = rows.find((r) => r.key === selKey) || null;

  const refresh = async () => { await load(); onReload?.(); };

  const openPreview = (row) => {
    if (row.kind === "drawing") {
      setPreview({ drawingId: row.id, target: "mks", stamped: false, title: `${row.name} · Drawing`, subtitle: row.sub });
    } else {
      setPreview({
        metaUrl: `/bom/${bomId}/attachments/${row.id}/page-meta`,
        pageUrlBuilder: (n) => `${backendUrl}/api/bom/${bomId}/attachments/${row.id}/page-image?page=${n}&scale=2`,
        downloadUrl: `${backendUrl}/api/bom/${bomId}/attachments/${row.id}/download`,
        title: row.name, subtitle: row.sub,
      });
    }
  };

  const doMarkOk = async (row) => {
    setBusy(true);
    try {
      await api.post(`/bom/${bomId}/attachments/${row.id}/review`, { action: "ok" });
      toast.success(`${row.name} ditandai OK`);
      setReviseMode(false); setReviseNotes("");
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menandai OK");
    } finally { setBusy(false); }
  };

  const doRevise = async (row) => {
    const notes = reviseNotes.trim();
    if (notes.length < 3) { toast.error("Catatan revisi wajib diisi (min 3 karakter)"); return; }
    setBusy(true);
    try {
      if (row.kind === "drawing") {
        if (notes.length < 5) { toast.error("Catatan revisi drawing min 5 karakter"); setBusy(false); return; }
        await api.post(`/drawings/${row.id}/reject/eng_head`, { notes });
      } else {
        await api.post(`/bom/${bomId}/attachments/${row.id}/review`, { action: "revise", notes });
      }
      toast.success(`Revisi diminta untuk ${row.name}`);
      setReviseMode(false); setReviseNotes("");
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal minta revisi");
    } finally { setBusy(false); }
  };

  const legend = [
    { k: "pending", label: "Belum", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    { k: "review", label: "Perlu Review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    { k: "ok", label: "OK/Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { k: "revise", label: "Revisi", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  ];

  return (
    <>
      {/* Backdrop manual (Dialog non-modal agar preview PDF di atasnya bisa diklik) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => { if (!preview && !sigDrawing) onClose?.(); }}
          data-testid="review-backdrop"
        />
      )}
      <Dialog open={open} modal={false} onOpenChange={(o) => { if (!o && !preview && !sigDrawing) onClose?.(); }}>
        <DialogContent
          className="w-[min(1150px,96vw)] max-w-[min(1150px,96vw)] h-[min(85vh,900px)] rounded-none p-0 overflow-hidden gap-0 flex flex-col"
          data-testid="eng-leader-review-dialog"
          onInteractOutside={(e) => { if (preview || sigDrawing) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (preview || sigDrawing) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (preview || sigDrawing) e.preventDefault(); }}
        >
          <DialogTitle className="sr-only">Review Dokumen SO</DialogTitle>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-900 text-slate-50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Package size={18} weight="fill" />
              <div className="min-w-0">
                <div className="text-sm font-bold" style={{ fontFamily: "Chivo, sans-serif" }}>Review Dokumen SO</div>
                <div className="text-[11px] text-slate-300 truncate">SO {soNo || "-"} · BOM {bomNo || "-"} · {rows.length} dokumen</div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-none transition-colors duration-150" data-testid="review-close-button">
              <X size={18} weight="bold" />
            </button>
          </div>

          <div className="grid grid-cols-12 flex-1 min-h-0">
            {/* Left panel — table */}
            <div className="col-span-12 lg:col-span-7 border-r border-border flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-slate-50 shrink-0">
                <MagnifyingGlass size={14} className="text-slate-500" />
                <Input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari dokumen..."
                  className="h-8 rounded-none border-slate-300 flex-1"
                  data-testid="review-documents-search-input"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 rounded-none border-slate-300 text-xs w-[150px]" data-testid="review-status-filter-select">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="pending">Belum direview</SelectItem>
                    <SelectItem value="review">Perlu Review</SelectItem>
                    <SelectItem value="ok">OK/Approved</SelectItem>
                    <SelectItem value="revise">Revisi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-b border-border shrink-0">
                {legend.map((l) => (
                  <span key={l.k} className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${l.cls}`}>{l.label}</span>
                ))}
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                      <th className="text-left px-2 h-9">Jenis</th>
                      <th className="text-left px-2 h-9">Nama Dokumen</th>
                      <th className="text-left px-2 h-9 w-[140px]">Status</th>
                      <th className="text-center px-2 h-9 w-[80px]">Lihat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400">Memuat dokumen…</td></tr>
                    )}
                    {!loading && filtered.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400">Tidak ada dokumen sesuai filter.</td></tr>
                    )}
                    {filtered.map((r) => {
                      const M = DOC_META[r.kind];
                      const Icon = M.icon;
                      const sel = r.key === selKey;
                      return (
                        <tr
                          key={r.key}
                          onClick={() => { setSelKey(r.key); setReviseMode(false); setReviseNotes(""); }}
                          data-selected={sel}
                          className="h-9 border-b border-slate-100 hover:bg-slate-50 data-[selected=true]:bg-slate-100 cursor-pointer transition-colors duration-150"
                          data-testid={`review-document-row-${r.id}`}
                        >
                          <td className="px-2 py-1.5">
                            <span className="inline-flex items-center gap-1 text-slate-700">
                              <Icon size={14} weight="fill" /> {M.label}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-mono font-semibold text-slate-800 truncate max-w-[220px]" title={r.name}>{r.name}</div>
                            {r.sub && <div className="text-[10px] text-slate-500 truncate max-w-[220px]">{r.sub}</div>}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${r.status.cls}`}>{r.status.label}</span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); openPreview(r); }}
                              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-150"
                              title="Preview"
                              data-testid={`review-preview-${r.id}`}
                            >
                              <Eye size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </div>

            {/* Right panel — detail + actions */}
            <div className="col-span-12 lg:col-span-5 flex flex-col min-h-0" data-testid="review-document-preview-panel">
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-6 text-center">
                  Pilih dokumen di kiri untuk melihat detail &amp; aksi review.
                </div>
              ) : (
                <div className="flex flex-col h-full min-h-0">
                  <div className="px-4 py-3 border-b border-border shrink-0">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{DOC_META[selected.kind].label}</div>
                    <div className="font-mono font-bold text-slate-900 break-all">{selected.name}</div>
                    {selected.sub && <div className="text-xs text-slate-500">{selected.sub}</div>}
                    <div className="mt-2">
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${selected.status.cls}`}>{selected.status.label}</span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => openPreview(selected)}
                      className="rounded-none border-slate-300 mt-3 h-8 text-xs"
                      data-testid="review-open-preview-button"
                    >
                      <Eye size={14} className="mr-1.5" /> Buka Preview Dokumen
                    </Button>
                  </div>

                  <ScrollArea className="flex-1 min-h-0 px-4 py-3">
                    {/* Riwayat catatan */}
                    {selected.kind === "drawing" ? (
                      <DrawingHistory drawing={selected.raw} />
                    ) : (
                      <AttachmentHistory attachment={selected.raw} />
                    )}
                  </ScrollArea>

                  {/* Actions footer */}
                  <div className="border-t border-border p-3 space-y-2 shrink-0 bg-slate-50">
                    {reviseMode ? (
                      <div className="space-y-2" data-testid="review-revise-form">
                        <Textarea
                          value={reviseNotes}
                          onChange={(e) => setReviseNotes(e.target.value)}
                          placeholder="Tulis catatan revisi (wajib)…"
                          className="rounded-none min-h-[80px]"
                          data-testid="review-revision-note-textarea"
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => { setReviseMode(false); setReviseNotes(""); }} className="rounded-none border-slate-300 flex-1" disabled={busy}>
                            Batal
                          </Button>
                          <Button
                            onClick={() => doRevise(selected)}
                            disabled={busy}
                            className="rounded-none flex-1 border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors duration-150"
                            data-testid="review-revision-submit-button"
                          >
                            {busy ? <ArrowClockwise size={14} className="animate-spin mr-1" /> : <WarningCircle size={14} weight="fill" className="mr-1" />}
                            Kirim Permintaan Revisi
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {selected.kind === "drawing" ? (
                          selected.status.key === "review" ? (
                            <Button
                              onClick={() => setSigDrawing(selected.raw)}
                              disabled={busy}
                              className="rounded-none flex-1 bg-slate-900 hover:bg-slate-800 text-white transition-colors duration-150 active:translate-y-[1px]"
                              data-testid="review-approve-ttd-button"
                            >
                              <Signature size={15} weight="bold" className="mr-1.5" /> Approve &amp; TTD
                            </Button>
                          ) : (
                            <div className="flex-1 text-[11px] text-slate-500 italic self-center">
                              {selected.status.key === "draft" ? "Drawing belum di-submit engineer." : "Drawing sudah lewat tahap Eng Leader."}
                            </div>
                          )
                        ) : (
                          <Button
                            onClick={() => doMarkOk(selected)}
                            disabled={busy}
                            className="rounded-none flex-1 border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors duration-150"
                            data-testid="review-mark-ok-button"
                          >
                            {busy ? <ArrowClockwise size={14} className="animate-spin mr-1" /> : <CheckCircle size={15} weight="fill" className="mr-1.5" />}
                            Tandai OK
                          </Button>
                        )}
                        {(selected.kind !== "drawing" || selected.status.key === "review") && (
                          <Button
                            onClick={() => { setReviseMode(true); setReviseNotes(""); }}
                            disabled={busy}
                            className="rounded-none flex-1 border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors duration-150"
                            data-testid="review-request-revision-button"
                          >
                            <WarningCircle size={15} weight="fill" className="mr-1.5" /> Minta Revisi
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {preview && (
        <PdfPreviewModal
          drawingId={preview.drawingId}
          target={preview.target}
          stamped={preview.stamped}
          metaUrl={preview.metaUrl}
          pageUrlBuilder={preview.pageUrlBuilder}
          downloadUrl={preview.downloadUrl}
          title={preview.title}
          subtitle={preview.subtitle}
          onClose={() => setPreview(null)}
        />
      )}

      {sigDrawing && (
        <SignaturePlacementModal
          drawing={sigDrawing}
          stage="eng_head"
          onDone={() => { setSigDrawing(null); refresh(); }}
          onClose={() => setSigDrawing(null)}
        />
      )}
    </>
  );
}

function DrawingHistory({ drawing }) {
  const revs = (drawing.revisions || []).filter((r) => r.type !== "ecn_revision").slice().reverse();
  const approvals = (drawing.approvals || []).slice().reverse();
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1">
        <ClockCounterClockwise size={13} /> Riwayat
      </div>
      {revs.length === 0 && approvals.length === 0 && (
        <div className="text-xs text-slate-400 italic">Belum ada riwayat review/TTD.</div>
      )}
      {revs.map((r, i) => (
        <div key={r.id || i} className="border border-rose-200 bg-rose-50 p-2">
          <div className="text-[10px] font-bold uppercase text-rose-800">Revisi · {r.stage}</div>
          <div className="text-xs text-slate-700 whitespace-pre-wrap">{r.notes}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{r.rejected_by_name} · {r.at ? new Date(r.at).toLocaleString("id-ID") : ""}</div>
        </div>
      ))}
      {approvals.map((a, i) => (
        <div key={i} className="border border-slate-200 bg-white p-2">
          <div className="text-[10px] font-bold uppercase text-slate-700">TTD · {a.stage}</div>
          <div className="text-xs text-slate-700">{a.name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{a.at ? new Date(a.at).toLocaleString("id-ID") : ""}{a.notes ? ` · ${a.notes}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

function AttachmentHistory({ attachment }) {
  const hist = (attachment.review_history || []).slice().reverse();
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1">
        <ClockCounterClockwise size={13} /> Riwayat Review
      </div>
      <div className="text-[11px] text-slate-500">Diupload oleh <b>{attachment.uploaded_by || "-"}</b>{attachment.uploaded_at ? ` · ${new Date(attachment.uploaded_at).toLocaleString("id-ID")}` : ""}</div>
      {hist.length === 0 && <div className="text-xs text-slate-400 italic">Belum pernah direview.</div>}
      {hist.map((h) => (
        <div key={h.id} className={`border p-2 ${h.status === "ok" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <div className={`text-[10px] font-bold uppercase ${h.status === "ok" ? "text-emerald-800" : "text-rose-800"}`}>{h.status === "ok" ? "Ditandai OK" : "Minta Revisi"}</div>
          {h.notes && <div className="text-xs text-slate-700 whitespace-pre-wrap">{h.notes}</div>}
          <div className="text-[10px] text-slate-500 mt-0.5">{h.reviewed_by} · {h.reviewed_at ? new Date(h.reviewed_at).toLocaleString("id-ID") : ""}</div>
        </div>
      ))}
    </div>
  );
}
