import React, { useEffect, useState, useCallback, useRef } from "react";
import api, { formatRupiah, formatDateID } from "../lib/api";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
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
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
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
        invoice_no: t.invoice_no || "",
        po_date: t.po_date || null,
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

  return (
    <div className="space-y-6">
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
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Tanggal</th>
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Toko</th>
                <th className="text-left p-3">Nama Barang</th>
                <th className="text-left p-3">SO / PO</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-right p-3">Harga</th>
                <th className="text-right p-3">Total</th>
                <th className="text-center p-3 w-20">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="transactions-table">
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center p-8 text-slate-400 text-sm">
                    Memuat data...
                  </td>
                </tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center p-8 text-slate-400 text-sm" data-testid="empty-state">
                    Tidak ada data. Klik "Input Transaksi" atau "Import Excel" untuk mulai.
                  </td>
                </tr>
              )}
              {!loading &&
                data.items.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`tx-row-${t.id}`}>
                    <td className="p-3 whitespace-nowrap text-slate-700">{formatDateID(t.invoice_date)}</td>
                    <td className="p-3 whitespace-nowrap text-slate-700 font-mono text-xs">{t.invoice_no || "-"}</td>
                    <td className="p-3 text-slate-900">{t.vendor_name}</td>
                    <td className="p-3 text-slate-900 max-w-[300px] truncate" title={t.item_name}>{t.item_name}</td>
                    <td className="p-3 text-slate-600 text-xs">
                      {t.project_no || "-"} / {t.po_no || "-"}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {t.qty} <span className="text-slate-400 text-xs">{t.unit}</span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-700">{formatRupiah(t.unit_price)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-slate-900">{formatRupiah(t.total_price)}</td>
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
                ))}
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
        <DialogContent className="max-w-2xl rounded-none" data-testid="edit-dialog">
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
        <DialogContent className="rounded-none" data-testid="delete-dialog">
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
        <DialogContent className="rounded-none" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle>Import Excel</DialogTitle>
            <DialogDescription>
              Upload file Excel (.xlsx). Format kolom mengikuti template ekspor. Kolom minimal: Tanggal, Toko, Nama Barang, Qty, Harga.
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
    </div>
  );
}
