import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { tryAutocomplete } from "../lib/autocomplete";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Plus, Trash, ArrowUp, FloppyDisk, ChatCircleDots } from "@phosphor-icons/react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const emptyRow = () => ({ item_name: "", qty: "", so_number: "", taker_name: "", issue_date: today(), note: "" });

export default function StoreIssuePage() {
  const { user } = useAuth();
  const canSeePrice = user?.role === "admin" || (user?.perms || []).includes("view_store_report");

  const [rows, setRows] = useState([emptyRow()]);
  const [stock, setStock] = useState([]);
  const [recent, setRecent] = useState([]);
  const [sos, setSos] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadStock = useCallback(async () => {
    try { const { data } = await api.get("/store/stock"); setStock(data); }
    catch { toast.error("Gagal memuat stok"); }
  }, []);
  const loadRecent = useCallback(async () => {
    try { const { data } = await api.get("/store/issuances", { params: { page: 1, page_size: 10 } }); setRecent(data.items || []); } catch {}
  }, []);
  useEffect(() => { loadStock(); loadRecent(); }, [loadStock, loadRecent]);
  useEffect(() => { api.get("/sales-orders").then((r) => setSos(r.data || [])).catch(() => {}); }, []);

  const soOptions = useMemo(() => sos.map((s) => s.so_no), [sos]);
  const stockOptions = useMemo(() => stock.map((s) => s.item_name), [stock]);

  const stockIndex = useMemo(() => {
    const m = new Map();
    for (const s of stock) m.set(s.item_name, s);
    return m;
  }, [stock]);

  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = (focus = true) => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      // Copy taker+date from last row for convenience
      const next = { ...emptyRow(), taker_name: last?.taker_name || "", issue_date: last?.issue_date || today(), so_number: last?.so_number || "" };
      return [...prev, next];
    });
    if (focus) {
      setTimeout(() => {
        const el = document.querySelector(`[data-testid="issue-item-${rows.length}"]`);
        if (el) el.focus();
      }, 30);
    }
  };
  const removeRow = (i) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const onRowKeyDown = (e, i, field) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = ["issue-item", "issue-qty", "issue-so", "issue-taker", "issue-date"];
    const curIdx = order.indexOf(field);
    if (curIdx < 0) return;
    if (curIdx < order.length - 1) {
      const nextTestId = `${order[curIdx + 1]}-${i}`;
      const el = document.querySelector(`[data-testid="${nextTestId}"]`);
      if (el) el.focus();
    } else {
      if (i === rows.length - 1) {
        if (rows[i].item_name && rows[i].qty) addRow();
      } else {
        const el = document.querySelector(`[data-testid="issue-item-${i + 1}"]`);
        if (el) el.focus();
      }
    }
  };

  const validRows = rows.filter((r) => r.item_name && Number(r.qty) > 0);
  const totalQty = validRows.reduce((s, r) => s + Number(r.qty || 0), 0);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (validRows.length === 0) return toast.error("Minimal 1 baris terisi (Nama Barang & Qty)");
    for (const r of validRows) {
      if (!r.taker_name.trim()) return toast.error("Nama Pengambil wajib diisi di semua baris");
      const s = stockIndex.get(r.item_name);
      if (!s) return toast.error(`Barang "${r.item_name}" tidak ada di stok`);
      if (Number(r.qty) > s.qty) return toast.error(`${r.item_name}: qty ${r.qty} > stok ${s.qty}`);
    }
    setSaving(true);
    try {
      await api.post("/store/issue/bulk", {
        items: validRows.map((r) => ({
          item_name: r.item_name,
          qty: Number(r.qty),
          so_number: r.so_number || "",
          taker_name: r.taker_name.trim(),
          issue_date: r.issue_date,
          note: r.note || "",
        })),
      });
      toast.success(`${validRows.length} pengeluaran berhasil disimpan`);
      setRows([emptyRow()]);
      loadStock(); loadRecent();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal simpan");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Keluar Barang
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Isi banyak barang sekaligus dalam satu form. Tekan <kbd className="px-1.5 py-0.5 border border-slate-300 bg-slate-50 text-slate-700 text-[10px] rounded">Enter</kbd> untuk pindah kolom / tambah baris. Harga dialokasi FIFO otomatis.
        </p>
      </div>

      <form onSubmit={onSubmit} data-testid="issue-form" className="space-y-4">
        <Card className="rounded-none border-slate-200 shadow-none bg-white">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Daftar Barang Keluar</h3>
            <Button type="button" data-testid="add-issue-row" onClick={() => addRow(true)} variant="outline" size="sm" className="rounded-none h-8 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
              <Plus size={14} weight="bold" className="mr-1.5" /> Tambah Baris
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  <th className="text-left p-2 w-10">#</th>
                  <th className="text-left p-2 min-w-[260px]">Nama Barang</th>
                  <th className="text-right p-2 w-28">Qty</th>
                  <th className="text-left p-2 w-32">Nomor SO</th>
                  <th className="text-left p-2 w-40">Nama Pengambil</th>
                  <th className="text-left p-2 w-40">Tgl Ambil</th>
                  <th className="text-center p-2 w-14"></th>
                </tr>
              </thead>
              <tbody data-testid="issue-rows">
                {rows.map((r, i) => {
                  const s = stockIndex.get(r.item_name);
                  const over = s && Number(r.qty) > s.qty;
                  return (
                    <tr key={i} className={`border-b border-slate-100 ${over ? "bg-red-50" : "hover:bg-slate-50"}`}>
                      <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="p-2">
                        <Input
                          data-testid={`issue-item-${i}`}
                          list="issue-stock-list"
                          autoComplete="off"
                          className={inputCls}
                          value={r.item_name}
                          onChange={(e) => setRow(i, "item_name", e.target.value)}
                          onKeyDown={(e) => {
                            if (tryAutocomplete(e, stockOptions, (v) => setRow(i, "item_name", v))) return;
                            onRowKeyDown(e, i, "issue-item");
                          }}
                          placeholder="Ketik / pilih nama barang..."
                        />
                        {s && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Stok: <b className="tabular-nums text-sky-700">{s.qty} {s.unit}</b>
                            {s.vendors && s.vendors.length > 0 && <> · {s.vendors.join(", ")}</>}
                          </div>
                        )}
                        {r.item_name && !s && <div className="text-[10px] text-red-600 mt-0.5">Barang tidak ada di stok</div>}
                      </td>
                      <td className="p-2">
                        <Input
                          data-testid={`issue-qty-${i}`}
                          type="number" step="any" min="0"
                          className={`${inputCls} text-right tabular-nums`}
                          value={r.qty}
                          onChange={(e) => setRow(i, "qty", e.target.value)}
                          onKeyDown={(e) => onRowKeyDown(e, i, "issue-qty")}
                        />
                        {over && <div className="text-[10px] text-red-600 mt-0.5">Melebihi stok</div>}
                      </td>
                      <td className="p-2">
                        <Input data-testid={`issue-so-${i}`} list="issue-so-list" autoComplete="off" className={inputCls} value={r.so_number} onChange={(e) => setRow(i, "so_number", e.target.value)} onKeyDown={(e) => { if (tryAutocomplete(e, soOptions, (v) => setRow(i, "so_number", v))) return; onRowKeyDown(e, i, "issue-so"); }} placeholder="mis. 4413" />
                      </td>
                      <td className="p-2">
                        <Input data-testid={`issue-taker-${i}`} className={inputCls} value={r.taker_name} onChange={(e) => setRow(i, "taker_name", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "issue-taker")} placeholder="mis. Sahab" />
                      </td>
                      <td className="p-2">
                        <Input data-testid={`issue-date-${i}`} type="date" className={inputCls} value={r.issue_date} onChange={(e) => setRow(i, "issue_date", e.target.value)} onKeyDown={(e) => onRowKeyDown(e, i, "issue-date")} />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          data-testid={`remove-issue-${i}`}
                          onClick={() => removeRow(i)}
                          disabled={rows.length === 1}
                          className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        ><Trash size={16} weight="bold" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-50">
                  <td colSpan={2} className="p-3 text-right text-xs uppercase tracking-[0.1em] font-bold text-slate-600">Total Baris Valid</td>
                  <td className="p-3 text-right tabular-nums font-bold text-slate-900">{validRows.length} baris · {totalQty} qty</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <datalist id="issue-stock-list">
          {stock.map((s) => (<option key={s.item_name} value={s.item_name}>{`Stok: ${s.qty} ${s.unit || ""}`}</option>))}
        </datalist>
        <datalist id="issue-so-list">
          {sos.map((s) => (<option key={s.id} value={s.so_no}>{`${s.customer} — ${s.description || ""}`}</option>))}
        </datalist>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">Grand total qty: <b className="tabular-nums text-slate-900">{totalQty}</b></div>
          <Button
            type="submit"
            data-testid="submit-issue-btn"
            disabled={saving || validRows.length === 0}
            className="h-11 rounded-none bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase tracking-[0.1em] text-xs px-8 active:scale-[0.98]"
          >
            <FloppyDisk size={16} weight="bold" className="mr-2" />
            {saving ? "Menyimpan..." : `Keluarkan ${validRows.length} Barang`}
          </Button>
        </div>
      </form>

      {/* Recent issuances */}
      <Card className="rounded-none border-slate-200 shadow-none p-5 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Pengeluaran Terakhir</h3>
          <ArrowUp size={16} weight="duotone" className="text-slate-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-2">Tgl</th>
                <th className="text-left p-2">Nama Barang</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-left p-2">SO</th>
                <th className="text-left p-2">Pengambil</th>
                {canSeePrice && <th className="text-right p-2">Total Cost (FIFO)</th>}
                <th className="text-center p-2 w-24">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="recent-issues">
              {recent.length === 0 && (<tr><td colSpan={canSeePrice ? 7 : 6} className="p-4 text-center text-slate-400">Belum ada</td></tr>)}
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-2 whitespace-nowrap text-slate-600">{formatDateID(r.issue_date)}</td>
                  <td className="p-2 text-slate-900">{r.item_name}</td>
                  <td className="p-2 text-right tabular-nums">{r.qty} <span className="text-slate-400 text-xs">{r.unit}</span></td>
                  <td className="p-2 font-mono text-xs">{r.so_number || "-"}</td>
                  <td className="p-2">{r.taker_name}</td>
                  {canSeePrice && <td className="p-2 text-right tabular-nums text-emerald-700">Rp {Number(r.total_cost || 0).toLocaleString("id-ID")}</td>}
                  <td className="p-2 text-center">
                    <RequestCorrectionButton targetType="issuance" targetId={r.id} label={`${r.item_name} · ${r.qty}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* -------------------- Request Correction / Delete Button -------------------- */
function RequestCorrectionButton({ targetType, targetId, label }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState("delete");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return toast.error("Alasan wajib diisi");
    setSaving(true);
    try {
      await api.post("/store/requests", {
        target_type: targetType,
        target_id: targetId,
        action_type: action,
        reason: reason.trim(),
        proposed_changes: action === "edit" ? { description } : {},
      });
      toast.success("Permohonan koreksi terkirim, menunggu approval admin.");
      setOpen(false); setReason(""); setDescription(""); setAction("delete");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengirim permohonan");
    } finally { setSaving(false); }
  };

  return (
    <>
      <button
        type="button"
        data-testid={`request-correction-${targetId}`}
        onClick={() => setOpen(true)}
        className="text-[10px] uppercase tracking-[0.05em] font-semibold text-slate-500 hover:text-amber-600 border border-slate-300 px-2 py-1 rounded-none inline-flex items-center gap-1"
      >
        <ChatCircleDots size={12} weight="bold" /> Koreksi
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle>Ajukan Koreksi</DialogTitle>
            <DialogDescription>
              Target: <b>{label}</b><br />
              Permintaan akan dikirim ke Admin untuk persetujuan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Jenis Koreksi</Label>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="action" value="delete" checked={action === "delete"} onChange={() => setAction("delete")} className="w-4 h-4 accent-red-600" />
                  Hapus
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="action" value="edit" checked={action === "edit"} onChange={() => setAction("edit")} className="w-4 h-4 accent-sky-600" />
                  Edit
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Alasan *</Label>
              <Input data-testid="request-reason" className="rounded-none border-slate-300 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Salah qty, salah SO, dll." />
            </div>
            {action === "edit" && (
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Perubahan yang diinginkan</Label>
                <Input className="rounded-none border-slate-300 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. qty 10 → 8" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
            <Button data-testid="submit-request-btn" onClick={submit} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">
              {saving ? "Mengirim..." : "Kirim ke Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
