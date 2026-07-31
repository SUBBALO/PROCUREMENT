import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import {
  Wrench, ArrowClockwise, Plus, Trash, FileText, Package,
  CheckCircle, PaperPlaneRight, PencilSimple, Lock, ArrowRight,
} from "@phosphor-icons/react";

/**
 * EngineeringDrfWorkPage — Work hub untuk 1 Drawing Request (DRF).
 * Struktur: 1 DRF bisa berisi >1 drawing, tapi HANYA 1 BOM bersama.
 * Hanya engineer yang ditugaskan Eng Leader yang bisa mengerjakan; lainnya view-only.
 *
 * Alur New Order:
 *   1. Engineer tentukan mau buat berapa drawing → Generate nomor drawing.
 *   2. Tiap drawing: buka Work Order untuk upload (multi) + TTD + submit.
 *   3. Semua drawing otomatis share 1 BOM → edit di halaman BOM.
 */
export default function EngineeringDrfWorkPage() {
  const { drfId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [drf, setDrf] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: drfData } = await api.get(`/drawing-requests/${drfId}`);
      setDrf(drfData);
      const { data: dwData } = await api.get(`/drawings?from_drf_id=${drfId}`);
      const items = dwData.items || dwData || [];
      // sort by drawing_no ascending
      items.sort((a, b) => (a.drawing_no || "").localeCompare(b.drawing_no || ""));
      setDrawings(items);
    } catch (e) {
      toast.error(e.response?.data?.detail || "DRF tidak ditemukan");
      navigate("/engineering");
    } finally {
      setLoading(false);
    }
  }, [drfId, navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading || !drf) {
    return (
      <div className="p-12 text-center text-slate-400">
        <ArrowClockwise size={22} className="mx-auto animate-spin mb-2" />
        Memuat Drawing Request...
      </div>
    );
  }

  const isTrueAdmin = ["admin", "super_admin", "supervisor"].includes(user?.role);
  const isAssignee = drf.assigned_engineer_id && drf.assigned_engineer_id === user?.id;
  // Hanya engineer yang DITUGASKAN yang bisa generate/upload. Eng Leader (Riski) yang bukan
  // pengerja = view-only (Riski hanya menunjuk siapa yang kerja). Admin = override.
  const canEdit = isAssignee || isTrueAdmin;
  const isRepeat = drf.request_type === "repeat_order";
  const sharedBomId = drawings[0]?.bom_id || drf.shared_bom_id || "";
  const sharedBomNo = drawings[0]?.bom_no || "";

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-teal-700 mb-1">
            <Wrench size={14} weight="fill" /> Engineering · Work Group
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            {drf.form_no}
          </h1>
          <div className="text-sm text-slate-600 mt-1">
            <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase mr-2 ${isRepeat ? "bg-blue-100 text-blue-800 border border-blue-400" : "bg-emerald-100 text-emerald-800 border border-emerald-400"}`}>
              {isRepeat ? "Repeat Order" : "New Order"}
            </span>
            SO: <b className="font-mono">{drf.so_no}</b> · {drf.project_name || "-"} · Customer: <b>{drf.customer_name || "-"}</b>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Ditugaskan ke</div>
          <div className="text-sm font-semibold text-slate-800">{drf.assigned_engineer_name || <span className="italic text-slate-400">Belum di-assign</span>}</div>
          <div className="text-[10px] text-slate-500">oleh {drf.assigned_by || "-"}</div>
        </div>
      </div>

      {/* Info order */}
      <Card className="rounded-none border-slate-200 p-4 bg-slate-50">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          <Info k="Qty Order" v={`${drf.qty_order} ${drf.unit}`} />
          <Info k="Material" v={drf.material} />
          <Info k="Due Date" v={drf.expected_due_date} />
          <Info k="Request By (Sales)" v={drf.requested_by?.name} />
          <Info k="BOM Bersama" v={sharedBomNo || <span className="italic text-slate-400">Otomatis saat generate</span>} mono />
        </div>
      </Card>

      {!canEdit && (
        <div className="border-2 border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 flex items-center gap-2">
          <Lock size={16} /> Mode <b>view-only</b>. Hanya engineer yang ditugaskan ({drf.assigned_engineer_name || "-"}) yang bisa mengerjakan DRF ini.
        </div>
      )}

      {isRepeat && (
        <div className="border-2 border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
          <b>Repeat Order:</b> tarik-otomatis drawing lama + nesting + costing akan tersedia di <b>Fase 2</b>. Untuk sekarang Anda tetap bisa generate drawing baru & isi BOM.
        </div>
      )}

      {/* Generate drawings */}
      {canEdit && (
        <GenerateDrawingsPanel drf={drf} existingCount={drawings.length} onDone={load} />
      )}

      {/* Shared BOM */}
      {sharedBomId && (
        <div className="border-2 border-amber-500">
          <div className="px-3 py-2 bg-amber-600 text-white flex items-center gap-2">
            <Package size={16} weight="fill" />
            <div className="text-[11px] uppercase tracking-widest font-bold flex-1">
              BOM Bersama — <span className="font-mono normal-case">{sharedBomNo}</span> (1 BOM untuk semua {drawings.length} drawing)
            </div>
            <button
              onClick={() => navigate(`/engineering/bom-entry/${sharedBomId}`)}
              className="text-[10px] font-bold uppercase tracking-widest bg-amber-800 hover:bg-amber-900 px-2 py-1"
              data-testid="drf-open-bom"
            >
              Isi / Edit BOM →
            </button>
          </div>
        </div>
      )}

      {/* Drawings list */}
      <div className="border-2 border-teal-500">
        <div className="px-3 py-2 bg-teal-600 text-white flex items-center gap-2">
          <FileText size={16} weight="fill" />
          <div className="text-[11px] uppercase tracking-widest font-bold flex-1">
            Daftar Drawing ({drawings.length})
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {drawings.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              Belum ada drawing. {canEdit ? "Generate nomor drawing di atas untuk mulai." : ""}
            </div>
          )}
          {drawings.map((d) => (
            <div key={d.id} className="p-3 flex flex-wrap items-center gap-3 hover:bg-teal-50/40" data-testid={`drf-drawing-${d.drawing_no}`}>
              <div className="flex-1 min-w-[220px]">
                <div className="font-mono font-bold text-slate-900 text-sm">{d.drawing_no}</div>
                <div className="text-xs text-slate-500">{d.title || d.project_name || "-"} · {d.drawing_type}</div>
                {d.customer_drawing_no && (
                  <div className="text-[10px] text-slate-500">Cust DWG No: <span className="font-mono text-slate-700">{d.customer_drawing_no}</span></div>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Chip ok={!!d.file_id} label={d.file_id ? "MKS ✓" : "MKS ✗"} />
                <Chip ok={!!d.customer_ref_file_id} label="Cust Dwg" neutral={!d.customer_ref_file_id} />
                <Chip ok={(d.extras || []).length > 0} label={`Nesting/Extra (${(d.extras || []).length})`} neutral={(d.extras || []).length === 0} />
              </div>
              <StatusBadge status={d.approval_status} />
              <button
                onClick={() => navigate(`/engineering/work-order/${d.id}`)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold uppercase tracking-widest"
                data-testid={`drf-open-wo-${d.drawing_no}`}
              >
                <PencilSimple size={13} weight="bold" /> Upload & TTD <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {drawings.length > 0 && canEdit && (
        <div className="border-2 border-sky-500 bg-sky-50 p-4 text-sm text-slate-700">
          <b>Langkah berikutnya:</b> untuk tiap drawing klik <b>Upload & TTD</b> → upload PDF MKS (bisa lebih dari 1 dokumen: customer dwg & nesting), isi BOM bersama, lalu <b>TTD & Submit ke Eng Leader</b>. Drawing lama (repeat order tanpa dwg baru) tidak perlu TTD.
        </div>
      )}
    </div>
  );
}

/* ---------- Generate Drawings Panel ---------- */
function GenerateDrawingsPanel({ drf, existingCount, onDone }) {
  const [open, setOpen] = useState(existingCount === 0);
  const [count, setCount] = useState(1);
  const [rows, setRows] = useState([{ project_initial: "", drawing_type: "Assembly", title: "", customer_drawing_no: "" }]);
  const [classMaterial, setClassMaterial] = useState(drf.material ? `RAW MATERIAL FOR ${drf.qty_order} ${drf.unit}` : "");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);   // preview nomor berikutnya (row 0)
  const [recent, setRecent] = useState([]);         // daftar nomor DWG yang pernah dibuat (customer sama)
  const custCode = (drf.customer_code || "MKS").toUpperCase();

  const applyCount = (n) => {
    const c = Math.max(1, Math.min(20, parseInt(n) || 1));
    setCount(c);
    setRows((prev) => {
      const next = [...prev];
      while (next.length < c) next.push({ project_initial: prev[0]?.project_initial || "", drawing_type: "Part", title: "", customer_drawing_no: "" });
      return next.slice(0, c);
    });
  };

  const updateRow = (i, key, val) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  // Live preview nomor + daftar nomor lama (verifikasi urutan / tidak loncat)
  const row0Initial = rows[0]?.project_initial || "";
  const row0Type = rows[0]?.drawing_type || "Assembly";
  useEffect(() => {
    const initial = row0Initial.trim();
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/drawings/next-number", {
          params: { customer_code: custCode, project_initial: initial || "X", drawing_type: row0Type },
        });
        setPreview(data);
      } catch { setPreview(null); }
      try {
        const { data } = await api.get(`/drawings?q=${encodeURIComponent(custCode)}&limit=40`);
        const items = (data.items || data || []).filter((d) => (d.drawing_no || "").includes(`_${custCode}.`));
        items.sort((a, b) => (b.drawing_no || "").localeCompare(a.drawing_no || ""));
        setRecent(items.slice(0, 8));
      } catch { setRecent([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [row0Initial, row0Type, custCode]);

  const submit = async () => {
    for (const r of rows) {
      if (!r.project_initial.trim()) return toast.error("Project Initial wajib diisi tiap drawing (mis. 'BR' untuk Bracket)");
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/drawing-requests/${drf.id}/generate-drawings`, {
        class_material: classMaterial,
        drawings: rows.map((r) => ({
          project_initial: r.project_initial.trim(),
          drawing_type: r.drawing_type,
          title: r.title.trim(),
          customer_drawing_no: (r.customer_drawing_no || "").trim(),
        })),
      });
      toast.success(`✓ ${data.drawings.length} nomor drawing dibuat, berbagi 1 BOM.`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal generate drawing");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="rounded-none bg-teal-700 hover:bg-teal-800 text-white" data-testid="drf-add-drawings-btn">
          <Plus size={15} weight="bold" className="mr-1" /> Tambah Drawing
        </Button>
      </div>
    );
  }

  return (
    <div className="border-2 border-emerald-500" data-testid="drf-generate-panel">
      <div className="px-3 py-2 bg-emerald-600 text-white flex items-center gap-2">
        <Plus size={16} weight="bold" />
        <div className="text-[11px] uppercase tracking-widest font-bold flex-1">Generate Nomor Drawing (bisa lebih dari 1)</div>
      </div>
      <div className="p-4 bg-emerald-50 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-800 mb-1">Mau buat berapa drawing?</div>
            <Input
              type="number" min={1} max={20} value={count}
              onChange={(e) => applyCount(e.target.value)}
              className="rounded-none border-emerald-300 w-28 h-10 text-lg font-bold"
              data-testid="drf-gen-count"
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-800 mb-1">Class / Paket Material (opsional)</div>
            <Input value={classMaterial} onChange={(e) => setClassMaterial(e.target.value)} className="rounded-none border-emerald-300 h-10" placeholder="mis. RAW MATERIAL FOR QTY 5 PCS" data-testid="drf-gen-class" />
          </div>
        </div>

        {/* Cek urutan nomor: preview + daftar nomor lama */}
        <div className="bg-white border border-emerald-200 p-3 text-xs" data-testid="drf-number-check">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Nomor berikutnya (perkiraan):</span>{" "}
              <span className="font-mono font-bold text-emerald-800">{preview?.preview || "isi Initial dulu"}</span>
              {preview && (
                <span className="ml-2 text-[10px] text-slate-500">
                  {preview.is_new_project ? "(project/initial baru)" : `(lanjut · sudah ada ${preview.existing_project_drawings} dwg tipe ini)`}
                </span>
              )}
            </div>
          </div>
          {recent.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Nomor DWG terakhir untuk {custCode} (cek urutan / loncat):</div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((d) => (
                  <span key={d.id} className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5" title={d.title || ""}>{d.drawing_no}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest font-bold text-emerald-800 px-2">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-2">Initial*</div>
            <div className="col-span-2">Tipe</div>
            <div className="col-span-3">Judul</div>
            <div className="col-span-3">No. DWG Customer (opsional)</div>
            <div className="col-span-1"></div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white border border-emerald-200 p-2" data-testid={`drf-gen-row-${i}`}>
              <div className="col-span-1 text-center text-xs font-bold text-slate-500">#{i + 1}</div>
              <div className="col-span-2">
                <Input value={r.project_initial} onChange={(e) => updateRow(i, "project_initial", e.target.value.toUpperCase())} className="rounded-none h-9" placeholder="BR" data-testid={`drf-gen-initial-${i}`} />
              </div>
              <div className="col-span-2">
                <select value={r.drawing_type} onChange={(e) => updateRow(i, "drawing_type", e.target.value)} className="w-full h-9 border border-slate-300 rounded-none text-sm px-2" data-testid={`drf-gen-type-${i}`}>
                  <option>Assembly</option>
                  <option>Part</option>
                </select>
              </div>
              <div className="col-span-3">
                <Input value={r.title} onChange={(e) => updateRow(i, "title", e.target.value)} className="rounded-none h-9" placeholder="Judul drawing (opsional)" data-testid={`drf-gen-title-${i}`} />
              </div>
              <div className="col-span-3">
                <Input value={r.customer_drawing_no} onChange={(e) => updateRow(i, "customer_drawing_no", e.target.value)} className="rounded-none h-9 font-mono" placeholder="No. DWG customer" data-testid={`drf-gen-custno-${i}`} />
              </div>
              <div className="col-span-1 text-center">
                {rows.length > 1 && (
                  <button onClick={() => { setRows(rows.filter((_, x) => x !== i)); setCount(rows.length - 1); }} className="text-rose-600 hover:text-rose-800" title="Hapus baris">
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => { setRows([...rows, { project_initial: rows[0]?.project_initial || "", drawing_type: "Part", title: "", customer_drawing_no: "" }]); setCount(rows.length + 1); }} className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
            <Plus size={13} /> Tambah baris
          </button>
        </div>

        <div className="flex justify-end gap-2">
          {existingCount > 0 && <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>}
          <Button onClick={submit} disabled={busy} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40" data-testid="drf-gen-submit">
            {busy ? "Membuat..." : `Generate ${rows.length} Nomor Drawing`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Info({ k, v, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{k}</div>
      <div className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{v || <span className="italic text-slate-400">-</span>}</div>
    </div>
  );
}

function Chip({ ok, label, neutral }) {
  const cls = neutral
    ? "bg-slate-100 text-slate-500 border-slate-300"
    : ok
    ? "bg-emerald-100 text-emerald-800 border-emerald-400"
    : "bg-rose-100 text-rose-800 border-rose-400";
  return <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${cls}`}>{label}</span>;
}

function StatusBadge({ status }) {
  const map = {
    draft: { label: "DRAFT", cls: "bg-slate-200 text-slate-700 border-slate-400" },
    pending_eng_head: { label: "MENUNGGU ENG LEADER", cls: "bg-amber-100 text-amber-800 border-amber-500" },
    pending_qc: { label: "MENUNGGU QC", cls: "bg-orange-100 text-orange-800 border-orange-500" },
    pending_sales: { label: "MENUNGGU SALES", cls: "bg-yellow-100 text-yellow-800 border-yellow-500" },
    approved: { label: "APPROVED", cls: "bg-emerald-100 text-emerald-800 border-emerald-500" },
    controlled: { label: "CONTROLLED", cls: "bg-indigo-100 text-indigo-800 border-indigo-500" },
    released: { label: "RELEASED", cls: "bg-teal-100 text-teal-800 border-teal-500" },
  };
  const m = map[status] || map.draft;
  return <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${m.cls}`}>{m.label}</span>;
}
