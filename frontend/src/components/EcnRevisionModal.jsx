import React, { useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "./ui/dialog";
import { FileText, CheckCircle, ArrowClockwise } from "@phosphor-icons/react";

const M4 = [["man", "Man"], ["machine", "Machine"], ["method", "Method"], ["material", "Material"]];
const ITEMS = [["process", "Process"], ["materials", "Materials"], ["inspection", "Inspection"], ["subcon", "Sub-contractor Process"], ["design_spec", "Design / Spec"], ["packing", "Packing"], ["other", "Other"]];
const PURPOSE = [["customer_request", "Customer Request"], ["customer_complaint", "Customer Complaint"], ["quality_improvement", "Quality Improvement"], ["others", "Others"]];
const AFFECTED = [["drawing_spec", "Drawing / Spec #"], ["sop_wip", "SOP / WIP #"], ["others", "Others"]];

function ChipGroup({ options, value, onChange, testid }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testid}>
      {options.map(([k, label]) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" onClick={() => toggle(k)}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors ${on ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}
            data-testid={`${testid}-${k}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function EcnRevisionModal({ drawing, open, onClose, onDone }) {
  const [f, setF] = useState({
    ecr_no: "", scope: "both", m4: [], item_of_change: [], item_other: "", change_type: "permanent",
    expired_date: "", current_desc: "", proposed_desc: "", purpose: [], purpose_other: "",
    purpose_explanation: "", effective_date: "", affected_document: ["drawing_spec"], affected_other: "",
  });
  const [busy, setBusy] = useState(false);
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.current_desc.trim() || !f.proposed_desc.trim()) return toast.error("Kolom 'Current' dan 'Proposed' wajib diisi");
    setBusy(true);
    try {
      const { data } = await api.post(`/drawings/${drawing.id}/request-revision`, f);
      toast.success(`ECN diajukan: ${data.ecn_no} — menunggu keputusan Eng Leader`);
      onDone?.();
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengajukan ECN");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[88vh] overflow-y-auto rounded-none" data-testid="ecn-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} weight="bold" className="text-indigo-600" /> Engineering Change Notice (ECN)
          </DialogTitle>
          <DialogDescription>
            Form MKS-F-ENG-004. Ajukan revisi drawing <b className="font-mono">{drawing.drawing_no}</b> ke Eng Leader. No. ECN dibuat otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          {/* Scope revisi — bagian yang akan dibuka untuk direvisi */}
          <div className="border-2 border-amber-400 bg-amber-50 p-3">
            <Label className="text-[11px] uppercase tracking-widest font-bold text-amber-800">Yang Direvisi <span className="text-rose-600">*</span></Label>
            <div className="text-[11px] text-slate-600 mb-2">Pilih bagian yang akan dibuka untuk direvisi. Hanya bagian terpilih yang di-reset & naik Rev.</div>
            <div className="grid grid-cols-3 gap-2">
              {[["drawing", "Drawing saja"], ["bom", "BOM saja"], ["both", "Drawing & BOM"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => up("scope", k)}
                  className={`px-2 py-2 text-[12px] font-bold uppercase tracking-wider border-2 transition-colors ${f.scope === k ? "bg-amber-600 text-white border-amber-700" : "bg-white text-slate-600 border-slate-300 hover:border-amber-400"}`}
                  data-testid={`ecn-scope-${k}`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Info auto */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 border border-slate-200 p-2 text-[12px]">
            <div><span className="text-slate-400">SO No</span><div className="font-mono font-semibold">{drawing.so_no || "-"}</div></div>
            <div><span className="text-slate-400">Customer</span><div className="font-semibold">{drawing.customer_name || "-"}</div></div>
            <div><span className="text-slate-400">DWG No</span><div className="font-mono font-semibold">{drawing.drawing_no || "-"}</div></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>ECR No (opsional)</Label>
              <Input value={f.ecr_no} onChange={(e) => up("ecr_no", e.target.value)} className="rounded-none" data-testid="ecn-ecr-no" /></div>
            <div className="space-y-1.5"><Label>4M</Label>
              <ChipGroup options={M4} value={f.m4} onChange={(v) => up("m4", v)} testid="ecn-m4" /></div>
          </div>

          <div className="space-y-1.5"><Label>Item of Change</Label>
            <ChipGroup options={ITEMS} value={f.item_of_change} onChange={(v) => up("item_of_change", v)} testid="ecn-item" />
            {f.item_of_change.includes("other") && (
              <Input value={f.item_other} onChange={(e) => up("item_other", e.target.value)} placeholder="Sebutkan item lain..." className="rounded-none mt-1" data-testid="ecn-item-other" />)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Type</Label>
              <div className="flex gap-2">
                {[["permanent", "Permanent"], ["temporary", "Temporary"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => up("change_type", k)}
                    className={`px-3 py-1.5 text-[11px] font-bold uppercase border ${f.change_type === k ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-600 border-slate-300"}`}
                    data-testid={`ecn-type-${k}`}>{l}</button>
                ))}
              </div>
            </div>
            {f.change_type === "temporary" && (
              <div className="space-y-1.5"><Label>Expired Date</Label>
                <Input type="date" value={f.expired_date} onChange={(e) => up("expired_date", e.target.value)} className="rounded-none" data-testid="ecn-expired" /></div>
            )}
          </div>

          <div className="space-y-1.5"><Label>Current <span className="text-rose-600">*</span></Label>
            <Textarea rows={2} value={f.current_desc} onChange={(e) => up("current_desc", e.target.value)} className="rounded-none" placeholder="Kondisi/spesifikasi saat ini..." data-testid="ecn-current" /></div>
          <div className="space-y-1.5"><Label>Proposed <span className="text-rose-600">*</span></Label>
            <Textarea rows={2} value={f.proposed_desc} onChange={(e) => up("proposed_desc", e.target.value)} className="rounded-none" placeholder="Perubahan yang diusulkan..." data-testid="ecn-proposed" /></div>

          <div className="space-y-1.5"><Label>Purpose of Change</Label>
            <ChipGroup options={PURPOSE} value={f.purpose} onChange={(v) => up("purpose", v)} testid="ecn-purpose" />
            {f.purpose.includes("others") && (
              <Input value={f.purpose_other} onChange={(e) => up("purpose_other", e.target.value)} placeholder="Sebutkan tujuan lain..." className="rounded-none mt-1" data-testid="ecn-purpose-other" />)}
            <Textarea rows={2} value={f.purpose_explanation} onChange={(e) => up("purpose_explanation", e.target.value)} className="rounded-none mt-1" placeholder="Penjelasan singkat tujuan perubahan..." data-testid="ecn-purpose-exp" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Effective Date</Label>
              <Input type="date" value={f.effective_date} onChange={(e) => up("effective_date", e.target.value)} className="rounded-none" data-testid="ecn-effective" /></div>
            <div className="space-y-1.5"><Label>Affected Document</Label>
              <ChipGroup options={AFFECTED} value={f.affected_document} onChange={(v) => up("affected_document", v)} testid="ecn-affected" />
              {f.affected_document.includes("others") && (
                <Input value={f.affected_other} onChange={(e) => up("affected_other", e.target.value)} placeholder="Sebutkan..." className="rounded-none mt-1" data-testid="ecn-affected-other" />)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose} disabled={busy} data-testid="ecn-cancel">Batal</Button>
          <Button className="rounded-none bg-indigo-600 hover:bg-indigo-700 text-white" onClick={submit} disabled={busy} data-testid="ecn-submit">
            {busy ? <><ArrowClockwise size={15} className="animate-spin mr-1.5" /> Mengirim...</> : <><CheckCircle size={15} weight="bold" className="mr-1.5" /> Ajukan ECN</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
