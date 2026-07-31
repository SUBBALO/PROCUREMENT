import React, { useEffect, useState, useMemo } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Plus, Trash, FloppyDisk, Factory } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const emptyRow = () => ({ item_name: "", qty: "", so_number: "", note: "" });

export default function StoreProductionIssuePage() {
  const [header, setHeader] = useState({ issue_date: today(), taker_name: "" });
  const [rows, setRows] = useState([emptyRow()]);
  const [stock, setStock] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/store/stock", { params: { customer_only: true } })
      .then((r) => setStock(r.data || []))
      .catch(() => toast.error("Gagal memuat stok customer"));
  }, []);

  const stockIndex = useMemo(() => {
    const m = new Map();
    for (const s of stock) m.set(s.item_name, s);
    return m;
  }, [stock]);

  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { ...emptyRow(), so_number: last?.so_number || "" }];
    });
    setTimeout(() => document.querySelector(`[data-testid="pi-item-${rows.length}"]`)?.focus(), 30);
  };
  const removeRow = (i) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const onKey = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = ["pi-item", "pi-qty", "pi-so"];
    const idx = order.indexOf(field);
    if (idx < order.length - 1) {
      document.querySelector(`[data-testid="${order[idx + 1]}-${i}"]`)?.focus();
    } else if (i === rows.length - 1) {
      if (rows[i].item_name && rows[i].qty) addRow();
    } else {
      document.querySelector(`[data-testid="pi-item-${i + 1}"]`)?.focus();
    }
  };

  const validRows = rows.filter((r) => r.item_name && Number(r.qty) > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!header.taker_name.trim()) return toast.error("Nama penerima produksi wajib");
    if (validRows.length === 0) return toast.error("Minimal 1 item");
    for (const r of validRows) {
      const s = stockIndex.get(r.item_name);
      if (!s) return toast.error(`${r.item_name}: bukan stok Customer / tidak tersedia`);
      if (Number(r.qty) > s.qty) return toast.error(`${r.item_name}: qty > stok (${s.qty})`);
    }
    setSaving(true);
    try {
      await api.post("/store/issue/production", {
        issue_date: header.issue_date,
        taker_name: header.taker_name.trim(),
        items: validRows.map((r) => ({
          item_name: r.item_name, qty: Number(r.qty),
          so_number: r.so_number || "", note: r.note || "",
        })),
      });
      toast.success(`${validRows.length} item dikirim ke produksi`);
      setRows([emptyRow()]);
      const { data } = await api.get("/store/stock", { params: { customer_only: true } });
      setStock(data || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
          <Factory size={28} weight="duotone" className="text-purple-600" /> Pengeluaran ke Produksi
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Khusus <b>material Customer</b> yang dikirim ke produksi. Tekan <kbd className="px-1.5 py-0.5 border border-slate-300 bg-slate-50 text-slate-700 text-[10px] rounded">Enter</kbd> untuk lompat kolom / tambah baris.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal *</Label>
              <Input type="date" className={inputCls} value={header.issue_date} onChange={(e) => setHeader({ ...header, issue_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Penerima Produksi *</Label>
              <Input data-testid="pi-taker" className={inputCls} value={header.taker_name} onChange={(e) => setHeader({ ...header, taker_name: e.target.value })} placeholder="mis. Bagian Produksi / nama teknisi" />
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-slate-200 shadow-none bg-white">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Material Customer yang Dikirim</h3>
            <Button type="button" onClick={addRow} variant="outline" size="sm" className="rounded-none h-8 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
              <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Baris
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  <th className="text-left p-2 w-10">#</th>
                  <th className="text-left p-2 min-w-[280px]">Nama Material (Customer)</th>
                  <th className="text-right p-2 w-28">Qty</th>
                  <th className="text-left p-2 w-40">Nomor SO</th>
                  <th className="text-left p-2 w-52">Catatan</th>
                  <th className="text-center p-2 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const s = stockIndex.get(r.item_name);
                  const over = s && Number(r.qty) > s.qty;
                  return (
                    <tr key={i} className={over ? "bg-red-50" : "border-b border-slate-100"}>
                      <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="p-2">
                        <Input data-testid={`pi-item-${i}`} list="cust-stock-list" autoComplete="off" className={inputCls} value={r.item_name} onChange={(e) => setRow(i, "item_name", e.target.value)} onKeyDown={(e) => onKey(e, i, "pi-item")} placeholder="Pilih dari stok customer" />
                        {s && <div className="text-[10px] text-purple-700 mt-0.5">Stok Customer: <b>{s.qty} {s.unit}</b> · {(s.vendors || []).join(", ")}</div>}
                        {r.item_name && !s && <div className="text-[10px] text-red-600 mt-0.5">Bukan stok Customer</div>}
                      </td>
                      <td className="p-2">
                        <Input data-testid={`pi-qty-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={r.qty} onChange={(e) => setRow(i, "qty", e.target.value)} onKeyDown={(e) => onKey(e, i, "pi-qty")} />
                      </td>
                      <td className="p-2">
                        <Input data-testid={`pi-so-${i}`} className={inputCls} value={r.so_number} onChange={(e) => setRow(i, "so_number", e.target.value)} onKeyDown={(e) => onKey(e, i, "pi-so")} placeholder="4413" />
                      </td>
                      <td className="p-2"><Input className={inputCls} value={r.note} onChange={(e) => setRow(i, "note", e.target.value)} /></td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1} className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash size={16} weight="bold" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <datalist id="cust-stock-list">
          {stock.map((s) => (<option key={s.item_name} value={s.item_name}>{`Stok: ${s.qty} ${s.unit || ""}`}</option>))}
        </datalist>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || validRows.length === 0} className="h-11 rounded-none bg-purple-700 hover:bg-purple-800 text-white text-xs uppercase tracking-[0.1em] font-semibold px-8">
            <FloppyDisk size={16} weight="bold" className="mr-2" /> Kirim {validRows.length} Item ke Produksi
          </Button>
        </div>
      </form>
    </div>
  );
}
