import React from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  ChartBar, Plus, MagnifyingGlass, SignOut, Package, ChartLineUp, ShieldStar, Warehouse, ArrowDown, ArrowUp,
  ClipboardText, ShoppingCart, Storefront, Truck, CheckSquare, ClockCounterClockwise,
} from "@phosphor-icons/react";

const PURCHASE_ITEMS = [
  { to: "/", label: "Dashboard", icon: ChartBar, testid: "nav-dashboard" },
  { to: "/input", label: "Input Transaksi", icon: Plus, testid: "nav-input" },
  { to: "/master", label: "Master List", icon: MagnifyingGlass, testid: "nav-master" },
  { to: "/items", label: "Master Barang", icon: Package, testid: "nav-items" },
  { to: "/kpi", label: "KPI Purchasing", icon: ChartLineUp, testid: "nav-kpi" },
];

const STORE_ITEMS = [
  { to: "/store/stock", label: "Stok", icon: Warehouse, testid: "nav-store-stock" },
  { to: "/store/receive", label: "Terima dari PO", icon: ArrowDown, testid: "nav-store-receive" },
  { to: "/store/manual-receive", label: "Input Incoming Goods", icon: ArrowDown, testid: "nav-store-manual" },
  { to: "/store/incoming-report", label: "Laporan Incoming Goods", icon: ClipboardText, testid: "nav-store-incoming-report" },
  { to: "/store/issue", label: "Keluar Barang", icon: ArrowUp, testid: "nav-store-issue" },
  { to: "/deliveries", label: "Pengiriman", icon: Truck, testid: "nav-deliveries" },
];

const STORE_REPORT_ITEM = { to: "/store/report", label: "Costing Store", icon: ClipboardText, testid: "nav-store-report" };
const SO_MASTER_ITEM = { to: "/so-master", label: "Master SO", icon: ClipboardText, testid: "nav-so-master" };

// Admin row 3 — approval + activity log
const ADMIN_ROW = [
  { to: "/admin?tab=requests", label: "Persetujuan Store", icon: CheckSquare, testid: "nav-approvals" },
  { to: "/admin?tab=logs", label: "Log Aktivitas", icon: ClockCounterClockwise, testid: "nav-logs" },
  { to: "/admin", label: "Kelola User", icon: ShieldStar, testid: "nav-admin" },
];

function NavPill({ to, label, icon: Icon, testid, active }) {
  const cls = `flex items-center gap-1.5 px-3 h-8 text-[11px] uppercase tracking-[0.1em] font-semibold border-b-2 transition-colors ${
    active ? "border-sky-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
  }`;
  return (
    <NavLink to={to} end={to === "/"} data-testid={testid} className={({ isActive }) => (isActive || active ? cls.replace("border-transparent text-slate-500 hover:text-slate-900", "border-sky-600 text-slate-900") : cls)}>
      <Icon size={14} weight="duotone" />
      {label}
    </NavLink>
  );
}

function isPathMatch(current, target) {
  const t = target.split("?")[0];
  if (t === "/") return current === "/";
  return current === t || current.startsWith(t + "/");
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

  // Build rows per role
  const rowsForRole = () => {
    if (!user) return [];
    if (role === "admin") {
      const storeItems = [...STORE_ITEMS];
      if (canViewStoreReport) storeItems.push(STORE_REPORT_ITEM);
      return [
        { key: "purchasing", label: "Purchasing", icon: ShoppingCart, items: [...PURCHASE_ITEMS, SO_MASTER_ITEM] },
        { key: "store", label: "Store", icon: Storefront, items: storeItems },
        { key: "admin", label: "Admin", icon: ShieldStar, items: ADMIN_ROW },
      ];
    }
    if (role === "store") {
      // Store: sees store items + SO Master (read-only). No dashboard/purchasing.
      return [{ key: "store", label: "Store", icon: Storefront, items: [...STORE_ITEMS, SO_MASTER_ITEM] }];
    }
    if (role === "finance") {
      // Finance: read-only across
      return [
        { key: "purchasing", label: "Purchasing", icon: ShoppingCart, items: [
          { to: "/", label: "Dashboard", icon: ChartBar, testid: "nav-dashboard" },
          ...PURCHASE_ITEMS.filter((x) => x.to !== "/" && x.to !== "/input"),
          SO_MASTER_ITEM,
        ] },
        { key: "store", label: "Store", icon: Storefront, items: [
          ...(canViewStoreReport ? [STORE_REPORT_ITEM] : []),
          { to: "/store/incoming-report", label: "Laporan Incoming Goods", icon: ClipboardText, testid: "nav-store-incoming-report" },
        ] },
      ];
    }
    // staff (default): purchasing + limited store view
    return [
      { key: "purchasing", label: "Purchasing", icon: ShoppingCart, items: [...PURCHASE_ITEMS, SO_MASTER_ITEM] },
    ];
  };

  const rows = rowsForRole();

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 flex flex-col">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        {/* Top bar: brand + user + logout */}
        <div className="px-6 h-12 flex items-center justify-between gap-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src="/assets/logo-mks.png" alt="MKS" className="w-8 h-8 object-contain" />
            <div className="font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
              Purchasing Department
            </div>
          </div>
          <div className="flex items-center gap-3">
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

        {/* Multi-row nav */}
        {rows.map((row) => (
          <div key={row.key} className="px-6 flex items-center gap-2 border-b border-slate-100 overflow-x-auto" data-testid={`nav-row-${row.key}`}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400 min-w-[100px]">
              <row.icon size={12} weight="bold" />
              {row.label}
            </div>
            <div className="flex items-center flex-wrap">
              {row.items.map((it) => (
                <NavPill
                  key={`${row.key}-${it.to}`}
                  {...it}
                  active={isPathMatch(location.pathname, it.to)}
                />
              ))}
            </div>
          </div>
        ))}
      </header>

      <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-400 uppercase tracking-[0.15em]">
        Purchasing Department &copy; {new Date().getFullYear()} — PT. Mitra Karya Sarana
      </footer>
    </div>
  );
}
