import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  FloppyDisk,
  PaperPlaneTilt,
  CheckCircle,
  XCircle,
  Plus,
  Trash,
  ClipboardText,
  Warning,
  FileText,
  UploadSimple,
  Eye,
  ChatCircleDots,
  ChatText,
  Clock,
} from "@phosphor-icons/react";

/* -------------------- Constants -------------------- */

const UOM_OPTIONS = ["", "Pcs", "Set", "Kg", "M", "Meter", "Lot", "Ea", "Box", "Roll", "Ltr", "Pack"];

const SIG_ROSTER = {
  checked_by: { name: "Riski", role_label: "Engineering Leader" },
  acknowledged_by: { name: "Susanto", role_label: "Purchasing" },
  approved_by: { name: "Erwin", role_label: "Admin" },
};

const COLS = [
  { key: "item_specification", label: "Item Specification", w: "min-w-[280px]", type: "text", required: true },
  { key: "qty", label: "Qty", w: "w-20", type: "number", align: "right" },
  { key: "uom", label: "Uom", w: "w-24", type: "select", options: UOM_OPTIONS },
  { key: "material", label: "Material", w: "min-w-[180px]", type: "text" },
  { key: "weight_kg", label: "Weight (Kg)", w: "w-28", type: "number", align: "right" },
  { key: "purchase_due_date", label: "Purchase Due Date", w: "w-40", type: "date" },
  { key: "remark", label: "Remarks", w: "min-w-[180px]", type: "text" },
];

const emptyRow = () => ({
  item_specification: "", qty: "", uom: "", material: "", weight_kg: "", purchase_due_date: "", remark: "",
});

// Attachment slots (4 categories)
const ATTACH_SLOTS = [
  { key: "drawing",      label: "Drawing PDF (MKS)",       accept: ".pdf",                    color: "violet" },
  { key: "customer_ref", label: "Customer Reference",       accept: ".pdf,.jpg,.jpeg,.png",   color: "sky" },
  { key: "nesting",      label: "Nesting",                  accept: ".pdf,.xlsx,.xls",        color: "amber" },
  { key: "nesting_price", label: "Nesting Price",           accept: ".pdf,.xlsx,.xls,.doc,.docx", color: "cyan" },
  { key: "costing_prev", label: "Costing Sebelumnya",       accept: ".xlsx,.xls,.pdf",        color: "rose" },
];

const REV_ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx";

/* -------------------- Grid Cell -------------------- */

function GridCell({ value, onChange, col, cellRef, onKeyDown, disabled }) {
  const baseCls =
    "w-full h-9 px-2 text-sm border-0 outline-none bg-transparent focus:bg-yellow-50 " +
    (col.align === "right" ? "text-right " : "");
  if (disabled) return <div className={baseCls + "text-slate-500"}>{value || ""}</div>;
  if (col.type === "select") {
    return (
      <select ref={cellRef} value={value || ""} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} className={baseCls}>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      ref={cellRef}
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      step={col.type === "number" ? "any" : undefined}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={baseCls}
    />
  );
}

/* -------------------- Signature Card -------------------- */

function SigCard({ label, sig, expectedName, expectedRole, action, canAct, actLabel }) {
  const filled = !!sig;
  return (
    <div className={`border-2 p-3 space-y-1 ${filled ? "border-emerald-500 bg-emerald-50" : "border-dashed border-slate-300 bg-white"}`}>
      <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">{label}</div>
      <div className="text-xs text-slate-600">{expectedRole}</div>
      {filled ? (
        <>
          <div className="text-sm font-bold text-emerald-800">✓ {sig.name}</div>
          <div className="text-[10px] text-slate-500">{sig.at ? new Date(sig.at).toLocaleString("id-ID") : ""}</div>
        </>
      ) : (
        <div className="text-xs italic text-slate-400 h-8 flex items-center">Menunggu {expectedName || "..."}</div>
      )}
      {!filled && canAct && action && (
        <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-none border-emerald-600 text-emerald-700 hover:bg-emerald-50 mt-1" onClick={action}>
          {actLabel}
        </Button>
      )}
    </div>
  );
}

/* -------------------- Attachment Slot -------------------- */

