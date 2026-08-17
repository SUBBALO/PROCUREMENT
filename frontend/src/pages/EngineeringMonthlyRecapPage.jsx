import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { UsersThree } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * EngineeringMonthlyRecapPage — Rekap produktivitas bulanan per engineer:
 * berapa Inquiry selesai, Drawing Request selesai, Revisi dikerjakan, ECN/ECR diajukan.
 * Dipakai sebagai tab "Rekap Bulanan" di Monitor Engineering (prop embedded).
 */
export default function EngineeringMonthlyRecapPage({ embedded = false }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/engineering/monthly-recap", { params: { month } });
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat rekap bulanan");
    } finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const monthLabel = (() => {
    try { return new Date(month + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" }); }
    catch { return month; }
  })();

  const items = data?.items || [];
  const totals = data?.totals || {};
  const activeItems = items.filter((t) => t.total > 0);
  const idleItems = items.filter((t) => t.total === 0);

  return (
    <div className={embedded ? "pt-3 space-y-3" : "space-y-3 p-4"} data-testid="eng-monthly-recap">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>
            <UsersThree size={16} weight="duotone" className="text-indigo-600" /> Rekap Produktivitas — {monthLabel}
          </div>
          <div className="text-[11px] text-slate-500">
            Per engineer: Inquiry selesai · Drawing Request selesai · Revisi dikerjakan · ECN/ECR diajukan.
          </div>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth)}
          className="h-9 px-2 border border-slate-300 text-sm bg-white" data-testid="recap-month-input" />
      </div>

      <Card className="rounded-none border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-400">Memuat…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Tidak ada user Engineering.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">Engineer</th>
                <th className="p-2 text-center uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">Inquiry Selesai</th>
                <th className="p-2 text-center uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">Drawing Request Selesai</th>
                <th className="p-2 text-center uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">Revisi Dikerjakan</th>
                <th className="p-2 text-center uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold">ECN/ECR Diajukan</th>
                <th className="p-2 text-center uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold bg-indigo-50 text-indigo-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...activeItems, ...idleItems].map((t) => (
                <tr key={t.user_id} className={`border-b border-slate-100 ${t.total === 0 ? "opacity-50" : "hover:bg-indigo-50/40"}`} data-testid={`recap-row-${t.username}`}>
                  <td className="p-2 font-semibold text-slate-800">
                    {t.name}
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400 uppercase">{t.role}</span>
                  </td>
                  <td className="p-2 text-center tabular-nums">{t.inquiry_done || <span className="text-slate-300">0</span>}</td>
                  <td className="p-2 text-center tabular-nums">{t.drf_done || <span className="text-slate-300">0</span>}</td>
                  <td className="p-2 text-center tabular-nums">{t.revisi || <span className="text-slate-300">0</span>}</td>
                  <td className="p-2 text-center tabular-nums">{t.ecn || <span className="text-slate-300">0</span>}</td>
                  <td className="p-2 text-center tabular-nums font-bold bg-indigo-50/50 text-indigo-800">{t.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold">
                <td className="p-2 uppercase text-[10px] tracking-[0.1em]">Total Departemen</td>
                <td className="p-2 text-center tabular-nums" data-testid="recap-total-inquiry">{totals.inquiry_done ?? 0}</td>
                <td className="p-2 text-center tabular-nums" data-testid="recap-total-drf">{totals.drf_done ?? 0}</td>
                <td className="p-2 text-center tabular-nums" data-testid="recap-total-revisi">{totals.revisi ?? 0}</td>
                <td className="p-2 text-center tabular-nums" data-testid="recap-total-ecn">{totals.ecn ?? 0}</td>
                <td className="p-2 text-center tabular-nums" data-testid="recap-total-all">{totals.total ?? 0}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
      <div className="text-[10px] text-slate-400">
        Catatan: Inquiry/DRF dihitung dari tanggal selesai · Revisi dari drawing yang dibuka revisinya bulan tsb (engineer penggambar) · ECN/ECR dari pengajuan revisi di bulan tsb.
      </div>
    </div>
  );
}
