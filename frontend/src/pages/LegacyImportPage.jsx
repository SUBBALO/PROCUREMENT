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
  FileDoc, MagicWand, FloppyDisk, X, Stack, ArrowClockwise, ListNumbers,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import BackLink from "../components/BackLink";

const ALLOWED_ROLES = ["admin", "super_admin", "supervisor", "engineering", "eng_leader", "eng_head"];

// File bersama (1 per box / BOM)
const SHARED_SLOTS = [
  { key: "bom",           label: "BOM (Excel)",   accept: ".xlsx,.xls,.xlsm",           hint: "Excel — auto-detect", color: "amber" },
  { key: "nesting",       label: "Nesting",        accept: ".pdf,.doc,.docx,.xlsx,.xls", hint: "PDF/Word/Excel", color: "violet" },
  { key: "nesting_price", label: "Nesting Price",  accept: ".pdf,.doc,.docx,.xlsx,.xls", hint: "PDF/Excel", color: "cyan" },
];

const SHARED_FIELDS = [
  { key: "so_no", label: "No. SO (6 digit)", placeholder: "005500", numeric: true },
  { key: "project_name", label: "Nama Project", placeholder: "..." },
  { key: "customer", label: "Customer", placeholder: "PT ..." },
  { key: "class_material", label: "Class / Material", placeholder: "..." },
  { key: "revision", label: "Revisi", placeholder: "Rev-0" },
];

const emptyFields = () => ({
  so_no: "", project_name: "", customer: "", class_material: "",
  revision: "Rev-0", bom_no: "", delivery_date: "", drawing_date: "",
});

const emptyDwg = () => ({ eng: null, customer: null, drawing_no: "", customer_drawing_no: "" });

let _uid = 0;
const newBox = () => ({
  uid: ++_uid,
  fields: emptyFields(),
  shared: { bom: null, nesting: null, nesting_price: null },
  dwgs: [emptyDwg()],
  items: [],
  itemsCount: 0,
  status: "idle",
  message: "",
  saved: null,
});

const fileIcon = (name) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["xlsx", "xls", "xlsm"].includes(ext)) return <FileXls size={16} weight="fill" className="text-emerald-600" />;
  if (["doc", "docx"].includes(ext)) return <FileDoc size={16} weight="fill" className="text-blue-600" />;
  return <FilePdf size={16} weight="fill" className="text-rose-600" />;
};

// tebak nomor DWG dari nama file (buang ekstensi & path)
const guessDwgNo = (filename) => (filename || "").replace(/\.[^.]+$/, "").trim();

