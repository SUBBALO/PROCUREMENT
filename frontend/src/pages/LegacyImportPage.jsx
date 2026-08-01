import React, { useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  UploadSimple, Plus, TrashSimple, CheckCircle, WarningCircle, FileXls, FilePdf,
  FileDoc, MagicWand, FloppyDisk, X, Stack, ArrowClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";

const ALLOWED_ROLES = ["admin", "super_admin", "supervisor", "engineering", "eng_leader", "eng_head"];

const FILE_SLOTS = [
  { key: "eng_dwg",       label: "Eng DWG (MKS)",  accept: ".pdf,.doc,.docx",       required: true,  hint: "PDF/Word", color: "emerald" },
  { key: "customer_dwg",  label: "DWG Customer",   accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png", required: false, hint: "PDF/Word", color: "blue" },
  { key: "nesting",       label: "Nesting",        accept: ".pdf,.doc,.docx,.xlsx,.xls", required: false, hint: "PDF/Word/Excel", color: "violet" },
  { key: "nesting_price", label: "Nesting Price",  accept: ".pdf,.doc,.docx,.xlsx,.xls", required: false, hint: "PDF/Excel", color: "cyan" },
  { key: "bom",           label: "BOM (Excel)",    accept: ".xlsx,.xls,.xlsm",       required: false, hint: "Excel — auto-detect", color: "amber" },
];

const FIELD_DEFS = [
  { key: "so_no", label: "No. SO (6 digit)", placeholder: "005500", numeric: true },
  { key: "drawing_no", label: "No. Eng DWG *", placeholder: "MKS-..." },
  { key: "customer_drawing_no", label: "No. DWG Customer", placeholder: "CUST-..." },
  { key: "project_name", label: "Nama Project", placeholder: "..." },
  { key: "customer", label: "Customer", placeholder: "PT ..." },
  { key: "class_material", label: "Class / Material", placeholder: "..." },
  { key: "revision", label: "Revisi", placeholder: "Rev-0" },
];

const emptyFields = () => ({
  so_no: "", drawing_no: "", customer_drawing_no: "", project_name: "",
  customer: "", class_material: "", revision: "Rev-0", bom_no: "", delivery_date: "", drawing_date: "",
});

let _uid = 0;
const newBox = () => ({
  uid: ++_uid,
  fields: emptyFields(),
  files: { eng_dwg: null, customer_dwg: null, nesting: null, nesting_price: null, bom: null },
  items: [],
  itemsCount: 0,
  status: "idle",   // idle | analyzing | saving | saved | error
  message: "",
  saved: null,
});

const fileIcon = (name) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["xlsx", "xls", "xlsm"].includes(ext)) return <FileXls size={16} weight="fill" className="text-emerald-600" />;
  if (["doc", "docx"].includes(ext)) return <FileDoc size={16} weight="fill" className="text-blue-600" />;
  return <FilePdf size={16} weight="fill" className="text-rose-600" />;
};

