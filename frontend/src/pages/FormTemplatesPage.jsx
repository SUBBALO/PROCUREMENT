import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { FileText, Plus, PencilSimple, TrashSimple, Copy, Eye, FileXls, UploadSimple, Download, CheckCircle, MagicWand } from "@phosphor-icons/react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfPreviewModal from "../components/PdfPreviewModal";

const ADMIN_ROLES = ["admin", "super_admin", "supervisor"];

const CODES = [
  { code: "MCL", label: "Material Control Label (Store)" },
  { code: "SURAT_JALAN_STORE", label: "Surat Jalan Keluar (Store)" },
];

export default function FormTemplatesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newForm, setNewForm] = useState({ code: "MCL", name: "" });
  const [showNew, setShowNew] = useState(false);
  const [previewTpl, setPreviewTpl] = useState(null);  // {id, code, name}
  const pag = usePagination(templates, 20);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/form-templates");
      setTemplates(data);
    } catch { toast.error("Gagal memuat template"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async () => {
    if (!newForm.code || !newForm.name) { toast.error("Kode & nama wajib diisi"); return; }
    try {
      const { data } = await api.post("/form-templates", { ...newForm, elements: [], is_active: true });
      toast.success("Template dibuat");
      setShowNew(false);
      navigate(`/admin/form-templates/${data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal membuat"); }
  };

  const onDuplicate = async (t) => {
    try {
      const { data } = await api.post("/form-templates", {
        code: t.code, name: `${t.name} (Copy)`,
        elements: t.elements, page_width_mm: t.page_width_mm, page_height_mm: t.page_height_mm,
        is_active: true, is_default: false,
      });
      toast.success("Template diduplikasi");
      navigate(`/admin/form-templates/${data.id}`);
    } catch { toast.error("Gagal duplikasi"); }
  };

  const onDelete = async (t) => {
    if (!confirm(`Hapus template "${t.name}"?`)) return;
    try {
      await api.delete(`/form-templates/${t.id}`);
      toast.success("Terhapus");
      load();
    } catch { toast.error("Gagal hapus"); }
  };

  const onPreview = (t) => setPreviewTpl(t);

  if (!isAdmin) {
    return <div className="p-8 text-center text-slate-500">Hanya admin yang dapat mengelola template form.</div>;
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            <FileText size={26} weight="duotone" className="inline-block mr-2 text-sky-600" />
            Template Form Designer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Desain visual template cetak (A4) dengan drag & drop. Pakai untuk MCL, Surat Jalan, dll.
          </p>
        </div>
        <Button data-testid="new-template-btn" onClick={() => setShowNew(true)} className="rounded-none h-9 bg-sky-700 hover:bg-sky-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
          <Plus size={14} weight="bold" className="mr-1.5" /> Buat Template Baru
        </Button>
      </div>

      {showNew && (
        <Card className="rounded-none border-sky-300 bg-sky-50/40 p-4 shadow-none">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Buat Template Baru</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Jenis Form *</Label>
              <select
                data-testid="new-template-code"
                value={newForm.code}
                onChange={(e) => setNewForm({ ...newForm, code: e.target.value })}
                className="w-full h-9 border border-slate-300 px-2 text-sm bg-white"
              >
                {CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Template *</Label>
              <Input data-testid="new-template-name" className="h-9 rounded-none border-slate-300 text-sm" value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="mis. MCL Format 2026" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button data-testid="save-new-template" onClick={onCreate} className="h-9 rounded-none bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold">Buat & Edit</Button>
            <Button onClick={() => setShowNew(false)} variant="ghost" className="h-9 rounded-none text-xs">Batal</Button>
          </div>
        </Card>
      )}

      {/* -------- EXCEL TEMPLATE UPLOAD (recommended path) -------- */}
      <ExcelTemplateSection />

      {/* -------- CAR WORD TEMPLATE (MKS-F-QAD-004) -------- */}
      <CarWordTemplateSection />

      <div className="pt-4">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-2">Template Canvas (Alternatif)</div>
      </div>

      <Card className="rounded-none border-slate-200 bg-white overflow-hidden shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
              <th className="text-left p-3">Kode</th>
              <th className="text-left p-3">Nama Template</th>
              <th className="text-left p-3">Elements</th>
              <th className="text-left p-3">Ukuran (mm)</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Diupdate</th>
              <th className="text-right p-3">Aksi</th>
            </tr>
          </thead>
          <tbody data-testid="templates-table">
            {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Memuat...</td></tr>}
            {!loading && templates.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">Belum ada template. Klik "Buat Template Baru" untuk mulai.</td></tr>
            )}
            {!loading && templates.length > 0 && pag.pagedData.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs font-bold text-sky-700">{t.code}</td>
                <td className="p-3 text-slate-900 font-medium">
                  {t.name}
                  {t.is_default && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-[9px] uppercase tracking-[0.1em] font-bold text-amber-700">Default</span>}
                </td>
                <td className="p-3 text-slate-600 tabular-nums">{(t.elements || []).length}</td>
                <td className="p-3 text-slate-500 text-xs tabular-nums">{t.page_width_mm} × {t.page_height_mm}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold border ${t.is_active ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-slate-50 border-slate-300 text-slate-500"}`}>
                    {t.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="p-3 text-slate-500 text-xs">{(t.updated_at || "").slice(0, 16).replace("T", " ")}</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" data-testid={`preview-${t.id}`} onClick={() => onPreview(t)} title="Preview PDF" className="h-8 w-8 rounded-none p-0 bg-slate-100 hover:bg-slate-200 text-slate-700"><Eye size={14} weight="bold" /></Button>
                    <Button size="sm" data-testid={`edit-${t.id}`} onClick={() => navigate(`/admin/form-templates/${t.id}`)} title="Edit" className="h-8 w-8 rounded-none p-0 bg-sky-100 hover:bg-sky-200 text-sky-700"><PencilSimple size={14} weight="bold" /></Button>
                    <Button size="sm" data-testid={`dup-${t.id}`} onClick={() => onDuplicate(t)} title="Duplikasi" className="h-8 w-8 rounded-none p-0 bg-amber-100 hover:bg-amber-200 text-amber-700"><Copy size={14} weight="bold" /></Button>
                    <Button size="sm" data-testid={`del-${t.id}`} onClick={() => onDelete(t)} title="Hapus" className="h-8 w-8 rounded-none p-0 bg-rose-100 hover:bg-rose-200 text-rose-700"><TrashSimple size={14} weight="bold" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar {...pag} label="template" testIdPrefix="templates-pag" />
      </Card>
      {previewTpl && (
        <PdfPreviewModal
          metaUrl={`/form-templates/${previewTpl.id}/preview-page-meta`}
          pageUrlBuilder={(n) => `${process.env.REACT_APP_BACKEND_URL}/api/form-templates/${previewTpl.id}/preview-page-image?page=${n}&scale=2`}
          title={`Preview: ${previewTpl.name || previewTpl.code}`}
          subtitle="Contoh data · Cetak via tombol Print"
          onClose={() => setPreviewTpl(null)}
        />
      )}
    </div>
  );
}


// ---------- Excel Template Upload Section ----------
function ExcelTemplateSection() {
  const [codes, setCodes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState("MCL");
  const [uploading, setUploading] = useState(false);
  const [previewExcel, setPreviewExcel] = useState(null);  // {id, code, filename}
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, l] = await Promise.all([
        api.get("/excel-templates/codes"),
        api.get("/excel-templates"),
      ]);
      setCodes(c.data);
      setItems(l.data);
    } catch { toast.error("Gagal memuat Excel template"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onDownloadStarter = async () => {
    try {
      const res = await api.get(`/excel-templates/starter/${selectedCode}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `STARTER_${selectedCode}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Gagal download starter"); }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("code", selectedCode);
      fd.append("filename", file.name);
      fd.append("file", file);
      await api.post("/excel-templates/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Template ${selectedCode} berhasil di-upload & LANGSUNG AKTIF menggantikan versi lama`);
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal upload"); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onPreview = (item) => setPreviewExcel(item);

  const onPreviewRaw = async (item) => {
    try {
      const res = await api.post(`/excel-templates/${item.id}/preview-raw`, {}, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch { toast.error("Gagal preview raw"); }
  };

  const onPreviewXlsx = async (item) => {
    try {
      const res = await api.post(`/excel-templates/${item.id}/preview-xlsx`, {}, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `preview_DATA_${item.code}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel contoh terunduh — buka di Excel Anda untuk lihat hasil akhir");
    } catch { toast.error("Gagal generate xlsx"); }
  };

  const onDownload = async (item) => {
    try {
      const res = await api.get(`/excel-templates/${item.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = item.filename || `${item.code}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Gagal download"); }
  };

  const onActivate = async (item) => {
    try {
      await api.post(`/excel-templates/${item.id}/activate`);
      toast.success("Diaktifkan");
      load();
    } catch { toast.error("Gagal aktifkan"); }
  };

  const onAutoPlaceholder = async (item) => {
    if (!confirm(
      `Auto-Isi Placeholder akan scan template "${item.filename}" dan sisipkan placeholder {{..}} otomatis berdasarkan label yang ada (mis. "DO No.", "PO No.", "Supplier", header tabel). ` +
      `Template lama tetap tersimpan sebagai backup. Lanjutkan?`
    )) return;
    try {
      const { data } = await api.post(`/excel-templates/${item.id}/auto-placeholder`);
      toast.success(`Berhasil sisipkan ${data.injected} placeholder otomatis`);
      if (data.details && data.details.length > 0) {
        console.log("Auto-placeholder details:", data.details);
        // Show detailed summary
        const summary = data.details.slice(0, 8).join("\n");
        alert(`✅ ${data.injected} placeholder disisipkan:\n\n${summary}${data.injected > 8 ? "\n... (lihat console)" : ""}\n\nSekarang klik Preview PDF untuk lihat hasilnya.`);
      }
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal auto-placeholder");
    }
  };

  const onDelete = async (item) => {
    if (!confirm(`Hapus template Excel "${item.filename}"?`)) return;
    try {
      await api.delete(`/excel-templates/${item.id}`);
      toast.success("Terhapus");
      load();
    } catch { toast.error("Gagal hapus"); }
  };

  const selectedMeta = codes.find((c) => c.code === selectedCode);

  return (
    <Card className="rounded-none border-emerald-300 bg-emerald-50/30 p-5 shadow-none" data-testid="excel-template-section">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileXls size={20} weight="duotone" className="text-emerald-700" /> Template Excel (Mode Utama)
          </h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Desain layout form langsung di Excel. Pakai placeholder <span className="font-mono bg-white px-1 border border-slate-300">{"{{vendor_name}}"}</span>, <span className="font-mono bg-white px-1 border border-slate-300">{"{{items.item_name}}"}</span> dst.<br />
            Sistem substitusi otomatis lalu convert ke PDF via LibreOffice. Preview → dari PDF viewer bisa langsung Print atau Download.<br />
            <b className="text-emerald-800">Setiap Upload akan langsung AKTIF menggantikan template lama untuk kode form yang sama.</b>
          </p>
        </div>
      </div>

      {/* Step-by-step guide */}
      <div className="mb-3 p-3 bg-white border border-emerald-200">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-emerald-700 mb-2">Cara Edit Template</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-emerald-700 text-white font-bold flex items-center justify-center">1</span>
            <div>
              <div className="font-semibold text-slate-800">Unduh xlsx</div>
              <div className="text-[11px] text-slate-500">Klik ikon <Download size={11} weight="bold" className="inline text-sky-600" /> pada template Aktif untuk unduh file .xlsx</div>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-emerald-700 text-white font-bold flex items-center justify-center">2</span>
            <div>
              <div className="font-semibold text-slate-800">Edit di Excel</div>
              <div className="text-[11px] text-slate-500">Buka di Excel/LibreOffice. Geser cell, atur border, warna, font. <b>Jangan hapus</b> placeholder <span className="font-mono">{"{{..}}"}</span> yang mau dipakai.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-emerald-700 text-white font-bold flex items-center justify-center">3</span>
            <div>
              <div className="font-semibold text-slate-800">Upload kembali</div>
              <div className="text-[11px] text-slate-500">Klik tombol hijau <b>UPLOAD EXCEL TEMPLATE</b> di bawah → file baru otomatis Aktif menggantikan yang lama.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Row */}
      <div className="flex items-end gap-3 flex-wrap p-3 bg-white border border-emerald-200">
        <div>
          <Label className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-600 mb-1 block">Jenis Form</Label>
          <select
            data-testid="excel-code-select"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            className="h-9 border border-slate-300 px-2 text-sm bg-white min-w-[240px]"
          >
            {codes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
          </select>
        </div>
        <Button
          data-testid="download-starter-btn"
          onClick={onDownloadStarter}
          className="h-9 rounded-none bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold uppercase tracking-[0.1em]"
        >
          <Download size={14} weight="bold" className="mr-1.5" /> Unduh Starter
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm" onChange={onUpload} className="hidden" data-testid="excel-file-input" />
        <Button
          data-testid="upload-excel-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-9 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold uppercase tracking-[0.1em]"
        >
          <UploadSimple size={14} weight="bold" className="mr-1.5" /> {uploading ? "Mengunggah..." : "Upload Excel Template"}
        </Button>
      </div>

      {/* Placeholders cheatsheet */}
      {selectedMeta && (
        <div className="mt-3 p-3 bg-white border border-slate-200">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1.5">Placeholder Tersedia untuk {selectedMeta.code}</div>
          <div className="flex flex-wrap gap-1">
            {selectedMeta.fields.map((f) => (
              <code key={f} className="text-[10px] px-1.5 py-0.5 bg-sky-50 border border-sky-200 text-sky-800 font-mono">{`{{${f}}}`}</code>
            ))}
            <code className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 font-mono">{"{{IMAGE:company_logo}}"}</code>
          </div>
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 mt-2 mb-1">Tabel: baris template harus berisi salah satu placeholder items.KEY</div>
          <div className="flex flex-wrap gap-1">
            {selectedMeta.table_fields.map((f) => (
              <code key={f} className="text-[10px] px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono">{`{{items.${f}}}`}</code>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded templates list */}
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">Template Excel Terpasang</div>
        {loading && <div className="text-xs text-slate-400 p-3">Memuat...</div>}
        {!loading && items.length === 0 && (
          <div className="text-xs text-slate-500 p-3 bg-white border border-dashed border-slate-300 italic">
            Belum ada Excel template. Klik "Unduh Starter" → edit di Excel → upload kembali.
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} data-testid={`excel-tpl-${it.id}`} className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 mb-1">
            <div className="flex items-center gap-3 min-w-0">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold bg-slate-900 text-white">{it.code}</span>
              <span className="text-sm text-slate-900 truncate">{it.filename}</span>
              {it.is_active && (
                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-bold bg-emerald-100 border border-emerald-400 text-emerald-800 flex items-center gap-1">
                  <CheckCircle size={10} weight="fill" /> Aktif
                </span>
              )}
              <span className="text-[10px] text-slate-500 tabular-nums">{(it.size_bytes/1024).toFixed(1)} KB · {(it.updated_at||"").slice(0,16).replace("T"," ")} · by {it.updated_by}</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" onClick={() => onAutoPlaceholder(it)} title="Auto-scan label di Excel & sisipkan placeholder otomatis" className="h-7 rounded-none px-2 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold flex items-center gap-1"><MagicWand size={12} weight="bold" /> Auto-Isi Placeholder</Button>
              <Button size="sm" onClick={() => onPreview(it)} title="Preview PDF (dari PDF viewer bisa Print / Download)" className="h-7 rounded-none px-2 bg-sky-100 hover:bg-sky-200 text-sky-800 text-[10px] font-bold flex items-center gap-1"><Eye size={12} weight="bold" /> Preview PDF</Button>
              <Button size="sm" onClick={() => onDownload(it)} title="Unduh xlsx untuk edit" className="h-7 rounded-none px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1"><Download size={12} weight="bold" /> Unduh & Edit</Button>
              {!it.is_active && (
                <Button size="sm" onClick={() => onActivate(it)} title="Jadikan aktif" className="h-7 rounded-none px-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold">Aktifkan</Button>
              )}
              <Button size="sm" onClick={() => onDelete(it)} title="Hapus" className="h-7 w-7 rounded-none p-0 bg-rose-100 hover:bg-rose-200 text-rose-700"><TrashSimple size={13} weight="bold" /></Button>
            </div>
          </div>
        ))}
      </div>
      {previewExcel && (
        <PdfPreviewModal
          metaUrl={`/excel-templates/${previewExcel.id}/preview-page-meta`}
          pageUrlBuilder={(n) => `${process.env.REACT_APP_BACKEND_URL}/api/excel-templates/${previewExcel.id}/preview-page-image?page=${n}&scale=2`}
          title={`Preview Excel: ${previewExcel.code}`}
          subtitle="Hasil substitusi data contoh · Download = file Excel asli"
          downloadUrl={`${process.env.REACT_APP_BACKEND_URL}/api/excel-templates/${previewExcel.id}/download`}
          onClose={() => setPreviewExcel(null)}
        />
      )}
    </Card>
  );
}



// ---------- CAR Word Template Section (MKS-F-QAD-004) ----------
function CarWordTemplateSection() {
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewTid, setPreviewTid] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [t, f] = await Promise.all([
        api.get("/nonconformance/car-template"),
        api.get("/nonconformance/car-template/fields"),
      ]);
      setActive(t.data.active || null);
      setItems(t.data.items || []);
      setFields(f.data.fields || []);
    } catch { toast.error("Gagal memuat template CAR"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onDownloadStarter = async () => {
    try {
      const res = await api.get("/nonconformance/car-template/starter", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "STARTER_CAR_MKS-F-QAD-004.docx";
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Gagal unduh starter"); }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/nonconformance/car-template/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Template CAR di-upload & LANGSUNG AKTIF untuk cetak PDF");
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal upload"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const onDownload = async (it) => {
    try {
      const res = await api.get(`/nonconformance/car-template/${it.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = it.filename || "CAR_template.docx";
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Gagal unduh"); }
  };

  const onActivate = async (it) => {
    try { await api.post(`/nonconformance/car-template/${it.id}/activate`); toast.success("Diaktifkan"); load(); }
    catch { toast.error("Gagal aktifkan"); }
  };

  const onDelete = async (it) => {
    if (!confirm(`Hapus template "${it.filename}"?`)) return;
    try { await api.delete(`/nonconformance/car-template/${it.id}`); toast.success("Terhapus"); load(); }
    catch { toast.error("Gagal hapus"); }
  };

  return (
    <Card className="rounded-none border-rose-300 bg-rose-50/30 p-5 shadow-none" data-testid="car-word-template-section">
      <div className="mb-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileText size={20} weight="duotone" className="text-rose-700" /> Template CAR — Word (MKS-F-QAD-004)
        </h3>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          Desain form CAR langsung di <b>Microsoft Word</b> memakai placeholder <span className="font-mono bg-white px-1 border border-slate-300">{"{{nc_no}}"}</span>, <span className="font-mono bg-white px-1 border border-slate-300">{"{{description}}"}</span> dst.
          Saat <b>Cetak PDF</b> di halaman CAR, data otomatis diisi ke template Anda lalu dikonversi ke PDF (lampiran foto/PDF tetap ikut).<br />
          <b className="text-rose-800">Setiap upload langsung AKTIF menggantikan template lama.</b> Jika belum ada template, cetak memakai format bawaan sistem.
        </p>
      </div>

      {/* Guide */}
      <div className="mb-3 p-3 bg-white border border-rose-200 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="flex gap-2">
          <span className="flex-shrink-0 w-6 h-6 bg-rose-700 text-white font-bold flex items-center justify-center">1</span>
          <div><div className="font-semibold text-slate-800">Unduh Starter</div><div className="text-[11px] text-slate-500">Ambil file .docx berisi form + placeholder.</div></div>
        </div>
        <div className="flex gap-2">
          <span className="flex-shrink-0 w-6 h-6 bg-rose-700 text-white font-bold flex items-center justify-center">2</span>
          <div><div className="font-semibold text-slate-800">Edit di Word</div><div className="text-[11px] text-slate-500">Atur layout, border, logo. <b>Jangan hapus</b> placeholder <span className="font-mono">{"{{..}}"}</span>.</div></div>
        </div>
        <div className="flex gap-2">
          <span className="flex-shrink-0 w-6 h-6 bg-rose-700 text-white font-bold flex items-center justify-center">3</span>
          <div><div className="font-semibold text-slate-800">Upload kembali</div><div className="text-[11px] text-slate-500">File baru otomatis aktif untuk cetak PDF CAR.</div></div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap p-3 bg-white border border-rose-200">
        <Button data-testid="car-download-starter" onClick={onDownloadStarter} className="h-9 rounded-none bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold uppercase tracking-[0.1em]">
          <Download size={14} weight="bold" className="mr-1.5" /> Unduh Starter Word
        </Button>
        <input ref={fileRef} type="file" accept=".docx" onChange={onUpload} className="hidden" data-testid="car-word-file-input" />
        <Button data-testid="car-upload-word" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 rounded-none bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold uppercase tracking-[0.1em]">
          <UploadSimple size={14} weight="bold" className="mr-1.5" /> {uploading ? "Mengunggah..." : "Upload Template Word"}
        </Button>
        {active && (
          <span className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-1 flex items-center gap-1">
            <CheckCircle size={12} weight="fill" /> Aktif: {active.filename}
          </span>
        )}
      </div>

      {/* Placeholder cheatsheet */}
      {fields.length > 0 && (
        <div className="mt-3 p-3 bg-white border border-slate-200">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1.5">Placeholder Tersedia</div>
          <div className="flex flex-wrap gap-1">
            {fields.map((f) => (
              <code key={f.key} title={f.desc} className="text-[10px] px-1.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-800 font-mono">{`{{${f.key}}}`}</code>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-1.5 italic">Checkbox pakai pola <span className="font-mono">[{"{{chk_inhouse}}"}] IN-HOUSE</span> — sistem isi "X" bila sesuai.</div>
        </div>
      )}

      {/* List */}
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">Template Word Terpasang</div>
        {loading && <div className="text-xs text-slate-400 p-3">Memuat...</div>}
        {!loading && items.length === 0 && (
          <div className="text-xs text-slate-500 p-3 bg-white border border-dashed border-slate-300 italic">
            Belum ada template Word. Unduh Starter → edit di Word → upload kembali.
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} data-testid={`car-word-tpl-${it.id}`} className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 mb-1">
            <div className="flex items-center gap-3 min-w-0">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold bg-slate-900 text-white">CAR</span>
              <span className="text-sm text-slate-900 truncate">{it.filename}</span>
              {it.active && (
                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-bold bg-emerald-100 border border-emerald-400 text-emerald-800 flex items-center gap-1">
                  <CheckCircle size={10} weight="fill" /> Aktif
                </span>
              )}
              <span className="text-[10px] text-slate-500 tabular-nums">{(it.size_bytes/1024).toFixed(1)} KB · {(it.uploaded_at||"").slice(0,16).replace("T"," ")} · by {it.uploaded_by}</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" onClick={() => setPreviewTid(it.id)} title="Preview PDF (data contoh)" className="h-7 rounded-none px-2 bg-sky-100 hover:bg-sky-200 text-sky-800 text-[10px] font-bold flex items-center gap-1"><Eye size={12} weight="bold" /> Preview PDF</Button>
              <Button size="sm" onClick={() => onDownload(it)} title="Unduh .docx untuk edit" className="h-7 rounded-none px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1"><Download size={12} weight="bold" /> Unduh & Edit</Button>
              {!it.active && (
                <Button size="sm" onClick={() => onActivate(it)} title="Jadikan aktif" className="h-7 rounded-none px-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold">Aktifkan</Button>
              )}
              <Button size="sm" onClick={() => onDelete(it)} title="Hapus" className="h-7 w-7 rounded-none p-0 bg-rose-100 hover:bg-rose-200 text-rose-700"><TrashSimple size={13} weight="bold" /></Button>
            </div>
          </div>
        ))}
      </div>

      {previewTid && (
        <PdfPreviewModal
          metaUrl={`/nonconformance/car-template/${previewTid}/preview-page-meta`}
          pageUrlBuilder={(n) => `${process.env.REACT_APP_BACKEND_URL}/api/nonconformance/car-template/${previewTid}/preview-page-image?page=${n}&scale=2`}
          title="Preview Template CAR (data contoh)"
          subtitle="Hasil isian data contoh ke template Word Anda"
          onClose={() => setPreviewTid(null)}
        />
      )}
    </Card>
  );
}
