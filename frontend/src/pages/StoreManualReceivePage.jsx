import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { FloppyDisk, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { tryAutocomplete } from "../lib/autocomplete";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];

// Default "Masuk stok?" UNCHECKED — user must consciously opt-in.
const emptyItem = () => ({ item_name: "", qty: "", unit: "Ea", so_no: "", add_to_stock: false, remark: "" });

export default function IncomingGoodsPage() {
  const [header, setHeader] = useState({
    receive_date: today(),
    source_type: "supplier",
    source_name: "",
    do_no: "",
    po_no: "",
  });
  const [items, setItems] = useState([emptyItem()]);
  const [sos, setSos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/sales-orders").then((r) => setSos(r.data || [])).catch(() => {});
  }, []);

  const setH = (k, v) => setHeader((s) => ({ ...s, [k]: v }));
  const setItem = (i, k, v) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));

  const addRow = () => {
    setItems((p) => [...p, emptyItem()]);
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="ig-item-${items.length}"]`);
      if (el) el.focus();
    }, 30);
  };
  const removeRow = (i) => setItems((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const onKeyDown = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = ["ig-item", "ig-qty", "ig-so"];
    const cur = order.indexOf(field);
    if (cur < 0) return;
    if (cur < order.length - 1) {
      const el = document.querySelector(`[data-testid="${order[cur + 1]}-${i}"]`);
      if (el) el.focus();
    } else {
      if (i === items.length - 1) {
        if (items[i].item_name.trim()) addRow();
      } else {
        const el = document.querySelector(`[data-testid="ig-item-${i + 1}"]`);
        if (el) el.focus();
      }
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!header.source_name.trim()) return toast.error("Nama Customer/Supplier wajib");
    const valid = items.filter((it) => it.item_name.trim() && Number(it.qty) > 0);
    if (valid.length === 0) return toast.error("Minimal 1 item dengan qty > 0");
    setSaving(true);
    try {
      const payload = {
        receive_date: header.receive_date,
        source_type: header.source_type,
        source_name: header.source_name.trim(),
        do_no: header.do_no || "",
        po_no: header.po_no || "",
        items: valid.map((it) => ({
          item_name: it.item_name.trim(),
          qty: Number(it.qty),
          unit: it.unit || "Ea",
          so_no: it.so_no || "",
          add_to_stock: !!it.add_to_stock,
          unit_price: 0,
          remark: it.remark || "",
        })),
      };
      const { data } = await api.post("/store/incoming", payload);
      toast.success(`${data.received} item tercatat`);
      setHeader({ ...header, source_name: "", do_no: "", po_no: "" });
      setItems([emptyItem()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal simpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Input Incoming Goods
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            2 cara input: <b>Manual</b> (customer/supplier tanpa PO) di bawah, atau{" "}
            <a href="/store/receive" data-testid="link-receive-po" className="text-sky-700 font-semibold underline hover:text-sky-900">
              Tarik dari PO Purchasing →
            </a>
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4" data-testid="incoming-form">
        <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500 mb-4">Info Sumber</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Terima *</Label>
              <Input type="date" data-testid="ig-date" className={inputCls} value={header.receive_date} onChange={(e) => setH("receive_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sumber *</Label>
              <Select value={header.source_type} onValueChange={(v) => setH("source_type", v)}>
                <SelectTrigger data-testid="ig-source-type" className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                Nama {header.source_type === "customer" ? "Customer" : "Supplier"} *
              </Label>
              <Input data-testid="ig-source-name" className={inputCls} value={header.source_name} onChange={(e) => setH("source_name", e.target.value)} placeholder="mis. PT ABC" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor DO</Label>
              <Input data-testid="ig-do" className={inputCls} value={header.do_no} onChange={(e) => setH("do_no", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor PO</Label>
              <Input data-testid="ig-po" className={inputCls} value={header.po_no} onChange={(e) => setH("po_no", e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-slate-200 shadow-none bg-white">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Item Barang</h3>
            <Button type="button" data-testid="ig-add-btn" onClick={addRow} variant="outline" size="sm" className="rounded-none h-8 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
              <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  <th className="text-left p-3 w-10">#</th>
                  <th className="text-left p-3 min-w-[260px]">Nama Part / Produk</th>
                  <th className="text-right p-3 w-24">Qty</th>
                  <th className="text-left p-3 w-24">Unit</th>
                  <th className="text-left p-3 w-32">Nomor SO</th>
                  <th className="text-center p-3 w-28" title="Centang untuk masuk stok store; uncheck jika habis pakai">Masuk Stok?</th>
                  <th className="text-left p-3">Remark</th>
                  <th className="text-center p-3 w-12"></th>
                </tr>
              </thead>
              <tbody data-testid="ig-items">
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="p-2">
                      <Input data-testid={`ig-item-${i}`} className={inputCls} value={it.item_name} onChange={(e) => setItem(i, "item_name", e.target.value)} onKeyDown={(e) => onKeyDown(e, i, "ig-item")} placeholder="mis. Plate SS400 10mm" />
                    </td>
                    <td className="p-2">
                      <Input data-testid={`ig-qty-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} onKeyDown={(e) => onKeyDown(e, i, "ig-qty")} />
                    </td>
                    <td className="p-2">
                      <select data-testid={`ig-unit-${i}`} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm bg-white focus:ring-2 focus:ring-sky-600 focus:outline-none">
                        {UNIT_OPTIONS.map((u) => (<option key={u}>{u}</option>))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Input data-testid={`ig-so-${i}`} list="ig-so-list" autoComplete="off" className={inputCls} value={it.so_no} onChange={(e) => setItem(i, "so_no", e.target.value)} onKeyDown={(e) => { if (tryAutocomplete(e, sos.map((s) => s.so_no), (v) => setItem(i, "so_no", v))) return; onKeyDown(e, i, "ig-so"); }} placeholder="mis. 4413" />
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" data-testid={`ig-stock-${i}`} className="w-4 h-4 accent-emerald-600 cursor-pointer" checked={!!it.add_to_stock} onChange={(e) => setItem(i, "add_to_stock", e.target.checked)} />
                    </td>
                    <td className="p-2">
                      <Input data-testid={`ig-remark-${i}`} className={inputCls} value={it.remark} onChange={(e) => setItem(i, "remark", e.target.value)} placeholder="Opsional" />
                    </td>
                    <td className="p-2 text-center">
                      <button type="button" data-testid={`ig-remove-${i}`} onClick={() => removeRow(i)} disabled={items.length === 1} className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30">
                        <Trash size={16} weight="bold" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <datalist id="ig-so-list">
          {sos.map((s) => (<option key={s.id} value={s.so_no}>{`${s.customer} — ${s.description}`}</option>))}
        </datalist>

        <div className="flex justify-end">
          <Button type="submit" data-testid="ig-submit" disabled={saving} className="h-11 rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold px-8">
            <FloppyDisk size={16} weight="bold" className="mr-2" /> {saving ? "Menyimpan..." : "Simpan Barang Masuk"}
          </Button>
        </div>
      </form>
    </div>
  );
}
