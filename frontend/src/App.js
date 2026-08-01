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
import StoragePage from "./pages/StoragePage";
import StoreReceivePage from "./pages/StoreReceivePage";
import StoreIssuePage from "./pages/StoreIssuePage";
import StoreStockPage from "./pages/StoreStockPage";
import StockHistoryPrintPage from "./pages/StockHistoryPrintPage";
import StoreReportPage from "./pages/StoreReportPage";
import StoreManualReceivePage from "./pages/StoreManualReceivePage";
import IncomingReportPage from "./pages/IncomingReportPage";
import DeliveryPage from "./pages/DeliveryPage";
import SOTimelinePage from "./pages/SOTimelinePage";
import ConsumableRequestPage from "./pages/ConsumableRequestPage";
import BulkTransaksiPage from "./pages/BulkTransaksiPage";
import SOMasterPage from "./pages/SOMasterPage";
import BOMPage from "./pages/BOMPage";
import FormTemplatesPage from "./pages/FormTemplatesPage";
import LegacyImportPage from "./pages/LegacyImportPage";
import FormTemplateEditorPage from "./pages/FormTemplateEditorPage";
import LandingPage from "./pages/LandingPage";
import SalesPage from "./pages/SalesPage";
import PurchasingPortalPage from "./pages/PurchasingPortalPage";
import StorePortalPage from "./pages/StorePortalPage";
import SalesPortalPage from "./pages/SalesPortalPage";
import EngineeringPortalPage from "./pages/EngineeringPortalPage";
import QuotationPage from "./pages/QuotationPage";
import CustomerMasterPage from "./pages/CustomerMasterPage";
import QCPage from "./pages/QCPage";
import QCPortalPage from "./pages/QCPortalPage";
import MaterialCostingPage from "./pages/MaterialCostingPage";
import MasterDrawingPage from "./pages/MasterDrawingPage";import EngineeringMasterListPage from "./pages/EngineeringMasterListPage";
import BomEntryGridPage from "./pages/BomEntryGridPage";
import DocumentDistributionRecordPage from "./pages/DocumentDistributionRecordPage";
import ControlledDrawingDatabasePage from "./pages/ControlledDrawingDatabasePage";
import MyProfilePage from "./pages/MyProfilePage";
import EngineeringWorkOrderPage from "./pages/EngineeringWorkOrderPage";
import MySignatureHistoryPage from "./pages/MySignatureHistoryPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import { useIdleLogout } from "./lib/useIdleLogout";
import PendingApprovalDrawingsPage from "./pages/PendingApprovalDrawingsPage";
import DrawingRequestFormPage from "./pages/DrawingRequestFormPage";
import DrawingRequestInboxPage from "./pages/DrawingRequestInboxPage";
import MyAssignmentsPage from "./pages/MyAssignmentsPage";
import EngineeringDrfWorkPage from "./pages/EngineeringDrfWorkPage";
import MyDrfWorkListPage from "./pages/MyDrfWorkListPage";
import ECNPage from "./pages/ECNPage";
import WorkOrderEngineeringPage from "./pages/WorkOrderEngineeringPage";
import SOStampPage from "./pages/SOStampPage";
import DocumentControlPortalPage from "./pages/DocumentControlPortalPage";
import "./App.css";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Memuat...</div>
    </div>
  );
}

