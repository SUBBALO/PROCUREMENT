import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { X, FileText, UploadSimple, MagnifyingGlass, Paperclip, Trash, Eye, Warning } from "@phosphor-icons/react";

/**
 * DrawingRequestFormDialog — form buat/edit DRF.
 *
 * 2 mode: New Order & Repeat Order.
 * New Order → cukup pilih SO baru
 * Repeat Order → pilih SO referensi lama + SO baru + reference drawing lama
 */
export default function DrawingRequestFormDialog({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [type, setType] = useState(initial?.request_type || "new_order");
  const [soList, setSoList] = useState([]);
  const [soQ, setSoQ] = useState("");
  const [refSoQ, setRefSoQ] = useState("");
  const [drawings, setDrawings] = useState([]); // list drawing MKS for reference (repeat order)
  const [drawingQ, setDrawingQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState(initial?.attached_files || []);
  const fileRef = useRef();
  const apiUrl = process.env.REACT_APP_BACKEND_URL;

  const [form, setForm] = useState({
    so_no: initial?.so_no || "",
    ref_so_no: initial?.ref_so_no || "",
    date: initial?.date || new Date().toISOString().slice(0, 10),
    project_name: initial?.project_name || "",
    customer_code: initial?.customer_code || "",
    customer_name: initial?.customer_name || "",
    qty_order: initial?.qty_order ?? 1,
    unit: initial?.unit || "pcs",
    material: initial?.material || "TBA",
    expected_due_date: initial?.expected_due_date || "",
    notes: initial?.notes || "",
    referenced_drawings: initial?.referenced_drawings || [],
  });

  // Load SO list
  useEffect(() => {
    api.get("/sales-orders").then(({ data }) => setSoList(data || [])).catch(() => {});
  }, []);

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
        customer_code: (so.customer || "").split(" ")[0].toUpperCase() || "",
      }));
      setSoQ("");
    }
  }, [type]);

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

  const doSave = async () => {
    if (!form.so_no) { toast.error("Pilih SO dulu"); return; }
    if (type === "repeat_order" && !form.ref_so_no) { toast.error("Pilih SO referensi (lama) dulu"); return; }
    if (!form.qty_order || form.qty_order < 1) { toast.error("Qty order minimal 1"); return; }

    setSaving(true);
    try {
      const payload = { ...form, request_type: type, qty_order: Number(form.qty_order) };
      let resp;
      if (isEdit) {
        resp = await api.put(`/drawing-requests/${initial.id}`, payload);
      } else {
        resp = await api.post("/drawing-requests", payload);
      }
      toast.success(isEdit ? "DRF disimpan" : `✓ DRF dibuat: ${resp.data.form_no}`);
      // Kalau new record dan ada attachment queue, upload sekarang
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  const doUpload = async (file) => {
    if (!file || !initial?.id) {
      toast.error("Simpan DRF dulu, baru bisa upload file");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/drawing-requests/${initial.id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAttachments((prev) => [...prev, data]);
      toast.success("✓ File di-attach");
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
                  {!isLocked && <button onClick={() => setForm((f) => ({ ...f, ref_so_no: "" }))} className="text-blue-700 text-xs underline">Ganti</button>}
                </div>
              ) : !isLocked && (
                <>
                  <Input value={refSoQ} onChange={(e) => setRefSoQ(e.target.value)} placeholder="Cari SO lama..." className="rounded-none border-slate-300" data-testid="drf-ref-so-search" />
                  {refSoQ && (
                    <div className="border border-slate-300 max-h-48 overflow-auto bg-white">
                      {refSoMatches.map((s) => (
                        <button key={s.id} onClick={() => pickSO(s, true)} className="w-full text-left px-3 py-1.5 hover:bg-blue-50 border-b border-slate-100 text-xs">
                          <b className="font-mono">{s.so_no}</b> · {s.customer} · {s.description}
                        </button>
                      ))}
                    </div>
                  )}
                </>
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

          {/* Data grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={isLocked} className="rounded-none border-slate-300" data-testid="drf-date" />
            </div>
            <div>
              <Label className="text-xs">Expected Due Date</Label>
              <Input type="date" value={form.expected_due_date} onChange={(e) => setForm((f) => ({ ...f, expected_due_date: e.target.value }))} disabled={isLocked} className="rounded-none border-slate-300" data-testid="drf-due-date" />
            </div>
            <div>
              <Label className="text-xs">Project Name</Label>
              <Input value={form.project_name} onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))} disabled={isLocked} className="rounded-none border-slate-300" data-testid="drf-project" />
            </div>
            <div>
              <Label className="text-xs">Customer</Label>
              <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} disabled={isLocked} className="rounded-none border-slate-300" data-testid="drf-customer" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Qty Order <span className="text-red-500">*</span></Label>
                <Input type="number" min="1" value={form.qty_order} onChange={(e) => setForm((f) => ({ ...f, qty_order: e.target.value }))} disabled={isLocked} className="rounded-none border-slate-300" data-testid="drf-qty" />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} disabled={isLocked} className="rounded-none border-slate-300" data-testid="drf-unit" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Material</Label>
              <Input value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))} disabled={isLocked} placeholder="TBA / SS304 / MS Plate..." className="rounded-none border-slate-300" data-testid="drf-material" />
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

          {/* Attachments — only shown after DRF is saved */}
          {isEdit ? (
            <div className="border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-700">Attached Documents</Label>
                {!isLocked && (
                  <Button
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-none bg-slate-700 hover:bg-slate-800 text-white h-7 text-xs"
                    data-testid="drf-upload-btn"
                  >
                    <UploadSimple size={12} weight="bold" className="mr-1" /> Attach File
                  </Button>
                )}
              </div>
              <input type="file" ref={fileRef} accept=".pdf,image/*,.xlsx,.xls,.dwg,.step,.stp,.iges,.igs" onChange={(e) => { doUpload(e.target.files?.[0]); e.target.value = ""; }} className="hidden" />
              {attachments.length === 0 ? (
                <div className="text-xs text-slate-400 italic p-4 border-2 border-dashed border-slate-200 text-center">
                  Belum ada attachment
                </div>
              ) : (
                <div className="space-y-1">
                  {attachments.map((f) => (
                    <div key={f.file_id} className="flex items-center gap-2 border border-slate-200 p-2 hover:bg-slate-50">
                      <Paperclip size={14} className="text-slate-500" />
                      <span className="flex-1 text-xs">{f.filename}</span>
                      <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</span>
                      <a href={`${apiUrl}/api/drawing-requests/${initial.id}/attachments/${f.file_id}/download`} target="_blank" rel="noreferrer" className="p-1 hover:bg-slate-200"><Eye size={12} /></a>
                      {!isLocked && (
                        <button onClick={() => doDeleteAttachment(f.file_id)} className="p-1 hover:bg-rose-100 text-rose-600"><Trash size={12} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic border border-dashed border-slate-300 p-3 bg-slate-50">
              <Warning size={14} weight="fill" className="inline mr-1 text-amber-600" />
              Attach file bisa dilakukan setelah DRF disimpan (klik Simpan dulu).
            </div>
          )}

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

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300" data-testid="drf-cancel-btn">Batal</Button>
          {!isLocked && (
            <Button
              onClick={doSave}
              disabled={saving || !form.so_no}
              className="rounded-none bg-rose-700 hover:bg-rose-800 text-white"
              data-testid="drf-save-btn"
            >
              {saving ? "Menyimpan..." : (isEdit ? "Update DRF" : "Simpan Draft")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
