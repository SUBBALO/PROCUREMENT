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
import { FileText, ArrowLeft, Plus, Trash, CircleNotch, MagnifyingGlass, MicrosoftExcelLogo, X, PencilSimple, Eye } from "@phosphor-icons/react";
import { SortDropdown, sortItems, cmpStr, cmpDateStr, cmpNum } from "../components/SortDropdown";
import AddCustomerDialog from "../components/AddCustomerDialog";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const QUO_SORT_OPTS = [
  { value: "created_desc", label: "Tanggal Buat: Baru → Lama", sort: (a, b) => cmpDateStr(b.created_at, a.created_at) },
  { value: "created_asc", label: "Tanggal Buat: Lama → Baru", sort: (a, b) => cmpDateStr(a.created_at, b.created_at) },
  { value: "no_asc", label: "No Quotation: A → Z", sort: (a, b) => cmpStr(a.quotation_no, b.quotation_no) },
  { value: "no_desc", label: "No Quotation: Z → A", sort: (a, b) => cmpStr(b.quotation_no, a.quotation_no) },
  { value: "cust_asc", label: "Customer: A → Z", sort: (a, b) => cmpStr(a.customer_name, b.customer_name) },
  { value: "cust_desc", label: "Customer: Z → A", sort: (a, b) => cmpStr(b.customer_name, a.customer_name) },
  { value: "total_desc", label: "Total: Besar → Kecil", sort: (a, b) => cmpNum(b.total_amount, a.total_amount) },
  { value: "total_asc", label: "Total: Kecil → Besar", sort: (a, b) => cmpNum(a.total_amount, b.total_amount) },
  { value: "status_asc", label: "Status: A → Z", sort: (a, b) => cmpStr(a.status, b.status) },
];

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-amber-600 text-sm";

