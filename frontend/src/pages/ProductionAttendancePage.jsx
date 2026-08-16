import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { UsersThree, Plus, Trash, FloppyDisk, CalendarBlank, UserPlus, X, PencilSimple } from "@phosphor-icons/react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const inputCls = "h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500";
const tCls = "h-7 px-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400";

const STATUS_LABELS = { hadir: "Hadir", terlambat: "Terlambat", ijin_keluar: "Ijin Keluar", ijin_pulang: "Ijin Pulang", night_shift: "Night Shift", mc_sakit: "MC / Sakit", tidak_hadir: "Tidak Hadir (Mangkir)", insitu: "In-situ Work" };
const STATUS_ABBR = { hadir: "H", terlambat: "T", ijin_keluar: "IK", ijin_pulang: "IP", night_shift: "N", mc_sakit: "S", tidak_hadir: "A", insitu: "IS" };
const STATUS_CELL = { hadir: "bg-emerald-100 text-emerald-700", terlambat: "bg-amber-100 text-amber-700", ijin_keluar: "bg-blue-100 text-blue-700", ijin_pulang: "bg-sky-100 text-sky-700", night_shift: "bg-indigo-100 text-indigo-700", mc_sakit: "bg-rose-100 text-rose-700", tidak_hadir: "bg-rose-200 text-rose-800", insitu: "bg-violet-100 text-violet-700" };
const STATUS_TEXT = { hadir: "text-emerald-700", terlambat: "text-amber-600", ijin_keluar: "text-blue-600", ijin_pulang: "text-sky-600", night_shift: "text-indigo-600", mc_sakit: "text-rose-600", tidak_hadir: "text-rose-700", insitu: "text-violet-600" };
const DOW_ABBR = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const dowOf = (iso) => { try { return new Date(iso + "T00:00:00").getDay(); } catch { return -1; } };

