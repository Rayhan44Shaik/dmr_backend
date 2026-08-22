// src/modules/fleet-operations/pages/FleetPages.tsx

import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  DEFAULT_FLEET_TAB,
  isVisibleFleetTab,
  type VisibleFleetTab,
} from "../activeFleetScope";
import FleetTabSkeleton from "../components/common/FleetTabSkeleton";

/*
 * Tabs are lazy so opening /fleet?tab=entry does not evaluate Analytics (Recharts),
 * EMI, History, or Permits before the first paint.
 *
 * DEFERRED / FUTURE — not imported:
 *   dashboard  → ./FleetDashboardPage
 *   reports    → ./VehicleReportsPage
 *   expenses   → ./VehicleExpenseReportPage
 */

const tabComponents: Record<VisibleFleetTab, React.LazyExoticComponent<React.ComponentType<{ embedded?: boolean }>>> = {
  entry: lazy(() => import("./MaintenanceEntryPage")),
  history: lazy(() => import("./MaintenanceHistoryPage")),
  permits: lazy(() => import("./DocumentsExpiryPage")),
  emi: lazy(() => import("./EmiLoansPage")),
  analytics: lazy(() => import("./VehicleAnalyticsPage")),
  fastag: lazy(() => import("./FastagDashboardPage")),
};

function FleetPages() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedTab = searchParams.get("tab");
  const activeTab: VisibleFleetTab = isVisibleFleetTab(requestedTab)
    ? requestedTab
    : DEFAULT_FLEET_TAB;

  useEffect(() => {
    if (isVisibleFleetTab(requestedTab)) return;
    navigate(`/fleet?tab=${DEFAULT_FLEET_TAB}`, { replace: true });
  }, [requestedTab, navigate]);

  const [visitedTabs, setVisitedTabs] = useState<Set<VisibleFleetTab>>(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return (
    <div className="w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1480px]">
        {(Object.entries(tabComponents) as Array<
          [VisibleFleetTab, React.LazyExoticComponent<React.ComponentType<{ embedded?: boolean }>>]
        >).map(([tab, Component]) => {
          if (!visitedTabs.has(tab)) return null;
          const isActive = tab === activeTab;
          return (
            <div key={tab} hidden={!isActive} aria-hidden={!isActive}>
              <Suspense fallback={<FleetTabSkeleton />}>
                <Component embedded={true} />
              </Suspense>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(FleetPages);
