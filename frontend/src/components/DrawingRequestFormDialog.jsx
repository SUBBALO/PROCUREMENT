import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { X, FileText, UploadSimple, MagnifyingGlass, Paperclip, Trash, Eye, Plus, Stack, ArrowClockwise, CheckCircle, XCircle } from "@phosphor-icons/react";
import BomAttachmentsReadOnly from "./BomAttachmentsReadOnly";

/**
 * DrawingRequestFormDialog — form buat/edit DRF.
 *
 * 2 mode: New Order & Repeat Order.
 * New Order → cukup pilih SO baru
 * Repeat Order → pilih SO referensi lama + SO baru + reference drawing lama
 */
export default function DrawingRequestFormDialog({ initial, onClose, onSaved }) {
  const { user } = useAuth();
  const role = user?.role;
  const isAdminLike = ["admin", "super_admin", "supervisor"].includes(role);
  const isSalesUser = role === "sales" || isAdminLike;
  // isEdit hanya bila membuka DRF yang SUDAH ADA (punya id). Bila `initial` hanya
  // berisi data prefill untuk DRF BARU (tanpa id, mis. dari Sales Order), ini CREATE mode.
  const isEdit = !!initial?.id;
  const [revBusy, setRevBusy] = useState(false);
  const [type, setType] = useState(initial?.request_type || "new_order");
  const [soList, setSoList] = useState([]);
  const [soQ, setSoQ] = useState("");
  const [refSoQ, setRefSoQ] = useState("");
  const [drawings, setDrawings] = useState([]); // list drawing MKS for reference (repeat order)
  const [drawingQ, setDrawingQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [refManual, setRefManual] = useState(!!initial?.ref_so_manual);
  const [refManualSo, setRefManualSo] = useState(initial?.ref_so_manual ? (initial?.ref_so_no || "") : "");
  const [attachments, setAttachments] = useState(initial?.attached_files || []);
  const [queuedFiles, setQueuedFiles] = useState([]); // File objects untuk DRF baru (belum tersimpan)
  const [submitting, setSubmitting] = useState(false);
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [refBoms, setRefBoms] = useState([]);
  const [refBomsLoading, setRefBomsLoading] = useState(false);
  const fileRef = useRef();
  const poFileRef = useRef();
  const otherFileRef = useRef();
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const [form, setForm] = useState({
    so_no: initial?.so_no || "",
    ref_so_no: initial?.ref_so_no || "",
    date: initial?.date || new Date().toISOString().slice(0, 10),
    project_name: initial?.project_name || "",
    customer_code: initial?.customer_code || "",
    customer_name: initial?.customer_name || "",
    po_customer_no: initial?.po_customer_no || "",
    qty_order: initial?.qty_order ?? 1,
    unit: initial?.unit || "pcs",
    material: initial?.material || "TBA",
    items: (initial?.items && initial.items.length > 0)
      ? initial.items.map((it) => ({ name: it.name || "", qty: it.qty ?? 1, unit: it.unit || "pcs", material: it.material || "TBA" }))
      : (initial?.qty_order ? [{ name: initial?.project_name || "Item 1", qty: initial.qty_order, unit: initial?.unit || "pcs", material: initial?.material || "TBA" }] : []),
    expected_due_date: initial?.expected_due_date || "",
    po_received_date: initial?.po_received_date || "",
    notes: initial?.notes || "",
    referenced_drawings: initial?.referenced_drawings || [],
    ref_so_manual: initial?.ref_so_manual || false,
  });

  // Load SO list
  useEffect(() => {
    api.get("/sales-orders").then(({ data }) => setSoList(data || [])).catch(() => {});
  }, []);

  // Feature H — Load Customer Code Master untuk auto-isi Kode Customer
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    api.get("/customers").then(({ data }) => {
      setCustomers(Array.isArray(data) ? data : (data.items || []));
    }).catch(() => {});
  }, []);

  const lookupCustomerCode = useCallback((name, fallback = "") => {
    const n = (name || "").trim().toLowerCase();
    if (!n) return fallback;
    const hit = customers.find((c) => (c.name || c.customer_name || "").trim().toLowerCase() === n);
    return (hit && (hit.customer_code || hit.code)) ? (hit.customer_code || hit.code) : fallback;
  }, [customers]);

  // Autocomplete customer master (dipakai di input manual repeat order)
  const customerMatches = useMemo(() => {
    const q = (form.customer_name || "").trim().toLowerCase();
    if (!q) return customers.slice(0, 15);
    return customers.filter((c) => (c.name || c.customer_name || "").toLowerCase().includes(q)).slice(0, 15);
  }, [customers, form.customer_name]);

  const pickCustomer = useCallback((c) => {
    const nm = c.name || c.customer_name || "";
    setForm((f) => ({ ...f, customer_name: nm, customer_code: c.customer_code || c.code || f.customer_code }));
    setShowCustDrop(false);
  }, []);

  // Repeat order — bila referensi SO ada di sistem, tarik BOM + attachments (drawing/BOM/nesting/costing)
  useEffect(() => {
    if (type !== "repeat_order" || !form.ref_so_no || form.ref_so_manual) {
      setRefBoms([]);
      return;
    }
    let alive = true;
    setRefBomsLoading(true);
    api.get(`/bom/history/${encodeURIComponent(form.ref_so_no)}`)
      .then(({ data }) => { if (alive) setRefBoms(data?.revisions || []); })
      .catch(() => { if (alive) setRefBoms([]); })
      .finally(() => { if (alive) setRefBomsLoading(false); });
    return () => { alive = false; };
  }, [type, form.ref_so_no, form.ref_so_manual]);

  // Load drawings for repeat order
  useEffect(() => {
    if (type === "repeat_order") {
      api.get("/drawings?limit=500").then(({ data }) => {
        const arr = Array.isArray(data) ? data : (data.items || []);
        setDrawings(arr);
      }).catch(() => {});
    }
  }, [type]);

  const soMatches = useMemo(() => {
    const q = soQ.toLowerCase();
    return q ? soList.filter((s) => `${s.so_no} ${s.customer} ${s.description}`.toLowerCase().includes(q)).slice(0, 20) : soList.slice(0, 20);
  }, [soList, soQ]);
  const refSoMatches = useMemo(() => {
    const q = refSoQ.toLowerCase();
    return q ? soList.filter((s) => `${s.so_no} ${s.customer} ${s.description}`.toLowerCase().includes(q)).slice(0, 20) : soList.slice(0, 20);
  }, [soList, refSoQ]);
  const drawingMatches = useMemo(() => {
    const q = drawingQ.toLowerCase();
    return q ? drawings.filter((d) => `${d.drawing_no} ${d.title} ${d.project_name} ${d.customer_name}`.toLowerCase().includes(q)).slice(0, 30) : drawings.slice(0, 30);
  }, [drawings, drawingQ]);

  const pickSO = useCallback((so, isRef = false) => {
    if (isRef) {
      setForm((f) => ({
        ...f,
        ref_so_no: so.so_no,
        project_name: f.project_name || so.description || "",
      }));
      setRefSoQ("");
    } else {
      setForm((f) => ({
        ...f,
        so_no: so.so_no,
        project_name: type === "new_order" ? (so.description || f.project_name) : f.project_name,
        customer_name: so.customer || "",
        customer_code: lookupCustomerCode(so.customer, (so.customer || "").split(" ")[0].toUpperCase() || ""),
      }));
      setSoQ("");
    }
  }, [type, lookupCustomerCode]);

  const toggleDrawing = (d) => {
    setForm((f) => {
      const has = f.referenced_drawings.includes(d.id);
      return {
        ...f,
        referenced_drawings: has
          ? f.referenced_drawings.filter((x) => x !== d.id)
          : [...f.referenced_drawings, d.id],
      };
    });
  };

  const _validate = () => {
    if (!form.so_no) { toast.error("Pilih SO dulu"); return false; }
    if (type === "repeat_order" && !form.ref_so_no) { toast.error("Pilih SO referensi (lama) dulu"); return false; }
    if (!form.po_received_date) { toast.error("Tanggal Terima PO wajib diisi"); return false; }
    if (!form.expected_due_date) { toast.error("Due Date Target Drawing wajib diisi"); return false; }
    const validItems = (form.items || []).filter((it) => (it.name || "").trim());
    if (validItems.length === 0) { toast.error("Tambahkan minimal 1 item (isi Nama Item)"); return false; }
    return true;
  };

  // Simpan/Update DRF, kembalikan doc tersimpan (punya id) atau null bila gagal
  const persistDrf = async () => {
    const items = (form.items || []).filter((it) => (it.name || "").trim()).map((it) => ({
      name: (it.name || "").trim(), qty: Number(it.qty) || 0, unit: it.unit || "pcs", material: it.material || "TBA",
    }));
    const qty_total = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    // project_name diturunkan otomatis dari item pertama / customer (field manual sudah dihapus)
    const derivedProject = (form.project_name || "").trim() || items[0]?.name || form.customer_name || form.so_no || "";
    const payload = { ...form, project_name: derivedProject, request_type: type, items, qty_order: qty_total || 1 };
    if (isEdit) {
      const resp = await api.put(`/drawing-requests/${initial.id}`, payload);
      return resp.data;
    }
    const resp = await api.post("/drawing-requests", payload);
    return resp.data;
  };

  // Upload semua file yang di-queue (untuk DRF baru) ke drf id
  const uploadQueued = async (drfId) => {
    if (!drfId || queuedFiles.length === 0) return;
    for (const q of queuedFiles) {
      try {
        const fd = new FormData();
        fd.append("file", q.file);
        fd.append("category", q.category || "other");
        await api.post(`/drawing-requests/${drfId}/attachments`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch (e) {
        toast.error(`Gagal upload "${q.file.name}": ${e.response?.data?.detail || "error"}`);
      }
    }
  };

  // Tombol "Simpan" → simpan sebagai draft (tetap di status draft)
  const doSaveDraft = async () => {
    if (!_validate()) return;
    setSaving(true);
    try {
      const saved = await persistDrf();
      const drfId = saved?.id || initial?.id;
      await uploadQueued(drfId);
      setQueuedFiles([]);
      toast.success(isEdit ? "✓ DRF disimpan" : `✓ DRF draft dibuat: ${saved.form_no}`);
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  // Tombol "Kirim Ke Engineering" → simpan draft + upload lampiran + submit final
  const doSubmitToEng = async () => {
    if (!_validate()) return;
    if (!window.confirm("Kirim DRF ini ke Engineering? Setelah dikirim tidak bisa diedit.")) return;
    setSubmitting(true);
    try {
      const saved = await persistDrf();
      const drfId = saved?.id || initial?.id;
      await uploadQueued(drfId);
      setQueuedFiles([]);
      await api.post(`/drawing-requests/${drfId}/submit`);
      toast.success(`✓ DRF dikirim ke Engineering${saved?.form_no ? `: ${saved.form_no}` : ""}`);
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal kirim ke Engineering");
    } finally { setSubmitting(false); }
  };

  // Pilih file dari input: DRF lama upload langsung, DRF baru masuk antrian lokal
  const handleFilePick = async (fileList, category = "other") => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (isEdit && initial?.id) {
      for (const f of files) await doUpload(f, category);
    } else {
      setQueuedFiles((prev) => [...prev, ...files.map((f) => ({ file: f, category }))]);
    }
  };

  const doUpload = async (file, category = "other") => {
    if (!file || !initial?.id) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      const { data } = await api.post(`/drawing-requests/${initial.id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAttachments((prev) => [...prev, data]);
      toast.success(`✓ File di-attach: ${data.filename}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    }
  };

  const doDeleteAttachment = async (fid) => {
    if (!initial?.id) return;
    if (!window.confirm("Hapus attachment ini?")) return;
    try {
      await api.delete(`/drawing-requests/${initial.id}/attachments/${fid}`);
      setAttachments((prev) => prev.filter((f) => f.file_id !== fid));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  // ── Revisi DR Berjenjang ──────────────────────────────────────────────
  const drfStatus = initial?.status;
  const canRequestRevision = isEdit && isSalesUser && ["submitted", "accepted"].includes(drfStatus);
  const isRevisionPending = drfStatus === "revision_requested";
  const canApproveRevision = isEdit && isAdminLike && isRevisionPending;

  const doRequestRevision = async () => {
    const reason = window.prompt("Alasan minta revisi DR (wajib diisi):", "");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("Alasan revisi wajib diisi"); return; }
    setRevBusy(true);
    try {
      await api.post(`/drawing-requests/${initial.id}/request-revision`, { reason: reason.trim() });
      toast.success("Permintaan revisi dikirim. Menunggu persetujuan Head Sales/Admin.");
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal minta revisi"); }
    finally { setRevBusy(false); }
  };

  const doApproveRevision = async () => {
    if (!window.confirm("Setujui revisi? DR akan dibuka kembali untuk diedit Sales.")) return;
    setRevBusy(true);
    try {
      await api.post(`/drawing-requests/${initial.id}/approve-revision`);
      toast.success("Revisi disetujui. DR dibuka kembali (status draft).");
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyetujui revisi"); }
    finally { setRevBusy(false); }
  };

  const doRejectRevision = async () => {
    const reason = window.prompt("Alasan menolak revisi (opsional):", "");
    if (reason === null) return;
    setRevBusy(true);
    try {
      await api.post(`/drawing-requests/${initial.id}/reject-revision`, { reason: (reason || "").trim() });
      toast.success("Permintaan revisi ditolak.");
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menolak revisi"); }
    finally { setRevBusy(false); }
  };

  const isLocked = isEdit && initial?.status !== "draft";

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" data-testid="drf-dialog">
      <div className="bg-white w-full max-w-5xl max-h-[95vh] overflow-y-auto rounded-none shadow-2xl">
        <div className="sticky top-0 bg-rose-900 text-white px-4 py-3 flex items-center justify-between z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">MKS-F-ENG-001 · Drawing Request Form</div>
            <h2 className="text-lg font-bold">
              {isEdit ? `Detail: ${initial.form_no}` : "Buat Drawing Request Baru"}
              {isLocked && (
                <span className="ml-2 px-2 py-0.5 bg-amber-500 text-white text-xs uppercase tracking-widest">
                  READ-ONLY (status: {initial?.status})
                </span>
              )}
            </h2>
          </div>
          <button onClick={onClose} className="text-white hover:text-rose-200" data-testid="drf-close">
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Type Selector */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: "new_order", label: "New Order", desc: "Order baru — pilih SO baru, semua data fresh.", color: "emerald" },
                { k: "repeat_order", label: "Repeat Order", desc: "Referensi order lama — pilih SO lama & SO baru, bisa referensi drawing/BOM lama.", color: "blue" },
              ].map(({ k, label, desc, color }) => (
                <button
                  key={k}
                  onClick={() => setType(k)}
                  className={`p-4 text-left border-2 transition ${type === k ? `border-${color}-500 bg-${color}-50` : "border-slate-200 hover:border-slate-400"}`}
                  data-testid={`drf-type-${k}`}
                >
                  <div className={`text-xs uppercase tracking-widest font-bold text-${color}-700 mb-1`}>{label}</div>
                  <div className="text-xs text-slate-600">{desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Repeat Order — Referensi SO lama */}
          {type === "repeat_order" && (
            <div className="border-l-4 border-blue-500 pl-3 space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-blue-700">Referensi SO Sebelumnya (Repeat)</Label>
              {form.ref_so_no ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 p-2">
                  <div className="font-mono font-bold text-blue-900 text-sm">{form.ref_so_no}</div>
                  {form.ref_so_manual && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold uppercase tracking-wider" data-testid="drf-ref-manual-badge">Input Manual</span>
                  )}
                  {!isLocked && <button onClick={() => { setForm((f) => ({ ...f, ref_so_no: "", ref_so_manual: false })); setRefManual(false); setRefManualSo(""); }} className="text-blue-700 text-xs underline" data-testid="drf-ref-change">Ganti</button>}
                </div>
              ) : !isLocked && (
                <>
                  {!refManual ? (
                    <>
                      <Input value={refSoQ} onChange={(e) => setRefSoQ(e.target.value)} placeholder="Cari SO lama..." className="rounded-none border-slate-300" data-testid="drf-ref-so-search" />
                      {refSoQ && (
                        <div className="border border-slate-300 max-h-48 overflow-auto bg-white">
                          {refSoMatches.map((s) => (
                            <button key={s.id} onClick={() => pickSO(s, true)} className="w-full text-left px-3 py-1.5 hover:bg-blue-50 border-b border-slate-100 text-xs">
                              <b className="font-mono">{s.so_no}</b> · {s.customer} · {s.description}
                            </button>
                          ))}
                          {refSoMatches.length === 0 && (
                            <div className="p-3 text-center text-xs text-slate-500">
                              SO lama tidak ditemukan.
                              <button onClick={() => { setRefManual(true); setRefManualSo(refSoQ); }} className="ml-1 text-blue-700 underline font-bold" data-testid="drf-ref-manual-from-empty">Input manual →</button>
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={() => { setRefManual(true); setRefManualSo(refSoQ); }} className="text-[11px] text-blue-700 underline" data-testid="drf-ref-manual-toggle">
                        SO lama tidak ada di daftar? Input manual →
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2 bg-amber-50 border border-amber-300 p-3" data-testid="drf-ref-manual-box">
                      <div className="text-[11px] text-amber-800 font-semibold">Input manual SO lama (data lama tidak ada di sistem)</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">No. SO Lama <span className="text-red-500">*</span></Label>
                          <Input value={refManualSo} onChange={(e) => setRefManualSo(e.target.value)} placeholder="mis. 004521" className="rounded-none border-slate-300 font-mono" data-testid="drf-ref-manual-so" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Nama Customer <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <Input
                              value={form.customer_name}
                              onChange={(e) => { setForm((f) => ({ ...f, customer_name: e.target.value })); setShowCustDrop(true); }}
                              onFocus={() => setShowCustDrop(true)}
                              placeholder="Cari / pilih dari Master Customer..."
                              className="rounded-none border-slate-300"
                              data-testid="drf-ref-manual-customer"
                            />
                            {showCustDrop && customerMatches.length > 0 && (
                              <div className="absolute z-20 left-0 right-0 border border-slate-300 max-h-40 overflow-auto bg-white shadow-lg" data-testid="drf-manual-customer-drop">
                                {customerMatches.map((c) => (
                                  <button
                                    type="button"
                                    key={c.id || c.customer_code || c.name}
                                    onClick={() => pickCustomer(c)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 border-b border-slate-100 text-xs"
                                    data-testid={`drf-manual-customer-opt-${c.customer_code || c.code || (c.name || "").slice(0,6)}`}
                                  >
                                    <b>{c.name || c.customer_name}</b>
                                    {(c.customer_code || c.code) && <span className="ml-1 font-mono text-slate-500">· {c.customer_code || c.code}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const v = (refManualSo || "").trim();
                            if (!v) return toast.error("No. SO lama wajib diisi");
                            if (!(form.customer_name || "").trim()) return toast.error("Nama customer wajib diisi");
                            setForm((f) => ({ ...f, ref_so_no: v, ref_so_manual: true }));
                          }}
                          className="rounded-none bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                          data-testid="drf-ref-manual-apply"
                        >
                          Pakai SO Manual
                        </Button>
                        <button onClick={() => { setRefManual(false); setRefManualSo(""); }} className="text-xs text-slate-600 underline" data-testid="drf-ref-manual-cancel">Batal / cari lagi</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Repeat Order — Attachments referensi SO lama (drawing / BOM / nesting / costing) */}
          {type === "repeat_order" && form.ref_so_no && !form.ref_so_manual && (
            <div className="border-l-4 border-emerald-500 pl-3 space-y-2" data-testid="drf-ref-attachments">
              <Label className="text-xs font-bold uppercase tracking-widest text-emerald-700 flex items-center gap-1.5">
                <Stack size={13} weight="bold" /> Referensi dari SO {form.ref_so_no} (Drawing / BOM / Nesting / Costing)
              </Label>
              {refBomsLoading ? (
                <div className="text-xs text-slate-400 italic">Memuat referensi attachment…</div>
              ) : refBoms.length === 0 ? (
                <div className="text-xs text-slate-400 italic">Tidak ada BOM/attachment tersimpan untuk SO ini.</div>
              ) : (
                <div className="space-y-3">
                  {refBoms.map((b) => (
                    <div key={b.id} className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        BOM {b.bom_no || b.id?.slice(0, 8)}{b.rev_no != null ? ` · Rev ${b.rev_no}` : ""}
                      </div>
                      <BomAttachmentsReadOnly bom={b} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SO Baru */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-widest text-rose-700">
              {type === "repeat_order" ? "SO Baru" : "Pilih SO"} <span className="text-red-500">*</span>
            </Label>
            {form.so_no ? (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-300 p-2 mt-1">
                <div className="font-mono font-bold text-rose-900">{form.so_no}</div>
                {!isLocked && <button onClick={() => setForm((f) => ({ ...f, so_no: "" }))} className="text-rose-700 text-xs underline">Ganti</button>}
              </div>
            ) : !isLocked && (
              <>
                <Input value={soQ} onChange={(e) => setSoQ(e.target.value)} placeholder="Cari SO..." className="rounded-none border-slate-300 mt-1" data-testid="drf-so-search" />
                {soQ && (
                  <div className="border border-slate-300 max-h-48 overflow-auto bg-white mt-1">
                    {soMatches.map((s) => (
                      <button key={s.id} onClick={() => pickSO(s, false)} className="w-full text-left px-3 py-1.5 hover:bg-rose-50 border-b border-slate-100 text-xs" data-testid={`drf-so-opt-${s.so_no}`}>
                        <b className="font-mono">{s.so_no}</b> · {s.customer} · {s.description}
                      </button>
                    ))}
                    {soMatches.length === 0 && <div className="p-3 text-center text-xs text-slate-400">Tidak ada SO cocok. <a href="/orders/so" target="_blank" rel="noreferrer" className="text-rose-700 underline">Buat SO baru →</a></div>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Data grid — urutan: Customer → No. PO → Tanggal Terima PO → Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nama Customer</Label>
              <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} disabled={isLocked} placeholder="Otomatis dari SO" className="rounded-none border-slate-300" data-testid="drf-customer" />
              <div className="text-[10px] text-slate-500 mt-0.5">Terisi otomatis mengikuti SO yang dipilih.</div>
            </div>
            <div>
              <Label className="text-xs">No. PO Customer</Label>
              <Input value={form.po_customer_no} onChange={(e) => setForm((f) => ({ ...f, po_customer_no: e.target.value }))} disabled={isLocked} placeholder="Nomor PO dari customer (utk stamping SO)" className="rounded-none border-slate-300" data-testid="drf-po-customer" />
              <div className="text-[10px] text-slate-500 mt-0.5">Otomatis mengisi kolom P/O No. pada stamping SO saat Sales TTD.</div>
            </div>
            <div>
              <Label className="text-xs font-bold text-sky-700">Tanggal Terima PO <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.po_received_date} onChange={(e) => setForm((f) => ({ ...f, po_received_date: e.target.value }))} disabled={isLocked} className="rounded-none border-sky-300 focus-visible:ring-sky-400" data-testid="drf-po-received-date" />
              <div className="text-[10px] text-slate-500 mt-0.5">Tanggal PO customer diterima. Wajib diisi.</div>
            </div>
            <div>
              <Label className="text-xs font-bold text-amber-700">Due Date Target Drawing <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.expected_due_date} onChange={(e) => setForm((f) => ({ ...f, expected_due_date: e.target.value }))} disabled={isLocked} className="rounded-none border-amber-300 focus-visible:ring-amber-400" data-testid="drf-due-date" />
              <div className="text-[10px] text-slate-500 mt-0.5">Deadline target Engineering. Dipakai untuk urutan prioritas antrian (paling dekat = didahulukan). Wajib diisi.</div>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Daftar Item <span className="text-red-500">*</span></Label>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, items: [...(f.items || []), { name: "", qty: 1, unit: "pcs", material: "TBA" }] }))}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase"
                    data-testid="drf-add-item"
                  >
                    <Plus size={11} weight="bold" /> Tambah Item
                  </button>
                )}
              </div>
              <div className="border border-slate-300 overflow-hidden" data-testid="drf-items-table">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="w-8 px-1 py-1.5 text-center">No</th>
                      <th className="px-2 py-1.5 text-left">Nama Item</th>
                      <th className="w-20 px-1 py-1.5 text-left">Qty</th>
                      <th className="w-20 px-1 py-1.5 text-left">Unit</th>
                      <th className="w-32 px-2 py-1.5 text-left">Material</th>
                      {!isLocked && <th className="w-8 px-1 py-1.5"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(form.items || []).length === 0 && (
                      <tr><td colSpan={isLocked ? 5 : 6} className="px-2 py-3 text-center text-slate-400 italic">Belum ada item. Klik "Tambah Item".</td></tr>
                    )}
                    {(form.items || []).map((it, idx) => {
                      const upd = (field, val) => setForm((f) => {
                        const items = [...(f.items || [])];
                        items[idx] = { ...items[idx], [field]: val };
                        return { ...f, items };
                      });
                      return (
                        <tr key={idx} className="border-t border-slate-200" data-testid={`drf-item-row-${idx}`}>
                          <td className="px-1 py-1 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="px-1 py-1">
                            <Input value={it.name} onChange={(e) => upd("name", e.target.value)} disabled={isLocked} placeholder="Nama item" className="rounded-none border-slate-200 h-8" data-testid={`drf-item-name-${idx}`} />
                          </td>
                          <td className="px-1 py-1">
                            <Input type="number" min="0" value={it.qty} onChange={(e) => upd("qty", e.target.value)} disabled={isLocked} className="rounded-none border-slate-200 h-8" data-testid={`drf-item-qty-${idx}`} />
                          </td>
                          <td className="px-1 py-1">
                            <Input value={it.unit} onChange={(e) => upd("unit", e.target.value)} disabled={isLocked} className="rounded-none border-slate-200 h-8" data-testid={`drf-item-unit-${idx}`} />
                          </td>
                          <td className="px-1 py-1">
                            <Input value={it.material} onChange={(e) => upd("material", e.target.value)} disabled={isLocked} placeholder="TBA / SS304..." className="rounded-none border-slate-200 h-8" data-testid={`drf-item-material-${idx}`} />
                          </td>
                          {!isLocked && (
                            <td className="px-1 py-1 text-center">
                              <button type="button" onClick={() => setForm((f) => ({ ...f, items: (f.items || []).filter((_, i) => i !== idx) }))} className="p-1 text-rose-600 hover:bg-rose-50" data-testid={`drf-item-remove-${idx}`}>
                                <Trash size={13} weight="bold" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes / Deskripsi Tambahan</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={isLocked} rows={2} className="rounded-none border-slate-300" data-testid="drf-notes" />
          </div>

          {/* Repeat Order — Reference Drawings */}
          {type === "repeat_order" && (
            <div className="border-l-4 border-blue-500 pl-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-2 block">
                Referensi Drawing MKS Lama (opsional)
              </Label>
              {!isLocked && (
                <div className="relative">
                  <MagnifyingGlass size={14} className="absolute left-2 top-2.5 text-slate-400" />
                  <Input
                    value={drawingQ}
                    onChange={(e) => setDrawingQ(e.target.value)}
                    placeholder="Cari drawing no / project..."
                    className="pl-8 rounded-none border-slate-300"
                    data-testid="drf-drawing-search"
                  />
                </div>
              )}
              {drawingQ && (
                <div className="border border-slate-300 max-h-48 overflow-auto bg-white mt-1">
                  {drawingMatches.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => toggleDrawing(d)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 border-b border-slate-100 text-xs flex items-center gap-2 ${form.referenced_drawings.includes(d.id) ? "bg-blue-50" : ""}`}
                    >
                      <input type="checkbox" checked={form.referenced_drawings.includes(d.id)} readOnly />
                      <span className="font-mono font-bold">{d.drawing_no}</span>
                      <span className="text-slate-600">· {d.title || d.project_name || "-"}</span>
                    </button>
                  ))}
                  {drawingMatches.length === 0 && <div className="p-3 text-xs text-slate-400 text-center">Tidak ada drawing cocok</div>}
                </div>
              )}
              {form.referenced_drawings.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {form.referenced_drawings.map((did) => {
                    const dd = drawings.find((x) => x.id === did);
                    return (
                      <span key={did} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 border border-blue-400 text-blue-900 text-xs font-mono">
                        {dd?.drawing_no || did.slice(0, 8)}
                        {!isLocked && (
                          <button onClick={() => toggleDrawing({ id: did })} className="text-rose-600 ml-1"><X size={10} /></button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Attachments — 2 kategori: PO Customer & Attachment Lainnya (masing-masing multi-file) */}
          <div className="border-t border-slate-200 pt-3 space-y-3">
            <input type="file" multiple ref={poFileRef} accept=".pdf,image/*,.xlsx,.xls,.doc,.docx" onChange={(e) => { handleFilePick(e.target.files, "po_customer"); e.target.value = ""; }} className="hidden" data-testid="drf-po-file-input" />
            <input type="file" multiple ref={otherFileRef} accept=".pdf,image/*,.xlsx,.xls,.dwg,.step,.stp,.iges,.igs,.doc,.docx" onChange={(e) => { handleFilePick(e.target.files, "other"); e.target.value = ""; }} className="hidden" data-testid="drf-other-file-input" />

            <AttachmentBox
              title="PO Customer"
              hint="File PO dari customer (bisa lebih dari 1)"
              accent="blue"
              category="po_customer"
              isLocked={isLocked}
              isEdit={isEdit}
              drfId={initial?.id}
              apiUrl={apiUrl}
              inputRef={poFileRef}
              attachments={attachments.filter((f) => (f.category || "other") === "po_customer")}
              queued={queuedFiles.map((q, i) => ({ ...q, _idx: i })).filter((q) => q.category === "po_customer")}
              onDelete={doDeleteAttachment}
              onDequeue={(gi) => setQueuedFiles((prev) => prev.filter((_, i) => i !== gi))}
            />

            <AttachmentBox
              title="Attachment Lainnya"
              hint="Dokumen pendukung lain (PDF, gambar, Excel, DWG/STEP)"
              accent="slate"
              category="other"
              isLocked={isLocked}
              isEdit={isEdit}
              drfId={initial?.id}
              apiUrl={apiUrl}
              inputRef={otherFileRef}
              attachments={attachments.filter((f) => (f.category || "other") === "other")}
              queued={queuedFiles.map((q, i) => ({ ...q, _idx: i })).filter((q) => (q.category || "other") === "other")}
              onDelete={doDeleteAttachment}
              onDequeue={(gi) => setQueuedFiles((prev) => prev.filter((_, i) => i !== gi))}
            />
          </div>

          {/* Approval Info */}
          {isEdit && initial?.requested_by && (
            <div className="grid grid-cols-2 gap-3 border-t-2 border-slate-300 pt-3">
              <div className="bg-emerald-50 border border-emerald-300 p-3">
                <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-700 mb-1">Requested By (Sales)</div>
                <div className="font-bold text-sm text-emerald-900">{initial.requested_by.name}</div>
                <div className="text-[10px] text-slate-600">{new Date(initial.requested_by.at).toLocaleString("id-ID")}</div>
              </div>
              <div className={`border p-3 ${initial.received_by ? "bg-sky-50 border-sky-300" : "bg-slate-50 border-slate-300"}`}>
                <div className="text-[10px] uppercase tracking-widest font-bold text-sky-700 mb-1">Received By (Eng Leader)</div>
                {initial.received_by ? (
                  <>
                    <div className="font-bold text-sm text-sky-900">{initial.received_by.name}</div>
                    <div className="text-[10px] text-slate-600">{new Date(initial.received_by.at).toLocaleString("id-ID")}</div>
                  </>
                ) : (
                  <div className="text-xs italic text-slate-500">Menunggu Eng Leader accept...</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 flex flex-wrap justify-end gap-2">
          {isRevisionPending && (
            <div className="w-full mb-1 flex items-start gap-2 bg-amber-50 border border-amber-300 px-3 py-2 text-xs" data-testid="drf-revision-banner">
              <ArrowClockwise size={16} weight="bold" className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-amber-800 uppercase tracking-wide">Menunggu Approval Revisi</span>
                {initial?.revision_request?.reason && <span className="text-slate-700"> — Alasan: {initial.revision_request.reason}</span>}
                {initial?.revision_request?.by && <span className="text-slate-500"> (oleh {initial.revision_request.by})</span>}
              </div>
            </div>
          )}
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300" data-testid="drf-cancel-btn">Batal</Button>
          {canRequestRevision && (
            <Button
              onClick={doRequestRevision}
              disabled={revBusy}
              variant="outline"
              className="rounded-none border-amber-400 text-amber-700 hover:bg-amber-50"
              data-testid="drf-request-revision-btn"
            >
              <ArrowClockwise size={15} weight="bold" className="mr-1" />
              {revBusy ? "Memproses..." : "Minta Revisi"}
            </Button>
          )}
          {canApproveRevision && (
            <>
              <Button
                onClick={doRejectRevision}
                disabled={revBusy}
                variant="outline"
                className="rounded-none border-rose-300 text-rose-700 hover:bg-rose-50"
                data-testid="drf-reject-revision-btn"
              >
                <XCircle size={15} weight="bold" className="mr-1" /> Tolak Revisi
              </Button>
              <Button
                onClick={doApproveRevision}
                disabled={revBusy}
                className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white"
                data-testid="drf-approve-revision-btn"
              >
                <CheckCircle size={15} weight="bold" className="mr-1" /> Setujui Revisi
              </Button>
            </>
          )}
          {!isLocked && (
            <>
              <Button
                onClick={doSaveDraft}
                disabled={saving || submitting || !form.so_no}
                variant="outline"
                className="rounded-none border-rose-300 text-rose-700 hover:bg-rose-50"
                data-testid="drf-save-btn"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
              <Button
                onClick={doSubmitToEng}
                disabled={saving || submitting || !form.so_no}
                className="rounded-none bg-rose-700 hover:bg-rose-800 text-white"
                data-testid="drf-submit-btn"
              >
                {submitting ? "Mengirim..." : "Kirim Ke Engineering"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/* Kotak attachment per-kategori (multi-file): PO Customer / Attachment Lainnya */
function AttachmentBox({ title, hint, accent, isLocked, isEdit, drfId, apiUrl, inputRef, attachments, queued, onDelete, onDequeue }) {
  const accents = {
    blue: { border: "border-blue-300", head: "text-blue-800", chip: "text-blue-600" },
    slate: { border: "border-slate-300", head: "text-slate-700", chip: "text-slate-500" },
  };
  const a = accents[accent] || accents.slate;
  const empty = attachments.length === 0 && queued.length === 0;
  return (
    <div className={`border ${a.border}`} data-testid={`drf-attbox-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div>
          <div className={`text-xs font-bold uppercase tracking-widest ${a.head}`}>{title}</div>
          <div className="text-[10px] text-slate-500">{hint}</div>
        </div>
        {!isLocked && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase"
            data-testid={`drf-attbox-add-${title.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <UploadSimple size={11} weight="bold" /> Tambah File
          </button>
        )}
      </div>
      <div className="p-2 space-y-1">
        {empty && <div className="text-[11px] text-slate-400 italic px-1 py-2">Belum ada file.</div>}
        {attachments.map((f) => (
          <div key={f.file_id} className="flex items-center gap-2 border border-slate-200 p-2 hover:bg-slate-50">
            <Paperclip size={13} className={a.chip} />
            <span className="flex-1 text-xs truncate">{f.filename}</span>
            <span className="text-[10px] text-slate-400">{((f.size || 0) / 1024).toFixed(1)} KB</span>
            {isEdit && drfId && (
              <a href={`${apiUrl}/api/drawing-requests/${drfId}/attachments/${f.file_id}/download`} target="_blank" rel="noreferrer" className="p-1 hover:bg-slate-200"><Eye size={12} /></a>
            )}
            {!isLocked && (
              <button type="button" onClick={() => onDelete(f.file_id)} className="p-1 hover:bg-rose-100 text-rose-600" data-testid={`drf-attachment-del-${f.file_id}`}><Trash size={12} /></button>
            )}
          </div>
        ))}
        {queued.map((q) => (
          <div key={`q-${q._idx}`} className="flex items-center gap-2 border border-amber-200 bg-amber-50 p-2">
            <Paperclip size={13} className="text-amber-600" />
            <span className="flex-1 text-xs truncate">{q.file.name}</span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold uppercase tracking-wider">Belum diupload</span>
            {!isLocked && (
              <button type="button" onClick={() => onDequeue(q._idx)} className="p-1 hover:bg-rose-100 text-rose-600" data-testid={`drf-queued-del-${q._idx}`}><Trash size={12} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
