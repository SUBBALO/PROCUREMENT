import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import { ClipboardText, Plus, ArrowClockwise, MagnifyingGlass, CheckCircle, XCircle, PaperPlaneRight } from "@phosphor-icons/react";

const STATUS = {
  draft: "bg-slate-200 text-slate-700 border-slate-400",
  submitted: "bg-amber-100 text-amber-800 border-amber-500",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-500",
  rejected: "bg-rose-100 text-rose-800 border-rose-500",
};
const TYPE_LABEL = { drawing: "Drawing", bom: "BOM", both: "Drawing + BOM" };
const KIND_LABEL = { ecr: "ECR · dari Customer", ecn: "ECN · Internal MKS" };
const KIND_CLS = { ecr: "bg-blue-100 text-blue-800 border-blue-400", ecn: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-400" };

export default function ECNPage() {
  const { user } = useAuth();
  const isLeader = ["eng_head", "eng_leader", "admin", "super_admin", "supervisor"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
      if (kindFilter) params.push(`kind=${kindFilter}`);
      const { data } = await api.get(`/ecn${params.length ? `?${params.join("&")}` : ""}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat data");
    } finally { setLoading(false); }
  }, [q, kindFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 max-w-[1300px] mx-auto space-y-4">
      <BackLink />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-rose-600 mb-1">
            <ClipboardText size={14} weight="fill" /> Engineering · Perubahan Drawing
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Perubahan Drawing — ECR & ECN
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <b>ECN</b> = pemberitahuan perubahan gambar ke <b>Produksi</b> (dibuat Engineering; sumber perubahan bisa dari customer maupun MKS sendiri). <b>ECR</b> = permintaan perubahan dari <b>customer</b> yang dibuat <b>Sales</b> ke Engineering. Tidak semua ECN berasal dari ECR.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white" data-testid="ecn-new-btn">
          <Plus size={15} weight="bold" className="mr-1" /> Buat ECR / ECN
        </Button>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Cari No / Drawing / BOM / SO..." data-testid="ecn-search" />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-9 border border-slate-300 rounded-none text-sm px-2" data-testid="ecn-kind-filter">
            <option value="">Semua Jenis</option>
            <option value="ecr">ECR (Customer)</option>
            <option value="ecn">ECN (Internal)</option>
          </select>
          <Button variant="ghost" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500"><b className="text-rose-700">{items.length}</b> data</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">No</th>
                <th className="text-left p-3">Jenis</th>
                <th className="text-left p-3">Ubah</th>
                <th className="text-left p-3">Target</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Alasan</th>
                <th className="text-left p-3">Priority</th>
                <th className="text-left p-3">Pemohon</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="ecn-list">
              {loading && <tr><td colSpan={10} className="p-8 text-center text-slate-400">Memuat...</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={10} className="p-12 text-center text-slate-400">Belum ada ECR/ECN. Klik "Buat ECR / ECN".</td></tr>}
              {items.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-rose-50/40" data-testid={`ecn-row-${e.ecn_no}`}>
                  <td className="p-3 font-mono font-bold text-slate-900 text-xs">{e.ecn_no}</td>
                  <td className="p-3"><span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${KIND_CLS[e.kind] || KIND_CLS.ecn}`}>{(e.kind || "ecn").toUpperCase()}</span></td>
                  <td className="p-3 text-xs">{TYPE_LABEL[e.change_type] || e.change_type}</td>
                  <td className="p-3 text-xs font-mono">{e.drawing_no || e.bom_no || "-"}</td>
                  <td className="p-3 text-xs font-mono">{e.so_no || "-"}</td>
                  <td className="p-3 text-xs max-w-[200px] truncate" title={e.reason}>{e.reason}</td>
                  <td className="p-3 text-xs">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${e.priority === "high" ? "bg-rose-100 text-rose-800 border border-rose-400" : e.priority === "low" ? "bg-slate-100 text-slate-600 border border-slate-300" : "bg-sky-100 text-sky-800 border border-sky-300"}`}>{e.priority}</span>
                  </td>
                  <td className="p-3 text-xs">{e.requested_by?.name || "-"}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${STATUS[e.status] || STATUS.draft}`}>{e.status}</span>
                  </td>
                  <td className="p-3 text-center">
                    {isLeader && e.status === "submitted" ? (
                      <button onClick={() => setReviewItem(e)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase" data-testid={`ecn-review-${e.ecn_no}`}>Review</button>
                    ) : e.status === "draft" ? (
                      <button onClick={async () => { try { await api.post(`/ecn/${e.id}/submit`); toast.success("Di-submit"); load(); } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); } }} className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase inline-flex items-center gap-1" data-testid={`ecn-submit-${e.ecn_no}`}>
                        <PaperPlaneRight size={11} /> Submit
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">{e.reviewed_by?.name ? `by ${e.reviewed_by.name}` : "-"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showForm && <ECNFormDialog onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {reviewItem && <ECNReviewDialog ecn={reviewItem} onClose={() => setReviewItem(null)} onDone={() => { setReviewItem(null); load(); }} />}
    </div>
  );
}

function ECNFormDialog({ onClose, onSaved }) {
  const { user } = useAuth();
  const isSales = user?.role === "sales";
  const isEng = ["engineering", "eng_head", "eng_leader", "eng_staff"].includes(user?.role);
  const isAdmin = ["admin", "super_admin", "supervisor"].includes(user?.role);
  const defaultKind = isSales && !isAdmin ? "ecr" : "ecn";
  const [form, setForm] = useState({ kind: defaultKind, change_type: "drawing", drawing_no: "", bom_no: "", so_no: "", customer_name: "", reason: "", description: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canEcr = isSales || isAdmin;
  const canEcn = isEng || isAdmin;

  const save = async (submit) => {
    if (!form.reason.trim()) return toast.error("Alasan perubahan wajib diisi");
    if (!form.description.trim()) return toast.error("Detail perubahan wajib diisi");
    setBusy(true);
    try {
      await api.post("/ecn", { ...form, submit });
      toast.success(submit ? "✓ Dibuat & di-submit ke Eng Leader" : "✓ Disimpan sebagai draft");
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    } finally { setBusy(false); }
  };

  const inputCls = "rounded-none border-slate-300 h-10";
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" data-testid="ecn-form-dialog">
      <Card className="rounded-none border-slate-300 w-full max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 bg-rose-700 text-white sticky top-0">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Perubahan Drawing / BOM</div>
          <div className="font-bold text-lg">Buat ECR / ECN</div>
        </div>
        <div className="p-4 space-y-4">
          {/* Kind selector: ECR (customer) vs ECN (internal) */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Jenis Pengajuan *</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => upd("kind", "ecr")} className={`p-3 border-2 text-left ${form.kind === "ecr" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`} data-testid="ecn-kind-ecr">
                <div className="font-bold text-sm text-blue-800">ECR</div>
                <div className="text-[11px] text-slate-500">Perubahan drawing diminta oleh <b>Customer</b></div>
              </button>
              <button type="button" onClick={() => upd("kind", "ecn")} className={`p-3 border-2 text-left ${form.kind === "ecn" ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200"}`} data-testid="ecn-kind-ecn">
                <div className="font-bold text-sm text-fuchsia-800">ECN</div>
                <div className="text-[11px] text-slate-500">Perubahan drawing MKS <b>internal</b> (dari engineer)</div>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Objek Perubahan *</div>
              <select value={form.change_type} onChange={(e) => upd("change_type", e.target.value)} className="w-full h-10 border border-slate-300 rounded-none px-2 text-sm" data-testid="ecn-type">
                <option value="drawing">Drawing</option>
                <option value="bom">BOM</option>
                <option value="both">Drawing + BOM</option>
              </select>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Priority</div>
              <select value={form.priority} onChange={(e) => upd("priority", e.target.value)} className="w-full h-10 border border-slate-300 rounded-none px-2 text-sm" data-testid="ecn-priority">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(form.change_type === "drawing" || form.change_type === "both") && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">No. Drawing</div>
                <Input value={form.drawing_no} onChange={(e) => upd("drawing_no", e.target.value)} className={`${inputCls} font-mono`} placeholder="mis. DWG.26.07..." data-testid="ecn-drawing-no" />
              </div>
            )}
            {(form.change_type === "bom" || form.change_type === "both") && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">No. BOM</div>
                <Input value={form.bom_no} onChange={(e) => upd("bom_no", e.target.value)} className={`${inputCls} font-mono`} placeholder="mis. BOM001-07-2026" data-testid="ecn-bom-no" />
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">No. SO</div>
              <Input value={form.so_no} onChange={(e) => upd("so_no", e.target.value)} className={`${inputCls} font-mono`} placeholder="SO terkait" data-testid="ecn-so" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Customer</div>
              <Input value={form.customer_name} onChange={(e) => upd("customer_name", e.target.value)} className={inputCls} placeholder="Nama customer" data-testid="ecn-customer" />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Alasan Perubahan *</div>
            <Input value={form.reason} onChange={(e) => upd("reason", e.target.value)} className={inputCls} placeholder="Kenapa perlu diubah?" data-testid="ecn-reason" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Detail Perubahan *</div>
            <textarea value={form.description} onChange={(e) => upd("description", e.target.value)} rows={4} className="w-full border border-slate-300 rounded-none p-2 text-sm" placeholder="Jelaskan perubahan yang diminta (dimensi, material, qty, dsb.)" data-testid="ecn-desc" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
            <Button onClick={() => save(false)} disabled={busy} variant="outline" className="rounded-none" data-testid="ecn-save-draft">Simpan Draft</Button>
            <Button onClick={() => save(true)} disabled={busy} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white" data-testid="ecn-save-submit">
              <PaperPlaneRight size={14} weight="bold" className="mr-1" /> Submit ke Eng Leader
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ECNReviewDialog({ ecn, onClose, onDone }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (action) => {
    setBusy(true);
    try {
      await api.post(`/ecn/${ecn.id}/review`, { action, notes });
      toast.success(action === "approve" ? "✓ ECN di-approve" : "ECN ditolak");
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal");
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" data-testid="ecn-review-dialog">
      <Card className="rounded-none border-slate-300 w-full max-w-lg bg-white">
        <div className="px-4 py-3 bg-indigo-700 text-white">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Review ECN</div>
          <div className="font-mono font-bold">{ecn.ecn_no}</div>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div><b>Jenis:</b> {TYPE_LABEL[ecn.change_type]} · <b>Target:</b> {ecn.drawing_no || ecn.bom_no || "-"} · <b>SO:</b> {ecn.so_no || "-"}</div>
          <div><b>Alasan:</b> {ecn.reason}</div>
          <div className="bg-slate-50 border border-slate-200 p-2 whitespace-pre-wrap"><b>Detail:</b> {ecn.description}</div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Catatan Review (opsional)</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-slate-300 rounded-none p-2 text-sm" data-testid="ecn-review-notes" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
            <Button onClick={() => act("reject")} disabled={busy} className="rounded-none bg-rose-600 hover:bg-rose-700 text-white" data-testid="ecn-reject-btn"><XCircle size={14} className="mr-1" /> Tolak</Button>
            <Button onClick={() => act("approve")} disabled={busy} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="ecn-approve-btn"><CheckCircle size={14} className="mr-1" /> Approve</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
