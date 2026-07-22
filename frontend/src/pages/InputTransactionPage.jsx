import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Plus, Trash, FloppyDisk, ArrowUp, Sparkle } from "@phosphor-icons/react";

const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];
const CURRENCIES = ["IDR", "SGD", "USD"];
const DEFAULT_RATES = { IDR: 1, SGD: 12000, USD: 16000 };

const emptyItem = () => ({ project_no: "", item_name: "", qty: 1, unit: "Ea", unit_price: 0, notes: "", post_to_store: false });

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

export default function InputTransactionPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [header, setHeader] = useState({
    invoice_date: today,
    po_no: "",
    vendor_name: "",
    invoice_no: "",
    po_date: today,
    receive_date: today,
    currency: "IDR",
    exchange_rate: 1,
  });
  const [items, setItems] = useState([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);

  // Load autocomplete sources once
  useEffect(() => {
    api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
    api.get("/master/items").then((r) => setItemsMaster(r.data || [])).catch(() => {});
  }, []);

  const itemsIndex = useMemo(() => {
    const m = new Map();
    for (const it of itemsMaster) m.set(it.item_name, it);
    return m;
  }, [itemsMaster]);

  const setH = (k, v) => setHeader((s) => {
    const next = { ...s, [k]: v };
    // When switching currency, populate a default exchange rate (user can adjust)
    if (k === "currency") {
      next.exchange_rate = DEFAULT_RATES[v] ?? 1;
    }
    return next;
  });
  const setItem = (i, k, v) =>
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, [k]: v };
        // Auto-fill unit & unit_price when a known item name is picked
        if (k === "item_name") {
          const match = itemsIndex.get(v);
          if (match) {
            next.unit = match.unit || next.unit;
            if (!Number(it.unit_price)) next.unit_price = match.last_price || 0;
          }
        }
        return next;
      })
    );
  const addRow = () => {
    setItems((prev) => [...prev, emptyItem()]);
    // focus the new row's SO input on next tick
    setTimeout(() => {
      const nextIdx = items.length; // will be the new last index
      const el = document.querySelector(`[data-testid="item-so-${nextIdx}"]`);
      if (el) el.focus();
    }, 30);
  };
  const removeRow = (i) => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const onRowKeyDown = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = ["item-so", "item-name", "item-qty", "item-price"];
    const curIdx = order.indexOf(field);
    if (curIdx < 0) return;
    if (curIdx < order.length - 1) {
      const next = order[curIdx + 1];
      const el = document.querySelector(`[data-testid="${next}-${i}"]`);
      if (el) el.focus();
    } else {
      // Last field (price) — if this is the last row, add new. Else, focus first field of next row.
      if (i === items.length - 1) {
        // Only add row if current row has an item_name (avoid empty rows)
        if (items[i].item_name && items[i].item_name.trim()) {
          addRow();
        }
      } else {
        const el = document.querySelector(`[data-testid="item-so-${i + 1}"]`);
        if (el) el.focus();
      }
    }
  };

  const grandTotal = items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unit_price || 0), 0);
  const rate = header.currency === "IDR" ? 1 : Number(header.exchange_rate) || 0;
  const grandTotalIDR = grandTotal * rate;
  const currSymbol = header.currency === "IDR" ? "Rp" : header.currency;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!header.vendor_name.trim()) return toast.error("Nama Toko wajib diisi");
    const valid = items.filter((it) => it.item_name.trim());
    if (valid.length === 0) return toast.error("Minimal 1 item barang wajib diisi");
    if (header.currency !== "IDR" && !(Number(header.exchange_rate) > 0)) {
      return toast.error("Nilai Exchange Rate wajib > 0 untuk mata uang selain IDR");
    }

    setSubmitting(true);
    try {
      const currency = header.currency || "IDR";
      const rate = currency === "IDR" ? 1 : Number(header.exchange_rate) || 1;
      const payload = {
        transactions: valid.map((it) => ({
          invoice_date: header.invoice_date,
          project_no: (it.project_no || "").trim(),
          po_no: header.po_no || "",
          vendor_name: header.vendor_name.trim(),
          invoice_no: header.invoice_no || "",
          po_date: header.po_date || null,
          receive_date: header.receive_date || null,
          item_name: it.item_name.trim(),
          qty: Number(it.qty) || 0,
          unit: it.unit || "Ea",
          unit_price: Number(it.unit_price) || 0,
          total_price: (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
          currency,
          exchange_rate: rate,
          notes: it.notes || "",
          post_to_store: !!it.post_to_store,
        })),
      };
      const { data } = await api.post("/transactions/bulk", payload);
      toast.success(`${data.inserted} transaksi berhasil disimpan`);
      setHeader({
        invoice_date: today,
        po_no: "",
        vendor_name: "",
        invoice_no: "",
        po_date: today,
        receive_date: today,
        currency: "IDR",
        exchange_rate: 1,
      });
      setItems([emptyItem()]);
      // Refresh master lists so newly-added names show up in autocomplete
      api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
      api.get("/master/items").then((r) => setItemsMaster(r.data || [])).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal menyimpan transaksi");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // PO auto-read via Gemini 3 Flash
  const fileInputRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [sos, setSos] = useState([]);
  useEffect(() => { api.get("/sales-orders").then((r) => setSos(r.data || [])).catch(() => {}); }, []);

  const onParsePO = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/transactions/parse-po", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setHeader((s) => ({
        ...s,
        vendor_name: data.vendor_name || s.vendor_name,
        po_no: data.po_no || s.po_no,
        po_date: data.po_date || s.po_date,
        invoice_no: data.invoice_no || s.invoice_no,
        invoice_date: data.invoice_date || s.invoice_date,
        currency: data.currency || "IDR",
        exchange_rate: data.exchange_rate || 1,
      }));
      const parsed = (data.items || []).map((it) => ({
        project_no: "",
        item_name: it.item_name || "",
        qty: it.qty || 1,
        unit: it.unit || "Ea",
        unit_price: it.unit_price || 0,
        notes: "",
        post_to_store: false,
      }));
      if (parsed.length > 0) setItems(parsed);
      toast.success(`PO terbaca: ${parsed.length} item — silakan koreksi lalu klik Simpan`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal baca PO");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="input-transaction-form">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Input Transaksi Pembelian
          </h1>
          <p className="text-sm text-slate-500 mt-1">Isi header sekali, lalu tambah item ke bawah. Tekan <kbd className="px-1.5 py-0.5 border border-slate-300 bg-slate-50 text-slate-700 text-[10px] rounded">Enter</kbd> untuk lompat kolom berikutnya; Enter di kolom terakhir akan menambah baris baru.</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={onParsePO}
              className="hidden"
              data-testid="po-upload-input"
            />
            <Button
              type="button"
              data-testid="parse-po-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              variant="outline"
              size="sm"
              className="rounded-none h-8 border-sky-300 text-sky-700 hover:bg-sky-50 text-xs uppercase tracking-[0.1em] font-semibold"
            >
              <Sparkle size={14} weight="fill" className="mr-1.5 text-sky-600" />
              {parsing ? "Membaca PO..." : "Auto-Read PO (JPG/PDF)"}
            </Button>
            <span className="text-[10px] text-slate-500">Upload foto/scan/PDF PO — AI akan mengisi form otomatis (Gemini 3 Flash)</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Grand Total ({header.currency})</div>
          <div className="text-3xl font-semibold tabular-nums text-sky-700" data-testid="grand-total" style={{ fontFamily: "Chivo, sans-serif" }}>
            {currSymbol} {grandTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
          </div>
          {header.currency !== "IDR" && (
            <div className="text-xs text-slate-500 tabular-nums mt-1" data-testid="grand-total-idr">
              ≈ Rp {grandTotalIDR.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
            </div>
          )}
        </div>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-6 bg-white">
        <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500 mb-4">Info Invoice & Mata Uang</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Invoice *</Label>
            <Input type="date" data-testid="input-invoice-date" required className={inputCls} value={header.invoice_date} onChange={(e) => setH("invoice_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Invoice</Label>
            <Input data-testid="input-invoice-no" className={inputCls} value={header.invoice_no} onChange={(e) => setH("invoice_no", e.target.value)} placeholder="mis. 00123/MM/GOGO/01/2026" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Toko / Vendor *</Label>
            <Input data-testid="input-vendor" required list="vendors-list" autoComplete="off" className={inputCls} value={header.vendor_name} onChange={(e) => setH("vendor_name", e.target.value)} placeholder="mis. Wiratama Sukses, PT" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor PO</Label>
            <Input data-testid="input-po-no" className={inputCls} value={header.po_no} onChange={(e) => setH("po_no", e.target.value)} placeholder="mis. 9488" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal PO</Label>
              <Input type="date" data-testid="input-po-date" className={inputCls} value={header.po_date} onChange={(e) => setH("po_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Terima</Label>
              <Input type="date" data-testid="input-receive-date" className={inputCls} value={header.receive_date} onChange={(e) => setH("receive_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-1">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Mata Uang *</Label>
              <select
                data-testid="input-currency"
                value={header.currency}
                onChange={(e) => setH("currency", e.target.value)}
                className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm bg-white focus:ring-2 focus:ring-sky-600 focus:outline-none"
              >
                {CURRENCIES.map((c) => (<option key={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                Exchange Rate {header.currency !== "IDR" && <span className="text-red-600">*</span>}
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                data-testid="input-exchange-rate"
                disabled={header.currency === "IDR"}
                className={`${inputCls} tabular-nums text-right ${header.currency === "IDR" ? "bg-slate-50 text-slate-400" : ""}`}
                value={header.exchange_rate}
                onChange={(e) => setH("exchange_rate", e.target.value)}
                placeholder={header.currency === "IDR" ? "1" : "mis. 12000"}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Item Barang</h3>
          <Button type="button" data-testid="add-item-btn" onClick={addRow} variant="outline" size="sm" className="rounded-none h-8 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
            <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3 w-10">#</th>
                <th className="text-left p-3 w-32">Nomor SO</th>
                <th className="text-left p-3 min-w-[260px]">Nama Barang</th>
                <th className="text-right p-3 w-24">Qty</th>
                <th className="text-left p-3 w-28">Unit</th>
                <th className="text-right p-3 w-36">Unit Price</th>
                <th className="text-right p-3 w-36">Total</th>
                <th className="text-center p-3 w-24" title="Kirim ke Store untuk dimasukkan ke stok">Ke Store?</th>
                <th className="text-center p-3 w-14"></th>
              </tr>
            </thead>
            <tbody data-testid="items-table">
              {items.map((it, i) => {
                const total = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="p-2">
                      <Input data-testid={`item-so-${i}`} list="so-list" autoComplete="off" className={inputCls} value={it.project_no} onChange={(e) => setItem(i, "project_no", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "item-so")} placeholder="mis. 4413" />
                    </td>
                    <td className="p-2">
                      <Input data-testid={`item-name-${i}`} list="items-list" autoComplete="off" className={inputCls} value={it.item_name} onChange={(e) => setItem(i, "item_name", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "item-name")} placeholder="mis. NUT BAUT M14 X 2.0" />
                    </td>
                    <td className="p-2">
                      <Input data-testid={`item-qty-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "item-qty")} />
                    </td>
                    <td className="p-2">
                      <select
                        data-testid={`item-unit-${i}`}
                        value={it.unit}
                        onChange={(e) => setItem(i, "unit", e.target.value)}
                        className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm bg-white focus:ring-2 focus:ring-sky-600 focus:outline-none"
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Input data-testid={`item-price-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "item-price")} />
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold text-slate-900" data-testid={`item-total-${i}`}>
                      {currSymbol} {total.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        data-testid={`item-post-store-${i}`}
                        className="w-4 h-4 accent-sky-600 cursor-pointer"
                        checked={!!it.post_to_store}
                        onChange={(e) => setItem(i, "post_to_store", e.target.checked)}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        data-testid={`remove-item-${i}`}
                        onClick={() => removeRow(i)}
                        disabled={items.length === 1}
                        className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash size={16} weight="bold" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 bg-slate-50">
                <td colSpan={6} className="p-3 text-right text-xs uppercase tracking-[0.1em] font-bold text-slate-600">
                  Grand Total ({header.currency})
                </td>
                <td className="p-3 text-right tabular-nums font-bold text-slate-900 text-base">{currSymbol} {grandTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</td>
                <td colSpan={2}></td>
              </tr>
              {header.currency !== "IDR" && (
                <tr className="bg-slate-50">
                  <td colSpan={6} className="p-3 text-right text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
                    ≈ IDR (rate {Number(header.exchange_rate).toLocaleString("id-ID")})
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold text-sky-700 text-sm" data-testid="grand-total-idr-footer">Rp {grandTotalIDR.toLocaleString("id-ID", { maximumFractionDigits: 0 })}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-white border-t border-slate-200 p-4 -mx-6">
        <button type="button" onClick={scrollTop} className="text-xs text-slate-500 hover:text-slate-900 uppercase tracking-[0.1em] font-semibold flex items-center gap-1">
          <ArrowUp size={14} weight="bold" /> Kembali ke atas
        </button>
        <Button
          type="submit"
          data-testid="submit-transaction-btn"
          disabled={submitting}
          className="h-11 rounded-none bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase tracking-[0.1em] text-xs px-8 active:scale-[0.98]"
        >
          <FloppyDisk size={16} weight="bold" className="mr-2" />
          {submitting ? "Menyimpan..." : "Simpan Transaksi"}
        </Button>
      </div>

      {/* Autocomplete data sources (HTML5 datalist) */}
      <datalist id="vendors-list">
        {vendors.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="items-list">
        {itemsMaster.map((it) => (
          <option key={it.item_name} value={it.item_name}>{`${it.last_vendor || ""} — Rp ${Number(it.last_price || 0).toLocaleString("id-ID")}`}</option>
        ))}
      </datalist>
      <datalist id="so-list">
        {sos.map((s) => (<option key={s.id} value={s.so_no}>{`${s.customer} — ${s.description || ""}`}</option>))}
      </datalist>
    </form>
  );
}
