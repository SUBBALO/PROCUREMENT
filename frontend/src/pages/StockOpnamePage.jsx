import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { ClipboardText, MagnifyingGlass, Plus, Trash, X, CheckCircle, WarningCircle, ArrowLeft, FloppyDisk, Stamp } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth, isAdminLike, canSeeStorePrices } from "../lib/auth";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const STATUS_BADGE = {
  draft: "bg-amber-100 text-amber-800 border-amber-300",
  finalized: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

export default function StockOpnamePage() {
  const { user } = useAuth();
  const canWrite = isAdminLike(user) || user?.role === "store";
  const showPrice = canSeeStorePrices(user);

  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // detail session doc
  const [createOpen, setCreateOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/store/opname", { params: { page: 1, page_size: 50 } });
      setSessions(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat daftar opname");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openDetail = async (sid) => {
    try {
      const { data } = await api.get(`/store/opname/${sid}`);
      setSelected(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membuka sesi");
    }
  };

  const deleteDraft = async (s) => {
    if (!window.confirm(`Hapus draft opname ${s.opname_no}?`)) return;
    try {
      await api.delete(`/store/opname/${s.id}`);
      toast.success("Draft dihapus");
      loadList();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  if (selected) {
    return (
      <OpnameDetail
        session={selected}
        canWrite={canWrite}
        showPrice={showPrice}
        onBack={() => { setSelected(null); loadList(); }}
        onReload={() => openDetail(selected.id)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Stock Opname
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hitung fisik vs sistem, lalu finalisasi untuk membuat penyesuaian selisih otomatis. Total <b className="text-slate-900">{total}</b> sesi.
          </p>
        </div>
        {canWrite && (
          <Button
            data-testid="opname-new-btn"
            onClick={() => setCreateOpen(true)}
            className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-bold"
          >
            <Plus size={14} weight="bold" className="mr-1.5" /> Mulai Opname Baru
          </Button>
        )}
      </div>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
              <th className="text-left p-2.5">No. Opname</th>
              <th className="text-left p-2.5">Tanggal</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Hasil</th>
              <th className="text-left p-2.5">Petugas</th>
              <th className="text-left p-2.5">Catatan</th>
              <th className="text-center p-2.5 w-24">Aksi</th>
            </tr>
          </thead>
          <tbody data-testid="opname-list">
            {loading && (<tr><td colSpan={7} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
            {!loading && sessions.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                <ClipboardText size={22} weight="duotone" className="inline-block mr-2 text-slate-300" />
                Belum ada sesi opname. Klik "Mulai Opname Baru" untuk memulai audit gudang.
              </td></tr>
            )}
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`opname-row-${s.opname_no}`}>
                <td className="p-2.5 font-mono font-semibold text-slate-900">
                  <button onClick={() => openDetail(s.id)} className="hover:text-sky-700 hover:underline" data-testid={`opname-open-${s.opname_no}`}>
                    {s.opname_no}
                  </button>
                </td>
                <td className="p-2.5 text-slate-600 whitespace-nowrap">{s.opname_date ? formatDateID(s.opname_date) : "-"}</td>
                <td className="p-2.5">
                  <span className={`text-[9px] uppercase tracking-[0.05em] font-bold px-1.5 py-0.5 border ${STATUS_BADGE[s.status] || "bg-slate-100 text-slate-700 border-slate-300"}`}>
                    {s.status === "draft" ? "Draft" : "Finalized"}
                  </span>
                </td>
                <td className="p-2.5 text-xs text-slate-600">
                  {s.summary
                    ? <>Dihitung {s.summary.counted} · Cocok {s.summary.matched} · <span className="text-emerald-700 font-semibold">+{s.summary.plus_items}</span> / <span className="text-red-700 font-semibold">−{s.summary.minus_items}</span></>
                    : <span className="text-slate-400 italic">Belum difinalisasi</span>}
                </td>
                <td className="p-2.5 text-xs text-slate-600">{s.finalized_by_username || s.created_by_username || "-"}</td>
                <td className="p-2.5 text-xs text-slate-500 max-w-[200px] truncate" title={s.note}>{s.note || "-"}</td>
                <td className="p-2.5 text-center">
                  <div className="inline-flex gap-1">
                    <Button variant="outline" onClick={() => openDetail(s.id)} className="rounded-none h-7 px-2 text-[10px] uppercase tracking-[0.05em] font-bold" data-testid={`opname-detail-${s.opname_no}`}>
                      Buka
                    </Button>
                    {canWrite && s.status === "draft" && (
                      <button onClick={() => deleteDraft(s)} className="p-1.5 hover:bg-red-100 text-red-600" title="Hapus draft" data-testid={`opname-del-${s.opname_no}`}>
                        <Trash size={13} weight="bold" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {createOpen && <CreateOpnameDialog onClose={() => setCreateOpen(false)} onCreated={(doc) => { setCreateOpen(false); setSelected(doc); }} />}
    </div>
  );
}

// -------------------- Create Dialog --------------------
function CreateOpnameDialog({ onClose, onCreated }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/store/opname", { opname_date: date, note, include_empty: includeEmpty });
      toast.success(`Sesi opname dibuat: ${data.opname_no} (${(data.items || []).length} item)`);
      onCreated(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membuat sesi");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none max-w-md" data-testid="opname-create-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardText size={18} weight="bold" className="text-sky-600" /> Mulai Opname Baru
          </DialogTitle>
          <DialogDescription>
            Sistem akan mengambil snapshot qty seluruh item stok saat ini sebagai dasar penghitungan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Opname</Label>
            <Input data-testid="opname-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-none border-slate-300" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Catatan (opsional)</Label>
            <Input data-testid="opname-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 rounded-none border-slate-300" placeholder="Contoh: Opname triwulan Q1" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input data-testid="opname-include-empty" type="checkbox" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} className="accent-sky-600" />
            Ikutkan item stok 0 (untuk temuan barang yang tidak tercatat)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-bold">
            <X size={14} weight="bold" className="mr-1" /> Batal
          </Button>
          <Button data-testid="opname-create-submit" onClick={create} disabled={saving} className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-bold">
            {saving ? "Membuat..." : "Buat Sesi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Detail / Counting View --------------------
function OpnameDetail({ session, canWrite, showPrice, onBack, onReload }) {
  const isDraft = session.status === "draft";
  const [lines, setLines] = useState(session.items || []);
  const [q, setQ] = useState("");
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  useEffect(() => { setLines(session.items || []); }, [session]);

  const setLine = (idx, patch) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return lines
      .map((l, idx) => ({ ...l, _idx: idx }))
      .filter((l) => {
        if (kw && !l.item_name.toLowerCase().includes(kw)) return false;
        if (onlyUncounted && l.physical_qty !== null && l.physical_qty !== "" && l.physical_qty !== undefined) return false;
        return true;
      });
  }, [lines, q, onlyUncounted]);

  const pag = usePagination(filtered, 30);

  const stats = useMemo(() => {
    let counted = 0, plus = 0, minus = 0, match = 0;
    for (const l of lines) {
      const pq = l.physical_qty;
      if (pq === null || pq === "" || pq === undefined) continue;
      counted += 1;
      const diff = Number(pq) - Number(l.system_qty || 0);
      if (Math.abs(diff) < 1e-9) match += 1;
      else if (diff > 0) plus += 1;
      else minus += 1;
    }
    return { counted, plus, minus, match, skipped: lines.length - counted };
  }, [lines]);

  const saveDraft = async (silent = false) => {
    setSaving(true);
    try {
      const payload = {
        lines: lines.map((l) => ({
          item_name: l.item_name,
          is_customer_material: !!l.is_customer_material,
          physical_qty: (l.physical_qty === "" || l.physical_qty === null || l.physical_qty === undefined) ? null : Number(l.physical_qty),
          note: l.note || "",
        })),
      };
      await api.put(`/store/opname/${session.id}`, payload);
      if (!silent) toast.success("Hasil hitung tersimpan");
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
      return false;
    } finally { setSaving(false); }
  };

  const diffOf = (l) => {
    const pq = l.physical_qty;
    if (pq === null || pq === "" || pq === undefined) return null;
    return Number(pq) - Number(l.system_qty || 0);
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] font-bold text-slate-500 hover:text-slate-900 border border-slate-300 px-3 py-1.5 bg-white hover:bg-slate-50" data-testid="opname-back-btn">
        <ArrowLeft size={13} weight="bold" /> Daftar Opname
      </button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <ClipboardText size={22} weight="duotone" className="text-sky-600" />
            <span className="font-mono">{session.opname_no}</span>
            <span className={`text-[9px] uppercase tracking-[0.05em] font-bold px-1.5 py-0.5 border ${STATUS_BADGE[session.status]}`}>
              {isDraft ? "Draft" : "Finalized"}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tanggal {session.opname_date ? formatDateID(session.opname_date) : "-"} · {lines.length} item
            {session.note ? <> · {session.note}</> : null}
            {!isDraft && session.finalized_by_username ? <> · difinalisasi oleh <b>{session.finalized_by_username}</b></> : null}
          </p>
        </div>
        {isDraft && canWrite && (
          <div className="flex items-center gap-2">
            <Button data-testid="opname-save-btn" variant="outline" onClick={() => saveDraft()} disabled={saving} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-bold border-slate-400">
              <FloppyDisk size={14} weight="bold" className="mr-1.5" /> {saving ? "Menyimpan..." : "Simpan Draft"}
            </Button>
            <Button
              data-testid="opname-finalize-btn"
              onClick={async () => { if (await saveDraft(true)) setFinalizeOpen(true); }}
              disabled={saving || stats.counted === 0}
              className="rounded-none h-9 bg-emerald-700 hover:bg-emerald-800 text-white text-xs uppercase tracking-[0.1em] font-bold"
            >
              <Stamp size={14} weight="bold" className="mr-1.5" /> Finalisasi
            </Button>
          </div>
        )}
      </div>

      {/* Ringkasan berjalan */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        <div className="border border-slate-300 bg-slate-50 px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-600">Dihitung</div>
          <div className="text-base font-bold text-slate-900 tabular-nums" data-testid="opname-stat-counted">{stats.counted} / {lines.length}</div>
        </div>
        <div className="border border-slate-200 bg-white px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Cocok</div>
          <div className="text-base font-bold text-slate-700 tabular-nums">{stats.match}</div>
        </div>
        <div className="border border-emerald-200 bg-emerald-50 px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-emerald-700">Selisih Lebih (+)</div>
          <div className="text-base font-bold text-emerald-900 tabular-nums">{stats.plus}</div>
        </div>
        <div className="border border-red-200 bg-red-50 px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-red-700">Selisih Kurang (−)</div>
          <div className="text-base font-bold text-red-900 tabular-nums">{stats.minus}</div>
        </div>
        <div className="border border-slate-200 bg-white px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Dilewati</div>
          <div className="text-base font-bold text-slate-500 tabular-nums">{stats.skipped}</div>
        </div>
      </div>

      {/* Hasil finalize */}
      {!isDraft && session.summary && (
        <Card className="rounded-none border-emerald-300 bg-emerald-50/60 shadow-none p-3" data-testid="opname-summary">
          <div className="flex items-center gap-2 text-sm text-emerald-900 font-semibold mb-1">
            <CheckCircle size={16} weight="fill" className="text-emerald-600" /> Hasil Finalisasi
          </div>
          <div className="text-xs text-emerald-900">
            {session.summary.counted} item dihitung · {session.summary.matched} cocok ·{" "}
            <b className="text-emerald-700">{session.summary.plus_items} penyesuaian masuk (+{Number(session.summary.total_qty_plus).toLocaleString("id-ID")})</b> ·{" "}
            <b className="text-red-700">{session.summary.minus_items} penyesuaian keluar (−{Number(session.summary.total_qty_minus).toLocaleString("id-ID")})</b> ·{" "}
            {session.summary.skipped} dilewati. Semua penyesuaian tercatat di riwayat item sebagai "STOCK OPNAME".
          </div>
        </Card>
      )}

      {/* Filter bar */}
      <Card className="rounded-none border-slate-200 shadow-none p-3 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="opname-search" className="h-8 pl-8 rounded-none border-slate-300 text-xs" placeholder="Cari nama barang..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isDraft && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input data-testid="opname-only-uncounted" type="checkbox" checked={onlyUncounted} onChange={(e) => setOnlyUncounted(e.target.checked)} className="accent-sky-600" />
              Hanya yang belum dihitung
            </label>
          )}
          <div className="ml-auto text-xs text-slate-500">{filtered.length} item ditampilkan</div>
        </div>
      </Card>

      {/* Tabel hitung */}
      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-2">Nama Barang</th>
                <th className="text-left p-2 w-16">Satuan</th>
                <th className="text-right p-2 w-28">Qty Sistem</th>
                <th className="text-right p-2 w-32">Qty Fisik</th>
                <th className="text-right p-2 w-24">Selisih</th>
                <th className="text-left p-2 w-52">Catatan</th>
              </tr>
            </thead>
            <tbody data-testid="opname-lines">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-400">Tidak ada item.</td></tr>
              )}
              {pag.pagedData.map((l) => {
                const diff = diffOf(l);
                const sysQty = !isDraft && l.system_qty_final !== undefined ? l.system_qty_final : l.system_qty;
                const finalDiff = !isDraft && l.diff !== undefined ? l.diff : diff;
                return (
                  <tr key={`${l.item_name}|${l.is_customer_material}`} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`opname-line-${l.item_name.replace(/\s+/g, "-")}`}>
                    <td className="p-2 text-slate-900 font-medium max-w-[320px]">
                      {l.item_name}
                      {l.is_customer_material && <span className="ml-1.5 px-1 py-0.5 bg-violet-100 text-violet-800 border border-violet-300 text-[8px] font-bold uppercase">CUST</span>}
                    </td>
                    <td className="p-2 text-slate-500 text-xs">{l.unit || "-"}</td>
                    <td className="p-2 text-right tabular-nums text-slate-700">{Number(sysQty || 0).toLocaleString("id-ID")}</td>
                    <td className="p-2 text-right">
                      {isDraft && canWrite ? (
                        <Input
                          data-testid={`opname-phys-${l.item_name.replace(/\s+/g, "-")}`}
                          type="number" min="0" step="0.01"
                          value={l.physical_qty ?? ""}
                          onChange={(e) => setLine(l._idx, { physical_qty: e.target.value === "" ? null : e.target.value })}
                          className="h-7 rounded-none border-slate-300 text-right text-xs tabular-nums w-28 ml-auto"
                          placeholder="—"
                        />
                      ) : (
                        <span className="tabular-nums font-semibold text-slate-900">
                          {l.physical_qty !== null && l.physical_qty !== undefined ? Number(l.physical_qty).toLocaleString("id-ID") : <span className="text-slate-300">—</span>}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums font-bold">
                      {finalDiff === null || finalDiff === undefined
                        ? <span className="text-slate-300">—</span>
                        : Math.abs(finalDiff) < 1e-9
                          ? <span className="text-slate-400">0</span>
                          : finalDiff > 0
                            ? <span className="text-emerald-700">+{Number(finalDiff).toLocaleString("id-ID")}</span>
                            : <span className="text-red-700">{Number(finalDiff).toLocaleString("id-ID")}</span>}
                    </td>
                    <td className="p-2">
                      {isDraft && canWrite ? (
                        <Input
                          data-testid={`opname-linenote-${l.item_name.replace(/\s+/g, "-")}`}
                          value={l.note || ""}
                          onChange={(e) => setLine(l._idx, { note: e.target.value })}
                          className="h-7 rounded-none border-slate-200 text-xs"
                          placeholder="mis. rusak / hilang / salah rak"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">{l.note || "-"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="item" testIdPrefix="opname-pag" />
      </Card>

      {/* Daftar penyesuaian (setelah finalize) */}
      {!isDraft && (session.adjustments || []).length > 0 && (
        <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] font-bold text-slate-600">
            Penyesuaian yang Dibuat ({session.adjustments.length})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-2">Barang</th>
                <th className="text-left p-2 w-20">Jenis</th>
                <th className="text-right p-2 w-24">Qty</th>
                {showPrice && <th className="text-right p-2 w-32">Nilai (Rp)</th>}
              </tr>
            </thead>
            <tbody data-testid="opname-adjustments">
              {session.adjustments.map((a, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="p-2 text-slate-900">{a.item_name}</td>
                  <td className="p-2">
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 border ${a.kind === "IN" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-100 text-red-800 border-red-300"}`}>
                      {a.kind === "IN" ? "Masuk (+)" : "Keluar (−)"}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">{Number(a.qty).toLocaleString("id-ID")} <span className="text-xs text-slate-400">{a.unit}</span></td>
                  {showPrice && <td className="p-2 text-right tabular-nums text-xs text-slate-600">{a.total_value ? `Rp ${Number(a.total_value).toLocaleString("id-ID")}` : "-"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {finalizeOpen && (
        <FinalizeDialog
          session={session}
          stats={stats}
          onClose={() => setFinalizeOpen(false)}
          onDone={() => { setFinalizeOpen(false); onReload(); }}
        />
      )}
    </div>
  );
}

// -------------------- Finalize Double-Confirm Dialog --------------------
function FinalizeDialog({ session, stats, onClose, onDone }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const doFinalize = async () => {
    setBusy(true);
    try {
      await api.post(`/store/opname/${session.id}/finalize`, { confirm: confirmText.trim() });
      toast.success("Opname difinalisasi — penyesuaian stok telah dibuat");
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal finalisasi");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none max-w-md" data-testid="opname-finalize-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <WarningCircle size={18} weight="fill" /> Finalisasi Opname {session.opname_no}?
          </DialogTitle>
          <DialogDescription>
            Tindakan ini membuat transaksi penyesuaian stok dan <b>tidak bisa dibatalkan</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="text-xs text-slate-700 space-y-1 border border-slate-200 bg-slate-50 p-3">
          <div>• Item dihitung: <b>{stats.counted}</b> (dilewati: {stats.skipped})</div>
          <div>• Cocok (tanpa penyesuaian): <b>{stats.match}</b></div>
          <div>• Akan dibuat penyesuaian <b className="text-emerald-700">MASUK: {stats.plus} item</b> dan <b className="text-red-700">KELUAR: {stats.minus} item</b></div>
          <div className="text-slate-500 italic pt-1">Catatan: selisih dihitung ulang terhadap qty sistem TERBARU saat finalisasi.</div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Ketik <span className="font-mono text-red-700">OPNAME-FINAL</span> untuk konfirmasi</Label>
          <Input data-testid="opname-confirm-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="h-9 rounded-none border-slate-300 font-mono" placeholder="OPNAME-FINAL" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-bold">
            <X size={14} weight="bold" className="mr-1" /> Batal
          </Button>
          <Button
            data-testid="opname-finalize-confirm"
            onClick={doFinalize}
            disabled={busy || confirmText.trim() !== "OPNAME-FINAL"}
            className="rounded-none h-9 bg-red-700 hover:bg-red-800 text-white text-xs uppercase tracking-[0.1em] font-bold"
          >
            {busy ? "Memproses..." : "Ya, Finalisasi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
