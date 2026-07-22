import React, { useEffect, useState, useCallback } from "react";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Plus, PencilSimple, Trash, MagnifyingGlass, ClipboardText, Upload } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

export default function SOMasterPage() {
  const { user } = useAuth();
  const canWrite = user && user.role !== "finance" && user.role !== "store";
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null); // form data or null
  const [del, setDel] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/sales-orders", { params: q ? { q } : {} }); setList(data); }
    catch { toast.error("Gagal muat"); } finally { setLoading(false); }
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const openCreate = () => setDlg({ so_no: "", so_date: today(), customer: "", description: "" });
  const openEdit = (s) => setDlg({ ...s });

  const save = async () => {
    if (!dlg.so_no.trim() || !dlg.customer.trim()) return toast.error("Nomor SO & Customer wajib");
    try {
      if (dlg.id) await api.put(`/sales-orders/${dlg.id}`, dlg);
      else await api.post("/sales-orders", dlg);
      toast.success("Tersimpan");
      setDlg(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const doDelete = async () => {
    try { await api.delete(`/sales-orders/${del.id}`); toast.success("Dihapus"); setDel(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const doImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const { data } = await api.post("/sales-orders/import/xlsx", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${data.inserted} SO diimport (${data.skipped_duplicates || 0} duplikat dilewati)`);
      setImportOpen(false); setImportFile(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal import"); }
    finally { setImporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            <ClipboardText size={28} weight="duotone" className="text-emerald-600" /> Master Sales Order (SO)
          </h1>
          <p className="text-sm text-slate-500 mt-1">Daftar nomor project — {list.length.toLocaleString("id-ID")} SO.</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button data-testid="import-so-btn" onClick={() => setImportOpen(true)} variant="outline" className="rounded-none h-9 border-slate-300 text-xs uppercase tracking-[0.1em] font-semibold">
              <Upload size={14} weight="bold" className="mr-1.5" /> Import Excel
            </Button>
            <Button data-testid="add-so-btn" onClick={openCreate} className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
              <Plus size={14} weight="bold" className="mr-1.5" /> Tambah SO
            </Button>
          </div>
        )}
      </div>

      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="relative max-w-md">
          <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className={`${inputCls} pl-9`} placeholder="Cari SO / customer / deskripsi..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Tanggal</th>
                <th className="text-left p-3">Nomor SO</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Deskripsi</th>
                {canWrite && <th className="text-center p-3 w-24">Aksi</th>}
              </tr>
            </thead>
            <tbody data-testid="so-table">
              {loading && (<tr><td colSpan={5} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && list.length === 0 && (<tr><td colSpan={5} className="p-6 text-center text-slate-400">Belum ada SO</td></tr>)}
              {list.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap text-slate-600">{formatDateID(s.so_date)}</td>
                  <td className="p-3 font-mono text-xs font-semibold text-slate-900">{s.so_no}</td>
                  <td className="p-3">{s.customer}</td>
                  <td className="p-3 text-slate-600 max-w-[500px]">{s.description}</td>
                  {canWrite && (
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-sky-600"><PencilSimple size={14} weight="bold" /></button>
                        <button onClick={() => setDel(s)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash size={14} weight="bold" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent className="rounded-none max-w-lg">
          <DialogHeader>
            <DialogTitle>{dlg?.id ? "Edit" : "Tambah"} Sales Order</DialogTitle>
            <DialogDescription>Master nomor SO (project).</DialogDescription>
          </DialogHeader>
          {dlg && (
            <div className="grid gap-3">
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Tanggal SO *</Label><Input type="date" className={inputCls} value={dlg.so_date} onChange={(e) => setDlg({ ...dlg, so_date: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Nomor SO *</Label><Input data-testid="so-no" className={`${inputCls} font-mono`} value={dlg.so_no} onChange={(e) => setDlg({ ...dlg, so_no: e.target.value })} placeholder="mis. 4413" /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Customer *</Label><Input data-testid="so-customer" className={inputCls} value={dlg.customer} onChange={(e) => setDlg({ ...dlg, customer: e.target.value })} placeholder="mis. PT ABC" /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Deskripsi Project</Label><Input className={inputCls} value={dlg.description} onChange={(e) => setDlg({ ...dlg, description: e.target.value })} placeholder="mis. Fabrikasi tangki 20 KL" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)} className="rounded-none">Batal</Button>
            <Button data-testid="save-so-btn" onClick={save} className="rounded-none bg-slate-900 hover:bg-slate-800 text-white">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Hapus SO?</DialogTitle>
            <DialogDescription>Yakin hapus <b>{del?.so_no}</b> — {del?.customer}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)} className="rounded-none">Batal</Button>
            <Button onClick={doDelete} className="rounded-none bg-red-600 hover:bg-red-700 text-white">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Import SO dari Excel</DialogTitle>
            <DialogDescription>
              Upload file Excel (.xlsx) dengan kolom: <b>Nomor SO</b>, <b>Tanggal</b>, <b>Customer</b>, <b>Description</b>.
              Duplikat (nomor SO sudah ada) akan dilewati otomatis.
            </DialogDescription>
          </DialogHeader>
          <input
            type="file"
            accept=".xlsx"
            data-testid="so-import-file"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:py-2 file:px-4 file:rounded-none file:border file:border-slate-300 file:bg-white file:text-slate-700 file:text-xs file:uppercase file:tracking-[0.1em] file:font-semibold hover:file:bg-slate-50"
          />
          {importFile && <div className="mt-2 text-xs text-slate-500">File: <b>{importFile.name}</b></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} className="rounded-none">Batal</Button>
            <Button data-testid="confirm-so-import" onClick={doImport} disabled={importing || !importFile} className="rounded-none bg-slate-900 hover:bg-slate-800">
              {importing ? "Mengimpor..." : "Upload & Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
