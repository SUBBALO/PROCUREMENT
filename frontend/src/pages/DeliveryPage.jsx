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
const emptyItem = () => ({ item_name: "", qty: "", unit: "Ea", so_no: "" });

export default function DeliveryPage() {
  const { user } = useAuth();
  const canWrite = user && (user.role === "admin" || user.role === "store");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState({ q: "", start_date: "", end_date: "" });
  const [sos, setSos] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page_size: 200 };
      Object.entries(filter).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get("/deliveries", { params });
      setData(data);
    } catch { toast.error("Gagal muat"); } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/sales-orders").then((r) => setSos(r.data || [])).catch(() => {}); }, []);

  // Client-side SO filter: filter delivery rows where any item has matching so_no
  const filteredItems = data.items.filter((d) => {
    if (!filter.q) return true;
    const q = filter.q.toLowerCase();
    return (
      (d.destination || "").toLowerCase().includes(q) ||
      (d.gate_pass_no || "").toLowerCase().includes(q) ||
      (d.do_no || "").toLowerCase().includes(q) ||
      (d.driver_name || "").toLowerCase().includes(q) ||
      (d.items || []).some((it) => (it.so_no || "").toLowerCase().includes(q) || (it.item_name || "").toLowerCase().includes(q))
    );
  });

  // Flatten to one row per item
  const flatRows = [];
  filteredItems.forEach((d) => {
    (d.items || []).forEach((it, idx) => {
      flatRows.push({ ...d, item: it, is_first: idx === 0, rowspan: d.items.length });
    });
    if (!d.items || d.items.length === 0) {
      flatRows.push({ ...d, item: {}, is_first: true, rowspan: 1 });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <Truck size={28} weight="duotone" className="text-sky-600" /> Pengiriman Barang
          </h1>
          <p className="text-sm text-slate-500 mt-1">Log pengiriman keluar (Gate Pass / DO). {data.total.toLocaleString("id-ID")} pengiriman, {flatRows.length} baris item.</p>
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
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari (tujuan / gatepass / DO / supir / <b>nomor SO</b> / barang)</Label>
            <Input data-testid="delivery-search" className={inputCls} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Ketik untuk cari..." />
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
                <th className="text-left p-3">No Gatepass</th>
                <th className="text-left p-3">Nama Tujuan</th>
                <th className="text-left p-3">Nomor SO</th>
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Supir</th>
                <th className="text-center p-3 w-16">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="delivery-rows">
              {loading && (<tr><td colSpan={8} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && flatRows.length === 0 && (<tr><td colSpan={8} className="p-8 text-center text-slate-400">Belum ada pengiriman</td></tr>)}
              {flatRows.map((r, idx) => (
                <tr key={`${r.id}-${idx}`} className={`border-b border-slate-100 hover:bg-slate-50 ${!r.is_first ? "border-b-slate-50" : ""}`}>
                  {r.is_first ? (
                    <>
                      <td rowSpan={r.rowspan} className="p-3 whitespace-nowrap text-slate-600 align-top border-r border-slate-100">{formatDateID(r.delivery_date)}</td>
                      <td rowSpan={r.rowspan} className="p-3 font-mono text-xs align-top border-r border-slate-100">{r.gate_pass_no || "-"}</td>
                      <td rowSpan={r.rowspan} className="p-3 text-slate-900 align-top border-r border-slate-100">{r.destination}</td>
                    </>
                  ) : null}
                  <td className="p-3 font-mono text-xs text-slate-700">{r.item.so_no || "-"}</td>
                  <td className="p-3 text-slate-900">{r.item.item_name || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{r.item.qty || 0} <span className="text-slate-400 text-xs">{r.item.unit || ""}</span></td>
                  {r.is_first ? (
                    <>
                      <td rowSpan={r.rowspan} className="p-3 text-slate-700 align-top border-l border-slate-100">{r.driver_name || "-"}</td>
                      <td rowSpan={r.rowspan} className="p-3 text-center align-top">
                        <button data-testid={`view-${r.id}`} onClick={() => setDetail(r)} className="p-1.5 text-slate-400 hover:text-sky-600" title="Detail"><Eye size={14} weight="bold" /></button>
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddDeliveryDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} sos={sos} />
      <DetailDialog delivery={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function AddDeliveryDialog({ open, onClose, onSaved, sos }) {
  const [form, setForm] = useState({ delivery_date: today(), gate_pass_no: "", do_no: "", destination: "", driver_name: "", remark: "" });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [auto, setAuto] = useState({ destinations: [], drivers: [] });

  useEffect(() => {
    if (open) {
      setForm({ delivery_date: today(), gate_pass_no: "", do_no: "", destination: "", driver_name: "", remark: "" });
      setItems([emptyItem()]);
      api.get("/deliveries/autocomplete").then((r) => setAuto(r.data || { destinations: [], drivers: [] })).catch(() => {});
    }
  }, [open]);

  const setItem = (i, k, v) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addRow = () => {
    setItems((p) => [...p, emptyItem()]);
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="del-item-${items.length}"]`);
      if (el) el.focus();
    }, 30);
  };
  const removeRow = (i) => setItems((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const onKeyDown = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = ["del-item", "del-qty", "del-so"];
    const cur = order.indexOf(field);
    if (cur < 0) return;
    if (cur < order.length - 1) {
      const el = document.querySelector(`[data-testid="${order[cur + 1]}-${i}"]`);
      if (el) el.focus();
    } else if (i === items.length - 1 && items[i].item_name.trim()) {
      addRow();
    } else if (i < items.length - 1) {
      const el = document.querySelector(`[data-testid="del-item-${i + 1}"]`);
      if (el) el.focus();
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.destination.trim()) return toast.error("Tujuan wajib");
    const valid = items.filter((it) => it.item_name.trim() && Number(it.qty) > 0);
    if (valid.length === 0) return toast.error("Minimal 1 item dgn qty > 0");
    setSaving(true);
    try {
      await api.post("/deliveries", {
        ...form,
        items: valid.map((it) => ({ item_name: it.item_name.trim(), qty: Number(it.qty), unit: it.unit || "Ea", so_no: it.so_no || "" })),
      });
      toast.success("Pengiriman tersimpan");
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none max-w-4xl" data-testid="add-delivery-dialog">
        <DialogHeader>
          <DialogTitle>Tambah Pengiriman Barang</DialogTitle>
          <DialogDescription>Log pengiriman keluar. Multi-item dgn autocomplete Tujuan & Supir dari histori.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal *</Label>
              <Input type="date" data-testid="del-date" className={inputCls} value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Gatepass</Label>
              <Input data-testid="del-gp" className={`${inputCls} font-mono`} value={form.gate_pass_no} onChange={(e) => setForm({ ...form, gate_pass_no: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor DO</Label>
              <Input data-testid="del-do" className={`${inputCls} font-mono`} value={form.do_no} onChange={(e) => setForm({ ...form, do_no: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tujuan / Perusahaan * <span className="text-slate-400 text-[10px] font-normal">(autocomplete)</span></Label>
              <Input data-testid="del-destination" list="del-destinations" autoComplete="off" className={inputCls} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="mis. PT ABC Manufacturing" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Supir <span className="text-slate-400 text-[10px] font-normal">(autocomplete)</span></Label>
              <Input data-testid="del-driver" list="del-drivers" autoComplete="off" className={inputCls} value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} placeholder="mis. Pak Budi" />
            </div>
          </div>

          <datalist id="del-destinations">
            {auto.destinations.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="del-drivers">
            {auto.drivers.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="del-so-list">
            {(sos || []).map((s) => (<option key={s.id} value={s.so_no}>{`${s.customer} — ${s.description || ""}`}</option>))}
          </datalist>

          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">Item Barang</h4>
              <Button type="button" onClick={addRow} variant="outline" size="sm" data-testid="del-add-item" className="rounded-none h-7 border-slate-300 text-[10px] uppercase tracking-[0.1em] font-semibold">
                <Plus size={12} weight="bold" className="mr-1" /> Tambah Item
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                    <th className="text-left p-2 w-8">#</th>
                    <th className="text-left p-2 min-w-[220px]">Nama Barang</th>
                    <th className="text-right p-2 w-24">Qty</th>
                    <th className="text-left p-2 w-24">Unit</th>
                    <th className="text-left p-2 w-32">Nomor SO</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody data-testid="del-items">
                  {items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="p-2">
                        <Input data-testid={`del-item-${i}`} className={inputCls} value={it.item_name} onChange={(e) => setItem(i, "item_name", e.target.value)} onKeyDown={(e) => onKeyDown(e, i, "del-item")} />
                      </td>
                      <td className="p-2">
                        <Input data-testid={`del-qty-${i}`} type="number" step="any" min="0" className={`${inputCls} text-right`} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} onKeyDown={(e) => onKeyDown(e, i, "del-qty")} />
                      </td>
                      <td className="p-2">
                        <select data-testid={`del-unit-${i}`} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm bg-white">
                          {UNITS.map((u) => (<option key={u}>{u}</option>))}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input data-testid={`del-so-${i}`} list="del-so-list" autoComplete="off" className={inputCls} value={it.so_no} onChange={(e) => setItem(i, "so_no", e.target.value)} onKeyDown={(e) => onKeyDown(e, i, "del-so")} placeholder="mis. 4413" />
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => removeRow(i)} disabled={items.length === 1} className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash size={14} weight="bold" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Remark</Label>
            <Input className={inputCls} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="Opsional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
            <Button type="submit" data-testid="del-submit" disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">
              <FloppyDisk size={14} weight="bold" className="mr-1.5" /> {saving ? "Menyimpan..." : "Simpan Pengiriman"}
            </Button>
          </DialogFooter>
        </form>
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
          <DialogTitle>Detail Pengiriman — {delivery.gate_pass_no || delivery.do_no || "-"}</DialogTitle>
          <DialogDescription>{formatDateID(delivery.delivery_date)} → {delivery.destination}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div><b>Supir:</b> {delivery.driver_name || "-"}</div>
          <div><b>DO:</b> {delivery.do_no || "-"} • <b>Gatepass:</b> {delivery.gate_pass_no || "-"}</div>
          <div><b>Remark:</b> {delivery.remark || "-"}</div>
          <div className="border-t border-slate-200 pt-2 mt-2">
            <div className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500 mb-1">Items</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200"><th className="text-left p-1">Barang</th><th className="text-right p-1">Qty</th><th className="text-left p-1">Unit</th><th className="text-left p-1">SO</th></tr>
              </thead>
              <tbody>
                {(delivery.items || []).map((it, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1">{it.item_name}</td>
                    <td className="p-1 text-right tabular-nums">{it.qty}</td>
                    <td className="p-1">{it.unit}</td>
                    <td className="p-1 font-mono">{it.so_no || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
