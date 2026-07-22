import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { Button } from "./ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import {
  ChartBar, Plus, MagnifyingGlass, SignOut, Package, ChartLineUp, ShieldStar, Warehouse, ArrowDown, ArrowUp,
  ClipboardText, CaretDown, ShoppingCart, Storefront, Truck, ClockCounterClockwise, Bell,
} from "@phosphor-icons/react";

// ─── PURCHASING ─────────────────────────────────────────
const PURCHASE_ITEMS = [
  { to: "/", label: "Dashboard", icon: ChartBar, testid: "nav-dashboard" },
  { to: "/input", label: "Input Transaksi", icon: Plus, testid: "nav-input" },
  { to: "/master", label: "Master List", icon: MagnifyingGlass, testid: "nav-master" },
  { to: "/items", label: "Master Barang", icon: Package, testid: "nav-items" },
  { to: "/kpi", label: "KPI Purchasing", icon: ChartLineUp, testid: "nav-kpi" },
  { to: "/so-master", label: "Master SO", icon: ClipboardText, testid: "nav-so-master" },
];

// ─── STORE — grouped Incoming vs Outgoing ───────────────
const STORE_STOCK = { to: "/store/stock", label: "Stok", icon: Warehouse, testid: "nav-store-stock" };

const STORE_INCOMING = [
  { to: "/store/receive", label: "Terima dari PO Purchasing", icon: ArrowDown, testid: "nav-store-receive" },
  { to: "/store/manual-receive", label: "Input Incoming Goods", icon: ArrowDown, testid: "nav-store-manual" },
  { to: "/store/incoming-report", label: "Laporan Incoming Goods", icon: ClipboardText, testid: "nav-store-incoming-report" },
];

const STORE_OUTGOING = [
  { to: "/store/issue", label: "Keluar Barang", icon: ArrowUp, testid: "nav-store-issue" },
  { to: "/deliveries", label: "Pengiriman", icon: Truck, testid: "nav-deliveries" },
];

const STORE_REPORT = { to: "/store/report", label: "Costing Store", icon: ClipboardText, testid: "nav-store-report" };

// ─── ADMIN ──────────────────────────────────────────────
const ADMIN_ITEMS = [
  { to: "/admin", label: "Kelola User", icon: ShieldStar, testid: "nav-admin" },
  { to: "/admin?tab=logs", label: "Log Aktivitas", icon: ClockCounterClockwise, testid: "nav-logs" },
];

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
  const canViewStoreReport = role === "admin" || (role !== "store" && perms.includes("view_store_report"));
  const canApprove = role === "admin" && perms.includes("approve_store_requests");

  // Poll pending Persetujuan Store count (admin only)
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!canApprove) { setPendingCount(0); return; }
    let cancelled = false;
    const tick = () => {
      api.get("/store/requests/pending-count")
        .then((r) => { if (!cancelled) setPendingCount(r.data?.count || 0); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [canApprove]);

  // Filter dept visibility per role
  const showPurchasing = role === "admin" || role === "staff" || role === "finance";
  const showStore = role === "admin" || role === "store" || role === "finance";
  const showAdmin = role === "admin";

  // Purchasing items per role
  const purchasingItems = () => {
    if (role === "finance") {
      // finance sees dashboard + reports, not "Input Transaksi"
      return PURCHASE_ITEMS.filter((x) => x.to !== "/input");
    }
    return PURCHASE_ITEMS;
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 flex flex-col">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: brand + main nav dropdowns */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <img src="/assets/logo-mks.png" alt="MKS" className="w-8 h-8 object-contain" />
              <div>
                <div className="font-bold text-sm tracking-tight text-slate-900 leading-tight" style={{ fontFamily: "Chivo, sans-serif" }}>
                  Purchasing Department
                </div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 leading-tight">
                  PT. Mitra Karya Sarana
                </div>
              </div>
            </div>

            <nav className="flex items-center gap-1">
              {showPurchasing && (
                <DeptDropdown
                  label="Purchasing"
                  icon={ShoppingCart}
                  testid="dept-purchasing"
                  items={purchasingItems()}
                  activePath={location.pathname}
                />
              )}
              {showStore && (
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
              {showAdmin && (
                <DeptDropdown
                  label="Admin"
                  icon={ShieldStar}
                  testid="dept-admin"
                  items={ADMIN_ITEMS}
                  activePath={location.pathname}
                />
              )}
            </nav>
          </div>

          {/* Right: approvals notif + user + logout */}
          <div className="flex items-center gap-2">
            {canApprove && (
              <NavLink
                to="/admin?tab=requests"
                data-testid="nav-approvals-top"
                className={`relative flex items-center gap-1.5 px-3 h-9 text-[11px] uppercase tracking-[0.1em] font-bold border transition-colors ${
                  pendingCount > 0
                    ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100 animate-pulse"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Bell size={14} weight={pendingCount > 0 ? "fill" : "duotone"} />
                Persetujuan Store
                <span data-testid="nav-approvals-top-badge" className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold tabular-nums ${pendingCount > 0 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              </NavLink>
            )}
            <div className="hidden sm:block text-right">
              <div className="text-xs font-medium text-slate-900" data-testid="current-user">
                {user?.name || user?.username}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{user?.role}</div>
            </div>
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

      <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-400 uppercase tracking-[0.15em]">
        Purchasing Department &copy; {new Date().getFullYear()} — PT. Mitra Karya Sarana
      </footer>
    </div>
  );
}