export default function ProductionAttendancePage() {
  const [month, setMonth] = useState(thisMonth());
  const [grid, setGrid] = useState({ days: [], employees: [], records: {} });
  const [statuses, setStatuses] = useState(Object.keys(STATUS_LABELS));
  const [loading, setLoading] = useState(true);

  const [showMaster, setShowMaster] = useState(false);
  const [emps, setEmps] = useState([]);
  const [newName, setNewName] = useState("");
  const [newDesg, setNewDesg] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(todayStr());
  const [rows, setRows] = useState([]);
  const [savingAtt, setSavingAtt] = useState(false);
  const [holidays, setHolidays] = useState({}); // { 'YYYY-MM-DD': 'Nama libur' }

  const loadHolidays = useCallback(async () => {
    try {
      const yr = (month || "").slice(0, 4) || String(new Date().getFullYear());
      const { data } = await api.get("/production/holidays", { params: { year: yr } });
      const map = {};
      (data.items || []).forEach((h) => { if (h.date) map[h.date.slice(0, 10)] = h.name || "Libur Nasional"; });
      setHolidays(map);
    } catch { /* ignore */ }
  }, [month]);
  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/production/attendance/month", { params: { month } });
      setGrid({ days: data.days || [], employees: data.employees || [], records: data.records || {} });
      if (data.statuses) setStatuses(data.statuses);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [month]);

  const loadEmps = useCallback(async () => { try { const { data } = await api.get("/production/employees"); setEmps(data.items || []); } catch { /* */ } }, []);
  useEffect(() => { loadGrid(); }, [loadGrid]);
  useEffect(() => { loadEmps(); }, [loadEmps]);

  const openInput = async () => {
    setModalDate(todayStr()); setModalOpen(true);
    try { const { data } = await api.get("/production/attendance", { params: { date: todayStr() } }); setRows(data.items || []); } catch { setRows([]); }
  };
  const reloadModal = async (d) => { try { const { data } = await api.get("/production/attendance", { params: { date: d } }); setRows(data.items || []); } catch { setRows([]); } };
  const setField = (id, f, v) => setRows((prev) => prev.map((r) => (r.employee_id === id ? { ...r, [f]: v } : r)));
  const markAllPresent = () => setRows((prev) => prev.map((r) => ({ ...r, status: "hadir" })));

  // Deep-link dari Panel "Hari Ini": /produksi/attendance?input=today → langsung buka Input Presensi
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("input") === "today") {
      openInput();
      searchParams.delete("input");
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line

  const saveAtt = async () => {
    setSavingAtt(true);
    try { await api.post("/production/attendance", { date: modalDate, entries: rows }); toast.success("Presensi tersimpan"); setModalOpen(false); loadGrid(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSavingAtt(false); }
  };

  const addEmp = async () => {
    if (!newName.trim()) { toast.error("Isi nama dulu"); return; }
    try { await api.post("/production/employees", { name: newName.trim(), designation: newDesg.trim() }); toast.success("Karyawan ditambahkan"); setNewName(""); setNewDesg(""); loadEmps(); loadGrid(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal menambah"); }
  };
  const saveEmp = async (e) => {
    try { await api.put(`/production/employees/${e.id}`, { name: e.name, designation: e.designation }); toast.success("Tersimpan"); loadEmps(); loadGrid(); }
    catch (er) { toast.error(er.response?.data?.detail || "Gagal"); }
  };
  const delEmp = async (id) => {
    if (!window.confirm("Hapus karyawan ini?")) return;
    try { await api.delete(`/production/employees/${id}`); toast.success("Dihapus"); loadEmps(); loadGrid(); }
    catch (er) { toast.error(er.response?.data?.detail || "Gagal"); }
  };
  const setEmpField = (id, f, v) => setEmps((prev) => prev.map((x) => (x.id === id ? { ...x, [f]: v } : x)));

  const TimeField = ({ label, v, on, tid }) => (
    <div className="flex flex-col"><span className="text-[9px] font-bold text-slate-500 uppercase">{label}</span>
      <input type="time" value={v || ""} onChange={(e) => on(e.target.value)} data-testid={tid} className={tCls} /></div>
  );
  const CondFields = ({ r }) => {
    const s = r.status;
    if (s === "terlambat") return <TimeField label="Jam Masuk" v={r.actual_in_time} on={(v) => setField(r.employee_id, "actual_in_time", v)} tid={`att-actualin-${r.employee_id}`} />;
    if (s === "ijin_keluar") return (<div className="flex flex-wrap gap-2"><TimeField label="Jam Keluar" v={r.out_time} on={(v) => setField(r.employee_id, "out_time", v)} tid={`att-out-${r.employee_id}`} /><TimeField label="Plan Masuk" v={r.plan_in_time} on={(v) => setField(r.employee_id, "plan_in_time", v)} tid={`att-planin-${r.employee_id}`} /><TimeField label="Aktual Masuk" v={r.actual_in_time} on={(v) => setField(r.employee_id, "actual_in_time", v)} tid={`att-actualin-${r.employee_id}`} /></div>);
    if (s === "ijin_pulang") return <TimeField label="Jam Pulang" v={r.home_time} on={(v) => setField(r.employee_id, "home_time", v)} tid={`att-home-${r.employee_id}`} />;
    if (s === "insitu") return (<div className="flex flex-wrap gap-2 items-end"><div className="flex flex-col"><span className="text-[9px] font-bold text-slate-500 uppercase">Lokasi</span><input value={r.insitu_location} onChange={(e) => setField(r.employee_id, "insitu_location", e.target.value)} data-testid={`att-loc-${r.employee_id}`} placeholder="Lokasi…" className={`${tCls} w-28`} /></div><TimeField label="Start" v={r.insitu_start} on={(v) => setField(r.employee_id, "insitu_start", v)} tid={`att-instart-${r.employee_id}`} /><TimeField label="Est. Selesai" v={r.insitu_est_finish} on={(v) => setField(r.employee_id, "insitu_est_finish", v)} tid={`att-inest-${r.employee_id}`} /><TimeField label="Aktual Pulang" v={r.insitu_actual_finish} on={(v) => setField(r.employee_id, "insitu_actual_finish", v)} tid={`att-inact-${r.employee_id}`} /></div>);
    return <span className="text-[11px] text-slate-300">—</span>;
  };

  return (
    <div className="p-4 max-w-[1700px] mx-auto space-y-4" data-testid="attendance-page">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-700 mb-1"><UsersThree size={14} weight="fill" /> Produksi · Absensi Kehadiran</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Absensi Kehadiran Produksi</h1>
          <p className="text-xs text-slate-500 mt-1">Rekap kehadiran 1 bulan. Klik <b>Input Presensi</b> untuk isi status per tanggal. Operator Tidak Hadir/MC otomatis diblok di Daily Production.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-slate-500" /><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="att-month-input" className="text-sm outline-none bg-transparent" /></div>
          <button onClick={() => setShowMaster((s) => !s)} data-testid="toggle-master-btn" className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-300 bg-white text-sm font-bold text-slate-700 rounded hover:bg-slate-50"><UserPlus size={16} weight="bold" /> Daftar Karyawan</button>
          <button onClick={openInput} data-testid="input-presensi-btn" className="inline-flex items-center gap-1.5 h-9 px-4 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700"><Plus size={16} weight="bold" /> Input Presensi</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        {statuses.map((s) => <span key={s} className={`px-2 py-0.5 rounded font-bold ${STATUS_CELL[s]}`}>{STATUS_ABBR[s]} = {STATUS_LABELS[s]}</span>)}
        <span className="px-2 py-0.5 rounded font-bold bg-rose-50 text-rose-600 border-l-2 border-l-rose-500" data-testid="legend-holiday">Garis merah = Minggu / Libur Nasional (L)</span>
      </div>

      {showMaster && (
        <div className="bg-white border border-slate-200 rounded-lg p-3" data-testid="master-panel">
          <div className="flex items-end gap-2 mb-3 flex-wrap">
            <div className="flex flex-col"><label className="text-[11px] font-bold text-slate-600">Nama Karyawan</label><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama" data-testid="emp-name-input" className={inputCls} /></div>
            <div className="flex flex-col"><label className="text-[11px] font-bold text-slate-600">Bagian</label><input value={newDesg} onChange={(e) => setNewDesg(e.target.value)} placeholder="mis. WELDER" data-testid="emp-desg-input" className={inputCls} /></div>
            <button onClick={addEmp} data-testid="emp-add-btn" className="inline-flex items-center gap-1.5 h-9 px-3 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700"><Plus size={15} weight="bold" /> Tambah</button>
          </div>
          <div className="max-h-64 overflow-y-auto border border-slate-100 rounded">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-[10px] uppercase text-slate-500"><th className="px-2 py-1 text-left">Nama</th><th className="px-2 py-1 text-left">Bagian</th><th className="px-2 py-1 w-24 text-center">Aksi</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {emps.map((e) => (
                  <tr key={e.id} data-testid={`emp-row-${e.id}`}>
                    <td className="px-2 py-1"><input value={e.name} onChange={(ev) => setEmpField(e.id, "name", ev.target.value)} data-testid={`emp-edit-name-${e.id}`} className="w-full h-7 px-1 text-sm border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded outline-none" /></td>
                    <td className="px-2 py-1"><input value={e.designation || ""} onChange={(ev) => setEmpField(e.id, "designation", ev.target.value)} data-testid={`emp-edit-desg-${e.id}`} className="w-full h-7 px-1 text-sm border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded outline-none" /></td>
                    <td className="px-2 py-1"><div className="flex items-center justify-center gap-1">
                      <button onClick={() => saveEmp(e)} data-testid={`emp-save-${e.id}`} className="p-1 rounded text-slate-400 hover:bg-indigo-100 hover:text-indigo-600" title="Simpan"><FloppyDisk size={14} weight="bold" /></button>
                      <button onClick={() => delEmp(e.id)} data-testid={`emp-del-${e.id}`} className="p-1 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Hapus"><Trash size={14} weight="bold" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly grid */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[72vh]">
          <table className="text-xs border-separate border-spacing-0" data-testid="attendance-month-table">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-2 py-2 text-left font-bold border border-slate-200 sticky left-0 top-0 bg-slate-100 z-30 min-w-[160px] w-[160px]">Nama</th>
                <th className="px-2 py-2 text-left font-bold border border-slate-200 sticky left-[160px] top-0 bg-slate-100 z-30 min-w-[90px] w-[90px]">Bagian</th>
                {grid.days.map((d) => { const dw = dowOf(d); const sun = dw === 0; const hol = !!holidays[d]; const red = sun || hol; return (
                  <th key={d} data-testid={`att-day-head-${d.slice(8)}`} title={hol ? holidays[d] : (sun ? "Minggu" : "")} className={`px-1 py-1 text-center font-bold border border-slate-200 w-8 sticky top-0 z-20 ${red ? "bg-rose-100 border-l-2 border-l-rose-500 text-rose-600" : "bg-slate-100"}`}>
                    <div className={`text-[8px] font-bold leading-none ${red ? "text-rose-500" : "text-slate-400"}`}>{DOW_ABBR[dw] || ""}</div>
                    <div className="leading-tight">{Number(d.slice(8))}</div>
                    {hol && <div className="text-[7px] font-bold text-rose-500 leading-none">L</div>}
                  </th>
                ); })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={grid.days.length + 2} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : grid.employees.length === 0 ? (
                <tr><td colSpan={grid.days.length + 2} className="px-3 py-10 text-center text-slate-400" data-testid="att-empty">Belum ada karyawan. Klik <b className="text-indigo-600">Daftar Karyawan</b>.</td></tr>
              ) : (
                grid.employees.map((e) => (
                  <tr key={e.id} data-testid={`att-emp-${e.id}`} className="group">
                    <td className="px-2 py-1 font-semibold text-slate-800 border border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 z-10 min-w-[160px] w-[160px]">{e.name}</td>
                    <td className="px-2 py-1 text-[10px] text-slate-500 border border-slate-200 sticky left-[160px] bg-white group-hover:bg-slate-50 z-10 min-w-[90px] w-[90px]">{e.designation || "—"}</td>
                    {grid.days.map((d) => {
                      const st = (grid.records[e.id] || {})[d];
                      const sun = dowOf(d) === 0;
                      const hol = !!holidays[d];
                      const red = sun || hol;
                      return <td key={d} className={`text-center border border-slate-200 font-bold ${red ? "border-l-2 border-l-rose-500" : ""} ${st ? STATUS_CELL[st] : (red ? "bg-rose-50/50 text-rose-300" : "text-slate-200")}`} title={st ? STATUS_LABELS[st] : (hol ? holidays[d] : (sun ? "Minggu" : ""))}>{st ? STATUS_ABBR[st] : "·"}</td>;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Input Presensi popup */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-8 bg-slate-900/50 backdrop-blur-sm" data-testid="att-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><UsersThree size={18} weight="bold" className="text-indigo-600" /> Input Presensi</h2>
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded px-2 h-9"><CalendarBlank size={16} weight="bold" className="text-indigo-600" /><input type="date" value={modalDate} onChange={(e) => { setModalDate(e.target.value); reloadModal(e.target.value); }} data-testid="att-modal-date" className="text-sm outline-none bg-transparent font-semibold" /></div>
              </div>
              <button onClick={() => setModalOpen(false)} data-testid="att-modal-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} weight="bold" /></button>
            </div>
            <div className="px-5 py-3 overflow-y-auto">
              <p className="text-[11px] text-slate-400 mb-2">Default semua <b>Hadir</b> — ubah yang tidak hadir.</p>
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-100 text-[10px] uppercase text-slate-500"><th className="px-2 py-1 text-left">Nama</th><th className="px-2 py-1 text-left w-44">Status</th><th className="px-2 py-1 text-left">Detail</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={r.employee_id} data-testid={`att-row-${i}`}>
                      <td className="px-2 py-1 font-semibold text-slate-800">{r.name}<div className="text-[9px] text-slate-400">{r.designation}</div></td>
                      <td className="px-2 py-1"><select value={r.status} onChange={(e) => setField(r.employee_id, "status", e.target.value)} data-testid={`att-status-${r.employee_id}`} className={`${inputCls} w-full font-bold ${STATUS_TEXT[r.status] || ""}`}>{statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></td>
                      <td className="px-2 py-1"><CondFields r={r} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={3} className="px-2 py-6 text-center text-slate-400">Tidak ada karyawan.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 shrink-0 bg-slate-50">
              <button onClick={markAllPresent} data-testid="att-mark-all-present" className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-bold text-emerald-700 border border-emerald-300 bg-emerald-50 rounded hover:bg-emerald-100">
                <FloppyDisk size={15} weight="bold" /> Tandai Semua Hadir
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-bold text-slate-600 border border-slate-300 bg-white rounded hover:bg-slate-100">Batal</button>
                <button onClick={saveAtt} disabled={savingAtt} data-testid="att-save-btn" className="inline-flex items-center gap-1.5 h-9 px-5 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700 disabled:opacity-60"><FloppyDisk size={16} weight="bold" /> {savingAtt ? "Menyimpan…" : "Simpan Presensi"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
