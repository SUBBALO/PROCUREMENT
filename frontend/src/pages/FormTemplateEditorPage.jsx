import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Rnd } from "react-rnd";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  TextT, Textbox, Image as ImageIcon, Square, LineSegment, Table,
  FloppyDisk, Eye, TrashSimple, ArrowLeft, MagnifyingGlassPlus, MagnifyingGlassMinus, Copy,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import PdfPreviewModal from "../components/PdfPreviewModal";

// 1 mm at zoom=1 → 3.7795 px (96 DPI)
const MM_TO_PX = 3.7795;
const uid = () => Math.random().toString(36).slice(2, 10);

const ELEMENT_TYPES = [
  { type: "text", label: "Text", icon: TextT, defaults: { content: "Teks", w: 40, h: 8, font_size: 10 } },
  { type: "field", label: "Field (Data)", icon: Textbox, defaults: { binding: "", w: 50, h: 8, font_size: 10 } },
  { type: "logo", label: "Logo", icon: ImageIcon, defaults: { src: "COMPANY_LOGO", w: 30, h: 20 } },
  { type: "rect", label: "Kotak", icon: Square, defaults: { w: 40, h: 20, stroke: 1, line_width: 0.5 } },
  { type: "line", label: "Garis", icon: LineSegment, defaults: { w: 50, h: 0, x2: null, y2: null, line_width: 0.7 } },
  { type: "table", label: "Tabel", icon: Table, defaults: {
      w: 180, h: 80, row_height: 8, font_size: 9, header_bold: true, border: true, rows_source: "items",
      columns: [
        { label: "No", binding: "__index__", w: 12, align: "center" },
        { label: "Nama Barang", binding: "item_name", w: 100 },
        { label: "Qty", binding: "qty_received", w: 20, align: "right" },
        { label: "Unit", binding: "unit", w: 15, align: "center" },
      ],
    } },
];

