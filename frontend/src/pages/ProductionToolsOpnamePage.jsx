import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import BackLink from "../components/BackLink";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  ClipboardText, Plus, Trash, CheckCircle, XCircle, WarningCircle, LockSimple, ArrowLeft,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const fmtDT = (iso) => {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};
const SYS_LABEL = { available: "Tersedia", borrowed: "Dipinjam", missing: "Hilang", maintenance: "Rusak/Servis" };

export default function ProductionToolsOpnamePage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // sesi aktif dibuka
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [delTarget, setDelTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/production/tools-opname"); setSessions(data.items || []); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat sesi opname"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createSession = async () => {
    setCreating(true);
    try {
      const { data } = await api.post("/production/tools-opname", { title });
      toast.success(`Sesi ${data.opname_no} dibuat — ${data.summary.total} alat siap dicek`);
      setCreateOpen(false); setTitle("");
      setDetail(data);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal membuat sesi"); }
    finally { setCreating(false); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/production/tools-opname/${delTarget.id}`);
      toast.success("Sesi draft dihapus");
      setDelTarget(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); }
  };

  const openDetail = async (s) => {
    try { const { data } = await api.get(`/production/tools-opname/${s.id}`); setDetail(data); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal membuka sesi"); }
  };

  if (detail) {
    return <OpnameDetail session={detail} onBack={() => { setDetail(null); load(); }} onRefresh={(d) => setDetail(d)} />;
  }

  return (
    <div className="space-y-4" data-testid="tools-opname-page">
      <BackLink />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-50 border border-amber-200 text-amber-700"><ClipboardText size={22} weight="duotone" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Stok Opname Alat</h1>
            <p className="text-sm text-slate-500">Cek fisik berkala inventory tools — alat yang tidak ketemu otomatis ditandai HILANG saat finalisasi.</p>
          </div>
        </div>
        <Button data-testid="opname-create-btn" onClick={() => setCreateOpen(true)} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white h-9">
          <Plus size={14} weight="bold" className="mr-1.5" /> Mulai Opname Baru
        </Button>
      </div>

      <Card className="rounded-none border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-400">Memuat…</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada sesi opname. Klik <b>Mulai Opname Baru</b> — sistem akan snapshot semua alat untuk dicek fisik.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["No. Opname", "Judul", "Dibuat", "Oleh", "Progress Cek", "Tidak Ketemu", "Status", "Aksi"].map((h) => (
                  <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`opname-row-${s.opname_no}`}>
                  <td className="p-2 font-mono text-[11px] font-semibold text-slate-700">{s.opname_no}</td>
                  <td className="p-2 text-slate-800">{s.title}</td>
                  <td className="p-2 text-slate-600 whitespace-nowrap">{fmtDT(s.created_at)}</td>
                  <td className="p-2 text-slate-600">{s.created_by}</td>
                  <td className="p-2 tabular-nums text-slate-700">{s.summary.checked}/{s.summary.total} alat</td>
                  <td className="p-2">{s.summary.not_found > 0 ? <span className="text-red-600 font-bold tabular-nums">{s.summary.not_found}</span> : <span className="text-slate-400">0</span>}</td>
                  <td className="p-2">
                    {s.status === "finalized" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-slate-800 text-white"><LockSimple size={11} weight="fill" /> Final</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-300">Draft</span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      <Button data-testid={`opname-open-${s.opname_no}`} variant="outline" onClick={() => openDetail(s)} className="rounded-none h-7 px-2 text-[11px]">
                        {s.status === "finalized" ? "Lihat" : "Lanjut Cek"}
                      </Button>
                      {s.status !== "finalized" && (
                        <Button variant="outline" onClick={() => setDelTarget(s)} className="rounded-none h-7 px-2 border-red-300 text-red-600 hover:bg-red-50"><Trash size={12} weight="bold" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle>Mulai Opname Baru</DialogTitle>
            <DialogDescription>Sistem akan snapshot seluruh inventory alat saat ini untuk dicek fisik satu per satu.</DialogDescription>
          </DialogHeader>
          <div><Label className="text-[11px] font-semibold">Judul (opsional)</Label>
            <Input data-testid="opname-form-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Opname bulanan Februari…" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-none">Batal</Button>
            <Button data-testid="opname-form-create" onClick={createSession} disabled={creating} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">{creating ? "Membuat…" : "Buat Sesi"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Hapus Sesi Draft</DialogTitle>
            <DialogDescription>Sesi <b>{delTarget?.opname_no}</b> beserta hasil ceknya akan dihapus. Lanjutkan?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} className="rounded-none">Batal</Button>
            <Button data-testid="opname-delete-confirm" onClick={doDelete} className="rounded-none bg-red-600 hover:bg-red-700 text-white">Ya, Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpnameDetail({ session, onBack, onRefresh }) {
  const [items, setItems] = useState(session.items || []);
  const [saving, setSaving] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const locked = session.status === "finalized";

  const counts = {
    total: items.length,
    found: items.filter((i) => i.physical === "found").length,
    not_found: items.filter((i) => i.physical === "not_found").length,
    pending: items.filter((i) => i.physical !== "found" && i.physical !== "not_found").length,
  };

  const setPhysical = (toolId, physical) => {
    setItems((prev) => prev.map((i) => (i.tool_id === toolId ? { ...i, physical } : i)));
  };
  const setNote = (toolId, note) => {
    setItems((prev) => prev.map((i) => (i.tool_id === toolId ? { ...i, note } : i)));
  };

  const save = async (silent = false) => {
    setSaving(true);
    try {
      const { data } = await api.put(`/production/tools-opname/${session.id}`, {
        items: items.map((i) => ({ tool_id: i.tool_id, physical: i.physical, note: i.note || "" })),
      });
      if (!silent) toast.success("Hasil cek tersimpan");
      onRefresh(data);
      return true;
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); return false; }
    finally { setSaving(false); }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const ok = await save(true);
      if (!ok) return;
      const { data } = await api.post(`/production/tools-opname/${session.id}/finalize`, { confirm_phrase: phrase });
      toast.success(`Opname difinalisasi — ${data.changes.length} perubahan status alat`);
      setFinalOpen(false);
      onRefresh(data);
      setItems(data.items || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal finalisasi"); }
    finally { setFinalizing(false); }
  };

  return (
    <div className="space-y-4" data-testid="opname-detail">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] font-semibold text-slate-500 hover:text-slate-800" data-testid="opname-back-btn">
        <ArrowLeft size={13} weight="bold" /> Daftar Sesi Opname
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            {session.opname_no} — {session.title}
            {locked && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-slate-800 text-white"><LockSimple size={11} weight="fill" /> Final</span>}
          </h1>
          <p className="text-xs text-slate-500">Dibuat {fmtDT(session.created_at)} oleh {session.created_by}{locked ? ` · Difinalisasi ${fmtDT(session.finalized_at)} oleh ${session.finalized_by}` : ""}</p>
        </div>
        {!locked && (
          <div className="flex gap-2">
            <Button data-testid="opname-save-btn" variant="outline" onClick={() => save()} disabled={saving} className="rounded-none h-9">{saving ? "Menyimpan…" : "Simpan Hasil Cek"}</Button>
            <Button data-testid="opname-finalize-btn" onClick={() => setFinalOpen(true)} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white h-9">Finalisasi</Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Alat", n: counts.total, cls: "text-slate-800" },
          { label: "Ada / Ketemu", n: counts.found, cls: "text-emerald-700" },
          { label: "Tidak Ketemu", n: counts.not_found, cls: "text-red-700" },
          { label: "Belum Dicek", n: counts.pending, cls: "text-amber-700" },
        ].map((c) => (
          <Card key={c.label} className="rounded-none border-slate-200 p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">{c.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${c.cls}`}>{c.n}</div>
          </Card>
        ))}
      </div>

      {/* Perubahan hasil finalisasi */}
      {locked && (session.changes || []).length > 0 && (
        <Card className="rounded-none border-amber-300 bg-amber-50/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-amber-700 mb-1.5 flex items-center gap-1.5"><WarningCircle size={13} weight="fill" /> Perubahan Status Saat Finalisasi</div>
          <ul className="text-xs text-slate-700 space-y-0.5">
            {session.changes.map((c, i) => (
              <li key={i} data-testid={`opname-change-${c.tool_code}`}>
                <b className="font-mono text-[11px]">{c.tool_code}</b> {c.name} — {c.action === "marked_missing" ? <>ditandai <b className="text-red-700">HILANG</b>{c.last_holder ? ` (pemegang terakhir: ${c.last_holder})` : ""}</> : <>ditemukan → <b className="text-emerald-700">TERSEDIA</b></>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Item table */}
      <Card className="rounded-none border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {["Kode", "Nama Alat", "Lokasi", "Status Sistem", "Pemegang", "Cek Fisik", "Catatan"].map((h) => (
                <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-slate-500 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.tool_id} className={`border-b border-slate-100 ${it.physical === "not_found" ? "bg-red-50/60" : it.physical === "found" ? "bg-emerald-50/40" : ""}`} data-testid={`opname-item-${it.tool_code}`}>
                <td className="p-2 font-mono text-[11px] text-slate-700">{it.tool_code}</td>
                <td className="p-2 font-semibold text-slate-800">{it.name}<span className="ml-1 font-normal text-slate-400">{it.brand}</span></td>
                <td className="p-2 text-slate-600">{it.location || "-"}</td>
                <td className="p-2 text-slate-600">{SYS_LABEL[it.system_status] || it.system_status}</td>
                <td className="p-2 text-slate-600">{it.holder_name || "-"}</td>
                <td className="p-2 whitespace-nowrap">
                  {locked ? (
                    it.physical === "found" ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle size={13} weight="fill" /> Ada</span>
                      : it.physical === "not_found" ? <span className="inline-flex items-center gap-1 text-red-700 font-bold"><XCircle size={13} weight="fill" /> Tidak Ketemu</span>
                        : <span className="text-slate-400">Dilewati</span>
                  ) : (
                    <div className="flex gap-1">
                      <button data-testid={`opname-found-${it.tool_code}`} onClick={() => setPhysical(it.tool_id, it.physical === "found" ? "pending" : "found")}
                        className={`px-2 py-1 text-[10px] font-bold uppercase border transition-colors ${it.physical === "found" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-300 text-slate-600 hover:bg-emerald-50"}`}>
                        <CheckCircle size={11} weight="bold" className="inline mr-0.5 -mt-0.5" /> Ada
                      </button>
                      <button data-testid={`opname-notfound-${it.tool_code}`} onClick={() => setPhysical(it.tool_id, it.physical === "not_found" ? "pending" : "not_found")}
                        className={`px-2 py-1 text-[10px] font-bold uppercase border transition-colors ${it.physical === "not_found" ? "bg-red-600 text-white border-red-600" : "bg-white border-slate-300 text-slate-600 hover:bg-red-50"}`}>
                        <XCircle size={11} weight="bold" className="inline mr-0.5 -mt-0.5" /> Tidak Ada
                      </button>
                    </div>
                  )}
                </td>
                <td className="p-2">
                  {locked ? <span className="text-slate-600">{it.note || "-"}</span> : (
                    <Input value={it.note || ""} onChange={(e) => setNote(it.tool_id, e.target.value)} className="h-7 rounded-none text-xs w-48" placeholder="Catatan…" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Finalize dialog */}
      <Dialog open={finalOpen} onOpenChange={setFinalOpen}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Finalisasi Opname</DialogTitle>
            <DialogDescription>
              <span className="block mb-2">Ringkasan: <b className="text-emerald-700">{counts.found} ada</b> · <b className="text-red-700">{counts.not_found} tidak ketemu</b> · {counts.pending} dilewati.</span>
              {counts.not_found > 0 && <span className="block mb-2 text-red-700 font-semibold">{counts.not_found} alat yang tidak ketemu akan otomatis ditandai HILANG.</span>}
              Alat berstatus hilang yang dicentang "Ada" akan kembali TERSEDIA. Sesi terkunci setelah finalisasi. Ketik <b>OPNAME-FINAL</b> untuk konfirmasi.
            </DialogDescription>
          </DialogHeader>
          <Input data-testid="opname-final-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={inputCls} placeholder="OPNAME-FINAL" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalOpen(false)} className="rounded-none">Batal</Button>
            <Button data-testid="opname-final-confirm" onClick={finalize} disabled={finalizing || phrase !== "OPNAME-FINAL"} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">
              {finalizing ? "Memproses…" : "Finalisasi Sekarang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
