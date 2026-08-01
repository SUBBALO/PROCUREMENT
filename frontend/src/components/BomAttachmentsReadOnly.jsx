import React, { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { Card } from "./ui/card";
import { FileText, Eye, LinkSimple, Info, Table } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import PdfPreviewModal from "./PdfPreviewModal";

/**
 * Read-only viewer of drawing attachments accessible from a BOM.
 * Pulls files that are stored at MKS-F-ENG-005 Drawing Master List (drawing.file_id, drawing.customer_ref_file_id)
 * AND BOM-level attachments (nesting, costing). Everything read-only.
 * To modify → user must go to MKS-F-ENG-005 Drawing Master List edit dialog.
 */
export default function BomAttachmentsReadOnly({ bom }) {
  const [drawing, setDrawing] = useState(null);
  const [bomAtt, setBomAtt] = useState({ drawing: [], nesting: [], costing: [] });
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    if (!bom) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        // Fetch linked drawing (if BOM has drawing_id) — search by drawing_no first, fallback scan by id
        if (bom.drawing_id) {
          const qParam = bom.drawing_no || bom.project_dwg || bom.drawing_id;
          const dr = await api.get(`/drawings`, { params: { q: qParam || undefined, limit: 100 } });
          let list = dr.data?.items || [];
          let match = list.find((d) => d.id === bom.drawing_id);
          // Fallback: fetch broader list
          if (!match) {
            const dr2 = await api.get(`/drawings`, { params: { limit: 500 } });
            list = dr2.data?.items || [];
            match = list.find((d) => d.id === bom.drawing_id);
          }
          if (alive && match) setDrawing(match);
        }
        // Fetch bom_attachments (nesting, costing)
        const { data } = await api.get(`/bom/${bom.id}/attachments`);
        if (alive) setBomAtt(data.attachments || { drawing: [], nesting: [], costing: [] });
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [bom]);

  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const files = useMemo(() => {
    const out = [];
    if (drawing?.file_id) {
      out.push({
        kind: "MKS Drawing PDF",
        accent: "emerald",
        name: drawing.filename || `${drawing.drawing_no}.pdf`,
        url: `${backendUrl}/api/drawings/${drawing.id}/preview`,
        viewer: { drawingId: drawing.id, target: "mks", downloadUrl: `${backendUrl}/api/drawings/${drawing.id}/pdf-stamped` },
        source: "MKS-F-ENG-005 Drawing Master List",
      });
    }
    if (drawing?.customer_ref_file_id) {
      out.push({
        kind: "Customer Drawing Reference",
        accent: "blue",
        name: drawing.customer_ref_filename || `${drawing.drawing_no}-CUST-REF.pdf`,
        url: `${backendUrl}/api/drawings/${drawing.id}/customer-ref/preview`,
        viewer: { drawingId: drawing.id, target: "customer_ref", downloadUrl: `${backendUrl}/api/drawings/${drawing.id}/customer-ref/download` },
        source: "MKS-F-ENG-005 Drawing Master List",
      });
    }
    (bomAtt.nesting || []).forEach((a) => out.push({
      kind: "Nesting PDF",
      accent: "violet",
      name: a.filename,
      url: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/preview`,
      viewer: {
        metaUrl: `/bom/${bom.id}/attachments/${a.id}/page-meta`,
        pageBase: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/page-image`,
        downloadUrl: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/download`,
      },
      source: "BOM Attachments",
      uploaded_by: a.uploaded_by, uploaded_at: a.uploaded_at,
    }));
    (bomAtt.nesting_price || []).forEach((a) => out.push({
      kind: "Nesting Price",
      accent: "cyan",
      name: a.filename,
      url: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/preview`,
      viewer: {
        metaUrl: `/bom/${bom.id}/attachments/${a.id}/page-meta`,
        pageBase: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/page-image`,
        downloadUrl: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/download`,
      },
      source: "BOM Attachments",
      uploaded_by: a.uploaded_by, uploaded_at: a.uploaded_at,
    }));
    (bomAtt.costing || []).forEach((a) => out.push({
      kind: "Costing Excel",
      accent: "amber",
      name: a.filename,
      url: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/preview`,
      viewer: {
        metaUrl: `/bom/${bom.id}/attachments/${a.id}/page-meta`,
        pageBase: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/page-image`,
        downloadUrl: `${backendUrl}/api/bom/${bom.id}/attachments/${a.id}/download`,
      },
      summaryEndpoint: `/bom/${bom.id}/attachments/${a.id}/costing-summary`,
      isCosting: true,
      attachId: a.id,
      source: "BOM Attachments",
      uploaded_by: a.uploaded_by, uploaded_at: a.uploaded_at,
    }));
    return out;
  }, [drawing, bomAtt, backendUrl, bom.id]);

  return (
    <Card className="rounded-none border-slate-200 overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center gap-1.5">
          <FileText size={13} weight="bold" /> File Attachments — Read Only
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500 italic">
          <Info size={11} weight="bold" /> Kelola file di menu <b className="mx-1 text-slate-700">MKS-F-ENG-005 Drawing Master List</b>
          {drawing?.id && (
            <a
              href={`/engineering/drawings`}
              className="ml-2 inline-flex items-center gap-1 text-sky-700 underline hover:text-sky-900 not-italic font-semibold"
              data-testid="bom-att-goto-drawing"
            >
              <LinkSimple size={11} weight="bold" /> {drawing.drawing_no}
            </a>
          )}
        </div>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="text-xs text-slate-400 italic">Memuat attachments…</div>
        ) : files.length === 0 ? (
          <div className="text-xs text-slate-400 italic">
            Belum ada attachment. Upload dari <b>MKS-F-ENG-005 Drawing Master List → Edit Drawing → panel File Attachments</b>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" data-testid="bom-att-list">
            {files.map((f, i) => (
              <div key={i} className={`border-2 border-${f.accent}-300 bg-${f.accent}-50/40 p-2 space-y-1`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold text-${f.accent}-800`}>{f.kind}</div>
                <div className="flex items-center gap-1 min-w-0">
                  <FileText size={13} className={`text-${f.accent}-700 flex-none`} />
                  <div className="min-w-0 flex-1 text-xs font-mono truncate" title={f.name}>{f.name}</div>
                </div>
                <div className="text-[10px] text-slate-500">{f.source}{f.uploaded_by ? ` · ${f.uploaded_by}` : ""}</div>
                <button
                  type="button"
                  onClick={() => setPreviewFile(f)}
                  className={`w-full inline-flex items-center justify-center gap-1 py-1 text-[11px] font-bold border border-${f.accent}-400 text-${f.accent}-800 hover:bg-${f.accent}-100`}
                  data-testid={`bom-att-preview-${i}`}
                >
                  <Eye size={12} weight="bold" /> Preview
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {previewFile && !previewFile.isCosting && <ReadOnlyPreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />}
      {previewFile && previewFile.isCosting && <CostingReportDialog file={previewFile} onClose={() => setPreviewFile(null)} />}
    </Card>
  );
}

function CostingReportDialog({ file, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFull, setShowFull] = useState(false);
  useEffect(() => {
    let alive = true;
    api.get(file.summaryEndpoint)
      .then(({ data }) => { if (alive) setData(data); })
      .catch(() => { if (alive) setData({ error: "Gagal ekstrak — coba buka Full Excel" }); })
      .finally(() => { if (alive) setLoading(false); });
  }, [file.summaryEndpoint]);
  const fmt = (v) => (v || v === 0) ? Number(v).toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "-";
  const cleanStr = (s) => (typeof s === "string" ? s.replace(/^:\s*/, "").trim() : s);

  if (showFull) {
    // Show full excel preview instead
    return <ReadOnlyPreviewDialog file={{ ...file, isCosting: false }} onClose={onClose} />;
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="costing-report-dialog">
        <DialogHeader>
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-bold text-amber-700 mb-1">
            <Table size={13} weight="bold" /> Costing Report
          </div>
          <DialogTitle className="text-lg">Rangkuman Cost Estimation</DialogTitle>
          <DialogDescription className="font-mono text-xs">{file.name}</DialogDescription>
        </DialogHeader>

        {loading && <div className="text-sm text-slate-400 italic p-8 text-center">Mengekstrak data dari sheet REPORT...</div>}
        {!loading && data?.error && <div className="text-sm text-rose-600 italic">{data.error}</div>}
        {!loading && data && !data.error && (
          <div className="space-y-3">
            {/* Project Header */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 p-3 text-xs">
              <div><div className="text-[10px] uppercase text-slate-500">Project</div><div className="font-bold text-slate-900">{cleanStr(data.header.project_name) || "-"}</div></div>
              <div><div className="text-[10px] uppercase text-slate-500">Client</div><div className="font-bold text-slate-900">{cleanStr(data.header.client) || "-"}</div></div>
              <div><div className="text-[10px] uppercase text-slate-500">Qty</div><div className="font-bold text-slate-900 tabular-nums">{data.header.qty ?? "-"}</div></div>
              <div><div className="text-[10px] uppercase text-slate-500">Drawing Ref</div><div className="font-bold text-slate-900 truncate" title={cleanStr(data.header.drawing_ref)}>{cleanStr(data.header.drawing_ref) || "-"}</div></div>
            </div>

            {/* Sections A-E */}
            {["section_a", "section_b", "section_c", "section_d", "section_e"].map((k, idx) => {
              const sec = data[k];
              if (!sec) return null;
              const accents = ["emerald", "sky", "violet", "amber", "slate"];
              const accent = accents[idx];
              return (
                <div key={k}>
                  <div className={`text-[10px] uppercase tracking-wider font-bold text-${accent}-700 mb-1`}>{sec.title}</div>
                  <table className="w-full text-sm border border-slate-200">
                    <tbody>
                      {sec.items.map((it, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-b-0">
                          <td className="p-2 text-slate-700">{it.label}</td>
                          <td className="p-2 text-right tabular-nums font-mono text-slate-900">{fmt(it.value)}</td>
                        </tr>
                      ))}
                      <tr className={`bg-${accent}-50 font-bold`}>
                        <td className={`p-2 text-${accent}-900`}>Total {sec.title.split(". ")[0]}</td>
                        <td className={`p-2 text-right tabular-nums font-mono text-${accent}-900`}>Rp {fmt(sec.subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Adjustments (F-J) */}
            <div className="border border-slate-300 bg-slate-50 p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-700 mb-1">F. Total Cost + Adjustments</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 text-slate-700 font-bold">F. Total Cost (A+B+C+D+E)</td><td className="py-1 text-right tabular-nums font-mono font-bold">Rp {fmt(data.totals.total_cost)}</td></tr>
                  <tr><td className="py-1 text-slate-600">G. Cost Safety Margin</td><td className="py-1 text-right tabular-nums font-mono">Rp {fmt(data.adjustments.safety_margin)}</td></tr>
                  <tr><td className="py-1 text-slate-600">H. Cost Profit</td><td className="py-1 text-right tabular-nums font-mono">Rp {fmt(data.adjustments.profit)}</td></tr>
                  <tr><td className="py-1 text-slate-600">I. Cost Marketing Fee</td><td className="py-1 text-right tabular-nums font-mono">Rp {fmt(data.adjustments.marketing_fee)}</td></tr>
                  <tr><td className="py-1 text-slate-600">J. Cost Fee for Customer</td><td className="py-1 text-right tabular-nums font-mono">Rp {fmt(data.adjustments.fee_customer)}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Grand Total */}
            <div className="border-2 border-amber-500 bg-amber-50 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-amber-800">Selling Price</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase text-slate-500">K. Total All Cost / Selling Price All Qty</div>
                  <div className="font-bold tabular-nums text-slate-900">Rp {fmt(data.totals.all_total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500">L. Selling Price / Pc</div>
                  <div className="text-lg font-bold tabular-nums text-amber-900">Rp {fmt(data.totals.selling_price_per_pc)}</div>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 italic pt-1">
              Data diekstrak dari sheet <b className="text-slate-600">{data.sheet_used}</b>. Klik "Lihat Full Excel" untuk detail lengkap.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 mt-3">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
          <Button type="button" onClick={() => setShowFull(true)} className="rounded-none bg-amber-700 hover:bg-amber-800 text-white" data-testid="costing-full-excel">
            <Eye size={13} weight="bold" className="mr-1" /> Lihat Full Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyPreviewDialog({ file, onClose }) {
  const ext = (file.name || "").split(".").pop().toLowerCase();
  const isPdf = ext === "pdf";
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
  const isExcel = ["xlsx", "xls", "xlsm"].includes(ext);
  const v = file.viewer;

  // PDF & Excel → viewer image-based (halaman gambar). Excel dikonversi ke gambar di backend.
  if (v && (isPdf || isExcel)) {
    if (v.metaUrl) {
      return (
        <PdfPreviewModal
          metaUrl={v.metaUrl}
          pageUrlBuilder={(n) => `${v.pageBase}?page=${n}&scale=2`}
          title={file.name}
          subtitle={isExcel ? "Excel (preview gambar) · Download = file asli" : (file.kind || "")}
          downloadUrl={v.downloadUrl || ""}
          onClose={onClose}
        />
      );
    }
    return (
      <PdfPreviewModal
        drawingId={v.drawingId}
        target={v.target}
        extraId={v.extraId || ""}
        stamped
        title={file.name}
        downloadUrl={v.downloadUrl || ""}
        onClose={onClose}
      />
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl h-[90vh] flex flex-col" data-testid="bom-att-preview-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={16} weight="bold" className="text-slate-600" />
            <span className="font-mono text-sm">{file.name}</span>
          </DialogTitle>
          <DialogDescription>{file.kind} · {file.source} — Preview read-only.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 border border-slate-200 bg-slate-900 overflow-hidden">
          {isImage && (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain" />
            </div>
          )}
          {!isImage && (
            <div className="w-full h-full flex items-center justify-center text-slate-400 italic">Tipe file tidak dikenal</div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose} className="rounded-none">Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
