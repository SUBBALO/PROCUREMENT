import React, { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import { FileText, ArrowLeft, Plus, Trash, CircleNotch, MagnifyingGlass, MicrosoftExcelLogo } from "@phosphor-icons/react";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-amber-600 text-sm";

const STATUS_META = {
  on_bidding: { label: "On Bidding", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  confirm_order: { label: "Confirm Order", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  cancel: { label: "Cancel", cls: "bg-red-100 text-red-800 border-red-300" },
};

function Badge({ status }) {
  const m = STATUS_META[status] || STATUS_META.on_bidding;
  return <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] font-bold border ${m.cls}`}>{m.label}</span>;
}

export default function QuotationPage() {
  const { user } = useAuth();
  const isSales = user?.role === "sales" || user?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [openQ, setOpenQ] = useState(null);
  const [prefill, setPrefill] = useState(null);        // { inquiry_id, customer_name, items[], ... }
  const [searchParams, setSearchParams] = useSearchParams();
  const fromInquiryId = searchParams.get("from_inquiry");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = query.trim() ? { q: query.trim() } : {};
      const { data } = await api.get("/quotations", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat");
    } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const [stats, setStats] = useState(null);
  const loadStats = useCallback(async () => {
    try { const { data } = await api.get("/sales/stats"); setStats(data); } catch {}
  }, []);
  useEffect(() => { loadStats(); }, [loadStats, items.length]);

  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/quotations/export/excel", {
        params: query.trim() ? { q: query.trim() } : {},
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quotations_MKS_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel Quotations ter-download");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal export");
    } finally { setExporting(false); }
  };

  // Auto-open Create dialog with inquiry prefill
  useEffect(() => {
    if (!fromInquiryId || !isSales) return;
    (async () => {
      try {
        const { data } = await api.get(`/inquiries/${fromInquiryId}`);
        const [cust] = await Promise.all([
          api.get("/customers", { params: { q: data.customer_name } }).catch(() => ({ data: { items: [] } })),
        ]);
        const custMatch = (cust.data?.items || []).find(
          (c) => (c.name || "").toLowerCase() === (data.customer_name || "").toLowerCase()
        );
        setPrefill({
          inquiry_id: data.id,
          inquiry_no: data.inquiry_no,
          customer_name: data.customer_name,
          customer_address: custMatch?.address || "",
          attention: custMatch?.pic || "",
          items: (data.items || []).map((it, i) => ({
            no: i + 1,
            description: `${it.item_name}${it.specification ? " — " + it.specification : ""}`.trim(),
            qty: Number(it.qty) || 1,
            unit: it.unit || "EA",
            unit_price: 0,
          })),
        });
        setShowCreate(true);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Gagal memuat Inquiry");
        // Remove the query param so we don't loop
        searchParams.delete("from_inquiry");
        setSearchParams(searchParams, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInquiryId, isSales]);

  const closeCreate = () => {
    setShowCreate(false);
    setPrefill(null);
    if (fromInquiryId) {
      searchParams.delete("from_inquiry");
      setSearchParams(searchParams, { replace: true });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-5">
      <Link to="/sales" className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900" data-testid="quo-back-btn">
        <ArrowLeft size={12} weight="bold" /> Kembali ke Sales Sub-Portal
      </Link>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={22} weight="duotone" className="text-amber-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Quotation</h1>
          </div>
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Format: 001/MKS/Q/VII/2026 · Reset counter tiap bulan · Kop Surat A4 (PDF menyusul)</p>
        </div>
        {isSales && (
          <div className="flex items-center gap-2">
            <Button data-testid="quo-export-excel" onClick={doExport} disabled={exporting} variant="outline" className="rounded-none h-9 text-xs uppercase tracking-[0.1em]">
              <MicrosoftExcelLogo size={14} weight="bold" className="mr-1.5 text-emerald-600" /> {exporting ? "Menyiapkan…" : "Export Excel"}
            </Button>
            <Button data-testid="new-quotation-btn" onClick={() => setShowCreate(true)} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs uppercase tracking-[0.1em]">
              <Plus size={14} weight="bold" className="mr-1.5" /> Buat Quotation
            </Button>
          </div>
        )}
      </div>

      {/* Quotation stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="quo-stats-grid">
          <QuoStatCard label="Total Quotation" value={stats.quotations?.total} accent="slate" testid="quo-stat-total" />
          <QuoStatCard label="On Bidding" value={stats.quotations?.by_status?.on_bidding} accent="amber" testid="quo-stat-on-bidding" />
          <QuoStatCard label="Confirm Order" value={stats.quotations?.by_status?.confirm_order} accent="emerald" testid="quo-stat-confirm" />
          <QuoStatCard label="Cancel" value={stats.quotations?.by_status?.cancel} accent="red" testid="quo-stat-cancel" />
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-lg">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari <span className="text-slate-400 font-normal normal-case">(No Quotation / Customer / Item / Attention)</span></Label>
          <Input data-testid="quo-search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="mis. 001/MKS/Q · SPM · Float Ring" />
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Daftar Quotation — {items.length}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">No Quotation</th>
                <th className="text-left p-3">Tanggal Buat</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Attention</th>
                <th className="text-left p-3">Items</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Sales</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={9} className="p-6 text-center text-slate-400"><CircleNotch size={18} className="inline animate-spin" /></td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={9} className="p-8 text-center text-slate-400">Belum ada quotation.</td></tr>)}
              {items.map((q) => (
                <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono font-semibold text-slate-900">{q.quotation_no}</td>
                  <td className="p-3 text-slate-700 text-xs whitespace-nowrap tabular-nums">{(q.created_at || "").slice(0, 10)}</td>
                  <td className="p-3 text-slate-800">{q.customer_name}</td>
                  <td className="p-3 text-slate-700 text-xs">{q.attention || "-"}</td>
                  <td className="p-3 text-slate-600 text-xs max-w-[240px] truncate" title={(q.items || []).map(it => it.description).join(", ")}>
                    {(q.items || []).slice(0, 2).map(it => it.description).filter(Boolean).join(", ") || "-"}
                    {(q.items || []).length > 2 && ` (+${q.items.length - 2})`}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">{q.currency} {Number(q.total_amount || 0).toLocaleString("id-ID")}</td>
                  <td className="p-3"><Badge status={q.status} /></td>
                  <td className="p-3 text-slate-500 text-xs">{q.created_by_name}</td>
                  <td className="p-3 text-center">
                    <button data-testid={`open-quo-${q.id}`} onClick={() => setOpenQ(q)} className="text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-none">Buka</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && <CreateQuotationDialog prefill={prefill} onClose={closeCreate} onCreated={() => { closeCreate(); load(); }} />}
      {openQ && <QuotationDetailDialog id={openQ.id} onClose={() => setOpenQ(null)} onChanged={load} />}
    </div>
  );
}


function CreateQuotationDialog({ onClose, onCreated, prefill = null }) {
  const [customerName, setCustomerName] = useState(prefill?.customer_name || "");
  const [customerAddress, setCustomerAddress] = useState(prefill?.customer_address || "");
  const [attention, setAttention] = useState(prefill?.attention || "");
  const [cc, setCc] = useState("");
  const [items, setItems] = useState(
    prefill?.items?.length
      ? prefill.items
      : [{ no: 1, description: "", qty: 1, unit: "EA", unit_price: 0 }]
  );
  const [notesLines, setNotesLines] = useState(["", ""]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [inWords, setInWords] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [paymentTerm, setPaymentTerm] = useState("50% Down Payment, Balance before delivery");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [validity, setValidity] = useState("30 Days from date of quotation");
  const [saving, setSaving] = useState(false);

  const addItem = () => {
    setItems((p) => [...p, { no: p.length + 1, description: "", qty: 1, unit: "EA", unit_price: 0 }]);
    setTimeout(() => {
      const idx = items.length;
      document.querySelector(`[data-testid="quo-desc-${idx}"]`)?.focus();
    }, 30);
  };
  const setItem = (i, k, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const rmItem = (i) => setItems((p) => p.length === 1 ? p : p.filter((_, idx) => idx !== i));

  const grandTotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  // Auto-sync top-level totalAmount when grand total changes
  useEffect(() => { setTotalAmount(grandTotal); }, [grandTotal]);

  // Enter to move next field / add row when at last field
  const onItemKey = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = ["quo-desc", "quo-qty", "quo-unit", "quo-price"];
    const cur = order.indexOf(field);
    if (cur < 0) return;
    if (cur < order.length - 1) {
      document.querySelector(`[data-testid="${order[cur + 1]}-${i}"]`)?.focus();
    } else {
      // last field: if last row → add new row, else focus next row's description
      if (i === items.length - 1) {
        if (items[i].description.trim()) addItem();
      } else {
        document.querySelector(`[data-testid="quo-desc-${i + 1}"]`)?.focus();
      }
    }
  };

  const submit = async () => {
    if (!customerName.trim()) return toast.error("Customer wajib diisi");
    setSaving(true);
    try {
      const { data } = await api.post("/quotations", {
        inquiry_id: prefill?.inquiry_id || null,
        customer_name: customerName, customer_address: customerAddress, attention, cc,
        items: items.filter((i) => i.description.trim()).map((it) => ({
          ...it,
          qty: Number(it.qty) || 0,
          unit_price: Number(it.unit_price) || 0,
          total_price: (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
        })),
        notes_lines: notesLines.filter((n) => n.trim()),
        in_words: inWords, total_amount: parseFloat(totalAmount) || 0, currency,
        payment_term: paymentTerm, delivery_time: deliveryTime, validity,
      });
      toast.success(`Quotation ${data.quotation_no} tersimpan`);
      onCreated();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Quotation Baru</DialogTitle>
          <DialogDescription>Nomor otomatis format 001/MKS/Q/VII/2026, reset tiap bulan. PDF dengan kop surat menyusul.</DialogDescription>
        </DialogHeader>
        {prefill?.inquiry_no && (
          <div className="p-2.5 border border-amber-300 bg-amber-50 text-xs text-amber-900" data-testid="quo-from-inquiry-badge">
            🔗 Prefilled dari Inquiry <b className="font-mono">{prefill.inquiry_no}</b> — customer, alamat, attention & item sudah terisi otomatis. Silakan lengkapi harga.
          </div>
        )}
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Customer *</Label><Input data-testid="quo-customer" className={inputCls} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="PT. SPM Oil & Gas" /></div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Attention</Label><Input data-testid="quo-attention" className={inputCls} value={attention} onChange={(e) => setAttention(e.target.value)} placeholder="Mr. John" /></div>
          </div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Alamat Customer</Label><Input className={inputCls} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} /></div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">CC</Label><Input className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Purchasing / Engineering" /></div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold text-slate-600">Items</Label>
              <button onClick={addItem} className="text-[10px] uppercase font-semibold text-amber-600 border border-amber-300 hover:bg-amber-50 px-2 py-0.5"><Plus size={11} weight="bold" className="inline mr-1" /> Tambah</button>
            </div>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-50"><tr><th className="p-1 text-left w-8">#</th><th className="p-1 text-left">Description</th><th className="p-1 text-right w-20">Qty</th><th className="p-1 text-left w-16">Unit</th><th className="p-1 text-right w-28">Unit Price</th><th className="p-1 text-right w-28">Total</th><th className="p-1 w-8"></th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-1 text-center text-slate-400">{i + 1}</td>
                    <td className="p-1"><Input data-testid={`quo-desc-${i}`} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} className="h-7 rounded-none text-xs" /></td>
                    <td className="p-1"><Input data-testid={`quo-qty-${i}`} type="number" step="any" value={it.qty} onChange={(e) => setItem(i, "qty", parseFloat(e.target.value) || 0)} className="h-7 rounded-none text-xs text-right" /></td>
                    <td className="p-1"><Input data-testid={`quo-unit-${i}`} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className="h-7 rounded-none text-xs" /></td>
                    <td className="p-1"><Input data-testid={`quo-price-${i}`} type="number" step="any" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", parseFloat(e.target.value) || 0)} className="h-7 rounded-none text-xs text-right" /></td>
                    <td className="p-1 text-right tabular-nums text-slate-700 pr-2">{((Number(it.qty) || 0) * (Number(it.unit_price) || 0)).toLocaleString("id-ID")}</td>
                    <td className="p-1 text-center"><button onClick={() => rmItem(i)} disabled={items.length === 1} className="p-0.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash size={12} weight="bold" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Total Amount</Label><Input data-testid="quo-total" type="number" step="any" className={`${inputCls} text-right`} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} /></div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Currency</Label><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm">{["IDR","USD","SGD"].map(c => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">In Words</Label><Input value={inWords} onChange={(e) => setInWords(e.target.value)} className={inputCls} placeholder="Sixty Two Million Rupiah" /></div>

          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Payment</Label><Input value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} className={inputCls} /></div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Delivery</Label><Input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className={inputCls} placeholder="6-8 Weeks after PO" /></div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Validity</Label><Input value={validity} onChange={(e) => setValidity(e.target.value)} className={inputCls} /></div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Notes (satu baris per note)</Label>
            {notesLines.map((n, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <Input value={n} onChange={(e) => setNotesLines(prev => prev.map((x, idx) => idx === i ? e.target.value : x))} className={inputCls} placeholder={`Note ${i + 1}`} />
                <button onClick={() => setNotesLines(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-red-600"><Trash size={12} /></button>
              </div>
            ))}
            <button onClick={() => setNotesLines(prev => [...prev, ""])} className="text-[10px] uppercase font-semibold text-amber-600 border border-amber-300 hover:bg-amber-50 px-2 py-0.5"><Plus size={11} weight="bold" className="inline mr-1" /> Tambah Note</button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-none">Batal</Button>
          <Button data-testid="quo-save" onClick={submit} disabled={saving} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white">{saving ? "Menyimpan..." : "Simpan Quotation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function QuotationDetailDialog({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try { const { data } = await api.get(`/quotations/${id}`); setD(data); } catch { onClose(); } finally { setLoading(false); }
  })(); }, [id, onClose]);

  const setStatus = async (status) => {
    setSaving(true);
    try {
      await api.patch(`/quotations/${id}/status`, { status });
      toast.success(`Status: ${status}`);
      const { data } = await api.get(`/quotations/${id}`); setD(data);
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-2xl max-h-[90vh] overflow-y-auto">
        {loading || !d ? <div className="p-8 text-center"><CircleNotch size={20} className="inline animate-spin" /></div> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><span className="font-mono">{d.quotation_no}</span><Badge status={d.status} /></DialogTitle>
              <DialogDescription>{d.customer_name}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Attention</div>{d.attention || "-"}</div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">CC</div>{d.cc || "-"}</div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Alamat</div>{d.customer_address || "-"}</div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Total</div><b>{d.currency} {Number(d.total_amount || 0).toLocaleString("id-ID")}</b></div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Payment</div>{d.payment_term || "-"}</div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Delivery</div>{d.delivery_time || "-"}</div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Validity</div>{d.validity || "-"}</div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Dibuat</div>{d.created_by_name} · {(d.created_at || "").slice(0, 10)}</div>
            </div>
            {(d.items || []).length > 0 && (
              <div className="mt-3 border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr><th className="p-1 text-left">#</th><th className="p-1 text-left">Description</th><th className="p-1 text-right">Qty</th><th className="p-1 text-left">Unit</th><th className="p-1 text-right">Unit Price</th><th className="p-1 text-right">Total</th></tr></thead>
                  <tbody>{d.items.map((it, i) => (<tr key={i} className="border-t border-slate-100"><td className="p-1 text-slate-400">{i + 1}</td><td className="p-1">{it.description}</td><td className="p-1 text-right tabular-nums">{it.qty}</td><td className="p-1 text-slate-600">{it.unit}</td><td className="p-1 text-right tabular-nums">{Number(it.unit_price || 0).toLocaleString("id-ID")}</td><td className="p-1 text-right tabular-nums font-semibold">{Number(it.total_price || (Number(it.qty)||0) * (Number(it.unit_price)||0)).toLocaleString("id-ID")}</td></tr>))}</tbody>
                </table>
              </div>
            )}
            {d.inquiry_id && (
              <div className="mt-2 text-[11px] text-slate-500">
                🔗 Sumber Inquiry: <span className="font-mono font-semibold text-slate-700">{d.inquiry_id.slice(0, 8)}…</span>
              </div>
            )}
            {(d.notes_lines || []).length > 0 && (
              <div className="mt-3 p-2 bg-slate-50 text-xs">
                <div className="font-bold text-slate-500 uppercase tracking-[0.1em] text-[10px] mb-1">Notes</div>
                {d.notes_lines.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 mb-2">Update Status</div>
              <div className="flex gap-2">
                <Button data-testid="status-on-bidding" onClick={() => setStatus("on_bidding")} disabled={saving || d.status === "on_bidding"} variant="outline" className="rounded-none text-xs">On Bidding</Button>
                <Button data-testid="status-confirm" onClick={() => setStatus("confirm_order")} disabled={saving || d.status === "confirm_order"} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Confirm Order</Button>
                <Button data-testid="status-cancel" onClick={() => setStatus("cancel")} disabled={saving || d.status === "cancel"} className="rounded-none bg-red-600 hover:bg-red-700 text-white text-xs">Cancel</Button>
              </div>
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                📄 <b>PDF dengan kop surat A4</b> — akan dibuild di iterasi berikutnya.
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


const QUO_ACCENT = {
  slate:   "border-slate-200 bg-white text-slate-700",
  amber:   "border-amber-200 bg-amber-50 text-amber-800",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  red:     "border-red-200 bg-red-50 text-red-800",
};

function QuoStatCard({ label, value, accent = "slate", testid }) {
  const cls = QUO_ACCENT[accent] || QUO_ACCENT.slate;
  return (
    <div className={`border ${cls} p-3`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-70">{label}</div>
      <div className="text-3xl font-bold tabular-nums leading-none mt-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>{value ?? 0}</div>
    </div>
  );
}

