import React, { useEffect, useState, useCallback } from "react";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Plus, Trash, Truck, FloppyDisk, Eye } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const UNITS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box"];
const emptyItem = () => ({ item_name: "", qty: "", unit: "Ea" });

export default function DeliveryPage() {
  const { user } = useAuth();
  const canWrite = user && user.role !== "finance" && (user.role === "admin" || user.role === "store");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState({ q: "", start_date: "", end_date: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filter).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get("/deliveries", { params });
      setData(data);
    } catch { toast.error("Gagal muat"); } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <Truck size={28} weight="duotone" className="text-sky-600" /> Pengiriman Barang
          </h1>
          <p className="text-sm text-slate-500 mt-1">Log pengiriman keluar (Gate Pass / DO). {data.total.toLocaleString("id-ID")} record.</p>
        </div>
        {canWrite && (
          <Button data-testid="add-delivery-btn" onClick={() => setAddOpen(true)} className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
            <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Pengiriman
          </Button>
        )}
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari (tujuan/gatepass/DO/supir)</Label>
            <Input className={inputCls} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tgl</Label>
            <Input type="date" className={inputCls} value={filter.start_date} onChange={(e) => setFilter({ ...filter, start_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tgl</Label>
            <Input type="date" className={inputCls} value={filter.end_date} onChange={(e) => setFilter({ ...filter, end_date: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Tgl</th>
                <th className="text-left p-3">Gatepass</th>
                <th className="text-left p-3">DO</th>
                <th className="text-left p-3">Tujuan</th>
                <th className="text-left p-3">Supir</th>
                <th className="text-right p-3">Items</th>
                <th className="text-center p-3 w-24">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && data.items.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-slate-400">Belum ada pengiriman</td></tr>)}
              {data.items.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap text-slate-600">{formatDateID(d.delivery_date)}</td>
                  <td className="p-3 font-mono text-xs">{d.gate_pass_no || "-"}</td>
                  <td className="p-3 font-mono text-xs">{d.do_no || "-"}</td>
                  <td className="p-3 text-slate-900">{d.destination}</td>
                  <td className="p-3 text-slate-700">{d.driver_name || "-"}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{d.items?.length || 0}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => setDetail(d)} className="p-1.5 text-slate-400 hover:text-sky-600" title="Detail"><Eye size={14} weight="bold" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddDeliveryDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
      <DetailDialog delivery={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function AddDeliveryDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ delivery_date: today(), gate_pass_no: "", do_no: "", destination: "", driver_name: "", remark: "" });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm({ delivery_date: today(), gate_pass_no: "", do_no: "", destination: "", driver_name: "", remark: "" }); setItems([emptyItem()]); } }, [open]);

  const setItem = (i, k, v) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const rmItem = (i) => setItems((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const submit = async () => {
    if (!form.destination.trim()) return toast.error("Tujuan wajib");
    const valid = items.filter((it) => it.item_name && Number(it.qty) > 0);
    if (valid.length === 0) return toast.error("Minimal 1 item");
    setSaving(true);
    try {
      await api.post("/deliveries", { ...form, items: valid.map((it) => ({ ...it, qty: Number(it.qty) })) });
      toast.success("Pengiriman dicatat");
      onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tambah Pengiriman Barang</DialogTitle>
          <DialogDescription>Log pengiriman keluar dari gudang (untuk laporan).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal *</Label><Input type="date" className={inputCls} value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} /></div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Gatepass</Label><Input className={inputCls} value={form.gate_pass_no} onChange={(e) => setForm({ ...form, gate_pass_no: e.target.value })} placeholder="mis. GP-001" /></div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor DO</Label><Input className={inputCls} value={form.do_no} onChange={(e) => setForm({ ...form, do_no: e.target.value })} /></div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Supir</Label><Input className={inputCls} value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></div>
          <div className="md:col-span-2"><Label className="text-xs font-semibold text-slate-600 mb-1 block">Tujuan (Nama PT / Alamat) *</Label><Input data-testid="delivery-dest" className={inputCls} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="mis. PT ABC, Jl. XYZ Batam" /></div>
        </div>
        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">Item</h4>
            <Button type="button" size="sm" variant="outline" onClick={addItem} className="rounded-none h-7 text-xs">+ Tambah</Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-500 border-b border-slate-200">
              <th className="text-left p-1">Nama Barang</th><th className="text-right p-1 w-20">Qty</th><th className="text-left p-1 w-20">Unit</th><th></th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="p-1"><Input className={`${inputCls} h-8`} value={it.item_name} onChange={(e) => setItem(i, "item_name", e.target.value)} /></td>
                  <td className="p-1"><Input type="number" step="any" className={`${inputCls} h-8 text-right`} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} /></td>
                  <td className="p-1"><select className="h-8 border border-slate-300 px-1 text-sm bg-white w-full" value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td className="p-1 text-center"><button type="button" onClick={() => rmItem(i)} disabled={items.length === 1} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash size={14} weight="bold" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Remark</Label>
            <Input className={inputCls} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button data-testid="save-delivery-btn" onClick={submit} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white"><FloppyDisk size={14} weight="bold" className="mr-1.5" />Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ delivery, onClose }) {
  if (!delivery) return null;
  return (
    <Dialog open={!!delivery} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pengiriman — {formatDateID(delivery.delivery_date)}</DialogTitle>
          <DialogDescription>
            <div className="text-sm space-y-0.5 mt-2">
              <div><span className="text-slate-500">Gatepass:</span> <b className="font-mono">{delivery.gate_pass_no || "-"}</b> · <span className="text-slate-500">DO:</span> <b className="font-mono">{delivery.do_no || "-"}</b></div>
              <div><span className="text-slate-500">Tujuan:</span> <b>{delivery.destination}</b></div>
              <div><span className="text-slate-500">Supir:</span> {delivery.driver_name || "-"}</div>
              {delivery.remark && <div><span className="text-slate-500">Remark:</span> {delivery.remark}</div>}
            </div>
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
              <th className="text-left p-2">Nama Barang</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-left p-2">Unit</th>
            </tr>
          </thead>
          <tbody>
            {(delivery.items || []).map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="p-2">{it.item_name}</td>
                <td className="p-2 text-right tabular-nums">{it.qty}</td>
                <td className="p-2">{it.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter><Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
