import React, { useEffect, useState } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Package, ArrowDown, CheckCircle, Lock } from "@phosphor-icons/react";
import { toast } from "sonner";

import BackLink from "../components/BackLink";
const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

export default function StoreReceivePage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState(null); // group selected

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/store/pending/grouped");
      setGroups(data);
    } catch {
      toast.error("Gagal memuat daftar PO");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
            <BackLink />
<div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Terima Barang dari PO Purchasing
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Daftar PO yang menunggu diterima. Klik satu PO untuk isi qty diterima. Isi <b>Nomor Invoice</b> dan <b>Tanggal Terima</b> — nanti otomatis update Master List Purchasing.
        </p>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Tgl PO / Invoice</th>
                <th className="text-left p-3">Nomor PO</th>
                <th className="text-left p-3">Vendor</th>
                <th className="text-right p-3">Item</th>
                <th className="text-right p-3">Total Qty</th>
                <th className="text-right p-3">Sudah Terima</th>
                <th className="text-right p-3">Sisa</th>
                <th className="text-center p-3 w-32">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="po-groups-table">
              {loading && (<tr><td colSpan={8} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && groups.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">
                  <Package size={24} weight="duotone" className="inline-block mr-2 text-slate-300" />
                  Tidak ada PO pending. Semua sudah diterima.
                </td></tr>
              )}
              {groups.map((g) => (
                <tr key={g.group_key} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDlg(g)} data-testid={`po-row-${g.group_key}`}>
                  <td className="p-3 whitespace-nowrap text-slate-600">{formatDateID(g.po_date || g.invoice_date)}</td>
                  <td className="p-3 font-mono text-xs font-semibold text-slate-900">{g.po_no || <span className="text-slate-400">INV: {g.invoice_no}</span>}</td>
                  <td className="p-3">{g.vendor_name}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{g.items.length}</td>
                  <td className="p-3 text-right tabular-nums">{g.total_qty_po}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{g.total_qty_received}</td>
                  <td className="p-3 text-right tabular-nums font-bold text-sky-700">{g.total_qty_remaining}</td>
                  <td className="p-3 text-center">
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setDlg(g); }} className="rounded-none h-8 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
                      <ArrowDown size={12} weight="bold" className="mr-1" /> Terima
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ReceiveDialog group={dlg} onClose={() => setDlg(null)} onSaved={load} />
    </div>
  );
}

