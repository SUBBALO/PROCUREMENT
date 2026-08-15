import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import ProductionMasterlistPage from "./ProductionMasterlistPage";
import {
  Factory, Trash, CalendarBlank, Plus, X, FloppyDisk,
} from "@phosphor-icons/react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const NCOLS = 10;
// Kolom yang bisa diedit (kolom 2 = Customer read-only, dilewati saat navigasi)
const EDIT_COLS = [0, 1, 3, 4, 5, 6, 7, 8, 9];
const nextEditable = (col) => {
  const idx = EDIT_COLS.indexOf(col);
  if (idx === -1 || idx >= EDIT_COLS.length - 1) return null;
  return EDIT_COLS[idx + 1];
};

const emptyRow = () => ({
  id: null, operator_name: "", so_no: "", customer: "", process: "",
  qty_ok: "", qty_ng: "", work_start: "", work_end: "", machine_no: "", remarks: "",
  _dirty: false, _saving: false,
});

const cellCls =
  "w-full h-8 px-1.5 text-sm bg-transparent outline-none focus:bg-amber-50 focus:ring-1 focus:ring-amber-400 rounded-sm";

/* ============================================================
 * Spreadsheet editor (dipakai di dalam popup input)
 * - Enter = pindah ke kolom kanan
 * - Kolom jam auto-lompat setelah terisi HH:MM
 * - Tiap baris tersimpan otomatis (operator wajib)
 * ============================================================ */
