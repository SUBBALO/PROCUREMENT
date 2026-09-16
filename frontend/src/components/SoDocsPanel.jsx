import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { isDrawingPreviewOnly } from "../lib/rbac";
import PdfPreviewModal from "./PdfPreviewModal";
import {
  Eye, DownloadSimple, Trash, UploadSimple, ArrowClockwise,
  StackSimple, Cube, CurrencyDollar, FileText,
} from "@phosphor-icons/react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "./ui/alert-dialog";

/**
 * SoDocsPanel — Tabel upload dokumen level SO (dilampirkan ke BOM bersama).
 * 3 kategori: Nesting, AutoCAD/CAD (DWG), Costing/Price. Masing-masing bisa multi-file.
 * Storage: /api/bom/{bomId}/attachments (kategori: nesting | cad | costing).
 */

const CATEGORIES = [
  {
    key: "nesting",
    label: "File Nesting",
    hint: "PDF / Excel layout nesting",
    accept: ".pdf,.xlsx,.xls,.doc,.docx",
    icon: StackSimple,
    tone: "violet",
    previewable: true,
  },
  {
    key: "cad",
    label: "File AutoCAD (DWG)",
    hint: "Native CAD: DWG, DXF, IPT, STEP, ZIP",
    accept: ".dwg,.dxf,.dwf,.ipt,.iam,.idw,.sldprt,.sldasm,.step,.stp,.iges,.igs,.stl,.zip,.rar,.7z",
    icon: Cube,
    tone: "sky",
    previewable: false,
  },
  {
    key: "costing",
    label: "File Costing / Price",
    hint: "Excel atau PDF costing",
    accept: ".xlsx,.xls,.pdf",
    icon: CurrencyDollar,
    tone: "amber",
    previewable: true,
    costing: true,
  },
];

