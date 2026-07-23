import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import {
  Storefront, Wrench, ArrowLeft, Plus, PaperPlaneTilt, Trash, Paperclip, DownloadSimple,
  FileText, ClockCounterClockwise, ChatCircleDots, Check, X, MagnifyingGlass,
  CircleNotch, Warning, ArrowClockwise, PencilSimple, Receipt,
} from "@phosphor-icons/react";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-rose-600 text-sm";

const STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  submitted: { label: "Terkirim", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  in_progress: { label: "Dikerjakan", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  awaiting_review: { label: "Menunggu Review", cls: "bg-violet-100 text-violet-800 border-violet-300" },
  accepted: { label: "Diterima", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  revision_requested: { label: "Minta Revisi", cls: "bg-red-100 text-red-800 border-red-300" },
  closed: { label: "Ditutup", cls: "bg-slate-200 text-slate-600 border-slate-400" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] font-bold border ${m.cls}`}>{m.label}</span>;
}

export default function SalesPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isSales = role === "sales" || role === "admin";
  const isEngineering = role === "engineering" || role === "admin";
  const isEngOnly = role === "engineering";  // pure engineering view (no sales privileges)

  const [tab, setTab] = useState(isEngineering && !isSales ? "eng" : "mine");  // 'mine' | 'eng' | 'all'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState(null);  // draft object to edit
  const [openInquiry, setOpenInquiry] = useState(null);
  const [pending, setPending] = useState(0);

  const backLink = isEngOnly ? "/engineering" : "/";
  const backLabel = isEngOnly ? "Kembali ke Engineering Portal" : "Kembali ke Portal";
  const HeaderIcon = isEngOnly ? Wrench : Storefront;
  const headerTitle = isEngOnly ? "Engineering — Costing Requests" : "Departemen Sales";
  const headerSubtitle = isEngOnly
    ? "Terima request dari Sales · Upload hasil costing & drawing"
    : "Inquiry Costing · Quotation · Order Status";
  const headerIconCls = isEngOnly ? "text-amber-600" : "text-rose-600";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      const { data } = await api.get("/inquiries", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat");
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const tick = async () => {
      try { const { data } = await api.get("/inquiries/pending-count"); setPending(data.count || 0); } catch {}
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-5">
      <Link to={backLink} className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900" data-testid="sales-back-btn">
        <ArrowLeft size={12} weight="bold" /> {backLabel}
      </Link>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <HeaderIcon size={22} weight="duotone" className={headerIconCls} />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }} data-testid="sales-page-title">{headerTitle}</h1>
          </div>
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500">{headerSubtitle}</p>
        </div>
        {isSales && (
          <Button data-testid="new-inquiry-btn" onClick={() => setShowCreate(true)} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs uppercase tracking-[0.1em]">
            <Plus size={14} weight="bold" className="mr-1.5" /> Buat Inquiry Costing
          </Button>
        )}
      </div>

      {/* Notif */}
      {pending > 0 && (
        <Card className="rounded-none border-rose-300 bg-rose-50 p-3 flex items-center gap-3">
          <Warning size={20} weight="fill" className="text-rose-600 shrink-0" />
          <div className="text-sm text-rose-900">
            <b>{pending}</b> inquiry {role === "sales" ? "menunggu review Anda" : role === "engineering" ? "menunggu penanganan Engineering" : "aktif"}.
          </div>
        </Card>
      )}

      {/* Search + refresh */}
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-lg">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari <span className="text-slate-400 font-normal normal-case">(No Inquiry / Judul / Customer)</span></Label>
          <Input data-testid="sales-search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="mis. INQ-001 / SPM / Float Ring" />
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
        <Button variant="ghost" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" /></Button>
      </div>

      {/* List */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Daftar Inquiry Costing — {items.length} entri
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="inquiries-table">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">No Inquiry</th>
                <th className="text-left p-3">Judul</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Deadline</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">PIC Engineer</th>
                <th className="text-left p-3">Dibuat</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={8} className="p-6 text-center text-slate-400"><CircleNotch size={18} className="inline animate-spin" /></td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={8} className="p-8 text-center text-slate-400">Belum ada inquiry.</td></tr>)}
              {items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono font-semibold text-slate-900">{r.inquiry_no}</td>
                  <td className="p-3 text-slate-800 max-w-[260px] truncate" title={r.title}>{r.title}</td>
                  <td className="p-3 text-slate-700">{r.customer_name}</td>
                  <td className="p-3 text-slate-600 text-xs">{r.customer_deadline || "-"}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                  <td className="p-3 text-slate-700 text-xs">{r.pic_engineer_name || "-"}</td>
                  <td className="p-3 text-slate-500 text-xs">
                    {r.created_by_name}<br />
                    <span className="text-[10px] text-slate-400">{(r.created_at || "").slice(0, 10)}</span>
                  </td>
                  <td className="p-3 text-center">
                    <button data-testid={`open-inquiry-${r.inquiry_no}`} onClick={() => setOpenInquiry(r)} className="text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-none">Buka</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [deadline, setDeadline] = useState(initial?.customer_deadline || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [items, setItems] = useState(
    initial?.items?.length ? initial.items : [{ item_name: "", qty: 1, unit: "EA", specification: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);  // File[] to upload after create

  const addItem = () => setItems((p) => [...p, { item_name: "", qty: 1, unit: "EA", specification: "" }]);
  const setItem = (i, k, v) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const rmItem = (i) => setItems((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const doSave = async (submitNow = false) => {
    if (!title.trim()) return toast.error("Judul wajib diisi");
    if (!customer.trim()) return toast.error("Customer wajib diisi");
    setSaving(true);
    try {
      let inquiryId = existingId;
      const payloadCore = {
        title, customer_name: customer, customer_deadline: deadline || null,
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
      toast.success(submitNow ? `Inquiry terkirim ke Engineering` : `Inquiry ${noun}`);
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
          <DialogDescription>Isi detail request costing untuk dikirim ke Engineering. {isEdit ? "Simpan perubahan atau langsung kirim." : "Simpan sebagai draft atau langsung kirim."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Judul Project *</Label>
              <Input data-testid="inq-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Float Ring INC 825 for SPM" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Customer *</Label>
              <Input data-testid="inq-customer" className={inputCls} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="mis. PT. SPM Oil & Gas" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Deadline Customer</Label>
              <Input data-testid="inq-deadline" type="date" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
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
            <PaperPlaneTilt size={13} weight="bold" className="mr-1" /> Kirim ke Engineering
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
  const [processing, setProcessing] = useState(false);

  const role = user?.role;
  const isMineSales = role === "sales" && data?.created_by_id === user?.id;
  const canEditDraft = data && data.status === "draft" && (isMineSales || role === "admin");
  const isOwnerOrAdmin = isMineSales || role === "admin";
  const isEng = role === "engineering" || role === "admin";
  const isSalesOrAdmin = role === "sales" || role === "admin";

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
        for (const f of pendingEngFiles) {
          const fd = new FormData(); fd.append("file", f); fd.append("slot", "engineer");
          await api.post(`/inquiries/${inquiryId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        }
        await api.post(`/inquiries/${inquiryId}/complete`, new URLSearchParams({ note: actNote }), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } else if (a === "review-accept") {
        await api.post(`/inquiries/${inquiryId}/review`, { approve: true, review_note: actNote });
      } else if (a === "review-revise") {
        if (!actNote.trim()) { setProcessing(false); return toast.error("Catatan revisi wajib diisi"); }
        await api.post(`/inquiries/${inquiryId}/review`, { approve: false, review_note: actNote });
      } else if (a === "submit-draft") {
        await api.post(`/inquiries/${inquiryId}/submit`);
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
                <StatusBadge status={data.status} />
              </DialogTitle>
              <DialogDescription>{data.title}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Meta label="Customer" value={data.customer_name} />
              <Meta label="Deadline Customer" value={data.customer_deadline || "-"} />
              <Meta label="Dibuat oleh" value={data.created_by_name} />
              <Meta label="Tanggal Buat" value={(data.created_at || "").slice(0, 10)} />
              <Meta label="PIC Engineer" value={data.pic_engineer_name || "-"} highlight />
              <Meta label="Accepted oleh" value={data.accepted_by_name || "-"} />
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
                    <PaperPlaneTilt size={13} weight="bold" className="mr-1" /> Kirim ke Engineering
                  </Button>
                </div>
              )}

              {/* Sales accepted → Buat Quotation shortcut */}
              {isSalesOrAdmin && data.status === "accepted" && (isOwnerOrAdmin) && !action && (
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

              {/* Engineering accept */}
              {isEng && data.status === "submitted" && !action && (
                <Button data-testid="btn-accept-inquiry" onClick={() => setAction("accept")} className="rounded-none bg-sky-600 hover:bg-sky-700 text-white text-xs uppercase tracking-[0.1em]">
                  <Check size={13} weight="bold" className="mr-1" /> Accept Inquiry
                </Button>
              )}
              {action === "accept" && (
                <div className="p-3 border-2 border-sky-400 bg-sky-50 space-y-2">
                  <Label className="text-xs font-semibold text-sky-900">Nama PIC Engineer *</Label>
                  <Input data-testid="pic-engineer-input" autoFocus value={actInput} onChange={(e) => setActInput(e.target.value)} className="rounded-none border-sky-400" placeholder="mis. Sudirman, Andi Wijaya" />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAction(null)} disabled={processing} className="rounded-none">Batal</Button>
                    <Button data-testid="confirm-accept" onClick={doAction} disabled={processing} className="rounded-none bg-sky-600 text-white">Konfirmasi Accept</Button>
                  </div>
                </div>
              )}

              {/* Engineering complete */}
              {isEng && data.status === "in_progress" && !action && (
                <Button data-testid="btn-complete-inquiry" onClick={() => setAction("complete")} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em]">
                  <Check size={13} weight="bold" className="mr-1" /> Selesai Kerja & Kirim ke Sales
                </Button>
              )}
              {action === "complete" && (
                <div className="p-3 border-2 border-emerald-400 bg-emerald-50 space-y-2">
                  <Label className="text-xs font-semibold text-emerald-900">Upload File Hasil (drawing, costing file, dokumen)</Label>
                  <input type="file" multiple data-testid="eng-files" onChange={(e) => setPendingEngFiles(Array.from(e.target.files || []))} className="text-xs" />
                  {pendingEngFiles.length > 0 && <div className="text-[11px] text-emerald-900">{pendingEngFiles.length} file akan diupload</div>}
                  <Label className="text-xs font-semibold text-emerald-900">Catatan untuk Sales</Label>
                  <textarea data-testid="eng-note" className="w-full min-h-[60px] rounded-none border border-emerald-300 p-2 text-sm" value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="Ringkasan hasil kerja, asumsi harga, dll" />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAction(null)} disabled={processing} className="rounded-none">Batal</Button>
                    <Button data-testid="confirm-complete" onClick={doAction} disabled={processing} className="rounded-none bg-emerald-600 text-white">Kirim ke Sales</Button>
                  </div>
                </div>
              )}

              {/* Sales review */}
              {isSalesOrAdmin && data.status === "awaiting_review" && !action && (isOwnerOrAdmin) && (
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
                    <Button data-testid="confirm-review" onClick={doAction} disabled={processing} className={`rounded-none text-white ${action === "review-accept" ? "bg-emerald-600" : "bg-red-600"}`}>
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
  if (list.length === 0) return null;
  return (
    <div className="mt-3">
      <div className={`text-[10px] uppercase tracking-[0.1em] font-bold text-${accent}-600 mb-1`}>{title} ({list.length})</div>
      <div className="grid grid-cols-2 gap-2">
        {list.map((a) => (
          <a
            key={a.id}
            href={`${process.env.REACT_APP_BACKEND_URL}/api/inquiries/${inquiryId}/attachments/${a.id}/download`}
            data-testid={`att-download-${a.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-slate-200 hover:border-slate-400 hover:bg-slate-50 p-2 text-xs text-slate-700 transition-colors"
          >
            <Paperclip size={14} weight="duotone" className="shrink-0 text-slate-500" />
            <div className="flex-1 min-w-0">
              <div className="truncate font-semibold">{a.filename}</div>
              <div className="text-[10px] text-slate-400">{(a.size / 1024).toFixed(1)} KB · {a.uploaded_by}</div>
            </div>
            <DownloadSimple size={14} weight="bold" className="text-slate-500" />
          </a>
        ))}
      </div>
    </div>
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
