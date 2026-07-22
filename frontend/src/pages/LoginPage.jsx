import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { Navigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { SignIn } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("susanto");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr("");
    const res = await login(username, password);
    setSubmitting(false);
    if (!res.ok) {
      setErr(res.error || "Login gagal");
      toast.error(res.error || "Login gagal");
    } else {
      toast.success("Selamat datang!");
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[#F8F9FA]">
      <div className="hidden lg:flex flex-col relative overflow-hidden">
        <div className="flex-1 relative">
          <img
            src="/assets/building.webp"
            alt="MKS Facility"
            className="object-cover w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/60" />
        </div>
        <div className="bg-white/95 backdrop-blur px-10 py-6 border-t border-slate-200">
          <div className="text-[11px] uppercase tracking-[0.25em] font-bold text-sky-700">
            Engineering Excellence · Steel Fabrication · Marine Contractor · General Construction
          </div>
          <div className="mt-2 text-sm text-slate-600" style={{ fontFamily: "Chivo, sans-serif" }}>
            Taiwan International Park — Batam — Indonesia
          </div>
        </div>
      </div>

      <div className="flex items-start justify-center p-6 sm:p-12 sm:pt-24">
        <Card className="w-full max-w-md rounded-none border-slate-200 shadow-none">
          <CardContent className="p-8">
            <div className="mb-8">
              <div className="flex items-center gap-3 text-slate-900">
                <img src="/assets/logo-mks.png" alt="MKS" className="w-10 h-10 object-contain" />
                <div>
                  <div className="font-bold text-lg tracking-tight leading-none" style={{ fontFamily: "Chivo, sans-serif" }}>
                    Purchasing Department
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mt-1">PT. Mitra Karya Sarana</div>
                </div>
              </div>
              <h1 className="mt-6 text-2xl font-semibold text-slate-900 tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>
                Masuk ke Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">Silakan masuk dengan akun admin Anda.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  data-testid="login-email-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-10 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 focus:border-sky-600"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 focus:border-sky-600"
                />
              </div>

              {err && (
                <div data-testid="login-error" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
                  {err}
                </div>
              )}

              <Button
                type="submit"
                data-testid="login-submit-btn"
                disabled={submitting}
                className="w-full h-10 rounded-none bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase tracking-[0.1em] text-xs active:scale-[0.98] transition-transform"
              >
                <SignIn size={16} weight="bold" className="mr-2" />
                {submitting ? "Memproses..." : "Masuk"}
              </Button>

              <div className="text-xs text-slate-400 pt-4 border-t border-slate-200">
                Default: <span className="font-mono text-slate-600">susanto / admin123</span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
