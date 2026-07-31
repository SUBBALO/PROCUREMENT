import React, { useEffect, useMemo, useState } from "react";
import api, { formatDateID, downloadXlsx } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { MagnifyingGlass, Package, Truck, Users, FileXls, Trash, Printer } from "@phosphor-icons/react";
import { toast } from "sonner";
import { SortDropdown, sortItems, cmpStr, cmpDateStr, cmpNum } from "../components/SortDropdown";

import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const IG_SORT_OPTS = [
  { value: "date_desc", label: "Tgl Terima: Baru → Lama", sort: (a, b) => cmpDateStr(b.receive_date, a.receive_date) },
  { value: "date_asc", label: "Tgl Terima: Lama → Baru", sort: (a, b) => cmpDateStr(a.receive_date, b.receive_date) },
  { value: "vendor_asc", label: "Vendor: A → Z", sort: (a, b) => cmpStr(a.vendor_name, b.vendor_name) },
  { value: "vendor_desc", label: "Vendor: Z → A", sort: (a, b) => cmpStr(b.vendor_name, a.vendor_name) },
  { value: "item_asc", label: "Barang: A → Z", sort: (a, b) => cmpStr(a.item_name, b.item_name) },
  { value: "item_desc", label: "Barang: Z → A", sort: (a, b) => cmpStr(b.item_name, a.item_name) },
  { value: "qty_desc", label: "Qty: Besar → Kecil", sort: (a, b) => cmpNum(b.qty_received, a.qty_received) },
  { value: "qty_asc", label: "Qty: Kecil → Besar", sort: (a, b) => cmpNum(a.qty_received, b.qty_received) },
];
const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

