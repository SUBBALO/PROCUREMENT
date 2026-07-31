import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfPreviewModal from "../components/PdfPreviewModal";
import { ArrowClockwise, ClipboardText, Eye, MagnifyingGlass, Pencil, UploadSimple } from "@phosphor-icons/react";

const APPROVAL_LABEL = {
  draft: { text: "Draft — perlu upload PDF", cls: "bg-slate-100 text-slate-700 border-slate-400" },
  pending_eng_head: { text: "Menunggu TTD Eng Head", cls: "bg-amber-100 text-amber-800 border-amber-500" },
  pending_qc: { text: "Menunggu TTD QC", cls: "bg-orange-100 text-orange-800 border-orange-500" },
  pending_sales: { text: "Menunggu TTD Sales", cls: "bg-yellow-100 text-yellow-800 border-yellow-500" },
  approved: { text: "Approved · Menunggu DC Stamp", cls: "bg-sky-100 text-sky-800 border-sky-500" },
  controlled: { text: "Controlled ✓", cls: "bg-indigo-100 text-indigo-800 border-indigo-500" },
  released: { text: "Released ✓ (Siap Produksi)", cls: "bg-emerald-100 text-emerald-800 border-emerald-500" },
  rejected: { text: "Rejected — perlu revisi", cls: "bg-rose-100 text-rose-800 border-rose-500" },
};

/**
 * MyAssignmentsPage — halaman Engineering Staff untuk lihat semua drawing yang
 * di-assign kepada mereka oleh Eng Leader (Riski), lengkap dengan status per drawing.
 */
export default function MyAssignmentsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawings/my-assignments");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = q.trim()
    ? items.filter((d) => `${d.drawing_no} ${d.title} ${d.project_name} ${d.customer_name}`.toLowerCase().includes(q.toLowerCase()))
    : items;
  const pag = usePagination(filtered, 20);

  // Counter status
  const counts = {
    draft: items.filter((d) => d.approval_status === "draft").length,
    pending: items.filter((d) => (d.approval_status || "").startsWith("pending_")).length,
    approved: items.filter((d) => ["approved", "controlled", "released"].includes(d.approval_status)).length,
    total: items.length,
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
          <ClipboardText size={14} weight="fill" /> Engineering · My Tasks
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Tugas Drawing Saya
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Semua drawing yang di-assign kepada Anda oleh Engineering Head. Klik drawing untuk edit / upload PDF / submit approval.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { k: "total", lbl: "Total Tugas", val: counts.total, color: "slate" },
          { k: "draft", lbl: "Draft (Perlu Upload)", val: counts.draft, color: "amber" },
          { k: "pending", lbl: "Sedang di-Approve", val: counts.pending, color: "orange" },
          { k: "approved", lbl: "Approved / Selesai", val: counts.approved, color: "emerald" },
        ].map(({ k, lbl, val, color }) => (
          <div key={k} className={`rounded-none border p-3 bg-${color}-50 border-${color}-300`}>
            <div className="text-[10px] uppercase tracking-widest text-slate-600">{lbl}</div>
            <div className={`text-2xl font-bold text-${color}-800`}>{val}</div>
          </div>
        ))}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari drawing no / project / customer..." data-testid="myassign-search" />
          <Button variant="ghost" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500"><b>{filtered.length}</b> drawing</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Drawing No</th>
                <th className="text-left p-3">Title / Project</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Assigned By</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="myassign-list">
              {loading && (<tr><td colSpan={7} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-slate-400">
                  🎉 Belum ada tugas drawing untuk Anda. Tunggu Eng Head assign.
                </td></tr>
              )}
              {pag.pagedData.map((d) => {
                const st = APPROVAL_LABEL[d.approval_status] || APPROVAL_LABEL.draft;
                // Iter 22 — Kalau drawing belum selesai → arahkan ke Work Order page
                //           Kalau sudah selesai (approved/controlled/released) → ke Master List
                const isDone = ["approved", "controlled", "released"].includes(d.approval_status);
                const openHref = isDone
                  ? `/engineering/drawings#${d.drawing_no}`
                  : `/engineering/work-order/${d.id}`;
                return (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-teal-50/40" data-testid={`myassign-row-${d.drawing_no}`}>
                    <td className="p-3 font-mono font-semibold text-slate-900">{d.drawing_no}</td>
                    <td className="p-3">
                      <div className="text-slate-800">{d.title || "-"}</div>
                      <div className="text-xs text-slate-500">{d.project_name || ""}</div>
                    </td>
                    <td className="p-3 text-xs">{d.customer_name || d.customer_code || "-"}</td>
                    <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                    <td className="p-3 text-xs">{d.assigned_by || "-"}</td>
                    <td className="p-3 text-center">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${st.cls}`}>
                        {st.text}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <a
                          href={openHref}
                          className="inline-flex items-center px-2 py-1 bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`myassign-open-${d.drawing_no}`}
                          title={isDone ? "Drawing selesai — buka Master List" : "Buka Work Order untuk isi BOM + upload PDF"}
                        >
                          <Pencil size={11} weight="bold" /> {isDone ? "Master List" : "Work Order"}
                        </a>
                        {d.file_id && (
                          <button
                            onClick={() => setPreview(d)}
                            className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                            data-testid={`myassign-view-${d.drawing_no}`}
                          >
                            <Eye size={11} weight="bold" /> Preview
                          </button>
                        )}
                        {!d.file_id && (
                          <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-800 border border-amber-400 text-[10px] font-bold uppercase gap-0.5">
                            <UploadSimple size={11} weight="bold" /> Upload PDF
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="drawing" testIdPrefix="myassign-pag" />
      </Card>

      {preview && (
        <PdfPreviewModal
          drawingId={preview.id}
          target="mks"
          stamped
          title={preview.drawing_no}
          subtitle={`${preview.title || ""}${preview.customer_name ? " · " + preview.customer_name : ""}`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
