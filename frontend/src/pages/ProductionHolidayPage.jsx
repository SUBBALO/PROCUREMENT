import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { CalendarX, Plus, Trash, CalendarBlank } from "@phosphor-icons/react";

const inputCls = "h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-500";
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); } catch { return d; } };
const curYear = () => String(new Date().getFullYear());

export default function ProductionHolidayPage() {
  const [year, setYear] = useState(curYear());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/production/holidays", { params: { year } });
      setItems(data.items || []);
    } catch (e) { setItems([]); toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!date) { toast.error("Pilih tanggal libur dulu"); return; }
    setSaving(true);
    try {
      await api.post("/production/holidays", { date, name });
      toast.success("Hari libur ditambahkan");
      setDate(""); setName("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const remove = async (h) => {
    if (!window.confirm(`Hapus libur ${fmtDate(h.date)}?`)) return;
    try { await api.delete(`/production/holidays/${h.id}`); toast.success("Dihapus"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); }
  };

  const years = [];
  const y0 = new Date().getFullYear();
  for (let y = y0 - 1; y <= y0 + 2; y++) years.push(String(y));

  return (
    <div className="p-4 max-w-[900px] mx-auto space-y-4" data-testid="holiday-page">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-rose-700 mb-1">
          <CalendarX size={14} weight="fill" /> Produksi · Master Hari Libur Nasional
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Hari Libur Nasional</h1>
        <p className="text-xs text-slate-500 mt-1">Input tanggal libur nasional. Dipakai untuk menghitung <b>Working Date Target</b> di Job Progress (NETWORKDAYS: kecualikan Minggu &amp; hari libur ini).</p>
      </div>

      {/* Form tambah */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-end gap-3 flex-wrap">
        <div className="flex flex-col">
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><CalendarBlank size={13} /> Tanggal Libur</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="holiday-date-input" className={inputCls} />
        </div>
        <div className="flex flex-col flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold text-slate-600">Keterangan (opsional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Idul Fitri, Kemerdekaan RI" data-testid="holiday-name-input" className={inputCls} />
        </div>
        <button onClick={add} disabled={saving} data-testid="holiday-add-btn"
          className="inline-flex items-center gap-1.5 h-9 px-4 bg-rose-600 text-white text-sm font-bold rounded hover:bg-rose-700 disabled:opacity-60 transition-colors">
          <Plus size={16} weight="bold" /> {saving ? "Menyimpan…" : "Tambah"}
        </button>
      </div>

      {/* Filter tahun + list */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-600">Tahun:</span>
        <select value={year} onChange={(e) => setYear(e.target.value)} data-testid="holiday-year-select" className={inputCls}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-xs text-slate-400">{items.length} hari libur</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm" data-testid="holiday-table">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-bold w-10">#</th>
              <th className="px-3 py-2 text-left font-bold">Tanggal</th>
              <th className="px-3 py-2 text-left font-bold">Keterangan</th>
              <th className="px-3 py-2 text-center font-bold w-16">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-slate-400" data-testid="holiday-empty">Belum ada hari libur untuk tahun {year}.</td></tr>
            ) : (
              items.map((h, i) => (
                <tr key={h.id} className="hover:bg-rose-50/40" data-testid={`holiday-row-${i}`}>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{fmtDate(h.date)}</td>
                  <td className="px-3 py-2 text-slate-600">{h.name || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => remove(h)} data-testid={`holiday-delete-${i}`} className="p-1.5 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors" title="Hapus"><Trash size={16} weight="bold" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
