import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ClipboardText, CheckCircle, ArrowCounterClockwise, ArrowClockwise } from "@phosphor-icons/react";

function fmtDate(s) {
  if (!s) return "-";
  try { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function ProductionNewSoPage() {
  const [items, setItems] = useState([]);
  const [scope, setScope] = useState("unack");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/production/new-so?scope=${scope}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat SO");
    } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const ack = async (so) => {
    setBusy(so.id);
    try {
      await api.post(`/production/new-so/${so.id}/ack`);
      toast.success(`SO ${so.so_no || ""} ditandai siap`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal acknowledge");
    } finally { setBusy(null); }
  };

  const unack = async (so) => {
    setBusy(so.id);
    try {
      await api.post(`/production/new-so/${so.id}/unack`);
      toast.success(`SO ${so.so_no || ""} dikembalikan ke daftar baru`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membatalkan");
    } finally { setBusy(null); }
  };

  const StatusPill = ({ ok, label }) => (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] border ${
      ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-50 text-slate-400"
    }`}>{label}{ok ? " ✓" : " –"}</span>
  );

  return (
    <div className="space-y-3">
      <BackLink />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <ClipboardText size={20} weight="duotone" className="text-emerald-600" /> SO Masuk (Baru)
          </h1>
          <p className="text-slate-500">
            Sales Order yang baru dibuat. Produksi bisa lihat lebih awal (walau drawing belum di-stamp), pantau kesiapan drawing/BOM, lalu tandai <b>siap disiapkan</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-slate-300 rounded-none overflow-hidden">
            <button
              data-testid="scope-unack"
              onClick={() => setScope("unack")}
              className={`px-3 h-8 text-[11px] uppercase tracking-[0.08em] font-bold ${scope === "unack" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >Baru</button>
            <button
              data-testid="scope-all"
              onClick={() => setScope("all")}
              className={`px-3 h-8 text-[11px] uppercase tracking-[0.08em] font-bold border-l border-slate-300 ${scope === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >Semua</button>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-none h-8 text-xs" data-testid="refresh-btn">
            <ArrowClockwise size={13} weight="bold" className="mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none bg-white">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200">
          <h3 className="uppercase tracking-[0.15em] font-bold text-slate-500">Daftar Sales Order</h3>
          <span className="text-slate-500" data-testid="so-count">Total: <b>{items.length}</b></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="new-so-table">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-600 text-left">
                <th className="px-2 py-1 w-28">No. SO</th>
                <th className="px-2 py-1 w-24">Tanggal</th>
                <th className="px-2 py-1 min-w-[180px]">Customer</th>
                <th className="px-2 py-1 min-w-[220px]">Keterangan</th>
                <th className="px-2 py-1 w-24 text-center">Drawing</th>
                <th className="px-2 py-1 w-24 text-center">BOM</th>
                <th className="px-2 py-1 w-28">Status</th>
                <th className="px-2 py-1 w-32 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400" data-testid="empty-state">
                  {scope === "unack" ? "Tidak ada SO baru. Semua sudah disiapkan 🎉" : "Belum ada SO."}
                </td></tr>
              )}
              {!loading && items.map((so) => (
                <tr key={so.id} className="border-b border-slate-100 hover:bg-emerald-50/40" data-testid={`so-row-${so.so_no}`}>
                  <td className="px-2 py-1 font-mono font-bold text-slate-900">{so.so_no || "-"}</td>
                  <td className="px-2 py-1 text-slate-600 whitespace-nowrap">{fmtDate(so.so_date || so.created_at)}</td>
                  <td className="px-2 py-1 text-slate-800">{so.customer || "-"}</td>
                  <td className="px-2 py-1 text-slate-600">{so.description || "-"}</td>
                  <td className="px-2 py-1 text-center"><StatusPill ok={so.has_drawing} label="DWG" /></td>
                  <td className="px-2 py-1 text-center"><StatusPill ok={so.has_bom} label="BOM" /></td>
                  <td className="px-2 py-1">
                    {so.prod_ack ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-700" title={`oleh ${so.prod_ack_by} · ${fmtDate(so.prod_ack_at)}`}>Siap ✓</span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-600">Baru</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {so.prod_ack ? (
                      <Button variant="outline" size="sm" disabled={busy === so.id} onClick={() => unack(so)} className="rounded-none h-7 text-[10px]" data-testid={`unack-${so.so_no}`}>
                        <ArrowCounterClockwise size={12} weight="bold" className="mr-1" /> Batal
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy === so.id} onClick={() => ack(so)} className="rounded-none h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`ack-${so.so_no}`}>
                        <CheckCircle size={12} weight="bold" className="mr-1" /> Tandai Siap
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
