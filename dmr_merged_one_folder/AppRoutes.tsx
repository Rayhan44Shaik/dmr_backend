import React from "react";
import { Routes, Route } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout/DashboardLayout";

// Auth
import LoginPage from "../modules/auth/LoginPage";

// Dashboard
import DashboardPage from "../modules/dashboard/DashboardPage";

// Masters Module
import MastersPage from "../modules/masters/pages/MastersPage";
import ShopsPage from "../modules/masters/shops/pages/ShopsPage";
import FarmsPage from "../modules/masters/farms/pages/FarmsPage";
import VehiclesPage from "../modules/masters/vehicles/pages/VehiclesPage";
import EmployeesPage from "../modules/masters/employees/pages/EmployeesPage";
import BanksPage from "../modules/masters/banks/pages/BanksPage";
import BirdTypesPage from "../modules/masters/bird-types/pages/BirdTypesPage";

// Operations Module
import OperationsPages from "../modules/operations/pages/OperationsPages";

// Accounts Module
import AccountsPage from "../modules/accounts/pages/AccountsPage";

// Fleet Module — lazy so Dashboard/Operations/etc. do not evaluate Fleet tab graphs.
const FleetPages = React.lazy(() => import("../modules/fleet-operations/pages/FleetPages"));

const fleetFallback = (
  <div className="w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading Fleet Operations">
    <div className="mx-auto w-full max-w-[1480px] space-y-4">
      <div className="h-14 animate-pulse rounded-2xl bg-white border border-slate-200" />
      <div className="h-64 animate-pulse rounded-2xl bg-white border border-slate-200" />
    </div>
  </div>
);

// Staff, Reports
import StaffPages from "../modules/staff/pages/StaffPages";
import ReportsDashboardPage from "../modules/reports/pages/ReportsDashboardPage";

// Settings Module (Standalone page without separate layout)
import SettingsPage from "../modules/settings/pages/SettingsPage";

const SupervisorMobilePage = React.lazy(
  () => import("../modules/supervisor-mobile/pages/SupervisorMobilePage")
);

const mobileFallback = (
  <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">
    Loading Supervisor Trip Entry…
  </div>
);

function AppRoutes() {
  return (
    <Routes>
      {/* Auth - No Layout */}
      <Route path="/" element={<LoginPage />} />

      {/* ============ SUPERVISOR MOBILE — Trip Entry Steps 1–5 only ============ */}
      <Route
        path="/mobile"
        element={<React.Suspense fallback={mobileFallback}><SupervisorMobilePage /></React.Suspense>}
      />
      <Route
        path="/mobile/trips"
        element={<React.Suspense fallback={mobileFallback}><SupervisorMobilePage /></React.Suspense>}
      />

      {/* ============ DASHBOARD ============ */}
      <Route path="/dashboard" element={<DashboardLayout><DashboardPage /></DashboardLayout>} />

      {/* ============ MASTERS ============ */}
      <Route path="/masters" element={<DashboardLayout><MastersPage /></DashboardLayout>} />
      <Route path="/masters/shops" element={<DashboardLayout><ShopsPage /></DashboardLayout>} />
      <Route path="/masters/farms" element={<DashboardLayout><FarmsPage /></DashboardLayout>} />
      <Route path="/masters/vehicles" element={<DashboardLayout><VehiclesPage /></DashboardLayout>} />
      <Route path="/masters/employees" element={<DashboardLayout><EmployeesPage /></DashboardLayout>} />
      <Route path="/masters/banks" element={<DashboardLayout><BanksPage /></DashboardLayout>} />
      <Route path="/masters/bird-types" element={<DashboardLayout><BirdTypesPage /></DashboardLayout>} />

      {/* ============ OPERATIONS ============ */}
      <Route path="/operations" element={<DashboardLayout><OperationsPages /></DashboardLayout>} />
      <Route path="/operations/*" element={<DashboardLayout><OperationsPages /></DashboardLayout>} />

      {/* ============ ACCOUNTS ============ */}
      <Route path="/accounts" element={<DashboardLayout><AccountsPage /></DashboardLayout>} />
      <Route path="/accounts/*" element={<DashboardLayout><AccountsPage /></DashboardLayout>} />

      {/* ============ FLEET ============ */}
      <Route path="/fleet" element={<DashboardLayout><React.Suspense fallback={fleetFallback}><FleetPages /></React.Suspense></DashboardLayout>} />
      <Route path="/fleet/*" element={<DashboardLayout><React.Suspense fallback={fleetFallback}><FleetPages /></React.Suspense></DashboardLayout>} />

      {/* ============ STAFF ============ */}
      <Route path="/staff" element={<DashboardLayout><StaffPages /></DashboardLayout>} />
      <Route path="/staff/*" element={<DashboardLayout><StaffPages /></DashboardLayout>} />

      {/* ============ REPORTS ============ */}
      <Route path="/reports" element={<DashboardLayout><ReportsDashboardPage /></DashboardLayout>} />
      <Route path="/reports/*" element={<DashboardLayout><ReportsDashboardPage /></DashboardLayout>} />

      {/* ===============================================
          🚀 SETTINGS - SINGLE PAGE ROUTE
          =============================================== */}
      <Route 
        path="/settings" 
        element={
          <DashboardLayout>
            <SettingsPage />
          </DashboardLayout>
        } 
      />
      <Route 
        path="/settings/*" 
        element={
          <DashboardLayout>
            <SettingsPage />
          </DashboardLayout>
        } 
      />

      {/* ============ 404 - Not Found ============ */}
      <Route
        path="*"
        element={
          <div className="flex h-screen items-center justify-center bg-slate-50">
            <div className="text-center">
              <h1 className="text-6xl font-bold tracking-tight text-slate-800">404</h1>
              <p className="mt-2 text-lg text-slate-600">Page not found</p>
              <a
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        }
      />
    </Routes>
  );
}

export default AppRoutes;