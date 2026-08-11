import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import {
  Bank, ArrowLeft, Plus, Trash, CircleNotch, MagnifyingGlass, FilePdf, FloppyDisk, ListDashes,
} from "@phosphor-icons/react";

const CURRENCIES = ["IDR", "SGD", "USD"];

const fmt = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Formula (mirror backend): base_idr = amount*rate; pph = taxed? base_idr*pph%/100 : 0; amount_idr = base_idr - pph + fee
const computeLine = (ln) => {
  const amount = Number(ln.amount || 0);
  const rate = Number(ln.rate || 1) || 1;
  const fee = Number(ln.fee || 0);
  const base_idr = amount * rate;
  const pph_amount = ln.taxed ? (base_idr * Number(ln.pph_percent || 0)) / 100 : 0;
  const net_transfer = base_idr - pph_amount + fee;
  return { base_idr, pph_amount, net_transfer };
};

const emptyLine = () => ({
  vendor_name: "", invoice_no: "", description: "", so_no: "", so_customer: "",
  qty: 1, uom: "", currency: "IDR", amount: "", rate: 1, fee: 0,
  taxed: false, pph_percent: "", bank_name: "", account_no: "", account_holder: "",
});

const cellInput = "rounded-none h-8 text-xs border border-slate-200 focus-visible:ring-1 focus-visible:ring-sky-400 w-full";

