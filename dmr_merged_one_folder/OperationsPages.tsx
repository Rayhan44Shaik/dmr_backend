// src/modules/operations/pages/OperationsPages.tsx

import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import OperationsDashboardPage from "../dashboard/pages/OperationsDashboardPage";
import TripEntryPage from "../vehicle-trips/pages/TripEntryPage";
import TripListPage from "../vehicle-trips/pages/TripListPage";
import ShopSalesPage from "../shop-sales/pages/ShopSalesPage";
import RatesEntryPage from "../shop-sales/pages/RatesEntryPage";
import CollectionEntryPage from "../collections/pages/CollectionEntryPage";
import PendingCollectionsPage from "../collections/pages/PendingCollectionsPage";
import CollectionReportPage from "../collections/pages/CollectionReportPage";
import FuelExpensesPage from "../fuel-expenses/pages/FuelExpensesPage";
import MortalityEntryPage from "../mortality/pages/MortalityEntryPage";

// Map tab keys (resolved from ?tab= sidebar deep-links / path aliases)
// to their child page components.
const tabComponents: Record<string, React.ComponentType<{ embedded?: boolean }>> = {
  overview: OperationsDashboardPage,
  "trip-entry": TripEntryPage,
  "trip-list": TripListPage,
  "rate-entry": RatesEntryPage,
  "shop-sales": ShopSalesPage,
  collection: CollectionEntryPage,
  "pending-collections": PendingCollectionsPage,
  "collection-report": CollectionReportPage,
  mortality: MortalityEntryPage,
  "fuel-expenses": FuelExpensesPage,
};

function OperationsPages() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  // Read active tab from ?tab= query string
  const activeTab = useMemo(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) return tabParam;

    const pathname = location.pathname;
    if (pathname.includes("trip-entry")) return "trip-entry";
    if (pathname.includes("trip-list")) return "trip-list";
    if (pathname.includes("rate-entry")) return "rate-entry";
    if (pathname.includes("shop-sales")) return "shop-sales";
    if (pathname.includes("collections/entry")) return "collection";
    if (pathname.includes("collections/pending")) return "pending-collections";
    if (pathname.includes("collections/report")) return "collection-report";
    if (pathname.includes("mortality")) return "mortality";
    if (pathname.includes("fuel-expenses")) return "fuel-expenses";

    return "overview"; // Default tab
  }, [location.pathname, searchParams]);

  // Redirect to ?tab=overview when visiting /operations without parameters
  useEffect(() => {
    if (location.pathname === "/operations" && !searchParams.get("tab")) {
      navigate("/operations?tab=overview", { replace: true });
    }
  }, [location.pathname, searchParams, navigate]);

  const ActiveComponent = useMemo(() => {
    return tabComponents[activeTab] ?? OperationsDashboardPage;
  }, [activeTab]);

  return (
    <div className="w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <ActiveComponent embedded={true} />
      </div>
    </div>
  );
}

export default React.memo(OperationsPages);
