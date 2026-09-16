import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { downloadXlsx, formatApiErrorDetail, formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import BackLink from "../components/BackLink";
import CarDetailModal from "../components/CarDetailModal";
import { useAuth } from "../lib/auth";
import { CAR_STATUS_LABEL, CAR_STATUS_CLS } from "../lib/carConstants";
import {
  ClipboardText, DownloadSimple, ArrowClockwise, Gear,
} from "@phosphor-icons/react";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function EngineeringProcessPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [detailNo, setDetailNo] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      const { data } = await api.get(`/nonconformance/eng006-nc-log?${params.toString()}`);
      setRows(data.rows || []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal memuat data proses");
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (nc_no) => {
    try {
      const { data } = await api.get(`/nonconformance?q=${encodeURIComponent(nc_no)}`);
      const found = (data.items || []).find((x) => x.nc_no === nc_no);
      if (found) { setDetailId(found.id); setDetailNo(nc_no); }
    } catch { /* noop */ }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadXlsx(
        "/nonconformance/eng006-nc-log/excel",
        { month },
        `MKS-F-ENG-006_NC_${month || "all"}.xlsx`,
      );
      toast.success("Excel berhasil diunduh");
    } catch (e) {
      toast.error(e.message || "Gagal export Excel");
    } finally { setExporting(false); }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-600 mb-1">
            <ClipboardText size={14} weight="fill" /> Engineering · MKS-F-ENG-006
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Internal Engineering Process (NC)
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Log proses internal Engineering berdasarkan Nonconformance (CAR). Setiap NC drawing →
            Engineer menerbitkan ECN → tercatat di sini beserta <b>Root Cause</b>, <b>Corrective</b> &
            <b> Preventive Action</b>. Gunakan filter bulan lalu <b>Export Excel</b> untuk arsip.
          </p>
        </div>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <label className="text-xs font-semibold text-slate-600">Bulan</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 border border-slate-300 text-sm px-2 bg-white"
            data-testid="eng006-month"
          />
          <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh" data-testid="eng006-refresh">
            <ArrowClockwise size={14} weight="bold" />
          </Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500 mr-2"><b className="text-amber-700">{rows.length}</b> NC</div>
          <Button
            onClick={exportExcel}
            disabled={exporting || rows.length === 0}
            className="rounded-none bg-emerald-600 hover:bg-emerald-700 h-9"
            data-testid="eng006-export"
          >
            <DownloadSimple size={16} weight="bold" className="mr-1" /> {exporting ? "Menyiapkan…" : "Export Excel"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">No CAR</th>
                <th className="text-left p-3">No SO</th>
                <th className="text-left p-3">Tanggal</th>
                <th className="text-left p-3">Drawing</th>
                <th className="text-left p-3">Root Cause</th>
                <th className="text-left p-3">Corrective Action</th>
                <th className="text-left p-3">Preventive Action</th>
                <th className="text-center p-3">Status</th>
                <th className="text-left p-3">No ECN</th>
              </tr>
            </thead>
            <tbody data-testid="eng006-list">
              {loading && <tr><td colSpan={9} className="p-8 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="p-12 text-center text-slate-400">
                  Belum ada NC pada bulan ini.
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr
                  key={r.nc_no}
                  onClick={() => openDetail(r.nc_no)}
                  className="border-b border-slate-100 hover:bg-amber-50/50 cursor-pointer align-top"
                  data-testid={`eng006-row-${r.nc_no}`}
                >
                  <td className="p-3 font-mono font-bold text-slate-900 text-xs whitespace-nowrap">{r.nc_no}</td>
                  <td className="p-3 text-xs font-mono">{r.so_no || "-"}</td>
                  <td className="p-3 text-xs whitespace-nowrap">{r.date ? formatDateID(r.date) : "-"}</td>
                  <td className="p-3 text-xs font-mono max-w-[180px]">
                    <span className="line-clamp-2" title={(r.drawing_nos || []).join(", ")}>
                      {(r.drawing_nos || []).join(", ") || "-"}
                    </span>
                  </td>
                  <td className="p-3 text-xs max-w-[220px]"><span className="line-clamp-3 text-slate-700">{r.root_cause || <span className="text-slate-300">—</span>}</span></td>
                  <td className="p-3 text-xs max-w-[220px]"><span className="line-clamp-3 text-slate-700">{r.corrective_action || <span className="text-slate-300">—</span>}</span></td>
                  <td className="p-3 text-xs max-w-[220px]"><span className="line-clamp-3 text-slate-700">{r.preventive_action || <span className="text-slate-300">—</span>}</span></td>
                  <td className="p-3 text-center"><span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${CAR_STATUS_CLS[r.status] || ""}`}>{CAR_STATUS_LABEL[r.status] || r.status}</span></td>
                  <td className="p-3 text-xs font-mono">{r.ecn_no || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Gear size={12} /> Klik baris untuk membuka detail CAR terkait.
      </div>

      <CarDetailModal open={!!detailId} ncId={detailId} user={user} onClose={() => { setDetailId(null); setDetailNo(null); }} onChanged={load} />
    </div>
  );
}
