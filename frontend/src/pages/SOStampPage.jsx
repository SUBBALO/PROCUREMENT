import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import PdfStampCanvas from "../components/PdfStampCanvas";
import PdfPreviewModal from "../components/PdfPreviewModal";
import { Stamp, MagnifyingGlass, ArrowClockwise, Eye, CheckCircle, Warning, X } from "@phosphor-icons/react";

/**
 * SOStampPage — Halaman Document Control untuk apply SO Stamp (kotak merah
 * info SO/PO/Qty/Customer/Received/Due Date) pada drawing yang sudah controlled.
 * Setelah SO stamp diapply → status jadi "released" (siap print ke Produksi).
 */
export default function SOStampPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("pending"); // pending | released
  const [stampFor, setStampFor] = useState(null);
  const [stampPosMode, setStampPosMode] = useState(null);
  const [preview, setPreview] = useState(null);
  const apiUrl = process.env.REACT_APP_BACKEND_URL;
  const canAccess = ["doc_control", "document_control", "admin", "super_admin"].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/drawings", { params: { limit: 500 } });
      const list = (data.items || []).filter((d) =>
        tab === "pending" ? d.approval_status === "controlled" : d.approval_status === "released"
      );
      const filtered = q.trim()
        ? list.filter((d) => [d.drawing_no, d.customer_name, d.customer_code, d.project_name, d.so_no].some(
            (v) => (v || "").toLowerCase().includes(q.toLowerCase())
          ))
        : list;
      setItems(filtered);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat");
    } finally { setLoading(false); }
  }, [tab, q]);

  useEffect(() => { if (canAccess) load(); }, [load, canAccess]);
  const pag = usePagination(items, 20);

  if (!canAccess) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <BackLink to="/" />
        <Card className="p-8 border-2 border-rose-300 bg-rose-50 rounded-none text-center">
          <div className="text-rose-800 font-bold text-lg mb-2">Akses Ditolak</div>
          <div className="text-sm text-rose-600">Halaman ini khusus Admin Document Control.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 mb-1">
          <Stamp size={14} weight="fill" /> Document Control · SO Stamp
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          SO Stamp untuk Produksi
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Apply kotak merah SO Stamp (MKS S.O · P/O · Qty · Customer · Received · Due Date) pada drawing yang sudah controlled → siap print ke Produksi.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "pending", label: "🕐 Menunggu SO Stamp", cls: "text-amber-700 border-amber-500" },
          { key: "released", label: "✓ Released (SO Stamped)", cls: "text-emerald-700 border-emerald-500" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border-b-2 -mb-[2px] ${
              tab === t.key ? t.cls : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            data-testid={`sostamp-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari..." data-testid="sostamp-search" />
          <Button variant="ghost" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-500">{items.length} drawing</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">Drawing No</th>
                <th className="text-left p-3">Project · Customer</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Controlled At</th>
                <th className="text-center p-3">SO Stamp</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="sostamp-list">
              {loading && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">
                {tab === "pending" ? "Tidak ada drawing controlled menunggu SO stamp." : "Belum ada released drawing."}
              </td></tr>)}
              {pag.pagedData.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`sostamp-row-${d.drawing_no}`}>
                  <td className="p-3 font-mono font-semibold text-slate-800">{d.drawing_no}</td>
                  <td className="p-3">
                    <div>{d.project_name || "-"}</div>
                    <div className="text-xs text-slate-500">{d.customer_name || d.customer_code || "-"}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{d.so_no || "-"}</td>
                  <td className="p-3 text-xs">{d.controlled_at ? new Date(d.controlled_at).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="p-3 text-center">
                    {d.so_stamp ? (
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-400 text-[9px] font-bold uppercase">✓ Stamped</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-400 text-[9px] font-bold uppercase">⚠ Belum</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => setPreview(d)}
                        className="inline-flex items-center px-2 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold uppercase gap-0.5"
                        data-testid={`sostamp-view-${d.drawing_no}`}
                      >
                        <Eye size={11} weight="bold" /> Preview
                      </button>
                      <button
                        onClick={() => setStampFor(d)}
                        className={`inline-flex items-center px-2 py-1 text-white text-[10px] font-bold uppercase gap-0.5 ${d.so_stamp ? "bg-slate-600 hover:bg-slate-700" : "bg-amber-600 hover:bg-amber-700"}`}
                        data-testid={`sostamp-apply-${d.drawing_no}`}
                      >
                        <Stamp size={11} weight="bold" /> {d.so_stamp ? "Re-stamp SO" : "Stamp SO"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="drawing" testIdPrefix="sostamp-pag" />
      </Card>

      {stampFor && !stampPosMode && (
        <SOStampFormDialog
          drawing={stampFor}
          onClose={() => setStampFor(null)}
          onNext={(formData) => setStampPosMode({ drawing: stampFor, formData })}
        />
      )}
      {stampPosMode && (
        <SOStampPositionPicker
          drawing={stampPosMode.drawing}
          formData={stampPosMode.formData}
          onDone={() => { setStampFor(null); setStampPosMode(null); load(); }}
          onClose={() => setStampPosMode(null)}
        />
      )}
      {preview && (
        <PdfPreviewModal
          drawingId={preview.id}
          target="mks"
          stamped
          title={preview.drawing_no}
          subtitle={`${preview.project_name || ""}${preview.customer_name ? " · " + preview.customer_name : ""}`}
          downloadUrl={`${apiUrl}/api/drawings/${preview.id}/pdf-stamped`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}


/* Form isi field SO Stamp */
function SOStampFormDialog({ drawing, onClose, onNext }) {
  // Iter 20d — Prioritas fill: existing so_stamp > so_stamp_draft (dari Sales TTD) > default
  const src = drawing.so_stamp || drawing.so_stamp_draft || {};
  const [form, setForm] = useState({
    so_no: src.so_no || drawing.so_no || "",
    po_no: src.po_no || "",
    qty: src.qty || "",
    customer: src.customer || drawing.customer_name || drawing.customer_code || "",
    received_date: src.received_date || new Date().toISOString().slice(0, 10),
    due_date: src.due_date || drawing.expected_due_date || "",
  });
  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const fromSales = !drawing.so_stamp && !!drawing.so_stamp_draft;

  const proceed = () => {
    if (!form.so_no.trim()) return toast.error("MKS S.O No wajib diisi");
    if (!form.qty.trim()) return toast.error("Qty wajib diisi");
    onNext(form);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" data-testid="sostamp-form-dialog">
      <div className="bg-white w-full max-w-lg rounded-none shadow-2xl">
        <div className="bg-amber-900 text-white p-3 flex justify-between items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">SO Stamp Info · {drawing.drawing_no}</div>
            <h2 className="text-lg font-bold">Isi data SO untuk Produksi</h2>
          </div>
          <button onClick={onClose} className="text-white hover:text-amber-200"><X size={20} weight="bold" /></button>
        </div>
        <div className="p-5 space-y-3">
          {fromSales && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-2.5">
              <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-800">✓ Auto-Filled dari Sales TTD</div>
              <div className="text-xs text-slate-700 mt-0.5">
                Data ini diisi oleh <b>{drawing.so_stamp_draft?.filled_by || "Sales"}</b> pada{" "}
                {drawing.so_stamp_draft?.filled_at ? new Date(drawing.so_stamp_draft.filled_at).toLocaleString("id-ID") : "-"}. Anda bisa edit sebelum apply.
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "so_no", label: "MKS S.O No", required: true, placeholder: "4000" },
              { key: "po_no", label: "P/O No", placeholder: "PO-12345" },
              { key: "qty", label: "Qty", required: true, placeholder: "10 pcs" },
              { key: "customer", label: "Customer", placeholder: "THIES, PT" },
              { key: "received_date", label: "Received Date", type: "date" },
              { key: "due_date", label: "Due Date", type: "date" },
            ].map((f) => (
              <div key={f.key}>
                <Label className="text-xs">{f.label} {f.required && <span className="text-red-500">*</span>}</Label>
                <Input
                  type={f.type || "text"}
                  value={form[f.key]}
                  onChange={(e) => setF(f.key, e.target.value)}
                  placeholder={f.placeholder || ""}
                  className="rounded-none border-slate-300"
                  data-testid={`sostamp-input-${f.key}`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-200 p-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none border-slate-300">Batal</Button>
          <Button onClick={proceed} className="rounded-none bg-amber-700 hover:bg-amber-800 text-white" data-testid="sostamp-next-btn">
            Lanjut → Pilih Posisi Stamp
          </Button>
        </div>
      </div>
    </div>
  );
}


/* PDF viewer untuk pilih posisi SO stamp — multi-halaman & bisa di-scroll */
function SOStampPositionPicker({ drawing, formData, onDone, onClose }) {
  const [placements, setPlacements] = useState({}); // {page:{x,y}}, key "-1" = semua halaman
  const [sameAll, setSameAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const placementList = Object.entries(placements).map(([p, v]) => ({ page: Number(p), x: v.x, y: v.y }));
  const hasPlacement = placementList.length > 0;

  const onPick = (page, xRel, yRel) => {
    if (sameAll) setPlacements({ "-1": { x: xRel, y: yRel } });
    else setPlacements((prev) => ({ ...prev, [page]: { x: xRel, y: yRel } }));
  };
  const removePlacement = (page) => setPlacements((prev) => { const n = { ...prev }; delete n[page]; return n; });
  const toggleSameAll = (c) => { setSameAll(c); setPlacements({}); };

  const confirm = async () => {
    setBusy(true);
    try {
      const body = { ...formData };
      if (hasPlacement) {
        body.placements = placementList.map((p) => ({ page: p.page, x: p.x, y: p.y }));
        body.stamp_x = placementList[0].x;
        body.stamp_y = placementList[0].y;
      }
      await api.post(`/drawings/${drawing.id}/stamp-so`, body);
      toast.success("✓ SO Stamp applied. Drawing sekarang RELEASED (siap ke Produksi).");
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal apply SO stamp");
    } finally { setBusy(false); }
  };

  const marker = (
    <div className="border-2 border-amber-500 bg-amber-100/80 p-1" style={{ width: "150px" }}>
      <div className="text-[8px] text-amber-900 font-mono leading-tight">
        <div className="font-bold">MKS S.O: {formData.so_no}</div>
        <div>P/O: {formData.po_no || "-"}</div>
        <div>Qty: {formData.qty}</div>
        <div>Cust: {(formData.customer || "-").slice(0, 14)}</div>
        <div>Due: {formData.due_date || "-"}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" data-testid="sostamp-picker">
      <div className="flex items-center justify-between p-3 bg-amber-900 text-white shrink-0">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-80">Pilih Posisi SO Stamp — {drawing.drawing_no}</div>
          <div className="text-[10px] opacity-70">SO: {formData.so_no} · Qty: {formData.qty} · Customer: {formData.customer || "-"}</div>
        </div>
        <div className="text-xs opacity-90 text-center">
          {!hasPlacement ? (
            <span className="animate-pulse">👆 Klik di PDF untuk letakkan SO stamp (boleh beda posisi tiap halaman). Kosong = pojok kanan atas.</span>
          ) : sameAll ? (
            <span>Posisi <b className="text-amber-300">SAMA di semua halaman</b></span>
          ) : (
            <span>Stamp di <b className="text-amber-300">{placementList.length}</b> halaman: {placementList.map((p) => `Hal.${p.page + 1}`).join(", ")}</span>
          )}
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px]" title="Stamp di semua halaman pada posisi sama">
            <input type="checkbox" checked={sameAll} onChange={(e) => toggleSameAll(e.target.checked)} className="accent-amber-400 w-3.5 h-3.5" data-testid="sostamp-same-all" />
            <span className="uppercase tracking-widest font-bold text-amber-200">Sama semua hal.</span>
          </label>
          <button onClick={onClose} className="px-3 py-1 text-xs font-bold bg-slate-600 hover:bg-slate-500 text-white uppercase tracking-widest">✕ Batal</button>
          <button onClick={confirm} disabled={busy} className="px-3 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white uppercase tracking-widest disabled:opacity-40" data-testid="sostamp-confirm-btn">
            {busy ? "..." : "✓ Konfirmasi & Stamp"}
          </button>
        </div>
      </div>
      {!sameAll && hasPlacement && (
        <div className="px-4 py-1.5 bg-slate-900 text-white flex items-center gap-2 flex-wrap border-b border-slate-700">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Sudah ditempel:</span>
          {placementList.sort((a, b) => a.page - b.page).map((p) => (
            <span key={p.page} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-700 text-white text-[10px] font-bold uppercase">
              Hal. {p.page + 1}
              <button onClick={() => removePlacement(p.page)} className="hover:text-amber-200" title="Hapus stamp halaman ini">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4 bg-slate-950">
        <PdfStampCanvas
          drawingId={drawing.id}
          target="mks"
          placements={placementList}
          onPick={onPick}
          markerNode={marker}
        />
      </div>
    </div>
  );
}