export default function FormTemplateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tpl, setTpl] = useState(null);
  const [bindings, setBindings] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(0.75);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/form-templates/${id}`);
      setTpl(data);
      // Load bindings schema
      try {
        const { data: b } = await api.get(`/form-templates/bindings/${data.code}`);
        setBindings(b);
      } catch { setBindings(null); }
    } catch { toast.error("Gagal memuat template"); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const updateElement = (elId, patch) => {
    setTpl((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)),
    }));
    setDirty(true);
  };

  const addElement = (type) => {
    const def = ELEMENT_TYPES.find((t) => t.type === type);
    if (!def) return;
    const newEl = { id: uid(), type, x: 20, y: 20, ...def.defaults };
    setTpl((prev) => ({ ...prev, elements: [...(prev.elements || []), newEl] }));
    setSelectedId(newEl.id);
    setDirty(true);
  };

  const deleteElement = (elId) => {
    setTpl((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== elId) }));
    setSelectedId(null);
    setDirty(true);
  };

  const duplicateElement = (elId) => {
    const src = tpl.elements.find((e) => e.id === elId);
    if (!src) return;
    const copy = { ...src, id: uid(), x: (src.x || 0) + 5, y: (src.y || 0) + 5 };
    setTpl((prev) => ({ ...prev, elements: [...prev.elements, copy] }));
    setSelectedId(copy.id);
    setDirty(true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/form-templates/${id}`, {
        name: tpl.name, description: tpl.description,
        elements: tpl.elements, is_active: tpl.is_active, is_default: tpl.is_default,
        page_width_mm: tpl.page_width_mm, page_height_mm: tpl.page_height_mm,
      });
      toast.success("Template tersimpan");
      setDirty(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const onPreview = async () => {
    if (dirty) {
      const ok = confirm("Ada perubahan belum disimpan. Simpan dulu?");
      if (ok) await onSave();
    }
    setShowPreview(true);
  };

  if (!tpl) return <div className="p-8 text-center text-slate-500">Memuat template...</div>;

  const pageW = (tpl.page_width_mm || 210) * MM_TO_PX * zoom;
  const pageH = (tpl.page_height_mm || 297) * MM_TO_PX * zoom;
  const selected = tpl.elements.find((e) => e.id === selectedId);

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col bg-slate-100">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-3 flex-wrap">
        <button data-testid="back-btn" onClick={() => navigate("/admin/form-templates")} className="p-1.5 hover:bg-slate-100 rounded"><ArrowLeft size={18} weight="bold" /></button>
        <div className="flex-1 min-w-[200px]">
          <Input
            data-testid="tpl-name-input"
            className="h-8 rounded-none border-slate-300 text-sm font-bold"
            value={tpl.name}
            onChange={(e) => { setTpl({ ...tpl, name: e.target.value }); setDirty(true); }}
          />
          <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 mt-0.5 font-semibold">
            {tpl.code} · A4 {tpl.page_width_mm}×{tpl.page_height_mm}mm · {tpl.elements.length} elements
            {dirty && <span className="ml-2 text-amber-600">● unsaved</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 border border-slate-300 bg-white">
          <button data-testid="zoom-out" onClick={() => setZoom(Math.max(0.3, zoom - 0.1))} className="p-1.5 hover:bg-slate-100"><MagnifyingGlassMinus size={14} /></button>
          <span className="text-xs tabular-nums font-bold text-slate-700 px-2">{Math.round(zoom * 100)}%</span>
          <button data-testid="zoom-in" onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="p-1.5 hover:bg-slate-100"><MagnifyingGlassPlus size={14} /></button>
        </div>
        <Button data-testid="preview-btn" onClick={onPreview} className="h-8 rounded-none bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold">
          <Eye size={14} weight="bold" className="mr-1" /> Preview PDF
        </Button>
        <Button data-testid="save-btn" onClick={onSave} disabled={saving} className="h-8 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold">
          <FloppyDisk size={14} weight="bold" className="mr-1" /> {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: element toolbox */}
        <div className="w-44 border-r border-slate-200 bg-white p-3 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-2">Tambah Element</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ELEMENT_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.type}
                  data-testid={`add-${t.type}`}
                  onClick={() => addElement(t.type)}
                  className="flex flex-col items-center gap-1 p-2 border border-slate-200 hover:border-sky-500 hover:bg-sky-50 transition-colors text-slate-700"
                  title={`Tambah ${t.label}`}
                >
                  <Icon size={18} weight="bold" className="text-sky-600" />
                  <span className="text-[10px] font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>

          {bindings && (
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1.5">Field Tersedia</div>
              <div className="space-y-0.5 text-[10px]">
                {(bindings.top_fields || []).map((f) => (
                  <div key={f.key} className="px-1.5 py-1 bg-slate-50 border-l-2 border-sky-400 text-slate-700">
                    <span className="font-mono font-bold text-sky-700">{f.key}</span>
                    <div className="text-slate-500">{f.label}</div>
                  </div>
                ))}
                {bindings.row_fields && bindings.row_fields.length > 0 && (
                  <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-emerald-700 mt-2 mb-1">Tabel: {bindings.rows_source}</div>
                )}
                {(bindings.row_fields || []).map((f) => (
                  <div key={f.key} className="px-1.5 py-1 bg-emerald-50 border-l-2 border-emerald-400 text-slate-700">
                    <span className="font-mono font-bold text-emerald-700">{f.key}</span>
                    <div className="text-slate-500">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: canvas */}
        <div className="flex-1 overflow-auto p-6 flex items-start justify-center" onClick={() => setSelectedId(null)}>
          <div
            ref={canvasRef}
            data-testid="canvas"
            className="relative bg-white shadow-lg"
            style={{ width: pageW, height: pageH }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ruler grid — every 10mm */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)`,
              backgroundSize: `${10 * MM_TO_PX * zoom}px ${10 * MM_TO_PX * zoom}px`,
            }} />

            {tpl.elements.map((el) => (
              <ElementBox
                key={el.id}
                el={el}
                zoom={zoom}
                selected={selectedId === el.id}
                onSelect={() => setSelectedId(el.id)}
                onChange={(patch) => updateElement(el.id, patch)}
              />
            ))}
          </div>
        </div>

        {/* Right: properties panel */}
        <div className="w-72 border-l border-slate-200 bg-white overflow-y-auto">
          {selected ? (
            <PropertiesPanel
              el={selected}
              bindings={bindings}
              onChange={(patch) => updateElement(selected.id, patch)}
              onDelete={() => deleteElement(selected.id)}
              onDuplicate={() => duplicateElement(selected.id)}
            />
          ) : (
            <div className="p-4 text-xs text-slate-500">
              <div className="font-bold text-slate-700 mb-2">Panduan singkat</div>
              <ul className="space-y-1.5 list-disc list-inside text-[11px]">
                <li>Klik elemen untuk pilih & edit properti</li>
                <li>Drag untuk pindah, tarik pojok untuk resize</li>
                <li><b>Field</b> = ambil data otomatis (isi binding)</li>
                <li><b>Text</b> = tulisan tetap (label/heading)</li>
                <li>Grid 10mm untuk snap manual</li>
              </ul>
            </div>
          )}
        </div>
      </div>
      {showPreview && (
        <PdfPreviewModal
          metaUrl={`/form-templates/${id}/preview-page-meta`}
          pageUrlBuilder={(n) => `${process.env.REACT_APP_BACKEND_URL}/api/form-templates/${id}/preview-page-image?page=${n}&scale=2`}
          title={`Preview: ${tpl?.name || tpl?.code || "Template"}`}
          subtitle="Contoh data · Cetak via tombol Print"
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}


function ElementBox({ el, zoom, selected, onSelect, onChange }) {
  const x = (el.x || 0) * MM_TO_PX * zoom;
  const y = (el.y || 0) * MM_TO_PX * zoom;
  const w = Math.max(2, (el.w || 20) * MM_TO_PX * zoom);
  const h = Math.max(2, (el.h || 8) * MM_TO_PX * zoom);

  const style = {
    fontSize: (el.font_size || 10) * zoom * 0.85 + "px",
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textAlign: el.align || "left",
    lineHeight: 1.15,
  };

  return (
    <Rnd
      size={{ width: w, height: h }}
      position={{ x, y }}
      onDragStop={(e, d) => onChange({ x: d.x / (MM_TO_PX * zoom), y: d.y / (MM_TO_PX * zoom) })}
      onResizeStop={(e, dir, ref, delta, pos) => onChange({
        w: parseFloat(ref.style.width) / (MM_TO_PX * zoom),
        h: parseFloat(ref.style.height) / (MM_TO_PX * zoom),
        x: pos.x / (MM_TO_PX * zoom),
        y: pos.y / (MM_TO_PX * zoom),
      })}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      bounds="parent"
      className={selected ? "outline outline-2 outline-sky-500 z-10" : "outline outline-1 outline-slate-300 hover:outline-sky-400"}
      style={{ background: el.type === "rect" ? "transparent" : (el.type === "logo" ? "rgba(240,240,255,0.5)" : "transparent") }}
    >
      <div className="w-full h-full relative overflow-hidden pointer-events-none">
        {el.type === "text" && <div style={style} className="p-0.5 whitespace-pre-wrap break-words">{el.content || "(text)"}</div>}
        {el.type === "field" && <div style={style} className="p-0.5 text-sky-700 font-mono">{`{{${el.binding || "?"}}}`}</div>}
        {el.type === "logo" && <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-[10px] font-semibold">🖼 LOGO</div>}
        {el.type === "rect" && <div className="w-full h-full border border-slate-700" />}
        {el.type === "line" && <div className="w-full h-[1px] bg-slate-700 mt-auto" style={{ marginTop: h/2 - 1 }} />}
        {el.type === "table" && (
          <div className="w-full h-full text-[9px]">
            <div className="flex bg-slate-100 border-b border-slate-400 font-bold">
              {(el.columns || []).map((c, i) => <div key={i} style={{ flex: c.w || 20 }} className="border-r border-slate-400 px-0.5 truncate">{c.label}</div>)}
            </div>
            {[0,1,2].map((r) => (
              <div key={r} className="flex border-b border-slate-200 text-slate-400">
                {(el.columns || []).map((c, i) => <div key={i} style={{ flex: c.w || 20 }} className="border-r border-slate-200 px-0.5 truncate">···</div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </Rnd>
  );
}


function PropertiesPanel({ el, bindings, onChange, onDelete, onDuplicate }) {
  const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  const availableFields = [
    ...(bindings?.top_fields || []),
    ...(bindings?.row_fields || []).map((f) => ({ ...f, isRow: true })),
  ];

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-slate-500">Properti Element</div>
          <div className="text-sm font-bold text-slate-900 capitalize">{el.type}</div>
        </div>
        <div className="flex gap-1">
          <button data-testid="dup-el" onClick={onDuplicate} className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700" title="Duplikasi"><Copy size={13} weight="bold" /></button>
          <button data-testid="del-el" onClick={onDelete} className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700" title="Hapus"><TrashSimple size={13} weight="bold" /></button>
        </div>
      </div>

      {/* Position & Size */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.1em] font-bold text-slate-500 mb-1">Posisi & Ukuran (mm)</div>
        <div className="grid grid-cols-2 gap-1.5">
          <NumInput label="X" value={el.x} onChange={(v) => onChange({ x: v })} />
          <NumInput label="Y" value={el.y} onChange={(v) => onChange({ y: v })} />
          <NumInput label="Lebar" value={el.w} onChange={(v) => onChange({ w: v })} />
          <NumInput label="Tinggi" value={el.h} onChange={(v) => onChange({ h: v })} />
        </div>
      </div>

      {/* Type-specific */}
      {el.type === "text" && (
        <div>
          <Label className="text-[10px] font-semibold text-slate-600 mb-1 block">Isi Text</Label>
          <textarea data-testid="prop-content" value={el.content || ""} onChange={(e) => onChange({ content: e.target.value })}
            className="w-full h-16 border border-slate-300 p-1.5 text-xs" />
        </div>
      )}

      {el.type === "field" && (
        <div>
          <Label className="text-[10px] font-semibold text-slate-600 mb-1 block">Binding (data field)</Label>
          <select data-testid="prop-binding" value={el.binding || ""} onChange={(e) => onChange({ binding: e.target.value })}
            className="w-full h-8 border border-slate-300 text-xs bg-white">
            <option value="">— pilih field —</option>
            {availableFields.map((f) => (
              <option key={f.key} value={f.key}>{f.key} — {f.label}{f.isRow ? " (row)" : ""}</option>
            ))}
          </select>
          <div className="text-[10px] text-slate-500 mt-1">Atau ketik manual:</div>
          <Input value={el.binding || ""} onChange={(e) => onChange({ binding: e.target.value })}
            className="h-7 rounded-none border-slate-300 text-xs mt-0.5" />
        </div>
      )}

      {el.type === "logo" && (
        <div>
          <Label className="text-[10px] font-semibold text-slate-600 mb-1 block">Sumber Logo</Label>
          <select value={el.src || "COMPANY_LOGO"} onChange={(e) => onChange({ src: e.target.value })}
            className="w-full h-8 border border-slate-300 text-xs bg-white">
            <option value="COMPANY_LOGO">Logo Perusahaan</option>
            <option value="letterhead.png">Letterhead</option>
            <option value="kop_surat.webp">Kop Surat</option>
          </select>
        </div>
      )}

      {/* Text formatting for text/field */}
      {(el.type === "text" || el.type === "field") && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <NumInput label="Font Size" value={el.font_size} onChange={(v) => onChange({ font_size: v })} />
            <div>
              <Label className="text-[10px] font-semibold text-slate-600 mb-1 block">Align</Label>
              <select value={el.align || "left"} onChange={(e) => onChange({ align: e.target.value })}
                className="w-full h-7 border border-slate-300 text-xs bg-white">
                <option value="left">Kiri</option>
                <option value="center">Tengah</option>
                <option value="right">Kanan</option>
              </select>
            </div>
          </div>
          <div className="flex gap-1.5">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!el.bold} onChange={(e) => onChange({ bold: e.target.checked })} /> Bold
            </label>
            <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!el.italic} onChange={(e) => onChange({ italic: e.target.checked })} /> Italic
            </label>
          </div>
        </>
      )}

      {el.type === "rect" && (
        <div className="grid grid-cols-2 gap-1.5">
          <NumInput label="Line Width" value={el.line_width || 0.5} step={0.1} onChange={(v) => onChange({ line_width: v })} />
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={el.stroke !== 0} onChange={(e) => onChange({ stroke: e.target.checked ? 1 : 0 })} /> Border
          </label>
        </div>
      )}

      {el.type === "line" && (
        <NumInput label="Ketebalan Garis" value={el.line_width || 0.7} step={0.1} onChange={(v) => onChange({ line_width: v })} />
      )}

      {el.type === "table" && (
        <TableColumnsEditor el={el} bindings={bindings} onChange={onChange} />
      )}
    </div>
  );
}


function NumInput({ label, value, onChange, step = 1 }) {
  return (
    <div>
      <Label className="text-[10px] font-semibold text-slate-600 mb-0.5 block">{label}</Label>
      <Input type="number" step={step} value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 rounded-none border-slate-300 text-xs tabular-nums" />
    </div>
  );
}


function TableColumnsEditor({ el, bindings, onChange }) {
  const cols = el.columns || [];
  const setCols = (newCols) => onChange({ columns: newCols });
  const rowFields = bindings?.row_fields || [];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 mb-1">Kolom Tabel</div>
      <div className="space-y-1">
        {cols.map((c, i) => (
          <div key={i} className="border border-slate-200 p-1.5 space-y-1 bg-slate-50">
            <Input value={c.label} onChange={(e) => { const n = [...cols]; n[i] = { ...c, label: e.target.value }; setCols(n); }}
              placeholder="Label" className="h-6 rounded-none border-slate-300 text-xs" />
            <div className="flex gap-1">
              <select value={c.binding} onChange={(e) => { const n = [...cols]; n[i] = { ...c, binding: e.target.value }; setCols(n); }}
                className="flex-1 h-6 border border-slate-300 text-[10px] bg-white">
                <option value="__index__">__index__</option>
                {rowFields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
              </select>
              <input type="number" value={c.w || 20} onChange={(e) => { const n = [...cols]; n[i] = { ...c, w: parseFloat(e.target.value) || 20 }; setCols(n); }}
                className="w-12 h-6 border border-slate-300 text-[10px] text-center" title="Lebar kolom (mm)" />
              <button onClick={() => setCols(cols.filter((_, idx) => idx !== i))} className="w-6 h-6 bg-rose-100 text-rose-700 text-xs font-bold">×</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setCols([...cols, { label: "Kolom Baru", binding: rowFields[0]?.key || "__index__", w: 20 }])}
        className="mt-2 w-full h-7 border border-dashed border-sky-400 text-sky-700 text-xs font-semibold hover:bg-sky-50">+ Tambah Kolom</button>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <NumInput label="Row Height" value={el.row_height || 8} onChange={(v) => onChange({ row_height: v })} />
        <NumInput label="Font Size" value={el.font_size || 9} onChange={(v) => onChange({ font_size: v })} />
      </div>
      <div className="flex gap-1.5 mt-1">
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={el.border !== false} onChange={(e) => onChange({ border: e.target.checked })} /> Border
        </label>
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={el.header_bold !== false} onChange={(e) => onChange({ header_bold: e.target.checked })} /> Header Bold
        </label>
      </div>
    </div>
  );
}
