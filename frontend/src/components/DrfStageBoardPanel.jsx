import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { ArrowClockwise, UsersThree, Hourglass, TrayArrowDown, Gear } from "@phosphor-icons/react";

/**
 * DrfStageBoardPanel — ringkasan beban DRF per engineer dalam 3 tahap
 * (Antri / Diterima / Proses). Untuk monitor Leader/Bos.
 */
export default function DrfStageBoardPanel() {
  const [data, setData] = useState({ items: [], totals: {}, submitted_waiting: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawing-requests/stage-board");
      setData(data);
    } catch (e) { /* opsional */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = (data.items || []).filter((r) => r.total > 0);
  const t = data.totals || {};

  if (loading) {
    return (
      <div className="border-2 border-slate-200 bg-white p-4 text-center text-slate-400" data-testid="stageboard-loading">
        <ArrowClockwise size={18} className="mx-auto animate-spin" />
      </div>
    );
  }

  const Chip = ({ n, color }) => (
    <span className={`inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${color}`}>{n || 0}</span>
  );

  return (
    <div className="border-2 border-indigo-300 bg-white" data-testid="stageboard-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <UsersThree size={18} weight="fill" />
          <span className="text-sm font-bold uppercase tracking-[0.15em]">Beban Kerja Engineer</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="px-2 py-0.5 bg-white/20">Perlu di-assign: {t.submitted_waiting || 0}</span>
          <button onClick={load} className="p-1 hover:bg-white/20" data-testid="stageboard-refresh"><ArrowClockwise size={14} /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-slate-500 border-b border-slate-200">
              <th className="px-4 py-2">Engineer</th>
              <th className="px-2 py-2 text-center"><span className="inline-flex items-center gap-1 text-amber-700"><Hourglass size={12} weight="fill" /> Antri</span></th>
              <th className="px-2 py-2 text-center"><span className="inline-flex items-center gap-1 text-sky-700"><TrayArrowDown size={12} weight="fill" /> Diterima</span></th>
              <th className="px-2 py-2 text-center"><span className="inline-flex items-center gap-1 text-emerald-700"><Gear size={12} weight="fill" /> Proses</span></th>
              <th className="px-3 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada job aktif pada engineer manapun.</td></tr>
            )}
            {items.map((r) => (
              <tr key={r.user_id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`stageboard-row-${r.user_id}`}>
                <td className="px-4 py-2 font-semibold text-slate-800">{r.name}</td>
                <td className="px-2 py-2 text-center"><Chip n={r.antri} color="bg-amber-100 text-amber-800" /></td>
                <td className="px-2 py-2 text-center"><Chip n={r.diterima} color="bg-sky-100 text-sky-800" /></td>
                <td className="px-2 py-2 text-center"><Chip n={r.proses} color="bg-emerald-100 text-emerald-800" /></td>
                <td className="px-3 py-2 text-center font-bold tabular-nums text-slate-900">{r.total}</td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-bold">
                <td className="px-4 py-2 text-slate-700 uppercase text-[11px] tracking-wider">Total</td>
                <td className="px-2 py-2 text-center tabular-nums text-amber-800">{t.antri || 0}</td>
                <td className="px-2 py-2 text-center tabular-nums text-sky-800">{t.diterima || 0}</td>
                <td className="px-2 py-2 text-center tabular-nums text-emerald-800">{t.proses || 0}</td>
                <td className="px-3 py-2 text-center tabular-nums text-slate-900">{(t.antri || 0) + (t.diterima || 0) + (t.proses || 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
