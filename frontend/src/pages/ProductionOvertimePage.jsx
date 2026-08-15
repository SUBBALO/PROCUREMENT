import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { Clock, Plus, Trash, X, FloppyDisk, CalendarBlank, Gear, Info } from "@phosphor-icons/react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const inputCls = "w-full h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500";
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const num = (v) => (v === 0 || v ? String(v) : "—");
const EMPTY = { ot_date: todayStr(), ot_no: "", name: "", so_no: "", customer: "", ot_start: "", ot_end: "", ot_hours: "" };

const DAY_BADGE = {
  weekday: "bg-sky-50 border-sky-200 text-sky-700",
  saturday: "bg-violet-50 border-violet-200 text-violet-700",
  holiday: "bg-rose-50 border-rose-200 text-rose-700",
};

export default function ProductionOvertimePage() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState({ items: [], summary: [], total_hours: 0, total_weighted: 0, rules: null });
  const [loading, setLoading] = useState(true);
  const [sos, setSos] = useState([]);
  const [emps, setEmps] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  // rules master
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState(null);
  const [savingRules, setSavingRules] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/production/overtime", { params: { month } }); setData(data); if (data.rules) setRules(data.rules); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { (async () => { try { const r = await api.get("/production/so-brief"); setSos(r.data.items || []); } catch {} try { const e = await api.get("/production/employees"); setEmps(e.data.items || []); } catch {} })(); }, []);

  const soMap = useMemo(() => { const m = {}; sos.forEach((s) => { m[s.so_no] = s; }); return m; }, [sos]);
  const setField = (k, v) => setForm((f) => { const n = { ...f, [k]: v }; if (k === "so_no" && soMap[v]) n.customer = soMap[v].customer || ""; return n; });

  // Live preview dari backend (day type + rincian pengali)
  useEffect(() => {
    if (!modalOpen) return;
    const hasTimes = form.ot_start && form.ot_end;
    const hasManual = form.ot_hours !== "" && Number(form.ot_hours) > 0;
    if (!form.ot_date || (!hasTimes && !hasManual)) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post("/production/overtime/preview", {
          ot_date: form.ot_date, ot_start: form.ot_start, ot_end: form.ot_end,
          ot_hours: hasManual ? Number(form.ot_hours) : null,
        });
        setPreview(data);
      } catch { setPreview(null); }
    }, 250);
    return () => clearTimeout(t);
  }, [modalOpen, form.ot_date, form.ot_start, form.ot_end, form.ot_hours]);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Isi nama"); return; }
    const hasTimes = form.ot_start && form.ot_end;
    const hasManual = form.ot_hours !== "" && Number(form.ot_hours) > 0;
    if (!hasTimes && !hasManual) { toast.error("Isi jam mulai/selesai atau jumlah jam lembur"); return; }
    setSaving(true);
    try {
      await api.post("/production/overtime", { ...form, ot_hours: hasManual ? Number(form.ot_hours) : null });
      toast.success("OT Request tersimpan"); setModalOpen(false); setForm(EMPTY); setPreview(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setSaving(false); }
  };
  const remove = async (r) => { if (!window.confirm(`Hapus OT ${r.ot_no}?`)) return; try { await api.delete(`/production/overtime/${r.id}`); load(); } catch { toast.error("Gagal"); } };

  const openRules = async () => {
    try { const { data } = await api.get("/production/overtime-rules"); setRules(data.rules); setRulesOpen(true); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat master"); }
  };
  const setRule = (k, v) => setRules((r) => ({ ...r, [k]: v }));
  const saveRules = async () => {
    setSavingRules(true);
    try {
      const payload = { ...rules };
      ["holiday_break_hours", "wd_first_mult", "wd_rest_mult", "hol_normal_mult", "hol_8th_mult", "hol_extra_mult"].forEach((k) => { payload[k] = Number(payload[k]); });
      payload.hol_normal_hours = parseInt(payload.hol_normal_hours, 10) || 0;
      const { data } = await api.put("/production/overtime-rules", payload);
      setRules(data.rules); toast.success("Master lembur tersimpan"); setRulesOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan master"); }
    finally { setSavingRules(false); }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4" data-testid="overtime-page">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1"><Clock size={14} weight="fill" /> Produksi · Overtime</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Overtime Request &amp; Rekap</h1>
          <p className="text-xs text-slate-500 mt-1">Isi jam lembur (mulai–selesai atau jumlah jam manual). Sistem hitung otomatis pengali 1.5x / 2x / 3x / 4x sesuai jenis hari.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-slate-500" /><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="ot-month" className="text-sm outline-none bg-transparent" /></div>
          <button onClick={openRules} data-testid="ot-master-btn" className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded hover:bg-slate-100"><Gear size={16} weight="bold" /> Master Lembur</button>
          <button onClick={() => { setForm(EMPTY); setPreview(null); setModalOpen(true); }} data-testid="add-ot-btn" className="inline-flex items-center gap-1.5 h-9 px-4 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700"><Plus size={16} weight="bold" /> Overtime Request</button>
        </div>
      </div>

      {/* Summary total OT per karyawan */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Rekap OT per Karyawan · {month} <span className="text-amber-700">(Total: {data.total_hours} jam · Tertimbang: {data.total_weighted} jam)</span></div>
        <div className="overflow-x-auto" data-testid="ot-summary">
          {(data.summary || []).length === 0 ? <span className="text-xs text-slate-400">Belum ada OT bulan ini.</span> : (
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="px-2 py-1.5 text-left font-bold">Nama</th>
                <th className="px-2 py-1.5 text-center font-bold">Total Jam</th>
                <th className="px-2 py-1.5 text-center font-bold">1.5x</th>
                <th className="px-2 py-1.5 text-center font-bold">2x</th>
                <th className="px-2 py-1.5 text-center font-bold">3x</th>
                <th className="px-2 py-1.5 text-center font-bold">4x</th>
                <th className="px-2 py-1.5 text-center font-bold text-amber-700">Tertimbang</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.summary.map((s) => (
                  <tr key={s.name} data-testid={`ot-sum-${s.name}`}>
                    <td className="px-2 py-1.5 font-semibold text-slate-800">{s.name}</td>
                    <td className="px-2 py-1.5 text-center">{s.total_hours}</td>
                    <td className="px-2 py-1.5 text-center text-slate-500">{s.x15 || "—"}</td>
                    <td className="px-2 py-1.5 text-center text-slate-500">{s.x2 || "—"}</td>
                    <td className="px-2 py-1.5 text-center text-slate-500">{s.x3 || "—"}</td>
                    <td className="px-2 py-1.5 text-center text-slate-500">{s.x4 || "—"}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-amber-700">{s.weighted_hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ot-table">
            <thead><tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-bold">Tanggal</th><th className="px-3 py-2 text-left font-bold">No.</th><th className="px-3 py-2 text-left font-bold">Nama</th>
              <th className="px-3 py-2 text-left font-bold">SO No</th><th className="px-3 py-2 text-left font-bold">Customer</th>
              <th className="px-3 py-2 text-center font-bold">Jenis Hari</th>
              <th className="px-3 py-2 text-center font-bold">Jam OT</th>
              <th className="px-3 py-2 text-center font-bold">Jam</th>
              <th className="px-3 py-2 text-center font-bold">1.5x</th><th className="px-3 py-2 text-center font-bold">2x</th><th className="px-3 py-2 text-center font-bold">3x</th><th className="px-3 py-2 text-center font-bold">4x</th>
              <th className="px-3 py-2 text-center font-bold text-amber-700">Tertimbang</th>
              <th className="px-3 py-2 text-center font-bold w-14">Aksi</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={14} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
                : data.items.length === 0 ? <tr><td colSpan={14} className="px-3 py-10 text-center text-slate-400" data-testid="ot-empty">Belum ada OT Request.</td></tr>
                : data.items.map((r, i) => (
                  <tr key={r.id} className="hover:bg-amber-50/40" data-testid={`ot-row-${i}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(r.ot_date)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.ot_no}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-3 py-2 font-mono">{r.so_no || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{r.customer || "—"}</td>
                    <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${DAY_BADGE[r.day_type] || DAY_BADGE.weekday}`}>{r.day_label}</span></td>
                    <td className="px-3 py-2 text-center whitespace-nowrap text-slate-500">{r.ot_start && r.ot_end ? `${r.ot_start}–${r.ot_end}` : (r.manual ? "manual" : "—")}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-800">{r.ot_hours}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{r.x15 || "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{r.x2 || "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{r.x3 || "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{r.x4 || "—"}</td>
                    <td className="px-3 py-2 text-center font-bold text-amber-700">{r.weighted_hours}</td>
                    <td className="px-3 py-2 text-center"><button onClick={() => remove(r)} data-testid={`ot-del-${i}`} className="p-1.5 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash size={15} weight="bold" /></button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="ot-dl-sos">{sos.map((s) => <option key={s.so_no} value={s.so_no}>{s.customer}</option>)}</datalist>
      <datalist id="ot-dl-emps">{emps.map((e) => <option key={e.id} value={e.name} />)}</datalist>

      {/* ===== Overtime Request modal ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="ot-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200"><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Clock size={18} weight="bold" className="text-amber-600" /> Overtime Request Form</h2><button onClick={() => setModalOpen(false)} data-testid="ot-modal-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X size={18} weight="bold" /></button></div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3">
              <div><label className="text-xs font-bold text-slate-600">Tanggal</label><input type="date" value={form.ot_date} onChange={(e) => setField("ot_date", e.target.value)} data-testid="ot-f-date" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">No. (auto)</label><input value={form.ot_no} onChange={(e) => setField("ot_no", e.target.value)} placeholder="OT-YYYYMM-####" data-testid="ot-f-no" className={inputCls} /></div>
              <div className="col-span-2"><label className="text-xs font-bold text-slate-600">Nama *</label><input list="ot-dl-emps" value={form.name} onChange={(e) => setField("name", e.target.value)} data-testid="ot-f-name" placeholder="Nama karyawan" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">SO No</label><input list="ot-dl-sos" value={form.so_no} onChange={(e) => setField("so_no", e.target.value)} data-testid="ot-f-so" placeholder="Pilih SO" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">Customer</label><input value={form.customer} onChange={(e) => setField("customer", e.target.value)} data-testid="ot-f-cust" placeholder="auto dari SO" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">Jam OT (mulai)</label><input type="time" value={form.ot_start} onChange={(e) => setField("ot_start", e.target.value)} data-testid="ot-f-start" className={inputCls} /></div>
              <div><label className="text-xs font-bold text-slate-600">Jam Selesai OT</label><input type="time" value={form.ot_end} onChange={(e) => setField("ot_end", e.target.value)} data-testid="ot-f-end" className={inputCls} /></div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-600">Jumlah Jam Lembur (manual, opsional)</label>
                <input type="number" min="0" step="0.5" value={form.ot_hours} onChange={(e) => setField("ot_hours", e.target.value)} data-testid="ot-f-hours" placeholder="Isi angka jam bila tanpa jam mulai/selesai (mis. 7)" className={inputCls} />
                <p className="text-[11px] text-slate-400 mt-0.5">Kosongkan bila pakai jam mulai/selesai. Untuk Minggu/libur, istirahat otomatis dikurangi dari jam mulai–selesai.</p>
              </div>
            </div>

            {/* Live preview rincian pengali */}
            {preview && (
              <div className="mx-5 mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3" data-testid="ot-preview">
                <div className="flex items-center gap-2 text-[11px] font-bold text-amber-800 uppercase mb-2"><Info size={14} weight="bold" /> Perhitungan Otomatis</div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span>Jenis hari: <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${DAY_BADGE[preview.day_type]}`}>{preview.day_label}</span></span>
                  <span>Jam lembur: <b className="text-slate-800" data-testid="ot-preview-hours">{preview.ot_hours} jam</b></span>
                  <span className="text-slate-500">1.5x: <b>{num(preview.x15)}</b></span>
                  <span className="text-slate-500">2x: <b>{num(preview.x2)}</b></span>
                  <span className="text-slate-500">3x: <b>{num(preview.x3)}</b></span>
                  <span className="text-slate-500">4x: <b>{num(preview.x4)}</b></span>
                  <span>Tertimbang: <b className="text-amber-700" data-testid="ot-preview-weighted">{preview.weighted_hours} jam</b></span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Batal</button>
              <button onClick={save} disabled={saving} data-testid="ot-save-btn" className="inline-flex items-center gap-1.5 h-9 px-5 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 disabled:opacity-60"><FloppyDisk size={16} weight="bold" /> {saving ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Master Lembur modal ===== */}
      {rulesOpen && rules && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="ot-rules-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200"><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Gear size={18} weight="bold" className="text-amber-600" /> Master Aturan Lembur</h2><button onClick={() => setRulesOpen(false)} data-testid="ot-rules-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X size={18} weight="bold" /></button></div>
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Jam Kerja / Referensi</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs font-bold text-slate-600">OT Mulai (Sen–Jum)</label><input type="time" value={rules.weekday_start} onChange={(e) => setRule("weekday_start", e.target.value)} data-testid="rule-weekday-start" className={inputCls} /></div>
                  <div><label className="text-xs font-bold text-slate-600">OT Mulai (Sabtu)</label><input type="time" value={rules.saturday_start} onChange={(e) => setRule("saturday_start", e.target.value)} data-testid="rule-saturday-start" className={inputCls} /></div>
                  <div><label className="text-xs font-bold text-slate-600">Potong Istirahat (jam)</label><input type="number" min="0" step="0.5" value={rules.holiday_break_hours} onChange={(e) => setRule("holiday_break_hours", e.target.value)} data-testid="rule-break" className={inputCls} /></div>
                  <div className="col-span-3"><p className="text-[11px] text-slate-400">Minggu/libur: kerja {rules.holiday_work_start}–{rules.holiday_work_end}, dikurangi istirahat {rules.holiday_break_hours} jam → jam lembur bersih.</p></div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Pengali · Hari Kerja &amp; Sabtu</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-slate-600">Jam ke-1</label><input type="number" step="0.1" value={rules.wd_first_mult} onChange={(e) => setRule("wd_first_mult", e.target.value)} data-testid="rule-wd-first" className={inputCls} /></div>
                  <div><label className="text-xs font-bold text-slate-600">Jam ke-2 dst</label><input type="number" step="0.1" value={rules.wd_rest_mult} onChange={(e) => setRule("wd_rest_mult", e.target.value)} data-testid="rule-wd-rest" className={inputCls} /></div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Pengali · Minggu / Libur Nasional</div>
                <div className="grid grid-cols-4 gap-3">
                  <div><label className="text-xs font-bold text-slate-600">Jam normal (N)</label><input type="number" step="1" value={rules.hol_normal_hours} onChange={(e) => setRule("hol_normal_hours", e.target.value)} data-testid="rule-hol-n" className={inputCls} /></div>
                  <div><label className="text-xs font-bold text-slate-600">Pengali 1..N</label><input type="number" step="0.1" value={rules.hol_normal_mult} onChange={(e) => setRule("hol_normal_mult", e.target.value)} data-testid="rule-hol-normal" className={inputCls} /></div>
                  <div><label className="text-xs font-bold text-slate-600">Jam ke-(N+1)</label><input type="number" step="0.1" value={rules.hol_8th_mult} onChange={(e) => setRule("hol_8th_mult", e.target.value)} data-testid="rule-hol-8th" className={inputCls} /></div>
                  <div><label className="text-xs font-bold text-slate-600">Jam berikutnya</label><input type="number" step="0.1" value={rules.hol_extra_mult} onChange={(e) => setRule("hol_extra_mult", e.target.value)} data-testid="rule-hol-extra" className={inputCls} /></div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Contoh (N=7): jam 1–7 = {rules.hol_normal_mult}x, jam ke-8 = {rules.hol_8th_mult}x, jam 9 dst = {rules.hol_extra_mult}x.</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">Pembulatan jam (dari jam mulai–selesai)</label>
                <select value={rules.rounding} onChange={(e) => setRule("rounding", e.target.value)} data-testid="rule-rounding" className={inputCls}>
                  <option value="floor">Bulat ke bawah (jam penuh)</option>
                  <option value="half">Kelipatan 0.5 jam</option>
                  <option value="round">Bulat ke jam terdekat</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setRulesOpen(false)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Batal</button>
              <button onClick={saveRules} disabled={savingRules} data-testid="ot-rules-save" className="inline-flex items-center gap-1.5 h-9 px-5 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 disabled:opacity-60"><FloppyDisk size={16} weight="bold" /> {savingRules ? "Menyimpan…" : "Simpan Master"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
