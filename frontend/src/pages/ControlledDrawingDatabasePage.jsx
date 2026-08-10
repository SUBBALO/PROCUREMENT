import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { MagnifyingGlass, ArrowClockwise, Eye, Paperclip, Stamp, Archive, CheckSquare, Warning } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfPreviewModal from "../components/PdfPreviewModal";

const DC_ROLES = ["doc_control", "document_control", "admin", "super_admin"];
const apiUrl = process.env.REACT_APP_BACKEND_URL;

/**
 * Controlled Drawing Database — Pusat penyimpanan drawing yang sudah controlled/released.
 * Tab:
 *   - Controlled  : drawing aktif (controlled/released)
 *   - Obsolete/Superseded : Rev lama yang sudah digantikan. Document Control (Salma)
 *     men-stamp OBSOLETE secara manual (tidak otomatis) → baru resmi obsolete.
 */
export default function ControlledDrawingDatabasePage({ embedded = false }) {
  const { user } = useAuth();
  const isDocCon = DC_ROLES.includes(user?.role);
  const [tab, setTab] = useState("controlled");
  const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-indigo-600 text-sm";

  // Controlled list
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [pdfModal, setPdfModal] = useState(null);

  // Obsolete list
  const [obs, setObs] = useState({ items: [], pending_count: 0, stamped_count: 0 });
  const [obsLoading, setObsLoading] = useState(false);
  const [obsPreview, setObsPreview] = useState(null);
  const [stampTarget, setStampTarget] = useState(null); // row pending yang mau di-stamp OBSOLETE

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/drawings`, { params: { limit: 500 } });
      const list = (data.items || data || []).filter((d) =>
        ["controlled", "released"].includes(d.approval_status)
      );
      const filtered = q.trim()
        ? list.filter((d) => [
            d.drawing_no, d.project_name, d.customer_name, d.customer_code,
            d.so_no, d.project_initial, d.title,
          ].some((v) => (v || "").toLowerCase().includes(q.toLowerCase())))
        : list;
      setItems(filtered);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat data");
    } finally { setLoading(false); }
  }, [q]);

  const loadObsolete = useCallback(async () => {
    setObsLoading(true);
    try {
      const { data } = await api.get(`/drawings/obsolete-list`);
      setObs(data || { items: [], pending_count: 0, stamped_count: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat daftar obsolete");
    } finally { setObsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadObsolete(); }, [loadObsolete]);

  const pag = usePagination(items, 20);
  const obsFiltered = (obs.items || []).filter((r) => !q.trim() || [r.drawing_no, r.so_no, r.customer_name, r.ecn_no].some((v) => (v || "").toLowerCase().includes(q.toLowerCase())));
  const obsPag = usePagination(obsFiltered, 20);

  const doStampObsolete = async (row, notes) => {
    try {
      await api.post(`/drawings/${row.drawing_id}/revisions/${row.rev_id}/stamp-obsolete`, { notes: notes || "" });
      toast.success(`✓ ${row.drawing_no} Rev ${row.rev_no} di-stamp OBSOLETE`);
      setStampTarget(null);
      loadObsolete();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal stamp OBSOLETE");
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "p-4 max-w-[1400px] mx-auto space-y-4"}>
      {!embedded && <BackLink to="/" />}
      {!embedded && (
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Controlled Drawing Database
          </h1>
          <div className="text-xs text-slate-500 mt-1">
            Master repository semua drawing yang sudah melalui Document Control. Rev lama yang sudah digantikan pindah ke tab <b>Obsolete / Superseded</b> setelah di-stamp OBSOLETE oleh Document Control.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("controlled")}
          data-testid="cdd-tab-controlled"
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px ${tab === "controlled" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
        >
          <CheckSquare size={14} weight="fill" /> Controlled
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${tab === "controlled" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>{items.length}</span>
        </button>
        <button
          onClick={() => setTab("obsolete")}
          data-testid="cdd-tab-obsolete"
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px ${tab === "obsolete" ? "border-rose-600 text-rose-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
        >
          <Archive size={14} weight="fill" /> Obsolete / Superseded
          {obs.pending_count > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500 text-slate-900" title="Menunggu stamp OBSOLETE">{obs.pending_count} perlu stamp</span>
          )}
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${tab === "obsolete" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-600"}`}>{obs.items?.length || 0}</span>
        </button>
      </div>

      {/* Search bar (shared) */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className={`px-4 py-2 border-b flex items-center gap-2 ${tab === "obsolete" ? "bg-rose-50 border-rose-200" : "bg-indigo-50 border-indigo-200"}`}>
          <MagnifyingGlass size={14} className={tab === "obsolete" ? "text-rose-700" : "text-indigo-700"} />
          <Input
            className={`${inputCls} w-80`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari drawing no / project / customer / SO / ECN..."
            data-testid="cdd-search"
          />
          <Button variant="ghost" onClick={() => (tab === "obsolete" ? loadObsolete() : load())} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          {tab === "controlled"
            ? <div className="text-xs text-indigo-700 font-bold">{items.length} controlled document</div>
            : <div className="text-xs text-rose-700 font-bold">{obsFiltered.length} obsolete/superseded</div>}
        </div>

        {/* ===== CONTROLLED TABLE ===== */}
        {tab === "controlled" && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                    <th className="text-left p-3">Drawing No</th>
                    <th className="text-left p-3">Project</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">SO</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-left p-3">Controlled At</th>
                    <th className="text-center p-3">Customer Ref</th>
                    <th className="text-center p-3">Aksi</th>
                  </tr>
                </thead>
                <tbody data-testid="cdd-list">
                  {loading && (<tr><td colSpan={9} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
                  {!loading && items.length === 0 && (<tr><td colSpan={9} className="p-8 text-center text-slate-400">Belum ada controlled document. Tunggu Admin Document Control apply stamp.</td></tr>)}
                  {pag.pagedData.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`cdd-row-${d.drawing_no}`}>
                      <td className="p-3 font-mono font-semibold text-slate-800">{d.drawing_no}</td>
                      <td className="p-3">{d.project_name || "-"}</td>
                      <td className="p-3">{d.customer_name || d.customer_code || "-"}</td>
                      <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                      <td className="p-3 text-xs">{d.drawing_type || "-"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${d.approval_status === "released" ? "bg-teal-100 text-teal-800 border border-teal-400" : "bg-indigo-100 text-indigo-800 border border-indigo-400"}`}>
                          ✓ {d.approval_status}
                        </span>
                      </td>
                      <td className="p-3 text-xs">{d.controlled_at ? new Date(d.controlled_at).toLocaleDateString("id-ID") : "-"}</td>
                      <td className="p-3 text-center">
                        {d.customer_ref_file_id ? (
                          <button
                            onClick={() => setPdfModal({ d, order: "customer_ref" })}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 border border-amber-400 hover:bg-amber-200 text-amber-900 text-[10px] font-bold uppercase"
                            title={d.customer_ref_filename || "Preview Customer Reference"}
                            data-testid={`cdd-customer-ref-${d.drawing_no}`}
                          >
                            <Paperclip size={11} weight="bold" /> Customer Drawing
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px] italic">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          size="sm"
                          onClick={() => setPdfModal({ d, order: "mks" })}
                          className="rounded-none h-7 px-2 bg-indigo-700 hover:bg-indigo-800 text-white text-[10px]"
                          data-testid={`cdd-view-${d.drawing_no}`}
                        >
                          <Eye size={11} weight="bold" className="mr-0.5" /> Preview & Print
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar {...pag} label="drawing" testIdPrefix="cdd-pag" />
          </>
        )}

        {/* ===== OBSOLETE / SUPERSEDED TABLE ===== */}
        {tab === "obsolete" && (
          <>
            <div className="px-4 py-2 bg-white border-b border-slate-200 text-[11px] text-slate-500">
              Rev lama yang sudah digantikan Rev baru. Status <b className="text-amber-700">PERLU STAMP</b> = menunggu Document Control men-cap OBSOLETE (manual). Setelah di-stamp → <b className="text-rose-700">OBSOLETE</b> (cap merah muncul di PDF, view-only).
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                    <th className="text-left p-3">Drawing No</th>
                    <th className="text-center p-3">Rev Lama</th>
                    <th className="text-center p-3">Digantikan Rev</th>
                    <th className="text-left p-3">ECN</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">SO</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-left p-3">Tgl</th>
                    <th className="text-center p-3">Aksi</th>
                  </tr>
                </thead>
                <tbody data-testid="cdd-obsolete-list">
                  {obsLoading && (<tr><td colSpan={9} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
                  {!obsLoading && obsFiltered.length === 0 && (<tr><td colSpan={9} className="p-8 text-center text-slate-400">Belum ada Rev yang digantikan.</td></tr>)}
                  {obsPag.pagedData.map((r) => {
                    const pending = r.obsolete_status === "pending";
                    return (
                      <tr key={`${r.drawing_id}-${r.rev_id}`} className="border-b border-slate-100 hover:bg-rose-50/40" data-testid={`cdd-obsolete-row-${r.drawing_no}-${r.rev_no}`}>
                        <td className="p-3 font-mono font-semibold text-slate-800">{r.drawing_no}</td>
                        <td className="p-3 text-center font-bold text-slate-700">Rev {r.rev_no ?? 0}</td>
                        <td className="p-3 text-center text-emerald-700 font-semibold">Rev {r.superseded_by_rev ?? "-"}</td>
                        <td className="p-3 font-mono text-xs">{r.ecn_no || "-"}</td>
                        <td className="p-3 text-xs">{r.customer_name || "-"}</td>
                        <td className="p-3 font-mono text-xs">{r.so_no || "-"}</td>
                        <td className="p-3 text-center">
                          {pending ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-400">
                              <Warning size={11} weight="bold" /> Perlu Stamp
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-400">✕ Obsolete</span>
                          )}
                        </td>
                        <td className="p-3 text-xs">{(r.obsoleted_at || r.superseded_at) ? new Date(r.obsoleted_at || r.superseded_at).toLocaleDateString("id-ID") : "-"}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => setObsPreview(r)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase"
                              data-testid={`cdd-obsolete-view-${r.drawing_no}-${r.rev_no}`}
                            >
                              <Eye size={11} weight="bold" /> Lihat PDF
                            </button>
                            {pending && isDocCon && (
                              <button
                                onClick={() => setStampTarget(r)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase"
                                data-testid={`cdd-stamp-obsolete-${r.drawing_no}-${r.rev_no}`}
                              >
                                <Stamp size={11} weight="bold" /> Stamp OBSOLETE
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar {...obsPag} label="obsolete" testIdPrefix="cdd-obs-pag" />
          </>
        )}
      </Card>

      {/* Preview controlled drawing */}
      {pdfModal && (() => {
        const d = pdfModal.d;
        const mks = { key: "mks", label: "Drawing MKS" };
        const cust = { key: "customer_ref", label: "Drawing Customer" };
        const targets = pdfModal.order === "customer_ref"
          ? (d.customer_ref_file_id ? [cust, mks] : [mks])
          : (d.customer_ref_file_id ? [mks, cust] : [mks]);
        return (
          <PdfPreviewModal
            drawingId={d.id}
            targets={targets}
            stamped
            title={d.drawing_no}
            subtitle={`${d.project_name || ""}${d.customer_name ? " · " + d.customer_name : ""}`}
            downloadUrl={`${apiUrl}/api/drawings/${d.id}/pdf-stamped`}
            onClose={() => setPdfModal(null)}
          />
        );
      })()}

      {/* Preview obsolete/old-rev drawing (cap OBSOLETE muncul jika sudah di-stamp) */}
      {obsPreview && (
        <PdfPreviewModal
          metaUrl={`/drawings/${obsPreview.drawing_id}/revisions/${obsPreview.rev_id}/page-meta`}
          pageUrlBuilder={(n) => `${apiUrl}/api/drawings/${obsPreview.drawing_id}/revisions/${obsPreview.rev_id}/page-image?page=${n}&scale=2`}
          downloadUrl={`${apiUrl}/api/drawings/${obsPreview.drawing_id}/revisions/${obsPreview.rev_id}/download`}
          title={`${obsPreview.drawing_no} · Rev ${obsPreview.rev_no ?? 0} ${obsPreview.obsolete_status === "stamped" ? "· OBSOLETE" : "· (menunggu stamp)"}`}
          subtitle={obsPreview.customer_name || ""}
          onClose={() => setObsPreview(null)}
        />
      )}

      {/* Konfirmasi Stamp OBSOLETE (Document Control) */}
      {stampTarget && (
        <StampObsoleteDialog
          row={stampTarget}
          onCancel={() => setStampTarget(null)}
          onConfirm={(notes) => doStampObsolete(stampTarget, notes)}
        />
      )}
    </div>
  );
}

function StampObsoleteDialog({ row, onCancel, onConfirm }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" data-testid="stamp-obsolete-dialog">
      <Card className="rounded-none border-slate-300 w-full max-w-md bg-white">
        <div className="px-4 py-3 bg-rose-700 text-white flex items-center gap-2">
          <Stamp size={16} weight="fill" />
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">Stamp OBSOLETE — Document Control</div>
            <div className="font-mono font-bold">{row.drawing_no} · Rev {row.rev_no ?? 0}</div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-slate-600">
            Rev {row.rev_no ?? 0} sudah digantikan oleh <b>Rev {row.superseded_by_rev ?? "-"}</b>. Setelah di-stamp, Rev ini resmi <b className="text-rose-700">OBSOLETE</b> — PDF diberi cap merah dan view-only (tidak boleh dipakai produksi).
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1">Catatan (opsional)</label>
            <textarea
              data-testid="stamp-obsolete-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[60px] border border-slate-300 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600 text-sm px-3 py-2 rounded-none"
              placeholder="mis. Superseded per ECN-2026-014"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onCancel} className="rounded-none">Batal</Button>
            <Button
              onClick={async () => { setBusy(true); await onConfirm(notes); setBusy(false); }}
              disabled={busy}
              className="rounded-none bg-rose-700 hover:bg-rose-800 text-white disabled:opacity-40"
              data-testid="stamp-obsolete-confirm"
            >
              <Stamp size={14} weight="bold" className="mr-1" /> {busy ? "..." : "Stamp OBSOLETE"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
