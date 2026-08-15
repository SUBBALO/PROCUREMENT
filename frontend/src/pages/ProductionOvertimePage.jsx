import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Clock, Plus, Trash, X, FloppyDisk, CalendarBlank } from "@phosphor-icons/react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const inputCls = "w-full h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500";
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const EMPTY = { ot_date: todayStr(), ot_no: "", name: "", so_no: "", customer: "", ot_start: "", ot_end: "" };

export default function ProductionOvertimePage() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState({ items: [], summary: [], total_hours: 0 });
  const [loading, setLoading] = useState(true);
  const [sos, setSos] = useState([]);
  const [emps, setEmps] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/production/overtime", { params: { month } }); setData(data); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { (async () => { try { const r = await api.get("/production/so-brief"); setSos(r.data.items || []); } catch {} try { const e = await api.get("/production/employees"); setEmps(e.data.items || []); } catch {} })(); }, []);

  const soMap = useMemo(() => { const m = {}; sos.forEach((s) => { m[s.so_no] = s; }); return m; }, [sos]);
  const setField = (k, v) => setForm((f) => { const n = { ...f, [k]: v }; if (k === "so_no" && soMap[v]) n.customer = soMap[v].customer || ""; return n; });

  const save = async () => {
    if (!form.name.trim()) { toast.error("Isi nama"); return; }
    setSaving(true);
    try { await api.post("/production/overtime", form); toast.success("OT Request tersimpan"); setModalOpen(false); setForm(EMPTY); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setSaving(false); }
  };
  const remove = async (r) => { if (!window.confirm(`Hapus OT ${r.ot_no}?`)) return; try { await api.delete(`/production/overtime/${r.id}`); load(); } catch { toast.error("Gagal"); } };

  return (
    <div className="p-4 max-w-[1300px] mx-auto space-y-4" data-testid="overtime-page">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1"><Clock size={14} weight="fill" /> Produksi · Overtime</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Overtime Request &amp; Rekap</h1>
          <p className="text-xs text-slate-500 mt-1">Form permintaan lembur per SO. Lihat total jam OT tiap karyawan dalam 1 bulan.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-slate-500" /><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="ot-month" className="text-sm outline-none bg-transparent" /></div>
          <button onClick={() => { setForm(EMPTY); setModalOpen(true); }} data-testid="add-ot-btn" className="inline-flex items-center gap-1.5 h-9 px-4 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700"><Plus size={16} weight="bold" /> Overtime Request</button>
        </div>
      </div>

      {/* Summary total OT per karyawan */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Total OT per Karyawan · {month} <span className="text-amber-700">(Total: {data.total_hours} jam)</span></div>
        <div className="flex flex-wrap gap-2" data-testid="ot-summary">
          {(data.summary || []).length === 0 ? <span className="text-xs text-slate-400">Belum ada OT bulan ini.</span> :
            data.summary.map((s) => <span key={s.name} className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-bold text-amber-800">{s.name}: {s.total_hours} jam</span>)}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ot-table">
            <thead><tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-bold">Tanggal</th><th className="px-3 py-2 text-left font-bold">No.</th><th className="px-3 py-2 text-left font-bold">Nama</th>
              <th className="px-3 py-2 text-left font-bold">SO No</th><th className="px-3 py-2 text-left font-bold">Customer</th>
              <th className="px-3 py-2 text-center font-bold">Jam OT</th><th className="px-3 py-2 text-center font-bold">Total Jam</th><th className="px-3 py-2 text-center font-bold w-14">Aksi</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
                : data.items.length === 0 ? <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400" data-testid="ot-empty">Belum ada OT Request.</td></tr>
                : data.items.map((r, i) => (
                  <tr key={r.id} className="hover:bg-amber-50/40" data-testid={`ot-row-${i}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(r.ot_date)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.ot_no}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-3 py-2 font-mono">{r.so_no || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{r.customer || "—"}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">{r.ot_start} – {r.ot_end}</td>
                    <td className="px-3 py-2 text-center font-bold text-amber-700">{r.hours} jam</td>
                    <td className="px-3 py-2 text-center"><button onClick={() => remove(r)} data-testid={`ot-del-${i}`} className="p-1.5 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash size={15} weight="bold" /></button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="ot-dl-sos">{sos.map((s) => <option key={s.so_no} value={s.so_no}>{s.customer}</option>)}</datalist>
      <datalist id="ot-dl-emps">{emps.map((e) => <option key={e.id} value={e.name} />)}</datalist>

      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="ot-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200"><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Clock size={18} weight="bold" className="text-amber-600" /> Overtime Request Form</h2><button onClick={() => setModalOpen(false)} data-testid="ot-modal-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X size={18} weight="bold" /></button></div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3">
              <div><label className="text-xs font-bold text-slate-600">Tanggal</label><input type="date" value={form.ot_date} onChange={(e) => setField("ot_date", e.target.value)} data-testid="ot-f-date" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">No. (auto)</label><input value={form.ot_no} onChange={(e) => setField("ot_no", e.target.value)} placeholder="OT-YYYYMM-####" data-testid="ot-f-no" className={inputCls} /></div>
              <div className="col-span-2"><label className="text-xs font-bold text-slate-600">Nama *</label><input list="ot-dl-emps" value={form.name} onChange={(e) => setField("name", e.target.value)} data-testid="ot-f-name" placeholder="Nama karyawan" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">SO No</label><input list="ot-dl-sos" value={form.so_no} onChange={(e) => setField("so_no", e.target.value)} data-testid="ot-f-so" placeholder="Pilih SO" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">Customer</label><input value={form.customer} onChange={(e) => setField("customer", e.target.value)} data-testid="ot-f-cust" placeholder="auto dari SO" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">Jam OT (mulai)</label><input type="time" value={form.ot_start} onChange={(e) => setField("ot_start", e.target.value)} data-testid="ot-f-start" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">Jam Selesai OT</label><input type="time" value={form.ot_end} onChange={(e) => setField("ot_end", e.target.value)} data-testid="ot-f-end" className={inputCls} /></div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Batal</button>
              <button onClick={save} disabled={saving} data-testid="ot-save-btn" className="inline-flex items-center gap-1.5 h-9 px-5 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 disabled:opacity-60"><FloppyDisk size={16} weight="bold" /> {saving ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
