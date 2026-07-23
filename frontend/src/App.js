import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "./components/ui/sonner";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import InputTransactionPage from "./pages/InputTransactionPage";
import MasterListPage from "./pages/MasterListPage";
import MasterItemsPage from "./pages/MasterItemsPage";
import KPIReportPage from "./pages/KPIReportPage";
import AdminPage from "./pages/AdminPage";
import StoreReceivePage from "./pages/StoreReceivePage";
import StoreIssuePage from "./pages/StoreIssuePage";
import StoreStockPage from "./pages/StoreStockPage";
import StoreReportPage from "./pages/StoreReportPage";
import StoreManualReceivePage from "./pages/StoreManualReceivePage";
import IncomingReportPage from "./pages/IncomingReportPage";
import DeliveryPage from "./pages/DeliveryPage";
import SOMasterPage from "./pages/SOMasterPage";
import BOMPage from "./pages/BOMPage";
import "./App.css";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Memuat...</div>
    </div>
  );
}

function ProtectedRoute({ children, storeRoleTo = "/store/stock", blockStore = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  // Engineering: ONLY /bom accessible; redirect everywhere else to /bom
  if (user.role === "engineering") {
    if (!location.pathname.startsWith("/bom")) {
      return <Navigate to="/bom" replace />;
    }
    return <AppShell>{children}</AppShell>;
  }
  // Redirect store role away from Dashboard/Purchasing pages
  if (user.role === "store" && !location.pathname.startsWith("/store") && !location.pathname.startsWith("/deliveries") && !location.pathname.startsWith("/so-master") && !location.pathname.startsWith("/bom")) {
    return <Navigate to={storeRoleTo} replace />;
  }
  // Block store role from specific store pages (e.g., Laporan Store)
  if (user.role === "store" && blockStore) {
    return <Navigate to={storeRoleTo} replace />;
  }
  // Finance role can't access input/admin/store-write pages
  if (user.role === "finance") {
    const blockedForFinance = ["/input", "/admin", "/store/receive", "/store/manual-receive", "/store/issue", "/store/production-issue"];
    if (blockedForFinance.some((p) => location.pathname.startsWith(p))) {
      return <Navigate to="/" replace />;
    }
  }
  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/input" element={<ProtectedRoute><InputTransactionPage /></ProtectedRoute>} />
      <Route path="/master" element={<ProtectedRoute><MasterListPage /></ProtectedRoute>} />
      <Route path="/items" element={<ProtectedRoute><MasterItemsPage /></ProtectedRoute>} />
      <Route path="/kpi" element={<ProtectedRoute><KPIReportPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      <Route path="/store/receive" element={<ProtectedRoute><StoreReceivePage /></ProtectedRoute>} />
      <Route path="/store/issue" element={<ProtectedRoute><StoreIssuePage /></ProtectedRoute>} />
      <Route path="/store/stock" element={<ProtectedRoute><StoreStockPage /></ProtectedRoute>} />
      <Route path="/store/report" element={<ProtectedRoute blockStore={true}><StoreReportPage /></ProtectedRoute>} />
      <Route path="/store/manual-receive" element={<ProtectedRoute><StoreManualReceivePage /></ProtectedRoute>} />
      <Route path="/store/incoming-report" element={<ProtectedRoute><IncomingReportPage /></ProtectedRoute>} />
      <Route path="/deliveries" element={<ProtectedRoute><DeliveryPage /></ProtectedRoute>} />
      <Route path="/so-master" element={<ProtectedRoute><SOMasterPage /></ProtectedRoute>} />
      <Route path="/bom" element={<ProtectedRoute><BOMPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
