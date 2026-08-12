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
  Bank, ArrowLeft, Plus, Trash, CircleNotch, MagnifyingGlass, FilePdf, FloppyDisk, ListDashes, Eye, DownloadSimple, PencilSimple, Lock,
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

const cellInput = "rounded-none h-7 text-[11px] border border-slate-200 focus-visible:ring-1 focus-visible:ring-sky-400 w-full min-w-0 px-1.5";

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
        className={`${cellInput} text-center`}
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
function CreateTrf({ onSaved, editDoc, onDone }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [nextNo, setNextNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const loadNextNo = useCallback(async () => {
    try { const { data } = await api.get("/transfer-requests/next-no"); setNextNo(data.form_no); } catch {}
  }, []);

  useEffect(() => {
    if (editDoc && editDoc.id) {
      setEditId(editDoc.id);
      setDate((editDoc.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10));
      setNotes(editDoc.notes || "");
      setNextNo(editDoc.form_no || "");
      setLines((editDoc.lines || []).map((l) => ({ ...emptyLine(), ...l })));
    } else {
      setEditId(null);
      setDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setLines([emptyLine()]);
      loadNextNo();
    }
  }, [editDoc, loadNextNo]);

  const grandTotal = lines.reduce((s, l) => s + computeLine(l).net_transfer, 0);

  const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const reset = () => { setEditId(null); setLines([emptyLine()]); setNotes(""); setDate(new Date().toISOString().slice(0, 10)); loadNextNo(); };

  const buildPayload = () => {
    const valid = lines.filter((l) => l.vendor_name.trim() && Number(l.amount) > 0);
    if (valid.length === 0) return null;
    return {
      date, notes,
      lines: valid.map((l) => ({
        ...l,
        qty: Number(l.qty || 0), amount: Number(l.amount || 0), rate: Number(l.rate || 1),
        fee: Number(l.fee || 0), pph_percent: Number(l.pph_percent || 0),
      })),
    };
  };

  const save = async () => {
    const payload = buildPayload();
    if (!payload) { toast.error("Isi minimal 1 baris dengan vendor & Total Price"); return null; }
    setSaving(true);
    try {
      let data;
      if (editId) {
        ({ data } = await api.put(`/transfer-requests/${editId}`, payload));
        toast.success(`TRF ${data.form_no} diperbarui`);
      } else {
        ({ data } = await api.post("/transfer-requests", payload));
        toast.success(`TRF ${data.form_no} tersimpan`);
      }
      onSaved && onSaved(data);
      return data;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan TRF");
      return null;
    } finally { setSaving(false); }
  };

  const openBlob = (blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "TRF.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const previewPdf = async () => {
    const payload = buildPayload();
    if (!payload) { toast.error("Isi minimal 1 baris untuk preview"); return; }
    try {
      const res = await api.post("/transfer-requests/preview-pdf", payload, { responseType: "blob" });
      openBlob(res.data);
    } catch { toast.error("Gagal membuat preview PDF"); }
  };

  const saveAndPrint = async () => {
    const data = await save();
    if (!data) return;
    try {
      const res = await api.get(`/transfer-requests/${data.id}/pdf`, { responseType: "blob" });
      openBlob(res.data);
    } catch { toast.error("Gagal membuka PDF"); }
    if (editId) { onDone && onDone(); } else { reset(); }
  };

  const saveAndDownload = async () => {
    const data = await save();
    if (!data) return;
    try {
      const res = await api.get(`/transfer-requests/${data.id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, `${(data.form_no || "TRF").replace(/\//g, "_")}.pdf`);
    } catch { toast.error("Gagal mengunduh PDF"); }
    if (editId) { onDone && onDone(); } else { reset(); }
  };

  const th = "px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.03em] text-white border-r border-slate-600 last:border-0 whitespace-nowrap";

  return (
    <div className="space-y-4">
      {/* Header form */}
      <Card className="rounded-none border-2 border-slate-200 p-4">
        {editId && (
          <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2 bg-amber-50 border-2 border-amber-300">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-amber-700">Mode Edit — sedang merevisi TRF ini</span>
            <button type="button" onClick={() => (onDone ? onDone() : reset())} data-testid="trf-cancel-edit" className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600 hover:text-slate-900 underline">Batal Edit</button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">No. Form {editId ? "" : "(otomatis)"}</Label>
            <div data-testid="trf-next-no" className="h-9 flex items-center px-3 border-2 border-dashed border-slate-300 bg-slate-50 font-mono font-bold text-sky-700">{nextNo || "…"}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Tanggal</Label>
            <Input data-testid="trf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-none h-9 text-sm" />
          </div>
        </div>
      </Card>

      {/* Line table — fit lebar seperti Excel */}
      <div className="border-2 border-slate-200 overflow-x-auto">
        <table className="w-full border-collapse table-fixed" style={{ minWidth: "1080px" }}>
          <colgroup>
            <col style={{ width: "3%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "3%" }} />
          </colgroup>
          <thead className="bg-slate-800">
            <tr>
              <th className={th}>No</th>
              <th className={th}>Vendor Name</th>
              <th className={th}>Description</th>
              <th className={th}>SO</th>
              <th className={th}>Qty</th>
              <th className={th}>UoM</th>
              <th className={th}>Total Price</th>
              <th className={th}>Rate</th>
              <th className={th}>PPh</th>
              <th className={th}>Fee (IDR)</th>
              <th className={th}>Amount (IDR)</th>
              <th className={th}></th>
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
                    <td className="px-1 py-1 border-r border-slate-100">
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
                    <td className="px-1 py-1 border-r border-slate-100">
                      <Textarea data-testid={`trf-desc-${i}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} rows={3} className="rounded-none text-xs border border-slate-200 focus-visible:ring-1 focus-visible:ring-sky-400 w-full resize-y min-h-[3.5rem]" placeholder="Deskripsi barang/jasa (boleh beberapa baris / tekan Enter)" />
                      <Input data-testid={`trf-invoice-${i}`} value={l.invoice_no} onChange={(e) => setLine(i, { invoice_no: e.target.value })}
                        className="rounded-none h-8 text-xs border border-slate-200 mt-1 text-red-600 placeholder:text-red-300 focus-visible:ring-1 focus-visible:ring-sky-400 w-full" placeholder="Invoice No." />
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <SoInput testid={`trf-so-${i}`} soNo={l.so_no} soCustomer={l.so_customer}
                        onChange={(v) => setLine(i, { so_no: v, so_customer: "" })}
                        onSelect={(so, cust) => setLine(i, { so_no: so, so_customer: cust })} />
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <Input data-testid={`trf-qty-${i}`} type="text" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^0-9.,]/g, "") })} className={`${cellInput} text-right`} placeholder="0" />
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <Input data-testid={`trf-uom-${i}`} value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value })} className={cellInput} placeholder="Lot" />
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <div className="flex gap-0.5">
                        <Select value={l.currency} onValueChange={(v) => setLine(i, { currency: v, rate: v === "IDR" ? 1 : l.rate, fee: v === "IDR" ? 0 : l.fee })}>
                          <SelectTrigger data-testid={`trf-currency-${i}`} className="rounded-none h-7 text-[11px] w-[52px] px-1"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid={`trf-amount-${i}`} type="number" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} className={`${cellInput} text-right`} placeholder="0" />
                      </div>
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <Input data-testid={`trf-rate-${i}`} type="number" value={l.rate} disabled={!isForeign} onChange={(e) => setLine(i, { rate: e.target.value })} className={`${cellInput} text-right disabled:bg-slate-100`} placeholder="1" />
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <div className="flex items-center gap-0.5">
                        <Switch data-testid={`trf-tax-${i}`} checked={l.taxed} onCheckedChange={(v) => setLine(i, { taxed: v })} className="scale-75 shrink-0" />
                        <Input data-testid={`trf-pph-${i}`} type="number" value={l.pph_percent} disabled={!l.taxed} onChange={(e) => setLine(i, { pph_percent: e.target.value })} className={`${cellInput} text-right disabled:bg-slate-100`} placeholder="%" />
                      </div>
                      {l.taxed && <div className="text-[10px] text-red-600 text-right mt-0.5 font-mono">-{fmt(c.pph_amount)}</div>}
                    </td>
                    <td className="px-1 py-1 border-r border-slate-100">
                      <Input data-testid={`trf-fee-${i}`} type="number" value={l.fee} disabled={!isForeign} onChange={(e) => setLine(i, { fee: e.target.value })} className={`${cellInput} text-right disabled:bg-slate-100 disabled:text-slate-400`} placeholder={isForeign ? "0" : "—"} title={isForeign ? "" : "Fee hanya untuk transfer valas (SGD/USD)"} />
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
                        <Input data-testid={`trf-bank-${i}`} value={l.bank_name} onChange={(e) => setLine(i, { bank_name: e.target.value })} className="rounded-none h-7 text-xs border border-slate-200 w-32" placeholder="Bank" />
                        <Input data-testid={`trf-acc-${i}`} value={l.account_no} onChange={(e) => setLine(i, { account_no: e.target.value })} className="rounded-none h-7 text-xs border border-slate-200 w-36" placeholder="No. Rekening" />
                        <Input data-testid={`trf-holder-${i}`} value={l.account_holder} onChange={(e) => setLine(i, { account_holder: e.target.value })} className="rounded-none h-7 text-xs border border-slate-200 w-44" placeholder="Atas Nama" />
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
        <div className="flex flex-wrap gap-2">
          <Button onClick={previewPdf} disabled={saving} variant="outline" data-testid="trf-preview-btn" className="rounded-none h-11 text-xs uppercase tracking-[0.1em] border-2 border-sky-600 text-sky-700 hover:bg-sky-50">
            <Eye size={16} weight="bold" className="mr-1.5" /> Preview
          </Button>
          <Button onClick={save} disabled={saving} variant="outline" data-testid="trf-save-btn" className="rounded-none h-11 text-xs uppercase tracking-[0.1em] border-2 border-slate-800">
            {saving ? <CircleNotch size={16} className="animate-spin mr-1.5" /> : <FloppyDisk size={16} weight="bold" className="mr-1.5" />} {editId ? "Update" : "Simpan"}
          </Button>
          <Button onClick={saveAndDownload} disabled={saving} data-testid="trf-save-download-btn" className="rounded-none h-11 text-xs uppercase tracking-[0.1em] bg-sky-600 hover:bg-sky-700 text-white">
            <DownloadSimple size={16} weight="bold" className="mr-1.5" /> {editId ? "Update & Download" : "Simpan & Download"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------- Detail Modal -------------------
function TrfDetailModal({ id, onClose, onDeleted, onEdit, isAdmin, user }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get(`/transfer-requests/${id}`); setD(data); }
      catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat TRF"); onClose(); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const canManage = d && (isAdmin || d.requested_by === user?.id);

  const submitTime = (iso) => {
    if (!iso) return "";
    try {
      const dt = new Date(iso);
      return dt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";
    } catch { return iso; }
  };

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
            <div className="text-xs text-slate-500 mb-2">
              Tanggal {d.date} · Diajukan <b className="text-slate-700">{d.requested_by_name}</b> · Submit: <b className="text-slate-700">{submitTime(d.created_at)}</b>
              {d.updated_at && d.updated_at !== d.created_at && <span> · Edit terakhir: {submitTime(d.updated_at)}</span>}
            </div>
            <div className="border-2 border-slate-200 overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "980px" }}>
                <thead className="bg-slate-100 text-slate-800 border-b-2 border-slate-300">
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
                        <div className="whitespace-pre-line">{l.description}</div>
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
              {isAdmin && (
                <Button variant="outline" onClick={doDelete} disabled={busy} data-testid="trf-detail-delete" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] border-2 border-red-300 text-red-600 hover:bg-red-50">
                  <Trash size={14} weight="bold" className="mr-1.5" /> Hapus
                </Button>
              )}
              {canManage && (
                <Button variant="outline" onClick={() => { onEdit && onEdit(d); onClose(); }} data-testid="trf-detail-edit" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] border-2 border-amber-400 text-amber-700 hover:bg-amber-50">
                  <PencilSimple size={14} weight="bold" className="mr-1.5" /> Edit
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
function MasterList({ refreshKey, isAdmin, user, onEdit }) {
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

  const canOpen = (it) => isAdmin || it.requested_by === user?.id;
  const handleRow = (it) => {
    if (!canOpen(it)) { toast.error("TRF ini milik user lain. Hanya pemilik atau Admin yang bisa membuka."); return; }
    setOpenId(it.id);
  };

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
              const mine = canOpen(it);
              return (
                <tr key={it.id} onClick={() => handleRow(it)} data-testid={`trf-row-${it.form_no}`}
                  className={`border-b border-slate-100 ${mine ? "hover:bg-sky-50 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}>
                  <td className="p-2.5 font-mono font-bold text-sky-700">{it.form_no}</td>
                  <td className="p-2.5 text-slate-600">{it.date}</td>
                  <td className="p-2.5 text-slate-700">{vendors.slice(0, 2).join(", ")}{vendors.length > 2 ? ` +${vendors.length - 2}` : ""}</td>
                  <td className="p-2.5 text-center text-slate-600">{(it.lines || []).length}</td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-700">IDR {fmt(it.total_transfer)}</td>
                  <td className="p-2.5 text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      {!mine && <Lock size={13} weight="bold" className="text-slate-400" />}
                      {it.requested_by_name}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && <TrfDetailModal id={openId} onClose={() => setOpenId(null)} onDeleted={load} onEdit={onEdit} isAdmin={isAdmin} user={user} />}
    </div>
  );
}

// ------------------- Master Bank Vendor Tab -------------------
const emptyBank = () => ({ id: null, vendor_name: "", bank_name: "", account_no: "", account_holder: "", currency: "IDR" });

function BankDialog({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial || emptyBank());
  const [saving, setSaving] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const save = async () => {
    if (!f.vendor_name.trim()) { toast.error("Nama vendor wajib diisi"); return; }
    setSaving(true);
    try {
      await api.post("/vendor-banks", {
        vendor_name: f.vendor_name.trim(), bank_name: f.bank_name, account_no: f.account_no,
        account_holder: f.account_holder, currency: f.currency,
      });
      toast.success("Rekening vendor tersimpan");
      onSaved && onSaved();
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{f.id ? "Edit Rekening Vendor" : "Tambah Rekening Vendor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Nama Vendor</Label>
            <Input data-testid="vb-vendor" value={f.vendor_name} onChange={(e) => set({ vendor_name: e.target.value })} className="rounded-none h-9 text-sm" placeholder="mis. SG Galvanizing via PT. Sinar" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Bank</Label>
              <Input data-testid="vb-bank" value={f.bank_name} onChange={(e) => set({ bank_name: e.target.value })} className="rounded-none h-9 text-sm" placeholder="Nama bank" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Mata Uang</Label>
              <Select value={f.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger data-testid="vb-currency" className="rounded-none h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">No. Rekening</Label>
            <Input data-testid="vb-acc" value={f.account_no} onChange={(e) => set({ account_no: e.target.value })} className="rounded-none h-9 text-sm" placeholder="No. rekening" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Atas Nama</Label>
            <Input data-testid="vb-holder" value={f.account_holder} onChange={(e) => set({ account_holder: e.target.value })} className="rounded-none h-9 text-sm" placeholder="Atas nama" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none h-9 text-xs uppercase tracking-[0.1em]">Batal</Button>
          <Button onClick={save} disabled={saving} data-testid="vb-save" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] bg-sky-600 hover:bg-sky-700 text-white">
            {saving ? <CircleNotch size={14} className="animate-spin mr-1.5" /> : <FloppyDisk size={14} weight="bold" className="mr-1.5" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MasterBankVendor() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // null | {} initial for edit/add

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/vendor-banks", { params: { q, limit: 500 } }); setItems(data.items || []); }
    catch { toast.error("Gagal memuat master bank"); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const del = async (it) => {
    if (!window.confirm(`Hapus rekening "${it.vendor_name}"?`)) return;
    try { await api.delete(`/vendor-banks/${it.id}`); toast.success("Rekening dihapus"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="vb-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari vendor…" className="rounded-none h-9 pl-9 text-sm" />
        </div>
        <Button onClick={() => setDialog(emptyBank())} data-testid="vb-add-btn" className="rounded-none h-9 text-xs uppercase tracking-[0.1em] bg-sky-600 hover:bg-sky-700 text-white">
          <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Rekening
        </Button>
      </div>

      <p className="text-xs text-slate-500">Data di sini dipakai untuk <b>auto-isi</b> Bank & No. Rekening saat mengetik vendor di form TRF. Baris baru juga tersimpan otomatis saat Anda membuat TRF.</p>

      <div className="border-2 border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white text-xs uppercase tracking-[0.05em]">
            <tr>
              <th className="p-2.5 text-left">Vendor</th>
              <th className="p-2.5 text-left">Bank</th>
              <th className="p-2.5 text-left">No. Rekening</th>
              <th className="p-2.5 text-left">Atas Nama</th>
              <th className="p-2.5 text-center">Mata Uang</th>
              <th className="p-2.5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400"><CircleNotch size={20} className="inline animate-spin" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">Belum ada data rekening vendor.</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} data-testid={`vb-row-${it.id}`} className="border-b border-slate-100 hover:bg-sky-50">
                <td className="p-2.5 font-semibold text-slate-800">{it.vendor_name}</td>
                <td className="p-2.5 text-slate-600">{it.bank_name || "-"}</td>
                <td className="p-2.5 font-mono text-slate-600">{it.account_no || "-"}</td>
                <td className="p-2.5 text-slate-600">{it.account_holder || "-"}</td>
                <td className="p-2.5 text-center text-slate-600">{it.currency || "IDR"}</td>
                <td className="p-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" onClick={() => setDialog({ ...emptyBank(), ...it })} data-testid={`vb-edit-${it.id}`} className="text-sky-600 hover:text-sky-800 text-xs font-bold uppercase tracking-[0.05em]">Edit</button>
                    <button type="button" onClick={() => del(it)} data-testid={`vb-del-${it.id}`} className="text-red-500 hover:text-red-700"><Trash size={15} weight="bold" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && <BankDialog initial={dialog} onClose={() => setDialog(null)} onSaved={load} />}
    </div>
  );
}

// ------------------- Page -------------------
export default function TransferRequestPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("create");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editDoc, setEditDoc] = useState(null);
  const isAdmin = user && (["admin", "super_admin"].includes(user.role) || user.is_super_admin);

  const startEdit = (doc) => { setEditDoc(doc); setTab("create"); };
  const finishEdit = () => { setEditDoc(null); setRefreshKey((k) => k + 1); setTab("list"); };

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-5">
      <Link to="/" data-testid="trf-back-btn" className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]">
        <ArrowLeft size={16} weight="bold" /> Kembali ke Menu Utama
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bank size={22} weight="duotone" className="text-sky-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Transfer Request Form</h1>
        </div>
        <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Format: 001/CRF-TT/VIII/2026 · Nomor otomatis · Pengajuan pembayaran ke Finance</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => { if (v !== "create") setEditDoc(null); setTab(v); }}>
        <TabsList className="rounded-none bg-slate-100 p-1">
          <TabsTrigger value="create" data-testid="trf-tab-create" className="rounded-none text-xs uppercase tracking-[0.08em] data-[state=active]:bg-sky-600 data-[state=active]:text-white">
            <Plus size={14} weight="bold" className="mr-1.5" /> {editDoc ? "Edit TRF" : "Buat TRF"}
          </TabsTrigger>
          <TabsTrigger value="list" data-testid="trf-tab-list" className="rounded-none text-xs uppercase tracking-[0.08em] data-[state=active]:bg-sky-600 data-[state=active]:text-white">
            <ListDashes size={14} weight="bold" className="mr-1.5" /> Master List TRF
          </TabsTrigger>
          <TabsTrigger value="bank" data-testid="trf-tab-bank" className="rounded-none text-xs uppercase tracking-[0.08em] data-[state=active]:bg-sky-600 data-[state=active]:text-white">
            <Bank size={14} weight="bold" className="mr-1.5" /> Master Bank Vendor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <CreateTrf onSaved={() => setRefreshKey((k) => k + 1)} editDoc={editDoc} onDone={finishEdit} />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <MasterList refreshKey={refreshKey} isAdmin={isAdmin} user={user} onEdit={startEdit} />
        </TabsContent>
        <TabsContent value="bank" className="mt-4">
          <MasterBankVendor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
