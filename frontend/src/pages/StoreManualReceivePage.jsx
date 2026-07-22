import React, { useState, useEffect } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { FloppyDisk, ArrowDown, Users, Truck } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];

export default function ManualReceivePage() {
  const [form, setForm] = useState({
    receive_date: today(),
    source_type: "supplier",
    source_name: "",
    so_no: "", do_no: "", po_no: "",
    item_name: "", qty: "", unit: "Ea",
    mcl_done: false, mif_done: false,
    remark: "",
  });
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const [sos, setSos] = useState([]);

  useEffect(() => {
    api.get("/sales-orders").then((r) => setSos(r.data)).catch(() => {});
    loadRecent();
  }, []);

  const loadRecent = () =>
    api.get("/store/receipts", { params: {} })
      .then((r) => setRecent((r.data || []).filter((x) => x.source === "manual").slice(0, 10)))
      .catch(() => {});

  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.source_name.trim()) return toast.error("Nama Customer/Supplier wajib");
    if (!form.item_name.trim()) return toast.error("Nama Barang wajib");
    if (!(Number(form.qty) > 0)) return toast.error("Qty harus > 0");
    setSaving(true);
    try {
      await api.post("/store/receive/manual", {
        ...form, qty: Number(form.qty), unit_price: 0,
      });
      toast.success("Barang masuk tercatat");
      setForm({
        receive_date: today(), source_type: form.source_type, source_name: "",
        so_no: "", do_no: "", po_no: "",
        item_name: "", qty: "", unit: "Ea",
        mcl_done: false, mif_done: false, remark: "",
      });
      loadRecent();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  const toggleFlag = async (id, field, val) => {
    try {
      await api.patch(`/store/receipts/${id}/flags`, { [field]: val });
      setRecent((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
    } catch { toast.error("Gagal update"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Manual Receiving
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Input manual barang masuk dari <b>Customer</b> (untuk produksi) atau <b>Supplier</b> (kalau Purchasing lupa input transaksi).
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4" data-testid="manual-recv-form">
        <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500 mb-4">Info Sumber</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Terima *</Label>
              <Input type="date" data-testid="mr-date" className={inputCls} value={form.receive_date} onChange={(e) => setF("receive_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sumber *</Label>
              <Select value={form.source_type} onValueChange={(v) => setF("source_type", v)}>
                <SelectTrigger data-testid="mr-source-type" className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Supplier (barang beli)</SelectItem>
                  <SelectItem value="customer">Customer (untuk produksi)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama {form.source_type === "customer" ? "Customer" : "Supplier"} *</Label>
              <Input data-testid="mr-source-name" className={inputCls} value={form.source_name} onChange={(e) => setF("source_name", e.target.value)} placeholder={form.source_type === "customer" ? "mis. PT ABC" : "mis. Toko XYZ"} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO</Label>
              <Input data-testid="mr-so" list="so-list" autoComplete="off" className={inputCls} value={form.so_no} onChange={(e) => setF("so_no", e.target.value)} placeholder="mis. 4413" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor DO</Label>
              <Input data-testid="mr-do" className={inputCls} value={form.do_no} onChange={(e) => setF("do_no", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor PO</Label>
              <Input data-testid="mr-po" className={inputCls} value={form.po_no} onChange={(e) => setF("po_no", e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500 mb-4">Info Barang</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Part / Produk *</Label>
              <Input data-testid="mr-item" className={inputCls} value={form.item_name} onChange={(e) => setF("item_name", e.target.value)} placeholder="mis. Plate SS400 10mm" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Qty *</Label>
              <Input data-testid="mr-qty" type="number" step="any" min="0" className={`${inputCls} text-right tabular-nums`} value={form.qty} onChange={(e) => setF("qty", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Unit</Label>
              <select data-testid="mr-unit" value={form.unit} onChange={(e) => setF("unit", e.target.value)} className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm bg-white">
                {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="md:col-span-4 flex flex-wrap gap-4 pt-2 border-t border-slate-200">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" data-testid="mr-mcl" className="w-4 h-4 accent-emerald-600" checked={form.mcl_done} onChange={(e) => setF("mcl_done", e.target.checked)} />
                <span className="text-slate-700">Sudah buat <b>MCL</b> <span className="text-slate-400">(Material Control Label)</span></span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" data-testid="mr-mif" className="w-4 h-4 accent-emerald-600" checked={form.mif_done} onChange={(e) => setF("mif_done", e.target.checked)} />
                <span className="text-slate-700">Sudah buat <b>MIF</b> <span className="text-slate-400">(Material Issue Form)</span></span>
              </label>
            </div>
            <div className="md:col-span-4">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Remark / Catatan</Label>
              <Input data-testid="mr-remark" className={inputCls} value={form.remark} onChange={(e) => setF("remark", e.target.value)} placeholder="Opsional" />
            </div>
          </div>
        </Card>

        <datalist id="so-list">
          {sos.map((s) => (<option key={s.id} value={s.so_no}>{`${s.customer} — ${s.description}`}</option>))}
        </datalist>

        <div className="flex justify-end">
          <Button type="submit" data-testid="mr-submit" disabled={saving} className="h-11 rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold px-8">
            <FloppyDisk size={16} weight="bold" className="mr-2" /> {saving ? "Menyimpan..." : "Simpan Barang Masuk"}
          </Button>
        </div>
      </form>

      <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
        <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500 mb-4">Manual Receiving Terakhir</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-2">Tgl</th>
                <th className="text-left p-2">Sumber</th>
                <th className="text-left p-2">Barang</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-left p-2">SO / DO</th>
                <th className="text-center p-2">MCL</th>
                <th className="text-center p-2">MIF</th>
              </tr>
            </thead>
            <tbody data-testid="mr-recent">
              {recent.length === 0 && (<tr><td colSpan={7} className="p-4 text-center text-slate-400">Belum ada</td></tr>)}
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-2 whitespace-nowrap text-slate-600">{formatDateID(r.receive_date)}</td>
                  <td className="p-2">
                    <div className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.05em] font-bold px-2 py-0.5 border ${r.is_customer_material ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                      {r.is_customer_material ? <Users size={10} weight="bold" /> : <Truck size={10} weight="bold" />}
                      {r.is_customer_material ? "Customer" : "Supplier"}
                    </div>
                    <div className="text-slate-900 mt-1">{r.vendor_name}</div>
                  </td>
                  <td className="p-2 text-slate-900">{r.item_name}</td>
                  <td className="p-2 text-right tabular-nums">{r.qty_received} <span className="text-slate-400 text-xs">{r.unit}</span></td>
                  <td className="p-2 text-xs font-mono">{r.so_no || "-"} / {r.do_number || "-"}</td>
                  <td className="p-2 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-emerald-600 cursor-pointer" checked={!!r.mcl_done} onChange={(e) => toggleFlag(r.id, "mcl_done", e.target.checked)} />
                  </td>
                  <td className="p-2 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-emerald-600 cursor-pointer" checked={!!r.mif_done} onChange={(e) => toggleFlag(r.id, "mif_done", e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
