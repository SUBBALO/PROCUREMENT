import React, { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { LockKey, Shield, Warning } from "@phosphor-icons/react";

export default function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const mustChange = !!user?.must_change_password;

  // Password policy checker (live indicator)
  const checks = [
    { label: "Minimal 10 karakter", ok: next.length >= 10 },
    { label: "Mengandung huruf besar (A-Z)", ok: /[A-Z]/.test(next) },
    { label: "Mengandung angka (0-9)", ok: /[0-9]/.test(next) },
    { label: "Berbeda dari password lama", ok: next && next !== current },
    { label: "Konfirmasi cocok", ok: next && next === confirm },
  ];
  const allOk = checks.every((c) => c.ok);

  const submit = async (e) => {
    e.preventDefault();
    if (!allOk) return toast.error("Password baru belum memenuhi semua syarat");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password berhasil diganti");
      if (refresh) await refresh();
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal ganti password");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-none border-2 border-slate-800 shadow-2xl">
        <div className="bg-slate-900 text-white p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-amber-400">
            <Shield size={14} weight="fill" /> Keamanan Akun
          </div>
          <h1 className="text-xl font-bold mt-1">Ganti Password</h1>
          <p className="text-xs text-slate-300 mt-1">
            User: <b>{user?.name}</b> ({user?.username})
          </p>
        </div>

        <div className="p-5">
          {mustChange && (
            <div className="border-2 border-amber-500 bg-amber-50 p-3 mb-4 flex gap-2">
              <Warning size={20} weight="fill" className="text-amber-700 shrink-0" />
              <div className="text-xs text-amber-900">
                Anda login pakai <b>password default</b>. Wajib ganti sekarang sebelum bisa akses sistem.
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-700 block mb-1">
                Password Lama
              </label>
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="rounded-none border-slate-400"
                autoComplete="current-password"
                data-testid="cp-current"
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-700 block mb-1">
                Password Baru
              </label>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="rounded-none border-slate-400"
                autoComplete="new-password"
                data-testid="cp-new"
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-700 block mb-1">
                Konfirmasi Password Baru
              </label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-none border-slate-400"
                autoComplete="new-password"
                data-testid="cp-confirm"
                required
              />
            </div>

            {/* Live policy checklist */}
            <div className="border border-slate-300 p-3 bg-slate-50">
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-700 mb-2">
                Persyaratan Password:
              </div>
              <ul className="space-y-1">
                {checks.map((c) => (
                  <li key={c.label} className={`text-xs flex items-center gap-1.5 ${c.ok ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className="font-mono">{c.ok ? "✓" : "○"}</span> {c.label}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              type="submit"
              disabled={!allOk || busy}
              className="w-full rounded-none bg-slate-900 hover:bg-slate-800 text-white h-11 disabled:opacity-40"
              data-testid="cp-submit"
            >
              <LockKey size={16} weight="bold" className="mr-2" />
              {busy ? "Menyimpan..." : "Ganti Password"}
            </Button>
          </form>

          {!mustChange && (
            <button
              onClick={() => navigate(-1)}
              className="w-full mt-3 text-xs text-slate-500 hover:text-slate-800 underline"
              data-testid="cp-cancel"
            >
              Batal & kembali
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
