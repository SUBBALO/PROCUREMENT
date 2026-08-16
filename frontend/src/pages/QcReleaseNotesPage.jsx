import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { SealCheck, CheckCircle, XCircle, Package, UploadSimple, Trash, ArrowClockwise } from "@phosphor-icons/react";

const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };

export default function QcReleaseNotesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // release note being reviewed

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/production/frn/pending-qc"); setItems(data.items || []); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 max-w-[1200px] mx-auto space-y-4" data-testid="qc-release-notes-page">
      <BackLink />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-violet-600 mb-1">
            <SealCheck size={14} weight="fill" /> Quality Control
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Release Note — Menunggu Persetujuan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Produksi mengajukan Finished Goods Release Note. QC me-review, lalu <b>Approve (Release)</b> = barang jadi lolos &amp; siap kirim ke Store, atau <b>Tolak</b> = dikembalikan ke Produksi.
          </p>
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9" data-testid="qc-rn-refresh">
          <ArrowClockwise size={14} weight="bold" className="mr-1.5" /> Refresh
        </Button>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          Menunggu Persetujuan — {items.length}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="qc-rn-table">
            <thead>
              <tr className="bg-white border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left font-bold">Tanggal</th>
                <th className="px-3 py-2 text-left font-bold">No. Release</th>
                <th className="px-3 py-2 text-left font-bold">SO No</th>
                <th className="px-3 py-2 text-left font-bold">Customer</th>
                <th className="px-3 py-2 text-left font-bold">Deskripsi Item</th>
                <th className="px-3 py-2 text-center font-bold">Qty</th>
                <th className="px-3 py-2 text-center font-bold w-40">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Memuat…</td></tr>
                : items.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400" data-testid="qc-rn-empty"><Package size={28} className="mx-auto mb-2 text-slate-300" />Tidak ada release note yang menunggu persetujuan.</td></tr>
                : items.map((r, i) => (
                  <tr key={r.id} className="hover:bg-violet-50/40" data-testid={`qc-rn-row-${i}`}>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(r.frn_date)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.release_no}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900">{r.so_no}</td>
                    <td className="px-3 py-2 text-slate-700">{r.customer || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{r.description || "—"}</td>
                    <td className="px-3 py-2 text-center font-bold text-violet-700">{r.qty}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button onClick={() => setActive(r)} data-testid={`qc-rn-review-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-none bg-violet-700 text-white hover:bg-violet-800">
                        <SealCheck size={13} weight="bold" /> Review &amp; TTD
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {active && (
        <ReviewDialog
          rn={active}
          approverName={user?.name || user?.username || ""}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}

function ReviewDialog({ rn, approverName, onClose, onDone }) {
  const [comment, setComment] = useState(rn.qc_comment || "");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("File harus berupa gambar"); return; }
    if (f.size > 1.5 * 1024 * 1024) { toast.error("Ukuran gambar maksimal 1.5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setSignature(reader.result);
    reader.readAsDataURL(f);
  };

  const act = async (action) => {
    if (action === "reject" && !comment.trim()) {
      toast.error("Isi alasan penolakan pada kolom komentar QC.");
      return;
    }
    if (action === "release" && !window.confirm(`Approve & Release ${rn.release_no}? Barang jadi dinyatakan lolos QC dan siap dikirim ke Store.`)) return;
    setBusy(true);
    try {
      await api.post(`/production/frn/${rn.id}/${action}`, { qc_comment: comment.trim(), qc_signature: signature });
      toast.success(action === "release" ? "Approved — barang jadi siap kirim ke Store" : "Ditolak — dikembalikan ke Produksi");
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memproses");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-lg" data-testid="qc-rn-review-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SealCheck size={18} weight="fill" className="text-violet-600" /> Review Release Note</DialogTitle>
          <DialogDescription>Periksa detail barang jadi, beri komentar QC bila perlu, lalu Approve atau Tolak.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="No. Release" value={rn.release_no} mono />
            <Field label="Tanggal" value={fmtDate(rn.frn_date)} />
            <Field label="SO No" value={rn.so_no} mono />
            <Field label="Customer" value={rn.customer || "—"} />
            <div className="col-span-2"><Field label="Deskripsi Item" value={rn.description || "—"} /></div>
            <Field label="Qty" value={String(rn.qty)} />
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Komentar QC <span className="text-slate-400 font-normal">(wajib bila menolak)</span></Label>
            <Textarea data-testid="qc-rn-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="rounded-none text-sm" placeholder="Catatan hasil pemeriksaan QC…" />
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanda Tangan (opsional — upload gambar)</Label>
            {signature ? (
              <div className="flex items-center gap-3">
                <img src={signature} alt="Tanda tangan QC" className="h-16 border border-slate-200 bg-white object-contain" data-testid="qc-rn-signature-preview" />
                <Button type="button" variant="outline" onClick={() => setSignature("")} className="rounded-none h-8 text-rose-600 border-rose-200 hover:bg-rose-50" data-testid="qc-rn-signature-clear">
                  <Trash size={13} weight="bold" className="mr-1" /> Hapus
                </Button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 px-3 h-9 border border-dashed border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50" data-testid="qc-rn-signature-upload">
                <UploadSimple size={15} weight="bold" /> Pilih gambar tanda tangan
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
            )}
          </div>

          <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
            Disetujui oleh: <b className="text-slate-700">{approverName || "—"}</b> · waktu &amp; tanggal dicatat otomatis saat Approve/Tolak.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none" disabled={busy}>Tutup</Button>
          <Button onClick={() => act("reject")} disabled={busy} className="rounded-none bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200" data-testid="qc-rn-reject-btn">
            <XCircle size={14} weight="bold" className="mr-1.5" /> Tolak
          </Button>
          <Button onClick={() => act("release")} disabled={busy} className="rounded-none bg-emerald-700 text-white hover:bg-emerald-800" data-testid="qc-rn-release-btn">
            <CheckCircle size={14} weight="bold" className="mr-1.5" /> {busy ? "Memproses…" : "Approve & Release"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
      <div className={`text-slate-800 ${mono ? "font-mono font-semibold" : ""}`}>{value}</div>
    </div>
  );
}
