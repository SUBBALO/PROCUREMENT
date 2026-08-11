import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api, { formatRupiah, formatDateTimeWIB, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import {
  UsersThree, Receipt, EnvelopeSimple, Gear, ClockCounterClockwise, Lock, LockKey,
  ArrowLeft, Plus, Trash, PencilSimple, FilePdf, DownloadSimple, UploadSimple,
  ShieldCheck, PaperPlaneTilt, MagnifyingGlass, WarningCircle, CheckCircle, XCircle,
  FolderSimple, Key,
} from "@phosphor-icons/react";

const BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const errMsg = (e) => formatApiErrorDetail(e?.response?.data?.detail) || e?.message || "Terjadi kesalahan";
const GAJI_MENUS = ["hrd_karyawan", "hrd_slip_gaji", "hrd_email", "hrd_settings"];

/* ============================ Main ============================ */
export default function HrdPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);   // /hrd/my-access
  const [portalToken, setPortalToken] = useState("");
  const [gajiToken, setGajiToken] = useState("");
  const [section, setSection] = useState("home");
  const [gajiDialogFor, setGajiDialogFor] = useState(null); // section pending gaji unlock

  const loadMeta = useCallback(async () => {
    try { const r = await api.get("/hrd/my-access"); setMeta(r.data); }
    catch (e) { setMeta({ can_enter: false }); }
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const hapi = useMemo(() => {
    const headers = () => ({ "x-hrd-token": portalToken, "x-hrd-gaji": gajiToken });
    const wrap = (p) => p.catch((e) => {
      const d = errMsg(e);
      if (e?.response?.status === 401 && /PIN Gaji/i.test(d)) setGajiToken("");
      if (e?.response?.status === 401 && /PIN Portal/i.test(d)) setPortalToken("");
      throw e;
    });
    return {
      get: (url, config = {}) => wrap(api.get(url, { ...config, headers: { ...(config.headers || {}), ...headers() } })),
      post: (url, data, config = {}) => wrap(api.post(url, data, { ...config, headers: { ...(config.headers || {}), ...headers() } })),
      put: (url, data, config = {}) => wrap(api.put(url, data, { ...config, headers: { ...(config.headers || {}), ...headers() } })),
      delete: (url, config = {}) => wrap(api.delete(url, { ...config, headers: { ...(config.headers || {}), ...headers() } })),
    };
  }, [portalToken, gajiToken]);

  if (meta == null) {
    return <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex items-center justify-center text-slate-400">Memuat Portal HRD…</div>;
  }
  if (!meta.can_enter) {
    return (
      <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex items-center justify-center p-6" data-testid="hrd-access-denied">
        <Card className="max-w-md w-full p-8 text-center space-y-3">
          <Lock size={40} weight="duotone" className="mx-auto text-rose-500" />
          <h2 className="text-lg font-bold text-slate-800">Akses Ditolak</h2>
          <p className="text-sm text-slate-500">Anda tidak memiliki akses ke Portal HRD.</p>
          <Button variant="outline" onClick={() => navigate("/")} data-testid="hrd-back-home">Kembali ke Beranda</Button>
        </Card>
      </div>
    );
  }

  // ---- Portal PIN gate (super admin dikecualikan) ----
  if (!meta.is_super && !portalToken) {
    return <PortalPinGate meta={meta} onUnlock={setPortalToken} onChanged={loadMeta} navigate={navigate} />;
  }

  const access = meta.access || {};
  const openCard = (card) => {
    if (card.gaji && !meta.is_super && meta.gaji_pin_set && !gajiToken) {
      setGajiDialogFor(card.key);
      return;
    }
    setSection(card.key);
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 text-slate-900">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 flex items-center justify-center bg-teal-600 text-white rounded-md shrink-0">
              <UsersThree size={22} weight="duotone" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>Portal HRD</h1>
              <p className="text-xs text-slate-500">PT. Mitra Karya Sarana — Data bersifat rahasia</p>
            </div>
            {gajiToken && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 ml-1 gap-1"><LockKey size={13} weight="fill" /> Gaji terbuka</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {section !== "home" && (
              <Button variant="outline" size="sm" onClick={() => setSection("home")} data-testid="hrd-nav-home" className="gap-1.5">
                <ArrowLeft size={15} weight="bold" /> Menu HRD
              </Button>
            )}
            <PinMenu meta={meta} hapi={hapi} gajiToken={gajiToken} onChanged={loadMeta}
              onLockGaji={() => setGajiToken("")}
              onLockPortal={() => { setGajiToken(""); setPortalToken(""); setSection("home"); }} />
          </div>
        </div>

        {section === "home" && <HrdHome access={access} isSuper={meta.is_super} onOpen={openCard} gajiUnlocked={!!gajiToken || meta.is_super} gajiPinSet={meta.gaji_pin_set} />}
        {section === "employees" && <EmployeesSection hapi={hapi} can={meta.is_super ? ALL : access.hrd_karyawan} />}
        {section === "payslips" && <PayslipsSection hapi={hapi} can={meta.is_super ? ALL : access.hrd_slip_gaji} />}
        {section === "email" && <EmailSection hapi={hapi} can={meta.is_super ? ALL : access.hrd_email} onGoSettings={() => setSection("settings")} />}
        {section === "settings" && <SettingsSection hapi={hapi} can={meta.is_super ? ALL : access.hrd_settings} />}
        {section === "dokumen" && <DokumenSection />}
        {section === "logs" && <LogsSection hapi={hapi} />}
      </div>

      {/* Gaji PIN unlock dialog */}
      <GajiPinDialog open={!!gajiDialogFor} onClose={() => setGajiDialogFor(null)}
        onVerify={async (pin) => {
          const r = await api.post("/hrd/verify-pin", { pin }, { headers: { "x-hrd-token": portalToken } });
          setGajiToken(r.data.gaji_token);
          const target = gajiDialogFor; setGajiDialogFor(null); setSection(target);
        }} />
    </div>
  );
}

