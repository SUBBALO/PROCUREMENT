import React, { useEffect, useState } from "react";
import api, { formatDateID, downloadXlsx } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { MagnifyingGlass, Package, Truck, Users, FileXls, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Laporan Incoming Goods
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gabungan barang masuk dari <b>PO Purchasing</b> + <b>Input manual</b> (customer/supplier). Centang MCL & MIF di sini setelah diproses.
        </p>
      </div>

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
                <th className="text-center p-2">Ke Stok?</th>
                <th className="text-center p-2">MCL</th>
                <th className="text-center p-2">MIF</th>
              </tr>
            </thead>
            <tbody data-testid="ig-rows">
              {loading && (<tr><td colSpan={isAdmin ? 11 : 10} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={isAdmin ? 11 : 10} className="p-8 text-center text-slate-400"><Package size={22} weight="duotone" className="inline-block mr-2 text-slate-300" />Tidak ada data</td></tr>)}
              {rows.map((r) => (
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
                    <span className={`text-[10px] uppercase tracking-[0.05em] font-bold px-2 py-0.5 border ${r.add_to_stock === false ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                      {r.add_to_stock === false ? "Tidak" : "Ya"}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <input type="checkbox" data-testid={`ig-mcl-${r.id}`} className="w-4 h-4 accent-emerald-600 cursor-pointer" checked={!!r.mcl_done} onChange={(e) => toggleFlag(r.id, "mcl_done", e.target.checked)} />
                  </td>
                  <td className="p-2 text-center">
                    <input type="checkbox" data-testid={`ig-mif-${r.id}`} className="w-4 h-4 accent-emerald-600 cursor-pointer" checked={!!r.mif_done} onChange={(e) => toggleFlag(r.id, "mif_done", e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bulk delete confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-none" data-testid="ig-delete-dialog">
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
