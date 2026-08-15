import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { SealCheck, CheckCircle, XCircle, Package } from "@phosphor-icons/react";

const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };

export default function ProductionQcReleasePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/production/frn/pending-qc"); setItems(data.items || []); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    try { await api.post(`/production/frn/${id}/${action}`); toast.success(action === "release" ? "Released — barang jadi siap kirim" : "Ditolak QC"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4" data-testid="qc-release-page">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-700 mb-1"><SealCheck size={14} weight="fill" /> Produksi · QC</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>QC — Release Note Menunggu Persetujuan</h1>
        <p className="text-xs text-slate-500 mt-1">QC cek barang. <b>Release</b> = lolos &amp; siap dikirim. <b>Tolak</b> = dikembalikan ke produksi.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="qc-table">
            <thead><tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-bold">Tanggal</th>
              <th className="px-3 py-2 text-left font-bold">No. Release</th>
              <th className="px-3 py-2 text-left font-bold">SO No</th>
              <th className="px-3 py-2 text-left font-bold">Customer</th>
              <th className="px-3 py-2 text-left font-bold">Deskripsi Item</th>
              <th className="px-3 py-2 text-center font-bold">Qty</th>
              <th className="px-3 py-2 text-left font-bold">QC Comment</th>
              <th className="px-3 py-2 text-center font-bold w-40">Aksi</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
                : items.length === 0 ? <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-400" data-testid="qc-empty"><Package size={28} className="mx-auto mb-2 text-slate-300" />Tidak ada release note yang menunggu QC.</td></tr>
                : items.map((r, i) => (
                  <tr key={r.id} className="hover:bg-emerald-50/40" data-testid={`qc-row-${i}`}>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(r.frn_date)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.release_no}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900">{r.so_no}</td>
                    <td className="px-3 py-2 text-slate-700">{r.customer || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{r.description || "—"}</td>
                    <td className="px-3 py-2 text-center font-bold text-emerald-700">{r.qty}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate" title={r.qc_comment}>{r.qc_comment || "—"}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => act(r.id, "release")} data-testid={`qc-release-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle size={13} weight="bold" /> Release</button>
                        <button onClick={() => act(r.id, "reject")} data-testid={`qc-reject-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-rose-100 text-rose-700 hover:bg-rose-200"><XCircle size={13} weight="bold" /> Tolak</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
