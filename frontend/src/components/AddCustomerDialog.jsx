import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { UserPlus } from "@phosphor-icons/react";

/**
 * Popup wajib input Master Customer saat nama customer belum ada di master.
 * Dipakai di Create Sales Order & Quotation.
 *
 * Props:
 *  - open (bool)
 *  - initialName (string)  -> prefill nama
 *  - onClose ()
 *  - onSaved (customer)    -> dipanggil setelah berhasil simpan ke master
 */
export default function AddCustomerDialog({ open, initialName = "", onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", customer_code: "", pic: "", phone: "", email: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ name: initialName || "", customer_code: "", pic: "", phone: "", email: "", address: "", notes: "" });
    }
  }, [open, initialName]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nama customer wajib diisi"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/customers", {
        name: form.name.trim(),
        customer_code: form.customer_code.trim().toUpperCase(),
        pic: form.pic.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
      });
      toast.success(`Customer "${data.name}" ditambahkan ke Master`);
      onSaved && onSaved(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose && onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="add-customer-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <UserPlus size={20} weight="bold" /> Customer Belum Terdaftar
          </DialogTitle>
          <DialogDescription>
            Nama customer <b>"{initialName}"</b> belum ada di Master Customer. Lengkapi datanya dulu agar data customer rapi & bisa dipakai ulang.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Customer <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="add-cust-name" placeholder="PT. Contoh Sejahtera" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Kode Customer <span className="normal-case font-normal text-slate-400">(utk drawing)</span></Label>
            <Input value={form.customer_code} onChange={(e) => set("customer_code", e.target.value.toUpperCase())} data-testid="add-cust-code" placeholder="mis. CS" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">PIC / Attention</Label>
            <Input value={form.pic} onChange={(e) => set("pic", e.target.value)} data-testid="add-cust-pic" placeholder="Nama PIC" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Telepon</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="add-cust-phone" placeholder="08xxxx" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} data-testid="add-cust-email" placeholder="email@customer.com" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Alamat</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} data-testid="add-cust-address" placeholder="Alamat lengkap" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Catatan</Label>
            <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid="add-cust-notes" placeholder="Opsional" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onClose && onClose()} data-testid="add-cust-cancel">Batal</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-cust-save">
            {saving ? "Menyimpan…" : "Simpan & Lanjut"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
