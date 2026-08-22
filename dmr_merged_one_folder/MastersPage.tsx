// src/modules/masters/pages/MastersPage.tsx

import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";

import ShopsPage from "../shops/pages/ShopsPage";
import FarmsPage from "../farms/pages/FarmsPage";
import VehiclesPage from "../vehicles/pages/VehiclesPage";
import EmployeesPage from "../employees/pages/EmployeesPage";
import BanksPage from "../banks/pages/BanksPage";
import BirdTypesPage from "../bird-types/pages/BirdTypesPage";

const tabComponents: Record<
  string,
  React.ComponentType<{ embedded?: boolean }>
> = {
  shops: ShopsPage,
  farms: FarmsPage,
  vehicles: VehiclesPage,
  employees: EmployeesPage,
  banks: BanksPage,
  birdTypes: BirdTypesPage,
};

function MastersPage() {
  const location = useLocation();

  const activeTab = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("tab") || "shops";
  }, [location.search]);

  const ActiveComponent = useMemo(() => {
    return tabComponents[activeTab] ?? ShopsPage;
  }, [activeTab]);

  return (
    <div className="w-full px-4 pb-8 pt-6 sm:px-5 lg:px-6">
      <div className="mx-auto w-full max-w-[1600px]">
        <ActiveComponent embedded />
      </div>
    </div>
  );
}

export default React.memo(MastersPage);