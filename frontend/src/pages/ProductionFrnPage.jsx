import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import {
  Package, Plus, Trash, X, FloppyDisk, CalendarBlank, MagnifyingGlass,
} from "@phosphor-icons/react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const inputCls = "w-full h-9 px-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500";
const cellCls = "w-full h-8 px-1.5 text-sm bg-transparent outline-none focus:bg-emerald-50 focus:ring-1 focus:ring-emerald-400 rounded-sm";
const roCls = "w-full h-8 px-1.5 text-sm bg-transparent outline-none text-slate-500 cursor-not-allowed";
const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };

// Kolom: 0 No(ro) | 1 SO(edit) | 2 Customer(ro) | 3 Desc(ro) | 4 Qty(edit) | 5 Sisa(ro) | 6 QC(edit)
const EDIT_COLS = [1, 4, 6];
const nextEditable = (col) => { const i = EDIT_COLS.indexOf(col); return (i === -1 || i >= EDIT_COLS.length - 1) ? null : EDIT_COLS[i + 1]; };

const emptyRow = () => ({ id: null, release_no: "", so_no: "", customer: "", description: "", qty: "", qc_comment: "", item_index: null, _dirty: false, _saving: false });

/* Spreadsheet editor untuk Release Note (multiple baris, 1 tanggal, auto-simpan) */
function FrnEditor({ date, soMap, sos, onSaved }) {
  const [rows, setRows] = useState([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [itemsBySo, setItemsBySo] = useState({});   // { so_no: {customer, items:[{index,name,qty,balance}]} }
  const rowsRef = useRef(rows);
  const refs = useRef({});
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const fetchItems = useCallback(async (so) => {
    if (!so) return null;
    if (itemsBySo[so]) return itemsBySo[so];
    try { const { data } = await api.get("/production/so-items", { params: { so_no: so } }); setItemsBySo((p) => ({ ...p, [so]: data })); return data; }
    catch { return null; }
  }, [itemsBySo]);

  // Sisa balance untuk baris: per item bila item terpilih & SO multi-item, else balance SO
  const rowBalance = (r) => {
    const info = itemsBySo[r.so_no];
    if (info && (info.items || []).length > 1 && r.item_index != null && info.items[r.item_index]) return info.items[r.item_index].balance;
    if (info && (info.items || []).length === 1) return info.items[0].balance;
    return soMap[r.so_no] ? soMap[r.so_no].balance : null;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/production/frn", { params: { date } });
      const server = (data.items || []).map((r) => ({
        id: r.id, release_no: r.release_no || "", so_no: r.so_no || "", customer: r.customer || "",
        description: r.description || "", qty: r.qty ?? "", qc_comment: r.qc_comment || "",
        item_index: r.item_index ?? null, _dirty: false, _saving: false,
      }));
      setRows([...server, emptyRow()]);
      // prefetch item info tiap SO agar balance/pilihan item tampil benar
      [...new Set(server.map((s) => s.so_no).filter(Boolean))].forEach((so) => { fetchItems(so); });
    } catch (e) { setRows([emptyRow()]); toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const focusCell = (r, c) => { const el = refs.current[`${r}-${c}`]; if (el) { el.focus(); try { el.select && el.select(); } catch { /* */ } } };

  const updateCell = async (idx, field, value) => {
    if (field === "so_no") {
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, so_no: value, item_index: null, description: "", customer: soMap[value] ? soMap[value].customer || "" : "", _dirty: true } : r)));
      const data = await fetchItems(value);
      if (data) {
        setRows((prev) => prev.map((r, i) => {
          if (i !== idx) return r;
          const its = data.items || [];
          const n = { ...r, customer: data.customer || r.customer };
          if (its.length === 1) { n.item_index = 0; n.description = its[0].name; }  // 1 item → otomatis
          return n;
        }));
      }
      return;
    }
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const row = next[idx]; row[field] = value; row._dirty = true;
      if (field === "item_index") {
        const info = itemsBySo[row.so_no];
        const it = info && info.items ? info.items[Number(value)] : null;
        row.item_index = value === "" ? null : Number(value);
        if (it) row.description = it.name;
      }
      return next;
    });
  };

  const buildPayload = (row) => ({
    frn_date: date, release_no: row.release_no, so_no: row.so_no, customer: row.customer,
    description: row.description, qty: Number(row.qty) || 0, qc_comment: row.qc_comment,
    item_index: row.item_index,
  });

  const saveRow = useCallback(async (idx) => {
    const row = rowsRef.current[idx];
    if (!row || !row._dirty) return;
    if (!(row.so_no || "").trim() || !(Number(row.qty) > 0)) return; // SO + qty wajib
    // Wajib pilih item bila SO punya >1 item
    const info = itemsBySo[row.so_no];
    if (info && (info.items || []).length > 1 && row.item_index == null) {
      toast.error(`SO ${row.so_no} punya ${info.items.length} item — pilih item dulu`);
      return;
    }
    // Blok bila qty melebihi sisa balance (real-time guard)
    const bal = rowBalance(row);
    if (bal != null && !row.id && Number(row.qty) > bal) {
      toast.error(`Qty ${row.qty} melebihi sisa (sisa ${bal})`);
      return;
    }
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, _saving: true } : r)));
    try {
      if (row.id) {
        const { data } = await api.put(`/production/frn/${row.id}`, buildPayload(row));
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...data, _dirty: false, _saving: false } : r)));
      } else {
        const { data } = await api.post("/production/frn", buildPayload(row));
        setRows((prev) => {
          const next = prev.map((r, i) => (i === idx ? { ...r, ...data, _dirty: false, _saving: false } : r));
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

  const onKeyDown = (e, idx, col) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nc = nextEditable(col);
      if (nc != null) setTimeout(() => focusCell(idx, nc), 0);
      else { saveRow(idx); setTimeout(() => focusCell(idx + 1, 1), 80); }
    }
  };

  const removeRow = async (idx) => {
    const row = rowsRef.current[idx];
    if (row.id) {
      if (!window.confirm(`Hapus release note ${row.release_no || row.so_no || ""}?`)) return;
      try { await api.delete(`/production/frn/${row.id}`); toast.success("Dihapus"); }
      catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); return; }
    }
    setRows((prev) => { const next = prev.filter((_, i) => i !== idx); if (!next.some((r) => !r.id)) next.push(emptyRow()); return next; });
    onSaved && onSaved();
  };

  const setRef = (i, c) => (el) => { refs.current[`${i}-${c}`] = el; };

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm border-collapse" data-testid="frn-editor-table">
        <thead>
          <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
            <th className="px-2 py-2 text-left font-bold w-8 border border-slate-200">#</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[120px]">SO No</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[150px] bg-indigo-50 text-indigo-700">Item</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[150px]">Customer</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[160px]">Deskripsi (sesuai SO)</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-emerald-50 text-emerald-700 w-20">Qty</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 bg-rose-50 text-rose-700 w-20">Sisa</th>
            <th className="px-2 py-2 text-left font-bold border border-slate-200 min-w-[170px]">QC Comment</th>
            <th className="px-2 py-2 text-center font-bold border border-slate-200 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
          ) : (
            rows.map((r, i) => {
              const isDraft = !r.id;
              const info = itemsBySo[r.so_no];
              const its = info ? (info.items || []) : [];
              const bal = rowBalance(r);
              const over = isDraft && bal != null && Number(r.qty) > bal;
              const needPick = its.length > 1 && r.item_index == null;
              return (
                <tr key={r.id || `draft-${i}`} className={isDraft ? "bg-emerald-50/30" : "hover:bg-slate-50"} data-testid={`frn-row-${i}`}>
                  <td className="border border-slate-200 text-center text-slate-400 text-xs">{r._saving ? "…" : isDraft ? "＋" : i + 1}</td>
                  <td className="border border-slate-200 p-0"><input ref={setRef(i, 1)} list="frn-dl-sos" value={r.so_no} onChange={(e) => updateCell(i, "so_no", e.target.value)} onBlur={() => saveRow(i)} onKeyDown={(e) => onKeyDown(e, i, 1)} data-testid={`cell-frnso-${i}`} placeholder={isDraft ? "Pilih SO…" : ""} className={`${cellCls} font-mono`} /></td>
                  <td className={`border p-0 ${needPick ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
                    {its.length > 1 ? (
                      <select value={r.item_index == null ? "" : r.item_index} onChange={(e) => { updateCell(i, "item_index", e.target.value); setTimeout(() => saveRow(i), 0); }} data-testid={`cell-frnitem-${i}`} className={`${cellCls} ${needPick ? "text-indigo-700 font-bold" : ""}`}>
                        <option value="">— pilih item —</option>
                        {its.map((it) => <option key={it.index} value={it.index}>{it.name} (sisa {it.balance}/{it.qty})</option>)}
                      </select>
                    ) : its.length === 1 ? (
                      <input readOnly tabIndex={-1} value={its[0].name} data-testid={`cell-frnitem-${i}`} className={roCls} />
                    ) : (
                      <input readOnly tabIndex={-1} value="" placeholder={r.so_no ? "…" : "-"} className={roCls} />
                    )}
                  </td>
                  <td className="border border-slate-200 p-0 bg-slate-50"><input readOnly tabIndex={-1} value={r.customer} placeholder="auto" data-testid={`cell-frncust-${i}`} className={roCls} /></td>
                  <td className="border border-slate-200 p-0 bg-slate-50"><input readOnly tabIndex={-1} value={r.description} placeholder="auto" data-testid={`cell-frndesc-${i}`} className={roCls} /></td>
                  <td className={`border p-0 ${over ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-emerald-50/30"}`}><input ref={setRef(i, 4)} type="number" min="0" value={r.qty} onChange={(e) => updateCell(i, "qty", e.target.value)} onBlur={() => saveRow(i)} onKeyDown={(e) => onKeyDown(e, i, 4)} data-testid={`cell-frnqty-${i}`} className={`${cellCls} text-center font-semibold ${over ? "text-rose-600" : "text-emerald-700"}`} /></td>
                  <td className={`border border-slate-200 px-2 text-center font-bold ${over ? "text-rose-600 bg-rose-100" : "text-rose-700 bg-rose-50/30"}`} data-testid={`cell-frnbal-${i}`} title={over ? "Qty melebihi sisa!" : ""}>{bal != null ? (over ? `⚠ ${bal}` : bal) : "—"}</td>
                  <td className="border border-slate-200 p-0"><input ref={setRef(i, 6)} value={r.qc_comment} onChange={(e) => updateCell(i, "qc_comment", e.target.value)} onBlur={() => saveRow(i)} onKeyDown={(e) => onKeyDown(e, i, 6)} data-testid={`cell-frnqc-${i}`} placeholder="Catatan QC…" className={cellCls} /></td>
                  <td className="border border-slate-200 text-center">
                    {!isDraft && <button onClick={() => removeRow(i)} data-testid={`frn-editor-delete-${i}`} className="p-1 rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors" title="Hapus"><Trash size={15} weight="bold" /></button>}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div className="p-2 border-t border-slate-200 bg-slate-50">
        <button onClick={() => setRows((prev) => [...prev, emptyRow()])} data-testid="frn-add-row" className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-bold text-emerald-700 border border-emerald-300 bg-emerald-50 rounded hover:bg-emerald-100">
          <Plus size={14} weight="bold" /> Tambah Baris
        </button>
      </div>
    </div>
  );
}

export default function ProductionFrnPage() {
  const [month, setMonth] = useState(thisMonth());
  const [soFilter, setSoFilter] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sos, setSos] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(todayStr());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (month) params.month = month;
      if (soFilter.trim()) params.so_no = soFilter.trim();
      const { data } = await api.get("/production/frn", { params });
      setItems(data.items || []);
    } catch (e) { setItems([]); toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [month, soFilter]);
  const loadSos = useCallback(async () => { try { const { data } = await api.get("/production/so-brief"); setSos(data.items || []); } catch { /* */ } }, []);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { loadSos(); }, [loadSos]);

  const soMap = useMemo(() => { const m = {}; sos.forEach((s) => { m[s.so_no] = s; }); return m; }, [sos]);

  const FRN_STATUS = {
    draft: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-200" },
    submitted: { label: "Menunggu QC", cls: "bg-amber-100 text-amber-700 border-amber-300" },
    released: { label: "Released", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Ditolak QC", cls: "bg-rose-100 text-rose-700 border-rose-300" },
  };
  const act = async (id, action) => {
    try { await api.post(`/production/frn/${id}/${action}`); toast.success(action === "release" ? "Released — barang jadi siap kirim" : action === "reject" ? "Ditolak QC" : "Dikirim ke QC"); load(); loadSos(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const openInput = () => { setModalDate(todayStr()); setModalOpen(true); };
  const closeInput = () => { setModalOpen(false); load(); };

  const fmtDateLong = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); } catch { return d; } };

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4" data-testid="frn-page">
      <BackLink />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-700 mb-1">
            <Package size={14} weight="fill" /> Produksi · Finished Goods Release Note
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Finished Goods Release Note</h1>
          <p className="text-xs text-slate-500 mt-1">Klik <b>Buat Release Note</b> → pilih tanggal → isi banyak baris (auto-simpan). Total qty rilis otomatis menghitung progress di papan Job Progress.</p>
        </div>
        <button onClick={openInput} data-testid="add-frn-btn" className="inline-flex items-center gap-1.5 h-9 px-4 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 transition-colors">
          <Plus size={16} weight="bold" /> Buat Release Note
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><CalendarBlank size={13} /> Bulan</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="frn-filter-month" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><MagnifyingGlass size={13} /> Cari SO</label>
          <input value={soFilter} onChange={(e) => setSoFilter(e.target.value)} placeholder="No SO…" data-testid="frn-filter-so" className={inputCls} />
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="frn-table">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-bold w-24">Date</th>
                <th className="px-3 py-2 text-left font-bold w-36">No.</th>
                <th className="px-3 py-2 text-left font-bold w-24">SO No</th>
                <th className="px-3 py-2 text-left font-bold min-w-[150px]">Customer</th>
                <th className="px-3 py-2 text-left font-bold min-w-[200px]">Deskripsi (sesuai SO)</th>
                <th className="px-3 py-2 text-center font-bold w-20">Qty</th>
                <th className="px-3 py-2 text-center font-bold w-28">Status</th>
                <th className="px-3 py-2 text-left font-bold min-w-[180px]">QC Comment</th>
                <th className="px-3 py-2 text-center font-bold w-32">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400" data-testid="frn-empty">Belum ada release note. Klik <b className="text-emerald-600">Buat Release Note</b>.</td></tr>
              ) : (
                items.map((r, i) => {
                  const st = FRN_STATUS[r.status] || FRN_STATUS.draft;
                  return (
                  <tr key={r.id} className="hover:bg-emerald-50/40" data-testid={`frn-list-row-${i}`}>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(r.frn_date)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.release_no || "—"}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900">{r.so_no || "—"}</td>
                    <td className="px-3 py-2 text-slate-800">{r.customer || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.description || "—"}</td>
                    <td className="px-3 py-2 text-center font-bold text-emerald-700">{r.qty}</td>
                    <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.cls}`} data-testid={`frn-status-${i}`}>{st.label}</span></td>
                    <td className="px-3 py-2 text-slate-600 max-w-[240px] truncate" title={r.qc_comment}>{r.qc_comment || "—"}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {r.status === "draft" && <button onClick={() => act(r.id, "submit")} data-testid={`frn-submit-${i}`} className="px-2 py-1 text-[11px] font-bold rounded bg-amber-600 text-white hover:bg-amber-700">Submit QC</button>}
                      {r.status === "submitted" && (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => act(r.id, "release")} data-testid={`frn-release-${i}`} className="px-2 py-1 text-[11px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700">Release</button>
                          <button onClick={() => act(r.id, "reject")} data-testid={`frn-reject-${i}`} className="px-2 py-1 text-[11px] font-bold rounded bg-rose-100 text-rose-700 hover:bg-rose-200">Tolak</button>
                        </div>
                      )}
                      {r.status === "released" && <span className="text-[11px] text-emerald-600 font-bold">✓ Siap kirim</span>}
                      {r.status === "rejected" && <button onClick={() => act(r.id, "submit")} data-testid={`frn-resubmit-${i}`} className="px-2 py-1 text-[11px] font-bold rounded bg-slate-200 text-slate-700 hover:bg-slate-300">Ajukan lagi</button>}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="frn-dl-sos">{sos.map((s) => <option key={s.so_no} value={s.so_no}>{s.customer} — {s.description}</option>)}</datalist>

      {/* Popup spreadsheet */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-10 bg-slate-900/50 backdrop-blur-sm" data-testid="frn-modal">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1150px] max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Package size={18} weight="bold" className="text-emerald-600" /> Buat Release Note</h2>
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded px-2 h-9">
                  <CalendarBlank size={16} weight="bold" className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">Tanggal</span>
                  <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} data-testid="frn-modal-date" className="text-sm outline-none bg-transparent font-semibold" />
                </div>
                <span className="text-xs text-slate-500">{fmtDateLong(modalDate)}</span>
              </div>
              <button onClick={closeInput} data-testid="frn-modal-close" className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><X size={18} weight="bold" /></button>
            </div>
            <div className="px-5 py-4 overflow-auto">
              <p className="text-[11px] text-slate-400 mb-2">Ketik SO (customer &amp; deskripsi auto), isi Qty (warning otomatis bila melebihi sisa). Tiap baris <b>tersimpan otomatis sbg Draft</b>. Klik <b>Submit Semua ke QC</b> agar QC cek &amp; release.</p>
              <FrnEditor key={modalDate} date={modalDate} soMap={soMap} sos={sos} onSaved={() => { loadSos(); load(); }} />
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 shrink-0 bg-slate-50">
              <button onClick={async () => { try { const { data } = await api.post("/production/frn/submit-date", { date: modalDate }); toast.success(`${data.count} draft dikirim ke QC`); load(); } catch (e) { toast.error(e.response?.data?.detail || "Gagal submit"); } }} data-testid="frn-submit-all" className="inline-flex items-center gap-1.5 h-9 px-4 bg-amber-600 text-white text-sm font-bold rounded hover:bg-amber-700 transition-colors">
                Submit Semua ke QC
              </button>
              <button onClick={closeInput} data-testid="frn-modal-done" className="inline-flex items-center gap-1.5 h-9 px-5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded hover:bg-slate-100 transition-colors">
                <FloppyDisk size={16} weight="bold" /> Simpan Draft &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