function SpreadsheetEditor({ date, opts, soMap, onSaved }) {
  const [rows, setRows] = useState([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const rowsRef = useRef(rows);
  const inputRefs = useRef({});
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/production/reports", { params: { date } });
      const server = (data.items || []).map((r) => ({
        id: r.id, operator_name: r.operator_name || "", so_no: r.so_no || "", customer: r.customer || "",
        process: r.process || "", qty_ok: r.qty_ok ?? "", qty_ng: r.qty_ng ?? "",
        work_start: r.work_start || "", work_end: r.work_end || "",
        machine_no: r.machine_no || "", remarks: r.remarks || "", _dirty: false, _saving: false,
      }));
      setRows([...server, emptyRow()]);
    } catch (e) {
      setRows([emptyRow()]);
      toast.error(e.response?.data?.detail || "Gagal memuat report");
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const focusCell = (r, c) => {
    const el = inputRefs.current[`${r}-${c}`];
    if (el) { el.focus(); try { el.select && el.select(); } catch { /* time input */ } }
  };

  const updateCell = (idx, field, value) => {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const row = next[idx];
      row[field] = value; row._dirty = true;
      if (field === "so_no" && soMap[value] !== undefined) row.customer = soMap[value];
      return next;
    });
  };

  const buildPayload = (row) => ({
    report_date: date,
    operator_name: row.operator_name, so_no: row.so_no, customer: row.customer,
    process: row.process, qty_ok: Number(row.qty_ok) || 0, qty_ng: Number(row.qty_ng) || 0,
    work_start: row.work_start, work_end: row.work_end, machine_no: row.machine_no, remarks: row.remarks,
  });

  const saveRow = useCallback(async (idx) => {
    const row = rowsRef.current[idx];
    if (!row || !row._dirty) return;
    if (!(row.operator_name || "").trim()) return;
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, _saving: true } : r)));
    try {
      if (row.id) {
        await api.put(`/production/reports/${row.id}`, buildPayload(row));
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, _dirty: false, _saving: false } : r)));
      } else {
        const { data } = await api.post("/production/reports", buildPayload(row));
        setRows((prev) => {
          const next = prev.map((r, i) => (i === idx ? { ...r, id: data.id, _dirty: false, _saving: false } : r));
          if (!next.some((r) => !r.id)) next.push(emptyRow());
          return next;
        });
      }
      onSaved && onSaved();
    } catch (e) {
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, _saving: false } : r)));
      toast.error(e.response?.data?.detail || "Gagal menyimpan baris");
    }
  }, [date, onSaved]); // eslint-disable-line

  const onKeyDown = (e, idx, colIdx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nc = nextEditable(colIdx);
      if (nc != null) setTimeout(() => focusCell(idx, nc), 0);
      else { saveRow(idx); setTimeout(() => focusCell(idx + 1, 0), 80); }
    }
  };

  const removeRow = async (idx) => {
    const row = rowsRef.current[idx];
    if (row.id) {
      if (!window.confirm(`Hapus baris ${row.operator_name || ""} / ${row.so_no || ""}?`)) return;
      try { await api.delete(`/production/reports/${row.id}`); toast.success("Baris dihapus"); }
      catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); return; }
    }
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (!next.some((r) => !r.id)) next.push(emptyRow());
      return next;
    });
    onSaved && onSaved();
  };

  const setRef = (idx, colIdx) => (el) => { inputRefs.current[`${idx}-${colIdx}`] = el; };

  const cell = (i, col, field, extra = {}) => (
    <td className={`border border-slate-200 p-0 ${extra.tdCls || ""}`}>
      <input
        ref={setRef(i, col)}
        list={extra.list}
        type={extra.type || "text"}
        min={extra.type === "number" ? "0" : undefined}
        value={rows[i][field]}
        onChange={(e) => updateCell(i, field, e.target.value)}
        onBlur={() => saveRow(i)}
        onKeyDown={(e) => onKeyDown(e, i, col)}
        data-testid={`cell-${extra.tid || field}-${i}`}
        placeholder={extra.ph || ""}
        className={`${cellCls} ${extra.cls || ""}`}
      />
    </td>
  );

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm border-collapse" data-testid="report-table">
        <thead>
          <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
            <th className="px-2 py-2 text-left font-bold w-8 border border-slate-200">#</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[150px]">Operator</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[110px]">SO No</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[140px]">Customer</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[120px]">Process</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-emerald-50 text-emerald-700 w-20">Qty OK</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-rose-50 text-rose-700 w-20">Qty NG</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 w-24">Jam Mulai</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 w-24">Jam Selesai</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[110px]">Machine No</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[150px]">Remarks</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
          ) : (
            rows.map((r, i) => {
              const isDraft = !r.id;
              return (
                <tr key={r.id || `draft-${i}`} className={isDraft ? "bg-amber-50/30" : "hover:bg-slate-50"} data-testid={`report-row-${i}`}>
                  <td className="border border-slate-200 text-center text-slate-400 text-xs">{r._saving ? "…" : isDraft ? "＋" : i + 1}</td>
                  {cell(i, 0, "operator_name", { list: "dl-operators", tid: "operator", ph: isDraft ? "Nama operator…" : "" })}
                  {cell(i, 1, "so_no", { list: "dl-sos", tid: "so", ph: "SO" })}
                  <td className="border border-slate-200 p-0 bg-slate-50">
                    <input value={rows[i].customer} readOnly tabIndex={-1}
                      data-testid={`cell-customer-${i}`} placeholder="auto"
                      className="w-full h-8 px-1.5 text-sm bg-transparent outline-none text-slate-500 cursor-not-allowed" />
                  </td>
                  {cell(i, 3, "process", { list: "dl-processes", tid: "process" })}
                  {cell(i, 4, "qty_ok", { type: "number", tid: "qtyok", tdCls: "bg-emerald-50/30", cls: "text-center font-semibold text-emerald-700" })}
                  {cell(i, 5, "qty_ng", { type: "number", tid: "qtyng", tdCls: "bg-rose-50/30", cls: "text-center font-semibold text-rose-700" })}
                  {cell(i, 6, "work_start", { type: "time", tid: "start", cls: "text-center" })}
                  {cell(i, 7, "work_end", { type: "time", tid: "end", cls: "text-center" })}
                  {cell(i, 8, "machine_no", { list: "dl-machines", tid: "machine" })}
                  {cell(i, 9, "remarks", { list: "dl-remarks", tid: "remarks" })}
                  <td className="border border-slate-200 text-center">
                    {!isDraft && (
                      <button onClick={() => removeRow(i)} data-testid={`delete-row-${i}`}
                        className="p-1 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors" title="Hapus">
                        <Trash size={15} weight="bold" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
 * Main page
 * ============================================================ */
export default function ProductionDailyReportPage() {
  const [opts, setOpts] = useState({ operators: [], machines: [], processes: [], remarks: [], sos: [] });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(todayStr());
  const [refreshSignal, setRefreshSignal] = useState(0);

  const loadOpts = useCallback(async () => {
    try { const { data } = await api.get("/production/report-options"); setOpts(data || {}); }
    catch { /* silent */ }
  }, []);

  useEffect(() => { loadOpts(); }, [loadOpts]);

  const soMap = useMemo(() => {
    const m = {}; (opts.sos || []).forEach((s) => { m[s.so_no] = s.customer; }); return m;
  }, [opts.sos]);

  const openInput = () => { setModalDate(todayStr()); setModalOpen(true); };
  const closeInput = () => {
    setModalOpen(false);
    loadOpts();
    setRefreshSignal((n) => n + 1); // minta masterlist reload
  };
  const onEditorSaved = () => { loadOpts(); setRefreshSignal((n) => n + 1); };

  const fmtDateLong = (d) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
    catch { return d; }
  };

  return (
    <div className="p-4 max-w-[1500px] mx-auto space-y-4" data-testid="daily-production-report-page">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
          <Factory size={14} weight="fill" /> Produksi · Daily Production Report
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Laporan Produksi Harian
        </h1>
        <p className="text-xs text-slate-500 mt-1">Klik <b>Input Report</b> → pilih tanggal → isi tabel (auto-simpan). Hasil langsung masuk masterlist di bawah.</p>
      </div>

      {/* Tombol Input */}
      <div className="flex items-center justify-end">
        <button onClick={openInput} data-testid="open-input-btn"
          className="inline-flex items-center gap-1.5 h-9 px-4 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 transition-colors">
          <Plus size={16} weight="bold" /> Input Report
        </button>
      </div>

      {/* Masterlist (filter + export) sebagai satu-satunya list */}
      <ProductionMasterlistPage embedded refreshSignal={refreshSignal} />

      {/* Datalists (dipakai oleh editor di popup) */}
      <datalist id="dl-operators">{(opts.operators || []).map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dl-machines">{(opts.machines || []).map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dl-processes">{(opts.processes || []).map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dl-remarks">{(opts.remarks || []).map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dl-sos">{(opts.sos || []).map((s) => <option key={s.so_no} value={s.so_no}>{s.customer}</option>)}</datalist>

      {/* Popup Input */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-10 bg-slate-900/50 backdrop-blur-sm" data-testid="input-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1200px] max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Factory size={18} weight="bold" className="text-amber-600" /> Input Laporan Produksi
                </h2>
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 h-9">
                  <CalendarBlank size={16} weight="bold" className="text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">Tanggal</span>
                  <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} data-testid="modal-date-input" className="text-sm outline-none bg-transparent font-semibold" />
                </div>
                <span className="text-xs text-slate-500">{fmtDateLong(modalDate)}</span>
              </div>
              <button onClick={closeInput} data-testid="modal-close-btn" className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-auto">
              <p className="text-[11px] text-slate-400 mb-2">Ketik lalu <b>Enter</b> untuk pindah ke kolom kanan. Kolom jam otomatis lompat. Kolom Operator wajib. Tiap baris <b>tersimpan otomatis</b>.</p>
              <SpreadsheetEditor key={modalDate} date={modalDate} opts={opts} soMap={soMap} onSaved={onEditorSaved} />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 shrink-0 bg-slate-50">
              <button onClick={closeInput} data-testid="modal-done-btn"
                className="inline-flex items-center gap-1.5 h-9 px-5 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 transition-colors">
                <FloppyDisk size={16} weight="bold" /> Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