export default function LegacyImportPage() {
  const { user } = useAuth();
  const allowed = ALLOWED_ROLES.includes(user?.role);
  const [boxes, setBoxes] = useState([newBox()]);

  if (!allowed) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <BackLink to="/" label="Kembali" />
        <Card className="rounded-none p-8 mt-4 border-l-4 border-rose-500">
          <div className="flex items-center gap-3 text-rose-700">
            <WarningCircle size={24} weight="fill" />
            <p className="font-semibold">Akses ditolak. Menu ini hanya untuk Admin & Engineering Leader.</p>
          </div>
        </Card>
      </div>
    );
  }

  const patchBox = (uid, patch) =>
    setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));

  const patchField = (uid, key, val) =>
    setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, fields: { ...b.fields, [key]: val } } : b)));

  const setFile = (uid, slotKey, file) => {
    setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, files: { ...b.files, [slotKey]: file } } : b)));
    if (slotKey === "bom" && file) analyzeBom(uid, file);
  };

  const analyzeBom = async (uid, file) => {
    patchBox(uid, { status: "analyzing", message: "Membaca BOM & auto-detect data..." });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/legacy-import/analyze", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const s = data.suggested || {};
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.uid !== uid) return b;
          const f = { ...b.fields };
          // Prefill dari hasil deteksi (field yang terdeteksi menimpa yang kosong / default)
          Object.entries(s).forEach(([k, v]) => {
            if (v && (!f[k] || (k === "revision" && f[k] === "Rev-0"))) f[k] = v;
          });
          return { ...b, fields: f, items: data.items || [], itemsCount: data.items_count || 0, status: "idle", message: `Terdeteksi ${data.items_count || 0} item BOM` };
        })
      );
      toast.success(`BOM terbaca: ${data.items_count || 0} item. Silakan verifikasi.`);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Gagal membaca BOM";
      patchBox(uid, { status: "idle", message: msg });
      toast.error(msg);
    }
  };

  const commitBox = async (box) => {
    if (!box.files.eng_dwg) { toast.error("File Eng DWG (MKS) wajib diupload"); return; }
    if (!box.fields.drawing_no?.trim()) { toast.error("No. Eng DWG wajib diisi"); return; }
    patchBox(box.uid, { status: "saving", message: "Menyimpan ke Master List..." });
    try {
      const fd = new FormData();
      const meta = { ...box.fields, items: box.items };
      if (meta.so_no && /^\d{1,6}$/.test(meta.so_no)) meta.so_no = meta.so_no.padStart(6, "0");
      fd.append("meta", JSON.stringify(meta));
      fd.append("eng_dwg", box.files.eng_dwg);
      if (box.files.customer_dwg) fd.append("customer_dwg", box.files.customer_dwg);
      if (box.files.nesting) fd.append("nesting", box.files.nesting);
      if (box.files.nesting_price) fd.append("nesting_price", box.files.nesting_price);
      if (box.files.bom) fd.append("bom_file", box.files.bom);
      const { data } = await api.post("/legacy-import/commit", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      patchBox(box.uid, { status: "saved", message: data.message, saved: data });
      toast.success(data.message);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Gagal menyimpan";
      patchBox(box.uid, { status: "error", message: msg });
      toast.error(msg);
    }
  };

  const addBox = () => setBoxes((prev) => [...prev, newBox()]);
  const removeBox = (uid) => setBoxes((prev) => (prev.length > 1 ? prev.filter((b) => b.uid !== uid) : prev));
  const resetBox = (uid) => setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...newBox(), uid } : b)));

  const savedCount = boxes.filter((b) => b.status === "saved").length;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8" data-testid="legacy-import-page">
      <BackLink to="/" label="Kembali" />
      <div className="mt-4 mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Stack size={26} weight="duotone" className="text-slate-700" /> Import Data Lama → Master List
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Upload per <b>box</b> (1 box = 1 drawing/SO). Sistem auto-baca BOM Excel untuk mengisi data,
            lalu <b>verifikasi</b> sebelum masuk sistem. Hasil langsung <b>Controlled/Final</b> (tanpa TTD) —
            ditandai <i>"Data Lama (scan TTD manual)"</i>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedCount > 0 && (
            <Badge className="rounded-none bg-emerald-600 text-white" data-testid="saved-count">
              {savedCount} tersimpan
            </Badge>
          )}
          <Button onClick={addBox} className="rounded-none bg-slate-900 hover:bg-slate-800" data-testid="add-box-btn">
            <Plus size={16} weight="bold" className="mr-1" /> Tambah Box
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {boxes.map((box, idx) => (
          <Card
            key={box.uid}
            data-testid={`import-box-${idx}`}
            className={`rounded-none border-l-4 ${
              box.status === "saved" ? "border-emerald-500 bg-emerald-50/40"
                : box.status === "error" ? "border-rose-500"
                : "border-slate-300"
            }`}
          >
            <div className="p-4 md:p-5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 flex items-center justify-center bg-slate-900 text-white text-sm font-bold">
                    {idx + 1}
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-700">
                    {box.fields.drawing_no || "Drawing baru"}
                  </span>
                  {box.itemsCount > 0 && (
                    <Badge variant="outline" className="rounded-none border-amber-400 text-amber-700">
                      {box.itemsCount} item BOM
                    </Badge>
                  )}
                  {box.status === "saved" && (
                    <Badge className="rounded-none bg-emerald-600 text-white flex items-center gap-1">
                      <CheckCircle size={13} weight="fill" /> Masuk Master List
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {box.status === "saved" && (
                    <Button size="sm" variant="ghost" className="rounded-none text-slate-500"
                      onClick={() => resetBox(box.uid)} title="Kosongkan box ini" data-testid={`reset-box-${idx}`}>
                      <ArrowClockwise size={15} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="rounded-none text-rose-500 hover:text-rose-700"
                    onClick={() => removeBox(box.uid)} disabled={boxes.length === 1} data-testid={`remove-box-${idx}`}>
                    <TrashSimple size={15} />
                  </Button>
                </div>
              </div>

              {/* File slots */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                {FILE_SLOTS.map((slot) => (
                  <FileSlot
                    key={slot.key}
                    slot={slot}
                    file={box.files[slot.key]}
                    disabled={box.status === "saved"}
                    onSelect={(f) => setFile(box.uid, slot.key, f)}
                    onClear={() => setFile(box.uid, slot.key, null)}
                    testid={`slot-${slot.key}-${idx}`}
                  />
                ))}
              </div>

              {/* Verification fields */}
              <div className="bg-slate-50 border border-slate-200 p-3">
                <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider font-semibold text-slate-500">
                  <MagicWand size={14} weight="duotone" /> Verifikasi Data {box.status === "analyzing" && <span className="text-amber-600 normal-case">· membaca BOM...</span>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {FIELD_DEFS.map((fd) => (
                    <div key={fd.key}>
                      <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">{fd.label}</Label>
                      <Input
                        data-testid={`field-${fd.key}-${idx}`}
                        value={box.fields[fd.key] || ""}
                        disabled={box.status === "saved"}
                        placeholder={fd.placeholder}
                        onChange={(e) => {
                          let v = e.target.value;
                          if (fd.numeric) v = v.replace(/\D/g, "").slice(0, 6);
                          patchField(box.uid, fd.key, v);
                        }}
                        onBlur={() => {
                          if (fd.numeric && box.fields[fd.key] && /^\d{1,6}$/.test(box.fields[fd.key]))
                            patchField(box.uid, fd.key, box.fields[fd.key].padStart(6, "0"));
                        }}
                        className={`rounded-none h-9 text-sm ${fd.numeric ? "font-mono tracking-wider" : ""}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer / actions */}
              <div className="flex items-center justify-between mt-4">
                <span className={`text-xs ${box.status === "error" ? "text-rose-600" : "text-slate-500"}`} data-testid={`box-msg-${idx}`}>
                  {box.message}
                </span>
                {box.status !== "saved" ? (
                  <Button
                    onClick={() => commitBox(box)}
                    disabled={box.status === "saving" || box.status === "analyzing"}
                    className="rounded-none bg-emerald-600 hover:bg-emerald-700"
                    data-testid={`commit-box-${idx}`}
                  >
                    <FloppyDisk size={16} weight="bold" className="mr-1" />
                    {box.status === "saving" ? "Menyimpan..." : "Verifikasi & Simpan ke Master List"}
                  </Button>
                ) : (
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle size={15} weight="fill" /> SO {box.saved?.so_no} · {box.saved?.bom_no}
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        <Button variant="outline" onClick={addBox} className="rounded-none border-dashed" data-testid="add-box-btn-bottom">
          <Plus size={16} weight="bold" className="mr-1" /> Tambah Box Lagi
        </Button>
      </div>
    </div>
  );
}

function FileSlot({ slot, file, onSelect, onClear, disabled, testid }) {
  const inputId = `file-${slot.key}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div>
      <Label className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
        {slot.label} {slot.required && <span className="text-rose-500">*</span>}
      </Label>
      {!file ? (
        <label
          htmlFor={inputId}
          className={`flex flex-col items-center justify-center gap-1 h-20 border-2 border-dashed cursor-pointer transition-colors text-center px-2 ${
            disabled ? "opacity-50 pointer-events-none border-slate-200"
              : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"
          }`}
          data-testid={testid}
        >
          <UploadSimple size={18} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 leading-tight">{slot.hint}</span>
          <input
            id={inputId}
            type="file"
            accept={slot.accept}
            className="hidden"
            disabled={disabled}
            onChange={(e) => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = ""; }}
          />
        </label>
      ) : (
        <div className="h-20 border-2 border-slate-800 bg-white flex flex-col justify-between p-2" data-testid={`${testid}-selected`}>
          <div className="flex items-start gap-1.5 overflow-hidden">
            {fileIcon(file.name)}
            <span className="text-[10px] leading-tight text-slate-700 break-all line-clamp-2">{file.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
            {!disabled && (
              <button onClick={onClear} className="text-slate-400 hover:text-rose-600" title="Hapus">
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
