import React, { useEffect, useState, useCallback, useRef } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import { toast } from "sonner";
import { FloppyDisk, Plus, Trash, Lightning, CheckCircle, ClipboardText, X } from "@phosphor-icons/react";

const inputCls = "h-8 w-full border border-slate-300 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600 text-sm px-2 rounded-none";
const today = () => new Date().toISOString().slice(0, 10);
const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];
const CURRENCIES = ["IDR", "SGD", "USD"];

const emptyRow = () => ({
  invoice_date: today(),
  project_no: "",
  po_no: "",
  vendor_name: "",
  item_name: "",
  qty: "",
  unit: "Ea",
  unit_price: "",
  total_price: "",
  currency: "IDR",
  exchange_rate: 1,
  invoice_no: "",
  masuk_stok: null, // null = belum diisi (wajib pilih ya/tidak)
  consumable_request_id: null,
  consumable_request_item_id: null,
  _cgr_desc: "",     // display source description
  _saved: false,
});

export default function BulkTransaksiPage() {
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [sos, setSos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [openItems, setOpenItems] = useState([]);
  const tableRef = useRef(null);

  // Autocomplete sources
  useEffect(() => {
    api.get("/sales-orders").then((r) => setSos((r.data || []).map((s) => s.so_no).filter(Boolean))).catch(() => {});
    api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
    api.get("/master/items").then((r) => setItems((r.data || []).map((it) => it.item_name || it._id).filter(Boolean))).catch(() => {});
  }, []);

  const setRow = useCallback((i, patch) => {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      // Auto compute total_price if qty & unit_price present
      if ("qty" in patch || "unit_price" in patch) {
        const q = Number(next.qty) || 0;
        const p = Number(next.unit_price) || 0;
        if (q > 0 && p > 0) next.total_price = (q * p).toString();
      }
      next._saved = false;
      return next;
    }));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
    setTimeout(() => {
      const inp = document.querySelector(`[data-testid="cell-vendor-${rows.length}"]`);
      if (inp) inp.focus();
    }, 30);
  }, [rows.length]);

  const removeRow = (i) => setRows((prev) => prev.length === 1 ? [emptyRow()] : prev.filter((_, idx) => idx !== i));

  // Enter navigation: field → next field, or last → new row
  const FIELDS = ["date", "so", "po", "vendor", "item", "qty", "unit", "price", "invoice", "stok"];
  const onKeyDown = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const idx = FIELDS.indexOf(field);
    if (idx < 0) return;
    if (idx < FIELDS.length - 1) {
      const nx = document.querySelector(`[data-testid="cell-${FIELDS[idx + 1]}-${i}"]`);
      if (nx) nx.focus();
    } else {
      // last cell — add new row if this row valid
      if (i === rows.length - 1) addRow();
      else {
        const nx = document.querySelector(`[data-testid="cell-${FIELDS[0]}-${i + 1}"]`);
        if (nx) nx.focus();
      }
    }
  };

  const rowValid = (r) =>
    r.vendor_name?.trim() && r.item_name?.trim() && Number(r.qty) > 0 && r.masuk_stok !== null;

  const draftRows = rows.filter((r) => !r._saved);
  const validCount = draftRows.filter(rowValid).length;

  const saveAll = async () => {
    const toSave = draftRows.filter(rowValid);
    if (toSave.length === 0) {
      toast.error("Tidak ada baris valid untuk disimpan (isi Supplier, Barang, Qty > 0, dan pilih Masuk Stok)");
      return;
    }
    setSaving(true);
    try {
      const payload = { rows: toSave.map((r) => ({
        invoice_date: r.invoice_date,
        project_no: r.project_no,
        po_no: r.po_no,
        vendor_name: r.vendor_name,
        item_name: r.item_name,
        qty: Number(r.qty),
        unit: r.unit,
        unit_price: Number(r.unit_price) || 0,
        total_price: Number(r.total_price) || (Number(r.qty) * (Number(r.unit_price) || 0)),
        currency: r.currency || "IDR",
        exchange_rate: Number(r.exchange_rate) || 1,
        invoice_no: r.invoice_no,
        masuk_stok: !!r.masuk_stok,
        consumable_request_id: r.consumable_request_id || null,
        consumable_request_item_id: r.consumable_request_item_id || null,
      })) };
      const { data } = await api.post("/transactions/bulk-direct", payload);
      toast.success(`${data.inserted} transaksi tersimpan (${data.with_stock} masuk stok)`);
      // Mark saved rows with ✅ and append a fresh empty row
      const savedSet = new Set(toSave.map((r) => `${r.vendor_name}|${r.item_name}|${r.qty}|${r.invoice_date}`));
      setRows((prev) => {
        const next = prev.map((r) => {
          const key = `${r.vendor_name}|${r.item_name}|${r.qty}|${r.invoice_date}`;
          if (!r._saved && savedSet.has(key)) return { ...r, _saved: true };
          return r;
        });
        // Add one fresh empty row so user can continue
        if (!next.some((r) => !r._saved)) next.push(emptyRow());
        return next;
      });
      // Refresh vendor/item autocomplete
      api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
      api.get("/master/items").then((r) => setItems((r.data || []).map((it) => it.item_name || it._id).filter(Boolean))).catch(() => {});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally {
      setSaving(false);
    }
  };

  const clearSaved = () => setRows((prev) => prev.filter((r) => !r._saved).length ? prev.filter((r) => !r._saved) : [emptyRow()]);

  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lightning size={22} weight="duotone" className="text-amber-600" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
              Bulk Transaksi (Langsung)
            </h1>
          </div>
          <p className="text-xs text-slate-500 max-w-3xl">
            Input cepat tabel-style. Tanggal nota = tanggal terima. Nomor PO opsional. Wajib pilih <b>Masuk Stok</b> — jika ✓ langsung tercatat sebagai <i>Incoming Goods</i> & masuk stok FIFO tanpa persetujuan Store. Enter untuk pindah cell / tambah baris.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="bulk-picker-btn" onClick={async () => {
            try { const { data } = await api.get("/consumable-requests/open-items"); setOpenItems(data || []); setShowPicker(true); }
            catch { toast.error("Gagal muat"); }
          }} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-semibold border-teal-300 text-teal-700 hover:bg-teal-50">
            <ClipboardText size={13} weight="bold" className="mr-1" /> Tarik dari Consumable Request
          </Button>
          <Button variant="outline" data-testid="bulk-add-row" onClick={addRow} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-semibold">
            <Plus size={12} weight="bold" className="mr-1" /> Baris Baru
          </Button>
          <Button data-testid="bulk-save-btn" onClick={saveAll} disabled={saving || validCount === 0} className="rounded-none h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em] font-bold">
            <FloppyDisk size={13} weight="bold" className="mr-1.5" /> {saving ? "Menyimpan..." : `Simpan ${validCount} Baris`}
          </Button>
        </div>
      </div>

      {showPicker && (
        <ConsumableRequestPicker
          openItems={openItems}
          usedIds={new Set(rows.filter((r) => r.consumable_request_item_id).map((r) => r.consumable_request_item_id))}
          onClose={() => setShowPicker(false)}
          onPick={(picked) => {
            // Append each picked item as a new row (pre-filled).
            setRows((prev) => {
              const draft = prev.filter((r) => !r._saved);
              const saved = prev.filter((r) => r._saved);
              // If first draft row is fully empty, replace it; else append.
              const firstEmpty = draft.length === 1 && !draft[0].vendor_name && !draft[0].item_name && !draft[0].qty && !draft[0].consumable_request_item_id;
              const newRows = picked.map((p) => ({
                ...emptyRow(),
                project_no: p.so || "",
                item_name: p.description || "",
                qty: p.qty || "",
                unit: p.unit || "Ea",
                consumable_request_id: p.request_id,
                consumable_request_item_id: p.item_id,
                _cgr_desc: p.description,
              }));
              return firstEmpty ? [...saved, ...newRows, emptyRow()] : [...saved, ...draft, ...newRows, emptyRow()];
            });
            setShowPicker(false);
            toast.success(`${picked.length} item ditarik ke form — silakan lengkapi Supplier & Harga`);
          }}
        />
      )}

      <Card className="rounded-none border-slate-200 shadow-none overflow-visible bg-white">
        <div className="overflow-x-auto" ref={tableRef}>
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-500">
                <th className="p-2 w-8 text-center">#</th>
                <th className="p-2 text-left min-w-[110px]">Tanggal</th>
                <th className="p-2 text-left min-w-[110px]">SO No</th>
                <th className="p-2 text-left min-w-[110px]">PO No</th>
                <th className="p-2 text-left min-w-[160px]">Supplier *</th>
                <th className="p-2 text-left min-w-[200px]">Nama Barang *</th>
                <th className="p-2 text-right min-w-[70px]">Qty *</th>
                <th className="p-2 text-left min-w-[70px]">Unit</th>
                <th className="p-2 text-right min-w-[110px]">Unit Price</th>
                <th className="p-2 text-right min-w-[120px]">Total Price</th>
                <th className="p-2 text-left min-w-[100px]">Invoice</th>
                <th className="p-2 text-center min-w-[100px]">Masuk Stok?*</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody data-testid="bulk-rows">
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-slate-100 ${r._saved ? "bg-emerald-50/70" : ""}`} data-testid={`bulk-row-${i}`}>
                  <td className="p-1 text-center text-slate-400 tabular-nums">
                    {r._saved ? <CheckCircle size={16} weight="fill" className="text-emerald-600 inline" /> : (
                      r.consumable_request_item_id ? (
                        <span title={r._cgr_desc} className="inline-flex flex-col items-center">
                          <span className="text-[9px] leading-none text-teal-700 font-bold">🔗</span>
                          <span className="text-[10px] text-slate-400">{i + 1}</span>
                        </span>
                      ) : (i + 1)
                    )}
                  </td>
                  <td className="p-1"><Input disabled={r._saved} type="date" data-testid={`cell-date-${i}`} className={inputCls} value={r.invoice_date} onChange={(e) => setRow(i, { invoice_date: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "date")} /></td>
                  <td className="p-1"><Input disabled={r._saved} list={`so-list-${i}`} data-testid={`cell-so-${i}`} className={inputCls} value={r.project_no} onChange={(e) => setRow(i, { project_no: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "so")} placeholder="—" />
                    <datalist id={`so-list-${i}`}>{sos.slice(0, 300).map((s) => <option key={s} value={s} />)}</datalist>
                  </td>
                  <td className="p-1"><Input disabled={r._saved} data-testid={`cell-po-${i}`} className={inputCls} value={r.po_no} onChange={(e) => setRow(i, { po_no: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "po")} placeholder="—" /></td>
                  <td className="p-1"><Input disabled={r._saved} list={`vd-list-${i}`} data-testid={`cell-vendor-${i}`} className={inputCls} value={r.vendor_name} onChange={(e) => setRow(i, { vendor_name: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "vendor")} placeholder="Nama Supplier" />
                    <datalist id={`vd-list-${i}`}>{vendors.slice(0, 300).map((v) => <option key={v} value={v} />)}</datalist>
                  </td>
                  <td className="p-1"><Input disabled={r._saved} list={`it-list-${i}`} data-testid={`cell-item-${i}`} className={inputCls} value={r.item_name} onChange={(e) => setRow(i, { item_name: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "item")} placeholder="Nama Barang" />
                    <datalist id={`it-list-${i}`}>{items.slice(0, 500).map((n) => <option key={n} value={n} />)}</datalist>
                  </td>
                  <td className="p-1"><Input disabled={r._saved} type="number" step="any" data-testid={`cell-qty-${i}`} className={`${inputCls} text-right`} value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "qty")} /></td>
                  <td className="p-1">
                    <select disabled={r._saved} data-testid={`cell-unit-${i}`} className={inputCls} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "unit")}>
                      {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><Input disabled={r._saved} type="number" step="any" data-testid={`cell-price-${i}`} className={`${inputCls} text-right`} value={r.unit_price} onChange={(e) => setRow(i, { unit_price: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "price")} /></td>
                  <td className="p-1"><Input disabled={true} data-testid={`cell-total-${i}`} className={`${inputCls} text-right bg-slate-50`} value={r.total_price ? Number(r.total_price).toLocaleString("id-ID") : ""} readOnly /></td>
                  <td className="p-1"><Input disabled={r._saved} data-testid={`cell-invoice-${i}`} className={inputCls} value={r.invoice_no} onChange={(e) => setRow(i, { invoice_no: e.target.value })} onKeyDown={(e) => onKeyDown(e, i, "invoice")} placeholder="—" /></td>
                  <td className="p-1 text-center">
                    <select disabled={r._saved} data-testid={`cell-stok-${i}`} className={inputCls} value={r.masuk_stok === null ? "" : r.masuk_stok ? "yes" : "no"} onChange={(e) => setRow(i, { masuk_stok: e.target.value === "yes" ? true : e.target.value === "no" ? false : null })} onKeyDown={(e) => onKeyDown(e, i, "stok")} title="Ya = masuk stok gudang + Incoming Good report · Tidak = hanya Incoming Good report (barang tetap tercatat, cuma tidak nambah stok)">
                      <option value="">Pilih…</option>
                      <option value="yes">✓ Ya, Masuk Stok</option>
                      <option value="no">✎ Log Only (Incoming Good saja)</option>
                    </select>
                  </td>
                  <td className="p-1 text-center">
                    {!r._saved && rows.length > 1 && (
                      <button onClick={() => removeRow(i)} data-testid={`bulk-del-${i}`} className="text-red-600 hover:bg-red-50 p-1"><Trash size={13} weight="bold" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.some((r) => r._saved) && (
          <div className="p-2 bg-emerald-50/50 border-t border-emerald-200 flex items-center justify-between">
            <span className="text-xs text-emerald-800"><b>{rows.filter((r) => r._saved).length}</b> baris sudah tersimpan (highlight hijau). Anda bisa lanjut isi baris baru.</span>
            <Button size="sm" variant="outline" data-testid="bulk-clear-saved" onClick={clearSaved} className="rounded-none h-7 text-xs">Bersihkan Baris Tersimpan</Button>
          </div>
        )}
      </Card>
    </div>
  );
}


function ConsumableRequestPicker({ openItems, usedIds, onClose, onPick }) {
  const [selected, setSelected] = useState(() => new Set());
  const [q, setQ] = useState("");

  const filtered = openItems.filter((it) => {
    if (usedIds.has(it.item_id)) return false;
    if (!q.trim()) return true;
    const k = q.toLowerCase();
    return (it.description || "").toLowerCase().includes(k)
      || (it.so || "").toLowerCase().includes(k)
      || (it.request_by || "").toLowerCase().includes(k);
  });

  const toggle = (id) => setSelected((s) => {
    const nx = new Set(s);
    if (nx.has(id)) nx.delete(id); else nx.add(id);
    return nx;
  });

  const toggleAll = () => {
    if (filtered.every((it) => selected.has(it.item_id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((it) => it.item_id)));
    }
  };

  const pick = () => {
    const picked = openItems.filter((it) => selected.has(it.item_id));
    if (picked.length === 0) return;
    onPick(picked);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="cgr-picker-modal">
      <div className="bg-white w-full max-w-4xl max-h-[85vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-teal-50">
          <div>
            <div className="text-sm font-bold text-teal-900">Tarik Item dari Consumable Request</div>
            <div className="text-[11px] text-teal-800">Checklist item yang dibeli hari ini — akan otomatis di-append ke tabel Bulk Transaksi.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-lg" data-testid="cgr-picker-close"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2">
          <Input data-testid="cgr-picker-search" className="h-9 rounded-none text-sm flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari item / SO / request by..." />
          <Button variant="outline" size="sm" onClick={toggleAll} className="rounded-none h-9 text-xs">
            {filtered.every((it) => selected.has(it.item_id)) && filtered.length > 0 ? "Uncheck All" : "Check All"}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="p-2 w-10 text-center"></th>
                <th className="p-2 text-left">Tanggal</th>
                <th className="p-2 text-left">Request By</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">SO</th>
                <th className="p-2 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">Tidak ada item terbuka.</td></tr>
              )}
              {filtered.map((it) => (
                <tr key={it.item_id} className={`border-b border-slate-100 hover:bg-teal-50 cursor-pointer ${selected.has(it.item_id) ? "bg-teal-50/60" : ""}`} onClick={() => toggle(it.item_id)} data-testid={`cgr-picker-row-${it.item_id}`}>
                  <td className="p-2 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selected.has(it.item_id)} onChange={() => toggle(it.item_id)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="p-2 whitespace-nowrap text-slate-600">{formatDateID(it.request_date)}</td>
                  <td className="p-2 font-semibold text-slate-800">{it.request_by}</td>
                  <td className="p-2 text-slate-900">{it.description}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{it.qty}</td>
                  <td className="p-2 text-slate-500 uppercase">{it.unit}</td>
                  <td className="p-2 font-mono text-xs text-slate-600">{it.so || "-"}</td>
                  <td className="p-2 text-xs text-slate-500">{it.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-600"><b>{selected.size}</b> item dipilih dari <b>{filtered.length}</b> tersedia</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="rounded-none h-9">Batal</Button>
            <Button data-testid="cgr-picker-apply" onClick={pick} disabled={selected.size === 0} className="rounded-none h-9 bg-teal-600 hover:bg-teal-700 text-white">Tarik ke Form ({selected.size})</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
