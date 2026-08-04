import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "../lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { MagnifyingGlass, X, Plus, WarningCircle, CircleNotch } from "@phosphor-icons/react";
import { SOURCE_LABEL } from "../lib/carConstants";

/**
 * CarCreateModal — Terbitkan Corrective Action Report (CAR / NC) baru.
 * Diisi oleh CAR Initiator (QC / Produksi / Sales). Bisa menautkan >1 Drawing.
 */
export default function CarCreateModal({ open, onClose, onCreated }) {
  const [drawings, setDrawings] = useState([]);
  const [loadingDwg, setLoadingDwg] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // [{id, drawing_no, so_no, customer_name}]

  const [issuedTo, setIssuedTo] = useState("");
  const [expectedReply, setExpectedReply] = useState("");
  const [source, setSource] = useState("in_house");
  const [severity, setSeverity] = useState("major");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // reset
    setSearch(""); setSelected([]); setIssuedTo(""); setExpectedReply("");
    setSource("in_house"); setSeverity("major"); setTitle(""); setDescription("");
    setLoadingDwg(true);
    api.get("/drawings?limit=500")
      .then(({ data }) => setDrawings(data.items || []))
      .catch(() => setDrawings([]))
      .finally(() => setLoadingDwg(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selIds = new Set(selected.map((s) => s.id || s.drawing_no));
    let list = drawings.filter((d) => !selIds.has(d.id) && !selIds.has(d.drawing_no));
    if (q) {
      list = list.filter((d) =>
        (d.drawing_no || "").toLowerCase().includes(q) ||
        (d.so_no || "").toLowerCase().includes(q) ||
        (d.customer_name || "").toLowerCase().includes(q) ||
        (d.project_name || "").toLowerCase().includes(q)
      );
    }
    return list.slice(0, 40);
  }, [drawings, search, selected]);

  const addDrawing = (d) =>
    setSelected((cur) => [...cur, { id: d.id, drawing_no: d.drawing_no, so_no: d.so_no, customer_name: d.customer_name }]);
  const removeDrawing = (idx) => setSelected((cur) => cur.filter((_, i) => i !== idx));

  const submit = async () => {
    if (selected.length === 0) { toast.error("Pilih minimal satu Drawing"); return; }
    if (!description.trim()) { toast.error("Deskripsi ketidaksesuaian wajib diisi"); return; }
    setSaving(true);
    try {
      const payload = {
        drawings: selected.map((s) => ({ drawing_id: s.id || "", drawing_no: s.drawing_no || "" })),
        issued_to: issuedTo.trim(),
        expected_reply_date: expectedReply,
        source, severity,
        title: title.trim(),
        description: description.trim(),
      };
      const { data } = await api.post("/nonconformance", payload);
      toast.success(`CAR ${data.nc_no} berhasil diterbitkan`);
      onCreated && onCreated(data);
      onClose && onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal menerbitkan CAR");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose && onClose()}>
      <DialogContent className="max-w-3xl rounded-none p-0 gap-0 max-h-[92vh] overflow-hidden flex flex-col" data-testid="car-create-modal">
        <DialogHeader className="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-rose-600">
            <WarningCircle size={14} weight="fill" /> MKS-F-QAD-004 · Rev.02
          </div>
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Terbitkan Corrective Action Report (CAR)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Bagian ini diisi oleh <b>CAR Initiator</b> (QC / Produksi / Sales). Nomor CAR dibuat otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Drawing picker */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Drawing Terkait *</Label>
            <p className="text-[11px] text-slate-400 mb-1.5">Bisa memilih lebih dari satu drawing.</p>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2" data-testid="car-selected-drawings">
                {selected.map((s, i) => (
                  <span key={s.id || s.drawing_no} className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-300 text-indigo-800 text-[11px] font-mono px-2 py-1">
                    {s.drawing_no}
                    <button type="button" onClick={() => removeDrawing(i)} className="text-indigo-500 hover:text-rose-600" data-testid={`car-remove-dwg-${i}`}>
                      <X size={12} weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 border border-slate-300 px-2 h-9 bg-white">
              <MagnifyingGlass size={14} className="text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari drawing no / SO / customer..."
                className="flex-1 text-sm outline-none"
                data-testid="car-drawing-search"
              />
            </div>
            <div className="mt-1 border border-slate-200 max-h-44 overflow-y-auto divide-y divide-slate-100">
              {loadingDwg && <div className="p-3 text-center text-slate-400 text-xs flex items-center justify-center gap-2"><CircleNotch size={14} className="animate-spin" /> Memuat drawing…</div>}
              {!loadingDwg && filtered.length === 0 && <div className="p-3 text-center text-slate-400 text-xs">Tidak ada drawing cocok.</div>}
              {!loadingDwg && filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => addDrawing(d)}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50/60 flex items-center gap-2 transition-colors"
                  data-testid={`car-drawing-opt-${d.drawing_no}`}
                >
                  <Plus size={13} weight="bold" className="text-indigo-500 shrink-0" />
                  <span className="font-mono text-xs text-slate-800">{d.drawing_no}</span>
                  <span className="text-[11px] text-slate-400 truncate">· SO {d.so_no || "-"} · {d.customer_name || "-"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Issued To</Label>
              <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="Dept / penanggung jawab" className="rounded-none h-9 mt-1" data-testid="car-issued-to" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Expected Reply Date</Label>
              <Input type="date" value={expectedReply} onChange={(e) => setExpectedReply(e.target.value)} className="rounded-none h-9 mt-1" data-testid="car-expected-reply" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Sumber Ketidaksesuaian</Label>
              <div className="flex gap-2 mt-1">
                {["in_house", "external"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className={`flex-1 h-9 text-xs font-bold uppercase tracking-wider border transition-colors ${
                      source === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"
                    }`}
                    data-testid={`car-source-${s}`}
                  >
                    {SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Severity</Label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full h-9 border border-slate-300 text-sm px-2 mt-1 bg-white" data-testid="car-severity">
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Judul Singkat</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ringkasan masalah (opsional)" className="rounded-none h-9 mt-1" data-testid="car-title" />
          </div>

          <div>
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Description of Nonconformance *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Jelaskan temuan ketidaksesuaian secara detail (lokasi, dimensi, indikasi, dll.)" className="rounded-none mt-1" data-testid="car-description" />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} className="rounded-none" data-testid="car-create-cancel">Batal</Button>
          <Button onClick={submit} disabled={saving} className="rounded-none bg-rose-600 hover:bg-rose-700" data-testid="car-create-submit">
            {saving ? <><CircleNotch size={14} className="animate-spin mr-1" /> Menyimpan…</> : "Terbitkan CAR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