const TONE = {
  violet: { bar: "bg-violet-600", soft: "bg-violet-50", border: "border-violet-300", text: "text-violet-700", btn: "bg-violet-600 hover:bg-violet-700" },
  sky: { bar: "bg-sky-600", soft: "bg-sky-50", border: "border-sky-300", text: "text-sky-700", btn: "bg-sky-600 hover:bg-sky-700" },
  amber: { bar: "bg-amber-600", soft: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700" },
};

export default function SoDocsPanel({ bomId, bomNo, canEdit = false }) {
  const { user } = useAuth();
  const previewOnly = isDrawingPreviewOnly(user?.role); // QC/DocControl/Store/Produksi → no download
  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const [grouped, setGrouped] = useState({ nesting: [], cad: [], costing: [] });
  const [canViewCosting, setCanViewCosting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null); // category key
  const [viewer, setViewer] = useState(null);
  const [delTarget, setDelTarget] = useState(null); // { category, id, filename }
  const [delBusy, setDelBusy] = useState(false);
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    if (!bomId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/bom/${bomId}/attachments`);
      const g = data.attachments || {};
      setGrouped({ nesting: g.nesting || [], cad: g.cad || [], costing: g.costing || [] });
      setCanViewCosting(data.can_view_costing !== false);
    } catch (e) {
      // diamkan — panel tetap render kosong
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (category, files) => {
    if (!bomId) { toast.error("BOM belum ter-link untuk SO ini."); return; }
    if (!files || files.length === 0) return;
    setUploading(category);
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("category", category);
        fd.append("file", file);
        await api.post(`/bom/${bomId}/attachments`, fd);
        ok += 1;
      } catch (e) {
        fail += 1;
        toast.error(`${file.name}: ${e.response?.data?.detail || "gagal upload"}`);
      }
    }
    if (ok) toast.success(`${ok} file ter-upload`);
    setUploading(null);
    if (fileRefs.current[category]) fileRefs.current[category].value = "";
    load();
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      await api.delete(`/bom/${bomId}/attachments/${delTarget.id}`);
      toast.success("File dihapus");
      setDelTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus file");
    } finally {
      setDelBusy(false);
    }
  };

  const openPreview = (category, a) => {
    setViewer({
      metaUrl: `/bom/${bomId}/attachments/${a.id}/page-meta`,
      pageUrlBuilder: (n) => `${backendUrl}/api/bom/${bomId}/attachments/${a.id}/page-image?page=${n}&scale=2`,
      downloadUrl: `${backendUrl}/api/bom/${bomId}/attachments/${a.id}/download`,
      title: `SO ${bomNo || ""} · ${a.filename || category}`,
      subtitle: a.filename || "",
    });
  };

  const visibleCategories = CATEGORIES.filter((c) => !(c.costing && !canViewCosting));

  return (
    <div className="border-2 border-teal-500 bg-white" data-testid="so-docs-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-teal-600 text-white">
        <div className="flex items-center gap-2">
          <FileText size={18} weight="fill" />
          <span className="text-sm font-bold uppercase tracking-[0.15em]">Dokumen SO — Nesting · AutoCAD · Costing</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {bomNo ? (
            <span className="px-2 py-0.5 bg-white/20 font-mono font-bold" data-testid="so-docs-bom-badge">BOM: {bomNo}</span>
          ) : (
            <span className="px-2 py-0.5 bg-rose-500/90 font-bold">BOM belum ter-link</span>
          )}
          {loading && <ArrowClockwise size={14} className="animate-spin" />}
        </div>
      </div>

      {!bomId ? (
        <div className="p-6 text-center text-sm text-slate-500">
          SO ini belum punya BOM bersama. Link/registrasi BOM dulu agar bisa mengunggah dokumen Nesting / AutoCAD / Costing.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
          {visibleCategories.map((cat) => {
            const Icon = cat.icon;
            const tone = TONE[cat.tone];
            const files = grouped[cat.key] || [];
            return (
              <div key={cat.key} className={`border ${tone.border} ${tone.soft} flex flex-col`} data-testid={`so-docs-col-${cat.key}`}>
                <div className={`flex items-center gap-2 px-3 py-2 ${tone.bar} text-white`}>
                  <Icon size={16} weight="bold" />
                  <span className="text-[12px] font-bold uppercase tracking-wider flex-1">{cat.label}</span>
                  <span className="text-[11px] font-bold px-1.5 bg-white/25" data-testid={`so-docs-count-${cat.key}`}>{files.length}</span>
                </div>
                <div className="px-2 py-1.5 text-[10px] text-slate-500 italic border-b border-slate-200">{cat.hint}</div>

                <div className="flex-1 divide-y divide-slate-200 min-h-[54px]">
                  {files.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-slate-400">Belum ada file</div>
                  ) : (
                    files.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 px-2.5 py-2 bg-white" data-testid={`so-docs-file-${cat.key}-${a.id}`}>
                        <FileText size={14} className={tone.text} weight="fill" />
                        <span className="flex-1 text-[11px] text-slate-700 truncate" title={a.filename}>{a.filename}</span>
                        {cat.previewable && (
                          <button
                            onClick={() => openPreview(cat.key, a)}
                            className="p-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            title="Preview"
                            data-testid={`so-docs-preview-${a.id}`}
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        {!previewOnly && (
                          <a
                            href={`${backendUrl}/api/bom/${bomId}/attachments/${a.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-500 hover:text-sky-700 hover:bg-sky-50"
                            title="Download"
                            data-testid={`so-docs-download-${a.id}`}
                          >
                            <DownloadSimple size={14} />
                          </a>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => setDelTarget({ category: cat.key, id: a.id, filename: a.filename })}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Hapus"
                            data-testid={`so-docs-delete-${a.id}`}
                          >
                            <Trash size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {canEdit && (
                  <div className="p-2 border-t border-slate-200">
                    <input
                      ref={(el) => (fileRefs.current[cat.key] = el)}
                      type="file"
                      multiple
                      accept={cat.accept}
                      className="hidden"
                      onChange={(e) => handleUpload(cat.key, e.target.files)}
                      data-testid={`so-docs-input-${cat.key}`}
                    />
                    <button
                      onClick={() => fileRefs.current[cat.key]?.click()}
                      disabled={uploading === cat.key}
                      className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 ${tone.btn} text-white text-[11px] font-bold uppercase tracking-wider disabled:opacity-60`}
                      data-testid={`so-docs-upload-${cat.key}`}
                    >
                      {uploading === cat.key
                        ? <><ArrowClockwise size={13} className="animate-spin" /> Mengunggah...</>
                        : <><UploadSimple size={13} weight="bold" /> Upload (bisa &gt;1)</>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewer && (
        <PdfPreviewModal
          metaUrl={viewer.metaUrl}
          pageUrlBuilder={viewer.pageUrlBuilder}
          downloadUrl={viewer.downloadUrl}
          title={viewer.title}
          subtitle={viewer.subtitle}
          noDownload={previewOnly}
          onClose={() => setViewer(null)}
        />
      )}

      <AlertDialog open={!!delTarget} onOpenChange={(o) => { if (!o) setDelTarget(null); }}>
        <AlertDialogContent className="rounded-none" data-testid="so-docs-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash size={18} weight="bold" /> Hapus File?
            </AlertDialogTitle>
            <AlertDialogDescription>
              File <b>{delTarget?.filename}</b> akan dihapus dari dokumen SO ini. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none" disabled={delBusy} data-testid="so-docs-delete-cancel">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-rose-600 hover:bg-rose-700 text-white"
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={delBusy}
              data-testid="so-docs-delete-confirm"
            >
              {delBusy ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
