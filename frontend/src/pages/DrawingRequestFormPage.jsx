import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import DrawingRequestFormDialog from "../components/DrawingRequestFormDialog";
import DrfDetailModal from "../components/DrfDetailModal";
import PdfPreviewModal from "../components/PdfPreviewModal";
import {
  Plus, ArrowClockwise, FileText, Eye, Trash, PaperPlaneTilt,
  MagnifyingGlass, CheckCircle, Clock, Warning, PencilSimple
} from "@phosphor-icons/react";

const STATUS_BADGE = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 border-slate-400" },
  submitted: { label: "Submitted → Eng", cls: "bg-amber-100 text-amber-800 border-amber-500" },
  accepted: { label: "Accepted by Eng", cls: "bg-sky-100 text-sky-800 border-sky-500" },
  in_progress: { label: "Drawing In Progress", cls: "bg-violet-100 text-violet-800 border-violet-500" },
  completed: { label: "Selesai · Butuh TTD Sales", cls: "bg-emerald-100 text-emerald-800 border-emerald-500 font-bold" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-800 border-rose-500" },
};

export default function DrawingRequestFormPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editDrf, setEditDrf] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat DRF");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      return [d.form_no, d.so_no, d.customer_name, d.project_name].some((v) => (v || "").toLowerCase().includes(s));
    }
    return true;
  });
  const pag = usePagination(filtered, 20);

  const doSubmit = async (drf) => {
    if (!window.confirm(`Submit DRF ${drf.form_no} ke Engineering? Setelah submit tidak bisa diedit.`)) return;
    try {
      await api.post(`/drawing-requests/${drf.id}/submit`);
      toast.success("✓ DRF submitted ke Engineering");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal submit");
    }
  };

  const doCancel = async (drf) => {
    if (!window.confirm(`Cancel DRF ${drf.form_no}?`)) return;
    try {
      await api.post(`/drawing-requests/${drf.id}/cancel`);
      toast.success("DRF dibatalkan");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal cancel");
    }
  };

  const counts = {
    all: items.length,
    draft: items.filter((d) => d.status === "draft").length,
    submitted: items.filter((d) => d.status === "submitted").length,
    in_progress: items.filter((d) => ["accepted", "in_progress"].includes(d.status)).length,
    completed: items.filter((d) => d.status === "completed").length,
  };

  return (
    <div className="p-4 max-w-[1500px] mx-auto space-y-4">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-rose-600 mb-1">
            <FileText size={14} weight="fill" /> Sales · MKS-F-ENG-001
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Drawing Request Form
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Buat request drawing ke Engineering. Pilih <b>New Order</b> untuk order baru, atau <b>Repeat Order</b> untuk order pengulangan (referensi drawing/BOM lama).
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="rounded-none bg-rose-700 hover:bg-rose-800 text-white shadow-lg"
          data-testid="drf-create-btn"
        >
          <Plus size={16} weight="bold" className="mr-1.5" /> Buat Request Baru
        </Button>
      </div>

      {/* Status counters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { k: "all", lbl: "Semua", icon: FileText, color: "slate" },
          { k: "draft", lbl: "Draft", icon: Warning, color: "slate" },
          { k: "submitted", lbl: "Menunggu Eng", icon: Clock, color: "amber" },
          { k: "in_progress", lbl: "In Progress", icon: PaperPlaneTilt, color: "violet" },
          { k: "completed", lbl: "TTD Sales", icon: CheckCircle, color: "emerald" },
        ].map(({ k, lbl, icon: Icon, color }) => (
          <button
            key={k}
            onClick={() => setStatusFilter(k)}
            className={`rounded-none border p-2 flex items-center gap-2 text-left transition ${statusFilter === k ? `bg-${color}-50 border-${color}-500` : "bg-white border-slate-200 hover:bg-slate-50"}`}
            data-testid={`drf-filter-${k}`}
          >
            <Icon size={20} weight="duotone" className={`text-${color}-500`} />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 truncate">{lbl}</div>
              <div className="text-lg font-bold text-slate-900">{counts[k] ?? 0}</div>
            </div>
          </button>
        ))}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input
            className="h-9 rounded-none border-slate-300 w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari No Form / SO / Customer / Project..."
            data-testid="drf-search"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500">
            <b className="text-rose-700">{filtered.length}</b> / {items.length} DRF
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Form No</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Project</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Due</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="drf-list">
              {loading && (<tr><td colSpan={9} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="p-12 text-center text-slate-400">
                  Belum ada Drawing Request Form. Klik "Buat Request Baru".
                </td></tr>
              )}
              {pag.pagedData.map((d) => {
                const badge = STATUS_BADGE[d.status] || STATUS_BADGE.draft;
                const canEdit = d.status === "draft" && d.created_by === user?.id;
                const canSubmit = d.status === "draft" && d.created_by === user?.id;
                return (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-rose-50/30" data-testid={`drf-row-${d.form_no}`}>
                    <td className="p-3 font-mono font-semibold text-slate-900 text-xs">{d.form_no}</td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.request_type === "new_order" ? "bg-emerald-100 text-emerald-800 border border-emerald-400" : "bg-blue-100 text-blue-800 border border-blue-400"}`}>
                        {d.request_type === "new_order" ? "New Order" : "Repeat"}
                      </span>
                      {d.ref_so_manual && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-400" title={`SO lama diinput manual: ${d.ref_so_no || "-"} — mohon Engineering verifikasi`} data-testid={`drf-so-manual-${d.form_no}`}>
                          SO Manual
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                    <td className="p-3 text-xs">{d.project_name || "-"}</td>
                    <td className="p-3 text-xs">{d.customer_name || d.customer_code || "-"}</td>
                    <td className="p-3 text-right text-xs">{d.qty_order} <span className="text-slate-500">{d.unit}</span></td>
                    <td className="p-3 text-xs">{d.expected_due_date || "-"}</td>
                    <td className="p-3 text-center">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        <button
                          onClick={() => setDetailId(d.id)}
                          className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`drf-view-${d.form_no}`}
                          title="Lihat detail & preview lampiran (view-only)"
                        >
                          <Eye size={11} weight="bold" /> Detail
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => setEditDrf(d)}
                            className="inline-flex items-center px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase gap-0.5"
                            data-testid={`drf-edit-${d.form_no}`}
                            title="Edit DRF (draft)"
                          >
                            <PencilSimple size={11} weight="bold" /> Edit
                          </button>
                        )}
                        {canSubmit && (
                          <button
                            onClick={() => doSubmit(d)}
                            className="inline-flex items-center px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase gap-0.5"
                            data-testid={`drf-submit-${d.form_no}`}
                            title="Submit ke Engineering (auto-TTD Sales)"
                          >
                            <PaperPlaneTilt size={11} weight="bold" /> Submit
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => doCancel(d)}
                            className="inline-flex items-center px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase"
                            data-testid={`drf-cancel-${d.form_no}`}
                          >
                            <Trash size={11} weight="bold" />
                          </button>
                        )}
                        {d.linked_drawing_id && d.status === "completed" && (
                          <button
                            onClick={() => setPreview({ id: d.linked_drawing_id, drawing_no: d.so_no || d.form_no, project_name: d.project_name, customer_name: d.customer_name })}
                            className="inline-flex items-center px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase gap-0.5"
                            data-testid={`drf-view-drawing-${d.form_no}`}
                            title="Lihat Drawing MKS yang sudah selesai"
                          >
                            <Eye size={11} weight="bold" /> Drawing
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
        <PaginationBar {...pag} label="DRF" testIdPrefix="drf-pag" />
      </Card>

      {(showCreate || editDrf) && (
        <DrawingRequestFormDialog
          initial={editDrf}
          onClose={() => { setShowCreate(false); setEditDrf(null); }}
          onSaved={() => { setShowCreate(false); setEditDrf(null); load(); }}
        />
      )}

      {preview && (
        <PdfPreviewModal
          drawingId={preview.id}
          target="mks"
          stamped
          title={preview.drawing_no}
          subtitle={`${preview.project_name || ""}${preview.customer_name ? " · " + preview.customer_name : ""}`}
          onClose={() => setPreview(null)}
        />
      )}

      {detailId && (
        <DrfDetailModal drf={{ id: detailId }} isHead={false} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}