const PAYMENT_TERM_OPTIONS = [
  "30 days upon invoice date",
  "45 days upon invoice date",
  "60 days upon invoice date",
  "50% Down Payment, Balance before delivery",
];
const DELIVERY_TIME_DEFAULT = "6-8 Weeks after PO";

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
  // Semua role yang wajar boleh buat quotation (backend tidak membatasi role).
  // Sebelumnya hanya "sales"/"admin" -> super_admin & supervisor tidak melihat tombol "Buat Quotation".
  const isSales = ["sales", "admin", "super_admin", "supervisor"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [openQ, setOpenQ] = useState(null);
  const [prefill, setPrefill] = useState(null);        // { inquiry_id, customer_name, items[], ... }
  const [searchParams, setSearchParams] = useSearchParams();
  const fromInquiryId = searchParams.get("from_inquiry");

  const [statusFilter, setStatusFilter] = useState("");   // "" | "on_bidding" | "confirm_order" | "cancel"
  const [monthFilter, setMonthFilter] = useState("");     // "YYYY-MM" (opsional — jika terisi, overrides date range)
  const _today = new Date().toISOString().slice(0, 10);
  const _firstOfMonth = _today.slice(0, 8) + "01";
  const [startDate, setStartDate] = useState(_firstOfMonth);  // default: tgl 1 bulan ini
  const [endDate, setEndDate] = useState(_today);              // default: hari ini
  const [sortBy, setSortBy] = useState("created_desc");
  const [salesFilter, setSalesFilter] = useState("");
  // Sales team roster — konsisten dengan SalesPage
  const SALES_NAMES = ["Asiong", "Nicholas", "Kiki", "Riska", "Feggie", "Fiana"];
  const filteredSortedItems = React.useMemo(
    () => sortItems(salesFilter ? items.filter((q) => (q.created_by_name || "").toLowerCase() === salesFilter.toLowerCase()) : items, sortBy, QUO_SORT_OPTS),
    [items, salesFilter, sortBy]
  );
  const pag = usePagination(filteredSortedItems, 20);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (statusFilter) params.status = statusFilter;
      if (monthFilter) params.month = monthFilter;
      const { data } = await api.get("/quotations", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat");
    } finally { setLoading(false); }
  }, [query, statusFilter, monthFilter]);
  useEffect(() => { load(); }, [load]);

  const [stats, setStats] = useState(null);
  const currentRange = () => {
    // Prefer monthFilter if user sets it, else use start/end date pickers
    if (monthFilter) {
      const [y, mo] = monthFilter.split("-").map(Number);
      if (y && mo) {
        const start = `${y}-${String(mo).padStart(2, "0")}-01`;
        const lastDay = new Date(y, mo, 0).getDate();
        return { start_date: start, end_date: `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
      }
    }
    const r = {};
    if (startDate) r.start_date = startDate;
    if (endDate) r.end_date = endDate;
    return r;
  };
  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get("/sales/stats", { params: currentRange() });
      setStats(data);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter, startDate, endDate]);
  useEffect(() => { loadStats(); }, [loadStats, items.length]);

  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const range = currentRange();
      const params = { ...range };
      if (query.trim()) params.q = query.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/quotations/export/excel", {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      const suffix = monthFilter ? `_${monthFilter}` : "";
      a.download = `Quotations_MKS${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  // Auto-open Quotation Detail dialog via ?open=<id>
  const openId = searchParams.get("open");
  useEffect(() => {
    if (!openId) return;
    (async () => {
      try {
        const { data } = await api.get(`/quotations/${openId}`);
        setOpenQ(data);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Gagal memuat Quotation");
      } finally {
        searchParams.delete("open");
        setSearchParams(searchParams, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-5">
      <Link to="/sales" className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]" data-testid="quo-back-btn">
        <ArrowLeft size={16} weight="bold" /> Kembali ke Sales Sub-Portal
      </Link>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={22} weight="duotone" className="text-amber-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Quotation</h1>
          </div>
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Format: 001/MKS/Q/VII/2026 · Reset counter tiap bulan</p>
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

      {/* Quotation stats — ringkas + detail digabung jadi satu kartu per status (clickable filter) */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" data-testid="quo-stats-grid">
          {[
            { key: "", label: "Total Quotation", dot: "bg-slate-400", testid: "quo-stat-total" },
            { key: "on_bidding", label: "On Bidding", dot: "bg-amber-500", testid: "quo-stat-on-bidding" },
            { key: "confirm_order", label: "Confirm Order", dot: "bg-emerald-500", testid: "quo-stat-confirm" },
            { key: "cancel", label: "Cancel", dot: "bg-red-500", testid: "quo-stat-cancel" },
          ].map((c) => {
            const isTotal = c.key === "";
            const cnt = isTotal ? (stats.quotations?.total ?? 0) : (stats.quotations?.by_status?.[c.key] || 0);
            const pts = isTotal ? null : (stats.quotations?.unique_pts_by_status?.[c.key] || 0);
            const vals = isTotal ? null : (stats.quotations?.values_by_status?.[c.key] || {});
            const active = statusFilter === c.key;
            return (
              <button
                key={c.key || "total"}
                type="button"
                onClick={() => setStatusFilter(isTotal ? "" : (statusFilter === c.key ? "" : c.key))}
                data-testid={c.testid}
                className={`text-left border p-2.5 transition-colors ${
                  active ? "border-slate-900 ring-1 ring-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500">{c.label}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums text-slate-900 leading-none" style={{ fontFamily: "Chivo, sans-serif" }} data-testid={isTotal ? undefined : `quo-count-${c.key}`}>{cnt}</span>
                  {pts != null && (
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      · <b className="text-slate-700 tabular-nums" data-testid={`quo-pts-${c.key}`}>{pts}</b> perusahaan
                    </span>
                  )}
                </div>
                {vals != null && (
                  <div className="mt-1.5 border-t border-slate-100 pt-1 space-y-0.5">
                    {Object.entries(vals).length === 0 ? (
                      <div className="text-[10px] text-slate-400 italic">Belum ada nilai</div>
                    ) : (
                      Object.entries(vals).map(([cur, amt]) => (
                        <div key={cur} className="flex justify-between text-[11px] font-mono">
                          <span className="text-slate-500">{cur}</span>
                          <span className="font-bold text-slate-900 tabular-nums">{Number(amt).toLocaleString("id-ID")}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] max-w-lg">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari <span className="text-slate-400 font-normal normal-case">(No Quotation / Customer / Project / Item / SO / No Inquiry)</span></Label>
          <Input data-testid="quo-search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="mis. 001/MKS/Q · SPM · SO 1234" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sales</Label>
          <select
            data-testid="quo-sales-filter"
            className={`${inputCls} w-36 bg-white`}
            value={salesFilter}
            onChange={(e) => setSalesFilter(e.target.value)}
          >
            <option value="">Semua Sales</option>
            {SALES_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Bulan <span className="normal-case text-slate-400">(cepat)</span></Label>
          <Input data-testid="quo-month-filter" type="month" className={`${inputCls} w-40`} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tanggal</Label>
          <Input data-testid="quo-start-date" type="date" className={`${inputCls} w-40`} value={startDate} onChange={(e) => { setStartDate(e.target.value); setMonthFilter(""); }} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tanggal</Label>
          <Input data-testid="quo-end-date" type="date" className={`${inputCls} w-40`} value={endDate} onChange={(e) => { setEndDate(e.target.value); setMonthFilter(""); }} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Urutkan</Label>
          <SortDropdown testid="quo-sort" value={sortBy} onChange={setSortBy} options={QUO_SORT_OPTS} />
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
        {(query || statusFilter || monthFilter || salesFilter || startDate !== _firstOfMonth || endDate !== _today) && (
          <Button variant="ghost" onClick={() => { setQuery(""); setStatusFilter(""); setMonthFilter(""); setSalesFilter(""); setStartDate(_firstOfMonth); setEndDate(_today); }} className="rounded-none h-9 text-xs" data-testid="quo-clear-filter">
            <X size={12} weight="bold" className="mr-1" /> Reset Filter
          </Button>
        )}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Daftar Quotation — {(salesFilter ? items.filter((q) => (q.created_by_name || "").toLowerCase() === salesFilter.toLowerCase()) : items).length}
          {salesFilter && <span className="ml-2 normal-case tracking-normal text-slate-400">(filter Sales: <b className="text-slate-700">{salesFilter}</b>)</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">No Quotation</th>
                <th className="text-left p-3">Rev</th>
                <th className="text-left p-3">Ref Inquiry</th>
                <th className="text-left p-3">SO No</th>
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
              {loading && (<tr><td colSpan={12} className="p-6 text-center text-slate-400"><CircleNotch size={18} className="inline animate-spin" /></td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={12} className="p-8 text-center text-slate-400">Belum ada quotation.</td></tr>)}
              {!loading && items.length > 0 && salesFilter && items.filter((q) => (q.created_by_name || "").toLowerCase() === salesFilter.toLowerCase()).length === 0 && (
                <tr><td colSpan={12} className="p-8 text-center text-slate-400">Tidak ada quotation untuk Sales <b>{salesFilter}</b>.</td></tr>
              )}
              {sortItems(salesFilter ? items.filter((q) => (q.created_by_name || "").toLowerCase() === salesFilter.toLowerCase()) : items, sortBy, QUO_SORT_OPTS).length > 0 && pag.pagedData.map((q) => (
                <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono font-semibold text-slate-900">{q.quotation_no}</td>
                  <td className="p-3 text-xs">{q.revision_no > 1 ? <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 font-bold text-[10px]">R{q.revision_no}</span> : <span className="text-slate-400">-</span>}</td>
                  <td className="p-3 text-xs font-mono text-slate-600">{q.inquiry_no || "-"}</td>
                  <td className="p-3 text-xs font-mono font-bold text-emerald-700">{q.so_no || "-"}</td>
                  <td className="p-3 text-slate-700 text-xs whitespace-nowrap tabular-nums">{(q.created_at || "").slice(0, 10)}</td>
                  <td className="p-3 text-slate-800">{q.customer_name}</td>
                  <td className="p-3 text-slate-700 text-xs">{q.attention || "-"}</td>
                  <td className="p-3 text-slate-600 text-xs max-w-[220px] truncate" title={(q.items || []).map(it => it.description).join(", ")}>
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
        <PaginationBar {...pag} label="quotation" testIdPrefix="quo-pag" />
      </Card>

      {showCreate && <CreateQuotationDialog prefill={prefill} onClose={closeCreate} onCreated={() => { closeCreate(); load(); }} />}
      {openQ && <QuotationDetailDialog id={openQ.id} onClose={() => setOpenQ(null)} onChanged={load} />}
    </div>
  );
}


function CreateQuotationDialog({ onClose, onCreated, prefill = null }) {
  const [customerName, setCustomerName] = useState(prefill?.customer_name || "");
  const [customerAddress, setCustomerAddress] = useState(prefill?.customer_address || "");
  const [showAddCust, setShowAddCust] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [customerConfirmed, setCustomerConfirmed] = useState(!!prefill?.customer_name); // true bila customer sudah dari Master / inquiry
  const [registerThenSave, setRegisterThenSave] = useState(false); // true bila dialog dibuka dari tombol Simpan (auto-lanjut simpan)
  const [attention, setAttention] = useState(prefill?.attention || "");
  const [cc, setCc] = useState("");
  const [quotationNoOverride, setQuotationNoOverride] = useState("");
  const [nextQuotationNo, setNextQuotationNo] = useState("");

  // Fetch next quotation number preview on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/quotations/next-no");
        setNextQuotationNo(data.quotation_no || "");
      } catch { /* silent */ }
    })();
  }, []);
  const [inquiryId, setInquiryId] = useState(prefill?.inquiry_id || "");
  const [inquiryNo, setInquiryNo] = useState(prefill?.inquiry_no || "");
  const [inquirySearchOpen, setInquirySearchOpen] = useState(false);
  const [inquirySearch, setInquirySearch] = useState("");
  const [inquiryOptions, setInquiryOptions] = useState([]);
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
  const [deliveryTime, setDeliveryTime] = useState(DELIVERY_TIME_DEFAULT);
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

  // Search inquiries when user opens dropdown
  useEffect(() => {
    if (!inquirySearchOpen) return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/inquiries", { params: { q: inquirySearch, status: "accepted" } });
        setInquiryOptions(data.items || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [inquirySearch, inquirySearchOpen]);

  const pickInquiry = async (inq) => {
    setInquiryId(inq.id);
    setInquiryNo(inq.inquiry_no);
    setCustomerName(inq.customer_name || "");
    setCustomerConfirmed(!!(inq.customer_name || "").trim());
    // prefill items if any
    if ((inq.items || []).length && !items.some((it) => it.description.trim())) {
      setItems(inq.items.map((it, i) => ({
        no: i + 1,
        description: `${it.item_name}${it.specification ? " — " + it.specification : ""}`.trim(),
        qty: Number(it.qty) || 1,
        unit: it.unit || "EA",
        unit_price: 0,
      })));
    }
    setInquirySearchOpen(false);
    toast.success(`Terhubung ke Inquiry ${inq.inquiry_no}`);
  };

  const submit = async () => {
    if (!customerName.trim()) return toast.error("Customer wajib diisi");
    // Wajib ada di Master Customer — kalau belum, popup input lengkap dulu
    try {
      const resp = await api.get("/customers", { params: { q: customerName.trim() } });
      const list = resp.data?.items || resp.data || [];
      const exists = list.some((c) => (c.name || c.customer_name || "").trim().toLowerCase() === customerName.trim().toLowerCase());
      if (!exists) {
        toast.info("Customer belum terdaftar — lengkapi data Master Customer dulu");
        setRegisterThenSave(true);
        setShowAddCust(true);
        return;
      }
    } catch (_) { /* kalau cek gagal, lanjutkan saja agar tidak memblok */ }
    setSaving(true);
    try {
      const { data } = await api.post("/quotations", {
        inquiry_id: inquiryId || null,
        quotation_no_override: quotationNoOverride.trim() || null,
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

  // Lanjutkan simpan Quotation otomatis setelah customer baru ditambahkan ke Master
  useEffect(() => {
    if (autoSubmit) { setAutoSubmit(false); submit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit]);

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
          {/* Inquiry Reference Picker + Nomor Override */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Ref Inquiry (opsional)</Label>
              {inquiryId ? (
                <div className="flex items-center gap-2 h-9 border border-emerald-400 bg-emerald-50 px-2 text-xs">
                  <span className="font-mono font-bold text-emerald-800">🔗 {inquiryNo}</span>
                  <button type="button" onClick={() => { setInquiryId(""); setInquiryNo(""); }} className="ml-auto text-red-600 hover:bg-red-100 px-1"><X size={12} weight="bold" /></button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    data-testid="quo-inquiry-search"
                    className={inputCls}
                    value={inquirySearch}
                    onChange={(e) => { setInquirySearch(e.target.value); setInquirySearchOpen(true); }}
                    onFocus={() => setInquirySearchOpen(true)}
                    onBlur={() => setTimeout(() => setInquirySearchOpen(false), 200)}
                    placeholder="Cari inquiry (No / Customer / Project)"
                  />
                  {inquirySearchOpen && inquiryOptions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-300 shadow-md max-h-56 overflow-y-auto z-30">
                      {inquiryOptions.map((inq) => (
                        <button key={inq.id} type="button" onClick={() => pickInquiry(inq)} className="w-full text-left px-2 py-1.5 hover:bg-slate-100 border-b border-slate-100 text-xs">
                          <div className="font-mono font-bold text-slate-900">{inq.inquiry_no}</div>
                          <div className="text-slate-600">{inq.customer_name} · {inq.project_name || "-"}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="text-[10px] text-slate-500 mt-1">Filter: hanya inquiry <b>accepted</b> (Engineering sudah selesai kerja).</div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                Nomor Quotation {nextQuotationNo && (
                  <span className="ml-1 font-mono text-amber-700 normal-case tracking-normal">
                    (berikutnya: <b>{nextQuotationNo}</b>)
                  </span>
                )}
              </Label>
              <Input
                data-testid="quo-no-override"
                className={`${inputCls} font-mono`}
                value={quotationNoOverride}
                onChange={(e) => setQuotationNoOverride(e.target.value)}
                placeholder={nextQuotationNo ? `Auto: ${nextQuotationNo}` : "Auto: 001/MKS/Q/VII/2026"}
              />
              <div className="text-[10px] text-slate-500 mt-1">Kosongkan untuk auto-generate. Isi manual jika perlu.</div>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Customer * <span className="normal-case font-normal text-slate-400">(dari Master Customer)</span></Label>
            <CustomerAutocompleteInput
              value={customerName}
              confirmed={customerConfirmed}
              onType={(v) => { setCustomerName(v); setCustomerConfirmed(false); }}
              onPick={(c) => {
                setCustomerName(c.name || "");
                if (c.address) setCustomerAddress(c.address);
                if (c.pic) setAttention(c.pic);
                setCustomerConfirmed(true);
                toast.success(`Customer "${c.name}" terhubung ke Master Customer`);
              }}
              onRegister={() => { setRegisterThenSave(false); setShowAddCust(true); }}
            />
          </div>
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Alamat Customer</Label><Input className={inputCls} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Batam, Kepulauan Riau" /></div>
          {/* Attention & CC — stacked (satu tempat), Attention di atas CC */}
          <div className="border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">To : (Attention &amp; CC)</div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Attention</Label>
              <Input data-testid="quo-attention" className={inputCls} value={attention} onChange={(e) => setAttention(e.target.value)} placeholder="Mrs. Sakina" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">CC</Label>
              <Input data-testid="quo-cc" className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Ms Ade R. / Mr Yudha P." />
            </div>
          </div>

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
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Payment</Label>
              <Input
                data-testid="quo-payment"
                list="payment-term-options"
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
                className={inputCls}
                placeholder="Pilih atau ketik manual…"
              />
              <datalist id="payment-term-options">
                {PAYMENT_TERM_OPTIONS.map((opt) => <option key={opt} value={opt} />)}
              </datalist>
            </div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Delivery</Label><Input data-testid="quo-delivery" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className={inputCls} placeholder="6-8 Weeks after PO" /></div>
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
        <DialogFooter className="sticky bottom-0 bg-white border-t border-slate-200 -mx-6 px-6 py-3 mt-4">
          <Button data-testid="quo-close" variant="outline" onClick={onClose} disabled={saving} className="rounded-none">
            <X size={13} weight="bold" className="mr-1" /> Tutup
          </Button>
          <Button data-testid="quo-save" onClick={submit} disabled={saving} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white">{saving ? "Menyimpan..." : "Simpan Quotation"}</Button>
        </DialogFooter>
      </DialogContent>

      <AddCustomerDialog
        open={showAddCust}
        initialName={customerName}
        onClose={() => setShowAddCust(false)}
        onSaved={(c) => {
          setCustomerName(c.name);
          if (c.address) setCustomerAddress(c.address);
          if (c.pic) setAttention(c.pic);
          setCustomerConfirmed(true);
          setShowAddCust(false);
          toast.success(`Customer "${c.name}" terdaftar & terpilih`);
          // Kalau dialog dibuka dari tombol Simpan → lanjutkan simpan otomatis.
          // Kalau dari tombol inline "Daftarkan" → cukup pilih, biar user lengkapi item/harga dulu.
          if (registerThenSave) { setRegisterThenSave(false); setAutoSubmit(true); }
        }}
      />
    </Dialog>
  );
}


function QuotationDetailDialog({ id, onClose, onChanged }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [soDialog, setSoDialog] = useState(null);

  useEffect(() => { (async () => {
    try { const { data } = await api.get(`/quotations/${id}`); setD(data); } catch { onClose(); } finally { setLoading(false); }
  })(); }, [id, onClose]);

  const reload = async () => {
    const { data } = await api.get(`/quotations/${id}`);
    setD(data); onChanged();
  };

  const setStatus = async (status) => {
    if (status === "confirm_order") {
      if (!window.confirm("Order akan dikonfirmasi.\n\nAnda akan diarahkan ke halaman Buat Sales Order untuk membuat SO (data quotation ini otomatis ter-isi). Lanjutkan?")) return;
      navigate("/sales/sales-orders", { state: { fromQuotation: d } });
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/quotations/${id}/status`, { status });
      toast.success(`Status: ${status}`);
      await reload();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); } finally { setSaving(false); }
  };

  const submitSO = async () => {
    if (!soDialog) return;
    const raw = (soDialog.soNo || "").trim();
    if (!/^\d{1,6}$/.test(raw)) { toast.error("Nomor SO harus angka maksimal 6 digit"); return; }
    const so = raw.padStart(6, "0");  // normalisasi ke 6 digit (5251 -> 005251)
    setSaving(true);
    try {
      await api.patch(`/quotations/${id}/status`, { status: "confirm_order", so_no: so, force_reuse_so: !!soDialog.force });
      toast.success(`Order dikonfirmasi dengan SO ${so}`);
      setSoDialog(null);
      await reload();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409 && typeof detail === "object" && detail.code === "SO_EXISTS") {
        setSoDialog({ ...soDialog, conflict: detail });
        toast.warning(`Nomor SO ${so} sudah ada di Master List`);
      } else {
        toast.error(typeof detail === "string" ? detail : "Gagal update status");
      }
    } finally { setSaving(false); }
  };

  const isConfirmed = d?.status === "confirm_order";
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const doDelete = async () => {
    // Setelah Confirm Order, hapus terkunci — hanya admin & wajib alasan (terotorisasi).
    if (isConfirmed) {
      if (!isAdmin) {
        toast.error("Quotation sudah Confirm Order. Hapus harus diotorisasi Admin.");
        return;
      }
      const reason = window.prompt(`OTORISASI ADMIN — Hapus Quotation ${d?.quotation_no} yang sudah Confirm Order.\n\nTulis ALASAN penghapusan (wajib):`);
      if (reason === null) return;
      if (!reason.trim()) { toast.error("Alasan wajib diisi"); return; }
      setSaving(true);
      try {
        await api.delete(`/quotations/${id}`, { params: { reason: reason.trim() } });
        toast.success("Quotation dihapus (terotorisasi Admin)");
        onChanged(); onClose();
      } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); } finally { setSaving(false); }
      return;
    }
    if (!window.confirm(`Hapus Quotation ${d?.quotation_no}? Aksi ini tidak bisa dibatalkan.`)) return;
    setSaving(true);
    try {
      await api.delete(`/quotations/${id}`);
      toast.success("Quotation dihapus");
      onChanged();
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); } finally { setSaving(false); }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/quotations/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quotation_${(d.quotation_no || id).replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF ter-download");
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal generate PDF"); }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="rounded-none max-w-2xl max-h-[90vh] overflow-y-auto">
          {loading || !d ? <div className="p-8 text-center"><CircleNotch size={20} className="inline animate-spin" /></div> : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{d.quotation_no}</span>
                  <Badge status={d.status} />
                  {d.revision_no > 1 && (
                    <span className="text-[10px] uppercase tracking-[0.05em] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-300">Rev #{d.revision_no}</span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {d.customer_name}
                  {d.inquiry_no && <span className="ml-2 text-slate-500">🔗 Ref Inquiry <span className="font-mono">{d.inquiry_no}</span></span>}
                  {d.so_no && <span className="ml-2 text-emerald-700 font-semibold">✓ SO {d.so_no}</span>}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Attention</div>{d.attention || "-"}</div>
                <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">CC</div>{d.cc || "-"}</div>
                <div className="col-span-2"><div className="text-[10px] uppercase text-slate-400 mb-0.5">Alamat</div>{d.customer_address || "-"}</div>
                <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Total</div><b>{d.currency} {Number(d.total_amount || 0).toLocaleString("id-ID")}</b></div>
                <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Payment</div>{d.payment_term || "-"}</div>
                <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Delivery</div>{d.delivery_time || "-"}</div>
                <div><div className="text-[10px] uppercase text-slate-400 mb-0.5">Validity</div>{d.validity || "-"}</div>
                <div className="col-span-2"><div className="text-[10px] uppercase text-slate-400 mb-0.5">Dibuat</div>{d.created_by_name} · {(d.created_at || "").slice(0, 10)}</div>
                {d.last_revised_by && (
                  <div className="col-span-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 p-2">
                    ✏️ Terakhir direvisi: <b>{d.last_revised_by}</b>{d.last_revision_reason ? <> — <i>{d.last_revision_reason}</i></> : null}
                  </div>
                )}
              </div>
              {(d.items || []).length > 0 && (
                <div className="mt-3 border border-slate-200 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50"><tr><th className="p-1 text-left">#</th><th className="p-1 text-left">Description</th><th className="p-1 text-right">Qty</th><th className="p-1 text-left">Unit</th><th className="p-1 text-right">Unit Price</th><th className="p-1 text-right">Total</th></tr></thead>
                    <tbody>{d.items.map((it, i) => (<tr key={i} className="border-t border-slate-100"><td className="p-1 text-slate-400">{i + 1}</td><td className="p-1">{it.description}</td><td className="p-1 text-right tabular-nums">{it.qty}</td><td className="p-1 text-slate-600">{it.unit}</td><td className="p-1 text-right tabular-nums">{Number(it.unit_price || 0).toLocaleString("id-ID")}</td><td className="p-1 text-right tabular-nums font-semibold">{Number(it.total_price || (Number(it.qty)||0) * (Number(it.unit_price)||0)).toLocaleString("id-ID")}</td></tr>))}</tbody>
                  </table>
                </div>
              )}
              {(d.notes_lines || []).length > 0 && (
                <div className="mt-3 p-2 bg-slate-50 text-xs">
                  <div className="font-bold text-slate-500 uppercase tracking-[0.1em] text-[10px] mb-1">Notes</div>
                  {d.notes_lines.map((n, i) => <div key={i}>• {n}</div>)}
                </div>
              )}
              {(d.revision_history || []).length > 0 && (
                <details className="mt-3 border border-purple-200 bg-purple-50">
                  <summary className="cursor-pointer p-2 text-[11px] font-bold uppercase tracking-[0.1em] text-purple-800">📜 Riwayat Revisi ({d.revision_history.length})</summary>
                  <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
                    {d.revision_history.map((h, i) => (
                      <div key={i} className="text-[11px] border-l-2 border-purple-400 pl-2">
                        <div className="font-semibold text-purple-900">Rev #{h.revision_no} — {(h.snapshot_at || "").slice(0, 16).replace("T", " ")}</div>
                        <div>oleh <b>{h.snapshot_by}</b>{h.reason ? <> · <i>{h.reason}</i></> : null}</div>
                        <div className="text-slate-500 mt-0.5">Total: {h.currency} {Number(h.total_amount || 0).toLocaleString("id-ID")} · {(h.items || []).length} item</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div className="mt-4 pt-3 border-t border-slate-200 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button data-testid="btn-preview-quotation" onClick={() => setShowPreview(true)} variant="outline" className="rounded-none text-xs">
                    <Eye size={13} weight="bold" className="mr-1" /> Preview
                  </Button>
                  <Button data-testid="btn-download-quotation-pdf" onClick={downloadPdf} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs">
                    <FileText size={13} weight="bold" className="mr-1.5" /> Download PDF
                  </Button>
                  <Button data-testid="btn-edit-quotation" onClick={() => setShowEdit(true)} variant="outline" className="rounded-none text-xs border-purple-400 text-purple-700 hover:bg-purple-50" disabled={d.status === "cancel" || isConfirmed} title={isConfirmed ? "Terkunci: sudah Confirm Order" : "Edit / Revisi (hanya sebelum Confirm Order)"}>
                    <PencilSimple size={13} weight="bold" className="mr-1" /> Edit / Revisi
                  </Button>
                  <Button data-testid="btn-delete-quotation" onClick={doDelete} variant="outline" className="rounded-none text-xs border-red-400 text-red-700 hover:bg-red-50 disabled:opacity-40" disabled={saving || (isConfirmed && !isAdmin)} title={isConfirmed ? (isAdmin ? "Hapus perlu alasan (otorisasi admin)" : "Terkunci: perlu otorisasi admin untuk hapus") : "Hapus"}>
                    <Trash size={13} weight="bold" className="mr-1" /> Hapus {isConfirmed && <Lock size={11} weight="bold" className="ml-1" />}
                  </Button>
                </div>
                {isConfirmed ? (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-300 text-[11px] text-emerald-800" data-testid="quo-locked-note">
                    <Lock size={14} weight="bold" />
                    <span>Quotation sudah <b>Confirm Order</b>{d.so_no ? <> (SO <b>{d.so_no}</b>)</> : null}. Ganti status & edit terkunci. Hapus hanya oleh Admin dengan alasan.</span>
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Update Status</div>
                    <div className="flex gap-2 flex-wrap">
                      <Button data-testid="status-on-bidding" onClick={() => setStatus("on_bidding")} disabled={saving || d.status === "on_bidding"} variant="outline" className="rounded-none text-xs">On Bidding</Button>
                      <Button data-testid="status-confirm" onClick={() => setStatus("confirm_order")} disabled={saving} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Confirm Order (Buat SO)</Button>
                      <Button data-testid="status-cancel" onClick={() => setStatus("cancel")} disabled={saving || d.status === "cancel"} className="rounded-none bg-red-600 hover:bg-red-700 text-white text-xs">Cancel</Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showPreview && d && (
        <QuotationPreviewDialog quotation={d} onClose={() => setShowPreview(false)} onDownload={downloadPdf} />
      )}
      {showEdit && d && (
        <EditQuotationDialog quotation={d} onClose={() => setShowEdit(false)} onSaved={async () => { setShowEdit(false); await reload(); }} />
      )}
      {soDialog !== null && (
        <Dialog open={true} onOpenChange={() => !saving && setSoDialog(null)}>
          <DialogContent className="rounded-none max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Konfirmasi Order — Input Nomor SO</DialogTitle>
              <DialogDescription>Wajib angka maksimal 6 digit (mis. 5251 → 005251). SO otomatis masuk ke Master List SO.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO (6 digit) *</Label>
                <SoAutocompleteInput value={soDialog.soNo} onChange={(v) => setSoDialog({ ...soDialog, soNo: v, conflict: null, force: false })} />
              </div>
              {soDialog.conflict && (
                <div className="p-3 bg-amber-50 border-2 border-amber-400 text-xs space-y-1">
                  <div className="font-bold text-amber-900">⚠️ Nomor SO {soDialog.conflict.so_no} sudah ada di Master List</div>
                  <div><b>Customer:</b> {soDialog.conflict.customer || "-"}</div>
                  <div><b>Tanggal SO:</b> {soDialog.conflict.so_date || "-"}</div>
                  <div><b>Deskripsi:</b> {soDialog.conflict.description || "-"}</div>
                  {soDialog.conflict.used_by_quotation && (
                    <div className="mt-1 p-1 bg-red-100 text-red-900 font-semibold">⛔ Dipakai oleh Quotation <span className="font-mono">{soDialog.conflict.used_by_quotation}</span></div>
                  )}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-red-600" checked={!!soDialog.force} onChange={(e) => setSoDialog({ ...soDialog, force: e.target.checked })} />
                    <span>Saya tetap pakai nomor SO ini</span>
                  </label>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSoDialog(null)} disabled={saving} className="rounded-none">Batal</Button>
              <Button data-testid="submit-so-confirm" onClick={submitSO} disabled={saving || !soDialog.soNo || (soDialog.conflict && !soDialog.force)} className="rounded-none bg-emerald-600 text-white">
                {saving ? "Menyimpan..." : "Konfirmasi Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}


function CustomerAutocompleteInput({ value, onType, onPick, onRegister, confirmed, placeholder = "Ketik nama customer (mis. PT. SPM Oil & Gas)" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/customers", { params: { q: value || "", limit: 12 } });
        setSuggestions(data.items || []);
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [value, open]);

  const trimmed = (value || "").trim();
  const exactMatch = suggestions.find((c) => (c.name || "").toLowerCase() === trimmed.toLowerCase());
  // Belum terdaftar: user sudah mengetik, tidak sedang loading, tidak ada yang sama persis, belum dikonfirmasi
  const notFound = trimmed.length >= 2 && !loading && !exactMatch && !confirmed;

  return (
    <div className="relative">
      <Input
        data-testid="quo-customer"
        className={`${inputCls} ${confirmed ? "border-emerald-500 bg-emerald-50" : notFound ? "border-amber-500" : ""}`}
        value={value}
        autoComplete="off"
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
      />
      {confirmed && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 text-[11px] font-bold pointer-events-none">✓ terkonfirmasi</span>}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-300 shadow-md max-h-56 overflow-y-auto z-30" data-testid="quo-customer-suggestions">
          <div className="px-2 py-1 bg-slate-50 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 border-b border-slate-200 flex items-center justify-between">
            <span>Master Customer{suggestions.length ? ` (${suggestions.length})` : ""}</span>
            {loading && <CircleNotch size={11} className="animate-spin" />}
          </div>
          {!loading && suggestions.length === 0 ? (
            <div className="px-2 py-2 text-xs text-slate-400 italic">
              Tidak ada customer cocok. Klik "Daftarkan Customer Baru" di bawah untuk mengisi data lengkap.
            </div>
          ) : (
            suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                data-testid={`quo-customer-opt-${c.id}`}
                className="w-full text-left px-2 py-1.5 hover:bg-amber-50 border-b border-slate-100 text-xs"
              >
                <div className="font-semibold text-slate-900">{c.name}{c.customer_code ? <span className="ml-1 font-mono text-[10px] text-amber-700">[{c.customer_code}]</span> : null}</div>
                <div className="text-slate-500 text-[11px]">{c.address || "(alamat kosong)"}{c.pic ? ` · PIC: ${c.pic}` : ""}</div>
              </button>
            ))
          )}
        </div>
      )}
      {notFound && (
        <div className="mt-1 p-2 bg-amber-50 border border-amber-300 flex items-center justify-between gap-2" data-testid="quo-cust-not-found">
          <div className="text-[11px] text-amber-800">
            <b>&quot;{trimmed}&quot;</b> belum terdaftar di Master Customer.
          </div>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onRegister?.(); }}
            className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
            data-testid="quo-cust-register-btn"
          >
            + Daftarkan Customer Baru
          </button>
        </div>
      )}
    </div>
  );
}


function SoAutocompleteInput({ value, onChange, placeholder = "005251" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (!value || value.length < 1) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/sales-orders/autocomplete", { params: { q: value } });
        setSuggestions(data.items || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative">
      <Input
        data-testid="so-input"
        value={value}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); onChange(v); setShowList(true); }}
        onBlur={() => { if (value && /^\d{1,6}$/.test(value)) onChange(value.padStart(6, "0")); setTimeout(() => setShowList(false), 200); }}
        onFocus={() => setShowList(true)}
        maxLength={6}
        inputMode="numeric"
        placeholder={placeholder}
        className={`${inputCls} font-mono tabular-nums text-lg tracking-wider`}
      />
      {showList && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-300 shadow-md max-h-48 overflow-y-auto z-30">
          <div className="px-2 py-1 bg-slate-50 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 border-b border-slate-200">SO Master ({suggestions.length})</div>
          {suggestions.map((s) => (
            <button key={s.so_no} type="button" onClick={() => { onChange(s.so_no); setShowList(false); }} className="w-full text-left px-2 py-1.5 hover:bg-slate-100 border-b border-slate-100 text-xs">
              <div className="font-mono font-bold text-slate-900">{s.so_no}</div>
              <div className="text-slate-500 text-[11px]">{s.customer || "-"} · {s.so_date || ""}{s.source_quotation_no ? ` · from ${s.source_quotation_no}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function QuotationPreviewDialog({ quotation, onClose, onDownload }) {
  const d = quotation;
  const currency = (d.currency || "IDR").toUpperCase();
  const fmtMoney = (v) => {
    const n = Number(v || 0);
    if (currency === "IDR") return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const dateStr = (() => {
    try { return new Date(d.created_at).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
    catch { return (d.created_at || "").slice(0, 10); }
  })();
  const notesLines = d.notes_lines || [];
  const items = d.items || [];
  const grand = Number(d.total_amount || items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.unit_price || 0)), 0));

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-2 sticky top-0 bg-white z-10 border-b border-slate-200">
          <DialogTitle>Preview Quotation — {d.quotation_no}</DialogTitle>
          <DialogDescription>Preview WYSIWYG — sama persis dengan PDF hasil download.</DialogDescription>
        </DialogHeader>

        {/* A4 page container with letterhead as background */}
        <div className="px-6 py-4">
          <div
            className="relative w-full mx-auto bg-white shadow-lg"
            style={{
              aspectRatio: "210 / 297",
              backgroundImage: "url('/letterhead.png')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              fontFamily: "Arial, Helvetica, sans-serif",
              color: "#0f172a",
            }}
            data-testid="quotation-preview-page"
          >
            {/* Content overlay — positions in % mirror the PDF coordinates */}
            <div className="absolute inset-0" style={{ padding: "15mm" }}>
              {/* Title (centered) */}
              <div className="absolute left-0 right-0 text-center" style={{ top: "14.5%" }}>
                <span className="inline-block border-b border-slate-800 pb-[2px] font-bold tracking-[0.2em]" style={{ fontSize: "22px", color: "#1E293B" }}>
                  QUOTATION
                </span>
              </div>

              {/* Customer block */}
              <div className="absolute" style={{ top: "18.5%", left: "7.1%", right: "50%" }}>
                <div className="font-bold" style={{ fontSize: "10.5px" }}>{d.customer_name || "-"}</div>
                <div className="whitespace-pre-line" style={{ fontSize: "9.5px", marginTop: "2px" }}>{d.customer_address || ""}</div>
              </div>

              {/* Quote meta right */}
              <div className="absolute" style={{ top: "18.5%", left: "62%", right: "7.1%", fontSize: "9.5px", lineHeight: "1.6" }}>
                <div className="flex"><span className="w-24">QUOTE NO</span><span>: {d.quotation_no}</span></div>
                <div className="flex"><span className="w-24">QUOTE DATE</span><span>: {dateStr}</span></div>
                <div className="flex"><span className="w-24">Page</span><span>: 1~1</span></div>
                {d.inquiry_no && <div className="flex"><span className="w-24">REF INQUIRY</span><span>: {d.inquiry_no}</span></div>}
              </div>

              {/* Attention + CC */}
              <div className="absolute" style={{ top: "28.5%", left: "7.1%", right: "7.1%", fontSize: "9.5px", lineHeight: "1.6" }}>
                <div className="flex"><span className="w-24">ATTENTION</span><span>: {d.attention || "-"}</span></div>
                <div className="flex"><span className="w-24">CC</span><span>: {d.cc || "-"}</span></div>
              </div>

              {/* Intro paragraph */}
              <div className="absolute text-justify" style={{ top: "35%", left: "7.1%", right: "7.1%", fontSize: "9.5px", lineHeight: "1.4" }}>
                Thank you for your inquiry and support to our company. With pleasure, we submit the quotes to your kind consideration as follows:
              </div>

              {/* Items table */}
              <div className="absolute" style={{ top: "39%", left: "7.1%", right: "7.1%" }}>
                <table className="w-full border-collapse" style={{ fontSize: "9px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#1E293B", color: "white" }}>
                      <th className="p-1 border border-slate-400" style={{ width: "5%" }}>NO</th>
                      <th className="p-1 border border-slate-400 text-left" style={{ width: "45%" }}>DESCRIPTION</th>
                      <th className="p-1 border border-slate-400 text-right" style={{ width: "8%" }}>QTY</th>
                      <th className="p-1 border border-slate-400 text-center" style={{ width: "7%" }}>UNIT</th>
                      <th className="p-1 border border-slate-400 text-right" style={{ width: "17.5%" }}>Unit Price ({currency})</th>
                      <th className="p-1 border border-slate-400 text-right" style={{ width: "17.5%" }}>AMOUNT ({currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="bg-white/70">
                        <td className="p-1 border border-slate-400 text-center">{i + 1}</td>
                        <td className="p-1 border border-slate-400 whitespace-pre-line">{it.description}</td>
                        <td className="p-1 border border-slate-400 text-right tabular-nums">{Number(it.qty || 0)}</td>
                        <td className="p-1 border border-slate-400 text-center">{it.unit || ""}</td>
                        <td className="p-1 border border-slate-400 text-right tabular-nums">{fmtMoney(it.unit_price)}</td>
                        <td className="p-1 border border-slate-400 text-right tabular-nums">{fmtMoney(it.total_price || Number(it.qty || 0) * Number(it.unit_price || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Note bullets */}
                {notesLines.length > 0 && (
                  <div className="mt-2 bg-white/70 p-1" style={{ fontSize: "9px" }}>
                    <b>Note :</b>
                    <ul className="ml-3 mt-0.5 space-y-0.5">
                      {notesLines.map((n, i) => <li key={i}>- {n}</li>)}
                    </ul>
                  </div>
                )}

                {/* Grand Total */}
                <div className="mt-1 flex" style={{ fontSize: "10.5px" }}>
                  <div style={{ width: "58%" }}></div>
                  <div className="flex flex-1 font-bold text-white" style={{ backgroundColor: "#1E293B" }}>
                    <div className="flex-1 text-right py-1.5 px-2">GRAND TOTAL ({currency})</div>
                    <div className="text-right py-1.5 px-2 tabular-nums" style={{ width: "50%" }}>{fmtMoney(grand)}</div>
                  </div>
                </div>

                {/* In Words */}
                {d.in_words && (
                  <div className="mt-2 bg-white/70 p-1" style={{ fontSize: "9px" }}>
                    <div className="flex"><span className="w-20 font-semibold">In Words :</span><span>{d.in_words}</span></div>
                    {d.in_words_id && <div className="flex"><span className="w-20"></span><span>{d.in_words_id}</span></div>}
                  </div>
                )}

                {/* Term & Conditions */}
                <div className="mt-3 bg-white/70 p-1.5" style={{ fontSize: "9px", lineHeight: "1.5" }}>
                  <div className="font-bold" style={{ fontSize: "10px" }}>Term &amp; Conditions :</div>
                  <div className="ml-2 mt-1">
                    <div className="flex"><span className="w-32">- Payment Term</span><span>: {d.payment_term || "-"}</span></div>
                    <div className="flex"><span className="w-32">- Delivery Time</span><span>: {d.delivery_time || "-"}</span></div>
                    <div className="flex"><span className="w-32">- Validity</span><span>: {d.validity || "-"}</span></div>
                  </div>
                </div>

                {/* Closing paragraph */}
                <div className="mt-2 text-justify bg-white/70 p-1" style={{ fontSize: "9px", lineHeight: "1.4" }}>
                  We trust that above quotation is acceptable to you and we look forward to your favorable reply. Should you require any further information, please do not hesitate to contact us.
                </div>
              </div>

              {/* Signature block */}
              <div className="absolute" style={{ bottom: "13%", left: "7.1%", right: "7.1%", fontSize: "9px" }}>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div>Yours faithfully,</div>
                    <div className="font-bold">PT MITRA KARYA SARANA</div>
                    <div style={{ height: "42px" }} />
                    <div className="font-bold">{d.signature_name || d.created_by_name || "-"}</div>
                    <div>{d.signature_position || "Sales Dept."}</div>
                  </div>
                  <div>
                    <div>Approved By :</div>
                    <div style={{ height: "58px" }} />
                    <div className="font-bold">{d.approver_name || "-"}</div>
                    <div>{d.approver_position || "Business Dev. Manager"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 pb-5 sticky bottom-0 bg-white border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
          <Button data-testid="btn-download-quotation-pdf" onClick={onDownload} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">
            <FileText size={13} weight="bold" className="mr-1.5" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function EditQuotationDialog({ quotation, onClose, onSaved }) {
  const [form, setForm] = useState({
    quotation_no_override: quotation.quotation_no || "",
    customer_name: quotation.customer_name || "",
    customer_address: quotation.customer_address || "",
    attention: quotation.attention || "",
    cc: quotation.cc || "",
    items: [...(quotation.items || [])],
    notes_lines: [...(quotation.notes_lines || [])],
    in_words: quotation.in_words || "",
    total_amount: quotation.total_amount || 0,
    currency: quotation.currency || "IDR",
    payment_term: quotation.payment_term || "",
    delivery_time: quotation.delivery_time || "",
    validity: quotation.validity || "",
    revision_reason: "",
  });
  const [saving, setSaving] = useState(false);
  const setItem = (i, k, v) => setForm((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setForm((p) => ({ ...p, items: [...p.items, { no: p.items.length + 1, description: "", qty: 1, unit: "EA", unit_price: 0 }] }));
  const rmItem = (i) => setForm((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  useEffect(() => {
    const t = form.items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.unit_price) || 0)), 0);
    if (t !== Number(form.total_amount)) setForm((p) => ({ ...p, total_amount: t }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.items]);

  const save = async () => {
    if (!form.revision_reason.trim()) return toast.error("Alasan revisi wajib diisi");
    if (!form.customer_name.trim()) return toast.error("Customer wajib diisi");
    setSaving(true);
    try {
      await api.patch(`/quotations/${quotation.id}`, form);
      toast.success("Quotation direvisi");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan revisi"); } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit / Revisi Quotation — {quotation.quotation_no}</DialogTitle>
          <DialogDescription>Perubahan menambah nomor revisi & tercatat di riwayat (seperti BOM).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-red-700 mb-1 block">Alasan Revisi *</Label>
            <Input data-testid="edit-quo-reason" className={inputCls} value={form.revision_reason} onChange={(e) => setForm({ ...form, revision_reason: e.target.value })} placeholder="mis. Update harga · Tambah item · Perbaiki alamat" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Quotation (bisa diubah manual)</Label>
              <Input className={`${inputCls} font-mono`} value={form.quotation_no_override} onChange={(e) => setForm({ ...form, quotation_no_override: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Customer *</Label>
              <Input className={inputCls} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Alamat Customer</Label>
              <textarea className="w-full min-h-[60px] border border-slate-300 p-2 text-sm rounded-none" value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} />
            </div>
            <div className="col-span-2 border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">To : (Attention &amp; CC)</div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Attention</Label><Input className={inputCls} value={form.attention} onChange={(e) => setForm({ ...form, attention: e.target.value })} placeholder="Mrs. Sakina" /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">CC</Label><Input className={inputCls} value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} placeholder="Ms Ade R. / Mr Yudha P." /></div>
            </div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Currency</Label><Input className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Total ({form.currency})</Label><Input className={`${inputCls} font-mono tabular-nums`} value={Number(form.total_amount).toLocaleString("id-ID")} disabled /></div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Payment Term</Label>
              <Input
                data-testid="edit-quo-payment"
                list="payment-term-options-edit"
                className={inputCls}
                value={form.payment_term}
                onChange={(e) => setForm({ ...form, payment_term: e.target.value })}
                placeholder="Pilih atau ketik manual…"
              />
              <datalist id="payment-term-options-edit">
                {PAYMENT_TERM_OPTIONS.map((opt) => <option key={opt} value={opt} />)}
              </datalist>
            </div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Delivery Time</Label><Input className={inputCls} value={form.delivery_time} onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} /></div>
            <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Validity</Label><Input className={inputCls} value={form.validity} onChange={(e) => setForm({ ...form, validity: e.target.value })} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold text-slate-600 block">Items</Label>
              <Button size="sm" variant="outline" onClick={addItem} className="rounded-none h-7 text-xs"><Plus size={11} weight="bold" className="mr-1" /> Tambah Item</Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-1">
                  <Input className={`${inputCls} col-span-5`} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Description" />
                  <Input className={`${inputCls} col-span-1 text-right`} type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} placeholder="Qty" />
                  <Input className={`${inputCls} col-span-1`} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} placeholder="Unit" />
                  <Input className={`${inputCls} col-span-2 text-right`} type="number" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} placeholder="Price" />
                  <Input className={`${inputCls} col-span-2 text-right tabular-nums`} value={((Number(it.qty) || 0) * (Number(it.unit_price) || 0)).toLocaleString("id-ID")} disabled />
                  <Button size="sm" variant="ghost" onClick={() => rmItem(i)} className="col-span-1 h-9 text-red-600 hover:bg-red-50 rounded-none px-0"><Trash size={13} weight="bold" /></Button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold text-slate-600 block">Notes (satu baris per note)</Label>
              <button
                type="button"
                data-testid="edit-quo-add-note"
                onClick={() => setForm((p) => ({ ...p, notes_lines: [...(p.notes_lines || []), ""] }))}
                className="text-[10px] uppercase font-semibold text-amber-600 border border-amber-300 hover:bg-amber-50 px-2 py-0.5 rounded-none"
              >
                <Plus size={11} weight="bold" className="inline mr-1" /> Tambah Note
              </button>
            </div>
            {(form.notes_lines || []).length === 0 && (
              <div className="text-xs italic text-slate-400 py-1">Belum ada note. Klik "Tambah Note" untuk menambahkan.</div>
            )}
            {(form.notes_lines || []).map((n, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <Input
                  data-testid={`edit-quo-note-${i}`}
                  value={n}
                  onChange={(e) => setForm((p) => ({ ...p, notes_lines: p.notes_lines.map((x, idx) => idx === i ? e.target.value : x) }))}
                  className={inputCls}
                  placeholder={`Note ${i + 1}`}
                />
                <button
                  type="button"
                  data-testid={`edit-quo-note-remove-${i}`}
                  onClick={() => setForm((p) => ({ ...p, notes_lines: p.notes_lines.filter((_, idx) => idx !== i) }))}
                  className="p-1 text-slate-400 hover:text-red-600"
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 bg-white border-t border-slate-200 -mx-6 px-6 py-3 mt-4">
          <Button data-testid="edit-quo-close" variant="outline" onClick={onClose} disabled={saving} className="rounded-none"><X size={13} weight="bold" className="mr-1" /> Tutup</Button>
          <Button data-testid="save-edit-quo" onClick={save} disabled={saving} className="rounded-none bg-purple-600 hover:bg-purple-700 text-white">
            <PencilSimple size={13} weight="bold" className="mr-1.5" /> {saving ? "Menyimpan..." : "Simpan Revisi"}
          </Button>
        </DialogFooter>
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

function QuoStatCard({ label, value, accent = "slate", testid, active = false, onClick }) {
  const cls = QUO_ACCENT[accent] || QUO_ACCENT.slate;
  const activeCls = active ? "ring-2 ring-offset-1 ring-slate-900 shadow-md" : "hover:shadow-sm hover:opacity-90";
  return (
    <button type="button" onClick={onClick} className={`text-left border ${cls} p-3 cursor-pointer transition-all ${activeCls}`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-70">{label}</div>
      <div className="text-3xl font-bold tabular-nums leading-none mt-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>{value ?? 0}</div>
    </button>
  );
}