export default function IncomingReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [filters, setFilters] = useState({ start_date: "", end_date: today(), source: "", q: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sortBy, setSortBy] = useState("date_desc");

  const sortedRows = useMemo(() => sortItems(rows, sortBy, IG_SORT_OPTS), [rows, sortBy]);
  const pag = usePagination(sortedRows, 20);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.source) params.source = filters.source;
      if (filters.q.trim()) params.q = filters.q.trim();
      params.page_size = 500;
      const { data } = await api.get("/store/incoming-report", { params });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggleFlag = async (id, field, val) => {
    try {
      await api.patch(`/store/receipts/${id}/flags`, { [field]: val });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
      toast.success(`${field.toUpperCase()} diperbarui`);
    } catch {
      toast.error("Gagal update");
    }
  };

  const setF = (k, v) => setFilters((s) => ({ ...s, [k]: v }));

  const printMcl = async (row) => {
    try {
      const safe = (row.do_number || row.invoice_no || row.po_no || "MCL").toString().replace(/[/\s]/g, "_");
      await downloadXlsx(`/store/incoming/mcl/${row.id}`, {}, `MCL_${safe}_${row.receive_date || ""}.xlsx`);
      toast.success("Material Control Label berhasil dibuat");
    } catch (e) {
      toast.error(e.message || "Gagal buat MCL");
    }
  };

  const openPdfInNewTab = async (url, filename = "preview.pdf") => {
    // Iter 21 — Gunakan blob URL untuk bypass IDM / download manager yang intercept URL PDF.
    // Blob URLs (blob://...) tidak dianggap sebagai file download oleh IDM, jadi browser
    // otomatis buka di PDF viewer built-in. User bisa Ctrl+P untuk print.
    try {
      const resp = await api.get(url.replace(`${process.env.REACT_APP_BACKEND_URL || ""}/api`, ""), {
        responseType: "blob",
      });
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (win) win.document.title = filename;
      // Cleanup after 2 minutes to free memory
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (e) {
      // Fallback ke direct URL
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const previewMcl = (row) => {
    const url = `${(process.env.REACT_APP_BACKEND_URL || "")}/api/store/incoming/mcl/${row.id}/pdf`;
    const fname = `MCL_${(row.do_number || row.po_no || "receipt").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    openPdfInNewTab(url, fname);
  };

  const previewMif = (row) => {
    const url = `${(process.env.REACT_APP_BACKEND_URL || "")}/api/store/incoming/mif/${row.id}/pdf`;
    const fname = `MIF_${(row.do_number || row.po_no || "receipt").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    openPdfInNewTab(url, fname);
  };

  const [showManualModal, setShowManualModal] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);

  return (
    <div className="space-y-6">
            <BackLink />
<div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Incoming Goods
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Input & laporan barang masuk. Pilih cara input di bawah, atau langsung lihat riwayat.
        </p>
      </div>

      {/* Quick action cards: 2 shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          data-testid="ig-open-manual-modal"
          onClick={() => setShowManualModal(true)}
          className="text-left border-2 border-emerald-300 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 p-4 group transition-all"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 flex items-center justify-center border-2 border-emerald-400 bg-white">
              <Printer size={22} weight="duotone" className="text-emerald-700" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-emerald-700">Card 1</div>
              <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Input Manual</div>
            </div>
          </div>
          <div className="text-xs text-slate-600">Untuk barang datang tanpa PO (customer / supplier drop-in). Form terbuka sebagai modal.</div>
        </button>
        <button
          data-testid="ig-open-po-modal"
          onClick={() => setShowPoModal(true)}
          className="text-left border-2 border-sky-300 hover:border-sky-500 bg-sky-50 hover:bg-sky-100 p-4 group transition-all"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 flex items-center justify-center border-2 border-sky-400 bg-white">
              <Printer size={22} weight="duotone" className="text-sky-700" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-sky-700">Card 2</div>
              <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Tarik Data dari PO</div>
            </div>
          </div>
          <div className="text-xs text-slate-600">Untuk barang yang sudah ada PO di Purchasing. Sistem akan tarik detail otomatis.</div>
        </button>
      </div>

      {/* Modals for input forms via iframe */}
      {showManualModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center pt-8 px-4" onClick={() => setShowManualModal(false)} data-testid="ig-manual-modal">
          <div className="bg-white w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-emerald-50">
              <div className="text-sm font-bold text-emerald-900">Input Manual Barang Datang</div>
              <button onClick={() => setShowManualModal(false)} className="text-slate-500 hover:text-slate-900 text-lg">✕</button>
            </div>
            <iframe src="/store/manual-receive?embed=1" className="flex-1 w-full border-0" title="Manual Receive" />
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button onClick={() => { setShowManualModal(false); load(); }} className="text-xs uppercase font-bold text-slate-700 border border-slate-300 hover:bg-white px-3 py-1.5">Tutup & Refresh</button>
            </div>
          </div>
        </div>
      )}

      {showPoModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center pt-8 px-4" onClick={() => setShowPoModal(false)} data-testid="ig-po-modal">
          <div className="bg-white w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-sky-50">
              <div className="text-sm font-bold text-sky-900">Tarik Data dari PO</div>
              <button onClick={() => setShowPoModal(false)} className="text-slate-500 hover:text-slate-900 text-lg">✕</button>
            </div>
            <iframe src="/store/receive?embed=1" className="flex-1 w-full border-0" title="PO Receive" />
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button onClick={() => { setShowPoModal(false); load(); }} className="text-xs uppercase font-bold text-slate-700 border border-slate-300 hover:bg-white px-3 py-1.5">Tutup & Refresh</button>
            </div>
          </div>
        </div>
      )}

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tanggal</Label>
            <Input type="date" data-testid="ig-start-date" className={inputCls} value={filters.start_date} onChange={(e) => setF("start_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai</Label>
            <Input type="date" data-testid="ig-end-date" className={inputCls} value={filters.end_date} onChange={(e) => setF("end_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sumber</Label>
            <Select value={filters.source || "all"} onValueChange={(v) => setF("source", v === "all" ? "" : v)}>
              <SelectTrigger data-testid="ig-source" className="rounded-none h-9 border-slate-300 text-sm"><SelectValue placeholder="Semua" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="po">Dari PO Purchasing</SelectItem>
                <SelectItem value="manual">Input Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari</Label>
            <Input data-testid="ig-search" className={inputCls} value={filters.q} onChange={(e) => setF("q", e.target.value)} placeholder="Barang / vendor / PO / DO" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Urutkan</Label>
            <SortDropdown testid="ig-sort" value={sortBy} onChange={setSortBy} options={IG_SORT_OPTS} />
          </div>
          <Button data-testid="ig-apply-btn" onClick={load} className="h-9 rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
            <MagnifyingGlass size={14} weight="bold" className="mr-1.5" /> Cari
          </Button>
          <Button
            data-testid="ig-export-btn"
            onClick={async () => {
              try {
                await downloadXlsx("/store/incoming-report/xlsx", {
                  start_date: filters.start_date, end_date: filters.end_date,
                  source: filters.source, q: filters.q,
                }, `incoming_goods_${filters.start_date || "all"}_${filters.end_date || "today"}.xlsx`);
                toast.success("Excel di-download");
              } catch (e) { toast.error(e.message || "Gagal export"); }
            }}
            variant="outline"
            className="h-9 rounded-none border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs uppercase tracking-[0.1em] font-semibold"
          >
            <FileXls size={14} weight="bold" className="mr-1.5" /> Export Excel
          </Button>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Data Incoming Goods</h3>
            <div className="text-[11px] text-slate-400 mt-0.5">Total: <b className="text-slate-700 tabular-nums">{total}</b> baris</div>
          </div>
          {isAdmin && selected.size > 0 && (
            <div className="flex items-center gap-2" data-testid="ig-bulk-bar">
              <span className="text-xs text-slate-700"><b className="tabular-nums">{selected.size}</b> dipilih</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set())}
                className="rounded-none h-8 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold"
                data-testid="ig-clear-selection-btn"
              >
                Batal
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmOpen(true)}
                className="rounded-none h-8 bg-red-600 hover:bg-red-700 text-white text-xs uppercase tracking-[0.1em] font-semibold"
                data-testid="ig-bulk-delete-btn"
              >
                <Trash size={12} weight="bold" className="mr-1" /> Hapus {selected.size} Baris
              </Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                {isAdmin && (
                  <th className="p-2 w-10 text-center">
                    <input
                      type="checkbox"
                      data-testid="ig-select-all"
                      className="w-4 h-4 accent-sky-600 cursor-pointer"
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set([...selected, ...rows.map((r) => r.id)]));
                        else { const nx = new Set(selected); rows.forEach((r) => nx.delete(r.id)); setSelected(nx); }
                      }}
                    />
                  </th>
                )}
                <th className="text-left p-2">Tgl Terima</th>
                <th className="text-left p-2">Sumber</th>
                <th className="text-left p-2">Vendor / Customer</th>
                <th className="text-left p-2">Barang</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-left p-2">Nomor SO</th>
                <th className="text-left p-2">PO / DO / Invoice</th>
                <th className="text-center p-2" title="Masuk Stok = tracked di inventory · Log Only = tercatat saja">Status</th>
                <th className="text-center p-2">MCL</th>
                <th className="text-center p-2">MIF</th>
              </tr>
            </thead>
            <tbody data-testid="ig-rows">
              {loading && (<tr><td colSpan={isAdmin ? 11 : 10} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={isAdmin ? 11 : 10} className="p-8 text-center text-slate-400"><Package size={22} weight="duotone" className="inline-block mr-2 text-slate-300" />Tidak ada data</td></tr>)}
              {sortedRows.length > 0 && pag.pagedData.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 ${selected.has(r.id) ? "bg-sky-50" : ""}`}>
                  {isAdmin && (
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        data-testid={`ig-select-${r.id}`}
                        className="w-4 h-4 accent-sky-600 cursor-pointer"
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const nx = new Set(selected);
                          if (e.target.checked) nx.add(r.id); else nx.delete(r.id);
                          setSelected(nx);
                        }}
                      />
                    </td>
                  )}
                  <td className="p-2 whitespace-nowrap text-slate-600">{formatDateID(r.receive_date)}</td>
                  <td className="p-2">
                    <div className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.05em] font-bold px-2 py-0.5 border ${r.source === "po" ? "bg-sky-50 text-sky-700 border-sky-200" : (r.is_customer_material ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-50 text-slate-700 border-slate-200")}`}>
                      {r.source === "po" ? <Package size={10} weight="bold" /> : (r.is_customer_material ? <Users size={10} weight="bold" /> : <Truck size={10} weight="bold" />)}
                      {r.source === "po" ? "PO" : (r.is_customer_material ? "Customer" : "Supplier")}
                    </div>
                  </td>
                  <td className="p-2 text-slate-900">{r.vendor_name}</td>
                  <td className="p-2 text-slate-900">{r.item_name} <span className="text-xs text-slate-400 uppercase">{r.unit}</span></td>
                  <td className="p-2 text-right tabular-nums">{r.qty_received}</td>
                  <td className="p-2 font-mono text-xs text-slate-700">{r.so_no || r.so_number || "-"}</td>
                  <td className="p-2 text-xs font-mono text-slate-600">
                    {r.po_no || "-"}{r.do_number ? ` / DO ${r.do_number}` : ""}{r.invoice_no ? ` / ${r.invoice_no}` : ""}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`text-[10px] uppercase tracking-[0.05em] font-bold px-2 py-0.5 border ${r.add_to_stock === false ? "bg-slate-50 text-slate-600 border-slate-300" : "bg-emerald-50 text-emerald-800 border-emerald-300"}`}>
                      {r.add_to_stock === false ? "✎ Log Only" : "✓ Masuk Stok"}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      data-testid={`ig-preview-mcl-${r.id}`}
                      onClick={() => previewMcl(r)}
                      title="Preview cetak MCL — buka PDF di tab baru, print/download dari sana"
                      className="inline-flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-sky-700 hover:bg-sky-800 px-2 py-1 rounded-none"
                    >
                      <Printer size={12} weight="bold" /> Preview MCL
                    </button>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      data-testid={`ig-preview-mif-${r.id}`}
                      onClick={() => previewMif(r)}
                      title="Preview cetak MIF — Material Issue Form (butuh template MIF di-upload dulu)"
                      className="inline-flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.05em] font-semibold text-white bg-amber-700 hover:bg-amber-800 px-2 py-1 rounded-none"
                    >
                      <Printer size={12} weight="bold" /> Preview MIF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="baris" testIdPrefix="ig-pag" />
      </Card>

      {/* Bulk delete confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-none max-h-[90vh] overflow-y-auto" data-testid="ig-delete-dialog">
          <DialogHeader>
            <DialogTitle>Hapus {selected.size} Data Incoming Goods?</DialogTitle>
            <DialogDescription>
              Baris yang dipilih akan dihapus permanen dari database. Kalau ada yang sudah dipakai (issuance), sistem akan menolak — Anda perlu hapus issuance-nya dulu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="rounded-none" disabled={deleting}>Batal</Button>
            <Button
              data-testid="ig-confirm-delete-btn"
              onClick={async () => {
                setDeleting(true);
                try {
                  const { data } = await api.post("/store/receipts/bulk-delete", { ids: Array.from(selected) });
                  toast.success(`${data.deleted} baris dihapus`);
                  setSelected(new Set());
                  setConfirmOpen(false);
                  load();
                } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
                finally { setDeleting(false); }
              }}
              disabled={deleting}
              className="rounded-none bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Menghapus..." : `Hapus ${selected.size} Baris`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