// ------------------- Vendor Autocomplete (auto-fill bank, editable) -------------------
function VendorInput({ value, onSelectBank, onChange, testid }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!value || value.trim().length < 1) { setOpts([]); return; }
      try {
        const { data } = await api.get("/vendor-banks", { params: { q: value.trim(), limit: 8 } });
        setOpts(data.items || []);
      } catch { setOpts([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <Textarea
        data-testid={testid}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Nama vendor… (mis. SG Galvanizing via PT. Sinar)"
        rows={2}
        className="rounded-none text-xs border border-slate-200 focus-visible:ring-1 focus-visible:ring-sky-400 min-h-[3rem] resize-none w-full"
      />
      {open && opts.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border-2 border-slate-300 shadow-lg max-h-56 overflow-y-auto min-w-[220px]">
          {opts.map((o) => (
            <button
              type="button"
              key={o.id}
              onClick={() => { onSelectBank(o); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b border-slate-100 last:border-0"
            >
              <div className="font-bold text-slate-800">{o.vendor_name}</div>
              <div className="text-slate-500">{o.bank_name} · {o.account_no} {o.currency ? `· ${o.currency}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------- SO Autocomplete (shows SO_NO/CUSTOMER) -------------------
function SoInput({ soNo, soCustomer, onSelect, onChange, testid }) {
  const display = soCustomer ? `${soNo}/${soCustomer}` : (soNo || "");
  const [q, setQ] = useState(display);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => { setQ(soCustomer ? `${soNo}/${soCustomer}` : (soNo || "")); }, [soNo, soCustomer]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim();
      if (!term) { setOpts([]); return; }
      try {
        const { data } = await api.get("/sales-orders/autocomplete", { params: { q: term, limit: 10 } });
        setOpts(data.items || []);
      } catch { setOpts([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <Input
        data-testid={testid}
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="SO…"
        className={cellInput}
      />
      {open && opts.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border-2 border-slate-300 shadow-lg max-h-56 overflow-y-auto min-w-[240px]">
          {opts.map((o, i) => (
            <button
              type="button"
              key={`${o.so_no}-${i}`}
              onClick={() => { onSelect(o.so_no || "", o.customer || ""); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b border-slate-100 last:border-0"
            >
              <div className="font-mono font-bold text-slate-800">{o.so_no}<span className="text-slate-400">/</span><span className="text-slate-600">{o.customer || "-"}</span></div>
              {o.description && <div className="text-slate-400 truncate">{o.description}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------- Create TRF Tab -------------------
function CreateTrf({ onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [nextNo, setNextNo] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNextNo = useCallback(async () => {
    try { const { data } = await api.get("/transfer-requests/next-no"); setNextNo(data.form_no); } catch {}
  }, []);
  useEffect(() => { loadNextNo(); }, [loadNextNo]);

  const grandTotal = lines.reduce((s, l) => s + computeLine(l).net_transfer, 0);

  const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const reset = () => { setLines([emptyLine()]); setNotes(""); setDate(new Date().toISOString().slice(0, 10)); loadNextNo(); };

  const save = async () => {
    const valid = lines.filter((l) => l.vendor_name.trim() && Number(l.amount) > 0);
    if (valid.length === 0) { toast.error("Isi minimal 1 baris dengan vendor & Total Price"); return null; }
    setSaving(true);
    try {
      const payload = {
        date, notes,
        lines: valid.map((l) => ({
          ...l,
          qty: Number(l.qty || 0), amount: Number(l.amount || 0), rate: Number(l.rate || 1),
          fee: Number(l.fee || 0), pph_percent: Number(l.pph_percent || 0),
        })),
      };
      const { data } = await api.post("/transfer-requests", payload);
      toast.success(`TRF ${data.form_no} tersimpan`);
      onSaved && onSaved(data);
      return data;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan TRF");
      return null;
    } finally { setSaving(false); }
  };

  const saveAndPrint = async () => {
    const data = await save();
    if (!data) return;
    try {
      const res = await api.get(`/transfer-requests/${data.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error("Gagal membuka PDF"); }
    reset();
  };

  const th = "px-2 py-2 text-[10px] font-bold uppercase tracking-[0.05em] text-white border-r border-slate-600 last:border-0 whitespace-nowrap";

  return (
    <div className="space-y-4">
      {/* Header form */}
      <Card className="rounded-none border-2 border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">No. Form (otomatis)</Label>
            <div data-testid="trf-next-no" className="h-9 flex items-center px-3 border-2 border-dashed border-slate-300 bg-slate-50 font-mono font-bold text-sky-700">{nextNo || "…"}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Tanggal</Label>
            <Input data-testid="trf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-none h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Ditujukan Kepada</Label>
            <div className="h-9 flex items-center px-3 border-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">Finance</div>
          </div>
        </div>
      </Card>

      {/* Line table */}
      <div className="border-2 border-slate-200 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: "1180px" }}>
          <thead className="bg-slate-800">
            <tr>
              <th className={th} style={{ width: "36px" }}>No</th>
              <th className={th} style={{ width: "200px" }}>Vendor Name</th>
              <th className={th} style={{ width: "240px" }}>Description</th>
              <th className={th} style={{ width: "150px" }}>SO</th>
              <th className={th} style={{ width: "60px" }}>Qty</th>
              <th className={th} style={{ width: "70px" }}>UoM</th>
              <th className={th} style={{ width: "170px" }}>Total Price</th>
              <th className={th} style={{ width: "110px" }}>Rate</th>
              <th className={th} style={{ width: "120px" }}>PPh</th>
              <th className={th} style={{ width: "110px" }}>Fee (IDR)</th>
              <th className={th} style={{ width: "150px" }}>Amount (IDR)</th>
              <th className={th} style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const c = computeLine(l);
              const isForeign = l.currency !== "IDR";
              return (
                <React.Fragment key={i}>
                  <tr className="border-t border-slate-200 align-top" data-testid={`trf-line-${i}`}>
                    <td className="px-2 py-2 text-center text-xs font-bold text-slate-600 border-r border-slate-100">{i + 1}</td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <VendorInput
                        testid={`trf-vendor-${i}`}
                        value={l.vendor_name}
                        onChange={(v) => setLine(i, { vendor_name: v })}
                        onSelectBank={(o) => setLine(i, {
                          vendor_name: o.vendor_name, bank_name: o.bank_name || "", account_no: o.account_no || "",
                          account_holder: o.account_holder || "", currency: o.currency || l.currency,
                        })}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <Input data-testid={`trf-desc-${i}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={cellInput} placeholder="Deskripsi barang/jasa" />
                      <Input data-testid={`trf-invoice-${i}`} value={l.invoice_no} onChange={(e) => setLine(i, { invoice_no: e.target.value })}
                        className="rounded-none h-8 text-xs border border-slate-200 mt-1 text-red-600 placeholder:text-red-300 focus-visible:ring-1 focus-visible:ring-sky-400 w-full" placeholder="Invoice No." />
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <SoInput testid={`trf-so-${i}`} soNo={l.so_no} soCustomer={l.so_customer}
                        onChange={(v) => setLine(i, { so_no: v, so_customer: "" })}
                        onSelect={(so, cust) => setLine(i, { so_no: so, so_customer: cust })} />
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <Input data-testid={`trf-qty-${i}`} type="number" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className={`${cellInput} text-right`} />
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <Input data-testid={`trf-uom-${i}`} value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value })} className={cellInput} placeholder="Lot" />
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <div className="flex gap-1">
                        <Select value={l.currency} onValueChange={(v) => setLine(i, { currency: v, rate: v === "IDR" ? 1 : l.rate })}>
                          <SelectTrigger data-testid={`trf-currency-${i}`} className="rounded-none h-8 text-xs w-[64px] px-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid={`trf-amount-${i}`} type="number" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} className={`${cellInput} text-right`} placeholder="0" />
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <Input data-testid={`trf-rate-${i}`} type="number" value={l.rate} disabled={!isForeign} onChange={(e) => setLine(i, { rate: e.target.value })} className={`${cellInput} text-right disabled:bg-slate-100`} placeholder="1" />
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <div className="flex items-center gap-1">
                        <Switch data-testid={`trf-tax-${i}`} checked={l.taxed} onCheckedChange={(v) => setLine(i, { taxed: v })} className="scale-90" />
                        <Input data-testid={`trf-pph-${i}`} type="number" value={l.pph_percent} disabled={!l.taxed} onChange={(e) => setLine(i, { pph_percent: e.target.value })} className={`${cellInput} text-right disabled:bg-slate-100`} placeholder="%" />
                      </div>
                      {l.taxed && <div className="text-[10px] text-red-600 text-right mt-0.5 font-mono">-{fmt(c.pph_amount)}</div>}
                    </td>
                    <td className="px-1.5 py-1.5 border-r border-slate-100">
                      <Input data-testid={`trf-fee-${i}`} type="number" value={l.fee} onChange={(e) => setLine(i, { fee: e.target.value })} className={`${cellInput} text-right`} placeholder="0" />
                    </td>
                    <td className="px-2 py-2 text-right border-r border-slate-100">
                      <span data-testid={`trf-net-${i}`} className="font-mono font-bold text-emerald-700 text-xs">IDR {fmt(c.net_transfer)}</span>
                    </td>
                    <td className="px-1 py-2 text-center">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(i)} data-testid={`trf-remove-line-${i}`} className="text-red-500 hover:text-red-700" title="Hapus baris">
                          <Trash size={15} weight="bold" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Secondary bank row */}
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td></td>
                    <td colSpan={11} className="px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-[0.08em] text-slate-400 font-bold">Rekening:</span>
                        <Input data-testid={`trf-bank-${i}`} value={l.bank_name} onChange={(e) => setLine(i, { bank_name: e.target.value })} className="rounded-none h-7 text-xs border border-slate-200 w-40" placeholder="Bank" />
                        <Input data-testid={`trf-acc-${i}`} value={l.account_no} onChange={(e) => setLine(i, { account_no: e.target.value })} className="rounded-none h-7 text-xs border border-slate-200 w-44" placeholder="No. Rekening" />
                        <Input data-testid={`trf-holder-${i}`} value={l.account_holder} onChange={(e) => setLine(i, { account_holder: e.target.value })} className="rounded-none h-7 text-xs border border-slate-200 w-56" placeholder="Atas Nama" />
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button variant="outline" onClick={addLine} data-testid="trf-add-line" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] border-2 border-dashed border-slate-300 w-full">
        <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Baris Pembayaran
      </Button>

      {/* Notes */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Catatan</Label>
        <Textarea data-testid="trf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-none text-sm" rows={2} placeholder="Catatan untuk Finance…" />
      </div>

      {/* Total + actions */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-end gap-4 pt-2 border-t-2 border-slate-200">
        <div className="md:text-right">
          <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Total Amount</div>
          <div data-testid="trf-grand-total" className="text-2xl font-bold font-mono text-emerald-700">IDR {fmt(grandTotal)}</div>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} variant="outline" data-testid="trf-save-btn" className="rounded-none h-11 text-xs uppercase tracking-[0.1em] border-2 border-slate-800">
            {saving ? <CircleNotch size={16} className="animate-spin mr-1.5" /> : <FloppyDisk size={16} weight="bold" className="mr-1.5" />} Simpan
          </Button>
          <Button onClick={saveAndPrint} disabled={saving} data-testid="trf-save-print-btn" className="rounded-none h-11 text-xs uppercase tracking-[0.1em] bg-sky-600 hover:bg-sky-700 text-white">
            <FilePdf size={16} weight="bold" className="mr-1.5" /> Simpan & Cetak PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------- Detail Modal -------------------
function TrfDetailModal({ id, onClose, onDeleted, canDelete }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get(`/transfer-requests/${id}`); setD(data); }
      catch { toast.error("Gagal memuat TRF"); onClose(); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const printPdf = async () => {
    try {
      const res = await api.get(`/transfer-requests/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error("Gagal membuka PDF"); }
  };

  const doDelete = async () => {
    if (!window.confirm("Hapus TRF ini?")) return;
    setBusy(true);
    try { await api.delete(`/transfer-requests/${id}`); toast.success("TRF dihapus"); onDeleted && onDeleted(); onClose(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-6xl max-h-[90vh] overflow-y-auto">
        {loading || !d ? (
          <div className="p-8 text-center"><CircleNotch size={20} className="inline animate-spin" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sky-700">{d.form_no}</span>
                <span className="text-[10px] uppercase tracking-[0.05em] font-bold px-1.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-300">{d.status}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="text-xs text-slate-500 mb-2">Tanggal {d.date} · Ditujukan {d.to_dept} · Diajukan {d.requested_by_name}</div>
            <div className="border-2 border-slate-200 overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "980px" }}>
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="p-2 text-center">No</th><th className="p-2 text-left">Vendor Name</th>
                    <th className="p-2 text-left">Description</th><th className="p-2 text-left">SO</th>
                    <th className="p-2 text-center">Qty</th><th className="p-2 text-center">UoM</th>
                    <th className="p-2 text-right">Total Price</th><th className="p-2 text-right">Rate</th>
                    <th className="p-2 text-right">PPh</th><th className="p-2 text-right">Fee</th>
                    <th className="p-2 text-right">Amount (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.lines || []).map((l, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="p-2 text-center">{l.no || i + 1}</td>
                      <td className="p-2">
                        <div className="font-semibold whitespace-pre-line">{l.vendor_name}</div>
                        <div className="text-slate-400 text-[11px]">{[l.bank_name, l.account_no, l.account_holder].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="p-2">
                        <div>{l.description}</div>
                        {l.invoice_no && <div className="text-red-600">Invoice No. {l.invoice_no}</div>}
                      </td>
                      <td className="p-2 font-mono">{l.so_no}{l.so_customer ? `/${l.so_customer}` : ""}</td>
                      <td className="p-2 text-center">{l.qty}</td>
                      <td className="p-2 text-center">{l.uom}</td>
                      <td className="p-2 text-right font-mono">{l.currency} {fmt(l.amount)}</td>
                      <td className="p-2 text-right font-mono">{fmt(l.rate)}</td>
                      <td className="p-2 text-right font-mono text-red-600">{l.taxed ? `${l.pph_percent}% / ${fmt(l.pph_amount)}` : "-"}</td>
                      <td className="p-2 text-right font-mono">{fmt(l.fee)}</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-700">{fmt(l.net_transfer)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50 font-bold">
                    <td className="p-2" colSpan={10}>TOTAL</td>
                    <td className="p-2 text-right font-mono text-emerald-700">IDR {fmt(d.total_transfer)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {d.notes && <div className="mt-2 text-xs text-slate-600"><span className="font-bold">Catatan:</span> {d.notes}</div>}
            <DialogFooter className="mt-4 gap-2">
              {canDelete && (
                <Button variant="outline" onClick={doDelete} disabled={busy} data-testid="trf-detail-delete" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] border-2 border-red-300 text-red-600 hover:bg-red-50">
                  <Trash size={14} weight="bold" className="mr-1.5" /> Hapus
                </Button>
              )}
              <Button onClick={printPdf} data-testid="trf-detail-print" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] bg-sky-600 hover:bg-sky-700 text-white">
                <FilePdf size={14} weight="bold" className="mr-1.5" /> Cetak PDF
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------- Master List Tab -------------------
function MasterList({ refreshKey, canDelete }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/transfer-requests", { params: { q } }); setItems(data.items || []); }
    catch { toast.error("Gagal memuat daftar"); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load, refreshKey]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input data-testid="trf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor / vendor / catatan…" className="rounded-none h-9 pl-9 text-sm" />
      </div>

      <div className="border-2 border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white text-xs uppercase tracking-[0.05em]">
            <tr>
              <th className="p-2.5 text-left">No. Form</th>
              <th className="p-2.5 text-left">Tanggal</th>
              <th className="p-2.5 text-left">Vendor</th>
              <th className="p-2.5 text-center">Baris</th>
              <th className="p-2.5 text-right">Total Amount</th>
              <th className="p-2.5 text-left">Diajukan</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400"><CircleNotch size={20} className="inline animate-spin" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">Belum ada Transfer Request.</td></tr>
            ) : items.map((it) => {
              const vendors = [...new Set((it.lines || []).map((l) => l.vendor_name).filter(Boolean))];
              return (
                <tr key={it.id} onClick={() => setOpenId(it.id)} data-testid={`trf-row-${it.form_no}`}
                  className="border-b border-slate-100 hover:bg-sky-50 cursor-pointer">
                  <td className="p-2.5 font-mono font-bold text-sky-700">{it.form_no}</td>
                  <td className="p-2.5 text-slate-600">{it.date}</td>
                  <td className="p-2.5 text-slate-700">{vendors.slice(0, 2).join(", ")}{vendors.length > 2 ? ` +${vendors.length - 2}` : ""}</td>
                  <td className="p-2.5 text-center text-slate-600">{(it.lines || []).length}</td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-700">IDR {fmt(it.total_transfer)}</td>
                  <td className="p-2.5 text-slate-600">{it.requested_by_name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && <TrfDetailModal id={openId} onClose={() => setOpenId(null)} onDeleted={load} canDelete={canDelete} />}
    </div>
  );
}

// ------------------- Page -------------------
export default function TransferRequestPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("create");
  const [refreshKey, setRefreshKey] = useState(0);
  const canDelete = user && (["admin", "super_admin"].includes(user.role) || user.is_super_admin);

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-5">
      <Link to="/purchasing" data-testid="trf-back-btn" className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]">
        <ArrowLeft size={16} weight="bold" /> Kembali ke Purchasing
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bank size={22} weight="duotone" className="text-sky-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Transfer Request Form</h1>
        </div>
        <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Format: 001/CRF-TT/VIII/2026 · Reset counter tiap bulan · Pengajuan pembayaran ke Finance</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-none bg-slate-100 p-1">
          <TabsTrigger value="create" data-testid="trf-tab-create" className="rounded-none text-xs uppercase tracking-[0.08em] data-[state=active]:bg-sky-600 data-[state=active]:text-white">
            <Plus size={14} weight="bold" className="mr-1.5" /> Buat TRF
          </TabsTrigger>
          <TabsTrigger value="list" data-testid="trf-tab-list" className="rounded-none text-xs uppercase tracking-[0.08em] data-[state=active]:bg-sky-600 data-[state=active]:text-white">
            <ListDashes size={14} weight="bold" className="mr-1.5" /> Master List TRF
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <CreateTrf onSaved={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <MasterList refreshKey={refreshKey} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
