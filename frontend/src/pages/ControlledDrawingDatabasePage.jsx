import React, { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { MagnifyingGlass, ArrowClockwise, Eye, FolderSimple, Printer, Paperclip } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfPreviewModal from "../components/PdfPreviewModal";

/**
 * Controlled Drawing Database — Pusat penyimpanan drawing yang sudah controlled/released.
 * Semua user login bisa lihat & preview (dengan watermark bila non-DC saat print).
 * Search by drawing_no / project / customer / part number.
 */
export default function ControlledDrawingDatabasePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [pdfModal, setPdfModal] = useState(null);
  const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-indigo-600 text-sm";

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

  useEffect(() => { load(); }, [load]);
  const pag = usePagination(items, 20);

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink to="/" />
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Controlled Drawing Database
        </h1>
        <div className="text-xs text-slate-500 mt-1">
          Master repository semua drawing yang sudah melalui Document Control — dapat diakses semua user berdasarkan hak akses.
          Hasil print oleh non-DC akan otomatis diberi watermark "UNCONTROLLED COPY WHEN PRINTED".
        </div>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-indigo-700" />
          <Input
            className={`${inputCls} w-80`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari drawing no / project / customer / part / SO..."
            data-testid="cdd-search"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          <div className="text-xs text-indigo-700 font-bold">{items.length} controlled document</div>
        </div>
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
      </Card>

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
            downloadUrl={`${process.env.REACT_APP_BACKEND_URL}/api/drawings/${d.id}/pdf-stamped`}
            onClose={() => setPdfModal(null)}
          />
        );
      })()}
    </div>
  );
}