function ReceiveDialog({ group, onClose, onSaved }) {
  const [doNo, setDoNo] = useState("");
  const [invNo, setInvNo] = useState("");
  const [date, setDate] = useState(today());
  const [itemInputs, setItemInputs] = useState({}); // { transaction_id: {qty, note} }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setDoNo("");
      setInvNo(group.invoice_no || "");
      setDate(today());
      const init = {};
      // add_to_stock is DERIVED from tx.should_stock on the backend — Store cannot override.
      group.items.forEach((it) => { init[it.transaction_id] = { qty: it.qty_remaining, note: "" }; });
      setItemInputs(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  if (!group) return null;

  const setItemInput = (tx_id, k, v) => setItemInputs((p) => ({ ...p, [tx_id]: { ...p[tx_id], [k]: v } }));

  const validItems = Object.entries(itemInputs)
    .map(([tx_id, v]) => ({ transaction_id: tx_id, qty_received: Number(v.qty) || 0, note: v.note || "" }))
    .filter((x) => x.qty_received > 0);

  const save = async () => {
    if (validItems.length === 0) return toast.error("Isi qty di minimal 1 item");
    for (const v of validItems) {
      const it = group.items.find((x) => x.transaction_id === v.transaction_id);
      if (v.qty_received > it.qty_remaining) return toast.error(`${it.item_name}: qty melebihi sisa (${it.qty_remaining})`);
    }
    setSaving(true);
    try {
      await api.post("/store/receive/bulk", {
        do_number: doNo,
        invoice_no: invNo,
        receive_date: date,
        items: validItems,
      });
      toast.success(`${validItems.length} item berhasil diterima`);
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal terima");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!group} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="receive-dialog">
        <DialogHeader>
          <DialogTitle className="text-lg" style={{ fontFamily: "Chivo, sans-serif" }}>
            Terima Barang — <span className="font-mono">{group.po_no || group.invoice_no}</span>
          </DialogTitle>
          <DialogDescription>
            <div className="mt-2 text-sm space-y-0.5">
              <div><span className="text-slate-500">Vendor:</span> <b>{group.vendor_name}</b></div>
              <div><span className="text-slate-500">Tgl PO/Invoice:</span> {formatDateID(group.po_date || group.invoice_date)}</div>
              <div><span className="text-slate-500">Sisa total:</span> <b className="tabular-nums text-sky-700">{group.total_qty_remaining}</b> dari {group.total_qty_po} qty ({group.items.length} item)</div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Header info once */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Invoice / DO *</Label>
            <Input data-testid="receive-invoice" className={`${inputCls} font-mono`} value={invNo} onChange={(e) => setInvNo(e.target.value)} placeholder="Nomor Invoice atau DO" />
          </div>
          <div className="hidden">
            <Input data-testid="receive-do" value={doNo} onChange={(e) => setDoNo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Terima *</Label>
            <Input data-testid="receive-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {/* Items table */}
        <div className="border-t border-slate-200 pt-3 mt-1">
          <h4 className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500 mb-2">Item dalam PO</h4>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  <th className="text-left p-2">Nama Barang</th>
                  <th className="text-right p-2 w-20">Qty PO</th>
                  <th className="text-right p-2 w-24">Sisa</th>
                  <th className="text-right p-2 w-28">Qty Diterima</th>
                  <th className="text-center p-2 w-28" title="Ditentukan Purchasing di Master List">Masuk Stok</th>
                  <th className="text-left p-2 w-40">Catatan</th>
                </tr>
              </thead>
              <tbody data-testid="dialog-items">
                {group.items.map((it) => {
                  const v = itemInputs[it.transaction_id] || { qty: 0, note: "" };
                  const over = Number(v.qty) > it.qty_remaining;
                  const willStock = it.should_stock !== false; // default true when field absent (legacy)
                  return (
                    <tr key={it.transaction_id} className={`border-b border-slate-100 ${over ? "bg-red-50" : ""}`}>
                      <td className="p-2 text-slate-900 text-sm max-w-[280px]">{it.item_name} <span className="text-[10px] text-slate-400 uppercase tracking-[0.05em]">{it.unit}</span></td>
                      <td className="p-2 text-right tabular-nums text-slate-500">{it.qty_po}</td>
                      <td className="p-2 text-right tabular-nums font-semibold text-sky-700">{it.qty_remaining}</td>
                      <td className="p-2">
                        <Input
                          data-testid={`item-qty-${it.transaction_id}`}
                          type="number" step="any" min="0" max={it.qty_remaining}
                          className={`${inputCls} text-right tabular-nums h-8`}
                          value={v.qty}
                          onChange={(e) => setItemInput(it.transaction_id, "qty", e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center" data-testid={`item-stock-badge-${it.transaction_id}`}>
                        {willStock ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] uppercase tracking-[0.05em] font-bold">
                            <CheckCircle size={10} weight="bold" /> Ya
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-slate-300 bg-slate-50 text-slate-600 text-[10px] uppercase tracking-[0.05em] font-bold">
                            <Lock size={10} weight="bold" /> Log
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <Input
                          data-testid={`item-note-${it.transaction_id}`}
                          className={`${inputCls} h-8`}
                          value={v.note}
                          onChange={(e) => setItemInput(it.transaction_id, "note", e.target.value)}
                          placeholder="Opsional"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Set qty <b>0</b> untuk item yang belum diterima. Kolom <b>Masuk Stok</b> di-set oleh Purchasing/Admin di Master List — Store hanya konfirmasi barang datang.
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 pt-3 mt-1">
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button data-testid="confirm-receive-btn" onClick={save} disabled={saving || validItems.length === 0} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">
            <CheckCircle size={14} weight="bold" className="mr-1.5" />
            {saving ? "Menyimpan..." : `Terima ${validItems.length} Item`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
