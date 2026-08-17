import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import PdfPreviewModal from "../components/PdfPreviewModal";
import PageTabNav from "../components/PageTabNav";
import { useInquiryTabs } from "../hooks/useEngTabs";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import {
  Storefront, Wrench, ArrowLeft, Plus, PaperPlaneTilt, Trash, Paperclip, DownloadSimple,
  FileText, ClockCounterClockwise, ChatCircleDots, Check, X, MagnifyingGlass,
  CircleNotch, Warning, ArrowClockwise, PencilSimple, Receipt, MicrosoftExcelLogo,
  UserPlus, UserCircle, CalendarBlank, ClipboardText, PlayCircle, CheckCircle,
} from "@phosphor-icons/react";
import { SortDropdown, sortItems, cmpStr, cmpDateStr } from "../components/SortDropdown";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const INQ_SORT_OPTS = [
  { value: "created_desc", label: "Tanggal Buat: Baru → Lama", sort: (a, b) => cmpDateStr(b.created_at, a.created_at) },
  { value: "created_asc", label: "Tanggal Buat: Lama → Baru", sort: (a, b) => cmpDateStr(a.created_at, b.created_at) },
  { value: "no_asc", label: "No Inquiry: A → Z", sort: (a, b) => cmpStr(a.inquiry_no, b.inquiry_no) },
  { value: "no_desc", label: "No Inquiry: Z → A", sort: (a, b) => cmpStr(b.inquiry_no, a.inquiry_no) },
  { value: "cust_asc", label: "Customer: A → Z", sort: (a, b) => cmpStr(a.customer_name, b.customer_name) },
  { value: "cust_desc", label: "Customer: Z → A", sort: (a, b) => cmpStr(b.customer_name, a.customer_name) },
  { value: "title_asc", label: "Judul: A → Z", sort: (a, b) => cmpStr(a.title, b.title) },
  { value: "deadline_asc", label: "Deadline: Terdekat", sort: (a, b) => cmpDateStr(a.customer_deadline || "9999", b.customer_deadline || "9999") },
  { value: "status_asc", label: "Status: A → Z", sort: (a, b) => cmpStr(a.status, b.status) },
];

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-rose-600 text-sm";

const STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  pending_boss_review: { label: "Menunggu Review Bos", cls: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300" },
  rejected: { label: "Ditolak Bos", cls: "bg-red-100 text-red-800 border-red-400" },
  submitted: { label: "Terkirim", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  in_progress: { label: "Dikerjakan", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  pending_head_review: { label: "Menunggu Review Head", cls: "bg-amber-100 text-amber-900 border-amber-400" },
  head_revision: { label: "Revisi dari Head", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  awaiting_review: { label: "Menunggu Review Sales", cls: "bg-violet-100 text-violet-800 border-violet-300" },
  accepted: { label: "Diterima", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  revision_requested: { label: "Minta Revisi", cls: "bg-red-100 text-red-800 border-red-300" },
  closed: { label: "Ditutup", cls: "bg-slate-200 text-slate-600 border-slate-400" },
};

function StatusBadge({ status, item }) {
  // Kolom status IKUT KEADAAN AKTUAL (pola DRF), bukan status mentah DB:
  // - ditugaskan tapi belum diterima  → Antri — Belum Diterima
  // - diterima tapi belum dikerjakan  → Diterima — Belum Dikerjakan
  // - benar-benar mulai dikerjakan    → Dikerjakan (work_started_at terisi)
  // Berlaku juga utk data lama yang statusnya terlanjur "in_progress" karena auto-assign lama.
  if (item && ["submitted", "in_progress"].includes(status) && item.assigned_to_id) {
    if (item.work_started_at) {
      return <span className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] font-bold border bg-sky-100 text-sky-800 border-sky-300">Dikerjakan</span>;
    }
    if (item.accepted_at) {
      return <span className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] font-bold border bg-indigo-100 text-indigo-800 border-indigo-300">Diterima — Belum Dikerjakan</span>;
    }
    return <span className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] font-bold border bg-amber-100 text-amber-800 border-amber-400">Antri — Belum Diterima</span>;
  }
  const m = STATUS_META[status] || STATUS_META.draft;
  return <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] font-bold border ${m.cls}`}>{m.label}</span>;
}

// Deadline helper — returns { daysLeft, cls, label } or null
function getDeadlineInfo(deadlineISO) {
  if (!deadlineISO) return null;
  const d = new Date(deadlineISO);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
  let cls = "text-slate-600";
  let label = "";
  if (diff < 0) { cls = "text-red-700 font-bold"; label = `Lewat ${-diff} hari`; }
  else if (diff === 0) { cls = "text-red-700 font-bold"; label = "Hari ini"; }
  else if (diff <= 3) { cls = "text-red-700 font-bold"; label = `Sisa ${diff} hari`; }
  else if (diff <= 7) { cls = "text-amber-700 font-semibold"; label = `Sisa ${diff} hari`; }
  else { cls = "text-slate-600"; label = `Sisa ${diff} hari`; }
  return { daysLeft: diff, cls, label };
}

// Role helpers (v2)
const ROLE_ADMIN_LIKE = ["admin", "supervisor", "super_admin"];
const ROLE_ENG_ANY = ["engineering", "eng_leader", "eng_head", "eng_staff"];
const ROLE_ENG_HEAD = ["engineering", "eng_leader", "eng_head"];  // includes legacy


export default function SalesPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isAdminLike = ROLE_ADMIN_LIKE.includes(role);
  const isSales = role === "sales" || role === "sales_head" || isAdminLike;
  const isEngineering = ROLE_ENG_ANY.includes(role) || isAdminLike;
  const isEngHead = ROLE_ENG_HEAD.includes(role) || isAdminLike;
  const isEngStaff = role === "eng_staff";
  const isEngOnly = ROLE_ENG_ANY.includes(role);  // pure engineering view (no sales privileges)

  const [tab, setTab] = useState(isEngineering && !isSales ? "eng" : "mine");  // 'mine' | 'eng' | 'all'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");  // "" = all
  const [showCreate, setShowCreate] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState(null);  // draft object to edit
  const [openInquiry, setOpenInquiry] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Filter awal dari query param (mis. kartu portal Direktur → ?status=pending_boss_review)
  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setStatusFilter(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEngInquiryContext = location.pathname === "/engineering/inquiries";
  const inqTabs = useInquiryTabs();
  // Deep-link: /engineering/inquiries?open=<inquiryId> → langsung buka detail item yang dituju
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setOpenInquiry({ id: openId });
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pending, setPending] = useState(0);
  const [pendingKind, setPendingKind] = useState("");
  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState("created_desc");
  const [customerFilter, setCustomerFilter] = useState("");
  const [picFilter, setPicFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Sales team roster — used for filter dropdown
  const SALES_NAMES = ["Asiong", "Nicholas", "Kiki", "Riska", "Feggie", "Fiana"];

  const backLink = isEngOnly ? "/engineering" : "/";
  const backLabel = isEngOnly ? "Kembali ke Engineering Portal" : "Kembali ke Portal";
  const HeaderIcon = isEngOnly ? Wrench : FileText;
  const headerTitle = isEngOnly ? "Engineering — Costing Requests" : "Inquiry Costing";
  const headerSubtitle = isEngOnly
    ? (isEngStaff
        ? "Job yang ditugaskan ke Anda oleh Engineering Head"
        : "Terima request dari Sales · Assign ke Engineer · Upload hasil costing")
    : "FORMAT: 001/MKS/I/VII/2026 · RESET COUNTER TIAP BULAN";
  const headerIconCls = isEngOnly ? "text-amber-600" : "text-rose-600";

  // Default range: tgl 1 bulan ini → hari ini
  const _today = new Date().toISOString().slice(0, 10);
  const _firstOfMonth = _today.slice(0, 8) + "01";
  const [monthFilter, setMonthFilter] = useState("");  // YYYY-MM (opsional, tumpang tindih dengan range)
  const [startDate, setStartDate] = useState(_firstOfMonth);
  const [endDate, setEndDate] = useState(_today);

  // If monthFilter set, derive its range; otherwise use explicit start/end
  const currentRange = () => {
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (monthFilter) params.month = monthFilter;
      const { data } = await api.get("/inquiries", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat");
    } finally { setLoading(false); }
  }, [query, monthFilter]);

  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get("/sales/stats", { params: currentRange() });
      setStats(data);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter, startDate, endDate]);
  useEffect(() => { loadStats(); }, [loadStats, items.length]);

  const doExport = async () => {
    setExporting(true);
    try {
      const range = currentRange();
      const params = { ...range };
      if (query.trim()) params.q = query.trim();
      const res = await api.get("/inquiries/export/excel", {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      const suffix = monthFilter ? `_${monthFilter}` : (startDate || endDate ? `_${startDate}_${endDate}` : "");
      a.download = `Inquiries_MKS${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel Inquiries ter-download");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal export");
    } finally { setExporting(false); }
  };

  useEffect(() => {
    const tick = async () => {
      try { const { data } = await api.get("/inquiries/pending-count"); setPending(data.count || 0); setPendingKind(data.kind || ""); } catch {}
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  // Client-side filter by status (from clickable stat cards) + sort + deadline reminder count
  const filteredItems = useMemo(() => {
    let base = statusFilter ? items.filter((it) => it.status === statusFilter) : items;
    if (customerFilter) {
      const q = customerFilter.toLowerCase();
      base = base.filter((it) => (it.customer_name || "").toLowerCase().includes(q));
    }
    if (picFilter) {
      const q = picFilter.toLowerCase();
      base = base.filter((it) => {
        const pic = (it.pic_engineer_name || it.assigned_to_name || "").toLowerCase();
        return pic.includes(q);
      });
    }
    if (salesFilter) {
      base = base.filter((it) => (it.created_by_name || "").toLowerCase() === salesFilter.toLowerCase());
    }
    if (overdueOnly) {
      const today = new Date().toISOString().slice(0, 10);
      base = base.filter((it) => it.customer_deadline && it.customer_deadline < today && !["accepted", "closed"].includes(it.status));
    }
    return sortItems(base, sortBy, INQ_SORT_OPTS);
  }, [items, statusFilter, sortBy, customerFilter, picFilter, salesFilter, overdueOnly]);
  const pag = usePagination(filteredItems, 20);

  // Unique customer & PIC names — for filter datalist suggestions
  const uniqueCustomers = useMemo(() => Array.from(new Set(items.map((i) => i.customer_name).filter(Boolean))).sort(), [items]);
  const uniquePICs = useMemo(() => Array.from(new Set(items.map((i) => i.pic_engineer_name || i.assigned_to_name).filter(Boolean))).sort(), [items]);
  // Est. value per inquiry = sum of linked quotation totals (best effort — API might not send it)
  const inquiryEstValue = useMemo(() => {
    const map = {};
    for (const it of items) {
      if (typeof it.est_value === "number") { map[it.id] = it.est_value; continue; }
      if (Array.isArray(it.linked_quotations)) {
        map[it.id] = it.linked_quotations.reduce((s, q) => s + (Number(q.grand_total) || 0), 0);
      }
    }
    return map;
  }, [items]);

  const deadlineWarnings = useMemo(() => {
    // count inquiries with deadline within 7 days, not yet accepted/closed
    return items.filter((it) => {
      if (!it.customer_deadline) return false;
      if (["accepted", "closed"].includes(it.status)) return false;
      const info = getDeadlineInfo(it.customer_deadline);
      return info && info.daysLeft <= 7;
    });
  }, [items]);

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-3">
      <button
        type="button"
        onClick={() => { if (window.history.length > 1) navigate(-1); else navigate(backLink); }}
        className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]"
        data-testid="sales-back-btn"
      >
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>

      {isEngInquiryContext && <PageTabNav tabs={inqTabs} />}

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HeaderIcon size={18} weight="duotone" className={headerIconCls} />
            <h1 className="text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }} data-testid="sales-page-title">{headerTitle}</h1>
          </div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500 mt-0.5">{headerSubtitle}</p>
        </div>
        {isSales && (
          <div className="flex items-center gap-2">
            <Button data-testid="inq-export-excel" onClick={doExport} disabled={exporting} variant="outline" className="rounded-none h-9 text-xs uppercase tracking-[0.1em]">
              <MicrosoftExcelLogo size={14} weight="bold" className="mr-1.5 text-emerald-600" /> {exporting ? "Menyiapkan…" : "Export Excel"}
            </Button>
            <Button data-testid="new-inquiry-btn" onClick={() => setShowCreate(true)} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs uppercase tracking-[0.1em]">
              <Plus size={14} weight="bold" className="mr-1.5" /> Buat Inquiry Costing
            </Button>
          </div>
        )}
        {!isSales && (isEngineering || role === "sales_head") && (
          <Button data-testid="inq-export-excel" onClick={doExport} disabled={exporting} variant="outline" className="rounded-none h-9 text-xs uppercase tracking-[0.1em]">
            <MicrosoftExcelLogo size={14} weight="bold" className="mr-1.5 text-emerald-600" /> {exporting ? "Menyiapkan…" : "Export Excel"}
          </Button>
        )}
      </div>

      {/* Stats Dashboard — CLICKABLE FILTER */}
      {stats && (
        <div className="flex flex-wrap gap-2" data-testid="sales-stats-grid">
          <StatCard label="Total Inquiry" value={stats.inquiries?.total} accent="rose" testid="stat-inq-total" active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          <StatCard label="Draft" value={stats.inquiries?.by_status?.draft} accent="slate" testid="stat-inq-draft" active={statusFilter === "draft"} onClick={() => setStatusFilter(statusFilter === "draft" ? "" : "draft")} />
          <StatCard label="Menunggu Review Bos" value={stats.inquiries?.by_status?.pending_boss_review} accent="violet" testid="stat-inq-pending-boss" active={statusFilter === "pending_boss_review"} onClick={() => setStatusFilter(statusFilter === "pending_boss_review" ? "" : "pending_boss_review")} />
          <StatCard label="Terkirim" value={stats.inquiries?.by_status?.submitted} accent="amber" testid="stat-inq-submitted" active={statusFilter === "submitted"} onClick={() => setStatusFilter(statusFilter === "submitted" ? "" : "submitted")} />
          <StatCard label="Dikerjakan" value={stats.inquiries?.by_status?.in_progress} accent="sky" testid="stat-inq-in-progress" active={statusFilter === "in_progress"} onClick={() => setStatusFilter(statusFilter === "in_progress" ? "" : "in_progress")} />
          <StatCard label="Menunggu Review Head" value={stats.inquiries?.by_status?.pending_head_review} accent="amber" testid="stat-inq-pending-head" active={statusFilter === "pending_head_review"} onClick={() => setStatusFilter(statusFilter === "pending_head_review" ? "" : "pending_head_review")} />
          <StatCard label="Revisi dari Head" value={stats.inquiries?.by_status?.head_revision} accent="orange" testid="stat-inq-head-revision" active={statusFilter === "head_revision"} onClick={() => setStatusFilter(statusFilter === "head_revision" ? "" : "head_revision")} />
          <StatCard label="Menunggu Review Sales" value={stats.inquiries?.by_status?.awaiting_review} accent="violet" testid="stat-inq-awaiting" active={statusFilter === "awaiting_review"} onClick={() => setStatusFilter(statusFilter === "awaiting_review" ? "" : "awaiting_review")} />
          <StatCard label="Accepted" value={stats.inquiries?.by_status?.accepted} accent="emerald" testid="stat-inq-accepted" active={statusFilter === "accepted"} onClick={() => setStatusFilter(statusFilter === "accepted" ? "" : "accepted")} />
          <StatCard label="Minta Revisi" value={stats.inquiries?.by_status?.revision_requested} accent="red" testid="stat-inq-revision" active={statusFilter === "revision_requested"} onClick={() => setStatusFilter(statusFilter === "revision_requested" ? "" : "revision_requested")} />
          <StatCard label="Ditolak Bos" value={stats.inquiries?.by_status?.rejected} accent="red" testid="stat-inq-rejected" active={statusFilter === "rejected"} onClick={() => setStatusFilter(statusFilter === "rejected" ? "" : "rejected")} />
          <StatCard label="Closed" value={stats.inquiries?.by_status?.closed} accent="slate" testid="stat-inq-closed" active={statusFilter === "closed"} onClick={() => setStatusFilter(statusFilter === "closed" ? "" : "closed")} />
        </div>
      )}

      {/* Filter indicator */}
      {statusFilter && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Filter aktif:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white uppercase tracking-[0.05em] font-bold">
            {STATUS_META[statusFilter]?.label || statusFilter}
            <button onClick={() => setStatusFilter("")} className="ml-1 hover:text-red-300" data-testid="clear-status-filter"><X size={11} weight="bold" /></button>
          </span>
          <span className="text-slate-500">— {filteredItems.length} entri</span>
        </div>
      )}

      {/* Notif — Pending Count */}
      {pending > 0 && (
        <Card className="rounded-none border-rose-300 bg-rose-50 p-3 flex items-center gap-3">
          <Warning size={20} weight="fill" className="text-rose-600 shrink-0" />
          <div className="text-sm text-rose-900">
            <b>{pending}</b>{" "}
            {pendingKind === "assigned_to_me" ? "inquiry ditugaskan ke Anda menunggu di-Accept."
             : pendingKind === "pending_assignment" ? "inquiry submitted menunggu untuk di-Assign ke Engineer."
             : pendingKind === "awaiting_review" ? "inquiry menunggu review Anda."
             : pendingKind === "pending_boss_review" ? "inquiry menunggu persetujuan Anda (Direktur)."
             : "inquiry aktif."}
          </div>
        </Card>
      )}

      {/* Notif — Deadline Reminder */}
      {deadlineWarnings.length > 0 && (
        <Card className="rounded-none border-amber-400 bg-amber-50 p-3 flex items-start gap-3" data-testid="deadline-warning-card">
          <CalendarBlank size={20} weight="fill" className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 flex-1">
            <div className="font-bold mb-1">⏰ {deadlineWarnings.length} inquiry mendekati deadline:</div>
            <div className="flex flex-wrap gap-1.5">
              {deadlineWarnings.slice(0, 5).map((it) => {
                const info = getDeadlineInfo(it.customer_deadline);
                return (
                  <button
                    key={it.id}
                    onClick={() => setOpenInquiry(it)}
                    className={`text-[11px] px-1.5 py-0.5 border ${info?.daysLeft < 0 ? "bg-red-100 border-red-400 text-red-900" : info?.daysLeft <= 3 ? "bg-red-50 border-red-300 text-red-800" : "bg-amber-100 border-amber-400 text-amber-900"} hover:opacity-80 font-mono`}
                  >
                    {it.inquiry_no} — {info?.label}
                  </button>
                );
              })}
              {deadlineWarnings.length > 5 && <span className="text-[11px] text-amber-700 px-1">+{deadlineWarnings.length - 5} lainnya</span>}
            </div>
          </div>
        </Card>
      )}

      {/* Search + Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] max-w-md">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari <span className="text-slate-400 font-normal normal-case">(No / Judul / Customer / Project)</span></Label>
          <Input data-testid="sales-search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="mis. 001/MKS/I/VIII/2026 / SPM / Float Ring" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sales</Label>
          <select
            data-testid="sales-name-filter"
            className={`${inputCls} w-36 bg-white`}
            value={salesFilter}
            onChange={(e) => setSalesFilter(e.target.value)}
          >
            <option value="">Semua Sales</option>
            {SALES_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Customer</Label>
          <Input
            data-testid="sales-customer-filter"
            className={`${inputCls} w-44`}
            list="customer-suggestions"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            placeholder="Semua customer"
          />
          <datalist id="customer-suggestions">
            {uniqueCustomers.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">PIC Engineer</Label>
          <Input
            data-testid="sales-pic-filter"
            className={`${inputCls} w-36`}
            list="pic-suggestions"
            value={picFilter}
            onChange={(e) => setPicFilter(e.target.value)}
            placeholder="Semua PIC"
          />
          <datalist id="pic-suggestions">
            {uniquePICs.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Bulan</Label>
          <Input data-testid="sales-month-filter" type="month" className={`${inputCls} w-40`} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Urutkan</Label>
          <SortDropdown testid="sales-sort" value={sortBy} onChange={setSortBy} options={INQ_SORT_OPTS} />
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer h-9 px-2 border border-slate-300 bg-white hover:bg-red-50 hover:border-red-300" data-testid="sales-overdue-toggle">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="w-4 h-4 accent-red-600" />
          <span className="text-xs uppercase tracking-[0.05em] font-bold text-red-700">Overdue Only</span>
        </label>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
        <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
        {(query || monthFilter || customerFilter || picFilter || salesFilter || overdueOnly) && (
          <Button variant="ghost" onClick={() => { setQuery(""); setMonthFilter(""); setCustomerFilter(""); setPicFilter(""); setSalesFilter(""); setOverdueOnly(false); }} className="rounded-none h-9 text-xs" data-testid="sales-clear-filter">
            <X size={12} weight="bold" className="mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* List */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Daftar Inquiry Costing — {filteredItems.length} entri{statusFilter ? ` (filter: ${STATUS_META[statusFilter]?.label})` : ""}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="inquiries-table">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">No Inquiry</th>
                <th className="text-left p-3">Judul / Project</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Deadline</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Tgl Request</th>
                <th className="text-left p-3">Tgl Selesai</th>
                <th className="text-left p-3">{isEngineering ? "Ditugaskan ke" : "PIC Engineer"}</th>
                {!isEngOnly && <th className="text-right p-3">Est. Value</th>}
                <th className="text-left p-3">Sales / Dibuat</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={isEngOnly ? 10 : 11} className="p-6 text-center text-slate-400"><CircleNotch size={18} className="inline animate-spin" /></td></tr>)}
              {!loading && filteredItems.length === 0 && (<tr><td colSpan={isEngOnly ? 10 : 11} className="p-8 text-center text-slate-400">{statusFilter ? "Tidak ada inquiry dengan status ini." : "Belum ada inquiry."}</td></tr>)}
              {filteredItems.length > 0 && pag.pagedData.map((r) => {
                const dInfo = getDeadlineInfo(r.customer_deadline);
                const dlActive = dInfo && !["accepted", "closed"].includes(r.status);
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono font-semibold text-slate-900">{r.inquiry_no}</td>
                    <td className="p-3 text-slate-800 max-w-[280px]" title={r.title}>
                      <div className="truncate font-semibold">{r.title}</div>
                      {r.project_name && r.project_name !== r.title && <div className="text-[11px] text-slate-500 truncate">🏗️ {r.project_name}</div>}
                    </td>
                    <td className="p-3 text-slate-700">{r.customer_name}</td>
                    <td className="p-3 text-xs">
                      <div>{r.customer_deadline || "-"}</div>
                      {dlActive && <div className={dInfo.cls}>⏱ {dInfo.label}</div>}
                    </td>
                    <td className="p-3"><StatusBadge status={r.status} item={r} /></td>
                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap" data-testid={`inq-req-date-${r.inquiry_no}`}>
                      {(r.submitted_at || r.created_at) ? formatDateID((r.submitted_at || r.created_at).slice(0, 10)) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap" data-testid={`inq-done-date-${r.inquiry_no}`}>
                      {r.completed_at
                        ? <span className="text-emerald-700 font-semibold">{formatDateID(r.completed_at.slice(0, 10))}</span>
                        : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-slate-700 text-xs">
                      {isEngineering
                        ? (r.assigned_to_name || <span className="italic text-slate-400">Belum di-assign</span>)
                        : (r.pic_engineer_name || "-")}
                    </td>
                    {!isEngOnly && (
                      <td className="p-3 text-right tabular-nums text-slate-800 font-semibold text-xs">
                        {inquiryEstValue[r.id] > 0
                          ? `Rp ${Number(inquiryEstValue[r.id]).toLocaleString("id-ID")}`
                          : <span className="text-slate-300">-</span>}
                      </td>
                    )}
                    <td className="p-3 text-slate-500 text-xs">
                      <div className="font-semibold text-slate-700">{r.created_by_name}</div>
                      <span className="text-[10px] text-slate-400">{(r.created_at || "").slice(0, 10)}</span>
                    </td>
                    <td className="p-3 text-center">
                      <button data-testid={`open-inquiry-${r.inquiry_no}`} onClick={() => setOpenInquiry(r)} className="text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-none">Buka</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="inquiry" testIdPrefix="sales-pag" />
      </Card>

      {/* Create Inquiry Dialog */}
      {showCreate && (
        <CreateInquiryDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}

      {/* Edit Draft Inquiry Dialog */}
      {editingInquiry && (
        <CreateInquiryDialog
          existingId={editingInquiry.id}
          initial={editingInquiry}
          onClose={() => setEditingInquiry(null)}
          onCreated={() => { setEditingInquiry(null); load(); }}
        />
      )}

      {/* Detail Dialog */}
      {openInquiry && (
        <InquiryDetailDialog
          inquiryId={openInquiry.id}
          user={user}
          onClose={() => setOpenInquiry(null)}
          onChanged={load}
          onEditDraft={(inq) => { setOpenInquiry(null); setEditingInquiry(inq); }}
        />
      )}
    </div>
  );
}


/* ============================== Create Dialog ============================== */
function CreateInquiryDialog({ onClose, onCreated, initial = null, existingId = null }) {
  const isEdit = !!existingId;
  const [title, setTitle] = useState(initial?.title || "");
  const [customer, setCustomer] = useState(initial?.customer_name || "");
  const [customerConfirmed, setCustomerConfirmed] = useState(!!initial?.customer_name);  // true kalau sudah pilih dari list
  const [customerOpts, setCustomerOpts] = useState([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showRegisterCust, setShowRegisterCust] = useState(false);
  const [projectName, setProjectName] = useState(initial?.project_name || "");
  const [deadline, setDeadline] = useState(initial?.customer_deadline || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [items, setItems] = useState(
    initial?.items?.length ? initial.items : [{ item_name: "", qty: 1, unit: "EA", specification: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [nextNo, setNextNo] = useState(initial?.inquiry_no || "");

  // Preview nomor inquiry yang akan ter-generate (create mode saja; tidak menaikkan counter)
  useEffect(() => {
    if (isEdit) return;
    let alive = true;
    api.get("/inquiries/next-no")
      .then(({ data }) => { if (alive) setNextNo(data.inquiry_no || ""); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isEdit]);

  // Search customers with debounce
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!customerOpen) return;
      setCustomerLoading(true);
      try {
        const { data } = await api.get("/customers", { params: { q: customer.trim() || undefined, limit: 20 } });
        setCustomerOpts(data.items || []);
      } catch { setCustomerOpts([]); }
      setCustomerLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [customer, customerOpen]);

  const pickCustomer = (c) => {
    setCustomer(c.name);
    setCustomerConfirmed(true);
    setCustomerOpen(false);
  };

  // Detect not-found: user typed name but no exact match in options
  const trimmed = customer.trim();
  const exactMatch = customerOpts.find((c) => (c.name || "").toLowerCase() === trimmed.toLowerCase());
  const notFound = trimmed.length >= 2 && !customerLoading && !exactMatch && !customerConfirmed;

  const addItem = () => setItems((p) => [...p, { item_name: "", qty: 1, unit: "EA", specification: "" }]);
  const setItem = (i, k, v) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const rmItem = (i) => setItems((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const doSave = async (submitNow = false) => {
    if (!title.trim()) return toast.error("Nama Project wajib diisi");
    if (!customer.trim()) return toast.error("Customer wajib diisi");
    if (submitNow && !deadline) return toast.error("Deadline Costing wajib diisi sebelum inquiry dikirim (dasar KPI on-time). Simpan sebagai draft jika belum ada.");
    // Guard: kalau user ketik nama customer tapi belum di-confirm dari master, tolak dan minta register
    if (!customerConfirmed && !exactMatch) {
      setShowRegisterCust(true);
      toast.warning("Customer belum terdaftar. Silakan daftarkan customer baru dulu.");
      return;
    }
    setSaving(true);
    try {
      let inquiryId = existingId;
      const payloadCore = {
        title, customer_name: customer,
        project_name: (projectName && projectName.trim()) ? projectName : title,
        customer_deadline: deadline || null,
        description, items: items.filter((i) => i.item_name.trim()),
      };
      if (isEdit) {
        // PUT to update existing draft
        await api.put(`/inquiries/${existingId}`, payloadCore);
      } else {
        const { data } = await api.post("/inquiries", { ...payloadCore, save_as_draft: true });
        inquiryId = data.id;
      }
      // upload attachments to the inquiry
      for (const f of pendingFiles) {
        const fd = new FormData(); fd.append("file", f); fd.append("slot", "sales");
        await api.post(`/inquiries/${inquiryId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      if (submitNow) {
        await api.post(`/inquiries/${inquiryId}/submit`);
      }
      const noun = isEdit ? "diperbarui" : "tersimpan sebagai draft";
      toast.success(submitNow ? `Inquiry diajukan untuk review Direktur` : `Inquiry ${noun}`);
      onCreated();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Draft Inquiry" : "Buat Inquiry Costing Baru"}</DialogTitle>
          <DialogDescription>Isi detail request costing. {isEdit ? "Simpan perubahan atau ajukan ke Direktur." : "Simpan sebagai draft atau ajukan ke Direktur untuk direview sebelum diteruskan ke Engineering."}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-300">
          <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-emerald-700">Nomor Inquiry</span>
          <span className="font-mono font-bold text-emerald-900 text-sm" data-testid="inq-next-no">{nextNo || "…"}</span>
          <span className="text-[10px] text-emerald-600 normal-case">{isEdit ? "" : "(otomatis · reset tiap bulan)"}</span>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Project *</Label>
              <Input data-testid="inq-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Float Ring INC 825 for SPM" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Customer * <span className="text-slate-400 font-normal">(dari Master Customer)</span></Label>
              <div className="relative">
                <Input
                  data-testid="inq-customer"
                  className={`${inputCls} ${customerConfirmed ? "border-emerald-500 bg-emerald-50" : notFound ? "border-amber-500" : ""}`}
                  value={customer}
                  onChange={(e) => { setCustomer(e.target.value); setCustomerConfirmed(false); setCustomerOpen(true); }}
                  onFocus={() => setCustomerOpen(true)}
                  onBlur={() => setTimeout(() => setCustomerOpen(false), 180)}
                  placeholder="Ketik atau pilih customer (mis. PT. SPM Oil & Gas)"
                />
                {customerConfirmed && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 text-[11px] font-bold pointer-events-none">✓ terkonfirmasi</span>}
                {customerOpen && (customerOpts.length > 0 || customerLoading) && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-auto bg-white border border-slate-300 shadow-lg">
                    {customerLoading && <div className="px-3 py-2 text-xs text-slate-400">Mencari...</div>}
                    {!customerLoading && customerOpts.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-sky-50 text-sm border-b border-slate-100"
                        data-testid={`inq-cust-opt-${c.id}`}
                      >
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-[10px] text-slate-500">{[c.pic, c.address].filter(Boolean).join(" · ") || "—"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {notFound && (
                <div className="mt-1 p-2 bg-amber-50 border border-amber-300 flex items-center justify-between gap-2" data-testid="inq-cust-not-found">
                  <div className="text-[11px] text-amber-800">
                    <b>&quot;{customer}&quot;</b> belum terdaftar di Master Customer.
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRegisterCust(true)}
                    className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white"
                    data-testid="inq-cust-register-btn"
                  >
                    + Daftarkan Customer Baru
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Deadline Costing <span className="text-red-500">*</span></Label>
              <Input data-testid="inq-deadline" type="date" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <div className="text-[10px] text-slate-400 mt-0.5">Wajib diisi sebelum kirim — dasar KPI on-time costing.</div>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Keterangan / Detail Kebutuhan</Label>
            <textarea data-testid="inq-desc" className="w-full min-h-[70px] rounded-none border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-rose-600 focus:outline-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi lengkap kebutuhan costing, spec khusus, dll" />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold text-slate-600">List Item</Label>
              <button onClick={addItem} className="text-[10px] uppercase tracking-[0.05em] font-semibold text-rose-600 border border-rose-300 hover:bg-rose-50 px-2 py-0.5 rounded-none" data-testid="inq-add-item">
                <Plus size={11} weight="bold" className="inline mr-1" /> Tambah Item
              </button>
            </div>
            <div className="border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-left w-8">#</th>
                    <th className="p-2 text-left">Nama Item</th>
                    <th className="p-2 text-right w-16">Qty</th>
                    <th className="p-2 text-left w-16">Unit</th>
                    <th className="p-2 text-left">Spesifikasi / Material</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-1 text-slate-400 text-center">{i + 1}</td>
                      <td className="p-1"><Input data-testid={`inq-item-name-${i}`} value={it.item_name} onChange={(e) => setItem(i, "item_name", e.target.value)} className="h-7 rounded-none text-xs" placeholder="Nama barang" /></td>
                      <td className="p-1"><Input data-testid={`inq-item-qty-${i}`} type="number" step="any" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} className="h-7 rounded-none text-xs text-right" /></td>
                      <td className="p-1"><Input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className="h-7 rounded-none text-xs" /></td>
                      <td className="p-1"><Input data-testid={`inq-item-spec-${i}`} value={it.specification} onChange={(e) => setItem(i, "specification", e.target.value)} className="h-7 rounded-none text-xs" placeholder="opsional" /></td>
                      <td className="p-1 text-center"><button onClick={() => rmItem(i)} disabled={items.length === 1} className="p-0.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash size={12} weight="bold" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Attachments (drawing, spec, dokumen pendukung)</Label>
            <input
              type="file"
              multiple
              data-testid="inq-files"
              onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
              className="text-xs file:mr-3 file:py-1.5 file:px-3 file:border-0 file:bg-slate-900 file:text-white file:text-[10px] file:uppercase file:tracking-[0.1em] file:font-semibold file:cursor-pointer"
            />
            {pendingFiles.length > 0 && (
              <div className="mt-1 text-[11px] text-slate-500">{pendingFiles.length} file akan di-upload setelah simpan</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-none">Batal</Button>
          <Button data-testid="inq-save-draft" variant="outline" onClick={() => doSave(false)} disabled={saving} className="rounded-none">
            {saving ? "Menyimpan..." : (isEdit ? "Simpan Perubahan" : "Simpan sebagai Draft")}
          </Button>
          <Button data-testid="inq-submit" onClick={() => doSave(true)} disabled={saving} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white">
            <PaperPlaneTilt size={13} weight="bold" className="mr-1" /> Kirim untuk Review Bos
          </Button>
        </DialogFooter>
      </DialogContent>
      {showRegisterCust && (
        <QuickRegisterCustomerDialog
          initialName={customer}
          onClose={() => setShowRegisterCust(false)}
          onCreated={(newCust) => {
            setCustomer(newCust.name);
            setCustomerConfirmed(true);
            setCustomerOpts([newCust, ...customerOpts.filter((c) => c.id !== newCust.id)]);
            setShowRegisterCust(false);
            toast.success(`Customer "${newCust.name}" terdaftar & terpilih`);
          }}
        />
      )}
    </Dialog>
  );
}


/* ============================== Quick Register Customer Dialog ============================== */
function QuickRegisterCustomerDialog({ initialName = "", onClose, onCreated }) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState("");
  const [pic, setPic] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const doSave = async () => {
    if (!name.trim()) return toast.error("Nama customer wajib diisi");
    if (!address.trim()) return toast.error("Alamat wajib diisi");
    setSaving(true);
    try {
      const { data } = await api.post("/customers", { name: name.trim(), address: address.trim(), pic: pic.trim(), phone: phone.trim() });
      onCreated(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal daftarkan customer");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-md" data-testid="quick-register-cust-dialog">
        <DialogHeader>
          <DialogTitle>Daftarkan Customer Baru</DialogTitle>
          <DialogDescription>Setelah simpan, customer otomatis terpilih di form Inquiry Costing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Customer *</Label>
            <Input data-testid="qrc-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. PT. SPM Oil & Gas" autoFocus />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Alamat *</Label>
            <textarea
              data-testid="qrc-address"
              className="w-full min-h-[60px] rounded-none border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-rose-600 focus:outline-none"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Jl. ..., Kota, Provinsi"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">PIC (opsional)</Label>
              <Input data-testid="qrc-pic" className={inputCls} value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Nama contact" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Phone (opsional)</Label>
              <Input data-testid="qrc-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-none">Batal</Button>
          <Button data-testid="qrc-save" onClick={doSave} disabled={saving} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Menyimpan..." : "Simpan & Auto-Pilih"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ============================== Detail Dialog ============================== */
function InquiryDetailDialog({ inquiryId, user, onClose, onChanged, onEditDraft }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);  // 'accept' | 'complete' | 'review-accept' | 'review-revise'
  const [actInput, setActInput] = useState("");
  const [actNote, setActNote] = useState("");
  const [pendingEngFiles, setPendingEngFiles] = useState([]);
  const [workCat, setWorkCat] = useState("");  // kategori kerja: simple|moderate|complex (wajib saat kirim hasil)
  const [processing, setProcessing] = useState(false);

  const role = user?.role;
  const isAdminLike = ["admin", "supervisor", "super_admin"].includes(role);
  const isEngOnly = ["engineering", "eng_leader", "eng_head", "eng_staff"].includes(role);  // pure engineering (no sales privileges)
  const isMineSales = role === "sales" && data?.created_by_id === user?.id;
  const canEditDraft = data && data.status === "draft" && (isMineSales || isAdminLike);
  const isOwnerOrAdmin = isMineSales || isAdminLike;
  const isEng = ["engineering", "eng_leader", "eng_head", "eng_staff"].includes(role) || isAdminLike;
  const isEngHead = ["engineering", "eng_leader", "eng_head"].includes(role) || isAdminLike;
  const isEngStaff = role === "eng_staff";
  const isSalesOrAdmin = role === "sales" || isAdminLike;
  const isSalesHead = role === "sales_head" || isAdminLike;  // Direktur — approver costing
  // eng_staff can only accept/progress/complete if assigned to them
  const isAssignee = data && data.assigned_to_id === user?.id;
  // Only the ACTUAL assignee (regardless of role) can submit costing / revision.
  // Engineering Leader who is NOT the assignee should not see the "Selesai" button.
  const canEngAct = isEng && isAssignee;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/inquiries/${inquiryId}`);
      setData(data);
    } catch (e) {
      toast.error("Gagal memuat");
      onClose();
    } finally { setLoading(false); }
  }, [inquiryId, onClose]);
  useEffect(() => { reload(); }, [reload]);

  const doAction = async (overrideAction = null) => {
    const a = overrideAction || action;
    setProcessing(true);
    try {
      if (a === "accept") {
        if (!actInput.trim()) { setProcessing(false); return toast.error("Nama PIC Engineer wajib diisi"); }
        await api.post(`/inquiries/${inquiryId}/accept`, { pic_engineer_name: actInput.trim() });
      } else if (a === "complete") {
        if (!["simple", "moderate", "complex"].includes(workCat)) {
          setProcessing(false);
          return toast.error("Pilih Kategori Pekerjaan (SIMPLE / MODERATE / COMPLEX) dulu");
        }
        // Eng Staff: upload files + kirim ke Head untuk internal review
        for (const f of pendingEngFiles) {
          const fd = new FormData(); fd.append("file", f); fd.append("slot", "engineer");
          await api.post(`/inquiries/${inquiryId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        }
        await api.post(`/inquiries/${inquiryId}/submit-to-head`, new URLSearchParams({ note: actNote, work_category: workCat }), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } else if (a === "head-approve") {
        await api.post(`/inquiries/${inquiryId}/head-review`, { approve: true, note: actNote });
      } else if (a === "head-revise") {
        if (!actNote.trim()) { setProcessing(false); return toast.error("Catatan revisi wajib diisi"); }
        await api.post(`/inquiries/${inquiryId}/head-review`, { approve: false, note: actNote });
      } else if (a === "review-accept") {
        await api.post(`/inquiries/${inquiryId}/review`, { approve: true, review_note: actNote });
        setAction(null); setActInput(""); setActNote(""); setPendingEngFiles([]);
        await reload(); onChanged();
        // Prompt: buat quotation sekarang atau nanti?
        toast.success("Inquiry ACCEPTED. Buat Quotation formal sekarang?", {
          duration: 8000,
          action: {
            label: "Buat Sekarang",
            onClick: () => {
              onClose();
              navigate(`/sales/quotations?from_inquiry=${inquiryId}`);
            },
          },
          cancel: { label: "Nanti" },
        });
        setProcessing(false);
        return;
      } else if (a === "review-revise") {
        if (!actNote.trim()) { setProcessing(false); return toast.error("Catatan revisi wajib diisi"); }
        await api.post(`/inquiries/${inquiryId}/review`, { approve: false, review_note: actNote });
      } else if (a === "submit-draft") {
        await api.post(`/inquiries/${inquiryId}/submit`);
      } else if (a === "boss-approve") {
        await api.post(`/inquiries/${inquiryId}/boss-review`, { approve: true, note: actNote });
      } else if (a === "boss-reject") {
        if (!actNote.trim()) { setProcessing(false); return toast.error("Alasan penolakan wajib diisi"); }
        await api.post(`/inquiries/${inquiryId}/boss-review`, { approve: false, note: actNote });
      }
      toast.success("Berhasil");
      setAction(null); setActInput(""); setActNote(""); setPendingEngFiles([]);
      await reload(); onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal");
    } finally { setProcessing(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-4xl max-h-[92vh] overflow-y-auto">
        {loading || !data ? (
          <div className="p-8 text-center text-slate-400"><CircleNotch size={20} className="inline animate-spin" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{data.inquiry_no}</span>
                <StatusBadge status={data.status} item={data} />
              </DialogTitle>
              <DialogDescription>{data.title}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Meta label="Customer" value={data.customer_name} />
              <Meta label="Project" value={data.project_name || "-"} />
              <Meta label="Deadline Costing" value={<DeadlineDisplay iso={data.customer_deadline} status={data.status} />} />
              <Meta label="Dibuat oleh" value={`${data.created_by_name} · ${(data.created_at || "").slice(0, 10)}`} />
              <Meta label="Ditugaskan ke" value={data.assigned_to_name || <span className="italic text-slate-400">Belum di-assign</span>} highlight />
              <Meta label="PIC Engineer" value={data.pic_engineer_name || "-"} />
            </div>

            {data.description && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap">{data.description}</div>
            )}

            {/* Items */}
            {(data.items || []).length > 0 && (
              <div className="mt-3 border border-slate-200">
                <div className="bg-slate-50 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Items ({data.items.length})</div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-white border-b border-slate-100"><th className="p-2 text-left">#</th><th className="p-2 text-left">Nama</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Unit</th><th className="p-2 text-left">Spec</th></tr></thead>
                  <tbody>
                    {data.items.map((it, i) => (
                      <tr key={i} className="border-b border-slate-100"><td className="p-2 text-slate-400">{i + 1}</td><td className="p-2 font-semibold">{it.item_name}</td><td className="p-2 text-right tabular-nums">{it.qty}</td><td className="p-2 text-slate-600">{it.unit}</td><td className="p-2 text-slate-600 max-w-[300px]">{it.specification}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attachments — sales */}
            <AttachmentsList title="Attachments Sales" attachments={data.attachments} inquiryId={data.id} />
            {/* Attachments — engineer response */}
            {(data.engineer_response_files || []).length > 0 && (
              <AttachmentsList title="Hasil Kerja Engineering" attachments={data.engineer_response_files} inquiryId={data.id} accent="sky" />
            )}
            {data.engineer_response_note && (
              <div className="mt-2 p-2.5 border-l-4 border-sky-500 bg-sky-50 text-sm text-slate-800">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-sky-700 mb-1">Catatan Engineering</div>
                {data.engineer_response_note}
              </div>
            )}

            {/* Head revision note — visible to ALL roles when inquiry is in head_revision (so Riski, Trisna, admin all see what was requested) */}
            {data.head_revision_note && (data.status === "head_revision" || data.status === "pending_head_review" || data.status === "awaiting_review") && (
              <div className="mt-2 p-2.5 border-l-4 border-orange-500 bg-orange-50 text-sm text-slate-800" data-testid="head-revision-note-banner">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-orange-700 mb-1">
                  <Warning size={11} weight="fill" className="inline mr-1" />
                  Revisi Diminta oleh {data.head_reviewed_by_name || "Engineering Leader"}{data.head_reviewed_at ? ` · ${data.head_reviewed_at.slice(0,16).replace('T',' ')}` : ""}
                </div>
                <div className="whitespace-pre-wrap text-orange-900">{data.head_revision_note}</div>
              </div>
            )}

            {/* Head approve note — visible when inquiry passed Head → Sales */}
            {data.head_review_note && data.head_review_note !== "(auto: engineer adalah Engineering Leader sendiri)" && (data.status === "awaiting_review" || data.status === "accepted" || data.status === "revision_requested" || data.status === "closed") && (
              <div className="mt-2 p-2.5 border-l-4 border-emerald-500 bg-emerald-50 text-sm text-slate-800" data-testid="head-approve-note-banner">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-emerald-700 mb-1">
                  ✓ Disetujui Engineering Leader {data.head_reviewed_by_name ? `— ${data.head_reviewed_by_name}` : ""}
                </div>
                <div className="whitespace-pre-wrap">{data.head_review_note}</div>
              </div>
            )}

            {/* Keputusan Direktur (Asiong) */}
            {data.boss_review && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 mb-1">Review Direktur</div>
                <div className={`p-2 border-l-4 text-sm ${data.boss_review.approve ? "border-emerald-500 bg-emerald-50" : "border-red-500 bg-red-50"}`} data-testid="boss-review-result">
                  <div className="text-[10px] uppercase tracking-[0.1em] font-bold mb-0.5">
                    {data.boss_review.approve ? "Disetujui → diteruskan ke Engineering" : "Ditolak"} — {data.boss_review.by} · {(data.boss_review.at || "").slice(0, 16).replace("T", " ")}
                  </div>
                  <div className="text-slate-800 whitespace-pre-wrap">{data.boss_review.note || "(tanpa catatan)"}</div>
                </div>
              </div>
            )}


            {/* Sales reviews */}
            {(data.sales_reviews || []).length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Review Sales</div>
                {data.sales_reviews.map((r, i) => (
                  <div key={i} className={`p-2 border-l-4 text-sm ${r.approve ? "border-emerald-500 bg-emerald-50" : "border-red-500 bg-red-50"}`}>
                    <div className="text-[10px] uppercase tracking-[0.1em] font-bold mb-0.5">{r.approve ? "Accepted" : "Minta Revisi"} — {r.by} · {(r.at || "").slice(0, 16).replace("T", " ")}</div>
                    <div className="text-slate-800">{r.note || "(tanpa catatan)"}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Action panels */}
            <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
              {/* Sales/Admin draft actions */}
              {canEditDraft && !action && (
                <div className="flex gap-2 flex-wrap">
                  <Button data-testid="edit-draft-btn" onClick={() => onEditDraft && onEditDraft(data)} variant="outline" className="rounded-none">
                    <PencilSimple size={13} weight="bold" className="mr-1" /> Edit Draft
                  </Button>
                  <Button data-testid="submit-draft" onClick={() => doAction("submit-draft")} disabled={processing} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white">
                    <PaperPlaneTilt size={13} weight="bold" className="mr-1" /> Kirim untuk Review Bos
                  </Button>
                </div>
              )}

              {/* Direktur (Asiong): review costing — approve → ke Engineering, tolak → ditutup */}
              {isSalesHead && data.status === "pending_boss_review" && action !== "boss-approve" && action !== "boss-reject" && (
                <div className="p-3 border-2 border-fuchsia-400 bg-fuchsia-50 space-y-2" data-testid="boss-review-panel">
                  <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-fuchsia-900">Review Direktur</div>
                  <div className="text-sm text-fuchsia-900">Setujui untuk meneruskan inquiry ke Engineering, atau tolak (inquiry ditutup).</div>
                  <div className="flex gap-2 flex-wrap">
                    <Button data-testid="btn-boss-approve" onClick={() => setAction("boss-approve")} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em]">
                      <Check size={13} weight="bold" className="mr-1" /> Setuju & Teruskan ke Engineering
                    </Button>
                    <Button data-testid="btn-boss-reject" onClick={() => setAction("boss-reject")} className="rounded-none bg-red-600 hover:bg-red-700 text-white text-xs uppercase tracking-[0.1em]">
                      <X size={13} weight="bold" className="mr-1" /> Tolak
                    </Button>
                  </div>
                </div>
              )}

              {isSalesHead && (action === "boss-approve" || action === "boss-reject") && (
                <div className={`p-3 border-2 space-y-2 ${action === "boss-approve" ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50"}`}>
                  <Label className="text-xs font-semibold text-slate-700">
                    {action === "boss-approve" ? "Catatan persetujuan (opsional)" : "Alasan penolakan *"}
                  </Label>
                  <textarea
                    data-testid="boss-review-note"
                    className="w-full border border-slate-300 rounded-none p-2 text-sm min-h-[70px]"
                    value={actNote}
                    onChange={(e) => setActNote(e.target.value)}
                    placeholder={action === "boss-approve" ? "mis. OK, lanjut costing" : "mis. Spesifikasi belum jelas / bukan prioritas"}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setAction(null); setActNote(""); }} disabled={processing} className="rounded-none">Batal</Button>
                    <Button
                      data-testid="boss-review-confirm"
                      onClick={() => doAction()}
                      disabled={processing}
                      className={`rounded-none text-white ${action === "boss-approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                    >
                      {processing ? "Memproses..." : (action === "boss-approve" ? "Konfirmasi Setuju" : "Konfirmasi Tolak")}
                    </Button>
                  </div>
                </div>
              )}


              {/* Sales accepted → Buat Quotation shortcut (hidden once a linked quotation exists) */}
              {isSalesOrAdmin && data.status === "accepted" && !action && (data.linked_quotations || []).length === 0 && (
                <div className="p-3 border-2 border-amber-400 bg-amber-50 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-amber-900 mb-0.5">Inquiry Sudah Accepted</div>
                    <div className="text-amber-900">Siap dibuatkan Quotation formal ke customer.</div>
                  </div>
                  <Button
                    data-testid="btn-create-quotation-from-inquiry"
                    onClick={() => navigate(`/sales/quotations?from_inquiry=${data.id}`)}
                    className="rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs uppercase tracking-[0.1em]"
                  >
                    <Receipt size={13} weight="bold" className="mr-1" /> Buat Quotation dari Inquiry
                  </Button>
                </div>
              )}

              {/* Linked Quotations indicator — hidden content for Engineering */}
              {(data.linked_quotations || []).length > 0 && (
                <div className="p-3 border-2 border-emerald-400 bg-emerald-50" data-testid="linked-quotations-panel">
                  <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-emerald-900 mb-2">
                    📄 Quotation Terkait ({data.linked_quotations.length})
                  </div>
                  {isEngOnly ? (
                    <div className="text-xs text-slate-700 italic">
                      🔒 Inquiry ini sudah dibuatkan {data.linked_quotations.length} quotation oleh Sales.
                      Isi & harga quotation adalah konfidensial Sales — Engineering tidak dapat melihat.
                    </div>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {data.linked_quotations.map((lq, idx) => (
                        <li key={idx} className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-emerald-800">{lq.quotation_no}</span>
                          <span className="text-slate-600">· {(lq.created_at || "").slice(0, 10)}</span>
                          <span className="text-slate-600">· oleh {lq.created_by_name}</span>
                          {lq.status && (
                            <span className={`px-1.5 py-0.5 text-[10px] uppercase font-bold border ${
                              lq.status === "confirm_order" ? "bg-emerald-100 border-emerald-400 text-emerald-800" :
                              lq.status === "cancel" ? "bg-red-100 border-red-400 text-red-800" :
                              "bg-amber-100 border-amber-400 text-amber-800"
                            }`}>{lq.status}</span>
                          )}
                          {lq.so_no && <span className="font-mono font-bold text-emerald-700">✓ SO {lq.so_no}</span>}
                          {isSalesOrAdmin && (
                            <button
                              data-testid={`open-linked-quo-${lq.quotation_id || idx}`}
                              onClick={() => navigate(`/sales/quotations?open=${lq.quotation_id}`)}
                              className="ml-auto text-xs text-emerald-800 underline hover:text-emerald-900"
                            >Buka</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Engineering Head: Assign button */}
              {isEngHead && ["submitted", "in_progress", "revision_requested"].includes(data.status) && !action && (
                <div className="flex gap-2 flex-wrap">
                  <Button data-testid="btn-assign-inquiry" onClick={() => setAction("assign")} variant="outline" className="rounded-none border-purple-400 text-purple-700 hover:bg-purple-50">
                    <UserPlus size={13} weight="bold" className="mr-1" /> {data.assigned_to_id ? "Re-assign Engineer" : "Assign ke Engineer"}
                  </Button>
                </div>
              )}
              {action === "assign" && (
                <AssignEngineerPanel
                  currentAssigneeId={data.assigned_to_id}
                  onCancel={() => setAction(null)}
                  onAssigned={async () => { setAction(null); await reload(); onChanged(); }}
                  inquiryId={inquiryId}
                />
              )}

              {/* Engineering accept */}
              {isEng && data.status === "submitted" && !action && (
                <>
                  {/* eng_staff not assigned → informational block */}
                  {isEngStaff && !isAssignee && (
                    <div className="p-3 border-2 border-slate-300 bg-slate-50 text-sm text-slate-700">
                      <Warning size={14} weight="fill" className="inline mr-1 text-amber-500" />
                      Inquiry ini belum ditugaskan ke Anda. Menunggu Engineering Head untuk assign.
                    </div>
                  )}
                </>
              )}

              {/* Assignee: Terima → Kerjakan (pola DRF — status ikut aksi aktual) */}
              {isAssignee && ["submitted", "in_progress"].includes(data.status) && !data.work_started_at && !action && (
                <div className="p-3 border-2 border-teal-400 bg-teal-50 space-y-2" data-testid="inq-stage-actions">
                  {!data.accepted_at ? (
                    <>
                      <div className="text-xs text-teal-900">
                        Inquiry ini ditugaskan ke Anda dan masih <b>ANTRI</b>. Klik <b>Terima</b> untuk mengakui tugas ini.
                      </div>
                      <Button
                        data-testid="btn-inq-terima"
                        disabled={processing}
                        onClick={async () => {
                          setProcessing(true);
                          try {
                            await api.post(`/inquiries/${inquiryId}/receive-job`);
                            toast.success("Tugas diterima — status: Diterima (belum dikerjakan)");
                            await reload(); onChanged();
                          } catch (e) { toast.error(e.response?.data?.detail || "Gagal menerima tugas"); }
                          finally { setProcessing(false); }
                        }}
                        className="rounded-none bg-amber-500 hover:bg-amber-600 text-white text-xs uppercase tracking-[0.1em]"
                      >
                        <CheckCircle size={13} weight="bold" className="mr-1" /> {processing ? "Memproses..." : "Terima Tugas"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-teal-900">
                        Tugas sudah Anda terima. Klik <b>Mulai Kerjakan</b> saat mulai mengerjakan costing (tanggal mulai tercatat).
                      </div>
                      <Button
                        data-testid="btn-inq-kerjakan"
                        disabled={processing}
                        onClick={async () => {
                          setProcessing(true);
                          try {
                            await api.post(`/inquiries/${inquiryId}/start-job`);
                            toast.success("Mulai dikerjakan — status: Dikerjakan");
                            await reload(); onChanged();
                          } catch (e) { toast.error(e.response?.data?.detail || "Gagal memulai tugas"); }
                          finally { setProcessing(false); }
                        }}
                        className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em]"
                      >
                        <PlayCircle size={13} weight="bold" className="mr-1" /> {processing ? "Memproses..." : "Mulai Kerjakan"}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Engineer (assignee ONLY): Selesai Costing → Kirim ke Engineering Leader */}
              {canEngAct && ((data.status === "in_progress" && data.work_started_at) || data.status === "head_revision") && !action && (
                <div className="space-y-2">
                  <Button data-testid="btn-complete-inquiry" onClick={() => setAction("complete")} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em]">
                    <Check size={13} weight="bold" className="mr-1" />
                    {isEngHead && data.assigned_to_id === user?.id
                      ? "Selesai Costing & Kirim ke Sales"
                      : data.status === "head_revision"
                        ? "Selesai Revisi & Kirim ke Engineering Leader"
                        : "Selesai Costing & Kirim ke Engineering Leader"}
                  </Button>
                </div>
              )}
              {action === "complete" && (
                <div className="p-3 border-2 border-emerald-400 bg-emerald-50 space-y-2" data-testid="complete-form">
                  <Label className="text-xs font-semibold text-emerald-900">Upload File Hasil Costing (drawing, costing file, dokumen)</Label>
                  <input
                    type="file"
                    multiple
                    data-testid="eng-files"
                    onChange={(e) => setPendingEngFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                    className="text-xs block w-full border border-emerald-300 bg-white p-1.5"
                  />
                  {pendingEngFiles.length > 0 && (
                    <div className="space-y-1 border border-emerald-300 bg-white p-2">
                      <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-emerald-800">
                        {pendingEngFiles.length} file siap diupload:
                      </div>
                      {pendingEngFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-emerald-50 px-2 py-1" data-testid={`pending-file-${i}`}>
                          <span className="truncate">📎 {f.name} <span className="text-slate-500">({(f.size / 1024).toFixed(1)} KB)</span></span>
                          <button
                            type="button"
                            onClick={() => setPendingEngFiles(pendingEngFiles.filter((_, j) => j !== i))}
                            className="text-red-600 hover:bg-red-100 px-1"
                            data-testid={`pending-file-remove-${i}`}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Label className="text-xs font-semibold text-emerald-900">
                    Kategori Pekerjaan <span className="text-rose-600">*wajib</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-2" data-testid="inq-workcat-select">
                    {[
                      { key: "simple", label: "SIMPLE", on: "bg-emerald-600 text-white border-emerald-700", off: "bg-white text-slate-600 border-slate-300 hover:border-emerald-400" },
                      { key: "moderate", label: "MODERATE", on: "bg-amber-600 text-white border-amber-700", off: "bg-white text-slate-600 border-slate-300 hover:border-amber-400" },
                      { key: "complex", label: "COMPLEX", on: "bg-rose-600 text-white border-rose-700", off: "bg-white text-slate-600 border-slate-300 hover:border-rose-400" },
                    ].map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setWorkCat(o.key)}
                        className={`py-2 text-[11px] font-bold uppercase tracking-wider border ${workCat === o.key ? o.on : o.off}`}
                        data-testid={`inq-workcat-${o.key}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <Label className="text-xs font-semibold text-emerald-900">
                    {isEngHead && data.assigned_to_id === user?.id ? "Catatan untuk Sales" : "Catatan untuk Engineering Leader"}
                  </Label>
                  <textarea data-testid="eng-note" className="w-full min-h-[60px] rounded-none border border-emerald-300 p-2 text-sm" value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="Ringkasan hasil costing, jawaban revisi, dll" />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setAction(null); setPendingEngFiles([]); setActNote(""); }} disabled={processing} className="rounded-none">Batal</Button>
                    <Button data-testid="confirm-complete" onClick={() => doAction()} disabled={processing} className="rounded-none bg-emerald-600 text-white">
                      {processing ? "Mengirim..." : (isEngHead && data.assigned_to_id === user?.id ? "Kirim ke Sales" : "Kirim ke Engineering Leader")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Engineering Leader: Review costing dari staff (status: pending_head_review) */}
              {isEngHead && data.status === "pending_head_review" && !action && (
                <div className="space-y-2">
                  <div className="p-3 border-2 border-amber-300 bg-amber-50">
                    <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-amber-800 mb-1">
                      Costing dari {data.assigned_to_name || "-"} — perlu review Anda
                    </div>
                    {data.engineer_response_note && (
                      <div className="text-sm text-amber-900 whitespace-pre-wrap mt-1">{data.engineer_response_note}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button data-testid="btn-head-approve" onClick={() => setAction("head-approve")} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em]">
                      <Check size={13} weight="bold" className="mr-1" /> Setuju & Kirim ke Sales
                    </Button>
                    <Button data-testid="btn-head-revise" onClick={() => setAction("head-revise")} className="rounded-none bg-red-600 hover:bg-red-700 text-white text-xs uppercase tracking-[0.1em]">
                      <ArrowClockwise size={13} weight="bold" className="mr-1" /> Minta Revisi ke Engineer
                    </Button>
                  </div>
                </div>
              )}
              {(action === "head-approve" || action === "head-revise") && (
                <div className={`p-3 border-2 ${action === "head-approve" ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50"} space-y-2`}>
                  <Label className={`text-xs font-semibold ${action === "head-approve" ? "text-emerald-900" : "text-red-900"}`}>
                    {action === "head-approve" ? "Catatan untuk Sales (opsional)" : "Catatan Revisi untuk Engineer *"}
                  </Label>
                  <textarea data-testid="head-review-note" autoFocus value={actNote} onChange={(e) => setActNote(e.target.value)} className="w-full min-h-[60px] rounded-none border p-2 text-sm" placeholder={action === "head-approve" ? "Sudah oke, silakan Sales review" : "Jelaskan apa yang perlu direvisi Engineer"} />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAction(null)} disabled={processing} className="rounded-none">Batal</Button>
                    <Button data-testid="confirm-head-review" onClick={() => doAction()} disabled={processing} className={`rounded-none text-white ${action === "head-approve" ? "bg-emerald-600" : "bg-red-600"}`}>
                      {action === "head-approve" ? "Kirim ke Sales" : "Kembalikan ke Engineer"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Sales review */}
              {isSalesOrAdmin && data.status === "awaiting_review" && !action && (
                <div className="flex gap-2">
                  <Button data-testid="btn-accept-review" onClick={() => setAction("review-accept")} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white"><Check size={13} weight="bold" className="mr-1" /> Accept</Button>
                  <Button data-testid="btn-revise-review" onClick={() => setAction("review-revise")} className="rounded-none bg-red-600 hover:bg-red-700 text-white"><ArrowClockwise size={13} weight="bold" className="mr-1" /> Minta Revisi</Button>
                </div>
              )}
              {(action === "review-accept" || action === "review-revise") && (
                <div className={`p-3 border-2 ${action === "review-accept" ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50"} space-y-2`}>
                  <Label className={`text-xs font-semibold ${action === "review-accept" ? "text-emerald-900" : "text-red-900"}`}>
                    {action === "review-accept" ? "Catatan (opsional)" : "Catatan Revisi *"}
                  </Label>
                  <textarea data-testid="review-note" autoFocus value={actNote} onChange={(e) => setActNote(e.target.value)} className="w-full min-h-[60px] rounded-none border p-2 text-sm" placeholder={action === "review-accept" ? "Terima kasih, sudah oke" : "Jelaskan revisi yang diminta"} />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAction(null)} disabled={processing} className="rounded-none">Batal</Button>
                    <Button data-testid="confirm-review" onClick={() => doAction()} disabled={processing} className={`rounded-none text-white ${action === "review-accept" ? "bg-emerald-600" : "bg-red-600"}`}>
                      Konfirmasi
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* History */}
            {(data.history || []).length > 0 && (
              <details className="mt-4">
                <summary className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 cursor-pointer">
                  <ClockCounterClockwise size={11} weight="bold" className="inline mr-1" /> Histori ({data.history.length})
                </summary>
                <div className="mt-2 space-y-1 text-xs">
                  {data.history.slice().reverse().map((h, i) => (
                    <div key={i} className="p-1.5 border-l-2 border-slate-300 text-slate-700">
                      <span className="text-slate-400 tabular-nums">{(h.at || "").slice(0, 16).replace("T", " ")}</span> — <b>{h.by}</b> — {h.action}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


function AttachmentsList({ title, attachments, inquiryId, accent = "slate" }) {
  const list = attachments || [];
  const [previewFile, setPreviewFile] = useState(null);  // {id, filename, mime}
  if (list.length === 0) return null;

  const buildUrl = (id, inline = false) =>
    `${process.env.REACT_APP_BACKEND_URL}/api/inquiries/${inquiryId}/attachments/${id}/download${inline ? "?inline=1" : ""}`;

  const isPreviewable = (mime, filename) => {
    if (!mime) mime = "";
    if (mime === "application/pdf") return true;
    if (mime.startsWith("image/")) return true;
    if (mime.startsWith("text/") && mime.length < 30) return true;
    const ext = (filename || "").split(".").pop().toLowerCase();
    if (["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "md", "csv", "xlsx", "xls", "xlsm"].includes(ext)) return true;
    return false;
  };

  return (
    <>
      <div className="mt-3">
        <div className={`text-[10px] uppercase tracking-[0.1em] font-bold text-${accent}-600 mb-1`}>{title} ({list.length})</div>
        <div className="grid grid-cols-2 gap-2">
          {list.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 border border-slate-200 hover:border-slate-400 hover:bg-slate-50 p-2 text-xs text-slate-700 transition-colors"
            >
              <Paperclip size={14} weight="duotone" className="shrink-0 text-slate-500" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-semibold" title={a.filename}>{a.filename}</div>
                <div className="text-[10px] text-slate-400">{(a.size / 1024).toFixed(1)} KB · {a.uploaded_by}</div>
              </div>
              {isPreviewable(a.mime, a.filename) && (
                <button
                  onClick={() => setPreviewFile(a)}
                  data-testid={`att-preview-${a.id}`}
                  title="Preview di aplikasi"
                  className="p-1 text-sky-700 hover:bg-sky-100 border border-sky-300"
                >👁</button>
              )}
              <a
                href={buildUrl(a.id, false)}
                data-testid={`att-download-${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Download"
                className="p-1 text-slate-700 hover:bg-slate-100 border border-slate-300"
              >
                <DownloadSimple size={12} weight="bold" />
              </a>
            </div>
          ))}
        </div>
      </div>
      {previewFile && (() => {
        const ext = (previewFile.filename || "").split(".").pop().toLowerCase();
        const isPdf = (previewFile.mime === "application/pdf") || ext === "pdf";
        const isExcel = ["xlsx", "xls", "xlsm"].includes(ext);
        if (isPdf || isExcel) {
          return (
            <PdfPreviewModal
              metaUrl={`/inquiries/${inquiryId}/attachments/${previewFile.id}/page-meta`}
              pageUrlBuilder={(n) => `${process.env.REACT_APP_BACKEND_URL}/api/inquiries/${inquiryId}/attachments/${previewFile.id}/page-image?page=${n}&scale=2`}
              title={previewFile.filename}
              subtitle={`${(previewFile.size / 1024).toFixed(1)} KB · Upload oleh ${previewFile.uploaded_by || "-"}${isExcel ? " · Excel (preview gambar)" : ""}`}
              downloadUrl={buildUrl(previewFile.id, false)}
              onClose={() => setPreviewFile(null)}
            />
          );
        }
        return (
          <AttachmentPreviewDialog
            file={previewFile}
            inquiryId={inquiryId}
            onClose={() => setPreviewFile(null)}
            onDownload={() => window.open(buildUrl(previewFile.id, false), "_blank")}
          />
        );
      })()}
    </>
  );
}


function AttachmentPreviewDialog({ file, inquiryId, onClose, onDownload }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState("");
  const [error, setError] = useState("");

  const mime = file.mime || "";
  const ext = (file.filename || "").split(".").pop().toLowerCase();
  const isPdf = mime === "application/pdf" || ext === "pdf";
  const isImage = mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const isText = mime.startsWith("text/") || ["txt", "md", "csv"].includes(ext);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/inquiries/${inquiryId}/attachments/${file.id}/download`, {
          params: { inline: 1 },
          responseType: isText ? "text" : "blob",
        });
        if (cancelled) return;
        if (isText) {
          setTextContent(typeof res.data === "string" ? res.data : "");
        } else {
          objectUrl = URL.createObjectURL(res.data);
          setBlobUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || "Gagal memuat preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, inquiryId, isText]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 border-b border-slate-200">
          <DialogTitle className="flex items-center gap-2">
            <Paperclip size={16} weight="duotone" /> {file.filename}
          </DialogTitle>
          <DialogDescription>
            {(file.size / 1024).toFixed(1)} KB · {file.mime || "unknown"} · Upload oleh {file.uploaded_by}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-4 bg-slate-100 min-h-[70vh]">
          {loading && <div className="text-center text-slate-500 py-16"><CircleNotch size={24} className="inline animate-spin" /><br />Memuat preview...</div>}
          {error && <div className="text-center text-red-600 py-16">⚠️ {error}</div>}
          {!loading && !error && (
            <>
              {isPdf && blobUrl && (
                <iframe title={file.filename} src={blobUrl} className="w-full h-[80vh] bg-white border border-slate-300" />
              )}
              {isImage && blobUrl && (
                <div className="flex items-center justify-center bg-white p-4 border border-slate-300">
                  <img src={blobUrl} alt={file.filename} className="max-w-full max-h-[75vh] object-contain" />
                </div>
              )}
              {isText && (
                <pre className="whitespace-pre-wrap text-xs bg-white p-4 border border-slate-300 font-mono">{textContent || "(file kosong)"}</pre>
              )}
              {!isPdf && !isImage && !isText && (
                <div className="text-center text-slate-500 py-16">
                  📄 File ini tidak bisa di-preview inline. Silakan download untuk melihat.
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="p-4 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
          <Button onClick={onDownload} data-testid="att-preview-download" className="rounded-none bg-slate-900 text-white">
            <DownloadSimple size={13} weight="bold" className="mr-1.5" /> Download File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Meta({ label, value, highlight = false }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm ${highlight ? "font-bold text-slate-900" : "text-slate-800"}`}>{value || "-"}</div>
    </div>
  );
}

const STAT_DOT = {
  slate:   "bg-slate-400",
  rose:    "bg-rose-500",
  amber:   "bg-amber-500",
  sky:     "bg-sky-500",
  violet:  "bg-violet-500",
  emerald: "bg-emerald-500",
  red:     "bg-red-500",
  orange:  "bg-orange-500",
};

function StatCard({ label, value, accent = "slate", testid, active = false, onClick }) {
  const dot = STAT_DOT[accent] || STAT_DOT.slate;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border px-2 py-1 cursor-pointer transition-colors ${
        active
          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      data-testid={testid}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className="text-base font-bold tabular-nums leading-none text-slate-800" style={{ fontFamily: "Chivo, sans-serif" }}>{value ?? 0}</span>
      <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 leading-tight whitespace-nowrap">{label}</span>
    </button>
  );
}


function DeadlineDisplay({ iso, status }) {
  if (!iso) return <span className="text-slate-500">-</span>;
  const info = getDeadlineInfo(iso);
  if (!info) return <span>{iso}</span>;
  const showBadge = !["accepted", "closed"].includes(status);
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span>{iso}</span>
      {showBadge && (
        <span className={`text-[11px] px-1.5 py-0.5 border font-semibold ${info.daysLeft < 0 ? "bg-red-100 border-red-400 text-red-800" : info.daysLeft <= 3 ? "bg-red-50 border-red-300 text-red-700" : info.daysLeft <= 7 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-slate-50 border-slate-300 text-slate-700"}`}>
          {info.label}
        </span>
      )}
    </span>
  );
}


function AssignEngineerPanel({ currentAssigneeId, onCancel, onAssigned, inquiryId }) {
  const [engineers, setEngineers] = useState([]);
  const [selectedId, setSelectedId] = useState(currentAssigneeId || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/inquiries/engineers");
        setEngineers(data.items || []);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Gagal memuat daftar engineer");
      } finally { setLoading(false); }
    })();
  }, []);

  const doAssign = async () => {
    if (!selectedId) return toast.error("Pilih engineer terlebih dahulu");
    const target = engineers.find((e) => e.id === selectedId);
    setSaving(true);
    try {
      await api.post(`/inquiries/${inquiryId}/assign`, {
        engineer_id: selectedId,
        engineer_name: target?.name || "",
      });
      toast.success(`Inquiry di-assign ke ${target?.name || "engineer"}`);
      onAssigned();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal assign");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-3 border-2 border-purple-400 bg-purple-50 space-y-2" data-testid="assign-panel">
      <Label className="text-xs font-semibold text-purple-900">Pilih Engineer *</Label>
      {loading ? (
        <div className="text-xs text-slate-500"><CircleNotch size={12} className="inline animate-spin mr-1" /> Memuat daftar engineer...</div>
      ) : (
        <select
          data-testid="assign-engineer-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full h-9 rounded-none border border-purple-300 bg-white px-2 text-sm"
        >
          <option value="">-- Pilih engineer --</option>
          {engineers.map((eng) => (
            <option key={eng.id} value={eng.id}>
              {eng.name || eng.username} ({(eng.role === "eng_leader" || eng.role === "eng_head") ? "Leader" : eng.role === "eng_staff" ? "Staff" : "Engineering"})
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving} className="rounded-none">Batal</Button>
        <Button data-testid="confirm-assign" onClick={doAssign} disabled={saving || loading} className="rounded-none bg-purple-600 text-white hover:bg-purple-700">
          <UserPlus size={13} weight="bold" className="mr-1" /> {saving ? "Menyimpan..." : "Konfirmasi Assign"}
        </Button>
      </div>
    </div>
  );
}
