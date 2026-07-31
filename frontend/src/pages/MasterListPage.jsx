import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import api, { formatRupiah, formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { SortDropdown, sortItems, cmpStr, cmpDateStr, cmpNum } from "../components/SortDropdown";

const ML_SORT_OPTS = [
  { value: "invoice_date_desc", label: "Tanggal Invoice: Baru → Lama", sort: (a, b) => cmpDateStr(b.invoice_date, a.invoice_date) },
  { value: "invoice_date_asc", label: "Tanggal Invoice: Lama → Baru", sort: (a, b) => cmpDateStr(a.invoice_date, b.invoice_date) },
  { value: "vendor_asc", label: "Toko/Vendor: A → Z", sort: (a, b) => cmpStr(a.vendor_name, b.vendor_name) },
  { value: "vendor_desc", label: "Toko/Vendor: Z → A", sort: (a, b) => cmpStr(b.vendor_name, a.vendor_name) },
  { value: "item_asc", label: "Nama Barang: A → Z", sort: (a, b) => cmpStr(a.item_name, b.item_name) },
  { value: "item_desc", label: "Nama Barang: Z → A", sort: (a, b) => cmpStr(b.item_name, a.item_name) },
  { value: "total_desc", label: "Total (IDR): Besar → Kecil", sort: (a, b) => cmpNum(b.total_price_idr, a.total_price_idr) },
  { value: "total_asc", label: "Total (IDR): Kecil → Besar", sort: (a, b) => cmpNum(a.total_price_idr, b.total_price_idr) },
  { value: "qty_desc", label: "Qty: Besar → Kecil", sort: (a, b) => cmpNum(b.qty, a.qty) },
];
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import {
  MagnifyingGlass,
  Download,
  UploadSimple,
  PencilSimple,
  Trash,
  CaretLeft,
  CaretRight,
  FunnelSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import BackLink from "../components/BackLink";
const PAGE_SIZE = 25;
const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];

export default function MasterListPage() {
  const [filters, setFilters] = useState({
    q: "",
    vendor: "",
    project_no: "",
    po_no: "",
    invoice_no: "",
    start_date: "",
    end_date: "",
  });
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [editTx, setEditTx] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [invoiceViewer, setInvoiceViewer] = useState(null);  // invoice_no to view all items
  const [groupViewer, setGroupViewer] = useState(null);  // {type, po_no?, vendor_name?, invoice_date?}
  const [sortBy, setSortBy] = useState("invoice_date_desc");
  const sortedItems = useMemo(() => sortItems(data.items || [], sortBy, ML_SORT_OPTS), [data.items, sortBy]);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [categories, setCategories] = useState([]);
  const debounceRef = useRef(null);

  const load = useCallback(async (p = 1, f = filters) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: PAGE_SIZE };
      Object.entries(f).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const { data } = await api.get("/transactions", { params });
      setData(data);
      setPage(p);
    } catch (e) {
      toast.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load(1, filters);
    api.get("/master/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilterChange = (k, v) => {
    const nf = { ...filters, [k]: v };
    setFilters(nf);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, nf), 400);
  };

  const resetFilters = () => {
    const empty = { q: "", vendor: "", project_no: "", po_no: "", invoice_no: "", start_date: "", end_date: "" };
    setFilters(empty);
    load(1, empty);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const onExport = async () => {
    try {
      const res = await api.get("/transactions/export/xlsx", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan_pembelian_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel siap diunduh");
    } catch {
      toast.error("Gagal export");
    }
  };

  const onImport = async () => {
    if (!importFile) return toast.error("Pilih file Excel dulu");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const { data } = await api.post("/transactions/import/xlsx", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${data.inserted} transaksi berhasil diimpor`);
      setImportOpen(false);
      setImportFile(null);
      load(1, filters);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal import");
    } finally {
      setImporting(false);
    }
  };

  const onSaveEdit = async () => {
    try {
      const t = editTx;
      const payload = {
        invoice_date: t.invoice_date,
        project_no: t.project_no || "",
        po_no: t.po_no || "",
        vendor_name: t.vendor_name,
        category: (t.category || "").trim() || "Uncategorized",
        invoice_no: t.invoice_no || "",
        po_date: t.po_date || null,
        plan_delivery_date: t.plan_delivery_date || null,
        receive_date: t.receive_date || null,
        item_name: t.item_name,
        qty: Number(t.qty) || 0,
        unit: t.unit || "Ea",
        unit_price: Number(t.unit_price) || 0,
        total_price: (Number(t.qty) || 0) * (Number(t.unit_price) || 0),
        notes: t.notes || "",
        is_compliant: t.is_compliant !== false,
        is_completed: t.is_completed !== false,
        post_to_store: !!t.post_to_store,
      };
      await api.put(`/transactions/${t.id}`, payload);
      toast.success("Transaksi diperbarui");
      setEditTx(null);
      load(page, filters);
    } catch {
      toast.error("Gagal update");
    }
  };

  const onConfirmDelete = async () => {
    try {
      await api.delete(`/transactions/${deleteTx.id}`);
      toast.success("Transaksi dihapus");
      setDeleteTx(null);
      load(page, filters);
    } catch {
      toast.error("Gagal hapus");
    }
  };

  const onConfirmBulkDelete = async () => {
    try {
      const ids = Array.from(selectedIds);
      const { data } = await api.post("/transactions/bulk-delete", { ids });
      toast.success(`${data.deleted} transaksi dihapus`);
      setSelectedIds(new Set());
      setConfirmBulk(false);
      load(page, filters);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  return (
    <div className="space-y-6">
            <BackLink />
<div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Master List Transaksi
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cari, filter, edit, atau ekspor data pembelian. Total <span className="tabular-nums font-semibold text-slate-900">{data.total.toLocaleString("id-ID")}</span> transaksi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="import-btn" onClick={() => setImportOpen(true)} variant="outline" size="sm" className="rounded-none h-9 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
            <UploadSimple size={14} weight="bold" className="mr-1.5" /> Import Excel
          </Button>
          <Button data-testid="export-btn" onClick={onExport} size="sm" className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
            <Download size={14} weight="bold" className="mr-1.5" /> Export Excel
          </Button>
        </div>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FunnelSimple size={16} weight="bold" className="text-slate-500" />
            <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Filter Pencarian</h3>
          </div>
          <button onClick={resetFilters} className="text-xs uppercase tracking-[0.1em] font-semibold text-slate-500 hover:text-sky-600" data-testid="reset-filter-btn">
            Reset Filter
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari (Barang / Toko / Invoice / SO / PO)</Label>
            <div className="relative">
              <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="filter-q" className={`${inputCls} pl-9`} value={filters.q} onChange={(e) => onFilterChange("q", e.target.value)} placeholder="Ketik kata kunci..." />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Toko</Label>
            <Input data-testid="filter-vendor" className={inputCls} value={filters.vendor} onChange={(e) => onFilterChange("vendor", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Invoice</Label>
            <Input data-testid="filter-invoice" className={inputCls} value={filters.invoice_no} onChange={(e) => onFilterChange("invoice_no", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO</Label>
            <Input data-testid="filter-so" className={inputCls} value={filters.project_no} onChange={(e) => onFilterChange("project_no", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor PO</Label>
            <Input data-testid="filter-po" className={inputCls} value={filters.po_no} onChange={(e) => onFilterChange("po_no", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tanggal</Label>
            <Input type="date" data-testid="filter-start" className={inputCls} value={filters.start_date} onChange={(e) => onFilterChange("start_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tanggal</Label>
            <Input type="date" data-testid="filter-end" className={inputCls} value={filters.end_date} onChange={(e) => onFilterChange("end_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Urutkan</Label>
            <SortDropdown testid="ml-sort" value={sortBy} onChange={setSortBy} options={ML_SORT_OPTS} className="w-full" />
          </div>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-amber-50" data-testid="bulk-bar">
            <div className="text-sm text-slate-700">
              <b className="tabular-nums text-slate-900">{selectedIds.size}</b> baris dipilih
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="bulk-clear-btn"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-none h-8 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold"
              >
                Batal Pilih
              </Button>
              <Button
                size="sm"
                data-testid="bulk-delete-btn"
                onClick={() => setConfirmBulk(true)}
                className="rounded-none h-8 bg-red-600 hover:bg-red-700 text-white text-xs uppercase tracking-[0.1em] font-semibold"
              >
                <Trash size={12} weight="bold" className="mr-1" /> Hapus {selectedIds.size} Baris
              </Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    data-testid="select-all-checkbox"
                    className="w-4 h-4 accent-sky-600 cursor-pointer"
                    checked={data.items.length > 0 && data.items.every((t) => selectedIds.has(t.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set([...selectedIds, ...data.items.map((t) => t.id)]));
                      } else {
                        const next = new Set(selectedIds);
                        data.items.forEach((t) => next.delete(t.id));
                        setSelectedIds(next);
                      }
                    }}
                  />
                </th>
                <th className="text-left p-3">Tanggal</th>
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Toko</th>
                <th className="text-left p-3">Kategori</th>
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-left p-3">SO / PO</th>
                <th className="text-left p-3">Plan Delivery</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-right p-3">Harga</th>
                <th className="text-right p-3">Total (IDR)</th>
                <th className="text-center p-3 w-20">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="transactions-table">
              {loading && (
                <tr>
                  <td colSpan={12} className="text-center p-8 text-slate-400 text-sm">
                    Memuat data...
                  </td>
                </tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center p-8 text-slate-400 text-sm" data-testid="empty-state">
                    Tidak ada data. Klik "Input Transaksi" atau "Import Excel" untuk mulai.
                  </td>
                </tr>
              )}
              {!loading &&
                sortedItems.map((t) => {
                  const isForeign = t.currency && t.currency !== "IDR";
                  const idrTotal = t.total_price_idr ?? t.total_price;
                  return (
                  <tr key={t.id} className={`border-b border-slate-100 hover:bg-slate-50 ${selectedIds.has(t.id) ? "bg-sky-50" : ""}`} data-testid={`tx-row-${t.id}`}>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        data-testid={`select-${t.id}`}
                        className="w-4 h-4 accent-sky-600 cursor-pointer"
                        checked={selectedIds.has(t.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(t.id); else next.delete(t.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-700">{formatDateID(t.invoice_date)}</td>
                    <td className="p-3 whitespace-nowrap font-mono text-xs">
                      {t.invoice_no ? (
                        <button
                          onClick={() => setInvoiceViewer(t.invoice_no)}
                          data-testid={`invoice-view-${t.invoice_no}`}
                          className="text-sky-700 hover:text-sky-900 hover:underline font-semibold"
                          title="Lihat semua item dalam invoice ini"
                        >{t.invoice_no}</button>
                      ) : "-"}
                    </td>
                    <td className="p-3 text-slate-900">
                      <button
                        onClick={() => setGroupViewer({ type: "vendor_date", vendor_name: t.vendor_name, invoice_date: t.invoice_date })}
                        data-testid={`group-vendor-${t.id}`}
                        className="text-left hover:text-sky-700 hover:underline"
                        title="Batch edit semua item dari vendor ini di tanggal yang sama"
                      >{t.vendor_name}</button>
                    </td>
                    <td className="p-3 text-slate-600 text-xs whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 uppercase tracking-[0.05em] font-semibold">
                        {t.category || "Uncategorized"}
                      </span>
                    </td>
                    <td className="p-3 text-slate-900 max-w-[300px]">
                      <button
                        onClick={() => t.invoice_no && setInvoiceViewer(t.invoice_no)}
                        data-testid={`item-view-${t._id || t.id}`}
                        className="text-left hover:text-sky-700 hover:underline truncate w-full"
                        title={t.invoice_no ? `Lihat semua item dari invoice ${t.invoice_no}` : t.item_name}
                      >{t.item_name}</button>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">
                      {t.project_no || "-"} /{" "}
                      {t.po_no ? (
                        <button
                          onClick={() => setGroupViewer({ type: "po", po_no: t.po_no })}
                          data-testid={`group-po-${t.id}`}
                          className="text-sky-700 hover:text-sky-900 hover:underline font-semibold"
                          title="Batch edit semua item dari PO ini"
                        >{t.po_no}</button>
                      ) : "-"}
                    </td>
                    <td className="p-3 text-slate-600 text-xs whitespace-nowrap">
                      {t.plan_delivery_date ? formatDateID(t.plan_delivery_date) : "-"}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {t.qty} <span className="text-slate-400 text-xs">{t.unit}</span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-700">
                      <span className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-400 mr-1">{t.currency || "IDR"}</span>
                      {Number(t.unit_price || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold text-slate-900">
                      {formatRupiah(idrTotal)}
                      {isForeign && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {t.currency} {Number(t.total_price).toLocaleString("id-ID", { maximumFractionDigits: 2 })} @ {Number(t.exchange_rate || 1).toLocaleString("id-ID")}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button data-testid={`edit-${t.id}`} onClick={() => setEditTx({ ...t })} className="p-1.5 text-slate-400 hover:text-sky-600" title="Edit">
                          <PencilSimple size={14} weight="bold" />
                        </button>
                        <button data-testid={`delete-${t.id}`} onClick={() => setDeleteTx(t)} className="p-1.5 text-slate-400 hover:text-red-600" title="Hapus">
                          <Trash size={14} weight="bold" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500">
            Halaman <span className="tabular-nums font-semibold text-slate-900">{page}</span> dari{" "}
            <span className="tabular-nums font-semibold text-slate-900">{totalPages}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" data-testid="prev-page" disabled={page === 1 || loading} onClick={() => load(page - 1, filters)} className="h-8 rounded-none text-xs uppercase tracking-[0.1em]">
              <CaretLeft size={14} weight="bold" /> Prev
            </Button>
            <Button variant="ghost" size="sm" data-testid="next-page" disabled={page >= totalPages || loading} onClick={() => load(page + 1, filters)} className="h-8 rounded-none text-xs uppercase tracking-[0.1em]">
              Next <CaretRight size={14} weight="bold" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTx} onOpenChange={(v) => !v && setEditTx(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-none" data-testid="edit-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold" style={{ fontFamily: "Chivo, sans-serif" }}>Edit Transaksi</DialogTitle>
            <DialogDescription>Ubah data transaksi lalu klik Simpan.</DialogDescription>
          </DialogHeader>
          {editTx && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Invoice</Label>
                <Input type="date" className={inputCls} value={editTx.invoice_date || ""} onChange={(e) => setEditTx({ ...editTx, invoice_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor Invoice</Label>
                <Input className={inputCls} value={editTx.invoice_no || ""} onChange={(e) => setEditTx({ ...editTx, invoice_no: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Toko</Label>
                <Input className={inputCls} value={editTx.vendor_name || ""} onChange={(e) => setEditTx({ ...editTx, vendor_name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Kategori</Label>
                <Input list="edit-categories-list" className={inputCls} value={editTx.category || ""} onChange={(e) => setEditTx({ ...editTx, category: e.target.value })} placeholder="mis. Direct Material" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Barang</Label>
                <Input className={inputCls} value={editTx.item_name || ""} onChange={(e) => setEditTx({ ...editTx, item_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO</Label>
                <Input className={inputCls} value={editTx.project_no || ""} onChange={(e) => setEditTx({ ...editTx, project_no: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor PO</Label>
                <Input className={inputCls} value={editTx.po_no || ""} onChange={(e) => setEditTx({ ...editTx, po_no: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Qty</Label>
                <Input type="number" step="any" className={inputCls} value={editTx.qty} onChange={(e) => setEditTx({ ...editTx, qty: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Unit</Label>
                <select className="h-9 w-full border border-slate-300 rounded-none px-2 text-sm bg-white" value={editTx.unit} onChange={(e) => setEditTx({ ...editTx, unit: e.target.value })}>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Unit Price</Label>
                <Input type="number" step="any" className={inputCls} value={editTx.unit_price} onChange={(e) => setEditTx({ ...editTx, unit_price: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Total (otomatis)</Label>
                <Input readOnly className={`${inputCls} bg-slate-50 tabular-nums`} value={formatRupiah((Number(editTx.qty) || 0) * (Number(editTx.unit_price) || 0))} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal PO</Label>
                <Input type="date" className={inputCls} value={editTx.po_date || ""} onChange={(e) => setEditTx({ ...editTx, po_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Plan Delivery <span className="text-slate-400 font-normal normal-case">(estimasi)</span></Label>
                <Input type="date" className={inputCls} value={editTx.plan_delivery_date || ""} onChange={(e) => setEditTx({ ...editTx, plan_delivery_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal Terima</Label>
                <Input type="date" className={inputCls} value={editTx.receive_date || ""} onChange={(e) => setEditTx({ ...editTx, receive_date: e.target.value })} />
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 mt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="edit-compliant">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-sky-600"
                    checked={editTx.is_compliant !== false}
                    onChange={(e) => setEditTx({ ...editTx, is_compliant: e.target.checked })}
                  />
                  <span className="text-slate-700">Sesuai Spesifikasi (Compliance Quality)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="edit-completed">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-sky-600"
                    checked={editTx.is_completed !== false}
                    onChange={(e) => setEditTx({ ...editTx, is_completed: e.target.checked })}
                  />
                  <span className="text-slate-700">PO Selesai (PO Completion)</span>
                </label>
                <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer" data-testid="edit-post-store">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-sky-600"
                    checked={!!editTx.post_to_store}
                    onChange={(e) => setEditTx({ ...editTx, post_to_store: e.target.checked })}
                  />
                  <span className="text-slate-700">Post ke Store (masuk stok gudang)</span>
                </label>
                <div className="col-span-2 text-[11px] text-slate-500">
                  Uncheck jika item ini <b>tidak sesuai spek</b> atau <b>PO belum selesai</b>. Ini mempengaruhi perhitungan KPI Purchasing.
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)} className="rounded-none">Batal</Button>
            <Button onClick={onSaveEdit} data-testid="save-edit-btn" className="rounded-none bg-slate-900 hover:bg-slate-800">Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTx} onOpenChange={(v) => !v && setDeleteTx(null)}>
        <DialogContent className="rounded-none max-h-[90vh] overflow-y-auto" data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle>Hapus Transaksi?</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus transaksi <b>{deleteTx?.item_name}</b> dari <b>{deleteTx?.vendor_name}</b>? Aksi ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTx(null)} className="rounded-none">Batal</Button>
            <Button onClick={onConfirmDelete} data-testid="confirm-delete-btn" className="rounded-none bg-red-600 hover:bg-red-700 text-white">
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-none max-h-[90vh] overflow-y-auto" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle>Import Excel</DialogTitle>
            <DialogDescription>
              Upload file Excel (.xlsx). Format kolom mengikuti template ekspor. Kolom minimal: Tanggal, Toko, Nama Barang, Qty, Harga.
              <div className="mt-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 px-2 py-1.5">
                <b>Catatan:</b> Data hasil import <b>tidak</b> otomatis masuk ke Store. Set flag "Ke Store" per baris manual jika perlu.
              </div>
            </DialogDescription>
          </DialogHeader>
          <div>
            <input
              type="file"
              accept=".xlsx"
              data-testid="import-file-input"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:py-2 file:px-4 file:rounded-none file:border file:border-slate-300 file:bg-white file:text-slate-700 file:text-xs file:uppercase file:tracking-[0.1em] file:font-semibold hover:file:bg-slate-50"
            />
            {importFile && <div className="mt-2 text-xs text-slate-500">File: <b>{importFile.name}</b></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} className="rounded-none">Batal</Button>
            <Button onClick={onImport} disabled={importing || !importFile} data-testid="confirm-import-btn" className="rounded-none bg-slate-900 hover:bg-slate-800">
              {importing ? "Mengimpor..." : "Upload & Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <DialogContent className="rounded-none max-h-[90vh] overflow-y-auto" data-testid="bulk-delete-dialog">
          <DialogHeader>
            <DialogTitle>Hapus {selectedIds.size} Transaksi?</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus <b>{selectedIds.size}</b> baris transaksi yang dipilih? Aksi ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulk(false)} className="rounded-none">Batal</Button>
            <Button data-testid="confirm-bulk-delete-btn" onClick={onConfirmBulkDelete} className="rounded-none bg-red-600 hover:bg-red-700 text-white">
              Hapus {selectedIds.size} Baris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice items viewer — click invoice_no / item_name to see all items in same invoice */}
      {invoiceViewer && (
        <InvoiceItemsDialog invoiceNo={invoiceViewer} onClose={() => setInvoiceViewer(null)} />
      )}

      {/* Group Batch Edit — click PO Number or Vendor Name to edit all rows in one modal */}
      {groupViewer && (
        <GroupBatchEditDialog
          group={groupViewer}
          onClose={() => setGroupViewer(null)}
          onSaved={() => { setGroupViewer(null); load(page, filters); }}
        />
      )}

      <datalist id="edit-categories-list">
        {categories.map((c) => (<option key={c} value={c} />))}
      </datalist>
    </div>
  );
}


function InvoiceItemsDialog({ invoiceNo, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/transactions", { params: { invoice_no: invoiceNo, page_size: 200 } });
        setItems(data.items || []);
      } catch { setItems([]); } finally { setLoading(false); }
    })();
  }, [invoiceNo]);

  const totals = {};
  let vendor = "", invDate = "", po = "", project = "";
  for (const t of items) {
    const cur = t.currency || "IDR";
    totals[cur] = (totals[cur] || 0) + Number(t.total_price || 0);
    if (!vendor) vendor = t.vendor_name;
    if (!invDate) invDate = t.invoice_date;
    if (!po) po = t.po_no;
    if (!project) project = t.project_no;
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice <span className="font-mono">{invoiceNo}</span> — {items.length} item</DialogTitle>
          <DialogDescription>
            {vendor && <>Vendor: <b>{vendor}</b> · </>}
            {invDate && <>Tanggal: {formatDateID(invDate)} · </>}
            {po && <>PO: {po} · </>}
            {project && <>Project: {project}</>}
          </DialogDescription>
        </DialogHeader>
        {loading ? <div className="p-8 text-center text-slate-400">Memuat...</div> : (
          <>
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Kategori</th>
                  <th className="text-left p-2">Item</th>
                  <th className="text-left p-2">SO No</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-left p-2">Unit</th>
                  <th className="text-right p-2">Unit Price</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-left p-2">Cur</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id || i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2 text-slate-400">{i + 1}</td>
                    <td className="p-2 text-xs">{it.category || "-"}</td>
                    <td className="p-2 text-slate-900">{it.item_name}</td>
                    <td className="p-2 text-xs font-mono font-semibold text-emerald-700">{it.so_no || "-"}</td>
                    <td className="p-2 text-right tabular-nums">{it.qty}</td>
                    <td className="p-2 text-slate-600 text-xs">{it.unit}</td>
                    <td className="p-2 text-right tabular-nums">{Number(it.unit_price || 0).toLocaleString("id-ID")}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{Number(it.total_price || 0).toLocaleString("id-ID")}</td>
                    <td className="p-2 text-xs">{it.currency || "IDR"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                  <td colSpan={7} className="p-2 text-right">TOTAL</td>
                  <td className="p-2 text-right tabular-nums" colSpan={2}>
                    {Object.entries(totals).map(([cur, v]) => (
                      <div key={cur}>{cur} {v.toLocaleString("id-ID")}</div>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}
        <DialogFooter className="sticky bottom-0 bg-white border-t border-slate-200 -mx-6 px-6 py-3 mt-3">
          <Button variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// -------------------- Group Batch Edit Dialog --------------------
function GroupBatchEditDialog({ group, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({}); // {id: {field: val}}

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (group.type === "batch") params.batch_id = group.batch_id;
      else if (group.type === "po") params.po_no = group.po_no;
      else if (group.type === "vendor_date") {
        params.vendor_name = group.vendor_name;
        params.invoice_date = group.invoice_date;
      }
      const { data } = await api.get("/transactions/group", { params });
      setItems(data.items || []);
      setDirty({});
    } catch (e) {
      toast.error("Gagal memuat grup");
      setItems([]);
    } finally { setLoading(false); }
  }, [group]);

  useEffect(() => { reload(); }, [reload]);

  const setField = (id, field, value) => {
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const getValue = (it, field) => {
    if (dirty[it.id] && field in dirty[it.id]) return dirty[it.id][field];
    if (field === "add_to_stock") {
      // Purchasing's upfront decision lives on the tx (tx.should_stock).
      // Fallback to linked_receipt for legacy rows without should_stock.
      if (typeof it.should_stock === "boolean") return it.should_stock;
      return !!(it.linked_receipt?.add_to_stock);
    }
    return it[field] ?? "";
  };

  const dirtyCount = Object.keys(dirty).length;

  const bulkToggleStock = (checked) => {
    const next = { ...dirty };
    items.forEach((it) => {
      next[it.id] = { ...(next[it.id] || {}), add_to_stock: checked };
    });
    setDirty(next);
  };

  const allChecked = items.length > 0 && items.every((it) => getValue(it, "add_to_stock"));

  const onSave = async () => {
    if (dirtyCount === 0) { toast.info("Tidak ada perubahan"); return; }
    setSaving(true);
    try {
      const rows = Object.entries(dirty).map(([id, changes]) => ({ id, ...changes }));
      const { data } = await api.post("/transactions/bulk-update", { rows });
      toast.success(`${data.updated_tx} transaksi disimpan (${data.updated_receipts} ke store)`);
      onSaved && onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan batch");
    } finally { setSaving(false); }
  };

  const title = group.type === "po"
    ? <>Batch Edit — PO <span className="font-mono">{group.po_no}</span></>
    : group.type === "batch"
    ? <>Batch Edit — Upload Group</>
    : <>Batch Edit — {group.vendor_name} · {formatDateID(group.invoice_date)}</>;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-7xl max-h-[92vh] overflow-y-auto" data-testid="group-batch-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold" style={{ fontFamily: "Chivo, sans-serif" }}>{title}</DialogTitle>
          <DialogDescription>
            Edit Qty, Unit, Harga, Catatan langsung di tabel. Centang "Masuk Stok" per baris atau pakai toggle di header untuk semuanya sekaligus. Klik Simpan untuk update semua baris yang berubah.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Memuat...</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-sm text-slate-700">
                <b>{items.length}</b> item dalam grup ini
                {dirtyCount > 0 && <span className="ml-3 text-amber-700"><b>{dirtyCount}</b> baris berubah</span>}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="bulk-stock-toggle">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-sky-600"
                  checked={allChecked}
                  onChange={(e) => bulkToggleStock(e.target.checked)}
                />
                <span className="font-semibold text-slate-700">Masuk Stok Semua</span>
              </label>
            </div>

            <div className="overflow-x-auto mt-2 border border-slate-200">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2 min-w-[220px]">Nama Barang</th>
                    <th className="text-left p-2">Kategori</th>
                    <th className="text-left p-2 w-28">SO No</th>
                    <th className="text-left p-2 w-28">PO No</th>
                    <th className="text-right p-2 w-20">Qty</th>
                    <th className="text-left p-2 w-20">Unit</th>
                    <th className="text-right p-2 w-28">Harga</th>
                    <th className="text-right p-2 w-28">Total</th>
                    <th className="text-left p-2 min-w-[160px]">Catatan</th>
                    <th className="text-center p-2 w-24">Masuk Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const qty = Number(getValue(it, "qty")) || 0;
                    const price = Number(getValue(it, "unit_price")) || 0;
                    const total = qty * price;
                    const rowDirty = !!dirty[it.id];
                    return (
                      <tr key={it.id} className={`border-b border-slate-100 ${rowDirty ? "bg-amber-50" : "hover:bg-slate-50"}`} data-testid={`group-row-${it.id}`}>
                        <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="p-2">
                          <Input
                            className={`${inputCls} h-8`}
                            value={getValue(it, "item_name")}
                            onChange={(e) => setField(it.id, "item_name", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className={`${inputCls} h-8 text-xs`}
                            value={getValue(it, "category")}
                            onChange={(e) => setField(it.id, "category", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className={`${inputCls} h-8 text-xs font-mono`}
                            value={getValue(it, "project_no")}
                            onChange={(e) => setField(it.id, "project_no", e.target.value)}
                            placeholder="SO No"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className={`${inputCls} h-8 text-xs font-mono`}
                            value={getValue(it, "po_no")}
                            onChange={(e) => setField(it.id, "po_no", e.target.value)}
                            placeholder="PO No"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number" step="any"
                            className={`${inputCls} h-8 text-right`}
                            value={getValue(it, "qty")}
                            onChange={(e) => setField(it.id, "qty", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            className="h-8 w-full border border-slate-300 rounded-none px-1 text-sm bg-white"
                            value={getValue(it, "unit") || "Ea"}
                            onChange={(e) => setField(it.id, "unit", e.target.value)}
                          >
                            {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number" step="any"
                            className={`${inputCls} h-8 text-right`}
                            value={getValue(it, "unit_price")}
                            onChange={(e) => setField(it.id, "unit_price", e.target.value)}
                          />
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-800 font-semibold">
                          {total.toLocaleString("id-ID")}
                        </td>
                        <td className="p-2">
                          <Input
                            className={`${inputCls} h-8`}
                            value={getValue(it, "notes")}
                            onChange={(e) => setField(it.id, "notes", e.target.value)}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-sky-600 cursor-pointer"
                            data-testid={`stock-${it.id}`}
                            checked={!!getValue(it, "add_to_stock")}
                            onChange={(e) => setField(it.id, "add_to_stock", e.target.checked)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={11} className="p-6 text-center text-slate-400">Tidak ada item dalam grup ini</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter className="sticky bottom-0 bg-white border-t border-slate-200 -mx-6 px-6 py-3 mt-3">
          <Button variant="outline" onClick={onClose} className="rounded-none" data-testid="group-cancel-btn">Tutup</Button>
          <Button
            onClick={onSave}
            disabled={saving || dirtyCount === 0}
            data-testid="group-save-btn"
            className="rounded-none bg-slate-900 hover:bg-slate-800 text-white"
          >
            {saving ? "Menyimpan..." : `Simpan ${dirtyCount} Perubahan`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
