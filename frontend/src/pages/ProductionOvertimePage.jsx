import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api, { downloadXlsx } from "../lib/api";
import { Clock, Plus, Trash, X, FloppyDisk, CalendarBlank, Gear, DownloadSimple, Printer } from "@phosphor-icons/react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const inputCls = "w-full h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500";
const cellCls = "w-full h-8 px-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-amber-400";
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const fmtLongDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return d; } };
const newRow = () => ({ name: "", so_no: "", customer: "", ot_start: "16:00", ot_end: "18:00" });

const DAY_BADGE = {
  weekday: "bg-sky-50 border-sky-200 text-sky-700",
  saturday: "bg-violet-50 border-violet-200 text-violet-700",
  holiday: "bg-rose-50 border-rose-200 text-rose-700",
};

export default function ProductionOvertimePage() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState({ items: [], summary: [], total_hours: 0, total_weighted: 0, rules: null });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("grid");   // grid | summary
  const [grid, setGrid] = useState({ days: [], items: [], grand_total_hours: 0, grand_total_days: 0 });
  const [sos, setSos] = useState([]);
  const [emps, setEmps] = useState([]);

  // multi-row request form (satu tanggal, banyak baris) — OVER TIME REQUEST FORM
  const [modalOpen, setModalOpen] = useState(false);
  const [formDate, setFormDate] = useState(todayStr());
  const [formRows, setFormRows] = useState([newRow()]);
  const [saving, setSaving] = useState(false);

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
  useEffect(() => {
    api.get("/production/overtime/grid", { params: { month } })
      .then(({ data }) => setGrid(data))
      .catch(() => setGrid({ days: [], items: [], grand_total_hours: 0, grand_total_days: 0 }));
  }, [month, data.items]);
  useEffect(() => { (async () => { try { const r = await api.get("/production/so-brief"); setSos(r.data.items || []); } catch {} try { const e = await api.get("/production/employees"); setEmps(e.data.items || []); } catch {} })(); }, []);

  const soMap = useMemo(() => { const m = {}; sos.forEach((s) => { m[s.so_no] = s; }); return m; }, [sos]);

  const openForm = () => { setFormDate(todayStr()); setFormRows([newRow(), newRow(), newRow()]); setModalOpen(true); };
  const setRow = (i, k, v) => setFormRows((rs) => rs.map((r, ix) => {
    if (ix !== i) return r;
    const n = { ...r, [k]: v };
    if (k === "so_no" && soMap[v]) n.customer = soMap[v].customer || "";
    return n;
  }));
  const addRow = () => setFormRows((rs) => [...rs, newRow()]);
  const removeRow = (i) => setFormRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, ix) => ix !== i)));

  const saveForm = async () => {
    const entries = formRows.filter((r) => (r.name || "").trim());
    if (entries.length === 0) { toast.error("Isi minimal 1 baris (nama)"); return; }
    setSaving(true);
    try {
      const { data: res } = await api.post("/production/overtime/bulk", { ot_date: formDate, entries });
      toast.success(`${res.count} baris OT tersimpan`);
      setModalOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const remove = async (r) => { if (!window.confirm(`Hapus OT ${r.ot_no}?`)) return; try { await api.delete(`/production/overtime/${r.id}`); load(); } catch { toast.error("Gagal"); } };

  const exportXlsx = async () => {
    try { await downloadXlsx("/production/overtime/export.xlsx", { month }, `rekap_lembur_${month}.xlsx`); toast.success("Rekap lembur diexport"); }
    catch (e) { toast.error(e.message || "Gagal export"); }
  };
  const exportGridXlsx = async () => {
    try { await downloadXlsx("/production/overtime/grid/export.xlsx", { month }, `rekap_grid_lembur_${month}.xlsx`); toast.success("Rekap grid diexport"); }
    catch (e) { toast.error(e.message || "Gagal export"); }
  };

  // ===== Cetak OVER TIME REQUEST FORM (per tanggal) =====
  const [printOpen, setPrintOpen] = useState(false);
  const [printDate, setPrintDate] = useState(todayStr());
  const printRows = useMemo(() => (data.items || []).filter((r) => r.ot_date === printDate), [data.items, printDate]);
  const doPrint = () => {
    const rowsHtml = printRows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#888">Tidak ada data OT pada tanggal ini</td></tr>`
      : printRows.map((r, i) => `<tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${r.name || ""}</td>
          <td style="text-align:center">${r.so_no || ""}</td>
          <td>${r.customer || ""}</td>
          <td style="text-align:center">${r.ot_start || ""}</td>
          <td style="text-align:center">${r.ot_end || ""}</td>
        </tr>`).join("");
    // padding rows biar form penuh
    const pad = Math.max(0, 12 - printRows.length);
    const padHtml = Array.from({ length: pad }).map((_, i) => `<tr>
      <td style="text-align:center">${printRows.length + i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>OT Request ${printDate}</title>
      <style>
        * { font-family: Arial, Helvetica, sans-serif; }
        body { margin: 24px; color: #111; }
        .company { text-align:center; font-weight:bold; font-size:16px; border:1px solid #111; padding:6px; }
        .title { text-align:center; font-weight:bold; font-size:18px; margin:10px 0 4px; letter-spacing:1px; }
        .date { font-size:13px; margin:6px 0 10px; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; }
        th, td { border: 1px solid #333; padding: 5px 6px; }
        th { background:#f0f0f0; text-align:center; }
        .sign { display:flex; justify-content: space-around; margin-top: 42px; text-align:center; font-size:12px; }
        .sign .box { width: 40%; }
        .sign .line { margin-top: 60px; border-top: 1px solid #111; padding-top: 4px; font-weight:bold; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <div class="company">PT. MITRA KARYA SARANA</div>
      <div class="title">OVER TIME REQUEST FORM</div>
      <div class="date"><b>Date :</b> ${fmtLongDate(printDate)}</div>
      <table>
        <thead>
          <tr><th rowspan="2" style="width:38px">No</th><th rowspan="2">Name</th><th rowspan="2" style="width:80px">SO No.</th><th rowspan="2" style="width:120px">Customer</th><th colspan="2">Time</th></tr>
          <tr><th style="width:70px">From</th><th style="width:70px">To</th></tr>
        </thead>
        <tbody>${rowsHtml}${padHtml}</tbody>
      </table>
      <div class="sign">
        <div class="box"><div>Prepared By,</div><div class="line">Leader / SPV</div></div>
        <div class="box"><div>Approved By,</div><div class="line">Dept. Head</div></div>
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup diblokir browser. Izinkan popup untuk mencetak."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

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
          <p className="text-xs text-slate-500 mt-1">Isi form OT per tanggal (banyak baris), sistem hitung otomatis pengali 1.5x / 2x / 3x / 4x. Bisa dicetak &amp; ditandatangani.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-slate-500" /><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="ot-month" className="text-sm outline-none bg-transparent" /></div>
          <div className="inline-flex border border-slate-300 rounded overflow-hidden">
            <button onClick={() => setView("grid")} data-testid="ot-view-grid" className={`px-3 h-9 text-xs font-bold ${view === "grid" ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Rekap Grid</button>
            <button onClick={() => setView("summary")} data-testid="ot-view-summary" className={`px-3 h-9 text-xs font-bold border-l border-slate-300 ${view === "summary" ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Per Karyawan</button>
          </div>
          <button onClick={openRules} data-testid="ot-master-btn" className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded hover:bg-slate-100"><Gear size={16} weight="bold" /> Master Lembur</button>
          <button onClick={() => { setPrintDate(todayStr()); setPrintOpen(true); }} data-testid="ot-print-btn" className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded hover:bg-slate-100"><Printer size={16} weight="bold" /> Cetak Form</button>
          <button onClick={view === "grid" ? exportGridXlsx : exportXlsx} data-testid="ot-export-btn" className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded hover:bg-slate-100"><DownloadSimple size={16} weight="bold" /> Export Excel</button>
          <button onClick={openForm} data-testid="add-ot-btn" className="inline-flex items-center gap-1.5 h-9 px-4 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700"><Plus size={16} weight="bold" /> Overtime Request</button>
        </div>
      </div>

      {/* Rekap per karyawan */}
      {view === "summary" && (
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
      )}

      {/* Rekap grid bulanan (mirip absensi) */}
      {view === "grid" && (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="ot-grid">
        <div className="px-3 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
          Rekap Lembur Harian · {month} <span className="text-amber-700">(Total bulan ini: {grid.grand_total_hours} jam · {grid.grand_total_days} kali lembur)</span>
        </div>
        <div className="overflow-auto max-h-[65vh]">
          <table className="text-xs border-separate border-spacing-0" data-testid="ot-grid-table">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-2 py-2 text-left font-bold border border-slate-200 sticky left-0 top-0 bg-slate-100 z-30 min-w-[160px]">Nama</th>
                {grid.days.map((d) => { const sun = new Date(d + "T00:00:00").getDay() === 0; return (
                  <th key={d} className={`px-1 py-1 text-center font-bold border border-slate-200 w-8 sticky top-0 z-20 ${sun ? "bg-rose-100 text-rose-600 border-l-2 border-l-rose-500" : "bg-slate-100"}`}>{Number(d.slice(8))}</th>
                ); })}
                <th className="px-2 py-2 text-center font-bold border border-slate-200 sticky right-0 top-0 bg-amber-100 text-amber-700 z-30 min-w-[70px]">Total Jam</th>
                <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-amber-50 text-amber-700 min-w-[60px] sticky top-0 z-20">Kali</th>
              </tr>
            </thead>
            <tbody>
              {grid.items.length === 0 ? (
                <tr><td colSpan={grid.days.length + 3} className="px-3 py-10 text-center text-slate-400" data-testid="ot-grid-empty">Belum ada lembur bulan ini.</td></tr>
              ) : grid.items.map((r) => (
                <tr key={r.name} className="group" data-testid={`ot-grid-row-${r.name}`}>
                  <td className="px-2 py-1 font-semibold text-slate-800 border border-slate-200 sticky left-0 bg-white group-hover:bg-amber-50/40 z-10 min-w-[160px]">{r.name}</td>
                  {grid.days.map((d) => { const v = r.per_date[d]; return (
                    <td key={d} className={`text-center border border-slate-200 ${v ? "font-bold text-amber-700 bg-amber-50/60" : "text-slate-200"}`}>{v || "·"}</td>
                  ); })}
                  <td className="px-2 py-1 text-center font-bold text-amber-700 border border-slate-200 sticky right-0 bg-amber-50 group-hover:bg-amber-100 z-10">{r.total_hours}</td>
                  <td className="px-2 py-1 text-center font-semibold text-slate-600 border border-slate-200">{r.total_days}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

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

      {/* ===== Overtime Request FORM (date-first, multi-row) ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-8 bg-slate-900/50 backdrop-blur-sm" data-testid="ot-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Clock size={18} weight="bold" className="text-amber-600" /> Over Time Request Form</h2>
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-amber-600" /><input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} data-testid="ot-form-date" className="text-sm outline-none bg-transparent font-semibold" /></div>
                <span className="text-xs text-slate-500">{fmtLongDate(formDate)}</span>
              </div>
              <button onClick={() => setModalOpen(false)} data-testid="ot-modal-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X size={18} weight="bold" /></button>
            </div>
            <div className="px-5 py-3 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-100 text-[10px] uppercase text-slate-500">
                  <th className="px-2 py-1 w-8 text-center">No</th>
                  <th className="px-2 py-1 text-left min-w-[200px]">Name</th>
                  <th className="px-2 py-1 text-left w-32">SO No.</th>
                  <th className="px-2 py-1 text-left w-40">Customer</th>
                  <th className="px-2 py-1 text-center w-24">From</th>
                  <th className="px-2 py-1 text-center w-24">To</th>
                  <th className="px-2 py-1 w-10"></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {formRows.map((r, i) => (
                    <tr key={i} data-testid={`ot-form-row-${i}`}>
                      <td className="px-2 py-1 text-center text-slate-400 font-bold">{i + 1}</td>
                      <td className="px-2 py-1"><input list="ot-dl-emps" value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} data-testid={`ot-row-name-${i}`} placeholder="Nama karyawan" className={cellCls} /></td>
                      <td className="px-2 py-1"><input list="ot-dl-sos" value={r.so_no} onChange={(e) => setRow(i, "so_no", e.target.value)} data-testid={`ot-row-so-${i}`} placeholder="SO / PIC" className={cellCls} /></td>
                      <td className="px-2 py-1"><input value={r.customer} onChange={(e) => setRow(i, "customer", e.target.value)} data-testid={`ot-row-cust-${i}`} placeholder="auto" className={cellCls} /></td>
                      <td className="px-2 py-1"><input type="time" value={r.ot_start} onChange={(e) => setRow(i, "ot_start", e.target.value)} data-testid={`ot-row-from-${i}`} className={cellCls} /></td>
                      <td className="px-2 py-1"><input type="time" value={r.ot_end} onChange={(e) => setRow(i, "ot_end", e.target.value)} data-testid={`ot-row-to-${i}`} className={cellCls} /></td>
                      <td className="px-2 py-1 text-center"><button onClick={() => removeRow(i)} data-testid={`ot-row-del-${i}`} className="p-1 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash size={14} weight="bold" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addRow} data-testid="ot-add-row" className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-bold text-amber-700 border border-amber-300 bg-amber-50 rounded hover:bg-amber-100"><Plus size={14} weight="bold" /> Tambah Baris</button>
              <p className="text-[11px] text-slate-400 mt-2">Untuk Minggu/libur, jam istirahat otomatis dikurangi (mis. 08:00–16:00 = 7 jam). Pengali dihitung otomatis di rekap.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
              <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Batal</button>
              <button onClick={saveForm} disabled={saving} data-testid="ot-save-btn" className="inline-flex items-center gap-1.5 h-9 px-5 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 disabled:opacity-60"><FloppyDisk size={16} weight="bold" /> {saving ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Cetak Form popup ===== */}
      {printOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="ot-print-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200"><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Printer size={18} weight="bold" className="text-amber-600" /> Cetak Over Time Request Form</h2><button onClick={() => setPrintOpen(false)} data-testid="ot-print-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X size={18} weight="bold" /></button></div>
            <div className="px-5 py-4 space-y-3">
              <div><label className="text-xs font-bold text-slate-600">Pilih Tanggal Form</label><input type="date" value={printDate} onChange={(e) => setPrintDate(e.target.value)} data-testid="ot-print-date" className={inputCls} /></div>
              <div className="text-xs text-slate-500">{fmtLongDate(printDate)} — <b className="text-amber-700" data-testid="ot-print-count">{printRows.length} baris</b> OT ditemukan di bulan {month}.</div>
              {printRows.length === 0 && <div className="text-[11px] text-rose-500">Tidak ada data OT pada tanggal ini (pastikan bulan yang dipilih di atas benar).</div>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setPrintOpen(false)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Tutup</button>
              <button onClick={doPrint} data-testid="ot-print-do" className="inline-flex items-center gap-1.5 h-9 px-5 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700"><Printer size={16} weight="bold" /> Cetak</button>
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
