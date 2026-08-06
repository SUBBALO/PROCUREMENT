import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { Button } from "./ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import GlobalSearch from "./GlobalSearch";
import {
  ChartBar, Plus, MagnifyingGlass, SignOut, Package, ChartLineUp, ShieldStar, Warehouse, ArrowDown, ArrowUp,
  ClipboardText, CaretDown, ShoppingCart, Storefront, Truck, ClockCounterClockwise, Bell, HardDrives, UploadSimple,
  Lightning, LightningSlash,
} from "@phosphor-icons/react";

/* Mode Cepat — matikan animasi/transisi (reduce-motion) agar akses terasa instan.
   Tersimpan di localStorage 'mks_reduce_motion' (default: aktif). */
function FastModeToggle() {
  const [fast, setFast] = useState(() => {
    try {
      const v = localStorage.getItem("mks_reduce_motion");
      return v === null ? true : v === "1";
    } catch { return true; }
  });
  useEffect(() => {
    try {
      document.documentElement.classList.toggle("reduce-motion", fast);
      localStorage.setItem("mks_reduce_motion", fast ? "1" : "0");
    } catch { /* noop */ }
  }, [fast]);
  return (
    <button
      onClick={() => { const n = !fast; setFast(n); toast.success(n ? "Mode Cepat aktif — animasi dimatikan" : "Animasi diaktifkan kembali"); }}
      title={fast ? "Mode Cepat AKTIF — klik untuk hidupkan animasi" : "Animasi AKTIF — klik untuk Mode Cepat (tanpa animasi)"}
      className={`flex items-center gap-1 px-2 h-8 text-[10px] uppercase tracking-[0.1em] font-bold border transition-colors ${
        fast ? "border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-100" : "border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
      data-testid="fast-mode-toggle"
    >
      {fast ? <Lightning size={14} weight="fill" /> : <LightningSlash size={14} weight="bold" />}
      {fast ? "Cepat" : "Animasi"}
    </button>
  );
}

// ─── PURCHASING ─────────────────────────────────────────
const PURCHASE_ITEMS = [
  { to: "/", label: "Dashboard", icon: ChartBar, testid: "nav-dashboard" },
  { to: "/input", label: "Input Transaksi", icon: Plus, testid: "nav-input" },
  { to: "/master", label: "Master List", icon: MagnifyingGlass, testid: "nav-master" },
  { to: "/items", label: "Master Barang", icon: Package, testid: "nav-items" },
  { to: "/kpi", label: "KPI Purchasing", icon: ChartLineUp, testid: "nav-kpi" },
];

// ─── STORE — grouped Incoming vs Outgoing ───────────────
const STORE_STOCK = { to: "/store/stock", label: "Stok", icon: Warehouse, testid: "nav-store-stock" };

const STORE_INCOMING = [
  { to: "/store/manual-receive", label: "Input Incoming Goods", icon: ArrowDown, testid: "nav-store-manual" },
  { to: "/store/incoming-report", label: "Laporan Incoming Goods", icon: ClipboardText, testid: "nav-store-incoming-report" },
];

const STORE_OUTGOING = [
  { to: "/store/issue", label: "Keluar Barang", icon: ArrowUp, testid: "nav-store-issue" },
  { to: "/deliveries", label: "Pengiriman", icon: Truck, testid: "nav-deliveries" },
];

const STORE_REPORT = { to: "/store/report", label: "Costing Store", icon: ClipboardText, testid: "nav-store-report" };

// ─── ADMIN ──────────────────────────────────────────────
const ADMIN_ITEM_USERS = { to: "/admin", label: "Kelola User", icon: ShieldStar, testid: "nav-admin" };
const ADMIN_ITEM_LOGS = { to: "/admin?tab=logs", label: "Log Aktivitas", icon: ClockCounterClockwise, testid: "nav-logs" };
const ADMIN_ITEM_STORAGE = { to: "/admin/storage", label: "Kelola Storage", icon: HardDrives, testid: "nav-storage" };
const ADMIN_ITEM_TEMPLATES = { to: "/admin/form-templates", label: "Template Form (MCL, dll)", icon: ClipboardText, testid: "nav-form-templates" };
const ADMIN_ITEM_LEGACY = { to: "/admin/legacy-import", label: "Import Data Lama (Master List)", icon: UploadSimple, testid: "nav-legacy-import" };

function isPathMatch(current, target) {
  const t = target.split("?")[0];
  if (t === "/") return current === "/";
  return current === t || current.startsWith(t + "/");
}

function DeptDropdown({ label, icon: Icon, testid, items, activePath, incoming, outgoing, includeStock, includeReport, canViewReport }) {
  // Determine if any of this dept's routes is active
  const allRoutes = [
    ...(items || []),
    ...(incoming || []),
    ...(outgoing || []),
    ...(includeStock ? [STORE_STOCK] : []),
    ...(includeReport && canViewReport ? [STORE_REPORT] : []),
  ];
  const isActive = allRoutes.some((r) => r && isPathMatch(activePath, r.to));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={testid}
          className={`flex items-center gap-1.5 px-3 h-9 text-[11px] uppercase tracking-[0.1em] font-semibold border-b-2 transition-colors ${
            isActive ? "border-sky-600 text-slate-900 bg-slate-50" : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Icon size={14} weight="duotone" />
          {label}
          <CaretDown size={10} weight="bold" className="ml-0.5 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="rounded-none w-64 border-slate-200">
        {items && items.map((it) => (
          <DropdownMenuItem key={it.to} asChild>
            <NavLink to={it.to} data-testid={it.testid} className="flex items-center gap-2 text-sm cursor-pointer">
              <it.icon size={14} weight="duotone" className="text-slate-500" />
              {it.label}
            </NavLink>
          </DropdownMenuItem>
        ))}

        {includeStock && (
          <>
            <DropdownMenuItem asChild>
              <NavLink to={STORE_STOCK.to} data-testid={STORE_STOCK.testid} className="flex items-center gap-2 text-sm cursor-pointer">
                <STORE_STOCK.icon size={14} weight="duotone" className="text-slate-500" />
                {STORE_STOCK.label}
              </NavLink>
            </DropdownMenuItem>
          </>
        )}

        {incoming && incoming.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] font-bold text-emerald-700">
              Incoming
            </DropdownMenuLabel>
            {incoming.map((it) => (
              <DropdownMenuItem key={it.to} asChild>
                <NavLink to={it.to} data-testid={it.testid} className="flex items-center gap-2 text-sm cursor-pointer pl-4">
                  <it.icon size={14} weight="duotone" className="text-emerald-600" />
                  {it.label}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {outgoing && outgoing.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] font-bold text-amber-700">
              Outgoing
            </DropdownMenuLabel>
            {outgoing.map((it) => (
              <DropdownMenuItem key={it.to} asChild>
                <NavLink to={it.to} data-testid={it.testid} className="flex items-center gap-2 text-sm cursor-pointer pl-4">
                  <it.icon size={14} weight="duotone" className="text-amber-600" />
                  {it.label}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {includeReport && canViewReport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <NavLink to={STORE_REPORT.to} data-testid={STORE_REPORT.testid} className="flex items-center gap-2 text-sm cursor-pointer">
                <STORE_REPORT.icon size={14} weight="duotone" className="text-slate-500" />
                {STORE_REPORT.label}
              </NavLink>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const onLogout = async () => {
    await logout();
    toast.success("Berhasil keluar");
    nav("/login");
  };

  const role = user?.role;
  const perms = user?.perms || [];
  // Role helpers (v2)
  const ADMIN_LIKE = ["admin", "supervisor", "super_admin"];
  const ENG_ROLES = ["engineering", "eng_leader", "eng_head", "eng_staff"];
  const isAdminLike = ADMIN_LIKE.includes(role);
  const canViewStoreReport = isAdminLike || (role !== "store" && perms.includes("view_store_report"));
  const canApprove = (isAdminLike && perms.includes("approve_store_requests")) || role === "supervisor";
  const isSuperAdmin = !!user?.is_super_admin;
  const isLanding = location.pathname === "/";

  // Universal notifications — poll aggregate count + full list
  const [notifData, setNotifData] = useState({ total_count: 0, categories: [] });
  const [notifOpen, setNotifOpen] = useState(false);
  const loadNotif = React.useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifData(data);
    } catch { /* silent */ }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (!cancelled) setNotifData(data);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 45000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const pendingCount = notifData.total_count || 0;
  // Backwards compat: canApprove still used by admin panel gates
  // (approval workflow inside /admin still guarded by backend)

  // Full admins (super_admin OR admin role) get full top nav even on landing page.
  const isFullAdmin = isSuperAdmin || role === "admin";

  // Filter dept visibility per role
  const isEngineering = ENG_ROLES.includes(role);
  const isSales = role === "sales";
  const isPurchasing = role === "purchasing" || role === "staff";  // legacy staff alias
  const isFinanceOnly = role === "finance";
  const showPurchasing = !isEngineering && !isSales && (isAdminLike || isPurchasing || isFinanceOnly);
  const showStore = !isEngineering && !isSales && (isAdminLike || role === "store" || isFinanceOnly);
  // Admin panel: super_admin ONLY (admin role like Erwin cannot access).
  const showAdmin = isSuperAdmin;
  const showBom = !isSales;  // BOM visible for all except sales-only users

  // Purchasing items per role
  const purchasingItems = () => {
    if (isFinanceOnly) {
      // finance sees dashboard + reports, not "Input Transaksi"
      return PURCHASE_ITEMS.filter((x) => x.to !== "/input");
    }
    return PURCHASE_ITEMS;
  };

  // Detect embed mode (loaded inside iframe modal) — hide header entirely.
  const isEmbed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1";

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 flex flex-col">
      {!isEmbed && (
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: brand + main nav dropdowns */}
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity" data-testid="brand-home-link">
              <img src="/assets/logo-mks.png" alt="MKS" className="w-8 h-8 object-contain" />
              <div>
                <div className="font-bold text-sm tracking-tight text-slate-900 leading-tight" style={{ fontFamily: "Chivo, sans-serif" }}>
                  MKS Management System
                </div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 leading-tight">
                  PT. Mitra Karya Sarana
                </div>
              </div>
            </NavLink>

            <nav className="flex items-center gap-1">
              {/* Purchasing & Store hidden entirely for super_admin — they navigate via landing cards. */}
              {!isSuperAdmin && !isLanding && showPurchasing && (
                <DeptDropdown
                  label="Purchasing"
                  icon={ShoppingCart}
                  testid="dept-purchasing"
                  items={purchasingItems()}
                  activePath={location.pathname}
                />
              )}
              {!isSuperAdmin && !isLanding && showStore && (
                <DeptDropdown
                  label="Store"
                  icon={Storefront}
                  testid="dept-store"
                  includeStock={role !== "finance"}
                  incoming={role === "finance"
                    ? [STORE_INCOMING[2]]  // finance: only Laporan Incoming Goods
                    : STORE_INCOMING}
                  outgoing={role === "finance" ? [] : STORE_OUTGOING}
                  includeReport={true}
                  canViewReport={canViewStoreReport}
                  activePath={location.pathname}
                />
              )}
              {(!isLanding || isFullAdmin) && showAdmin && (
                <DeptDropdown
                  label="Admin"
                  icon={ShieldStar}
                  testid="dept-admin"
                  items={[ADMIN_ITEM_USERS, ADMIN_ITEM_LOGS, ADMIN_ITEM_STORAGE, ADMIN_ITEM_TEMPLATES, ADMIN_ITEM_LEGACY]}
                  activePath={location.pathname}
                />
              )}
              {showBom && (
                <NavLink
                  to="/bom"
                  data-testid="nav-bom-top"
                  className={({ isActive }) =>
                    `text-xs uppercase tracking-[0.05em] font-semibold px-3 h-9 flex items-center gap-2 border-b-2 transition-colors ${
                      isActive ? "border-sky-600 text-sky-700" : "border-transparent text-slate-600 hover:text-slate-900"
                    }`
                  }
                >
                  <Package size={14} weight="duotone" /> BOM
                </NavLink>
              )}
              {!isLanding && isEngineering && (
                <NavLink
                  to="/engineering/inquiries"
                  data-testid="nav-inquiries-top"
                  className={({ isActive }) =>
                    `text-xs uppercase tracking-[0.05em] font-semibold px-3 h-9 flex items-center gap-2 border-b-2 transition-colors ${
                      isActive ? "border-rose-600 text-rose-700" : "border-transparent text-slate-600 hover:text-slate-900"
                    }`
                  }
                >
                  <ClipboardText size={14} weight="duotone" /> Inquiries
                </NavLink>
              )}
              {!isLanding && ["engineering", "eng_leader", "eng_head"].includes(role) && (
                <NavLink
                  to="/admin/legacy-import"
                  data-testid="nav-legacy-import-eng"
                  className={({ isActive }) =>
                    `text-xs uppercase tracking-[0.05em] font-semibold px-3 h-9 flex items-center gap-2 border-b-2 transition-colors ${
                      isActive ? "border-rose-600 text-rose-700" : "border-transparent text-slate-600 hover:text-slate-900"
                    }`
                  }
                  title="Import Data Lama ke Drawing Master List"
                >
                  <UploadSimple size={14} weight="duotone" /> Import Data Lama
                </NavLink>
              )}
              {/* Material Costing shortcut — visible for purchasing (Fiana) & finance so they can maintain Master List Harga */}
              {!isLanding && (isPurchasing || isFinanceOnly) && (
                <NavLink
                  to="/engineering/material-costing"
                  data-testid="nav-material-costing-top"
                  className={({ isActive }) =>
                    `text-xs uppercase tracking-[0.05em] font-semibold px-3 h-9 flex items-center gap-2 border-b-2 transition-colors ${
                      isActive ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
                    }`
                  }
                  title="Master List Harga Material — Engineering Reference"
                >
                  <Package size={14} weight="duotone" /> Material Costing
                </NavLink>
              )}
            </nav>
          </div>

          {/* Right: approvals notif + user + logout */}
          <div className="flex items-center gap-2">
          {/* Global Search (⌘K) - visible on landing for full admins, always on other pages */}
          {(!isLanding || isFullAdmin) && <GlobalSearch />}
          {/* Master SO — visible on landing for full admins; hidden for Engineering/Sales dept-only roles */}
          {(!isLanding || isFullAdmin) && !isEngineering && !isSales && (
          <NavLink
            to="/so-master"
            data-testid="nav-so-master-top"
            className={({ isActive }) => `flex items-center gap-1.5 px-3 h-9 text-[11px] uppercase tracking-[0.1em] font-semibold border transition-colors ${
              isActive ? "border-sky-600 text-sky-700 bg-sky-50" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ClipboardText size={14} weight="duotone" /> Master SO
          </NavLink>
          )}
          {(!isLanding || isFullAdmin) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  data-testid="nav-notifications-btn"
                  className={`relative flex items-center gap-1.5 px-3 h-9 text-[11px] uppercase tracking-[0.1em] font-bold border transition-colors ${
                    pendingCount > 0
                      ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Bell size={14} weight={pendingCount > 0 ? "fill" : "duotone"} className={pendingCount > 0 ? "animate-pulse" : ""} />
                  Notifikasi
                  <span data-testid="nav-notif-count" className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold tabular-nums ${pendingCount > 0 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                </button>

                {notifOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                    {/* Dropdown */}
                    <div className="absolute right-0 top-full mt-1 w-[420px] max-h-[80vh] overflow-y-auto bg-white border border-slate-300 shadow-lg z-40" data-testid="notif-dropdown">
                      <div className="sticky top-0 bg-slate-900 text-white p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold flex items-center gap-2">
                            <Bell size={14} weight="fill" /> Notifikasi ({pendingCount})
                          </div>
                          <div className="text-[10px] text-slate-300 uppercase tracking-[0.1em]">Aktivitas yang butuh tindakan Anda</div>
                        </div>
                        <button onClick={() => setNotifOpen(false)} className="text-slate-300 hover:text-white text-lg">✕</button>
                      </div>
                      {(notifData.categories || []).length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">
                          🎉 Tidak ada notifikasi yang membutuhkan tindakan.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {(notifData.categories || []).map((cat) => (
                            <div key={cat.key}>
                              <div className={`px-3 py-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-bold border-l-4 ${
                                cat.severity === "critical" ? "bg-red-50 text-red-800 border-red-500" :
                                cat.severity === "warn" ? "bg-amber-50 text-amber-800 border-amber-500" :
                                "bg-slate-50 text-slate-700 border-slate-400"
                              }`}>
                                <span className="flex-1">{cat.label}</span>
                                <span className={`px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                  cat.severity === "critical" ? "bg-red-600 text-white" :
                                  cat.severity === "warn" ? "bg-amber-600 text-white" :
                                  "bg-slate-500 text-white"
                                }`}>{cat.count}</span>
                              </div>
                              {cat.items.slice(0, 5).map((it) => (
                                <div key={it.id} className="border-t border-slate-100 flex items-stretch" data-testid={`notif-row-${cat.key}`}>
                                  <button
                                    onClick={() => { setNotifOpen(false); nav(it.link || (cat.key === "store_requests" ? "/admin?tab=requests" : "/")); }}
                                    className="flex-1 text-left px-3 py-2 hover:bg-sky-50 text-xs"
                                    data-testid={`notif-item-${cat.key}`}
                                  >
                                    <div className="font-semibold text-slate-900">{it.title}</div>
                                    {it.detail && <div className="text-slate-600 text-[11px] mt-0.5">{it.detail}</div>}
                                    {it.sub && <div className="text-slate-400 text-[10px] mt-0.5">{it.sub}</div>}
                                  </button>
                                  {cat.key === "bom_new_unpurchased" && it.bom_id && (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!window.confirm(`Tandai BOM SO ${it.so_no} tidak perlu notif pembelian lagi?`)) return;
                                        try {
                                          await api.post(`/bom/${it.bom_id}/dismiss-purchase-notif`);
                                          toast.success("Notifikasi ditandai selesai");
                                          loadNotif();
                                        } catch { toast.error("Gagal"); }
                                      }}
                                      title="Abaikan notif ini (tandai sudah selesai / tidak perlu pembelian)"
                                      className="px-2 text-[10px] text-emerald-700 hover:bg-emerald-50 border-l border-slate-100"
                                      data-testid={`notif-dismiss-${it.bom_id}`}
                                    >
                                      ✓ Selesai
                                    </button>
                                  )}
                                </div>
                              ))}
                              {cat.items.length > 5 && (
                                <div className="px-3 py-1 text-[10px] text-slate-400 border-t border-slate-100">
                                  +{cat.items.length - 5} lainnya
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {canApprove && (
                        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-2">
                          <button
                            onClick={() => { setNotifOpen(false); nav("/admin?tab=requests"); }}
                            className="w-full text-center text-[10px] uppercase tracking-[0.1em] font-bold text-slate-700 hover:text-slate-900 py-1"
                          >
                            🔎 Buka Semua Permohonan di Admin Panel →
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="hidden sm:block text-right">
              <div className="text-xs font-medium text-slate-900" data-testid="current-user">
                {user?.name || user?.username}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{user?.role}</div>
            </div>
            <FastModeToggle />
            <NavLink
              to="/profile/signature"
              data-testid="nav-my-signature"
              className={({ isActive }) => `flex items-center gap-1 px-2 h-8 text-[10px] uppercase tracking-[0.1em] font-bold border transition-colors ${
                isActive ? "border-emerald-600 text-emerald-700 bg-emerald-50" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
              title="Kelola Tanda Tangan Digital Saya"
            >
              🖋 TTD
            </NavLink>
            <Button
              data-testid="logout-btn"
              onClick={onLogout}
              variant="ghost"
              size="sm"
              className="rounded-none h-8 text-xs uppercase tracking-[0.1em]"
            >
              <SignOut size={14} weight="bold" className="mr-1.5" />
              Keluar
            </Button>
          </div>
        </div>
      </header>
      )}

      <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto">{children}</main>

      {!isEmbed && (
      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-400 uppercase tracking-[0.15em]">
        Developed by Purchasing Department &copy; {new Date().getFullYear()} — PT. Mitra Karya Sarana
      </footer>
      )}
    </div>
  );
}
