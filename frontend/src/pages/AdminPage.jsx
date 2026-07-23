import React, { useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  UsersThree, Plus, PencilSimple, Trash, Key, ShieldStar, Clock, FunnelSimple, CheckCircle, XCircle, ChatCircleDots,
  Database, DownloadSimple, UploadSimple, Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

const ACTION_LABEL = {
  login: "Login", logout: "Logout",
  create_user: "Buat User", update_user: "Update User", delete_user: "Hapus User",
  create_transaction: "Buat Transaksi", bulk_create_transaction: "Buat Bulk Transaksi",
  update_transaction: "Edit Transaksi", delete_transaction: "Hapus Transaksi",
  store_receive: "Terima Stok", store_issue: "Keluar Stok",
};
const ACTION_COLOR = {
  login: "bg-emerald-50 text-emerald-700 border-emerald-200",
  logout: "bg-slate-50 text-slate-700 border-slate-200",
  create_user: "bg-sky-50 text-sky-700 border-sky-200",
  update_user: "bg-amber-50 text-amber-700 border-amber-200",
  delete_user: "bg-red-50 text-red-700 border-red-200",
  create_transaction: "bg-sky-50 text-sky-700 border-sky-200",
  bulk_create_transaction: "bg-sky-50 text-sky-700 border-sky-200",
  update_transaction: "bg-amber-50 text-amber-700 border-amber-200",
  delete_transaction: "bg-red-50 text-red-700 border-red-200",
  store_receive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  store_issue: "bg-amber-50 text-amber-700 border-amber-200",
};

const fmtDT = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function AdminPage() {
  const { user: me } = useAuth();
  const location = useLocation();
  const canApprove = me && me.role === "admin" && (me.perms || []).includes("approve_store_requests");
  const isSuperAdmin = !!me?.is_super_admin;
  const canAccessAdmin = isSuperAdmin || canApprove;

  // Non-authorized users → redirect to landing (no error toast spam)
  if (me && !canAccessAdmin) {
    return <Navigate to="/" replace />;
  }
  // Read initial tab from URL query (?tab=requests|logs|users)
  const initialTab = React.useMemo(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("tab");
    if (t === "requests" && canApprove) return "approvals";
    if (t === "logs") return "logs";
    // Non-super-admins cannot open the "users" tab — fall back to logs / approvals
    if (t === "users" && !isSuperAdmin) return canApprove ? "approvals" : "logs";
    return isSuperAdmin ? "users" : (canApprove ? "approvals" : "logs");
  }, [location.search, canApprove, isSuperAdmin]);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = React.useCallback(async () => {
    if (!canApprove) return;
    try { const { data } = await api.get("/store/requests/pending-count"); setPendingCount(data.count || 0); } catch {}
  }, [canApprove]);
  useEffect(() => { refreshPending(); const t = setInterval(refreshPending, 30000); return () => clearInterval(t); }, [refreshPending]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-sky-50 border border-sky-200 text-sky-700">
          <ShieldStar size={22} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Admin Panel
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSuperAdmin ? "Kelola user, " : ""}
            {canApprove ? "persetujuan koreksi Store, dan " : ""}
            pantau aktivitas.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-none bg-white border border-slate-200 p-0 h-auto">
          {isSuperAdmin && (
            <TabsTrigger data-testid="tab-users" value="users" className="rounded-none data-[state=active]:bg-slate-900 data-[state=active]:text-white text-xs uppercase tracking-[0.1em] font-semibold h-9 px-4">
              <UsersThree size={14} weight="bold" className="mr-1.5" /> Kelola User
            </TabsTrigger>
          )}
          {canApprove && (
            <TabsTrigger data-testid="tab-approvals" value="approvals" className="rounded-none data-[state=active]:bg-slate-900 data-[state=active]:text-white text-xs uppercase tracking-[0.1em] font-semibold h-9 px-4 relative">
              <ChatCircleDots size={14} weight="bold" className="mr-1.5" /> Persetujuan Store
              {pendingCount > 0 && <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[10px] font-bold bg-red-600 text-white rounded-full">{pendingCount}</span>}
            </TabsTrigger>
          )}
          <TabsTrigger data-testid="tab-logs" value="logs" className="rounded-none data-[state=active]:bg-slate-900 data-[state=active]:text-white text-xs uppercase tracking-[0.1em] font-semibold h-9 px-4">
            <Clock size={14} weight="bold" className="mr-1.5" /> Log Aktivitas
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger data-testid="tab-backup" value="backup" className="rounded-none data-[state=active]:bg-slate-900 data-[state=active]:text-white text-xs uppercase tracking-[0.1em] font-semibold h-9 px-4">
              <Database size={14} weight="bold" className="mr-1.5" /> Backup & Reset
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users" className="mt-4">{isSuperAdmin && <UsersTab me={me} />}</TabsContent>
        {canApprove && <TabsContent value="approvals" className="mt-4"><ApprovalsTab onReviewed={refreshPending} /></TabsContent>}
        <TabsContent value="logs" className="mt-4"><LogsTab /></TabsContent>
        {isSuperAdmin && <TabsContent value="backup" className="mt-4"><BackupTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

/* ---------------- Approvals Tab ---------------- */
function ApprovalsTab({ onReviewed }) {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/store/requests", { params: status !== "all" ? { status } : {} });
      setItems(data);
    } catch { toast.error("Gagal memuat"); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const review = async (id, approve) => {
    try {
      await api.post(`/store/requests/${id}/review`, { approve, review_note: reviewNote });
      toast.success(approve ? "Disetujui" : "Ditolak");
      setReviewing(null); setReviewNote("");
      load(); onReviewed?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal review");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`text-xs uppercase tracking-[0.1em] font-semibold px-3 h-8 border ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}
            data-testid={`approval-filter-${s}`}
          >{s === "all" ? "Semua" : s}</button>
        ))}
      </div>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Waktu</th>
                <th className="text-left p-3">Pengaju</th>
                <th className="text-left p-3">Tipe</th>
                <th className="text-left p-3">Target</th>
                <th className="text-left p-3">Alasan</th>
                <th className="text-left p-3">Status</th>
                <th className="text-center p-3 w-40">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="approvals-table">
              {loading && (<tr><td colSpan={7} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={7} className="p-6 text-center text-slate-400">Tidak ada permohonan</td></tr>)}
              {items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap text-xs tabular-nums text-slate-500">{fmtDT(r.requested_at)}</td>
                  <td className="p-3 text-xs font-mono">{r.requested_by_username}</td>
                  <td className="p-3">
                    <span className={`text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-1 border ${r.action_type === "delete" ? "bg-red-50 text-red-700 border-red-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                      {r.action_type === "delete" ? "Hapus" : "Edit"} {r.target_type === "receipt" ? "Terima" : "Keluar"}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    <div className="text-slate-900 font-semibold">{r.target_summary?.item_name || "-"}</div>
                    <div className="text-slate-500 tabular-nums">Qty: {r.target_summary?.qty} · {r.target_summary?.so_number ? `SO ${r.target_summary.so_number}` : r.target_summary?.po_no ? `PO ${r.target_summary.po_no}` : ""}</div>
                    {r.proposed_changes?.field && (
                      <div className="text-sky-700 mt-0.5">
                        <span className="font-semibold uppercase text-[10px] tracking-[0.05em]">
                          {r.proposed_changes.field === "qty" ? "Qty" : r.proposed_changes.field === "so_number" ? "SO" : "Pengambil"}:
                        </span>{" "}
                        <span className="line-through text-slate-400">{String(r.proposed_changes.old_value ?? "-")}</span>
                        {" → "}
                        <b>{String(r.proposed_changes.new_value ?? "-")}</b>
                      </div>
                    )}
                    {!r.proposed_changes?.field && r.proposed_changes?.description && <div className="text-sky-700 mt-0.5">→ {r.proposed_changes.description}</div>}
                  </td>
                  <td className="p-3 text-xs text-slate-700 max-w-[240px]">{r.reason}</td>
                  <td className="p-3">
                    <span className={`text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-1 border ${
                      r.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      r.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      "bg-slate-50 text-slate-600 border-slate-200"
                    }`}>{r.status}</span>
                    {r.review_note && <div className="text-[10px] text-slate-500 mt-1">Note: {r.review_note}</div>}
                    {r.reviewed_by_username && <div className="text-[10px] text-slate-400 mt-0.5">oleh {r.reviewed_by_username}</div>}
                  </td>
                  <td className="p-3 text-center">
                    {r.status === "pending" ? (
                      <button
                        onClick={() => { setReviewing(r); setReviewNote(""); }}
                        data-testid={`review-${r.id}`}
                        className="text-xs uppercase tracking-[0.05em] font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 px-3 py-1"
                      >Review</button>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(v) => !v && setReviewing(null)}>
        <DialogContent className="rounded-none max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Permohonan Koreksi</DialogTitle>
            <DialogDescription>
              {reviewing && (
                <div className="mt-2 text-sm space-y-1">
                  <div><span className="text-slate-500">Pengaju:</span> <b className="font-mono">{reviewing.requested_by_username}</b></div>
                  <div><span className="text-slate-500">Jenis:</span> <b>{reviewing.action_type === "delete" ? "Hapus" : "Edit"} {reviewing.target_type === "receipt" ? "Terima" : "Keluar"}</b></div>
                  <div><span className="text-slate-500">Target:</span> <b>{reviewing.target_summary?.item_name}</b> · Qty {reviewing.target_summary?.qty}</div>
                  <div className="pt-2 border-t border-slate-200"><span className="text-slate-500">Alasan:</span> {reviewing.reason}</div>
                  {reviewing.proposed_changes?.field && (
                    <div>
                      <span className="text-slate-500">Field:</span>{" "}
                      <b>{reviewing.proposed_changes.field === "qty" ? "Qty" : reviewing.proposed_changes.field === "so_number" ? "Nomor SO" : "Nama Pengambil"}</b>{" "}
                      · <span className="line-through text-slate-400">{String(reviewing.proposed_changes.old_value ?? "-")}</span>{" → "}
                      <b className="text-sky-700">{String(reviewing.proposed_changes.new_value ?? "-")}</b>
                    </div>
                  )}
                  {!reviewing.proposed_changes?.field && reviewing.proposed_changes?.description && <div><span className="text-slate-500">Usulan perubahan:</span> {reviewing.proposed_changes.description}</div>}
                  {reviewing.action_type === "edit" && reviewing.proposed_changes?.field && (
                    <div className="pt-2 mt-2 border-t border-slate-200 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2">
                      ⚠️ Jika disetujui, perubahan akan <b>langsung diterapkan</b> pada data. Untuk koreksi Qty, alokasi FIFO ke stock akan otomatis di-adjust.
                    </div>
                  )}
                  {reviewing.action_type === "delete" && (
                    <div className="pt-2 mt-2 border-t border-slate-200 text-[11px] text-red-700 bg-red-50 border border-red-200 p-2">
                      ⚠️ Jika disetujui, data akan <b>dihapus permanen</b> dan stok dikembalikan.
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Catatan Review (opsional)</label>
            <Input className="rounded-none border-slate-300 text-sm" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Alasan approve/reject" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)} className="rounded-none">Batal</Button>
            <Button data-testid="reject-btn" onClick={() => review(reviewing.id, false)} className="rounded-none bg-red-600 hover:bg-red-700 text-white">
              <XCircle size={14} weight="bold" className="mr-1.5" /> Tolak
            </Button>
            <Button data-testid="approve-btn" onClick={() => review(reviewing.id, true)} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle size={14} weight="bold" className="mr-1.5" /> Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Users Tab ---------------- */
function UsersTab({ me }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [delUser, setDelUser] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch {
      toast.error("Gagal memuat daftar user");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-500">
          Total <span className="tabular-nums font-semibold text-slate-900">{users.length}</span> user
        </div>
        <Button data-testid="add-user-btn" onClick={() => setCreateOpen(true)} className="rounded-none h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-[0.1em] font-semibold">
          <Plus size={14} weight="bold" className="mr-1.5" /> Tambah User
        </Button>
      </div>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Username</th>
                <th className="text-left p-3">Nama</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Dibuat</th>
                <th className="text-center p-3 w-32">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="users-table">
              {loading && (<tr><td colSpan={6} className="text-center p-6 text-slate-400">Memuat...</td></tr>)}
              {!loading && users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-900 font-mono">{u.username}</td>
                  <td className="p-3 text-slate-700">{u.name || "-"}</td>
                  <td className="p-3">
                    <span className={`text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-1 border ${u.role === "admin" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-1 border ${u.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                      {u.active ? "Aktif" : "Non-aktif"}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{fmtDT(u.created_at)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button data-testid={`edit-user-${u.id}`} onClick={() => setEditUser({ ...u })} className="p-1.5 text-slate-400 hover:text-sky-600" title="Edit"><PencilSimple size={14} weight="bold" /></button>
                      <button data-testid={`pw-user-${u.id}`} onClick={() => setPwUser({ ...u, password: "" })} className="p-1.5 text-slate-400 hover:text-amber-600" title="Reset Password"><Key size={14} weight="bold" /></button>
                      <button
                        data-testid={`del-user-${u.id}`}
                        onClick={() => setDelUser(u)}
                        disabled={u.id === me?.id}
                        className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={u.id === me?.id ? "Tidak bisa hapus akun sendiri" : "Hapus"}
                      >
                        <Trash size={14} weight="bold" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />
      <EditUserDialog user={editUser} me={me} onClose={() => setEditUser(null)} onSaved={load} />
      <ResetPasswordDialog user={pwUser} onClose={() => setPwUser(null)} onSaved={load} />
      <DeleteUserDialog user={delUser} onClose={() => setDelUser(null)} onSaved={load} />
    </div>
  );
}

function CreateUserDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "staff", view_store_report: false, approve_store_requests: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ username: "", password: "", name: "", role: "staff", view_store_report: false, approve_store_requests: false }); }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const perms = [];
      if (form.view_store_report) perms.push("view_store_report");
      if (form.approve_store_requests && form.role === "admin") perms.push("approve_store_requests");
      await api.post("/users", { username: form.username, password: form.password, name: form.name, role: form.role, perms });
      toast.success("User berhasil dibuat");
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membuat user");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none" data-testid="create-user-dialog">
        <DialogHeader>
          <DialogTitle>Tambah User Baru</DialogTitle>
          <DialogDescription>Buat akun baru dengan username & password.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Username *</Label>
            <Input data-testid="new-username" className={`${inputCls} font-mono`} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="mis. staff01" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Password *</Label>
            <Input data-testid="new-password" type="text" className={`${inputCls} font-mono`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 karakter" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Lengkap</Label>
            <Input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Susanto" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="new-role" className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff (Purchasing)</SelectItem>
                <SelectItem value="store">Store (Gudang)</SelectItem>
                <SelectItem value="finance">Finance (View Only)</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[11px] text-slate-500 mt-1">
              Staff: input purchasing · Store: terima/keluar barang · Finance: view semua laporan (tidak bisa ubah) · Admin: full access
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-sky-600" checked={!!form.view_store_report} onChange={(e) => setForm({ ...form, view_store_report: e.target.checked })} />
              <span className="text-slate-700">Bisa lihat Laporan Store (harga FIFO)</span>
            </label>
            {form.role === "admin" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.approve_store_requests} onChange={(e) => setForm({ ...form, approve_store_requests: e.target.checked })} />
                <span className="text-slate-700">Bisa <b>Approve</b> permohonan koreksi Store</span>
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button data-testid="save-new-user-btn" onClick={save} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800">{saving ? "Menyimpan..." : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, me, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (user) {
      const p = user.perms || [];
      setForm({
        name: user.name || "",
        role: user.role,
        active: user.active,
        view_store_report: p.includes("view_store_report"),
        approve_store_requests: p.includes("approve_store_requests"),
      });
    }
  }, [user]);
  if (!user || !form) return null;
  const isSelf = user.id === me?.id;

  const save = async () => {
    setSaving(true);
    try {
      const perms = [];
      if (form.view_store_report) perms.push("view_store_report");
      if (form.approve_store_requests && form.role === "admin") perms.push("approve_store_requests");
      await api.put(`/users/${user.id}`, {
        name: form.name, role: form.role, active: form.active, perms,
      });
      toast.success("User diperbarui");
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal update");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none">
        <DialogHeader>
          <DialogTitle>Edit User: <span className="font-mono">{user.username}</span></DialogTitle>
          <DialogDescription>Ubah nama, role, status, dan izin.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs font-semibold text-slate-600 mb-1 block">Nama Lengkap</Label><Input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Role {isSelf && <span className="text-red-500">(tidak bisa demote diri sendiri)</span>}</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })} disabled={isSelf}>
              <SelectTrigger className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff (Purchasing)</SelectItem>
                <SelectItem value="store">Store (Gudang)</SelectItem>
                <SelectItem value="finance">Finance (View Only)</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Status {isSelf && <span className="text-red-500">(tidak bisa nonaktifkan diri sendiri)</span>}</Label>
            <Select value={form.active ? "true" : "false"} onValueChange={(v) => setForm({ ...form, active: v === "true" })} disabled={isSelf}>
              <SelectTrigger className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Aktif</SelectItem>
                <SelectItem value="false">Non-aktif</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-sky-600" checked={!!form.view_store_report} onChange={(e) => setForm({ ...form, view_store_report: e.target.checked })} />
              <span className="text-slate-700">Bisa lihat Laporan Store (harga FIFO)</span>
            </label>
            {form.role === "admin" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.approve_store_requests} onChange={(e) => setForm({ ...form, approve_store_requests: e.target.checked })} />
                <span className="text-slate-700">Bisa <b>Approve</b> permohonan koreksi Store</span>
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button onClick={save} disabled={saving} className="rounded-none bg-slate-900 hover:bg-slate-800">{saving ? "Menyimpan..." : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPassword(""); }, [user]);
  if (!user) return null;
  const save = async () => {
    if (password.length < 6) return toast.error("Password minimal 6 karakter");
    setSaving(true);
    try {
      await api.put(`/users/${user.id}`, { password });
      toast.success("Password direset");
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reset password");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none">
        <DialogHeader>
          <DialogTitle>Reset Password: <span className="font-mono">{user.username}</span></DialogTitle>
          <DialogDescription>Set password baru untuk user ini.</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Password Baru</Label>
          <Input data-testid="reset-pw-input" type="text" className={`${inputCls} font-mono`} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 karakter" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button data-testid="reset-pw-save-btn" onClick={save} disabled={saving} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white">{saving ? "Menyimpan..." : "Reset Password"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user, onClose, onSaved }) {
  if (!user) return null;
  const confirm = async () => {
    try {
      await api.delete(`/users/${user.id}`);
      toast.success("User dihapus");
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-none">
        <DialogHeader>
          <DialogTitle>Hapus User?</DialogTitle>
          <DialogDescription>Yakin ingin menghapus user <b className="font-mono">{user.username}</b>? Aksi ini tidak bisa dibatalkan.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button data-testid="confirm-del-user-btn" onClick={confirm} className="rounded-none bg-red-600 hover:bg-red-700 text-white">Hapus</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Logs Tab ---------------- */
function LogsTab() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ user_id: "", action: "", start_date: "", end_date: "" });

  useEffect(() => {
    api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: 50 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get("/logs", { params });
      setLogs(data);
      setPage(p);
    } catch { toast.error("Gagal memuat log"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(logs.total / 50));

  return (
    <div className="space-y-4">
      <Card className="rounded-none border-slate-200 shadow-none p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <FunnelSimple size={16} weight="bold" className="text-slate-500" />
          <h3 className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">Filter Log</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">User</Label>
            <Select value={filters.user_id || "all"} onValueChange={(v) => setFilters({ ...filters, user_id: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="log-user-filter" className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua User</SelectItem>
                {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Aksi</Label>
            <Select value={filters.action || "all"} onValueChange={(v) => setFilters({ ...filters, action: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="log-action-filter" className="rounded-none h-9 border-slate-300 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Aksi</SelectItem>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Dari Tanggal</Label>
            <Input type="date" className={inputCls} value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Sampai Tanggal</Label>
            <Input type="date" className={inputCls} value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="rounded-none border-slate-200 shadow-none bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                <th className="text-left p-3">Waktu</th>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Aksi</th>
                <th className="text-left p-3">Detail</th>
              </tr>
            </thead>
            <tbody data-testid="logs-table">
              {loading && (<tr><td colSpan={4} className="text-center p-6 text-slate-400">Memuat...</td></tr>)}
              {!loading && logs.items.length === 0 && (<tr><td colSpan={4} className="text-center p-6 text-slate-400">Tidak ada log</td></tr>)}
              {!loading && logs.items.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap text-slate-500 text-xs tabular-nums">{fmtDT(l.timestamp)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="font-semibold text-slate-900 font-mono text-xs">{l.username}</div>
                    {l.user_name && <div className="text-[10px] text-slate-400">{l.user_name}</div>}
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-1 border ${ACTION_COLOR[l.action] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                      {ACTION_LABEL[l.action] || l.action}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 text-xs">
                    <LogDetail action={l.action} details={l.details} entity_id={l.entity_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50 text-xs">
          <div>Halaman <span className="tabular-nums font-semibold text-slate-900">{page}</span> dari <span className="tabular-nums font-semibold text-slate-900">{totalPages}</span> ({logs.total.toLocaleString("id-ID")} total)</div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page === 1 || loading} onClick={() => load(page - 1)} className="h-8 rounded-none text-xs">Prev</Button>
            <Button size="sm" variant="ghost" disabled={page >= totalPages || loading} onClick={() => load(page + 1)} className="h-8 rounded-none text-xs">Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LogDetail({ action, details, entity_id }) {
  if (!details) return <span className="text-slate-400">—</span>;
  const d = details;
  switch (action) {
    case "create_transaction":
    case "update_transaction":
    case "delete_transaction":
      return (
        <span>
          <b>{d.item || "-"}</b> di <b>{d.vendor || "-"}</b>
          {d.invoice_no && <> · Invoice <span className="font-mono">{d.invoice_no}</span></>}
          {d.total != null && <> · <span className="tabular-nums">Rp {Number(d.total).toLocaleString("id-ID")}</span></>}
        </span>
      );
    case "bulk_create_transaction":
      return <span><b>{d.count}</b> item · <b>{d.vendor || "-"}</b> · Invoice <span className="font-mono">{d.invoice_no || "-"}</span></span>;
    case "create_user":
    case "delete_user":
      return <span>Username: <b className="font-mono">{d.username || "-"}</b>{d.role && <> · Role {d.role}</>}</span>;
    case "update_user":
      return (
        <span>Target: <b className="font-mono">{d.target || "-"}</b>
          {d.changes && Object.keys(d.changes).length > 0 && <> · Perubahan: {Object.entries(d.changes).map(([k, v]) => `${k}=${v}`).join(", ")}</>}
        </span>
      );
    case "store_receive":
      return <span><b>{d.item}</b> · Qty <b className="tabular-nums">{d.qty}</b>{d.po_no && <> · PO <span className="font-mono">{d.po_no}</span></>}{d.do_number && <> · DO <span className="font-mono">{d.do_number}</span></>}</span>;
    case "store_issue":
      return <span><b>{d.item}</b> · Qty <b className="tabular-nums">{d.qty}</b>{d.so_number && <> · SO <span className="font-mono">{d.so_number}</span></>}{d.taker && <> · oleh <b>{d.taker}</b></>}</span>;
    case "login":
    case "logout":
      return <span className="text-slate-400">—</span>;
    default:
      return <code className="text-[10px] text-slate-500">{JSON.stringify(details)}</code>;
  }
}



/* ================== Backup & Reset Tab (Super Admin only) ================== */
function BackupTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState("merge");
  const [importPhrase, setImportPhrase] = useState("");
  const [importing, setImporting] = useState(false);

  const [wipePhrase, setWipePhrase] = useState("");
  const [keepUsers, setKeepUsers] = useState(true);
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/backup/summary");
      setSummary(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat ringkasan");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/admin/backup/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `mks_backup_${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup berhasil di-download");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal export");
    } finally { setExporting(false); }
  };

  const doImport = async () => {
    if (!importFile) return toast.error("Pilih file backup JSON terlebih dulu");
    if (importPhrase !== "RESTORE-CONFIRM") return toast.error("Ketik 'RESTORE-CONFIRM' persis untuk melanjutkan");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("confirm_phrase", importPhrase);
      fd.append("mode", importMode);
      const { data } = await api.post("/admin/backup/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Restore selesai — ${Object.values(data.restored || {}).reduce((a, b) => a + b, 0)} dokumen`);
      setImportFile(null); setImportPhrase("");
      loadSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal restore");
    } finally { setImporting(false); }
  };

  const doWipe = async () => {
    if (wipePhrase !== "WIPE-ALL-DATA") return toast.error("Ketik 'WIPE-ALL-DATA' persis untuk melanjutkan");
    setWiping(true);
    try {
      const { data } = await api.post("/admin/backup/wipe", { confirm_phrase: wipePhrase, keep_users: keepUsers });
      toast.success(`Database di-reset — ${data.total_deleted} dokumen dihapus`);
      setWipePhrase(""); setWipeConfirmOpen(false);
      loadSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal reset");
    } finally { setWiping(false); }
  };

  return (
    <div className="space-y-5" data-testid="backup-tab">
      {/* Summary */}
      <Card className="rounded-none border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500 mb-0.5">Ringkasan Database</div>
            <div className="text-[11px] text-slate-400">Total dokumen per collection saat ini</div>
          </div>
          <Button variant="outline" onClick={loadSummary} disabled={loading} className="rounded-none text-xs h-8">Refresh</Button>
        </div>
        {loading || !summary ? (
          <div className="text-sm text-slate-400 py-6 text-center">Memuat…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(summary.collections || {}).map(([name, n]) => (
                <div key={name} className="border border-slate-200 p-2" data-testid={`backup-count-${name}`}>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-semibold">{name}</div>
                  <div className="text-lg font-bold tabular-nums text-slate-900">{n.toLocaleString("id-ID")}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">Total: <b className="tabular-nums">{summary.total_documents?.toLocaleString("id-ID")}</b> dokumen</div>
          </>
        )}
      </Card>

      {/* Export */}
      <Card className="rounded-none border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 border border-emerald-300 bg-white text-emerald-700 rounded-none"><DownloadSimple size={20} weight="duotone" /></div>
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-900 mb-0.5">Export Backup (Download JSON)</div>
            <div className="text-xs text-slate-600 mb-3">Download seluruh data database sebagai file JSON. Simpan file ini di tempat aman sebelum melakukan Reset / Import.</div>
            <Button data-testid="backup-export-btn" onClick={doExport} disabled={exporting} className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-[0.1em]">
              <DownloadSimple size={13} weight="bold" className="mr-1" /> {exporting ? "Menyiapkan…" : "Download Backup"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Import */}
      <Card className="rounded-none border-sky-200 bg-sky-50/40 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 border border-sky-300 bg-white text-sky-700 rounded-none"><UploadSimple size={20} weight="duotone" /></div>
          <div className="flex-1 space-y-2">
            <div className="text-sm font-bold text-slate-900">Import / Restore Backup</div>
            <div className="text-xs text-slate-600">
              Restore dari file backup JSON. <b>Mode "merge"</b>: upsert per ID (aman, tidak menghapus data baru). <b>Mode "replace"</b>: hapus dulu semua data lalu insert dari backup (destructive).
            </div>
            <div className="grid md:grid-cols-3 gap-2">
              <div>
                <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">File Backup (.json)</Label>
                <input data-testid="backup-import-file" type="file" accept="application/json,.json" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="text-xs file:mr-3 file:py-1.5 file:px-3 file:border-0 file:bg-slate-900 file:text-white file:text-[10px] file:uppercase file:tracking-[0.1em] file:font-semibold file:cursor-pointer" />
                {importFile && <div className="mt-1 text-[10px] text-slate-500">{importFile.name} · {(importFile.size / 1024).toFixed(1)} KB</div>}
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">Mode</Label>
                <Select value={importMode} onValueChange={setImportMode}>
                  <SelectTrigger className={inputCls} data-testid="backup-import-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">merge (upsert per ID — aman)</SelectItem>
                    <SelectItem value="replace">replace (hapus + insert — destructive)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">Ketik <span className="font-mono text-red-600">RESTORE-CONFIRM</span></Label>
                <Input data-testid="backup-import-phrase" value={importPhrase} onChange={(e) => setImportPhrase(e.target.value)} className={inputCls} placeholder="RESTORE-CONFIRM" />
              </div>
            </div>
            <Button data-testid="backup-import-btn" onClick={doImport} disabled={importing || !importFile || importPhrase !== "RESTORE-CONFIRM"} className="rounded-none bg-sky-600 hover:bg-sky-700 text-white text-xs uppercase tracking-[0.1em]">
              <UploadSimple size={13} weight="bold" className="mr-1" /> {importing ? "Restoring…" : "Restore Sekarang"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Wipe / Reset */}
      <Card className="rounded-none border-red-300 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 border border-red-400 bg-white text-red-700 rounded-none"><Warning size={20} weight="fill" /></div>
          <div className="flex-1 space-y-2">
            <div className="text-sm font-bold text-red-900">DANGER ZONE — Reset Database Fresh</div>
            <div className="text-xs text-red-800">
              Hapus <b>seluruh data bisnis</b>: Transaksi PO, Sales Order, Store Receipt/Issue/Request, Delivery, BOM, Inquiry, Quotation, Customer, Counters &amp; Activity Logs.
              Data <b>User</b> tetap dipertahankan agar Anda dan tim bisa login. <b>Aksi ini tidak bisa di-undo.</b> Selalu Export Backup dulu.
            </div>
            <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[11px] font-semibold text-red-900 mb-1 block">Ketik <span className="font-mono">WIPE-ALL-DATA</span> untuk konfirmasi</Label>
                <Input data-testid="backup-wipe-phrase" value={wipePhrase} onChange={(e) => setWipePhrase(e.target.value)} className="h-9 rounded-none border-red-300 focus:ring-2 focus:ring-red-600 text-sm" placeholder="WIPE-ALL-DATA" />
              </div>
              <label className="flex items-center gap-2 text-xs text-red-900 pb-1 cursor-pointer">
                <input data-testid="backup-wipe-keep-users" type="checkbox" checked={keepUsers} onChange={(e) => setKeepUsers(e.target.checked)} className="w-4 h-4" />
                Pertahankan Users
              </label>
            </div>
            <Button
              data-testid="backup-wipe-btn"
              onClick={() => setWipeConfirmOpen(true)}
              disabled={wipePhrase !== "WIPE-ALL-DATA"}
              className="rounded-none bg-red-600 hover:bg-red-700 text-white text-xs uppercase tracking-[0.1em]"
            >
              <Trash size={13} weight="bold" className="mr-1" /> Reset Database Sekarang
            </Button>
          </div>
        </div>
      </Card>

      {/* Final confirmation dialog */}
      <Dialog open={wipeConfirmOpen} onOpenChange={setWipeConfirmOpen}>
        <DialogContent className="rounded-none max-w-md border-red-400">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2"><Warning size={20} weight="fill" /> Konfirmasi Reset Database</DialogTitle>
            <DialogDescription>
              Anda akan menghapus <b>seluruh data bisnis</b> ({summary?.total_documents?.toLocaleString("id-ID")} dokumen).
              {keepUsers ? " Data User (login) akan dipertahankan." : " Termasuk semua user kecuali akun Anda sendiri."}
              <br /><br />
              Aksi ini <b className="text-red-700">TIDAK BISA di-undo</b>. Pastikan sudah Export Backup.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWipeConfirmOpen(false)} disabled={wiping} className="rounded-none">Batal</Button>
            <Button data-testid="backup-wipe-confirm-btn" onClick={doWipe} disabled={wiping} className="rounded-none bg-red-600 hover:bg-red-700 text-white">
              {wiping ? "Menghapus…" : "Ya, Hapus Sekarang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
