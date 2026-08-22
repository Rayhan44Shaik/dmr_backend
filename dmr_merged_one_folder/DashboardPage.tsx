// src/modules/dashboard/DashboardPage.tsx
// Executive dashboard — KPIs, business overview, operations snapshot,
// pending collections, fleet status and recent activity.

import { Link } from "react-router-dom";
import {
  CreditCard,
  DatabaseZap,
  PackageOpen,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useExecutiveDashboard } from "./hooks/useExecutiveDashboard";
import { useNotification } from "../../context/NotificationContext";
import { getCurrentUser } from "../settings/services";
import { formatDateLong, greetingForHour } from "../../utils/format";
import KpiCard from "./components/KpiCard";
import ChartCard from "./components/ChartCard";
import TodayTripsTable from "./components/TodayTripsTable";
import PendingCollectionsCard from "./components/PendingCollectionsCard";
import FleetStatusCard from "./components/FleetStatusCard";
import ActivityTimeline from "./components/ActivityTimeline";
import DashboardSkeleton from "./components/DashboardSkeleton";
import {
  DeliveryVolumeChart,
  SalesVsCollectionsChart,
  VehicleActivityDonut,
  WeeklyRevenueChart,
} from "./components/DashboardCharts";

function DashboardPage() {
  const { data, derived, loading, error, refetch, loadDemo, clearDemo, demoBusy } = useExecutiveDashboard();
  const { showNotification } = useNotification();

  const user = getCurrentUser();
  const firstName = (user.name || "Admin").split(" ")[0];
  const greeting = `${greetingForHour()}, ${firstName} 👋`;

  const handleLoadDemo = async () => {
    await loadDemo();
    showNotification("Sample data loaded — explore the dashboard. Remove it anytime.", "success");
  };

  const handleClearDemo = async () => {
    await clearDemo();
    showNotification("Sample data removed.", "info");
  };

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ---------------------------------------------------------- */}
      {/* Greeting                                                     */}
      {/* ---------------------------------------------------------- */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-fade-in-up">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px] dark:text-white">{greeting}</h1>
            {data?.demoActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
                <Sparkles size={11} />
                Sample data
                <button
                  type="button"
                  onClick={() => void handleClearDemo()}
                  className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
                  aria-label="Remove sample data"
                  title="Remove sample data"
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Here's what's happening across DMR Poultries today.
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-400 dark:text-slate-500">{formatDateLong(new Date())}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {derived && !derived.hasAnyData && !data?.demoActive && (
            <button
              type="button"
              onClick={() => void handleLoadDemo()}
              disabled={demoBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {demoBusy ? <RefreshCw size={15} className="animate-spin" /> : <DatabaseZap size={15} className="text-amber-500" />}
              {demoBusy ? "Loading…" : "Load sample data"}
            </button>
          )}
          {error && (
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RefreshCw size={15} />
              Retry
            </button>
          )}
          <Link
            to="/operations?tab=collection"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <CreditCard size={15} />
            Record collection
          </Link>
          <Link
            to="/operations?tab=trip-entry"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            <PackageOpen size={15} />
            New trip entry
          </Link>
        </div>
      </div>

      {loading && !derived ? (
        <DashboardSkeleton />
      ) : derived ? (
        <>
          {/* ------------------------------------------------------ */}
          {/* KPI cards                                               */}
          {/* ------------------------------------------------------ */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {derived.kpis.map((kpi, i) => (
              <KpiCard key={kpi.key} kpi={kpi} index={i} />
            ))}
          </div>

          {/* ------------------------------------------------------ */}
          {/* Business overview                                       */}
          {/* ------------------------------------------------------ */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard
              title="Sales vs Collections"
              subtitle="Last 7 days · shop deliveries against cash received"
              action={{ label: "Shop sales", path: "/operations?tab=shop-sales" }}
              className="xl:col-span-2"
            >
              <SalesVsCollectionsChart data={derived} />
            </ChartCard>
            <ChartCard title="Vehicle activity" subtitle="Fleet status right now" action={{ label: "Fleet", path: "/fleet?tab=analytics" }}>
              <VehicleActivityDonut data={derived} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard title="Weekly revenue" subtitle="Shop sales by day">
              <WeeklyRevenueChart data={derived} />
            </ChartCard>
            <ChartCard title="Delivery volume" subtitle="Birds and weight delivered per day">
              <DeliveryVolumeChart data={derived} />
            </ChartCard>
            <PendingCollectionsCard pending={derived.pendingCollections} totalAmount={derived.totals.pendingAmount} />
          </div>

          {/* ------------------------------------------------------ */}
          {/* Operations snapshot + recent activity                   */}
          {/* ------------------------------------------------------ */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TodayTripsTable trips={derived.todayTrips.length > 0 ? derived.todayTrips : derived.latestTrips} isFallback={derived.todayTrips.length === 0} />
            </div>
            <ActivityTimeline items={derived.activity} />
          </div>

          {/* ------------------------------------------------------ */}
          {/* Fleet overview                                          */}
          {/* ------------------------------------------------------ */}
          <FleetStatusCard fleet={derived.fleet} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-16 text-center dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Something went wrong loading the dashboard</p>
          <p className="text-xs text-slate-400">{error ?? "Please try again."}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