const ALL = { view: true, create: true, edit: true, delete: true, report: true };

/* ============================ Portal PIN gate ============================ */
function PortalPinGate({ meta, onUnlock, onChanged, navigate }) {
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = (v) => v.replace(/\D/g, "");

  const verify = async () => {
    setBusy(true);
    try { const r = await api.post("/hrd/portal-pin/verify", { pin }); onUnlock(r.data.portal_token); toast.success("Portal HRD terbuka"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const create = async () => {
    if (newPin.length < 4) return toast.error("PIN minimal 4 digit");
    if (newPin !== confirmPin) return toast.error("Konfirmasi PIN tidak cocok");
    setBusy(true);
    try { await api.post("/hrd/portal-pin/set", { pin: newPin }); toast.success("PIN Portal berhasil dibuat"); await onChanged(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 space-y-5">
        <div className="text-center space-y-2">
          <span className="w-14 h-14 mx-auto flex items-center justify-center bg-teal-600 text-white rounded-full"><Lock size={26} weight="duotone" /></span>
          <h2 className="text-lg font-bold text-slate-800">PIN Portal HRD</h2>
          <p className="text-sm text-slate-500">Setiap user HRD wajib memasukkan PIN portal untuk masuk.</p>
        </div>
        {meta.portal_pin_set ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="pin">PIN Portal Anda</Label>
              <Input id="pin" type="password" inputMode="numeric" value={pin} maxLength={12} autoFocus
                onChange={(e) => setPin(clean(e.target.value))} onKeyDown={(e) => e.key === "Enter" && verify()}
                placeholder="Masukkan PIN portal" data-testid="hrd-portalpin-input" />
            </div>
            <Button className="w-full bg-teal-600 hover:bg-teal-700" onClick={verify} disabled={busy || !pin} data-testid="hrd-portalpin-submit">
              {busy ? "Membuka…" : "Buka Portal"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2.5">
              <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
              PIN Portal Anda belum diatur. Buat PIN pribadi Anda (hanya Anda yang tahu) untuk masuk portal.
            </div>
            <div><Label>PIN Baru (min 4 digit)</Label><Input type="password" inputMode="numeric" value={newPin} maxLength={12} onChange={(e) => setNewPin(clean(e.target.value))} data-testid="hrd-portalpin-new" /></div>
            <div><Label>Konfirmasi PIN</Label><Input type="password" inputMode="numeric" value={confirmPin} maxLength={12} onChange={(e) => setConfirmPin(clean(e.target.value))} data-testid="hrd-portalpin-confirm" /></div>
            <Button className="w-full bg-teal-600 hover:bg-teal-700" onClick={create} disabled={busy} data-testid="hrd-portalpin-create">{busy ? "Menyimpan…" : "Buat PIN Portal"}</Button>
          </div>
        )}
        <Button variant="ghost" className="w-full text-slate-500" onClick={() => navigate("/")}>Kembali ke Beranda</Button>
      </Card>
    </div>
  );
}

/* ============================ Gaji PIN dialog ============================ */
function GajiPinDialog({ open, onClose, onVerify }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPin(""); }, [open]);
  const submit = async () => {
    setBusy(true);
    try { await onVerify(pin); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" data-testid="hrd-gajipin-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><LockKey size={18} weight="duotone" className="text-emerald-600" /> PIN Gaji</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-1">Menu Gaji dikunci PIN khusus. Masukkan PIN Gaji untuk membuka.</p>
        <Input type="password" inputMode="numeric" value={pin} maxLength={12} autoFocus
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="PIN Gaji" data-testid="hrd-gajipin-input" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={busy || !pin} data-testid="hrd-gajipin-submit">{busy ? "Membuka…" : "Buka Menu Gaji"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ PIN management menu ============================ */
function PinMenu({ meta, hapi, gajiToken, onChanged, onLockGaji, onLockPortal }) {
  const [dlg, setDlg] = useState(null); // 'portal' | 'gaji'
  const [cur, setCur] = useState("");
  const [np, setNp] = useState("");
  const [cp, setCp] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = (v) => v.replace(/\D/g, "");
  const reset = () => { setCur(""); setNp(""); setCp(""); };

  const save = async () => {
    if (np.length < 4) return toast.error("PIN minimal 4 digit");
    if (np !== cp) return toast.error("Konfirmasi PIN tidak cocok");
    setBusy(true);
    try {
      if (dlg === "portal") await hapi.post("/hrd/portal-pin/set", { pin: np, current_pin: cur || null });
      else await hapi.post("/hrd/set-pin", { pin: np, current_pin: cur || null });
      toast.success("PIN berhasil disimpan");
      setDlg(null); reset(); await onChanged();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { reset(); setDlg("portal"); }} data-testid="hrd-change-portalpin">
          <Key size={15} weight="bold" /> PIN Portal
        </Button>
        {meta.can_manage_gaji_pin && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { reset(); setDlg("gaji"); }} data-testid="hrd-change-gajipin">
            <LockKey size={15} weight="bold" /> {meta.gaji_pin_set ? "Reset PIN Gaji" : "Atur PIN Gaji"}
          </Button>
        )}
        {gajiToken && <Button variant="ghost" size="sm" className="text-slate-500" onClick={onLockGaji}>Kunci Gaji</Button>}
        {!meta.is_super && <Button variant="ghost" size="sm" className="text-slate-500 gap-1.5" onClick={onLockPortal} data-testid="hrd-lock-portal"><Lock size={15} /> Keluar</Button>}
      </div>

      <Dialog open={!!dlg} onOpenChange={(o) => { if (!o) { setDlg(null); reset(); } }}>
        <DialogContent className="max-w-sm" data-testid="hrd-pin-manage-dialog">
          <DialogHeader><DialogTitle>{dlg === "portal" ? "Ganti PIN Portal" : (meta.gaji_pin_set ? "Reset PIN Gaji" : "Atur PIN Gaji")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {((dlg === "portal" && meta.portal_pin_set) || (dlg === "gaji" && meta.gaji_pin_set)) && (
              <div><Label>PIN Lama</Label><Input type="password" inputMode="numeric" value={cur} onChange={(e) => setCur(clean(e.target.value))} data-testid="hrd-pin-old" /></div>
            )}
            <div><Label>PIN Baru</Label><Input type="password" inputMode="numeric" value={np} onChange={(e) => setNp(clean(e.target.value))} data-testid="hrd-pin-new" /></div>
            <div><Label>Konfirmasi PIN Baru</Label><Input type="password" inputMode="numeric" value={cp} onChange={(e) => setCp(clean(e.target.value))} data-testid="hrd-pin-confirm" /></div>
            {dlg === "gaji" && <p className="text-xs text-slate-500">PIN Gaji digunakan untuk membuka menu Gaji (Karyawan, Slip Gaji, Kirim Email, Pengaturan).</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDlg(null); reset(); }}>Batal</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={save} disabled={busy} data-testid="hrd-pin-save">{busy ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============================ Home (cards) ============================ */
function HrdHome({ access, isSuper, onOpen, gajiUnlocked, gajiPinSet }) {
  const cards = [
    { key: "employees", menu: "hrd_karyawan", gaji: true, label: "Data Karyawan", desc: "Master karyawan: nama, jabatan, email, rekening.", icon: UsersThree, color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200" },
    { key: "payslips", menu: "hrd_slip_gaji", gaji: true, label: "Slip Gaji", desc: "Upload Excel konsultan, buat & cetak slip gaji.", icon: Receipt, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
    { key: "email", menu: "hrd_email", gaji: true, label: "Kirim Email", desc: "Kirim slip gaji ke email tiap karyawan + status.", icon: EnvelopeSimple, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
    { key: "settings", menu: "hrd_settings", gaji: true, label: "Pengaturan Email", desc: "Konfigurasi Gmail (App Password) untuk kirim.", icon: Gear, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
    { key: "dokumen", menu: "hrd_dokumen", gaji: false, label: "Dokumen HRD", desc: "Absensi, cuti, kontrak, arsip karyawan (segera).", icon: FolderSimple, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
    { key: "logs", menu: null, gaji: false, label: "Log Akses", desc: "Catatan akses portal & perubahan PIN.", icon: ClockCounterClockwise, color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" },
  ];
  const visible = cards.filter((c) => isSuper || c.menu === null || (access[c.menu] && access[c.menu].view));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="hrd-home">
      {visible.map((c) => {
        const Icon = c.icon;
        const locked = c.gaji && !isSuper && gajiPinSet && !gajiUnlocked;
        return (
          <button key={c.key} onClick={() => onOpen(c)} data-testid={`hrd-card-${c.key}`}
            className="group relative text-left bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-400 hover:shadow-md transition-all duration-200">
            {locked && <span className="absolute top-3 right-3 text-slate-400" title="Terkunci PIN Gaji"><LockKey size={16} weight="fill" /></span>}
            <span className={`w-11 h-11 flex items-center justify-center ${c.bg} border ${c.border} rounded-md mb-3`}>
              <Icon size={22} weight="duotone" className={c.color} />
            </span>
            <div className="text-base font-bold text-slate-800" style={{ fontFamily: "Chivo, sans-serif" }}>{c.label}</div>
            <div className="text-xs text-slate-500 mt-1 leading-relaxed">{c.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ============================ Employees ============================ */
const EMPTY_EMP = { nik: "", nama: "", email: "", jabatan: "", dept: "Production", no_rekening: "", bank: "" };
function EmployeesSection({ hapi, can }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState(EMPTY_EMP);
  const [editId, setEditId] = useState(null);
  const [delId, setDelId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try { const r = await hapi.get("/hrd/employees", { params: { q: query } }); setItems(r.data.items || []); }
    catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }, [hapi]);
  useEffect(() => { load(""); }, [load]);

  const openNew = () => { setForm(EMPTY_EMP); setEditId(null); setDlg(true); };
  const openEdit = (emp) => { setForm({ ...EMPTY_EMP, ...emp }); setEditId(emp.id); setDlg(true); };
  const save = async () => {
    if (!form.nama.trim()) return toast.error("Nama wajib diisi");
    setBusy(true);
    try {
      if (editId) await hapi.put(`/hrd/employees/${editId}`, form);
      else await hapi.post("/hrd/employees", form);
      toast.success("Karyawan tersimpan"); setDlg(false); load(q);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    try { await hapi.delete(`/hrd/employees/${delId}`); toast.success("Karyawan dihapus"); setDelId(null); load(q); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div data-testid="hrd-employees">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold text-slate-800">Data Karyawan <span className="text-slate-400 font-normal">({items.length})</span></h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} placeholder="Cari nama / NIK / jabatan" className="pl-8 w-64" data-testid="hrd-emp-search" />
          </div>
          {can?.create && <Button className="bg-teal-600 hover:bg-teal-700 gap-1.5" onClick={openNew} data-testid="hrd-emp-add"><Plus size={16} weight="bold" /> Tambah</Button>}
        </div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">NIK</th>
              <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
              <th className="text-left px-4 py-2.5 font-semibold">Jabatan</th>
              <th className="text-left px-4 py-2.5 font-semibold">Email</th>
              <th className="text-left px-4 py-2.5 font-semibold">Bank / Rekening</th>
              <th className="text-right px-4 py-2.5 font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (<tr><td colSpan={6} className="text-center py-10 text-slate-400">Memuat…</td></tr>)
              : items.length === 0 ? (<tr><td colSpan={6} className="text-center py-10 text-slate-400">Belum ada karyawan.</td></tr>)
                : items.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50" data-testid={`hrd-emp-row-${e.id}`}>
                    <td className="px-4 py-2.5 text-slate-600">{e.nik || "-"}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{e.nama}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.jabatan || "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.email || "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{[e.bank, e.no_rekening].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {can?.edit && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)} data-testid={`hrd-emp-edit-${e.id}`}><PencilSimple size={16} /></Button>}
                        {can?.delete && <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600" onClick={() => setDelId(e.id)} data-testid={`hrd-emp-del-${e.id}`}><Trash size={16} /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="max-w-lg" data-testid="hrd-emp-dialog">
          <DialogHeader><DialogTitle>{editId ? "Edit Karyawan" : "Tambah Karyawan"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1">
            <div><Label>NIK / Kode</Label><Input value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} placeholder="MKS 0021" data-testid="hrd-emp-f-nik" /></div>
            <div><Label>Nama *</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} data-testid="hrd-emp-f-nama" /></div>
            <div><Label>Jabatan</Label><Input value={form.jabatan} onChange={(e) => setForm({ ...form, jabatan: e.target.value })} data-testid="hrd-emp-f-jabatan" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="hrd-emp-f-email" /></div>
            <div><Label>Bank</Label><Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="BCA" data-testid="hrd-emp-f-bank" /></div>
            <div><Label>No. Rekening</Label><Input value={form.no_rekening} onChange={(e) => setForm({ ...form, no_rekening: e.target.value })} data-testid="hrd-emp-f-rek" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Batal</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={save} disabled={busy} data-testid="hrd-emp-save">{busy ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus karyawan?</AlertDialogTitle>
            <AlertDialogDescription>Data karyawan akan dihapus. Slip gaji yang sudah dibuat tidak ikut terhapus.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={doDelete} data-testid="hrd-emp-del-confirm">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================ Period picker ============================ */
function PeriodPicker({ month, year, setMonth, setYear }) {
  return (
    <div className="flex items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
        <SelectTrigger className="w-36" data-testid="hrd-period-month"><SelectValue /></SelectTrigger>
        <SelectContent>{BULAN.slice(1).map((b, i) => <SelectItem key={i + 1} value={String(i + 1)}>{b}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
        <SelectTrigger className="w-28" data-testid="hrd-period-year"><SelectValue /></SelectTrigger>
        <SelectContent>{[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

/* ============================ Payslips ============================ */
function PayslipsSection({ hapi, can }) {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [delId, setDelId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hapi.get("/hrd/payslips", { params: { month, year } }); setItems(r.data.items || []); }
    catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }, [hapi, month, year]);
  useEffect(() => { load(); }, [load]);

  const openPdf = async (id) => {
    try {
      const r = await hapi.get(`/hrd/payslips/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const downloadTemplate = async () => {
    try {
      const r = await hapi.get("/hrd/import-template", { responseType: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(r.data);
      a.download = "Template_Import_Slip_Gaji.xlsx"; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const onImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("month", month); fd.append("year", year);
      const r = await hapi.post("/hrd/payslips/import-excel", fd);
      toast.success(`Import selesai: ${r.data.created} baru, ${r.data.updated} diperbarui (${r.data.names?.length || 0} karyawan)`);
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setImporting(false); }
  };
  const doDelete = async () => {
    try { await hapi.delete(`/hrd/payslips/${delId}`); toast.success("Slip dihapus"); setDelId(null); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const statusBadge = (s) => s === "terkirim"
    ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1"><CheckCircle size={12} weight="fill" /> Terkirim</Badge>
    : s === "gagal" ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 gap-1"><XCircle size={12} weight="fill" /> Gagal</Badge>
      : <Badge variant="secondary" className="text-slate-500">Belum</Badge>;

  return (
    <div data-testid="hrd-payslips">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3"><h2 className="text-lg font-bold text-slate-800">Slip Gaji</h2><PeriodPicker month={month} year={year} setMonth={setMonth} setYear={setYear} /></div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate} data-testid="hrd-tmpl-btn"><DownloadSimple size={15} /> Template</Button>
          {can?.create && (
            <label className="inline-flex">
              <input type="file" accept=".xlsx" hidden onChange={(e) => onImport(e.target.files?.[0])} data-testid="hrd-import-input" />
              <Button variant="default" size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5" asChild disabled={importing}>
                <span className="cursor-pointer">{importing ? "Mengimport…" : <><UploadSimple size={15} /> Upload Excel</>}</span>
              </Button>
            </label>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-md p-2.5 mb-3">
        <WarningCircle size={15} weight="fill" className="shrink-0 mt-0.5" />
        Upload file Excel dari konsultan (berisi sheet slip per karyawan). Sistem otomatis membaca tiap slip & mencocokkan email dari Data Karyawan.
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
              <th className="text-left px-4 py-2.5 font-semibold">Jabatan</th>
              <th className="text-right px-4 py-2.5 font-semibold">Penghasilan</th>
              <th className="text-right px-4 py-2.5 font-semibold">Potongan</th>
              <th className="text-right px-4 py-2.5 font-semibold">Take Home</th>
              <th className="text-center px-4 py-2.5 font-semibold">Email</th>
              <th className="text-right px-4 py-2.5 font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (<tr><td colSpan={7} className="text-center py-10 text-slate-400">Memuat…</td></tr>)
              : items.length === 0 ? (<tr><td colSpan={7} className="text-center py-10 text-slate-400">Belum ada slip untuk {BULAN[month]} {year}. Klik "Upload Excel".</td></tr>)
                : items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50" data-testid={`hrd-slip-row-${s.id}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.nama}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.jabatan || "-"}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatRupiah(s.gross)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatRupiah(s.total_deduction)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{formatRupiah(s.take_home)}</td>
                    <td className="px-4 py-2.5 text-center">{statusBadge(s.email_status)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-600" onClick={() => openPdf(s.id)} data-testid={`hrd-slip-pdf-${s.id}`}><FilePdf size={16} /></Button>
                        {can?.delete && <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setDelId(s.id)} data-testid={`hrd-slip-del-${s.id}`}><Trash size={16} /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus slip gaji?</AlertDialogTitle>
            <AlertDialogDescription>Slip gaji ini akan dihapus permanen dari periode ini.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={doDelete} data-testid="hrd-slip-del-confirm">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================ Email ============================ */
function EmailSection({ hapi, can, onGoSettings }) {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState({});
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hapi.get("/hrd/payslips", { params: { month, year } }); setItems(r.data.items || []); setSel({}); }
    catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }, [hapi, month, year]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { hapi.get("/hrd/settings").then((r) => setSettings(r.data)).catch(() => {}); }, [hapi]);

  const gmailReady = settings?.gmail_user && settings?.has_app_password;
  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const allChecked = items.length > 0 && selectedIds.length === items.length;

  const doBlast = async () => {
    setConfirmOpen(false); setSending(true);
    try {
      const body = { month, year };
      if (selectedIds.length && selectedIds.length < items.length) body.ids = selectedIds;
      const r = await hapi.post("/hrd/blast", body);
      toast.success(`Selesai: ${r.data.sent} terkirim, ${r.data.failed} gagal`); load();
    } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };
  const statusBadge = (s) => s === "terkirim"
    ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1"><CheckCircle size={12} weight="fill" /> Terkirim</Badge>
    : s === "gagal" ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 gap-1"><XCircle size={12} weight="fill" /> Gagal</Badge>
      : <Badge variant="secondary" className="text-slate-500">Belum</Badge>;

  return (
    <div data-testid="hrd-email">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3"><h2 className="text-lg font-bold text-slate-800">Kirim Slip via Email</h2><PeriodPicker month={month} year={year} setMonth={setMonth} setYear={setYear} /></div>
        {can?.create && (
          <Button className="bg-teal-600 hover:bg-teal-700 gap-1.5" disabled={!gmailReady || items.length === 0 || sending} onClick={() => setConfirmOpen(true)} data-testid="hrd-blast-btn">
            <PaperPlaneTilt size={16} weight="fill" /> {sending ? "Mengirim…" : selectedIds.length ? `Kirim ${selectedIds.length} Terpilih` : "Kirim Semua"}
          </Button>
        )}
      </div>

      {!gmailReady && (
        <div className="flex items-center justify-between gap-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 mb-4" data-testid="hrd-email-warning">
          <span className="flex items-center gap-2"><WarningCircle size={18} weight="fill" /> Email Gmail belum dikonfigurasi. Atur dulu di Pengaturan Email.</span>
          <Button variant="outline" size="sm" onClick={onGoSettings}>Buka Pengaturan</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 w-10"><Checkbox checked={allChecked} onCheckedChange={(v) => { const n = {}; if (v) items.forEach((s) => n[s.id] = true); setSel(n); }} data-testid="hrd-email-checkall" /></th>
              <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
              <th className="text-left px-4 py-2.5 font-semibold">Email</th>
              <th className="text-right px-4 py-2.5 font-semibold">Take Home</th>
              <th className="text-center px-4 py-2.5 font-semibold">Status</th>
              <th className="text-left px-4 py-2.5 font-semibold">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (<tr><td colSpan={6} className="text-center py-10 text-slate-400">Memuat…</td></tr>)
              : items.length === 0 ? (<tr><td colSpan={6} className="text-center py-10 text-slate-400">Belum ada slip untuk {BULAN[month]} {year}.</td></tr>)
                : items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50" data-testid={`hrd-email-row-${s.id}`}>
                    <td className="px-4 py-2.5"><Checkbox checked={!!sel[s.id]} onCheckedChange={(v) => setSel({ ...sel, [s.id]: v })} data-testid={`hrd-email-check-${s.id}`} /></td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.nama}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.email || <span className="text-rose-500">— kosong —</span>}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatRupiah(s.take_home)}</td>
                    <td className="px-4 py-2.5 text-center">{statusBadge(s.email_status)}</td>
                    <td className="px-4 py-2.5 text-xs text-rose-500">{s.email_error || ""}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Kirim slip gaji?</AlertDialogTitle>
            <AlertDialogDescription>Slip gaji periode <b>{BULAN[month]} {year}</b> akan dikirim ke {selectedIds.length ? `${selectedIds.length} karyawan terpilih` : `semua ${items.length} karyawan`}. Tiap karyawan menerima PDF slip masing-masing.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-teal-600 hover:bg-teal-700" onClick={doBlast} data-testid="hrd-blast-confirm">Ya, Kirim</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================ Settings ============================ */
function SettingsSection({ hapi, can }) {
  const [f, setF] = useState({ gmail_user: "", sender_name: "PT. MITRA KARYA SARANA", app_password: "" });
  const [hasPw, setHasPw] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    hapi.get("/hrd/settings").then((r) => {
      setF((p) => ({ ...p, gmail_user: r.data.gmail_user || "", sender_name: r.data.sender_name || "PT. MITRA KARYA SARANA", app_password: "" }));
      setHasPw(!!r.data.has_app_password);
    }).catch((e) => toast.error(errMsg(e)));
  }, [hapi]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { gmail_user: f.gmail_user, sender_name: f.sender_name };
      if (f.app_password) body.app_password = f.app_password;
      await hapi.post("/hrd/settings", body);
      toast.success("Pengaturan tersimpan"); setF((p) => ({ ...p, app_password: "" })); if (f.app_password) setHasPw(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-2xl" data-testid="hrd-settings">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Pengaturan Email (Gmail)</h2>
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-2 text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-md p-3">
          <ShieldCheck size={18} weight="fill" className="shrink-0 mt-0.5" />
          <div>Gunakan <b>Gmail App Password</b> (bukan password login biasa). Buat di akun Google: <b>Security → 2-Step Verification → App passwords</b>. App Password disimpan aman di server dan tidak pernah ditampilkan kembali.</div>
        </div>
        <div><Label>Email Gmail Pengirim</Label><Input type="email" value={f.gmail_user} onChange={(e) => setF({ ...f, gmail_user: e.target.value })} placeholder="hrd@gmail.com" data-testid="hrd-set-gmail" /></div>
        <div><Label>Nama Pengirim (tampil di email)</Label><Input value={f.sender_name} onChange={(e) => setF({ ...f, sender_name: e.target.value })} data-testid="hrd-set-sender" /></div>
        <div><Label>App Password {hasPw && <span className="text-emerald-600 text-xs font-normal">(tersimpan ✓ — kosongkan bila tidak diubah)</span>}</Label>
          <Input type="password" value={f.app_password} onChange={(e) => setF({ ...f, app_password: e.target.value })} placeholder={hasPw ? "••••••••••••" : "16 karakter app password"} data-testid="hrd-set-apppw" /></div>
        {can?.edit && <Button className="bg-teal-600 hover:bg-teal-700" onClick={save} disabled={busy} data-testid="hrd-set-save">{busy ? "Menyimpan…" : "Simpan Pengaturan"}</Button>}
      </Card>
    </div>
  );
}

/* ============================ Dokumen (placeholder) ============================ */
function DokumenSection() {
  const items = [
    { t: "Absensi", d: "Rekap kehadiran & jam kerja karyawan." },
    { t: "Cuti & Izin", d: "Pengajuan dan persetujuan cuti/izin." },
    { t: "Kontrak Kerja", d: "Arsip kontrak & masa berlaku." },
    { t: "Arsip Dokumen Karyawan", d: "KTP, NPWP, sertifikat, dsb." },
    { t: "Dashboard HR", d: "Ringkasan headcount, turnover, dll." },
  ];
  return (
    <div data-testid="hrd-dokumen">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Dokumen HRD</h2>
      <p className="text-sm text-slate-500 mb-4">Modul dokumen HR akan hadir di sistem HRIS. Berikut rencana fitur:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <Card key={it.t} className="p-5 relative">
            <Badge variant="secondary" className="absolute top-3 right-3 text-[10px]">Segera</Badge>
            <FolderSimple size={22} weight="duotone" className="text-rose-500 mb-2" />
            <div className="font-bold text-slate-800">{it.t}</div>
            <div className="text-xs text-slate-500 mt-1">{it.d}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================ Logs ============================ */
function LogsSection({ hapi }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { hapi.get("/hrd/logs").then((r) => setItems(r.data.items || [])).catch((e) => toast.error(errMsg(e))).finally(() => setLoading(false)); }, [hapi]);
  const color = (a) => a === "hrd_access_denied" ? "text-rose-600" : (a === "hrd_set_pin" || a === "hrd_set_portal_pin") ? "text-amber-600" : a === "hrd_blast" ? "text-teal-600" : "text-slate-600";
  return (
    <div data-testid="hrd-logs">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Log Akses HRD</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Waktu</th>
              <th className="text-left px-4 py-2.5 font-semibold">User</th>
              <th className="text-left px-4 py-2.5 font-semibold">Aktivitas</th>
              <th className="text-left px-4 py-2.5 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (<tr><td colSpan={4} className="text-center py-10 text-slate-400">Memuat…</td></tr>)
              : items.length === 0 ? (<tr><td colSpan={4} className="text-center py-10 text-slate-400">Belum ada log.</td></tr>)
                : items.map((l, i) => (
                  <tr key={l.id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTimeWIB(l.timestamp)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{l.user_name || l.username || "-"}</td>
                    <td className={`px-4 py-2.5 font-medium ${color(l.action)}`}>{l.action_label}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{l.details ? Object.entries(l.details).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
