import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import api, { formatDateID } from "../lib/api";
import { toast } from "sonner";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { MagnifyingGlass, X, Link as LinkIcon, Plus, ArrowClockwise } from "@phosphor-icons/react";

export function BomPurchaseBadge({ status, totalBought, qty, unit, availableStock, neededQty }) {
  const cfg = {
    pending: { bg: "bg-slate-100", txt: "text-slate-700", border: "border-slate-300", label: "BELUM", bar: "bg-slate-300" },
    partial: { bg: "bg-amber-100", txt: "text-amber-800", border: "border-amber-300", label: "SEBAGIAN", bar: "bg-amber-500" },
    fulfilled: { bg: "bg-emerald-100", txt: "text-emerald-800", border: "border-emerald-300", label: "SELESAI", bar: "bg-emerald-500" },
    over: { bg: "bg-rose-100", txt: "text-rose-800", border: "border-rose-300", label: "OVER", bar: "bg-rose-500" },
    in_stock: { bg: "bg-sky-100", txt: "text-sky-800", border: "border-sky-400", label: "STOK CUKUP", bar: "bg-sky-500" },
  }[status] || { bg: "bg-slate-100", txt: "text-slate-700", border: "border-slate-300", label: "—", bar: "bg-slate-300" };
  const displayQty = status === "in_stock" ? qty : (neededQty ?? qty);
  const displayNumerator = status === "in_stock" ? qty : (totalBought || 0);
  const pct = displayQty > 0 ? Math.min(100, (displayNumerator / displayQty) * 100) : 0;
  return (
    <div className="space-y-1">
      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${cfg.bg} ${cfg.txt} ${cfg.border}`}>{cfg.label}</span>
      {status === "in_stock" ? (
        <div className="text-[10px] text-sky-700 tabular-nums font-semibold">Stok: {availableStock} {unit} · ✓ Cukup</div>
      ) : (
        <div className="text-[10px] text-slate-600 tabular-nums">
          {totalBought || 0} / {neededQty ?? qty} {unit}
          {availableStock > 0 && neededQty !== undefined && neededQty < qty && (
            <span className="text-sky-600"> · stok {availableStock}</span>
          )}
        </div>
      )}
      <div className="h-1 bg-slate-200 relative overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${cfg.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BomListProgress({ progress }) {
  if (!progress || !progress.total_items) return <span className="text-[10px] text-slate-300">—</span>;
  const pct = progress.percent || 0;
  return (
    <div className="min-w-[100px]">
      <div className="text-[10px] text-slate-600 tabular-nums font-semibold">{progress.fulfilled} / {progress.total_items} beli</div>
      <div className="h-1.5 bg-slate-200 relative overflow-hidden mt-0.5">
        <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] text-slate-500 mt-0.5">{pct}%</div>
    </div>
  );
}

// ============ SEARCH & LINK MODAL ============
export function BomSearchLinkModal({ bomId, item, onClose, onLinked }) {
  const [q, setQ] = useState(item?.item_name || "");
  const [days, setDays] = useState(90);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(null);
  const [showManual, setShowManual] = useState(false);

  const search = useCallback(async (kw, d) => {
    setLoading(true);
    try {
      const { data } = await api.get("/bom/purchase/search-transactions", { params: { q: kw ?? q, days: d ?? days } });
      setResults(data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal cari");
      setResults([]);
    } finally { setLoading(false); }
  }, [q, days]);

  useEffect(() => { const t = setTimeout(() => search(q, days), 350); return () => clearTimeout(t); }, [q, days, search]);

  const doLink = async (tx) => {
    if (tx.already_linked_bom) { toast.error("Transaksi sudah ter-link ke BOM item lain"); return; }
    if (!window.confirm(`Link transaksi "${tx.item_name}" (${tx.vendor_name}, ${formatDateID(tx.invoice_date)}, ${tx.qty} ${tx.unit || ""}) ke item no.${item.item_no} "${item.item_name}"?`)) return;
    setLinking(tx.id);
    try {
      await api.post(`/bom/${bomId}/items/${item.item_no}/link-transaction`, { transaction_id: tx.id });
      toast.success("Transaksi ter-link ke BOM item");
      onLinked && onLinked();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal link"); }
    finally { setLinking(null); }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="bom-search-modal">
      <div className="bg-white w-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-sky-50">
          <div>
            <div className="text-sm font-bold text-sky-900">Cari Transaksi untuk Link ke Item no.{item.item_no}</div>
            <div className="text-[11px] text-sky-800">Cari transaksi yang sudah tercatat — link ke <b>{item.item_name}</b> supaya progress beli otomatis update.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X size={16} weight="bold" /></button>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap bg-white sticky top-0 z-10">
          <div className="relative flex-1 min-w-[240px]">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="bom-search-q" className="h-9 rounded-none text-sm w-full pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari item / vendor / PO / invoice / SO..." autoFocus />
          </div>
          <select className="h-9 border border-slate-300 rounded-none text-xs px-2" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            <option value={30}>30 hari</option>
            <option value={60}>60 hari</option>
            <option value={90}>90 hari</option>
            <option value={180}>6 bulan</option>
            <option value={365}>1 tahun</option>
          </select>
          <Button variant="outline" size="sm" className="rounded-none h-9 text-xs" onClick={() => search(q, days)}><ArrowClockwise size={12} weight="bold" className="mr-1" /> Refresh</Button>
          <Button size="sm" className="rounded-none h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowManual(true)} data-testid="bom-manual-mark-btn">
            <Plus size={12} weight="bold" className="mr-1" /> Mark Manual (Offline)
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-500">
                <th className="p-2 text-left">Tanggal</th>
                <th className="p-2 text-left">Vendor</th>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">PO / Invoice</th>
                <th className="p-2 text-left">SO</th>
                <th className="p-2 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={8} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && results.length === 0 && (<tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">Tidak ada transaksi cocok. Coba perluas rentang hari atau ubah kata kunci.</td></tr>)}
              {results.map((tx) => (
                <tr key={tx.id} className={`border-b border-slate-100 hover:bg-sky-50 ${tx.already_linked_bom ? "opacity-40" : ""}`}>
                  <td className="p-2 whitespace-nowrap text-slate-700">{formatDateID(tx.invoice_date)}</td>
                  <td className="p-2 font-semibold text-slate-800">{tx.vendor_name}</td>
                  <td className="p-2">{tx.item_name}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{tx.qty}</td>
                  <td className="p-2 text-slate-500 uppercase">{tx.unit}</td>
                  <td className="p-2 text-xs text-slate-600">
                    <div>PO: {tx.po_no || "-"}</div>
                    <div>INV: {tx.invoice_no || "-"}</div>
                  </td>
                  <td className="p-2 font-mono text-xs">{tx.project_no || "-"}</td>
                  <td className="p-2 text-center">
                    {tx.already_linked_bom ? (
                      <span className="text-[10px] text-slate-400 italic">Sudah linked</span>
                    ) : (
                      <Button size="sm" onClick={() => doLink(tx)} disabled={linking === tx.id} className="h-7 text-[10px] rounded-none bg-sky-600 hover:bg-sky-700 text-white" data-testid={`bom-link-tx-${tx.id}`}>
                        <LinkIcon size={10} weight="bold" className="mr-1" /> {linking === tx.id ? "Linking..." : "Link"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span>{results.length} hasil · Rentang {days} hari</span>
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-none h-8 text-xs">Tutup</Button>
        </div>
      </div>

      {showManual && (
        <ManualMarkModal bomId={bomId} item={item} onClose={() => setShowManual(false)} onSaved={() => { setShowManual(false); onLinked && onLinked(); }} />
      )}
    </div>,
    document.body
  );
}

function ManualMarkModal({ bomId, item, onClose, onSaved }) {
  const [f, setF] = useState({
    actual_item_name: item.item_name || "",
    vendor_name: "",
    qty_bought: Math.max(0, (item.qty || 0) - (item.total_bought || 0)),
    unit: item.uom || item.unit || "",
    purchase_date: new Date().toISOString().slice(0, 10),
    po_no: "",
    invoice_no: "",
    unit_price: 0,
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.vendor_name.trim()) { toast.error("Nama vendor wajib"); return; }
    if (!f.qty_bought || f.qty_bought <= 0) { toast.error("Qty harus > 0"); return; }
    setSaving(true);
    try {
      await api.post(`/bom/${bomId}/items/${item.item_no}/mark-purchased`, {
        ...f, source: "manual",
      });
      toast.success("Purchase entry ter-record");
      onSaved && onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[110] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose}>
      <form className="bg-white w-full max-w-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="bom-manual-mark-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-emerald-50">
          <div>
            <div className="text-sm font-bold text-emerald-900">Mark Manual (Offline Purchase)</div>
            <div className="text-[11px] text-emerald-800">Item no.{item.item_no} — <b>{item.item_name}</b> — pakai kalau pembelian di luar sistem (cash, tunai, dll).</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900"><X size={16} weight="bold" /></button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 text-sm">
          <Field label="Actual Item Name *"><Input value={f.actual_item_name} onChange={(e) => set("actual_item_name", e.target.value)} className="h-9 rounded-none text-sm" data-testid="mm-item-name" /></Field>
          <Field label="Vendor Name *"><Input value={f.vendor_name} onChange={(e) => set("vendor_name", e.target.value)} className="h-9 rounded-none text-sm" data-testid="mm-vendor" /></Field>
          <Field label="Qty Bought *"><Input type="number" step="any" value={f.qty_bought} onChange={(e) => set("qty_bought", parseFloat(e.target.value) || 0)} className="h-9 rounded-none text-sm" data-testid="mm-qty" /></Field>
          <Field label="Unit"><Input value={f.unit} onChange={(e) => set("unit", e.target.value)} className="h-9 rounded-none text-sm" /></Field>
          <Field label="Unit Price"><Input type="number" step="any" value={f.unit_price} onChange={(e) => set("unit_price", parseFloat(e.target.value) || 0)} className="h-9 rounded-none text-sm" /></Field>
          <Field label="Purchase Date"><Input type="date" value={f.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} className="h-9 rounded-none text-sm" /></Field>
          <Field label="PO No"><Input value={f.po_no} onChange={(e) => set("po_no", e.target.value)} className="h-9 rounded-none text-sm" data-testid="mm-po" /></Field>
          <Field label="Invoice No"><Input value={f.invoice_no} onChange={(e) => set("invoice_no", e.target.value)} className="h-9 rounded-none text-sm" /></Field>
          <Field label="Note" full><Input value={f.note} onChange={(e) => set("note", e.target.value)} className="h-9 rounded-none text-sm" placeholder="Opsional..." /></Field>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none h-9">Batal</Button>
          <Button type="submit" disabled={saving} className="rounded-none h-9 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="mm-save">
            {saving ? "Menyimpan..." : "Simpan Purchase Entry"}
          </Button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
