import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { MagnifyingGlass, Package, Warning, Bell, Gear, Trash, X, DownloadSimple, ClockCounterClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import BackLink from "../components/BackLink";
import { SortDropdown, sortItems, cmpStr, cmpNum, cmpDateStr } from "../components/SortDropdown";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const STOCK_SORT_OPTS = [
  { value: "item_asc", label: "Barang: A → Z", sort: (a, b) => cmpStr(a.item_name, b.item_name) },
  { value: "item_desc", label: "Barang: Z → A", sort: (a, b) => cmpStr(b.item_name, a.item_name) },
  { value: "qty_desc", label: "Qty: Besar → Kecil", sort: (a, b) => cmpNum(b.qty, a.qty) },
  { value: "qty_asc", label: "Qty: Kecil → Besar", sort: (a, b) => cmpNum(a.qty, b.qty) },
  { value: "receive_desc", label: "Terima: Baru → Lama", sort: (a, b) => cmpDateStr(b.last_receive_date, a.last_receive_date) },
  { value: "receive_asc", label: "Terima: Lama → Baru", sort: (a, b) => cmpDateStr(a.last_receive_date, b.last_receive_date) },
  { value: "below_min", label: "Prioritas: Under-Min Dulu", sort: (a, b) => Number(b.is_below_min || 0) - Number(a.is_below_min || 0) || cmpStr(a.item_name, b.item_name) },
];

export default function StoreStockPage() {
  const { user } = useAuth();
  const canEditMin = ["super_admin", "admin", "supervisor", "store"].includes(user?.role) || user?.is_super_admin;

  const [stock, setStock] = useState([]);
  const [reorderPoints, setReorderPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editItem, setEditItem] = useState(null); // { item_name, unit, min_qty, note, rp_id }
  const [historyItem, setHistoryItem] = useState(null); // { item_name, is_customer_material }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRes, rpRes] = await Promise.all([
        api.get("/store/stock"),
        api.get("/store/reorder-points").catch(() => ({ data: [] })),
      ]);
      setStock(stockRes.data);
      setReorderPoints(rpRes.data);
    } catch {
      toast.error("Gagal memuat stok");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge stock with reorder points → each row shows min_qty + is_below_min
  const rpMap = useMemo(() => {
    const m = new Map();
    reorderPoints.forEach((r) => m.set(r.item_name, r));
    return m;
  }, [reorderPoints]);

  const merged = useMemo(() => {
    // Start with all stock rows
    const rows = stock.map((s) => {
      const rp = rpMap.get(s.item_name);
      return {
        ...s,
        min_qty: rp?.min_qty ?? null,
        rp_id: rp?.id ?? null,
        rp_note: rp?.note ?? "",
        is_below_min: rp ? Number(s.qty) < Number(rp.min_qty) : false,
      };
    });
    // Also include reorder-pointed items that have 0 current stock (not in stock list)
    reorderPoints.forEach((rp) => {
      if (!stock.find((s) => s.item_name === rp.item_name)) {
        rows.push({
          item_name: rp.item_name,
          qty: 0,
          unit: rp.unit || "",
          vendors: [],
          batches: 0,
          last_receive_date: null,
          min_qty: rp.min_qty,
          rp_id: rp.id,
          rp_note: rp.note,
          is_below_min: true,
        });
      }
    });
    return rows;
  }, [stock, reorderPoints, rpMap]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return merged;
    return merged.filter((s) => s.item_name.toLowerCase().includes(kw) || (s.vendors || []).join(" ").toLowerCase().includes(kw));
  }, [merged, q]);

  const [sortBy, setSortBy] = useState("below_min");
  const sortedFiltered = useMemo(() => {
    // Item habis (qty == 0) selalu di paling bawah, di luar aturan sort — supaya user tetap bisa cek history item kosong
    const sorted = sortItems(filtered, sortBy, STOCK_SORT_OPTS);
    const inStock = sorted.filter((s) => Number(s.qty) > 0);
    const outOfStock = sorted.filter((s) => Number(s.qty) <= 0);
    return [...inStock, ...outOfStock];
  }, [filtered, sortBy]);
  const pag = usePagination(sortedFiltered, 20);

  const lowStockItems = merged.filter((r) => r.is_below_min);
  const totalQty = filtered.reduce((sum, s) => sum + Number(s.qty || 0), 0);

  const saveReorderPoint = async () => {
    if (!editItem?.item_name?.trim()) return toast.error("Nama item wajib");
    const min = Number(editItem.min_qty);
    if (isNaN(min) || min < 0) return toast.error("Min qty harus angka ≥ 0");
    try {
      await api.post("/store/reorder-points", {
        item_name: editItem.item_name.trim(),
        min_qty: min,
        unit: editItem.unit || "",
        note: editItem.note || "",
      });
      toast.success("Batas minimum tersimpan");
      setEditItem(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan");
    }
  };

  const deleteReorderPoint = async (rp_id, item_name) => {
    if (!window.confirm(`Hapus batas minimum untuk "${item_name}"?`)) return;
    try {
      await api.delete(`/store/reorder-points/${rp_id}`);
      toast.success("Batas minimum dihapus");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Stok Saat Ini
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Total <span className="tabular-nums font-semibold text-slate-900">{stock.length.toLocaleString("id-ID")}</span> item aktif · <span className="tabular-nums font-semibold text-red-700">{lowStockItems.length}</span> di bawah minimum.
        </p>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <Card className="rounded-none border-2 border-red-300 bg-red-50 shadow-none p-4" data-testid="low-stock-banner">
          <div className="flex items-start gap-3">
            <Warning size={22} weight="fill" className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Bell size={14} weight="bold" className="text-red-700" />
                <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-red-900">
                  {lowStockItems.length} Item di Bawah Batas Minimum
                </h3>
              </div>
              <div className="text-xs text-red-800 space-y-1">
                {lowStockItems.slice(0, 5).map((r) => (
                  <div key={r.item_name} className="flex items-center gap-2">
                    <span className="font-mono font-bold">{r.item_name}</span>
                    <span className="text-red-700">— tersedia {r.qty}{r.unit ? ` ${r.unit}` : ""}, minimum {r.min_qty}{r.unit ? ` ${r.unit}` : ""}, kurang <b>{(Number(r.min_qty) - Number(r.qty)).toLocaleString("id-ID")}</b></span>
                  </div>
                ))}
                {lowStockItems.length > 5 && (
                  <div className="italic text-red-600">… dan {lowStockItems.length - 5} item lainnya di tabel bawah</div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="stock-search"
              className="h-9 pl-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600"
              placeholder="Cari nama barang atau vendor..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <SortDropdown testid="stock-sort" value={sortBy} onChange={setSortBy} options={STOCK_SORT_OPTS} />
          {canEditMin && (
            <Button
              data-testid="add-reorder-point"
              onClick={() => setEditItem({ item_name: "", unit: "", min_qty: "", note: "" })}
              className="rounded-none h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs uppercase tracking-[0.1em] font-bold"
            >
              <Bell size={14} weight="bold" className="mr-1.5" /> Set Minimum Baru
            </Button>
          )}
          <Button
            data-testid="export-movement"
            variant="outline"
            onClick={async () => {
              try {
                const res = await api.get("/store/movements/export/xlsx", { responseType: "blob" });
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const a = document.createElement("a");
                a.href = url; a.download = `store_movement_${new Date().toISOString().slice(0,10)}.xlsx`;
                document.body.appendChild(a); a.click(); a.remove();
                window.URL.revokeObjectURL(url);
                toast.success("Export berhasil diunduh");
              } catch (e) {
                toast.error("Gagal export: " + (e.response?.data?.detail || e.message));
              }
            }}
            className="rounded-none h-9 border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs uppercase tracking-[0.1em] font-bold"
          >
            <DownloadSimple size={14} weight="bold" className="mr-1.5" /> Export Movement
          </Button>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-left p-3">Vendor</th>
                <th className="text-left p-3">Terima Terakhir</th>
                <th className="text-right p-3">Batch</th>
                <th className="text-right p-3">Qty Tersedia</th>
                <th className="text-right p-3">Min</th>
                {canEditMin && <th className="text-center p-3 w-20">Aksi</th>}
              </tr>
            </thead>
            <tbody data-testid="stock-table">
              {loading && (<tr><td colSpan={7} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                  <Package size={24} weight="duotone" className="inline-block mr-2 text-slate-300" />
                  Belum ada stok.
                </td></tr>
              )}
              {sortedFiltered.length > 0 && pag.pagedData.map((s) => {
                const isOut = Number(s.qty) <= 0;
                return (
                <tr
                  key={s.item_name}
                  className={`border-b border-slate-100 ${isOut ? "bg-slate-50 opacity-70 hover:opacity-100 hover:bg-slate-100" : s.is_below_min ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"}`}
                  data-testid={`stock-row-${s.item_name.replace(/\s+/g, "-")}`}
                >
                  <td className="p-3 text-slate-900 max-w-[360px] font-medium">
                    {isOut && <span className="inline-block px-1.5 py-0.5 mr-2 bg-slate-500 text-white text-[9px] font-bold uppercase tracking-widest">HABIS</span>}
                    {!isOut && s.is_below_min && <Warning size={12} weight="fill" className="inline text-red-600 mr-1.5" />}
                    <button
                      onClick={() => setHistoryItem({ item_name: s.item_name, is_customer_material: s.is_customer_material, unit: s.unit })}
                      data-testid={`item-history-${s.item_name.replace(/\s+/g, "-")}`}
                      className="text-left hover:text-sky-700 hover:underline"
                      title="Lihat riwayat In/Out barang ini"
                    >{s.item_name}</button>
                    {s.rp_note && <div className="text-[10px] text-slate-500 italic mt-0.5">{s.rp_note}</div>}
                  </td>
                  <td className="p-3 text-slate-600 text-xs">{(s.vendors || []).join(", ") || "-"}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap">{s.last_receive_date ? formatDateID(s.last_receive_date) : "-"}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{s.batches}</td>
                  <td className={`p-3 text-right tabular-nums font-semibold ${isOut ? "text-slate-400" : s.is_below_min ? "text-red-700" : "text-sky-700"}`}>
                    {Number(s.qty).toLocaleString("id-ID")} <span className="text-slate-400 text-xs">{s.unit}</span>
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs text-slate-500">
                    {s.min_qty != null ? `${Number(s.min_qty).toLocaleString("id-ID")} ${s.unit || ""}` : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="p-3 text-center">
                    <div className="inline-flex gap-1">
                      <button
                        data-testid={`history-btn-${s.item_name.replace(/\s+/g, "-")}`}
                        onClick={() => setHistoryItem({ item_name: s.item_name, is_customer_material: s.is_customer_material, unit: s.unit })}
                        className="p-1.5 hover:bg-sky-100 text-sky-700"
                        title="Riwayat In/Out barang ini (kartu stok)"
                      >
                        <ClockCounterClockwise size={13} weight="bold" />
                      </button>
                      {canEditMin && (
                        <>
                          <button
                            data-testid={`edit-min-${s.item_name.replace(/\s+/g, "-")}`}
                            onClick={() => setEditItem({
                              item_name: s.item_name,
                              unit: s.unit || "",
                              min_qty: s.min_qty ?? "",
                              note: s.rp_note || "",
                              rp_id: s.rp_id,
                            })}
                            className="p-1.5 hover:bg-amber-100 text-amber-700"
                            title="Set/Ubah batas minimum"
                          >
                            <Gear size={13} weight="bold" />
                          </button>
                          {s.rp_id && (
                            <button
                              data-testid={`del-min-${s.item_name.replace(/\s+/g, "-")}`}
                              onClick={() => deleteReorderPoint(s.rp_id, s.item_name)}
                              className="p-1.5 hover:bg-red-100 text-red-600"
                              title="Hapus batas minimum"
                            >
                              <Trash size={13} weight="bold" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-50">
                  <td colSpan={4} className="p-3 text-right text-xs uppercase tracking-[0.1em] font-bold text-slate-600">Total</td>
                  <td className="p-3 text-right tabular-nums font-bold text-slate-900">{totalQty.toLocaleString("id-ID")}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <PaginationBar {...pag} label="item" testIdPrefix="stock-pag" />
      </Card>

      {/* Edit / Create Reorder Point Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell size={18} weight="bold" className="text-amber-600" />
              {editItem?.rp_id ? "Ubah Batas Minimum Stok" : "Set Batas Minimum Stok"}
            </DialogTitle>
            <DialogDescription>
              Sistem akan memberi notifikasi otomatis saat stok item ini turun di bawah batas minimum.
            </DialogDescription>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Item *</Label>
                <Input
                  data-testid="rp-item-name"
                  value={editItem.item_name}
                  onChange={(e) => setEditItem({ ...editItem, item_name: e.target.value })}
                  className="h-9 rounded-none border-slate-300"
                  placeholder="Nama persis di sistem"
                  disabled={!!editItem.rp_id}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">Minimum Qty *</Label>
                  <Input
                    data-testid="rp-min-qty"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editItem.min_qty}
                    onChange={(e) => setEditItem({ ...editItem, min_qty: e.target.value })}
                    className="h-9 rounded-none border-slate-300"
                    placeholder="Contoh: 50"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">Satuan</Label>
                  <Input
                    data-testid="rp-unit"
                    value={editItem.unit}
                    onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })}
                    className="h-9 rounded-none border-slate-300"
                    placeholder="PCS / KG / M"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Catatan (opsional)</Label>
                <Input
                  data-testid="rp-note"
                  value={editItem.note}
                  onChange={(e) => setEditItem({ ...editItem, note: e.target.value })}
                  className="h-9 rounded-none border-slate-300"
                  placeholder="Contoh: Fast moving, wajib restock"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-bold">
              <X size={14} weight="bold" className="mr-1" /> Tutup
            </Button>
            <Button data-testid="rp-save" onClick={saveReorderPoint} className="rounded-none h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs uppercase tracking-[0.1em] font-bold">
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyItem && (
        <StockHistoryDialog item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </div>
  );
}

// -------------------- Stock History Dialog --------------------
function StockHistoryDialog({ item, onClose }) {
  const { user } = useAuth();
  const isStoreRole = user?.role === "store" && !user?.is_super_admin;
  const showPrice = !isStoreRole;
  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Date range filter — default = start of current month to today
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(monthStartISO);
  const [toDate, setToDate] = useState(today);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const params = { item_name: item.item_name };
        if (item.is_customer_material !== undefined) params.is_customer_material = item.is_customer_material;
        const { data } = await api.get("/store/stock/history", { params });
        if (!cancel) {
          setRows(data.rows || []);
          setBalance(data.current_balance || 0);
        }
      } catch {
        toast.error("Gagal memuat riwayat");
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [item]);

  const totalIn = rows.reduce((s, r) => s + (r.qty_in || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
  const totalValueIn = rows.reduce((s, r) => s + (r.qty_in || 0) * (r.unit_price || 0), 0);
  const totalValueOut = rows.reduce((s, r) => s + (r.qty_out || 0) * (r.unit_price || 0), 0);

  // Filter by date range + compute opening balance
  const { filteredRows, openingBalance, periodIn, periodOut, closingBalance } = useMemo(() => {
    const from = fromDate || "0000-01-01";
    const to = toDate || "9999-12-31";
    let opening = 0;
    const inRange = [];
    for (const r of rows) {
      const d = r.date || "";
      if (d < from) {
        // Sum toward opening balance (same logic as backend)
        if (r.kind === "IN" && r.added_to_stock) opening += r.qty_in;
        else if (r.kind === "OUT") opening -= r.qty_out;
      } else if (d <= to) {
        inRange.push(r);
      }
    }
    // Recompute running balance for in-range rows starting from opening
    let running = opening;
    const withBalance = inRange.map((r) => {
      if (r.kind === "IN" && r.added_to_stock) running += r.qty_in;
      else if (r.kind === "OUT") running -= r.qty_out;
      return { ...r, balance: running };
    });
    const pIn = inRange.reduce((s, r) => s + (r.qty_in || 0), 0);
    const pOut = inRange.reduce((s, r) => s + (r.qty_out || 0), 0);
    return { filteredRows: withBalance, openingBalance: opening, periodIn: pIn, periodOut: pOut, closingBalance: running };
  }, [rows, fromDate, toDate]);

  const doPrint = () => {
    const params = new URLSearchParams({
      item_name: item.item_name,
      unit: item.unit || "",
      from: fromDate || "",
      to: toDate || "",
    });
    if (item.is_customer_material !== undefined) params.set("is_customer_material", item.is_customer_material);
    if (!showPrice) params.set("hide_price", "1");
    window.open(`/store/stock/history/print?${params.toString()}`, "_blank");
  };

  const setPreset = (kind) => {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (kind === "this_month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(iso(s)); setToDate(iso(now));
    } else if (kind === "last_month") {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(iso(s)); setToDate(iso(e));
    } else if (kind === "this_year") {
      const s = new Date(now.getFullYear(), 0, 1);
      setFromDate(iso(s)); setToDate(iso(now));
    } else if (kind === "all") {
      setFromDate(""); setToDate("");
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="stock-history-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <Package size={20} weight="duotone" className="text-sky-600" />
            Riwayat: <span className="font-mono">{item.item_name}</span>
          </DialogTitle>
          <DialogDescription>
            Ledger IN (barang masuk) & OUT (barang keluar) berurut kronologis. Balance = qty stok berjalan.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Memuat riwayat...</div>
        ) : (
          <>
            {/* Date range filter */}
            <div className="flex items-end gap-2 flex-wrap bg-slate-50 border border-slate-200 p-2">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Dari Tanggal</Label>
                <Input
                  type="date"
                  data-testid="history-from-date"
                  className="h-8 rounded-none border-slate-300 text-xs w-36"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Sampai Tanggal</Label>
                <Input
                  type="date"
                  data-testid="history-to-date"
                  className="h-8 rounded-none border-slate-300 text-xs w-36"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-1 ml-2">
                <button data-testid="preset-this-month" onClick={() => setPreset("this_month")} className="h-8 px-2 border border-slate-300 bg-white hover:bg-sky-50 hover:border-sky-300 text-[10px] uppercase tracking-[0.05em] font-bold text-slate-600">Bulan Ini</button>
                <button data-testid="preset-last-month" onClick={() => setPreset("last_month")} className="h-8 px-2 border border-slate-300 bg-white hover:bg-sky-50 hover:border-sky-300 text-[10px] uppercase tracking-[0.05em] font-bold text-slate-600">Bulan Lalu</button>
                <button data-testid="preset-this-year" onClick={() => setPreset("this_year")} className="h-8 px-2 border border-slate-300 bg-white hover:bg-sky-50 hover:border-sky-300 text-[10px] uppercase tracking-[0.05em] font-bold text-slate-600">Tahun Ini</button>
                <button data-testid="preset-all" onClick={() => setPreset("all")} className="h-8 px-2 border border-slate-300 bg-white hover:bg-sky-50 hover:border-sky-300 text-[10px] uppercase tracking-[0.05em] font-bold text-slate-600">Semua</button>
              </div>
              <div className="ml-auto text-xs text-slate-500 self-center">
                <span data-testid="filter-count"><b>{filteredRows.length}</b> baris dalam periode</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-sm mt-2">
              <div className="border border-slate-300 bg-slate-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-600">Opening Balance</div>
                <div className="text-lg font-bold text-slate-800 tabular-nums">{openingBalance.toLocaleString("id-ID")} <span className="text-xs text-slate-600">{item.unit}</span></div>
              </div>
              <div className="border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-emerald-700">Total Masuk (IN)</div>
                <div className="text-lg font-bold text-emerald-900 tabular-nums">{periodIn.toLocaleString("id-ID")} <span className="text-xs text-emerald-700">{item.unit}</span></div>
              </div>
              <div className="border border-red-200 bg-red-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-red-700">Total Keluar (OUT)</div>
                <div className="text-lg font-bold text-red-900 tabular-nums">{periodOut.toLocaleString("id-ID")} <span className="text-xs text-red-700">{item.unit}</span></div>
              </div>
              <div className="border border-sky-200 bg-sky-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-sky-700">Closing Balance</div>
                <div className="text-lg font-bold text-sky-900 tabular-nums">{closingBalance.toLocaleString("id-ID")} <span className="text-xs text-sky-700">{item.unit}</span></div>
              </div>
            </div>
            {showPrice && (
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-200 pt-2">
                <div>
                  Total Nilai IN: <b className="text-emerald-700 tabular-nums">Rp {filteredRows.reduce((s, r) => s + (r.qty_in || 0) * (r.unit_price || 0), 0).toLocaleString("id-ID")}</b>
                </div>
                <div>
                  Total Nilai OUT (FIFO): <b className="text-red-700 tabular-nums">Rp {filteredRows.reduce((s, r) => s + (r.qty_out || 0) * (r.unit_price || 0), 0).toLocaleString("id-ID")}</b>
                </div>
                <div>
                  Net Movement: <b className="text-slate-900 tabular-nums">Rp {filteredRows.reduce((s, r) => s + ((r.qty_in || 0) - (r.qty_out || 0)) * (r.unit_price || 0), 0).toLocaleString("id-ID")}</b>
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 mt-2">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                    <th className="text-left p-2 w-24">Tanggal</th>
                    <th className="text-left p-2 w-16">Jenis</th>
                    <th className="text-left p-2">Description / Vendor</th>
                    <th className="text-left p-2">Invoice / Pengambil</th>
                    <th className="text-left p-2 w-24">SO No</th>
                    <th className="text-right p-2 w-20">In</th>
                    <th className="text-right p-2 w-20">Out</th>
                    <th className="text-right p-2 w-24">Balance</th>
                    {showPrice && <th className="text-right p-2 w-32" title="Total = Qty × Unit Price. OUT pakai average FIFO cost.">Total (Rp)</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={showPrice ? 9 : 8} className="p-6 text-center text-slate-400">Tidak ada transaksi dalam periode ini</td></tr>
                  )}
                  {filteredRows.map((r, idx) => (
                    <tr key={r.id || `${r.kind}-${r.date}-${r.ref}-${idx}`} className={`border-b border-slate-100 ${r.kind === "IN" ? "hover:bg-emerald-50/40" : "hover:bg-red-50/40"}`} data-testid={`history-row-${idx}`}>
                      <td className="p-2 text-slate-700 whitespace-nowrap">{r.date ? formatDateID(r.date) : "-"}</td>
                      <td className="p-2">
                        <span className={`text-[9px] uppercase tracking-[0.05em] font-bold px-1.5 py-0.5 border ${r.kind === "IN" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-100 text-red-800 border-red-300"}`}>
                          {r.kind}{r.kind === "IN" && !r.added_to_stock ? " (LOG)" : ""}
                        </span>
                      </td>
                      <td className="p-2 text-slate-700 max-w-[220px] truncate" title={r.description}>{r.description || "-"}</td>
                      <td className="p-2 text-slate-700 font-mono text-xs">{r.ref || "-"}</td>
                      <td className="p-2 text-slate-600 text-xs">{r.so_no || "-"}</td>
                      <td className="p-2 text-right tabular-nums text-emerald-700 font-semibold">{r.qty_in > 0 ? r.qty_in.toLocaleString("id-ID") : "-"}</td>
                      <td className="p-2 text-right tabular-nums text-red-700 font-semibold">{r.qty_out > 0 ? r.qty_out.toLocaleString("id-ID") : "-"}</td>
                      <td className="p-2 text-right tabular-nums font-bold text-slate-900">{r.balance.toLocaleString("id-ID")}</td>
                      {showPrice && (
                        <td className="p-2 text-right tabular-nums text-slate-700 text-xs">
                          {(() => {
                            const qty = r.qty_in > 0 ? r.qty_in : r.qty_out;
                            const total = qty * (r.unit_price || 0);
                            return total > 0 ? `Rp ${Number(total).toLocaleString("id-ID")}` : "-";
                          })()}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={doPrint}
            disabled={loading || rows.length === 0}
            className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-bold border-sky-300 text-sky-700 hover:bg-sky-50"
            data-testid="history-print-btn"
          >
            <DownloadSimple size={14} weight="bold" className="mr-1" /> Print / PDF
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-none h-9 text-xs uppercase tracking-[0.1em] font-bold" data-testid="history-close-btn">
            <X size={14} weight="bold" className="mr-1" /> Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
