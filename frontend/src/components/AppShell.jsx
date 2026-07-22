import React from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  ChartBar, Plus, MagnifyingGlass, SignOut, Package, ChartLineUp, ShieldStar, Warehouse, ArrowDown, ArrowUp,
  ClipboardText, CaretDown, ShoppingCart, Storefront, Factory, Truck,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const PURCHASE_ITEMS = [
  { to: "/", label: "Dashboard", icon: ChartBar, testid: "nav-dashboard" },
  { to: "/input", label: "Input Transaksi", icon: Plus, testid: "nav-input" },
  { to: "/master", label: "Master List", icon: MagnifyingGlass, testid: "nav-master" },
  { to: "/items", label: "Master Barang", icon: Package, testid: "nav-items" },
  { to: "/kpi", label: "KPI Purchasing", icon: ChartLineUp, testid: "nav-kpi" },
];

const STORE_ITEMS = [
  { to: "/store/stock", label: "Stok", icon: Warehouse, testid: "nav-store-stock" },
  { to: "/store/receive", label: "Terima (dari PO)", icon: ArrowDown, testid: "nav-store-receive" },
  { to: "/store/manual-receive", label: "Manual Receiving", icon: ArrowDown, testid: "nav-store-manual" },
  { to: "/store/issue", label: "Keluar Barang", icon: ArrowUp, testid: "nav-store-issue" },
  { to: "/store/production-issue", label: "Ke Produksi (Cust.)", icon: Factory, testid: "nav-store-prod" },
  { to: "/deliveries", label: "Pengiriman", icon: Truck, testid: "nav-deliveries" },
];

const STORE_REPORT_ITEM = { to: "/store/report", label: "Laporan Store", icon: ClipboardText, testid: "nav-store-report" };
const SO_MASTER_ITEM = { to: "/so-master", label: "Master SO", icon: ClipboardText, testid: "nav-so-master" };

function NavDropdown({ label, icon: Icon, items, currentPath, testid }) {
  const active = items.some((it) => currentPath === it.to || (it.to !== "/" && currentPath.startsWith(it.to)));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={testid}
          className={`flex items-center gap-1.5 px-3 h-9 text-xs uppercase tracking-[0.1em] font-semibold border-b-2 transition-colors ${
            active ? "border-sky-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Icon size={16} weight="duotone" />
          {label}
          <CaretDown size={10} weight="bold" className="ml-0.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="rounded-none border-slate-300 min-w-[200px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((it) => (
          <DropdownMenuItem key={it.to} asChild data-testid={it.testid}>
            <NavLink to={it.to} end={it.to === "/"} className="flex items-center gap-2 text-sm cursor-pointer">
              <it.icon size={15} weight="duotone" className="text-slate-500" />
              {it.label}
            </NavLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLinkItem({ to, label, icon: Icon, testid }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      data-testid={testid}
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-3 h-9 text-xs uppercase tracking-[0.1em] font-semibold border-b-2 transition-colors ${
          isActive ? "border-sky-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
        }`
      }
    >
      <Icon size={16} weight="duotone" />
      {label}
    </NavLink>
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
  // Store role: NEVER see Laporan Store, even if perm granted
  const canViewStoreReport = role === "admin" || (role !== "store" && perms.includes("view_store_report"));

  // Build simplified nav
  const renderNav = () => {
    if (!user) return null;
    if (role === "store") {
      // Store user: store menu items (no laporan)
      const items = [...STORE_ITEMS];
      return items.map((n) => <NavLinkItem key={n.to} {...n} />);
    }
    if (role === "finance") {
      // Finance: read-only across reports
      return (
        <>
          <NavLinkItem to="/" label="Dashboard" icon={ChartBar} testid="nav-dashboard" />
          <NavDropdown
            label="Purchasing"
            icon={ShoppingCart}
            testid="nav-menu-purchasing"
            items={PURCHASE_ITEMS.filter((x) => x.to !== "/" && x.to !== "/input")}
            currentPath={location.pathname}
          />
          <NavLinkItem {...STORE_REPORT_ITEM} />
          <NavLinkItem {...SO_MASTER_ITEM} />
        </>
      );
    }
    // admin & staff: use dropdown groups
    const showStore = role === "admin";
    const storeItems = [...STORE_ITEMS];
    if (canViewStoreReport) storeItems.push(STORE_REPORT_ITEM);

    return (
      <>
        <NavLinkItem to="/" label="Dashboard" icon={ChartBar} testid="nav-dashboard" />
        <NavDropdown
          label="Purchasing"
          icon={ShoppingCart}
          testid="nav-menu-purchasing"
          items={PURCHASE_ITEMS.filter((x) => x.to !== "/")}
          currentPath={location.pathname}
        />
        {showStore && (
          <NavDropdown
            label="Store"
            icon={Storefront}
            testid="nav-menu-store"
            items={storeItems}
            currentPath={location.pathname}
          />
        )}
        {!showStore && canViewStoreReport && <NavLinkItem {...STORE_REPORT_ITEM} />}
        <NavLinkItem {...SO_MASTER_ITEM} />
        {role === "admin" && <NavLinkItem to="/admin" label="Admin" icon={ShieldStar} testid="nav-admin" />}
      </>
    );
  };

  const allNavItemsFlat = React.useMemo(() => {
    if (!user) return [];
    if (role === "store") {
      return [...STORE_ITEMS, SO_MASTER_ITEM];
    }
    if (role === "finance") {
      return [{ to: "/", label: "Dashboard", icon: ChartBar, testid: "nav-dashboard" }, ...PURCHASE_ITEMS.filter((x) => x.to !== "/" && x.to !== "/input"), STORE_REPORT_ITEM, SO_MASTER_ITEM];
    }
    const arr = [...PURCHASE_ITEMS];
    if (role === "admin") arr.push(...STORE_ITEMS, STORE_REPORT_ITEM, SO_MASTER_ITEM, { to: "/admin", label: "Admin", icon: ShieldStar, testid: "nav-admin" });
    else { arr.push(SO_MASTER_ITEM); if (canViewStoreReport) arr.push(STORE_REPORT_ITEM); }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 flex flex-col">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/assets/logo-mks.png" alt="MKS" className="w-8 h-8 object-contain" />
            <div className="font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
              Purchasing Department
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">{renderNav()}</nav>

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
              className="rounded-none h-9 text-xs uppercase tracking-[0.1em]"
            >
              <SignOut size={16} weight="bold" className="mr-1.5" />
              Keluar
            </Button>
          </div>
        </div>

        {/* Mobile: full flat scroll list */}
        <div className="md:hidden border-t border-slate-200 px-2 flex overflow-x-auto">
          {allNavItemsFlat.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 h-10 text-xs whitespace-nowrap border-b-2 ${
                  isActive ? "border-sky-600 text-slate-900 font-semibold" : "border-transparent text-slate-500"
                }`
              }
            >
              <n.icon size={16} weight="duotone" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </header>

      <main className="flex-1 px-6 py-6 max-w-[1600px] w-full mx-auto">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-400 uppercase tracking-[0.15em]">
        Purchasing Department &copy; {new Date().getFullYear()} — PT. Mitra Karya Sarana
      </footer>
    </div>
  );
}
