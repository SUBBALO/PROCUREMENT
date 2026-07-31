import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ArrowClockwise, Eye, Stamp, FileText, MagnifyingGlass } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import { Input } from "../components/ui/input";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import SignaturePlacementModal from "../components/SignaturePlacementModal";

const ROLE_STAGE_MAP = {
  eng_leader: "eng_head",
  eng_head: "eng_head",
  engineering: "eng_head",
  qc: "qc",
  sales: "sales",
};

/**
 * PendingApprovalDrawingsPage — halaman khusus approver (Eng Head / QC / Sales)
 * untuk lihat semua drawing yang menunggu TTD digital mereka.
 * Data source: GET /api/drawings/pending-my-approval
 */
export default function PendingApprovalDrawingsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [sigDrawing, setSigDrawing] = useState(null);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawings/pending-my-approval");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat data");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = q.trim()
    ? items.filter((d) => [d.drawing_no, d.project_name, d.customer_name, d.customer_code, d.so_no].some(
        (v) => (v || "").toLowerCase().includes(q.toLowerCase())
      ))
    : items;
  const pag = usePagination(filtered, 20);

  const stage = ROLE_STAGE_MAP[user?.role];
  const roleLabel = {
    eng_head: "Engineering Head",
    eng_leader: "Engineering Head",
    engineering: "Engineering Head",
    qc: "Quality Control",
    sales: "Sales",
    doc_control: "Document Control",
  }[user?.role] || user?.role;

  const doReject = async (d) => {
    const notes = window.prompt(`Alasan reject (wajib, min 5 char):`);
    if (!notes || notes.trim().length < 5) return toast.error("Notes wajib min 5 char");
    try {
      await api.post(`/drawings/${d.id}/reject/${stage}`, { notes: notes.trim() });
      toast.success("Drawing di-reject, kembali ke draft");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reject");
    }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-700 mb-1">
            <Stamp size={14} weight="fill" /> Review & Approval — {roleLabel}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Review & TTD Drawing dari Engineer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Buka PDF & review isi drawing terlebih dahulu. Kalau OK klik <b>TTD & Approve</b> untuk lanjut ke tahap berikutnya. Kalau perlu revisi, klik <b>Reject</b> dengan catatan yang jelas.
          </p>
        </div>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input
            className="h-9 rounded-none border-slate-300 w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari drawing no / project / customer / SO..."
            data-testid="pending-search"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500">
            <b className="text-emerald-700">{filtered.length}</b> drawing menunggu TTD Anda
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Drawing No</th>
                <th className="text-left p-3">Title / Project</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Prepared By</th>
                <th className="text-left p-3">Request Sales</th>
                <th className="text-center p-3">Sudah TTD</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="pending-approval-list">
              {loading && (<tr><td colSpan={8} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="p-12 text-center text-slate-400">
                  🎉 Tidak ada drawing yang menunggu TTD Anda saat ini.
                </td></tr>
              )}
              {pag.pagedData.map((d) => {
                const approvedCount = (d.approvals || []).filter((a) => !a.stage?.startsWith("reject_") && a.stage !== "submit").length;
                return (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-emerald-50/40" data-testid={`pending-row-${d.drawing_no}`}>
                    <td className="p-3 font-mono font-semibold text-slate-900">{d.drawing_no}</td>
                    <td className="p-3 text-slate-800">
                      <div className="font-semibold">{d.title || "-"}</div>
                      <div className="text-xs text-slate-500">{d.project_name || ""}</div>
                    </td>
                    <td className="p-3 text-xs">{d.customer_name || d.customer_code || "-"}</td>
                    <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                    <td className="p-3 text-xs">{d.prepared_by || "-"}</td>
                    <td className="p-3 text-xs">{d.request_by_sales || "-"}</td>
                    <td className="p-3 text-center text-xs">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold">{approvedCount} / 3 ✓</span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <a
                          href={`${apiUrl}/api/drawings/${d.id}/pdf-stamped`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`pending-view-${d.drawing_no}`}
                        >
                          <Eye size={11} weight="bold" /> View PDF
                        </a>
                        <button
                          onClick={() => setSigDrawing(d)}
                          disabled={!stage}
                          className="inline-flex items-center px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase gap-0.5 disabled:opacity-50"
                          data-testid={`pending-approve-${d.drawing_no}`}
                        >
                          <Stamp size={11} weight="bold" /> TTD & Approve
                        </button>
                        <button
                          onClick={() => doReject(d)}
                          className="inline-flex items-center px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase"
                          data-testid={`pending-reject-${d.drawing_no}`}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="drawing" testIdPrefix="pending-pag" />
      </Card>

      {sigDrawing && stage && (
        <SignaturePlacementModal
          drawing={sigDrawing}
          stage={stage}
          onDone={() => { setSigDrawing(null); load(); }}
          onClose={() => setSigDrawing(null)}
        />
      )}
    </div>
  );
}