function ProtectedRoute({ children, storeRoleTo = "/store/stock", blockStore = false }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  // Iter 22 — Auto-logout idle 30 menit (hanya jalan kalau user login)
  useIdleLogout({
    timeoutMinutes: 30,
    warnMinutes: 5,
    onLogout: user ? logout : undefined,
  });

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Iter 22 — Force change password kalau user login pakai default password
  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Landing page (`/`) is accessible to EVERY authenticated role.
  // Deep-link protection remains per role below.
  if (location.pathname === "/") {
    return <AppShell>{children}</AppShell>;
  }

  // Engineering (all sub-roles): /bom AND /sales AND /engineering accessible outside `/`
  const ENG_ROLES = ["engineering", "eng_leader", "eng_head", "eng_staff"];
  // Universal exceptions — halaman yang boleh diakses semua role:
  //  /profile/signature — kelola TTD digital
  //  /drawings/pending-my-approval — list drawing menunggu TTD saya
  //  /drawings/controlled — Controlled Drawing Database (semua user boleh view)
  //  /document-control/distribution — halaman Salma (DC only, gate di dalam page)
  const isUniversalPage =
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/my/") ||
    location.pathname.startsWith("/change-password") ||
    location.pathname.startsWith("/drawings/pending-my-approval") ||
    location.pathname.startsWith("/drawings/controlled") ||
    location.pathname.startsWith("/document-control");

  if (ENG_ROLES.includes(user.role)) {
    if (!isUniversalPage && !location.pathname.startsWith("/bom") && !location.pathname.startsWith("/sales") && !location.pathname.startsWith("/engineering")) {
      return <Navigate to="/engineering" replace />;
    }
    return <AppShell>{children}</AppShell>;
  }
  // Sales: ONLY /sales accessible outside `/` (+ universal pages)
  if (user.role === "sales") {
    if (!isUniversalPage && !location.pathname.startsWith("/sales")) {
      return <Navigate to="/sales" replace />;
    }
    return <AppShell>{children}</AppShell>;
  }
  // QC: ONLY /qc accessible outside `/` (+ universal pages)
  if (user.role === "qc") {
    if (!isUniversalPage && !location.pathname.startsWith("/qc")) {
      return <Navigate to="/qc" replace />;
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
    const blockedForFinance = ["/input", "/purchasing/bulk", "/admin", "/store/receive", "/store/manual-receive", "/store/issue", "/store/production-issue"];
    if (blockedForFinance.some((p) => location.pathname.startsWith(p))) {
      return <Navigate to="/" replace />;
    }
  }
  // Supervisor: hide admin panel (redirect /admin to /)
  if (user.role === "supervisor" && location.pathname.startsWith("/admin")) {
    return <Navigate to="/" replace />;
  }
  // Purchasing role: block /admin
  if (user.role === "purchasing" && location.pathname.startsWith("/admin")) {
    return <Navigate to="/" replace />;
  }
  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/purchasing" element={<ProtectedRoute><PurchasingPortalPage /></ProtectedRoute>} />
      <Route path="/store" element={<ProtectedRoute><StorePortalPage /></ProtectedRoute>} />
      <Route path="/engineering" element={<ProtectedRoute><EngineeringPortalPage /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><SalesPortalPage /></ProtectedRoute>} />
      <Route path="/sales/inquiries" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
      <Route path="/engineering/inquiries" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
      <Route path="/sales/quotations" element={<ProtectedRoute><QuotationPage /></ProtectedRoute>} />
      <Route path="/sales/customers" element={<ProtectedRoute><CustomerMasterPage /></ProtectedRoute>} />
      <Route path="/input" element={<ProtectedRoute><InputTransactionPage /></ProtectedRoute>} />
      <Route path="/purchasing/bulk" element={<ProtectedRoute><BulkTransaksiPage /></ProtectedRoute>} />
      <Route path="/master" element={<ProtectedRoute><MasterListPage /></ProtectedRoute>} />
      <Route path="/items" element={<ProtectedRoute><MasterItemsPage /></ProtectedRoute>} />
      <Route path="/kpi" element={<ProtectedRoute><KPIReportPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      <Route path="/admin/storage" element={<ProtectedRoute><StoragePage /></ProtectedRoute>} />
      <Route path="/admin/legacy-import" element={<ProtectedRoute><LegacyImportPage /></ProtectedRoute>} />
      <Route path="/store/receive" element={<ProtectedRoute><StoreReceivePage /></ProtectedRoute>} />
      <Route path="/store/issue" element={<ProtectedRoute><StoreIssuePage /></ProtectedRoute>} />
      <Route path="/store/stock" element={<ProtectedRoute><StoreStockPage /></ProtectedRoute>} />
      <Route path="/store/stock/history/print" element={<ProtectedRoute><StockHistoryPrintPage /></ProtectedRoute>} />
      <Route path="/store/report" element={<ProtectedRoute blockStore={true}><StoreReportPage /></ProtectedRoute>} />
      <Route path="/store/manual-receive" element={<ProtectedRoute><StoreManualReceivePage /></ProtectedRoute>} />
      <Route path="/store/incoming-report" element={<ProtectedRoute><IncomingReportPage /></ProtectedRoute>} />
      <Route path="/deliveries" element={<ProtectedRoute><DeliveryPage /></ProtectedRoute>} />
      <Route path="/timeline/:so_no" element={<ProtectedRoute><SOTimelinePage /></ProtectedRoute>} />
      <Route path="/store/consumable-requests" element={<ProtectedRoute><ConsumableRequestPage /></ProtectedRoute>} />
      <Route path="/so-master" element={<ProtectedRoute><SOMasterPage /></ProtectedRoute>} />
      <Route path="/bom" element={<ProtectedRoute><BOMPage /></ProtectedRoute>} />
      <Route path="/admin/form-templates" element={<ProtectedRoute><FormTemplatesPage /></ProtectedRoute>} />
      <Route path="/admin/form-templates/:id" element={<ProtectedRoute><FormTemplateEditorPage /></ProtectedRoute>} />
      <Route path="/qc" element={<ProtectedRoute><QCPortalPage /></ProtectedRoute>} />
      <Route path="/qc/mii" element={<ProtectedRoute><QCPage /></ProtectedRoute>} />
      <Route path="/qc/inspections/:id" element={<ProtectedRoute><QCPage /></ProtectedRoute>} />
      <Route path="/engineering/material-costing" element={<ProtectedRoute><MaterialCostingPage /></ProtectedRoute>} />
      <Route path="/engineering/drawings" element={<ProtectedRoute><MasterDrawingPage /></ProtectedRoute>} />
      <Route path="/document-control" element={<ProtectedRoute><DocumentControlPortalPage /></ProtectedRoute>} />
      <Route path="/document-control/distribution" element={<ProtectedRoute><DocumentDistributionRecordPage /></ProtectedRoute>} />
      <Route path="/document-control/so-stamp" element={<ProtectedRoute><SOStampPage /></ProtectedRoute>} />
      <Route path="/drawings/controlled" element={<ProtectedRoute><ControlledDrawingDatabasePage /></ProtectedRoute>} />
      <Route path="/profile/signature" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
      <Route path="/drawings/pending-my-approval" element={<ProtectedRoute><PendingApprovalDrawingsPage /></ProtectedRoute>} />
      <Route path="/sales/drawing-requests" element={<ProtectedRoute><DrawingRequestFormPage /></ProtectedRoute>} />
      <Route path="/engineering/drawing-request-inbox" element={<ProtectedRoute><DrawingRequestInboxPage /></ProtectedRoute>} />
      <Route path="/engineering/my-assignments" element={<ProtectedRoute><MyAssignmentsPage /></ProtectedRoute>} />
      <Route path="/engineering/my-drf" element={<ProtectedRoute><MyDrfWorkListPage /></ProtectedRoute>} />
      <Route path="/engineering/drf/:drfId" element={<ProtectedRoute><EngineeringDrfWorkPage /></ProtectedRoute>} />
      <Route path="/engineering/ecn" element={<ProtectedRoute><ECNPage /></ProtectedRoute>} />
      <Route path="/engineering/work-orders" element={<ProtectedRoute><WorkOrderEngineeringPage /></ProtectedRoute>} />
      <Route path="/engineering/work-order/:drawingId" element={<ProtectedRoute><EngineeringWorkOrderPage /></ProtectedRoute>} />
      <Route path="/my/signature-history" element={<ProtectedRoute><MySignatureHistoryPage /></ProtectedRoute>} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
      <Route path="/engineering/master-list" element={<ProtectedRoute><EngineeringMasterListPage /></ProtectedRoute>} />
      <Route path="/engineering/bom-entry/:bomId" element={<ProtectedRoute><BomEntryGridPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="bottom-right" richColors closeButton duration={3500} />
      </BrowserRouter>
    </AuthProvider>
  );
}
