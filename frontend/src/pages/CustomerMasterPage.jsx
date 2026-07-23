import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Users, ArrowLeft, Plus, PencilSimple, Trash, MagnifyingGlass } from "@phosphor-icons/react";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

export default function CustomerMasterPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "sales" || user?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);  // customer being edited (or empty for create)
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = q.trim() ? { q: q.trim() } : {};
      const { data } = await api.get("/customers", { params });
      setItems(data.items || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); } finally { setLoading(false); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing({ name: "", address: "", pic: "", phone: "", email: "", notes: "" }); setShowDialog(true); };
  const openEdit = (c) => { setEditing({ ...c }); setShowDialog(true); };
  const doDelete = async (c) => {
    if (!window.confirm(`Hapus customer "${c.name}"?`)) return;
    try { await api.delete(`/customers/${c.id}`); toast.success("Customer dihapus"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };
  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Nama customer wajib");
    try {
      if (editing.id) { await api.put(`/customers/${editing.id}`, editing); toast.success("Customer diupdate"); }
      else { await api.post("/customers", editing); toast.success("Customer ditambahkan"); }
      setShowDialog(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan"); }
  };

  return (
    <div className="max-w-[1200px] mx-auto p-6 space-y-5">
      <Link to="/sales" className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900" data-testid="cust-back-btn">
        <ArrowLeft size={12} weight="bold" /> Kembali ke Sales Sub-Portal
      </Link>

      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users size={22} weight="duotone" className="text-sky-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Master Customer</h1>
          </div>
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Data customer + PIC. Autocomplete saat buat Quotation.</p>
        </div>
        {canEdit && <Button data-testid="new-customer-btn" onClick={openCreate} className="rounded-none bg-sky-600 hover:bg-sky-700 text-white text-xs uppercase tracking-[0.1em]"><Plus size={14} weight="bold" className="mr-1.5" /> Tambah Customer</Button>}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-md">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari Customer</Label>
          <Input data-testid="cust-search" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Nama atau PIC" />
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" /></Button>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          {items.length} Customer
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Nama</th>
                <th className="text-left p-3">Alamat</th>
                <th className="text-left p-3">PIC</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">Email</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="cust-table">
              {loading && (<tr><td colSpan={6} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">Belum ada customer.</td></tr>)}
              {items.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="p-3 text-slate-700 text-xs max-w-[280px]">{c.address || "-"}</td>
                  <td className="p-3 text-slate-700 text-xs">{c.pic || "-"}</td>
                  <td className="p-3 text-slate-600 text-xs">{c.phone || "-"}</td>
                  <td className="p-3 text-slate-600 text-xs">{c.email || "-"}</td>
                  <td className="p-3 text-center">
                    {canEdit && (
                      <div className="inline-flex gap-1">
                        <button data-testid={`edit-cust-${c.id}`} onClick={() => openEdit(c)} className="p-1 text-slate-500 hover:text-sky-600 border border-slate-300 rounded-none"><PencilSimple size={12} weight="bold" /></button>
                        <button onClick={() => doDelete(c)} className="p-1 text-slate-500 hover:text-red-600 border border-slate-300 rounded-none"><Trash size={12} weight="bold" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="rounded-none max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Customer" : "Tambah Customer"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Customer *</Label><Input data-testid="cust-name" className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="PT. SPM Oil & Gas" /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Alamat</Label><textarea data-testid="cust-address" className="w-full min-h-[60px] rounded-none border border-slate-300 p-2 text-sm" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">PIC (Person In Charge)</Label><Input data-testid="cust-pic" className={inputCls} value={editing.pic} onChange={(e) => setEditing({ ...editing, pic: e.target.value })} placeholder="Mr. John Doe" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Phone</Label><Input className={inputCls} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Email</Label><Input className={inputCls} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              </div>
              <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Catatan</Label><Input className={inputCls} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-none">Batal</Button>
            <Button data-testid="cust-save" onClick={save} className="rounded-none bg-sky-600 hover:bg-sky-700 text-white">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
