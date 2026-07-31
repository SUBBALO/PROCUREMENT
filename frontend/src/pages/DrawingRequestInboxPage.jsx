import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import DrawingRequestFormDialog from "../components/DrawingRequestFormDialog";
import { ArrowClockwise, FileText, CheckCircle, Eye, MagnifyingGlass, Wrench } from "@phosphor-icons/react";

/**
 * DrawingRequestInboxPage — halaman Engineering Head (Riski) untuk lihat & accept
 * DRF submitted dari Sales, lalu navigate ke Register Drawing yg pre-filled dari DRF.
 */
export default function DrawingRequestInboxPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewDrf, setViewDrf] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests?scope=for_engineering");
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = q.trim()
    ? items.filter((d) => `${d.form_no} ${d.so_no} ${d.customer_name} ${d.project_name}`.toLowerCase().includes(q.toLowerCase()))
    : items;
  const pag = usePagination(filtered, 20);

  const doAccept = async (drf) => {
    // Kalau sudah accepted (belum ada linked drawing) → skip accept API, langsung navigate ke form
    if (drf.status === "accepted" && !drf.linked_drawing_id) {
      const params = new URLSearchParams({
        from_drf_id: drf.id,
        so_no: drf.so_no,
        project_name: drf.project_name || "",
        customer_name: drf.customer_name || "",
        customer_code: drf.customer_code || "",
        class_material: drf.material || "TBA",
        request_by_sales: (drf.requested_by?.name || ""),
      });
      if (drf.request_type === "repeat_order" && drf.referenced_drawings?.length) {
        params.set("source_drawing_id", drf.referenced_drawings[0]);
      }
      toast.info("Melanjutkan buat drawing...");
      navigate(`/engineering/drawings?${params.toString()}`);
      return;
    }

    if (!window.confirm(`Terima DRF ${drf.form_no} dan mulai buat drawing? Auto-TTD "Received By" dengan nama & tgl Anda.`)) return;
    try {
      await api.post(`/drawing-requests/${drf.id}/accept`);
      toast.success(`✓ DRF diterima. Membuka form Register Drawing...`);
      const params = new URLSearchParams({
        from_drf_id: drf.id,
        so_no: drf.so_no,
        project_name: drf.project_name || "",
        customer_name: drf.customer_name || "",
        customer_code: drf.customer_code || "",
        class_material: drf.material || "TBA",
        request_by_sales: (drf.requested_by?.name || ""),
      });
      if (drf.request_type === "repeat_order" && drf.referenced_drawings?.length) {
        params.set("source_drawing_id", drf.referenced_drawings[0]);
      }
      navigate(`/engineering/drawings?${params.toString()}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal accept");
    }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-600 mb-1">
          <Wrench size={14} weight="fill" /> Engineering · Inbox
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Drawing Request dari Sales
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          List DRF yang menunggu Anda proses: (1) status <b>submitted</b> — perlu Accept, atau (2) sudah <b>accepted</b> tapi drawing belum dibuat — klik <b>Lanjut Buat Drawing</b> untuk kembali ke form Register Drawing.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input
            className="h-9 rounded-none border-slate-300 w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari Form No / SO / Customer / Project..."
            data-testid="drf-inbox-search"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500">
            <b className="text-amber-700">{filtered.length}</b> DRF menunggu accept
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
                <th className="text-left p-3">Material</th>
                <th className="text-left p-3">Due</th>
                <th className="text-left p-3">Submitted By</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="drf-inbox-list">
              {loading && (<tr><td colSpan={10} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="p-12 text-center text-slate-400">
                  🎉 Tidak ada Drawing Request menunggu accept saat ini.
                </td></tr>
              )}
              {pag.pagedData.map((d) => {
                const isAlreadyAccepted = d.status === "accepted" && !d.linked_drawing_id;
                const isInProgress = d.status === "in_progress";
                return (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-amber-50/40" data-testid={`drf-inbox-row-${d.form_no}`}>
                  <td className="p-3 font-mono font-semibold text-slate-900 text-xs">
                    {d.form_no}
                    {isAlreadyAccepted && (
                      <div className="mt-1">
                        <span className="px-1 py-0.5 bg-sky-100 text-sky-800 border border-sky-400 text-[9px] font-bold uppercase">
                          Diterima · Belum Ada Drawing
                        </span>
                      </div>
                    )}
                    {isInProgress && (
                      <div className="mt-1">
                        <span className="px-1 py-0.5 bg-violet-100 text-violet-800 border border-violet-400 text-[9px] font-bold uppercase">
                          Sedang Dikerjakan
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.request_type === "new_order" ? "bg-emerald-100 text-emerald-800 border border-emerald-400" : "bg-blue-100 text-blue-800 border border-blue-400"}`}>
                      {d.request_type === "new_order" ? "New" : "Repeat"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                  <td className="p-3 text-xs">{d.project_name || "-"}</td>
                  <td className="p-3 text-xs">{d.customer_name || "-"}</td>
                  <td className="p-3 text-right text-xs">{d.qty_order} {d.unit}</td>
                  <td className="p-3 text-xs">{d.material || "TBA"}</td>
                  <td className="p-3 text-xs">{d.expected_due_date || "-"}</td>
                  <td className="p-3 text-xs">
                    <div className="font-semibold">{d.requested_by?.name || "-"}</div>
                    <div className="text-[10px] text-slate-500">{d.submitted_at ? new Date(d.submitted_at).toLocaleDateString("id-ID") : ""}</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => setViewDrf(d)}
                        className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                        data-testid={`drf-inbox-view-${d.form_no}`}
                      >
                        <Eye size={11} weight="bold" /> Detail
                      </button>
                      {isInProgress ? (
                        <a
                          href={d.linked_drawing_id ? `/engineering/drawings` : "#"}
                          className="inline-flex items-center px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold uppercase gap-0.5"
                          data-testid={`drf-inbox-track-${d.form_no}`}
                          title="Track progress drawing di Master List"
                        >
                          <Eye size={11} weight="bold" /> Track Drawing
                        </a>
                      ) : (
                        <button
                          onClick={() => doAccept(d)}
                          className={`inline-flex items-center px-2 py-1 text-white text-[10px] font-bold uppercase gap-0.5 ${
                            isAlreadyAccepted ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700"
                          }`}
                          data-testid={`drf-inbox-accept-${d.form_no}`}
                        >
                          <CheckCircle size={11} weight="bold" />
                          {isAlreadyAccepted ? "Lanjut Buat Drawing →" : "Accept & Buat Drawing"}
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
        <PaginationBar {...pag} label="DRF" testIdPrefix="drf-inbox-pag" />
      </Card>

      {viewDrf && (
        <DrawingRequestFormDialog
          initial={viewDrf}
          onClose={() => setViewDrf(null)}
          onSaved={() => { setViewDrf(null); load(); }}
        />
      )}
    </div>
  );
}
