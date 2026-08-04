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
import { MagnifyingGlass, X, Plus, WarningCircle, CircleNotch, Info } from "@phosphor-icons/react";
import { SOURCE_LABEL, DEPARTMENTS, LINK_TYPES } from "../lib/carConstants";

/**
 * CarCreateModal — Terbitkan Corrective Action Report (CAR / NC).
 * CAR berlaku SEMUA departemen: bisa terhadap Drawing, atau objek/proses lain
 * (mis. hasil kerja produksi, barang salah terima di Store, dll).
 */
export default function CarCreateModal({ open, onClose, onCreated }) {
  // link
  const [linkType, setLinkType] = useState("process_general");
  const [drawings, setDrawings] = useState([]);
  const [loadingDwg, setLoadingDwg] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [objectRef, setObjectRef] = useState("");
  const [soNo, setSoNo] = useState("");

  // issued to
  const [toDept, setToDept] = useState("");
  const [toUsers, setToUsers] = useState([]);
  const [toUserId, setToUserId] = useState("");
  const [expectedReply, setExpectedReply] = useState("");

  // section 1
  const [source, setSource] = useState("in_house");
  const [severity, setSeverity] = useState("major");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLinkType("process_general"); setSelected([]); setSearch(""); setObjectRef(""); setSoNo("");
    setToDept(""); setToUserId(""); setToUsers([]); setExpectedReply("");
    setSource("in_house"); setSeverity("major"); setTitle(""); setDescription("");
  }, [open]);

  // load drawings only when needed
  useEffect(() => {
    if (open && linkType === "drawing" && drawings.length === 0) {
      setLoadingDwg(true);
      api.get("/drawings?limit=500")
        .then(({ data }) => setDrawings(data.items || []))
        .catch(() => setDrawings([]))
        .finally(() => setLoadingDwg(false));
    }
  }, [open, linkType]); // eslint-disable-line

  // load users of target dept
  useEffect(() => {
    setToUserId("");
    if (open && toDept) {
      api.get(`/nonconformance/assignable-users?dept=${toDept}`)
        .then(({ data }) => setToUsers(data.users || []))
        .catch(() => setToUsers([]));
    } else {
      setToUsers([]);
    }
  }, [open, toDept]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selIds = new Set(selected.map((s) => s.id || s.drawing_no));
    let list = drawings.filter((d) => !selIds.has(d.id) && !selIds.has(d.drawing_no));
    if (q) {
      list = list.filter((d) =>
        (d.drawing_no || "").toLowerCase().includes(q) ||
        (d.so_no || "").toLowerCase().includes(q) ||
        (d.customer_name || "").toLowerCase().includes(q) ||
        (d.project_name || "").toLowerCase().includes(q));
    }
    return list.slice(0, 40);
  }, [drawings, search, selected]);

  const addDrawing = (d) => setSelected((c) => [...c, { id: d.id, drawing_no: d.drawing_no }]);
  const removeDrawing = (i) => setSelected((c) => c.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!toDept) { toast.error("Pilih departemen tujuan (Issued To)"); return; }
    if (!description.trim() && !title.trim()) { toast.error("Deskripsi ketidaksesuaian wajib diisi"); return; }
    if (linkType === "drawing" && selected.length === 0) { toast.error("Pilih minimal satu Drawing"); return; }
    if (linkType === "so" && !objectRef.trim() && !soNo.trim()) { toast.error("Isi No. SO yang kena NC"); return; }
    if (linkType !== "drawing" && linkType !== "so" && !objectRef.trim()) { toast.error("Isi objek yang kena NC"); return; }
    setSaving(true);
    try {
      const toUser = toUsers.find((u) => u.id === toUserId);
      const payload = {
        issued_to_dept: toDept,
        issued_to_user_id: toUserId || "",
        issued_to_user_name: toUser?.name || "",
        expected_reply_date: expectedReply,
        link_type: linkType,
        drawings: linkType === "drawing" ? selected.map((s) => ({ drawing_id: s.id || "", drawing_no: s.drawing_no || "" })) : [],
        object_ref: linkType !== "drawing" ? objectRef.trim() : "",
        so_no: soNo.trim(),
        source, severity, title: title.trim(), description: description.trim(),
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
            Berlaku untuk <b>semua departemen</b> — terhadap Drawing atau objek/proses lain. Nomor CAR dibuat otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Issued To */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Ditujukan Ke (Dept) *</Label>
              <select value={toDept} onChange={(e) => setToDept(e.target.value)} className="w-full h-9 border border-slate-300 text-sm px-2 mt-1 bg-white" data-testid="car-to-dept">
                <option value="">— Pilih departemen —</option>
                {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">User (opsional)</Label>
              <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} disabled={!toDept} className="w-full h-9 border border-slate-300 text-sm px-2 mt-1 bg-white disabled:bg-slate-50" data-testid="car-to-user">
                <option value="">— Seluruh dept —</option>
                {toUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Expected Reply Date</Label>
              <Input type="date" value={expectedReply} onChange={(e) => setExpectedReply(e.target.value)} className="rounded-none h-9 mt-1" data-testid="car-expected-reply" />
            </div>
          </div>

          {/* Link type */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Objek yang Kena NC *</Label>
            <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="w-full h-9 border border-slate-300 text-sm px-2 mt-1 bg-white" data-testid="car-linktype">
              {LINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {linkType === "drawing" && (
              <div className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1">
                <Info size={13} className="mt-0.5 shrink-0" /> NC bertipe Drawing akan memengaruhi <b>KPI #1 Engineering</b> pada bulan penerbitan.
              </div>
            )}
          </div>

          {/* Drawing picker */}
          {linkType === "drawing" && (
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Pilih Drawing * (bisa lebih dari satu)</Label>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 my-2" data-testid="car-selected-drawings">
                  {selected.map((s, i) => (
                    <span key={s.id || s.drawing_no} className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-300 text-indigo-800 text-[11px] font-mono px-2 py-1">
                      {s.drawing_no}
                      <button type="button" onClick={() => removeDrawing(i)} className="text-indigo-500 hover:text-rose-600" data-testid={`car-remove-dwg-${i}`}><X size={12} weight="bold" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 border border-slate-300 px-2 h-9 bg-white mt-1">
                <MagnifyingGlass size={14} className="text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari drawing no / SO / customer..." className="flex-1 text-sm outline-none" data-testid="car-drawing-search" />
              </div>
              <div className="mt-1 border border-slate-200 max-h-40 overflow-y-auto divide-y divide-slate-100">
                {loadingDwg && <div className="p-3 text-center text-slate-400 text-xs flex items-center justify-center gap-2"><CircleNotch size={14} className="animate-spin" /> Memuat…</div>}
                {!loadingDwg && filtered.length === 0 && <div className="p-3 text-center text-slate-400 text-xs">Tidak ada drawing cocok.</div>}
                {!loadingDwg && filtered.map((d) => (
                  <button key={d.id} type="button" onClick={() => addDrawing(d)} className="w-full text-left px-3 py-2 hover:bg-indigo-50/60 flex items-center gap-2" data-testid={`car-drawing-opt-${d.drawing_no}`}>
                    <Plus size={13} weight="bold" className="text-indigo-500 shrink-0" />
                    <span className="font-mono text-xs text-slate-800">{d.drawing_no}</span>
                    <span className="text-[11px] text-slate-400 truncate">· SO {d.so_no || "-"} · {d.customer_name || "-"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Object ref (non-drawing) */}
          {linkType !== "drawing" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Objek / Referensi {linkType === "so" ? "" : "*"}</Label>
                <Input value={objectRef} onChange={(e) => setObjectRef(e.target.value)} placeholder="mis. Part XYZ, Vendor ABC, proses welding" className="rounded-none h-9 mt-1" data-testid="car-object-ref" />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">SO No. {linkType === "so" ? "*" : "(opsional)"}</Label>
                <Input value={soNo} onChange={(e) => setSoNo(e.target.value)} placeholder="SO terkait" className="rounded-none h-9 mt-1" data-testid="car-so" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Sumber</Label>
              <div className="flex gap-2 mt-1">
                {["in_house", "external"].map((s) => (
                  <button key={s} type="button" onClick={() => setSource(s)}
                    className={`flex-1 h-9 text-xs font-bold uppercase tracking-wider border transition-colors ${source === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}
                    data-testid={`car-source-${s}`}>{SOURCE_LABEL[s]}</button>
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
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Jelaskan temuan ketidaksesuaian secara detail." className="rounded-none mt-1" data-testid="car-description" />
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