export default function LegacyImportPage() {
  const { user } = useAuth();
  const allowed = ALLOWED_ROLES.includes(user?.role);
  const [boxes, setBoxes] = useState([newBox()]);
  const [soImport, setSoImport] = useState({ status: "idle", message: "" });

  const importSoList = async (file) => {
    if (!file) return;
    setSoImport({ status: "loading", message: `Membaca ${file.name}...` });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/sales-orders/import-list", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSoImport({ status: "done", message: data.message });
      toast.success(data.message);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Gagal import daftar SO";
      setSoImport({ status: "error", message: msg });
      toast.error(msg);
    }
  };

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

  const patchBox = (uid, patch) => setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  const patchField = (uid, key, val) => setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, fields: { ...b.fields, [key]: val } } : b)));

  const setShared = (uid, slotKey, file) => {
    setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, shared: { ...b.shared, [slotKey]: file } } : b)));
    if (slotKey === "bom" && file) analyzeBom(uid, file);
  };

  const setDwgFile = (uid, idx, which, file) => {
    setBoxes((prev) => prev.map((b) => {
      if (b.uid !== uid) return b;
      const dwgs = b.dwgs.map((d, i) => {
        if (i !== idx) return d;
        const nd = { ...d, [which]: file };
        if (which === "eng" && file && !nd.drawing_no) nd.drawing_no = guessDwgNo(file.name);
        return nd;
      });
      return { ...b, dwgs };
    }));
  };

  const patchDwg = (uid, idx, key, val) => setBoxes((prev) => prev.map((b) =>
    b.uid === uid ? { ...b, dwgs: b.dwgs.map((d, i) => (i === idx ? { ...d, [key]: val } : d)) } : b));

  const addDwg = (uid) => setBoxes((prev) => prev.map((b) => (b.uid === uid ? { ...b, dwgs: [...b.dwgs, emptyDwg()] } : b)));
  const removeDwg = (uid, idx) => setBoxes((prev) => prev.map((b) =>
    b.uid === uid && b.dwgs.length > 1 ? { ...b, dwgs: b.dwgs.filter((_, i) => i !== idx) } : b));

  const analyzeBom = async (uid, file) => {
    patchBox(uid, { status: "analyzing", message: "Membaca BOM & auto-detect data..." });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/legacy-import/analyze", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const s = data.suggested || {};
      setBoxes((prev) => prev.map((b) => {
        if (b.uid !== uid) return b;
        const f = { ...b.fields };
        ["so_no", "project_name", "customer", "class_material", "bom_no", "delivery_date", "drawing_date", "revision"].forEach((k) => {
          if (s[k] && (!f[k] || (k === "revision" && f[k] === "Rev-0"))) f[k] = s[k];
        });
        // isi nomor DWG#1 dari BOM bila kosong
        const dwgs = b.dwgs.map((d, i) => (i === 0 && !d.drawing_no && s.drawing_no
          ? { ...d, drawing_no: s.drawing_no, customer_drawing_no: d.customer_drawing_no || (s.customer_drawing_no || "") } : d));
        return { ...b, fields: f, dwgs, items: data.items || [], itemsCount: data.items_count || 0, status: "idle", message: `Terdeteksi ${data.items_count || 0} item BOM` };
      }));
      toast.success(`BOM terbaca: ${data.items_count || 0} item. Silakan verifikasi.`);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Gagal membaca BOM";
      patchBox(uid, { status: "idle", message: msg });
      toast.error(msg);
    }
  };

  const commitBox = async (box) => {
    const dwg1 = box.dwgs[0];
    if (!dwg1?.eng) { toast.error("File Eng DWG (DWG #1) wajib diupload"); return; }
    if (!dwg1.drawing_no?.trim()) { toast.error("No. Eng DWG (DWG #1) wajib diisi"); return; }
    for (let i = 1; i < box.dwgs.length; i++) {
      if (box.dwgs[i].eng && !box.dwgs[i].drawing_no?.trim()) { toast.error(`No. Eng DWG (DWG #${i + 1}) wajib diisi`); return; }
    }
    patchBox(box.uid, { status: "saving", message: "Menyimpan ke Master List..." });
    try {
      let so = box.fields.so_no;
      if (so && /^\d{1,6}$/.test(so)) so = so.padStart(6, "0");

      // 1) commit DWG#1 + BOM + Nesting/Nesting Price
      const fd = new FormData();
      const meta = {
        ...box.fields, so_no: so,
        drawing_no: dwg1.drawing_no, customer_drawing_no: dwg1.customer_drawing_no,
        items: box.items,
      };
      fd.append("meta", JSON.stringify(meta));
      fd.append("eng_dwg", dwg1.eng);
      if (dwg1.customer) fd.append("customer_dwg", dwg1.customer);
      if (box.shared.nesting) fd.append("nesting", box.shared.nesting);
      if (box.shared.nesting_price) fd.append("nesting_price", box.shared.nesting_price);
      if (box.shared.bom) fd.append("bom_file", box.shared.bom);
      const { data } = await api.post("/legacy-import/commit", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const bomId = data.bom_id;

      // 2) DWG tambahan → add-drawing (drawing terpisah, BOM/SO sama)
      let extra = 0;
      for (let i = 1; i < box.dwgs.length; i++) {
        const d = box.dwgs[i];
        if (!d.eng) continue;
        const fd2 = new FormData();
        fd2.append("meta", JSON.stringify({ bom_id: bomId, drawing_no: d.drawing_no, customer_drawing_no: d.customer_drawing_no, revision: box.fields.revision }));
        fd2.append("eng_dwg", d.eng);
        if (d.customer) fd2.append("customer_dwg", d.customer);
        await api.post("/legacy-import/add-drawing", fd2, { headers: { "Content-Type": "multipart/form-data" } });
        extra += 1;
      }
      const total = 1 + extra;
      patchBox(box.uid, { status: "saved", message: `${total} drawing masuk Master List (SO ${data.so_no})`, saved: { ...data, total } });
      toast.success(`${total} drawing (SO ${data.so_no}) masuk Master List`);
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
            Upload <b>BOM (Excel)</b> dulu → sistem auto-baca data → lalu upload DWG. Bisa <b>lebih dari 1 DWG</b>
            (tiap DWG jadi drawing terpisah, SO/BOM sama). Verifikasi lalu simpan. Hasil langsung <b>Controlled/Final</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedCount > 0 && <Badge className="rounded-none bg-emerald-600 text-white" data-testid="saved-count">{savedCount} tersimpan</Badge>}
          <Button onClick={addBox} className="rounded-none bg-slate-900 hover:bg-slate-800" data-testid="add-box-btn">
            <Plus size={16} weight="bold" className="mr-1" /> Tambah Box
          </Button>
        </div>
      </div>

      {/* Import Daftar SO */}
      <Card className="rounded-none border-l-4 border-sky-500 mb-6" data-testid="so-import-card">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="flex items-start gap-3">
            <ListNumbers size={22} weight="duotone" className="text-sky-700 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-800 text-sm">Import Daftar SO (Master SO)</div>
              <div className="text-xs text-slate-500 max-w-xl">
                Upload Excel daftar SO (kolom: <b>SO number, Date, Customer, Description</b>). Nomor SO otomatis 6 digit &amp; masuk autocomplete.
              </div>
              {soImport.message && (
                <div className={`text-xs mt-1 ${soImport.status === "error" ? "text-rose-600" : "text-sky-700"}`} data-testid="so-import-msg">{soImport.message}</div>
              )}
            </div>
          </div>
          <label className="shrink-0">
            <input type="file" accept=".xlsx,.xls,.xlsm" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) importSoList(e.target.files[0]); e.target.value = ""; }} data-testid="so-import-input" />
            <span className={`inline-flex items-center gap-1 px-3 h-9 text-sm font-semibold cursor-pointer border ${soImport.status === "loading" ? "opacity-60 pointer-events-none" : ""} border-sky-600 text-sky-700 hover:bg-sky-50`}>
              <UploadSimple size={16} weight="bold" /> {soImport.status === "loading" ? "Memproses..." : "Upload Daftar SO"}
            </span>
          </label>
        </div>
      </Card>

      <div className="space-y-5">
        {boxes.map((box, idx) => (
          <Card key={box.uid} data-testid={`import-box-${idx}`}
            className={`rounded-none border-l-4 ${box.status === "saved" ? "border-emerald-500 bg-emerald-50/40" : box.status === "error" ? "border-rose-500" : "border-slate-300"}`}>
            <div className="p-4 md:p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 flex items-center justify-center bg-slate-900 text-white text-sm font-bold">{idx + 1}</span>
                  <span className="font-mono text-sm font-semibold text-slate-700">{box.dwgs[0]?.drawing_no || "Drawing baru"}</span>
                  {box.dwgs.length > 1 && <Badge variant="outline" className="rounded-none border-slate-400 text-slate-600">{box.dwgs.length} DWG</Badge>}
                  {box.itemsCount > 0 && <Badge variant="outline" className="rounded-none border-amber-400 text-amber-700">{box.itemsCount} item BOM</Badge>}
                  {box.status === "saved" && <Badge className="rounded-none bg-emerald-600 text-white flex items-center gap-1"><CheckCircle size={13} weight="fill" /> Masuk Master List</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {box.status === "saved" && (
                    <Button size="sm" variant="ghost" className="rounded-none text-slate-500" onClick={() => resetBox(box.uid)} title="Kosongkan" data-testid={`reset-box-${idx}`}><ArrowClockwise size={15} /></Button>
                  )}
                  <Button size="sm" variant="ghost" className="rounded-none text-rose-500 hover:text-rose-700" onClick={() => removeBox(box.uid)} disabled={boxes.length === 1} data-testid={`remove-box-${idx}`}><TrashSimple size={15} /></Button>
                </div>
              </div>

              {/* Shared files: BOM / Nesting / Nesting Price */}
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">File Bersama (1 per BOM)</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {SHARED_SLOTS.map((slot) => (
                  <FileSlot key={slot.key} slot={slot} file={box.shared[slot.key]} disabled={box.status === "saved"}
                    onSelect={(f) => setShared(box.uid, slot.key, f)} onClear={() => setShared(box.uid, slot.key, null)} testid={`slot-${slot.key}-${idx}`} />
                ))}
              </div>

              {/* Shared verification fields */}
              <div className="bg-slate-50 border border-slate-200 p-3 mb-4">
                <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider font-semibold text-slate-500">
                  <MagicWand size={14} weight="duotone" /> Data BOM {box.status === "analyzing" && <span className="text-amber-600 normal-case">· membaca...</span>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {SHARED_FIELDS.map((fd) => (
                    <div key={fd.key}>
                      <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">{fd.label}</Label>
                      <Input data-testid={`field-${fd.key}-${idx}`} value={box.fields[fd.key] || ""} disabled={box.status === "saved"} placeholder={fd.placeholder}
                        onChange={(e) => { let v = e.target.value; if (fd.numeric) v = v.replace(/\D/g, "").slice(0, 6); patchField(box.uid, fd.key, v); }}
                        onBlur={() => { if (fd.numeric && box.fields[fd.key] && /^\d{1,6}$/.test(box.fields[fd.key])) patchField(box.uid, fd.key, box.fields[fd.key].padStart(6, "0")); }}
                        className={`rounded-none h-9 text-sm ${fd.numeric ? "font-mono tracking-wider" : ""}`} />
                    </div>
                  ))}
                </div>
              </div>

              {/* DWG list (multiple) */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Drawing (Eng DWG + Customer) — bisa lebih dari 1</div>
                {box.status !== "saved" && (
                  <Button size="sm" variant="outline" className="rounded-none border-dashed h-7 text-xs" onClick={() => addDwg(box.uid)} data-testid={`add-dwg-${idx}`}>
                    <Plus size={13} weight="bold" className="mr-1" /> Tambah DWG
                  </Button>
                )}
              </div>
              <div className="space-y-3 mb-4">
                {box.dwgs.map((d, di) => (
                  <div key={di} className="border border-slate-200 p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-start" data-testid={`dwg-row-${idx}-${di}`}>
                    <div className="md:col-span-1 flex items-center h-9 font-bold text-slate-500 text-sm">#{di + 1}</div>
                    <div className="md:col-span-3">
                      <FileSlot slot={{ label: "Eng DWG", accept: ".pdf,.doc,.docx", hint: "PDF/Word", required: true }} file={d.eng} disabled={box.status === "saved"}
                        onSelect={(f) => setDwgFile(box.uid, di, "eng", f)} onClear={() => setDwgFile(box.uid, di, "eng", null)} testid={`slot-eng-${idx}-${di}`} />
                    </div>
                    <div className="md:col-span-3">
                      <FileSlot slot={{ label: "DWG Customer", accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png", hint: "PDF/Word" }} file={d.customer} disabled={box.status === "saved"}
                        onSelect={(f) => setDwgFile(box.uid, di, "customer", f)} onClear={() => setDwgFile(box.uid, di, "customer", null)} testid={`slot-cust-${idx}-${di}`} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">No. Eng DWG *</Label>
                      <Input data-testid={`dwgno-${idx}-${di}`} value={d.drawing_no} disabled={box.status === "saved"} placeholder="MKS-..."
                        onChange={(e) => patchDwg(box.uid, di, "drawing_no", e.target.value)} className="rounded-none h-9 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">No. DWG Customer</Label>
                      <Input data-testid={`custno-${idx}-${di}`} value={d.customer_drawing_no} disabled={box.status === "saved"} placeholder="CUST-..."
                        onChange={(e) => patchDwg(box.uid, di, "customer_drawing_no", e.target.value)} className="rounded-none h-9 text-sm" />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      {box.status !== "saved" && box.dwgs.length > 1 && (
                        <Button size="sm" variant="ghost" className="rounded-none text-rose-500 h-9" onClick={() => removeDwg(box.uid, di)} data-testid={`remove-dwg-${idx}-${di}`}><X size={14} weight="bold" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${box.status === "error" ? "text-rose-600" : "text-slate-500"}`} data-testid={`box-msg-${idx}`}>{box.message}</span>
                {box.status !== "saved" ? (
                  <Button onClick={() => commitBox(box)} disabled={box.status === "saving" || box.status === "analyzing"} className="rounded-none bg-emerald-600 hover:bg-emerald-700" data-testid={`commit-box-${idx}`}>
                    <FloppyDisk size={16} weight="bold" className="mr-1" /> {box.status === "saving" ? "Menyimpan..." : "Verifikasi & Simpan ke Master List"}
                  </Button>
                ) : (
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle size={15} weight="fill" /> SO {box.saved?.so_no} · {box.saved?.total} drawing · {box.saved?.bom_no}
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
  const inputId = `file-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div>
      <Label className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
        {slot.label} {slot.required && <span className="text-rose-500">*</span>}
      </Label>
      {!file ? (
        <label htmlFor={inputId}
          className={`flex flex-col items-center justify-center gap-1 h-20 border-2 border-dashed cursor-pointer transition-colors text-center px-2 ${disabled ? "opacity-50 pointer-events-none border-slate-200" : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"}`}
          data-testid={testid}>
          <UploadSimple size={18} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 leading-tight">{slot.hint}</span>
          <input id={inputId} type="file" accept={slot.accept} className="hidden" disabled={disabled}
            onChange={(e) => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = ""; }} />
        </label>
      ) : (
        <div className="h-20 border-2 border-slate-800 bg-white flex flex-col justify-between p-2" data-testid={`${testid}-selected`}>
          <div className="flex items-start gap-1.5 overflow-hidden">
            {fileIcon(file.name)}
            <span className="text-[10px] leading-tight text-slate-700 break-all line-clamp-2">{file.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
            {!disabled && <button onClick={onClear} className="text-slate-400 hover:text-rose-600" title="Hapus"><X size={13} weight="bold" /></button>}
          </div>
        </div>
      )}
    </div>
  );
}