function AttachmentSlot({ slot, files, bomId, onChanged, disabled }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("category", slot.key);
    fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post(`/bom/${bomId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data?.warning) {
        toast.warning(`${slot.label} terupload — ${data.warning}`, { duration: 8000 });
      } else if (data?.validation?.status === "match") {
        toast.success(`${slot.label} OK ✓ Nomor drawing cocok (hal ${data.validation.page})`);
      } else {
        toast.success(`${slot.label} berhasil diupload`);
      }
      onChanged();
    } catch (e) {
      const d = e.response?.data?.detail;
      if (typeof d === "object" && d?.message) {
        const cand = Array.isArray(d.candidates) && d.candidates.length
          ? `\nKandidat ditemukan di PDF: ${d.candidates.slice(0, 5).join(", ")}`
          : "";
        toast.error(`${d.message}${cand}\n${d.hint || "Silakan upload ulang."}`, { duration: 12000 });
      } else {
        toast.error(typeof d === "string" ? d : "Gagal upload");
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (attachId) => {
    if (!window.confirm("Hapus file ini?")) return;
    try {
      await api.delete(`/bom/${bomId}/attachments/${attachId}`);
      toast.success("Terhapus");
      onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  const preview = (a) => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/bom/${bomId}/attachments/${a.id}/download`;
    window.open(url, "_blank");
  };

  const colorMap = {
    violet: "border-violet-400 bg-violet-50/40",
    sky:    "border-sky-400 bg-sky-50/40",
    amber:  "border-amber-400 bg-amber-50/40",
    rose:   "border-rose-400 bg-rose-50/40",
  };

  return (
    <div className={`border-2 ${colorMap[slot.color]} p-3 space-y-2`} data-testid={`wo-attach-${slot.key}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-700">{slot.label}</div>
          <div className="text-[9px] text-slate-500">Boleh: {slot.accept}</div>
        </div>
        {!disabled && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={slot.accept}
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
              data-testid={`wo-attach-input-${slot.key}`}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] rounded-none border-slate-400"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              data-testid={`wo-attach-btn-${slot.key}`}
            >
              <UploadSimple size={12} weight="bold" className="mr-1" /> {busy ? "..." : "Upload"}
            </Button>
          </>
        )}
      </div>
      <div className="space-y-1">
        {(files || []).length === 0 ? (
          <div className="text-[11px] italic text-slate-400">Belum ada file</div>
        ) : (
          files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 p-1.5">
              <div className="flex items-center gap-1 min-w-0">
                <FileText size={13} className="text-slate-500 shrink-0" />
                <span className="text-[11px] truncate" title={f.filename}>{f.filename}</span>
                <span className="text-[9px] text-slate-400 whitespace-nowrap">({Math.round((f.size || 0) / 1024)} KB)</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => preview(f)} className="text-violet-700 hover:bg-violet-50 p-1" title="Preview"><Eye size={12} /></button>
                {!disabled && (
                  <button onClick={() => remove(f.id)} className="text-rose-600 hover:bg-rose-50 p-1" title="Hapus"><Trash size={12} /></button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------- Revision History Panel -------------------- */

function RevisionPanel({ bom, attachmentsById, isEngLeader, onAddNote, onOpenReject }) {
  const notes = bom?.revision_notes || [];
  if (notes.length === 0 && !isEngLeader) return null;
  return (
    <div className="border-2 border-orange-400 bg-orange-50/40 p-4 space-y-3" data-testid="wo-revision-panel">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-orange-800">
          🔄 Revision History dari Engineering Leader ({notes.length})
        </div>
        {isEngLeader && bom.engineering_status === "pending_review" && (
          <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-none border-orange-500 text-orange-800 hover:bg-orange-100" onClick={onAddNote} data-testid="wo-add-revision-note">
            <ChatCircleDots size={12} weight="bold" className="mr-1" /> Tambah Catatan Revisi
          </Button>
        )}
      </div>
      {notes.length === 0 && (
        <div className="text-xs italic text-slate-500">Belum ada revisi. Engineering Leader bisa menambahkan catatan + attachment kalau perlu perbaikan.</div>
      )}
      <div className="space-y-2">
        {notes.map((n, i) => (
          <div key={n.id || i} className={`bg-white border-l-4 ${n.kind === "reject" ? "border-rose-600" : "border-orange-500"} p-3 space-y-1`}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800">
                {n.kind === "reject" ? "❌ Reject" : "💬 Catatan"} · {n.by}
                <span className="text-[10px] text-slate-500 font-normal ml-2">({n.role || "eng"})</span>
              </div>
              <div className="text-[10px] text-slate-500">{n.at ? new Date(n.at).toLocaleString("id-ID") : ""}</div>
            </div>
            {n.comment && (
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{n.comment}</div>
            )}
            {(n.attachment_ids || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {n.attachment_ids.map((aid) => {
                  const a = attachmentsById[aid];
                  if (!a) return <span key={aid} className="text-[10px] text-slate-400 italic">(file hilang)</span>;
                  return (
                    <a
                      key={aid}
                      href={`${process.env.REACT_APP_BACKEND_URL}/api/bom/${bom.id}/attachments/${aid}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 hover:bg-orange-200 text-[10px] text-orange-800 border border-orange-300"
                    >
                      <FileText size={11} /> {a.filename}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------- Revision Note Dialog -------------------- */

function RevisionNoteDialog({ bomId, mode = "note", onClose, onSaved }) {
  // mode: 'note' (just comment) OR 'reject' (comment becomes reject reason)
  const [comment, setComment] = useState("");
  const [uploadedIds, setUploadedIds] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]); // {id, filename}
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const uploadRev = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("category", "revision");
    fd.append("file", file);
    try {
      const { data } = await api.post(`/bom/${bomId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setUploadedIds((prev) => [...prev, data.attachment?.id || data.id]);
      setUploadedFiles((prev) => [...prev, { id: data.attachment?.id || data.id, filename: data.attachment?.filename || data.filename }]);
      toast.success("File revisi terupload");
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "object" ? (d?.message || "Gagal upload") : (d || "Gagal upload"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!comment.trim() && uploadedIds.length === 0) {
      toast.error("Isi komentar atau minimal 1 file revisi");
      return;
    }
    if (mode === "reject" && !comment.trim()) {
      toast.error("Alasan reject wajib diisi");
      return;
    }
    setBusy(true);
    try {
      if (mode === "reject") {
        await api.post(`/bom/${bomId}/reject-review`, { reason: comment.trim(), attachment_ids: uploadedIds });
        toast.success("BOM dikembalikan ke Draft dgn catatan revisi");
      } else {
        await api.post(`/bom/${bomId}/revision-note`, { comment: comment.trim(), attachment_ids: uploadedIds });
        toast.success("Catatan revisi tersimpan");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-slate-800 w-full max-w-lg p-4 space-y-3">
        <div className="text-sm font-bold text-slate-800">
          {mode === "reject" ? "❌ Kembalikan BOM ke Draft (Reject)" : "💬 Tambah Catatan Revisi"}
        </div>
        <Textarea
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={mode === "reject" ? "Alasan reject — mis. item 3 size salah, tambah item baut M12" : "Catatan revisi untuk engineer (opsional kalau ada attachment)"}
          className="rounded-none border-slate-300 text-sm"
          data-testid="wo-rev-comment"
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-700">Attachment Revisi (opsional)</div>
            <input
              ref={fileRef}
              type="file"
              accept={REV_ATTACH_ACCEPT}
              className="hidden"
              onChange={(e) => uploadRev(e.target.files?.[0])}
              data-testid="wo-rev-attach-input"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] rounded-none border-slate-400"
              onClick={() => fileRef.current?.click()}
              data-testid="wo-rev-attach-btn"
            >
              <UploadSimple size={12} weight="bold" className="mr-1" /> Upload File Revisi
            </Button>
          </div>
          {uploadedFiles.map((f) => (
            <div key={f.id} className="flex items-center gap-1 bg-orange-50 border border-orange-300 px-2 py-1 text-[11px]">
              <FileText size={11} /> {f.filename}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="outline" className="h-9 rounded-none" onClick={onClose}>Batal</Button>
          <Button
            className={`h-9 rounded-none text-white ${mode === "reject" ? "bg-rose-600 hover:bg-rose-700" : "bg-orange-600 hover:bg-orange-700"}`}
            onClick={submit}
            disabled={busy}
            data-testid="wo-rev-submit"
          >
            {busy ? "..." : (mode === "reject" ? "Kirim Reject" : "Simpan Catatan")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- SO Request Panel (Engineering → Admin/Sales) -------------------- */

function SORequestPanel({ requestedSoNo, projectHint }) {
  const [customerHint, setCustomerHint] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [existingReq, setExistingReq] = useState(null);

  // Check if there's already a pending request for this SO
  useEffect(() => {
    if (!requestedSoNo) return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/so-requests", { params: { status: "pending" } });
        const match = (data.items || []).find((r) =>
          String(r.requested_so_no || "").trim().toUpperCase() === requestedSoNo.trim().toUpperCase()
        );
        setExistingReq(match || null);
      } catch { setExistingReq(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [requestedSoNo]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/so-requests", {
        requested_so_no: requestedSoNo,
        customer_hint: customerHint,
        project_hint: projectHint,
        notes,
      });
      toast.success("Permintaan SO terkirim ke Admin/Sales/Purchasing");
      setSent(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal kirim permintaan");
    } finally { setBusy(false); }
  };

  if (existingReq && !sent) {
    return (
      <div className="border-2 border-amber-500 bg-amber-50 p-3 text-xs space-y-1" data-testid="wo-new-so-req-existing">
        <div className="font-bold text-amber-800 flex items-center gap-1">
          <Clock size={14} weight="bold" /> Permintaan SO {requestedSoNo} sudah dikirim sebelumnya
        </div>
        <div className="text-amber-700">
          Oleh: <b>{existingReq.requested_by_name}</b> · {(existingReq.created_at || "").slice(0, 10)}
          <br />
          Status: <b>Menunggu Admin/Sales bikin SO di Master SO.</b> Silakan tunggu atau hubungi mereka langsung.
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="border-2 border-emerald-500 bg-emerald-50 p-3 text-xs space-y-1" data-testid="wo-new-so-req-sent">
        <div className="font-bold text-emerald-800 flex items-center gap-1">
          <CheckCircle size={14} weight="bold" /> Permintaan SO {requestedSoNo} terkirim
        </div>
        <div className="text-emerald-700">
          Admin, Sales, & Purchasing sudah dapat notifikasi. Setelah SO dibuat di Master SO, kembali ke halaman ini dan pilih SO nya.
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-rose-500 bg-rose-50 p-3 text-xs space-y-3" data-testid="wo-new-so-not-found">
      <div className="font-bold text-rose-800 flex items-center gap-1">
        <Warning size={14} weight="bold" /> Nomor SO &ldquo;{requestedSoNo}&rdquo; tidak ditemukan
      </div>
      <div className="text-rose-700">
        SO belum di-register di sistem. Registrasi SO bukan tugas Engineering — silakan <b>kirim permintaan ke Admin / Sales / Purchasing</b> untuk buat SO baru. Mereka akan langsung dapat notifikasi.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-rose-300">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Nama Customer (tebakan)</div>
          <Input className="h-9 rounded-none border-slate-300 text-sm bg-white" value={customerHint} onChange={(e) => setCustomerHint(e.target.value)} placeholder="mis. PT Cahaya Nusantara" data-testid="wo-new-so-req-customer" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Catatan Tambahan (opsional)</div>
          <Input className="h-9 rounded-none border-slate-300 text-sm bg-white" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. urgent, jadwal Delivery 2 minggu" data-testid="wo-new-so-req-notes" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9 rounded-none bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-bold px-4"
          onClick={submit}
          disabled={busy}
          data-testid="wo-new-so-req-submit"
        >
          <PaperPlaneTilt size={13} weight="bold" className="mr-1" />
          {busy ? "Mengirim..." : "Kirim Permintaan ke Admin/Sales"}
        </Button>
        <span className="text-[10px] text-slate-500 italic">Notif akan muncul di dashboard Admin/Sales/Purchasing</span>
      </div>
    </div>
  );
}


/* -------------------- New Order Form (mode: create) -------------------- */

function NewOrderForm() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [orderType, setOrderType] = useState("new"); // new | repeat
  const [f, setF] = useState({
    customer_code: "MKS",
    project_initial: "",
    drawing_type: "Assembly",
    revision: "Rev-0",
    discipline: "Mechanical",
    so_no: "",
    project_name: "",
    class_material: "",
    customer_name: "", // display-only (fetched from master SO)
    drawing_no_manual: "",  // optional override
  });
  const [soLookup, setSoLookup] = useState([]);
  const [soOpen, setSoOpen] = useState(false);
  const [soConfirmed, setSoConfirmed] = useState(false); // true = user picked SO from list, next sections unlock
  const [soSearchExecuted, setSoSearchExecuted] = useState(false); // true if user typed >= 3 chars and got results
  const [existingBom, setExistingBom] = useState(null);
  const [nextPreview, setNextPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [repeatSrc, setRepeatSrc] = useState(null); // repeat order source BOM

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Reset form saat switch order type — jangan copy data lama
  const changeOrderType = (t) => {
    setOrderType(t);
    setF({
      customer_code: "MKS", project_initial: "", drawing_type: "Assembly",
      revision: "Rev-0", discipline: "Mechanical",
      so_no: "", project_name: "", class_material: "", customer_name: "",
      drawing_no_manual: "",
    });
    setSoLookup([]); setSoOpen(false); setSoConfirmed(false); setSoSearchExecuted(false);
    setExistingBom(null); setRepeatSrc(null); setRepeatQ(""); setRepeatOpts([]);
  };

  // Repeat Order source BOM search
  const [repeatQ, setRepeatQ] = useState("");
  const [repeatOpts, setRepeatOpts] = useState([]);
  const [repeatOpen, setRepeatOpen] = useState(false);
  useEffect(() => {
    if (orderType !== "repeat") { setRepeatOpts([]); return; }
    const q = (repeatQ || "").trim();
    if (!q) { setRepeatOpts([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/bom/lookup", { params: { q, limit: 15 } });
        setRepeatOpts(data.items || []);
      } catch { setRepeatOpts([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [orderType, repeatQ]);

  // SO autocomplete
  useEffect(() => {
    const q = (f.so_no || "").trim();
    if (!q) { setSoLookup([]); setSoSearchExecuted(false); return; }
    if (soConfirmed) return; // don't re-search after confirmed pick
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/sales-orders", { params: { q } });
        setSoLookup((data || []).slice(0, 8));
        setSoSearchExecuted(q.length >= 3);
      } catch { setSoLookup([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [f.so_no, soConfirmed]);

  // Auto-detect existing BOM ketika SO diketik/dipilih
  useEffect(() => {
    const so = (f.so_no || "").trim();
    if (!so) { setExistingBom(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/bom/lookup", { params: { q: so, limit: 5 } });
        const match = (data.items || []).find((b) => String(b.so_no || "").trim().toUpperCase() === so.toUpperCase());
        setExistingBom(match || null);
      } catch { setExistingBom(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [f.so_no]);

  // Preview drawing no (auto)
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/drawings/next-number", {
          params: {
            customer_code: f.customer_code || "MKS",
            project_initial: f.project_initial || "",
            drawing_type: f.drawing_type || "Assembly",
          },
        });
        setNextPreview(data.next || "");
      } catch { setNextPreview(""); }
    }, 200);
    return () => clearTimeout(t);
  }, [f.customer_code, f.project_initial, f.drawing_type]);

  const pickSo = async (so) => {
    set("so_no", so.so_no);
    set("customer_name", so.customer || "");
    if (!f.project_name && so.description) set("project_name", so.description);
    setSoOpen(false);
    setSoConfirmed(true);
    // Auto-fill customer_code dari customer master (lookup by name, case-insensitive)
    if (so.customer) {
      try {
        const { data } = await api.get("/customers", { params: { q: so.customer, limit: 5 } });
        const match = (data.items || []).find(
          (c) => (c.name || "").trim().toLowerCase() === (so.customer || "").trim().toLowerCase()
        ) || (data.items || [])[0];
        if (match && match.customer_code) {
          set("customer_code", (match.customer_code || "MKS").toUpperCase());
        }
      } catch { /* silent fallback */ }
    }
  };

  const resetSo = () => {
    set("so_no", "");
    set("customer_name", "");
    setSoConfirmed(false);
    setSoLookup([]);
    setSoSearchExecuted(false);
    setExistingBom(null);
  };

  // SO not-found detection: user typed >= 3 chars, search executed, no results
  const soNotFound = (f.so_no || "").trim().length >= 3 && soSearchExecuted && soLookup.length === 0 && !soConfirmed;

  const submit = async () => {
    if (orderType === "new") {
      if (!f.so_no.trim() || !soConfirmed) {
        toast.error("Pilih Nomor SO dari list dulu (auto-fill customer)");
        return;
      }
      if (!f.project_initial.trim()) {
        toast.error("Project Initial wajib diisi (mis. SP, UC, PL) untuk auto-generate Drawing No");
        return;
      }
    } else if (orderType === "repeat") {
      if (!repeatSrc) {
        toast.error("Pilih BOM sumber untuk Repeat Order dulu");
        return;
      }
      if (!f.so_no.trim() || !soConfirmed) {
        toast.error("Pilih Nomor SO baru untuk Repeat Order ini");
        return;
      }
      if (!f.project_initial.trim()) {
        toast.error("Project Initial wajib diisi");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        drawing_no: (f.drawing_no_manual || "").trim(),
        customer_code: (f.customer_code || "MKS").toUpperCase(),
        project_initial: (f.project_initial || "").toUpperCase(),
        drawing_type: f.drawing_type,
        revision: f.revision,
        discipline: f.discipline,
        so_no: f.so_no.trim(),
        project_name: f.project_name.trim(),
        class_material: f.class_material.trim(),
        prepared_by: user?.name || user?.username || "",
        status: "Draft",
        // Repeat: paksa create_new BOM (baru) dgn source_bom_id → backend copy items+attachments
        // New (bukan repeat): pakai existing kalau sudah ada, atau create_new
        bom_link_mode: orderType === "repeat" ? "create_new" : (existingBom ? "existing" : "create_new"),
        bom_no: "",
        bom_id: (orderType === "new" && existingBom) ? existingBom.id : "",
        source_bom_id: orderType === "repeat" ? (repeatSrc?.id || "") : "",
      };
      const { data } = await api.post("/drawings", payload);
      const label = orderType === "repeat" ? "Repeat Order" : "Drawing";
      toast.success(`${label} ${data.drawing_no} + BOM ${data.bom_no || ""} berhasil dibuat`);
      if (data.bom_id) {
        nav(`/engineering/bom-entry/${data.bom_id}?just_created=1`);
      } else {
        nav(-1);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal buat drawing");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-4">
      <div>
        <button type="button" onClick={() => nav(-1)} className="inline-flex items-center gap-2 px-3 h-9 mb-1 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]">
          <ArrowLeft size={16} weight="bold" /> Kembali ke Halaman Sebelumnya
        </button>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight mt-1">
          <ClipboardText className="inline-block mr-2 mb-1" size={26} weight="bold" />
          Register Drawing + Order Baru
        </h1>
        <div className="text-xs text-slate-500 mt-1">
          Isi info di sini. Setelah simpan, Anda akan langsung dibawa ke halaman lengkap untuk upload files + isi grid BOM.
        </div>
      </div>

      {/* Jenis Order */}
      <div className="bg-white border-2 border-slate-300 p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-700">Jenis Order</div>
        <div className="grid grid-cols-2 gap-2">
          <label className={`cursor-pointer border-2 p-3 ${orderType === "new" ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}>
            <input type="radio" checked={orderType === "new"} onChange={() => changeOrderType("new")} className="mr-2" />
            <b className="text-sm">New Order</b>
            <div className="text-[11px] text-slate-500 mt-0.5">Register drawing + BOM baru (mulai dari kosong)</div>
          </label>
          <label className={`cursor-pointer border-2 p-3 ${orderType === "repeat" ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}>
            <input type="radio" checked={orderType === "repeat"} onChange={() => changeOrderType("repeat")} className="mr-2" />
            <b className="text-sm">Repeat Order</b>
            <div className="text-[11px] text-slate-500 mt-0.5">Duplikat BOM lama — items + attachment auto-salin ke BOM baru</div>
          </label>
        </div>
      </div>

      {/* Repeat Order — Step 0: pilih BOM sumber */}
      {orderType === "repeat" && (
        <div className={`border-2 p-3 space-y-3 ${repeatSrc ? "border-emerald-400 bg-emerald-50/30" : "border-indigo-400 bg-indigo-50/30"}`}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-700">
              Step 0 — Pilih BOM Sumber (dari order lama)
            </div>
            {repeatSrc && (
              <button type="button" onClick={() => { setRepeatSrc(null); setRepeatQ(""); }} className="text-[10px] text-slate-500 hover:text-rose-600 underline" data-testid="wo-new-reset-repeat">
                Ganti Sumber
              </button>
            )}
          </div>

          {!repeatSrc ? (
            <div className="relative">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Cari SO / BOM No / Drawing No lama</div>
              <Input
                className="h-10 rounded-none border-slate-300 text-sm font-mono"
                value={repeatQ}
                onChange={(e) => { setRepeatQ(e.target.value); setRepeatOpen(true); }}
                onFocus={() => setRepeatOpen(true)}
                onBlur={() => setTimeout(() => setRepeatOpen(false), 200)}
                placeholder="Ketik mis. 5207 atau BOM003 atau DWG.26.07.01"
                data-testid="wo-new-repeat-search"
                autoFocus
              />
              {repeatOpen && repeatOpts.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-slate-300 shadow-lg z-30 max-h-72 overflow-y-auto">
                  {repeatOpts.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-100 text-xs"
                      onClick={() => { setRepeatSrc(b); setRepeatOpen(false); }}
                      data-testid={`wo-new-repeat-opt-${b.bom_no}`}
                    >
                      <div className="font-mono font-bold text-slate-900">{b.bom_no} · SO {b.so_no}</div>
                      <div className="text-slate-600">{b.customer || "-"} · {b.project_name || "-"}</div>
                      <div className="text-[10px] text-slate-500">{(b.items_count || (b.items?.length ?? 0))} items · {b.bom_date || ""}</div>
                    </button>
                  ))}
                </div>
              )}
              {repeatQ.trim().length >= 3 && repeatOpts.length === 0 && (
                <div className="border-2 border-amber-400 bg-amber-50 p-3 text-xs mt-2" data-testid="wo-new-repeat-notfound">
                  <div className="font-bold text-amber-800 flex items-center gap-1"><Warning size={13} weight="bold" /> Tidak ada BOM lama cocok dengan &ldquo;{repeatQ}&rdquo;</div>
                  <div className="text-amber-700 mt-1">
                    Pilihan: (a) Pilih BOM lain, atau (b) buat sebagai <b>New Order</b> lalu upload manual data (Drawing PDF, Nesting, Costing sebelumnya) di halaman Work Order — itu juga akan otomatis di-salin ke items BOM baru.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border-2 border-emerald-500 p-3 space-y-1" data-testid="wo-new-repeat-src-preview">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={14} weight="bold" className="text-emerald-600" />
                <span className="font-mono font-bold text-emerald-800">{repeatSrc.bom_no}</span>
                <span className="text-slate-500">·</span>
                <span className="font-mono text-slate-600">SO {repeatSrc.so_no}</span>
              </div>
              <div className="text-xs text-slate-700">
                <b>{repeatSrc.customer || "-"}</b> · {repeatSrc.project_name || "-"} · <span className="text-slate-500">Class: {repeatSrc.class_material || "-"}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex flex-wrap gap-3 mt-1">
                <span>📦 {repeatSrc.items_count || (repeatSrc.items?.length ?? 0)} items → akan di-copy</span>
                <span>📎 Attachments (Drawing/Nesting/Costing) → auto reference-copy</span>
              </div>
              <div className="text-[10px] text-slate-500 italic mt-1">
                💡 Setelah submit, semua data ini akan tersalin ke BOM baru dan bisa Anda edit. Costing lama masuk ke slot &ldquo;Costing Sebelumnya&rdquo;.
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 1: Nomor SO — untuk New Order langsung tampil, untuk Repeat harus pilih source dulu */}
      {(orderType === "new" || repeatSrc) && (
      <div className={`border-2 p-3 space-y-3 ${soConfirmed ? "border-emerald-400 bg-emerald-50/30" : "border-amber-400 bg-amber-50/40"}`}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-700">
            Step 1 — {orderType === "repeat" ? "Nomor SO BARU (repeat order = SO baru)" : "Cari / Pilih Nomor SO"}
          </div>
          {soConfirmed && (
            <button type="button" onClick={resetSo} className="text-[10px] text-slate-500 hover:text-rose-600 underline" data-testid="wo-new-reset-so">
              Ganti SO
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Nomor SO *</div>
            <Input
              className="h-10 rounded-none border-slate-300 text-sm font-mono"
              value={f.so_no}
              onChange={(e) => { set("so_no", e.target.value); setSoOpen(true); if (soConfirmed) setSoConfirmed(false); }}
              onFocus={() => setSoOpen(true)}
              onBlur={() => setTimeout(() => setSoOpen(false), 200)}
              placeholder="mis. SO-2026-001 atau ketik untuk cari"
              disabled={soConfirmed}
              data-testid="wo-new-so"
              autoFocus
            />
            {soOpen && soLookup.length > 0 && !soConfirmed && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-slate-300 shadow-lg z-30 max-h-64 overflow-y-auto">
                {soLookup.map((so) => (
                  <button
                    key={so.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-100 text-xs"
                    onClick={() => pickSo(so)}
                    data-testid={`wo-new-so-opt-${so.so_no}`}
                  >
                    <div className="font-mono font-bold text-slate-900">{so.so_no}</div>
                    <div className="text-slate-600">{so.customer || "-"} · {so.description || "-"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Customer (auto dari SO)</div>
            <Input className="h-10 rounded-none border-slate-300 text-sm bg-slate-50 font-semibold" value={f.customer_name} placeholder="—" readOnly data-testid="wo-new-customer" />
          </div>
        </div>

        {/* SO tidak ditemukan → info + tombol kirim permintaan ke Admin/Sales */}
        {soNotFound && (
          <SORequestPanel
            requestedSoNo={f.so_no}
            projectHint={f.project_name}
          />
        )}

        {/* SO confirmed → show summary card */}
        {soConfirmed && (
          <div className="border-2 border-emerald-500 bg-white p-2 text-xs" data-testid="wo-new-so-confirmed">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} weight="bold" className="text-emerald-600" />
              <div>
                <span className="font-mono font-bold text-emerald-800">{f.so_no}</span>
                <span className="text-slate-500 mx-2">·</span>
                <span className="font-semibold">{f.customer_name}</span>
              </div>
            </div>
          </div>
        )}

        {existingBom && soConfirmed && (
          <div className="border-2 border-sky-500 bg-sky-50 p-2 text-xs" data-testid="wo-new-existing-bom">
            <div className="font-bold text-sky-800">🔗 SO ini sudah punya BOM: <span className="font-mono">{existingBom.bom_no}</span></div>
            <div className="text-sky-700 mt-0.5">Drawing baru akan otomatis <b>di-link ke BOM yang sama</b> (biasanya untuk 1 SO dengan 2-3 drawing).</div>
          </div>
        )}
      </div>
      )}

      {/* STEP 2 onwards — hanya show kalau SO confirmed */}
      {soConfirmed && (
        <>
          {/* Drawing No preview */}
          <div className="bg-violet-50 border-2 border-violet-300 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-violet-800">Step 2 — Nomor Drawing (Auto-Generate)</div>
            <div className="font-mono text-lg font-bold text-violet-900">{nextPreview}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">1. Customer Code {f.customer_code && <span className="text-emerald-600 font-bold ml-1">✓ auto</span>}</div>
                <Input className="h-9 rounded-none border-slate-300 text-sm font-mono uppercase" value={f.customer_code} onChange={(e) => set("customer_code", e.target.value.toUpperCase())} placeholder="MKS" data-testid="wo-new-customer-code" />
                <div className="text-[10px] text-slate-500 mt-0.5 italic">Auto-fill dari customer di SO. Bisa di-override manual.</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">2. Project Name</div>
                <Input className="h-9 rounded-none border-slate-300 text-sm" value={f.project_name} onChange={(e) => set("project_name", e.target.value)} placeholder="mis. Support Plate Assembly" data-testid="wo-new-project" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">3. Project Initial *</div>
                <Input className="h-9 rounded-none border-slate-300 text-sm font-mono uppercase" value={f.project_initial} onChange={(e) => set("project_initial", e.target.value.toUpperCase())} placeholder="mis. SP, UC" data-testid="wo-new-proj-initial" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">4. Drawing Type</div>
                <select className="h-9 rounded-none border border-slate-300 text-sm w-full px-2" value={f.drawing_type} onChange={(e) => set("drawing_type", e.target.value)} data-testid="wo-new-type">
                  <option value="Assembly">Assembly (A.00)</option>
                  <option value="Part">Part (P.01)</option>
                </select>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Override Drawing No (opsional)</div>
              <Input className="h-9 rounded-none border-slate-300 text-sm font-mono" value={f.drawing_no_manual} onChange={(e) => set("drawing_no_manual", e.target.value)} placeholder="biarkan kosong untuk pakai auto" data-testid="wo-new-dwg-override" />
            </div>
            <div className="text-[10px] text-slate-500 italic pt-1 border-t border-violet-200">
              📌 <b>Class of Material</b> diisi nanti di halaman Work Order (dekat menu isi item BOM).
            </div>
          </div>
        </>
      )}

      {/* Action */}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => nav(-1)} className="inline-flex items-center gap-1 px-4 h-10 border-2 border-slate-400 text-slate-700 hover:bg-slate-50 text-sm font-bold">
          Batal
        </button>
        <Button
          className="h-10 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4"
          onClick={submit}
          disabled={saving}
          data-testid="wo-new-submit"
        >
          {saving ? "Membuat..." : "Buat Draft & Lanjut →"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------- Main Page -------------------- */

export default function EngineeringWorkOrderPage() {
  const { bomId } = useParams();
  // Dispatch: "new" mode → render create form (has its own hooks). Real bomId → render full work order.
  if (bomId === "new") return <NewOrderForm />;
  return <WorkOrderView />;
}

function WorkOrderView() {
  const { bomId } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const role = user?.role;
  const justCreated = sp.get("just_created") === "1";

  const [bom, setBom] = useState(null);
  const [linkedDrawings, setLinkedDrawings] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revDlg, setRevDlg] = useState(null); // 'note' | 'reject' | null

  const refsRef = useRef([]);

  const isEngLeader = useMemo(() => ["eng_leader", "eng_head", "engineering", "admin", "super_admin", "supervisor"].includes(role), [role]);

  // Konsisten dgn Work Order: kunci BOM bila ada drawing terkait yang sudah di-submit
  // (approval_status bukan draft). Saat siklus revisi ECN dimulai, drawing kembali draft → BOM terbuka lagi.
  const drawingSubmitted = useMemo(() => {
    return (linkedDrawings || []).some((d) => {
      const st = (d.approval_status || "draft").toLowerCase();
      return st !== "draft" && st !== "";
    });
  }, [linkedDrawings]);

  const canEditItems = useMemo(() => {
    if (!bom) return false;
    const st = bom.engineering_status || "approved";
    const hasItems = (bom.items || []).length > 0;
    const engRoles = ["engineering", "eng_leader", "eng_head", "eng_staff", "admin", "super_admin", "supervisor"];
    if (!engRoles.includes(role)) return false;
    // Approved BOM with items = frozen. But approved-empty (legacy pre-Iter35) is still editable.
    if (st === "approved" && hasItems) return false;
    // Konsisten dengan Work Order: bila ada drawing terkait yang SUDAH di-submit
    // (approval_status bukan draft), BOM dikunci agar item tidak berubah setelah submit.
    if (drawingSubmitted) return false;
    return true;
  }, [bom, role, drawingSubmitted]);

  const canSubmit = useMemo(() => {
    if (!bom) return false;
    const st = bom.engineering_status || "approved";
    // Allow submit from draft OR from legacy approved-empty state (so user can push to review)
    const hasItems = (bom.items || []).length > 0;
    if (st === "draft") return canEditItems;
    if (st === "approved" && !hasItems) return canEditItems;
    return false;
  }, [bom, canEditItems]);
  const canApprove = useMemo(() => bom?.engineering_status === "pending_review" && isEngLeader, [bom, isEngLeader]);
  const isAdminLike = useMemo(() => ["admin", "super_admin", "supervisor"].includes(role), [role]);
  const isPurchasing = useMemo(() => role === "purchasing" || isAdminLike, [role, isAdminLike]);
  const procState = useMemo(() => {
    if (!bom) return "not_ready";
    if (bom.procurement_status) return bom.procurement_status;
    return bom.engineering_status === "approved" ? "leader_checked" : "not_ready";
  }, [bom]);
  // canAcknowledge & canFinalApprove dihilangkan — TT Purchasing & Admin dilakukan manual di cetak

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bomRes, attRes] = await Promise.all([
        api.get(`/bom/${bomId}`),
        api.get(`/bom/${bomId}/attachments`),
      ]);
      const bomData = bomRes.data;
      setBom(bomData);
      // Backend returns { items: [...], attachments: {grouped}, ... } — prefer flat items
      const attData = attRes.data;
      const flat = Array.isArray(attData?.items)
        ? attData.items
        : Array.isArray(attData)
          ? attData
          : Object.values(attData?.attachments || {}).flat();
      setAttachments(flat);
      const its = (bomData.items || []).map((it) => ({
        item_specification: it.item_specification || it.item_name || "",
        qty: it.qty ?? "", uom: it.uom || "", material: it.material || "",
        weight_kg: it.weight_kg ?? "", purchase_due_date: it.purchase_due_date || "", remark: it.remark || "",
      }));
      setRows(its.length ? [...its, emptyRow()] : [emptyRow()]);
      // Fetch linked drawings by SO
      if (bomData.so_no) {
        try {
          const { data: drs } = await api.get("/drawings", { params: { so_no: bomData.so_no, limit: 30 } });
          setLinkedDrawings((drs.items || []).filter((d) => d.bom_id === bomData.id));
        } catch { /* linked drawings optional */ }
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat BOM");
      nav(-1);
    } finally {
      setLoading(false);
    }
  }, [bomId, nav]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (justCreated && bom) {
      toast.success(`Drawing + BOM ${bom.bom_no} berhasil dibuat! Silakan upload attachment dan isi BOM di bawah.`);
    }
  }, [justCreated, bom?.bom_no]);

  const attachmentsByCategory = useMemo(() => {
    const m = { drawing: [], customer_ref: [], nesting: [], nesting_price: [], costing: [], costing_prev: [], revision: [] };
    attachments.forEach((a) => {
      if (m[a.category]) m[a.category].push(a);
    });
    return m;
  }, [attachments]);

  const attachmentsById = useMemo(() => {
    const m = {};
    attachments.forEach((a) => { m[a.id] = a; });
    return m;
  }, [attachments]);

  /* -------------------- Grid Handlers -------------------- */

  const setCell = (rowIdx, key, val) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [key]: val };
      return next;
    });
  };

  const focusCell = (r, c) => {
    setTimeout(() => {
      const el = refsRef.current[r]?.[c];
      if (el && typeof el.focus === "function") {
        el.focus();
        try { el.select?.(); } catch (_) { /* non-text input */ }
      }
    }, 0);
  };

  const insertRowBelow = (rowIdx) => {
    setRows((prev) => { const next = [...prev]; next.splice(rowIdx + 1, 0, emptyRow()); return next; });
    focusCell(rowIdx + 1, 0);
  };

  const removeRow = (rowIdx) => {
    setRows((prev) => {
      if (prev.length === 1) return [emptyRow()];
      return prev.filter((_, i) => i !== rowIdx);
    });
  };

  const onCellKeyDown = (e, rowIdx, colIdx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (colIdx < COLS.length - 1) focusCell(rowIdx, colIdx + 1);
      else if (rowIdx === rows.length - 1) insertRowBelow(rowIdx);
      else focusCell(rowIdx + 1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIdx < rows.length - 1) focusCell(rowIdx + 1, colIdx);
      else insertRowBelow(rowIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIdx > 0) focusCell(rowIdx - 1, colIdx);
    }
  };

  /* -------------------- Save / Submit / Approve -------------------- */

  const buildItemsPayload = () =>
    rows.filter((r) => (r.item_specification || "").trim() || (r.material || "").trim() || Number(r.qty || 0) > 0)
        .map((r) => ({
          item_name: (r.item_specification || "").trim(),
          item_specification: (r.item_specification || "").trim(),
          qty: Number(r.qty || 0),
          uom: (r.uom || "").trim(),
          material: (r.material || "").trim(),
          weight_kg: r.weight_kg === "" || r.weight_kg == null ? null : Number(r.weight_kg),
          purchase_due_date: (r.purchase_due_date || "").trim(),
          remark: (r.remark || "").trim(),
        }));

  const saveDraft = async () => {
    const items = buildItemsPayload();
    setSaving(true);
    try {
      await api.post(`/bom/${bomId}/items-bulk`, { items });
      toast.success(`Draft tersimpan (${items.length} item)`);
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan draft");
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    const items = buildItemsPayload();
    if (items.length === 0) return toast.error("Minimal isi 1 item sebelum submit review");
    setSubmitting(true);
    try {
      await api.post(`/bom/${bomId}/items-bulk`, { items });
      await api.post(`/bom/${bomId}/submit-review`);
      toast.success("BOM telah disubmit ke Engineering Leader (Riski) untuk review");
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const approveReview = async () => {
    if (!window.confirm("Approve BOM ini? Setelah approve, BOM otomatis masuk ke halaman BOM Utama dan tidak bisa diedit lagi.")) return;
    try {
      await api.post(`/bom/${bomId}/approve-review`);
      toast.success("BOM di-approve — sudah masuk ke BOM Utama.");
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal approve");
    }
  };

  const doSign = async (stage) => {
    try {
      await api.post(`/bom/${bomId}/sign`, { stage });
      toast.success("Tanda tangan tersimpan");
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal sign");
    }
  };

  // ── Approval BOM berjenjang (Procurement chain) ──────────────────────
  const purchasingReview = async () => {
    const notes = window.prompt("Catatan review Purchasing (opsional):", "") ;
    if (notes === null) return;
    try {
      await api.post(`/bom/${bomId}/procurement/purchasing-review`, { notes: (notes || "").trim() });
      toast.success("BOM di-review Purchasing. Menunggu approval Manager (Erwin).");
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal review Purchasing"); }
  };
  const managerApprove = async () => {
    if (!window.confirm("Setujui final BOM ini sebagai Procurement Manager (Erwin)?")) return;
    try {
      await api.post(`/bom/${bomId}/procurement/manager-approve`, {});
      toast.success("BOM disetujui final oleh Manager (Erwin).");
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal approve Manager"); }
  };
  const procurementReject = async () => {
    const reason = window.prompt("Alasan menolak (wajib):", "");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("Alasan wajib diisi"); return; }
    try {
      await api.post(`/bom/${bomId}/procurement/reject`, { reason: reason.trim() });
      toast.success("BOM dikembalikan ke tahap Leader Checked.");
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menolak"); }
  };

  /* -------------------- Render -------------------- */

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Memuat Work Order...</div>;
  if (!bom) return null;

  const status = bom.engineering_status || "approved";
  const statusBadge = {
    draft: { bg: "bg-slate-200", text: "text-slate-800", label: "DRAFT" },
    pending_review: { bg: "bg-amber-200", text: "text-amber-800", label: "MENUNGGU REVIEW ENGINEERING LEADER" },
    approved: { bg: "bg-emerald-200", text: "text-emerald-800", label: "APPROVED — MASUK BOM UTAMA" },
  }[status] || { bg: "bg-slate-100", text: "text-slate-600", label: status };

  return (
    <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <button type="button" onClick={() => nav(-1)} className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px]">
            <ArrowLeft size={16} weight="bold" /> Kembali ke Halaman Sebelumnya
          </button>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            <ClipboardText className="inline-block mr-2 mb-1" size={26} weight="bold" />
            Engineering Work Order — {bom.bom_no}
          </h1>
          <div className="text-xs text-slate-500 mt-1">
            Semua alur Engineering dalam 1 halaman: <b>Info Drawing → Grid BOM</b>. Attachment (Drawing PDF, Customer, Nesting, Costing, CAD) di halaman <b>Upload &amp; TTD</b> per-drawing. Setelah submit, Engineering Leader (Riski) review; bisa revisi bolak-balik sampai approved.
          </div>
        </div>
        <div className={`px-3 py-2 border-2 ${statusBadge.bg.replace("bg-", "border-")} ${statusBadge.bg} ${statusBadge.text} text-xs font-bold tracking-wider text-right`} data-testid="wo-status-badge">
          {statusBadge.label}
        </div>
      </div>

      {/* Banner kunci — BOM dikunci karena drawing terkait sudah di-submit */}
      {drawingSubmitted && status !== "approved" && (
        <div className="flex items-center gap-2 border border-slate-300 bg-slate-100 px-4 py-2.5 text-[12px] text-slate-600" data-testid="wo-bom-drawing-locked">
          <span className="text-slate-500">🔒</span>
          <span>
            BOM terkunci — drawing terkait sudah di-<b>submit</b> untuk approval, jadi item BOM tidak bisa diubah lagi.
            Item akan bisa diedit kembali saat siklus <b>revisi (ECN)</b> dimulai.
          </span>
        </div>
      )}

      {/* SECTION 1 - Info Drawing / SO */}
      <SectionCard title="1. Info Drawing / Order" icon={FileText}>
        <InfoDrawingSection bom={bom} canEdit={canEditItems} onSaved={loadAll} linkedDrawings={linkedDrawings} />
      </SectionCard>

      {/* SECTION 2 - BOM Grid (Attachments dipindah ke halaman "Upload & TTD" per-drawing) */}
      <SectionCard title="2. Grid Data BOM (Excel-like)" icon={ClipboardText}>
        <BomClassOfMaterialInline bom={bom} onSaved={loadAll} canEdit={canEditItems} />
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-700">
            {rows.filter((r) => (r.item_specification || "").trim()).length} item(s)
          </div>
          <div className="text-[10px] text-slate-500 italic hidden md:block">
            💡 Enter = pindah kolom · Enter di kolom Remarks = baris baru · ↑/↓ = pindah baris
          </div>
        </div>
        <div className="border-2 border-slate-300 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-800 text-white sticky top-0">
              <tr>
                <th className="w-12 p-2 text-center text-[11px] font-bold border-r border-slate-700">Item No</th>
                {COLS.map((c) => (
                  <th key={c.key} className={`p-2 text-left text-[11px] font-bold border-r border-slate-700 ${c.w || ""}`}>
                    {c.label}{c.required && <span className="text-rose-300 ml-0.5">*</span>}
                  </th>
                ))}
                <th className="w-10 p-2 text-center text-[11px] font-bold">×</th>
              </tr>
            </thead>
            <tbody data-testid="wo-grid-body">
              {rows.map((row, rIdx) => {
                if (!refsRef.current[rIdx]) refsRef.current[rIdx] = [];
                return (
                  <tr key={rIdx} className="border-b hover:bg-yellow-50/40">
                    <td className="w-12 p-1 text-center text-xs text-slate-500 border-r bg-slate-50 font-mono font-bold">{rIdx + 1}</td>
                    {COLS.map((c, cIdx) => (
                      <td key={c.key} className={`p-0 border-r border-slate-200 ${c.w || ""}`}>
                        <GridCell
                          value={row[c.key]}
                          onChange={(v) => setCell(rIdx, c.key, v)}
                          col={c}
                          cellRef={(el) => { refsRef.current[rIdx][cIdx] = el; }}
                          onKeyDown={(e) => onCellKeyDown(e, rIdx, cIdx)}
                          disabled={!canEditItems}
                        />
                      </td>
                    ))}
                    <td className="w-10 p-1 text-center">
                      {canEditItems && (
                        <button onClick={() => removeRow(rIdx)} className="text-rose-500 hover:text-rose-700 disabled:opacity-30" disabled={rows.length === 1 && !row.item_specification} data-testid={`wo-row-remove-${rIdx}`} title="Hapus baris">
                          <Trash size={14} weight="bold" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canEditItems && (
            <div className="p-2 border-t bg-slate-50 flex items-center justify-between">
              <Button size="sm" variant="outline" className="h-8 rounded-none border-slate-400 text-xs" onClick={() => { setRows((prev) => [...prev, emptyRow()]); focusCell(rows.length, 0); }} data-testid="wo-add-row">
                <Plus size={14} weight="bold" className="mr-1" /> Tambah Baris
              </Button>
              <div className="text-[10px] text-slate-500 italic">* Baris kosong otomatis diabaikan saat simpan</div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* SECTION 4 - Revision History (notes from leader + BOM revisions after reopen) */}
      <RevisionPanel
        bom={bom}
        attachmentsById={attachmentsById}
        isEngLeader={isEngLeader}
        onAddNote={() => setRevDlg("note")}
        onOpenReject={() => setRevDlg("reject")}
      />
      {/* BOM Revisions History (after reopen approved) */}
      {(bom.revisions || []).length > 0 && (
        <div className="border-2 border-indigo-400 bg-indigo-50/40 p-4 space-y-2" data-testid="wo-bom-revisions">
          <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-indigo-800">
            📜 Revisi BOM (setelah Reopen Approved) — {(bom.revisions || []).length} revisi
          </div>
          <div className="space-y-2">
            {(bom.revisions || []).map((r) => (
              <div key={r.id || r.rev_no} className="bg-white border-l-4 border-indigo-500 p-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-800">
                    Rev.{r.rev_no} · <span className="font-normal text-slate-600">Reopened by {r.approved_by}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{(r.reopened_at || "").slice(0, 16).replace("T", " ")}</div>
                </div>
                <div className="text-slate-700"><b>Alasan:</b> {r.reason}</div>
                <div className="text-[10px] text-slate-500">Requested by: {r.requested_by} · items sebelum revisi: {(r.items_before || []).length}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5 (dihapus): BOM tidak ada konsep TTD digital.
          Semua tanda tangan (Prepared / Checked / Acknowledged / Approved) dilakukan
          manual di dokumen cetak sesuai format berlaku. Workflow status (Draft →
          Pending Review → Approved) tetap dipertahankan sebagai audit trail. */}

      {/* SECTION 6 — Approval BOM Berjenjang (Procurement): Leader → Purchasing → Manager (Erwin) */}
      {status === "approved" && (
        <SectionCard title="3. Approval BOM Berjenjang (Procurement)" icon={CheckCircle}>
          <ProcurementChain
            bom={bom}
            procState={procState}
            isPurchasing={isPurchasing}
            isAdminLike={isAdminLike}
            onPurchasingReview={purchasingReview}
            onManagerApprove={managerApprove}
            onReject={procurementReject}
          />
        </SectionCard>
      )}

      {/* Action Bar */}
      <div className="sticky bottom-0 bg-white border-t-2 border-slate-800 p-3 -mx-4 lg:-mx-6 z-10 flex flex-wrap items-center justify-end gap-2">
        {canEditItems && (
          <Button variant="outline" className="h-10 rounded-none border-slate-400 text-sm" onClick={saveDraft} disabled={saving} data-testid="wo-save-draft">
            <FloppyDisk size={16} weight="bold" className="mr-1" />
            {saving ? "Menyimpan..." : "Simpan Draft"}
          </Button>
        )}
        {canSubmit && (
          <div className="text-[11px] text-slate-500 italic mr-auto max-w-md" data-testid="wo-bom-submit-note">
            BOM cukup <b>disimpan</b>. Pengiriman ke Engineering dilakukan lewat tombol <b>TTD &amp; Submit</b> pada
            Work Order (tab Drawing &amp; Upload), yang memverifikasi drawing + BOM sekaligus.
          </div>
        )}
        {canApprove && (
          <>
            <Button variant="outline" className="h-10 rounded-none border-rose-500 text-rose-700 hover:bg-rose-50 text-sm" onClick={() => setRevDlg("reject")} data-testid="wo-reject">
              <XCircle size={16} weight="bold" className="mr-1" /> Kembalikan (Reject)
            </Button>
            <Button className="h-10 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-sm" onClick={approveReview} data-testid="wo-approve">
              <CheckCircle size={16} weight="bold" className="mr-1" /> Approve — Register ke BOM Utama
            </Button>
          </>
        )}
        {status === "approved" && (
          <>
            <ReopenRequestButton bom={bom} onSaved={loadAll} isEngLeader={isEngLeader} />
            <Button
              variant="outline"
              className="h-10 rounded-none border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-sm font-bold"
              onClick={async () => {
                try {
                  const res = await api.get(`/bom/${bom.id}/export/xlsx`, { responseType: "blob" });
                  const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${bom.bom_no || "BOM"} - ${(bom.project_name || "").replace(/\//g, "_")}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                  toast.success("File BOM ter-download");
                } catch (e) {
                  toast.error(e.response?.data?.detail || "Gagal export BOM");
                }
              }}
              data-testid="wo-export-xlsx"
              title="Download BOM sesuai template MKS-F-XXX untuk print"
            >
              📥 Export & Print (Excel)
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-none border-slate-700 text-slate-800 hover:bg-slate-100 text-sm font-bold"
              onClick={() => window.print()}
              data-testid="wo-print"
            >
              🖨️ Print Browser
            </Button>
            <Link to={`/bom?so=${encodeURIComponent(bom.so_no || "")}`} className="inline-flex items-center gap-1 px-4 h-10 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold" data-testid="wo-goto-main">
              Buka di BOM Utama →
            </Link>
          </>
        )}
      </div>

      {/* Revision Dialog */}
      {revDlg && (
        <RevisionNoteDialog
          bomId={bomId}
          mode={revDlg}
          onClose={() => setRevDlg(null)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}

/* -------------------- Small helpers -------------------- */

function ReopenRequestButton({ bom, onSaved, isEngLeader }) {
  const [pendingReq, setPendingReq] = useState(null);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Check if there's a pending reopen request for this BOM
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get("/bom/_/reopen-requests", { params: { status: "pending" } });
        const match = (data.items || []).find((r) => r.bom_id === bom.id);
        if (!ignore) setPendingReq(match || null);
      } catch { if (!ignore) setPendingReq(null); }
    })();
    return () => { ignore = true; };
  }, [bom.id]);

  const submitRequest = async () => {
    if (reason.trim().length < 8) {
      toast.error("Alasan minimal 8 karakter");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/bom/${bom.id}/request-reopen`, { reason: reason.trim() });
      toast.success("Permintaan edit ulang terkirim ke Engineering Leader");
      setDlgOpen(false); setReason("");
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal kirim"); }
    finally { setBusy(false); }
  };

  const approveReopen = async () => {
    if (!pendingReq) return;
    if (!window.confirm("Setujui edit ulang? BOM akan kembali ke Draft dan bisa di-edit. Revision entry akan tercatat.")) return;
    setBusy(true);
    try {
      await api.post(`/bom/_/reopen-requests/${pendingReq.id}/approve`);
      toast.success("Reopen di-approve. BOM sekarang draft dan bisa di-edit.");
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setBusy(false); }
  };

  // If eng_leader sees pending reopen request → show Approve button
  if (isEngLeader && pendingReq) {
    return (
      <Button
        className="h-10 rounded-none bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold"
        onClick={approveReopen}
        disabled={busy}
        data-testid="wo-reopen-approve"
        title={`Alasan: ${pendingReq.reason}`}
      >
        ✅ Approve Reopen ({pendingReq.requested_by_name})
      </Button>
    );
  }

  // If normal user + pending request → show "waiting" state
  if (pendingReq && !isEngLeader) {
    return (
      <div className="inline-flex items-center gap-1 px-3 h-10 border-2 border-amber-500 bg-amber-50 text-amber-800 text-xs" data-testid="wo-reopen-pending">
        ⏳ Menunggu izin Riski (edit ulang)
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-10 rounded-none border-orange-500 text-orange-700 hover:bg-orange-50 text-sm font-bold"
        onClick={() => setDlgOpen(true)}
        data-testid="wo-reopen-request"
      >
        🔓 Minta Izin Edit Ulang
      </Button>
      {dlgOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-800 w-full max-w-lg p-4 space-y-3">
            <div className="text-sm font-bold text-slate-800">Minta Izin Edit Ulang BOM</div>
            <div className="text-xs text-slate-600">
              BOM ini sudah <b>Approved</b>. Kalau ada koreksi/revisi yang harus diubah, isi <b>alasan yang jelas</b>. Engineering Leader akan review permintaan Anda.
              <br />
              Setelah di-approve → BOM kembali ke Draft + revision entry tercatat (history).
            </div>
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Alasan revisi: mis. customer minta ganti material item 3, dst. (min 8 karakter)"
              className="rounded-none border-slate-300"
              data-testid="wo-reopen-reason"
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button variant="outline" className="h-9 rounded-none" onClick={() => setDlgOpen(false)}>Batal</Button>
              <Button className="h-9 rounded-none bg-orange-600 hover:bg-orange-700 text-white" onClick={submitRequest} disabled={busy} data-testid="wo-reopen-submit">
                {busy ? "..." : "Kirim Permintaan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


function InfoDrawingSection({ bom, canEdit, onSaved, linkedDrawings }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({});

  const startEdit = () => {
    setF({
      so_no: bom.so_no || "",
      customer: bom.customer || "",
      project_name: bom.project_name || "",
      class_material: bom.class_material || "",
      bom_date: bom.bom_date || "",
      delivery_date: bom.delivery_date || "",
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/bom/${bom.id}/meta`, f);
      toast.success("Info Drawing tersimpan");
      setEditing(false);
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const cls = "h-9 rounded-none border-slate-300 text-sm";

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaCell label="BOM No (tidak bisa diubah)" value={bom.bom_no} strong />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">SO No</div>
            <Input className={cls} value={f.so_no} onChange={(e) => set("so_no", e.target.value)} data-testid="info-edit-so" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Customer</div>
            <Input className={cls} value={f.customer} onChange={(e) => set("customer", e.target.value)} data-testid="info-edit-customer" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Project</div>
            <Input className={cls} value={f.project_name} onChange={(e) => set("project_name", e.target.value)} data-testid="info-edit-project" />
          </div>
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Class of Material</div>
            <Input className={cls} value={f.class_material} onChange={(e) => set("class_material", e.target.value)} data-testid="info-edit-classmat" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Tanggal BOM</div>
            <Input type="date" className={cls} value={f.bom_date} onChange={(e) => set("bom_date", e.target.value)} data-testid="info-edit-bomdate" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Delivery Date</div>
            <Input type="date" className={cls} value={f.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} data-testid="info-edit-delivery" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="outline" className="h-9 rounded-none border-slate-400" onClick={() => setEditing(false)}>Batal</Button>
          <Button className="h-9 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white" onClick={save} disabled={saving} data-testid="info-edit-save">
            <FloppyDisk size={13} weight="bold" className="mr-1" /> {saving ? "..." : "Simpan"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Read-only. Klik &ldquo;Edit&rdquo; kalau perlu koreksi.</div>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-none border-violet-400 text-violet-700 hover:bg-violet-50" onClick={startEdit} data-testid="info-edit-btn">
            ✏️ Edit Info
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <MetaCell label="BOM No" value={bom.bom_no} strong />
        <MetaCell label="SO No" value={bom.so_no} />
        <MetaCell label="Customer" value={bom.customer || "-"} />
        <MetaCell label="Project" value={bom.project_name || "-"} />
        <MetaCell label="Class of Material" value={bom.class_material || "-"} full />
        <MetaCell label="Tanggal BOM" value={formatDateID(bom.bom_date) || "-"} />
        <MetaCell label="Delivery Date" value={formatDateID(bom.delivery_date) || "-"} />
        <MetaCell label="Prepared" value={bom.prepared_by || bom.uploaded_by_name || "-"} />
      </div>
      {linkedDrawings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">
            Nomor Drawing Terdaftar ({linkedDrawings.length})
          </div>
          <div className="text-[10px] text-slate-500 italic mb-2">
            💡 Ini nomor drawing yang sudah teregister di master (auto-generate saat register order). File PDF drawing perlu di-upload terpisah di section &quot;Attachments&quot; di bawah.
          </div>
          <div className="flex flex-wrap gap-2">
            {linkedDrawings.map((d) => (
              <div key={d.id} className="inline-flex items-center gap-1 px-2 py-1 border border-violet-300 bg-violet-50 text-[11px]">
                <FileText size={12} className="text-violet-600" />
                <span className="font-mono font-bold text-violet-800">{d.drawing_no}</span>
                {d.project_name && <span className="text-slate-600">· {d.project_name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-white border-2 border-slate-300">
      <div className="px-3 py-2 border-b bg-slate-100 flex items-center gap-2">
        {Icon && <Icon size={16} weight="bold" className="text-slate-600" />}
        <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-700">{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MetaCell({ label, value, strong, full }) {
  return (
    <div className={full ? "col-span-2 md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xs mt-0.5 ${strong ? "font-bold text-slate-900" : "text-slate-700"}`}>{value || "-"}</div>
    </div>
  );
}


/* Rantai approval procurement: Leader Checked → Purchasing Reviewed → Manager (Erwin) Approved */
function ProcurementChain({ bom, procState, isPurchasing, isAdminLike, onPurchasingReview, onManagerApprove, onReject }) {
  const sigs = bom.procurement_signatures || {};
  const leaderSig = (bom.signatures || {}).checked_by;
  const order = ["leader_checked", "purchasing_reviewed", "manager_approved"];
  const curIdx = order.indexOf(procState);
  const fmt = (s) => s?.at ? new Date(s.at).toLocaleString("id-ID") : "";

  const Step = ({ idx, title, roleLabel, sig, done }) => {
    const active = curIdx === idx && !done;
    return (
      <div className={`flex-1 min-w-[180px] border-2 p-3 ${done ? "border-emerald-400 bg-emerald-50" : active ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50"}`} data-testid={`bom-proc-step-${idx}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold text-white ${done ? "bg-emerald-600" : active ? "bg-sky-600" : "bg-slate-400"}`}>{done ? "✓" : idx + 1}</div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700">{title}</div>
        </div>
        <div className="text-[10px] text-slate-500 mb-1">{roleLabel}</div>
        {sig?.name ? (
          <div className="text-xs">
            <div className="font-bold text-slate-800">{sig.name}</div>
            <div className="text-[10px] text-slate-500">{fmt(sig)}</div>
            {sig.notes && <div className="text-[10px] text-slate-600 italic mt-0.5">“{sig.notes}”</div>}
          </div>
        ) : (
          <div className="text-[11px] italic text-slate-400">{active ? "Menunggu tanda tangan..." : "Belum"}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="bom-procurement-chain">
      <div className="flex flex-col md:flex-row gap-2">
        <Step idx={0} title="Leader Checked" roleLabel="Engineering Leader" sig={leaderSig} done={curIdx >= 0} />
        <Step idx={1} title="Purchasing Reviewed" roleLabel="Purchasing" sig={sigs.purchasing} done={curIdx >= 2 || (curIdx === 1 && !!sigs.purchasing) || procState === "manager_approved"} />
        <Step idx={2} title="Manager Approved" roleLabel="Procurement Manager (Erwin/Admin)" sig={sigs.manager} done={procState === "manager_approved"} />
      </div>

      {procState === "manager_approved" ? (
        <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-400 px-3 py-2 text-xs font-bold text-emerald-800" data-testid="bom-proc-complete">
          <CheckCircle size={16} weight="bold" /> Approval procurement lengkap — BOM sudah disetujui berjenjang (Leader → Purchasing → Manager).
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
          {procState === "leader_checked" && isPurchasing && (
            <Button className="h-9 rounded-none bg-sky-700 hover:bg-sky-800 text-white text-sm" onClick={onPurchasingReview} data-testid="bom-proc-purchasing-btn">
              <CheckCircle size={15} weight="bold" className="mr-1" /> TTD Purchasing (Review)
            </Button>
          )}
          {procState === "purchasing_reviewed" && isAdminLike && (
            <Button className="h-9 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white text-sm" onClick={onManagerApprove} data-testid="bom-proc-manager-btn">
              <CheckCircle size={15} weight="bold" className="mr-1" /> Approve Manager (Erwin)
            </Button>
          )}
          {(isPurchasing || isAdminLike) && ["leader_checked", "purchasing_reviewed"].includes(procState) && (
            <Button variant="outline" className="h-9 rounded-none border-rose-400 text-rose-700 hover:bg-rose-50 text-sm" onClick={onReject} data-testid="bom-proc-reject-btn">
              <XCircle size={15} weight="bold" className="mr-1" /> Tolak
            </Button>
          )}
          {procState === "leader_checked" && !isPurchasing && (
            <div className="text-[11px] italic text-slate-500">Menunggu Purchasing menandatangani review.</div>
          )}
          {procState === "purchasing_reviewed" && !isAdminLike && (
            <div className="text-[11px] italic text-slate-500">Menunggu Procurement Manager (Erwin) menyetujui.</div>
          )}
        </div>
      )}
    </div>
  );
}


/* Inline editable Class of Material field — muncul di atas Grid BOM */
function BomClassOfMaterialInline({ bom, onSaved, canEdit }) {
  const [val, setVal] = React.useState(bom?.class_material || "");
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => { setVal(bom?.class_material || ""); setDirty(false); }, [bom?.class_material]);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await api.patch(`/bom/${bom.id}/meta`, { class_material: val });
      toast.success("Class of Material tersimpan");
      setDirty(false);
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  return (
    <div className="mb-3 bg-amber-50 border border-amber-300 p-2.5 flex items-center gap-2" data-testid="bom-classmat-inline">
      <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-amber-800 shrink-0">
        Class of Material:
      </div>
      <Input
        list="bom-cm-opts-inline"
        className={`h-8 rounded-none border-amber-400 text-sm bg-white flex-1 ${dirty ? "border-orange-500 bg-orange-50" : ""}`}
        value={val}
        onChange={(e) => { setVal(e.target.value); setDirty(true); }}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
        placeholder="mis. RAW MATERIAL FOR QTY 1 PCS"
        disabled={!canEdit || saving}
        data-testid="bom-classmat-input"
      />
      <datalist id="bom-cm-opts-inline">
        <option value="RAW MATERIAL FOR QTY 1 PCS" />
        <option value="RAW MATERIAL FOR QTY 1 LOT" />
        <option value="RAW MATERIAL FOR QTY 1 + 1 + 8 PCS" />
        <option value="RAW MATERIAL FOR QTY 2 PCS" />
        <option value="RAW MATERIAL FOR QTY 5 PCS" />
        <option value="RAW MATERIAL FOR QTY 10 PCS" />
      </datalist>
      {dirty && (
        <Button size="sm" onClick={save} disabled={saving} className="rounded-none h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold" data-testid="bom-classmat-save">
          {saving ? "..." : "SIMPAN"}
        </Button>
      )}
      {!dirty && val && <span className="text-[10px] text-emerald-700 font-bold">✓ tersimpan</span>}
    </div>
  );
}
