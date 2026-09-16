import React, { useState, useEffect, useMemo, useRef } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import BackLink from "../components/BackLink";
import { toast } from "sonner";
import { tryAutocomplete } from "../lib/autocomplete";
import { Plus, Trash, FloppyDisk, ArrowUp, Sparkle, ClipboardText, X, Truck } from "@phosphor-icons/react";

const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];
const CURRENCIES = ["IDR", "SGD", "USD"];
const DEFAULT_RATES = { IDR: 1, SGD: 12000, USD: 16000 };

const emptyItem = () => ({ project_no: "", category: "", item_name: "", qty: 1, unit: "Ea", unit_price: 0, notes: "", post_to_store: false, should_stock: true });

const inputCls = "h-7 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-[12px] px-2";
const rowSelectCls = "h-7 w-full border border-slate-300 rounded-none px-1.5 text-[12px] bg-white focus:ring-2 focus:ring-sky-600 focus:outline-none";

export default function InputTransactionPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [header, setHeader] = useState({
    invoice_date: today,
    po_no: "",
    vendor_name: "",
    invoice_no: "",
    po_date: today,
    plan_delivery_date: "",
    receive_date: today,
    currency: "IDR",
    exchange_rate: 1,
    notes: "",
  });
  const [items, setItems] = useState([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [showCgrPicker, setShowCgrPicker] = useState(false);
  const [cgrOpenItems, setCgrOpenItems] = useState([]);
  const [showBomPicker, setShowBomPicker] = useState(false);
  const [bomOpenItems, setBomOpenItems] = useState([]);
  const [showDoPicker, setShowDoPicker] = useState(false);
  const [pendingReceipts, setPendingReceipts] = useState([]);

  // Load autocomplete sources once
  useEffect(() => {
    api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
    api.get("/master/categories").then((r) => setCategories(r.data || [])).catch(() => {});
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
        // Auto-fill unit, unit_price & category when a known item name is picked
        if (k === "item_name") {
          const match = itemsIndex.get(v);
          if (match) {
            next.unit = match.unit || next.unit;
            if (!Number(it.unit_price)) next.unit_price = match.last_price || 0;
            if (!it.category && match.last_category) next.category = match.last_category;
          }
        }
        return next;
      })
    );
  const addRow = () => {
    setItems((prev) => [...prev, emptyItem()]);
    // focus the new row's category input on next tick
    setTimeout(() => {
      const nextIdx = items.length; // will be the new last index
      const el = document.querySelector(`[data-testid="item-category-${nextIdx}"]`);
      if (el) el.focus();
    }, 30);
  };
  const removeRow = (i) => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const onRowKeyDown = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // New order: category → item-name → qty → price → item-so
    const order = ["item-category", "item-name", "item-qty", "item-price", "item-so"];
    const curIdx = order.indexOf(field);
    if (curIdx < 0) return;
    if (curIdx < order.length - 1) {
      const next = order[curIdx + 1];
      const el = document.querySelector(`[data-testid="${next}-${i}"]`);
      if (el) el.focus();
    } else {
      // Last field (item-so) — if this is the last row, add new. Else, focus first field of next row.
      if (i === items.length - 1) {
        // Only add row if current row has an item_name (avoid empty rows)
        if (items[i].item_name && items[i].item_name.trim()) {
          addRow();
        }
      } else {
        const el = document.querySelector(`[data-testid="item-category-${i + 1}"]`);
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
          plan_delivery_date: header.plan_delivery_date || null,
          receive_date: header.receive_date || null,
          category: (it.category || "").trim() || "Uncategorized",
          item_name: it.item_name.trim(),
          qty: Number(it.qty) || 0,
          unit: it.unit || "Ea",
          unit_price: Number(it.unit_price) || 0,
          total_price: (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
          currency,
          exchange_rate: rate,
          notes: (header.notes?.trim() ? `${header.notes.trim()}${it.notes ? " · " + it.notes : ""}` : (it.notes || "")),
          post_to_store: !!it.post_to_store,
          should_stock: !!it.should_stock,
          consumable_request_id: it.consumable_request_id || null,
          consumable_request_item_id: it.consumable_request_item_id || null,
          bom_item_ref: it.bom_item_ref || null,
          linked_receipt_id: it.linked_receipt_id || null,
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
        notes: "",
      });
      setItems([emptyItem()]);
      // Refresh master lists so newly-added names show up in autocomplete
      api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
      api.get("/master/categories").then((r) => setCategories(r.data || [])).catch(() => {});
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
        category: "Uncategorized",
        item_name: it.item_name || "",
        qty: it.qty || 1,
        unit: it.unit || "Ea",
        unit_price: it.unit_price || 0,
        notes: "",
        post_to_store: false,
        should_stock: true,
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
    <form onSubmit={onSubmit} className="space-y-2" data-testid="input-transaction-form">
      <BackLink />
      {/* ===== Title + Toolbar ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Input Transaksi Pembelian
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Isi header sekali, lalu tambah item ke bawah. Tekan <kbd className="px-1 py-0.5 border border-slate-300 bg-slate-50 text-slate-700 text-[10px] rounded">Enter</kbd> untuk lompat kolom; Enter di kolom terakhir menambah baris.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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
            {parsing ? "Membaca PO..." : "Auto-Read PO"}
          </Button>
          <Button
            type="button"
            data-testid="input-cgr-picker-btn"
            onClick={async () => {
              try {
                const { data } = await api.get("/consumable-requests/open-items");
                setCgrOpenItems(data || []);
                setShowCgrPicker(true);
              } catch { toast.error("Gagal muat consumable request"); }
            }}
            variant="outline"
            size="sm"
            className="rounded-none h-8 border-teal-300 text-teal-700 hover:bg-teal-50 text-xs uppercase tracking-[0.1em] font-semibold"
          >
            <ClipboardText size={14} weight="bold" className="mr-1.5" />
            Consumable
          </Button>
          <Button
            type="button"
            data-testid="input-bom-picker-btn"
            onClick={async () => {
              try {
                const { data } = await api.get("/bom/purchase/open-items", { params: { limit: 500 } });
                setBomOpenItems(data || []);
                setShowBomPicker(true);
              } catch { toast.error("Gagal muat item BOM"); }
            }}
            variant="outline"
            size="sm"
            className="rounded-none h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs uppercase tracking-[0.1em] font-semibold"
          >
            <ClipboardText size={14} weight="bold" className="mr-1.5" />
            BOM
          </Button>
          <Button
            type="button"
            data-testid="input-do-picker-btn"
            onClick={async () => {
              try {
                const { data } = await api.get("/store/receipts/pending-po");
                setPendingReceipts(data || []);
                setShowDoPicker(true);
              } catch { toast.error("Gagal muat DO belum PO"); }
            }}
            variant="outline"
            size="sm"
            className="rounded-none h-8 border-amber-300 text-amber-700 hover:bg-amber-50 text-xs uppercase tracking-[0.1em] font-semibold"
          >
            <Truck size={14} weight="bold" className="mr-1.5" />
            DO Belum PO
          </Button>
        </div>
      </div>

      {/* ===== PO Header — 2 kolom ala Accurate ===== */}
      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* KIRI — Vendor */}
          <div className="p-3 lg:border-r border-slate-200 space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Vendor / Supplier</h3>
            <div>
              <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Nama Toko / Vendor *</Label>
              <Input data-testid="input-vendor" required list="vendors-list" autoComplete="off" className={`${inputCls} h-8`} value={header.vendor_name} onChange={(e) => setH("vendor_name", e.target.value)} onKeyDown={(e) => tryAutocomplete(e, vendors, (v) => setH("vendor_name", v))} placeholder="mis. Wiratama Sukses, PT" />
            </div>
          </div>

          {/* KANAN — Info Dokumen PO / Invoice / Mata Uang */}
          <div className="p-3 bg-slate-50/60 space-y-1.5">
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">Info Dokumen & Mata Uang</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-1.5">
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Nomor PO</Label>
                <Input data-testid="input-po-no" className={inputCls} value={header.po_no} onChange={(e) => setH("po_no", e.target.value)} placeholder="mis. 9488" />
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Tanggal PO</Label>
                <Input type="date" data-testid="input-po-date" className={inputCls} value={header.po_date} onChange={(e) => setH("po_date", e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Nomor Invoice</Label>
                <Input data-testid="input-invoice-no" className={inputCls} value={header.invoice_no} onChange={(e) => setH("invoice_no", e.target.value)} placeholder="mis. 00123/MM/GOGO/01/2026" />
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Tanggal Invoice *</Label>
                <Input type="date" data-testid="input-invoice-date" required className={inputCls} value={header.invoice_date} onChange={(e) => setH("invoice_date", e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Tanggal Terima</Label>
                <Input type="date" data-testid="input-receive-date" className={inputCls} value={header.receive_date} onChange={(e) => setH("receive_date", e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Plan Delivery <span className="text-slate-400 font-normal normal-case">(estimasi)</span></Label>
                <Input type="date" data-testid="input-plan-delivery-date" className={inputCls} value={header.plan_delivery_date || ""} onChange={(e) => setH("plan_delivery_date", e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">Mata Uang *</Label>
                <select
                  data-testid="input-currency"
                  value={header.currency}
                  onChange={(e) => setH("currency", e.target.value)}
                  className="h-7 w-full border border-slate-300 rounded-none px-2 text-[12px] bg-white focus:ring-2 focus:ring-sky-600 focus:outline-none"
                >
                  {CURRENCIES.map((c) => (<option key={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <Label className="text-[11px] font-medium text-slate-600 mb-0.5 block">
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
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200">
          <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Item Barang</h3>
          <Button type="button" data-testid="add-item-btn" onClick={addRow} variant="outline" size="sm" className="rounded-none h-7 border-slate-300 text-[11px] uppercase tracking-[0.1em] font-semibold">
            <Plus size={13} weight="bold" className="mr-1" /> Tambah Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:px-2 [&_th]:py-1">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-600">
                <th className="text-left w-8">#</th>
                <th className="text-left w-36">Item <span className="text-slate-400 normal-case tracking-normal font-normal">(Kategori)</span></th>
                <th className="text-left min-w-[220px]">Description <span className="text-slate-400 normal-case tracking-normal font-normal">(Nama Barang)</span></th>
                <th className="text-right w-20">Qty</th>
                <th className="text-left w-24">Unit</th>
                <th className="text-right w-32">Unit Price</th>
                <th className="text-right w-32">Total</th>
                <th className="text-left w-28">Nomor SO</th>
                <th className="text-center w-32" title="Tentukan tujuan barang: tidak ke Store, masuk stok gudang, atau hanya log Incoming Good">Ke Store</th>
                <th className="text-center w-10"></th>
              </tr>
            </thead>
            <tbody data-testid="items-table">
              {items.map((it, i) => {
                const total = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-sky-50/40">
                    <td className="text-slate-400 tabular-nums text-center">{i + 1}</td>
                    <td>
                      <Input data-testid={`item-category-${i}`} list="categories-list" autoComplete="off" className={inputCls} value={it.category} onChange={(e) => setItem(i, "category", e.target.value)} onKeyDown={(e) => { if (tryAutocomplete(e, categories, (v) => setItem(i, "category", v))) return; onRowKeyDown(e, i, "item-category"); }} placeholder="Direct Material" />
                    </td>
                    <td>
                      <Input data-testid={`item-name-${i}`} list="items-list" autoComplete="off" className={inputCls} value={it.item_name} onChange={(e) => setItem(i, "item_name", e.target.value)} onKeyDown={(e) => { if (tryAutocomplete(e, itemsMaster.map((x) => x.item_name), (v) => setItem(i, "item_name", v))) return; onRowKeyDown(e, i, "item-name"); }} placeholder="mis. NUT BAUT M14 X 2.0" />
                    </td>
                    <td>
                      <Input data-testid={`item-qty-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "item-qty")} />
                    </td>
                    <td>
                      <select
                        data-testid={`item-unit-${i}`}
                        value={it.unit}
                        onChange={(e) => setItem(i, "unit", e.target.value)}
                        className={rowSelectCls}
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Input data-testid={`item-price-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "item-price")} />
                    </td>
                    <td className="text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap" data-testid={`item-total-${i}`}>
                      {currSymbol} {total.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </td>
                    <td>
                      <Input data-testid={`item-so-${i}`} list="so-list" autoComplete="off" className={inputCls} value={it.project_no} onChange={(e) => setItem(i, "project_no", e.target.value)} onKeyDown={(e) => { if (tryAutocomplete(e, sos.map((s) => s.so_no), (v) => setItem(i, "project_no", v))) return; onRowKeyDown(e, i, "item-so"); }} placeholder="4413" />
                    </td>
                    <td className="text-center">
                      <select
                        data-testid={`item-store-mode-${i}`}
                        className="h-7 w-full border border-slate-300 rounded-none px-1 text-[11px] bg-white focus:ring-2 focus:ring-sky-600 focus:outline-none font-semibold uppercase tracking-[0.03em]"
                        value={!it.post_to_store ? "none" : (it.should_stock ? "stock" : "log")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "none") { setItem(i, "post_to_store", false); setItem(i, "should_stock", true); }
                          else if (v === "stock") { setItem(i, "post_to_store", true); setItem(i, "should_stock", true); }
                          else if (v === "log") { setItem(i, "post_to_store", true); setItem(i, "should_stock", false); }
                        }}
                        title="Tidak = tidak ke Store · Masuk Stok = ke stok gudang · Log Only = tercatat di Incoming Good tanpa masuk stok"
                      >
                        <option value="none">— Tidak</option>
                        <option value="stock">✓ Masuk Stok</option>
                        <option value="log">✎ Log Only</option>
                      </select>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        data-testid={`remove-item-${i}`}
                        onClick={() => removeRow(i)}
                        disabled={items.length === 1}
                        className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash size={14} weight="bold" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ===== Footer ala Accurate: Catatan (kiri) + Grand Total (kanan) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <Card className="rounded-none border-slate-200 shadow-none p-2.5 bg-white lg:col-span-2">
          <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500 block mb-1">
            Catatan Transaksi <span className="normal-case font-normal text-slate-400">(opsional — berlaku untuk semua item pembelian ini)</span>
          </label>
          <textarea
            data-testid="input-transaction-notes"
            className="w-full min-h-[52px] border border-slate-300 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600 text-[12px] px-2.5 py-1.5 rounded-none"
            value={header.notes || ""}
            onChange={(e) => setH("notes", e.target.value)}
            placeholder="Catatan tambahan untuk transaksi ini (contoh: barang urgent, pengiriman split, dsb.)"
          />
        </Card>
        <div className="border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2 border-b-2 border-slate-900 bg-slate-50">
            <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-slate-600">Grand Total ({header.currency})</span>
            <span className="text-base font-bold tabular-nums text-slate-900" data-testid="grand-total" style={{ fontFamily: "Chivo, sans-serif" }}>
              {currSymbol} {grandTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
            </span>
          </div>
          {header.currency !== "IDR" && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-white">
              <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-500">≈ IDR (rate {Number(header.exchange_rate).toLocaleString("id-ID")})</span>
              <span className="text-[12px] font-semibold tabular-nums text-sky-700" data-testid="grand-total-idr">Rp {grandTotalIDR.toLocaleString("id-ID", { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-white border-t border-slate-200 px-4 py-2.5 -mx-6">
        <button type="button" onClick={scrollTop} className="text-[11px] text-slate-500 hover:text-slate-900 uppercase tracking-[0.1em] font-semibold flex items-center gap-1">
          <ArrowUp size={13} weight="bold" /> Kembali ke atas
        </button>
        <Button
          type="submit"
          data-testid="submit-transaction-btn"
          disabled={submitting}
          className="h-9 rounded-none bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase tracking-[0.1em] text-[11px] px-7 active:scale-[0.98]"
        >
          <FloppyDisk size={15} weight="bold" className="mr-2" />
          {submitting ? "Menyimpan..." : "Simpan Transaksi"}
        </Button>
      </div>

      {/* Autocomplete data sources (HTML5 datalist) */}
      <datalist id="vendors-list">
        {vendors.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="categories-list">
        {categories.map((c) => (
          <option key={c} value={c} />
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

      {showCgrPicker && (
        <ConsumableRequestPicker
          openItems={cgrOpenItems}
          usedIds={new Set(items.filter((it) => it.consumable_request_item_id).map((it) => it.consumable_request_item_id))}
          onClose={() => setShowCgrPicker(false)}
          onPick={(picked) => {
            // Append picked items as new item rows (pre-filled). Preserve link fields.
            setItems((prev) => {
              const firstEmpty = prev.length === 1 && !prev[0].item_name && !prev[0].qty && Number(prev[0].qty) <= 0 && !prev[0].consumable_request_item_id;
              const newItems = picked.map((p) => ({
                ...emptyItem(),
                project_no: p.so || "",
                item_name: p.description || "",
                qty: Number(p.qty) || 1,
                unit: p.unit || "Ea",
                notes: p.remarks || "",
                consumable_request_id: p.request_id,
                consumable_request_item_id: p.item_id,
              }));
              return firstEmpty ? newItems : [...prev, ...newItems];
            });
            setShowCgrPicker(false);
            toast.success(`${picked.length} item dari Consumable Request ditarik ke form — silakan sesuaikan nama supplier & harga`);
          }}
        />
      )}

      {showBomPicker && (
        <BomItemPicker
          openItems={bomOpenItems}
          usedRefs={new Set(items.filter((it) => it.bom_item_ref).map((it) => `${it.bom_item_ref?.bom_id}-${it.bom_item_ref?.item_no}`))}
          onClose={() => setShowBomPicker(false)}
          onPick={(picked) => {
            setItems((prev) => {
              const firstEmpty = prev.length === 1 && !prev[0].item_name && Number(prev[0].qty || 0) <= 0 && !prev[0].bom_item_ref;
              const newItems = picked.map((p) => ({
                ...emptyItem(),
                project_no: p.so_no || "",
                item_name: p.item_name || "",
                qty: p.remaining || 1,
                unit: p.unit || "",
                notes: p.item_specification ? `${p.material || ""} ${p.item_specification}`.trim() : "",
                bom_item_ref: { bom_id: p.bom_id, item_no: p.item_no },
              }));
              return firstEmpty ? newItems : [...prev, ...newItems];
            });
            setShowBomPicker(false);
            toast.success(`${picked.length} item BOM ditarik ke form — sesuaikan vendor & harga`);
          }}
        />
      )}

      {showDoPicker && (
        <DOPendingPicker
          receipts={pendingReceipts}
          usedIds={new Set(items.filter((it) => it.linked_receipt_id).map((it) => it.linked_receipt_id))}
          onClose={() => setShowDoPicker(false)}
          onPick={(picked, autoFillHeader) => {
            // Auto-fill header vendor if user chose to (only when all picked = same vendor & header empty)
            if (autoFillHeader && !header.vendor_name && picked.length > 0) {
              const v = picked[0].vendor_name;
              if (picked.every((p) => p.vendor_name === v)) setH("vendor_name", v);
            }
            setItems((prev) => {
              const firstEmpty = prev.length === 1 && !prev[0].item_name && !prev[0].qty && Number(prev[0].qty) <= 0 && !prev[0].linked_receipt_id;
              const newItems = picked.map((r) => ({
                ...emptyItem(),
                project_no: r.so_no || "",
                item_name: r.item_name || "",
                qty: Number(r.qty_received) || 1,
                unit: r.unit || "Ea",
                notes: r.note || (r.do_number ? `DO ${r.do_number}` : ""),
                linked_receipt_id: r.id,
              }));
              return firstEmpty ? newItems : [...prev, ...newItems];
            });
            setShowDoPicker(false);
            toast.success(`${picked.length} item DO ditarik — isi harga & simpan untuk close-out PO`);
          }}
        />
      )}
    </form>
  );
}


function DOPendingPicker({ receipts, usedIds, onClose, onPick }) {
  const [selected, setSelected] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");

  const vendors = React.useMemo(() => Array.from(new Set(receipts.map((r) => r.vendor_name).filter(Boolean))).sort(), [receipts]);

  const filtered = receipts.filter((r) => {
    if (usedIds.has(r.id)) return false;
    if (vendorFilter && r.vendor_name !== vendorFilter) return false;
    if (!q.trim()) return true;
    const k = q.toLowerCase();
    return (r.item_name || "").toLowerCase().includes(k)
      || (r.vendor_name || "").toLowerCase().includes(k)
      || (r.do_number || "").toLowerCase().includes(k)
      || (r.so_no || "").toLowerCase().includes(k);
  });

  const toggle = (id) => setSelected((s) => {
    const nx = new Set(s);
    if (nx.has(id)) nx.delete(id); else nx.add(id);
    return nx;
  });

  const toggleAll = () => {
    if (filtered.length && filtered.every((it) => selected.has(it.id))) setSelected(new Set());
    else setSelected(new Set(filtered.map((it) => it.id)));
  };

  const pick = (autoFillHeader) => {
    const picked = receipts.filter((r) => selected.has(r.id));
    if (picked.length === 0) return;
    onPick(picked, autoFillHeader);
  };

  const uniqueVendorInSelection = React.useMemo(() => {
    const picked = receipts.filter((r) => selected.has(r.id));
    if (picked.length === 0) return null;
    const v = picked[0].vendor_name;
    return picked.every((p) => p.vendor_name === v) ? v : null;
  }, [selected, receipts]);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="do-picker-modal">
      <div className="bg-white w-full max-w-5xl max-h-[85vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-amber-50">
          <div>
            <div className="text-sm font-bold text-amber-900">Tarik DO Belum PO (Barang Sudah Diterima)</div>
            <div className="text-[11px] text-amber-800">DO yang barangnya sudah masuk Store tapi belum di-close dengan PO. Pilih → save transaksi = otomatis update PO & Invoice di Incoming Report.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" data-testid="do-picker-close" type="button"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <Input data-testid="do-picker-search" className="h-9 rounded-none text-sm flex-1 min-w-[200px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari item / vendor / DO / SO..." />
          <select data-testid="do-picker-vendor-filter" className="h-9 rounded-none border border-slate-300 px-2 text-sm min-w-[160px]" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
            <option value="">Semua Vendor</option>
            {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <Button variant="outline" size="sm" type="button" onClick={toggleAll} className="rounded-none h-9 text-xs">
            {filtered.every((it) => selected.has(it.id)) && filtered.length > 0 ? "Uncheck All" : "Check All"}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="p-2 w-10 text-center"></th>
                <th className="p-2 text-left">Tgl Terima</th>
                <th className="p-2 text-left">Vendor</th>
                <th className="p-2 text-left">Barang</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">DO</th>
                <th className="p-2 text-left">SO</th>
                <th className="p-2 text-left">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-slate-400 italic">Tidak ada DO belum PO.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 hover:bg-amber-50 cursor-pointer ${selected.has(r.id) ? "bg-amber-50/60" : ""}`} onClick={() => toggle(r.id)} data-testid={`do-picker-row-${r.id}`}>
                  <td className="p-2 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-amber-600" checked={selected.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="p-2 whitespace-nowrap text-slate-600">{formatDateID(r.receive_date)}</td>
                  <td className="p-2 font-semibold text-slate-800">{r.vendor_name}</td>
                  <td className="p-2 text-slate-900">{r.item_name}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{r.qty_received}</td>
                  <td className="p-2 text-slate-500 uppercase">{r.unit}</td>
                  <td className="p-2 font-mono text-xs text-slate-600">{r.do_number || "-"}</td>
                  <td className="p-2 font-mono text-xs text-emerald-700">{r.so_no || "-"}</td>
                  <td className="p-2 text-xs text-slate-500">{r.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-slate-600">
            <b>{selected.size}</b> DO dipilih dari <b>{filtered.length}</b> tersedia
            {uniqueVendorInSelection && <span className="ml-2 px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 font-semibold">Vendor: {uniqueVendorInSelection}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onClose} className="rounded-none h-9">Batal</Button>
            <Button data-testid="do-picker-apply" type="button" onClick={() => pick(true)} disabled={selected.size === 0} className="rounded-none h-9 bg-amber-600 hover:bg-amber-700 text-white">Tarik ke Form ({selected.size})</Button>
          </div>
        </div>
      </div>
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
    if (filtered.length && filtered.every((it) => selected.has(it.item_id))) setSelected(new Set());
    else setSelected(new Set(filtered.map((it) => it.item_id)));
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
            <div className="text-[11px] text-teal-800">Pilih item mana yang mau dibeli — akan di-append ke form Input Transaksi. Nama supplier & harga bisa disesuaikan.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" data-testid="cgr-picker-close" type="button"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2">
          <Input data-testid="cgr-picker-search" className="h-9 rounded-none text-sm flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari item / SO / request by..." />
          <Button variant="outline" size="sm" type="button" onClick={toggleAll} className="rounded-none h-9 text-xs">
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
            <Button variant="outline" type="button" onClick={onClose} className="rounded-none h-9">Batal</Button>
            <Button data-testid="cgr-picker-apply" type="button" onClick={pick} disabled={selected.size === 0} className="rounded-none h-9 bg-teal-600 hover:bg-teal-700 text-white">Tarik ke Form ({selected.size})</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============ BOM ITEM PICKER (Tarik dari BOM) ============
function BomItemPicker({ openItems, usedRefs, onClose, onPick }) {
  const [selected, setSelected] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [soFilter, setSoFilter] = useState("");

  const rowKey = (it) => `${it.bom_id}-${it.item_no}`;
  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    const so = soFilter.trim().toLowerCase();
    return (openItems || []).filter((it) => {
      if (so && !(it.so_no || "").toLowerCase().includes(so)) return false;
      if (usedRefs?.has(rowKey(it))) return false;
      if (!qq) return true;
      const blob = `${it.so_no} ${it.item_name} ${it.item_specification} ${it.material} ${it.remark}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [openItems, q, soFilter, usedRefs]);

  const toggle = (k) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const toggleAll = () => {
    const allKeys = filtered.map(rowKey);
    if (allKeys.every((k) => selected.has(k)) && allKeys.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allKeys));
    }
  };

  const pick = () => {
    const chosen = filtered.filter((it) => selected.has(rowKey(it)));
    onPick(chosen);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="bom-picker-modal">
      <div className="bg-white w-full max-w-5xl max-h-[85vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-indigo-50">
          <div>
            <div className="text-sm font-bold text-indigo-900">Tarik Item dari BOM</div>
            <div className="text-[11px] text-indigo-800">Pilih item BOM yang mau dibeli — akan di-append ke form. Qty otomatis = <b>sisa yang belum dibeli</b>. Auto-link ke BOM item saat simpan.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" type="button"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <Input data-testid="bom-picker-search" className="h-9 rounded-none text-sm flex-1 min-w-[220px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari item / spec / material / remark..." />
          <Input className="h-9 rounded-none text-sm w-40" value={soFilter} onChange={(e) => setSoFilter(e.target.value)} placeholder="Filter SO No" />
          <Button variant="outline" size="sm" type="button" onClick={toggleAll} className="rounded-none h-9 text-xs">
            {filtered.every((it) => selected.has(rowKey(it))) && filtered.length > 0 ? "Uncheck All" : "Check All"}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="p-2 w-10 text-center"></th>
                <th className="p-2 text-left">SO No</th>
                <th className="p-2 text-center w-8">#</th>
                <th className="p-2 text-left">Item Name</th>
                <th className="p-2 text-left">Spec</th>
                <th className="p-2 text-left">Material</th>
                <th className="p-2 text-right">Qty BOM</th>
                <th className="p-2 text-right">Dibeli</th>
                <th className="p-2 text-right">Sisa</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-slate-400 italic">Tidak ada item BOM yang belum dibeli.</td></tr>
              )}
              {filtered.map((it) => {
                const k = rowKey(it);
                return (
                  <tr key={k} className={`border-b border-slate-100 hover:bg-indigo-50 cursor-pointer ${selected.has(k) ? "bg-indigo-50/60" : ""}`} onClick={() => toggle(k)} data-testid={`bom-picker-row-${k}`}>
                    <td className="p-2 text-center">
                      <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={selected.has(k)} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="p-2 font-mono font-semibold text-slate-900">{it.so_no}</td>
                    <td className="p-2 text-center text-slate-400">{it.item_no}</td>
                    <td className="p-2 text-slate-900">{it.item_name}</td>
                    <td className="p-2 text-xs text-slate-600">{it.item_specification}</td>
                    <td className="p-2 text-xs text-slate-600">{it.material}</td>
                    <td className="p-2 text-right tabular-nums">{it.qty}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-700">{it.total_bought || 0}</td>
                    <td className="p-2 text-right tabular-nums font-semibold text-indigo-700">{it.remaining}</td>
                    <td className="p-2 text-slate-500 uppercase text-xs">{it.unit}</td>
                    <td className="p-2">
                      <span className={`text-[10px] px-1.5 py-0.5 font-bold uppercase border ${
                        it.purchase_status === "partial" ? "bg-amber-50 border-amber-300 text-amber-800" :
                        "bg-slate-50 border-slate-300 text-slate-700"
                      }`}>{it.purchase_status === "partial" ? "Sebagian" : "Belum"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-600"><b>{selected.size}</b> item dipilih dari <b>{filtered.length}</b> tersedia</div>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onClose} className="rounded-none h-9">Batal</Button>
            <Button data-testid="bom-picker-apply" type="button" onClick={pick} disabled={selected.size === 0} className="rounded-none h-9 bg-indigo-600 hover:bg-indigo-700 text-white">Tarik ke Form ({selected.size})</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
