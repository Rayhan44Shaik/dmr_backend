// src/modules/staff/pages/StaffPages.tsx

import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import DutyPlannerPage from "./DutyPlannerPage";
import LeaveManagementPage from "./LeaveManagementPage";
import SalaryRegisterPage from "./SalaryRegisterPage";
import DriverPerformancePage from "./DriverPerformancePage";
import SupervisorPerformancePage from "./SupervisorPerformancePage";

// Map tab keys (resolved from ?tab= sidebar deep-links / path aliases)
// to their child page components.
const tabComponents: Record<string, React.ComponentType<{ embedded?: boolean }>> = {
  "duty-planner": DutyPlannerPage,
  "salary-sheet": SalaryRegisterPage,
  leaves: LeaveManagementPage,
  "driver-performance": DriverPerformancePage,
  "supervisor-performance": SupervisorPerformancePage,
};

function StaffPages() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  // Read active tab from ?tab= query string
  const activeTab = useMemo(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) return tabParam;

    const pathname = location.pathname;
    if (pathname.includes("duty-planner")) return "duty-planner";
    if (pathname.includes("employees")) return "employees";
    if (pathname.includes("salary-sheet")) return "salary-sheet";
    if (pathname.includes("leaves") || pathname.includes("leave")) return "leaves";

    return "duty-planner"; // Default tab
  }, [location.pathname, searchParams]);

  // Redirect to ?tab=duty-planner when visiting /staff without parameters
  useEffect(() => {
    if (location.pathname === "/staff" && !searchParams.get("tab")) {
      navigate("/staff?tab=duty-planner", { replace: true });
    }
  }, [location.pathname, searchParams, navigate]);

  const ActiveComponent = useMemo(() => {
    return tabComponents[activeTab] ?? DutyPlannerPage;
  }, [activeTab]);

  return (
    <div className="w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <ActiveComponent embedded={true} />
      </div>
    </div>
  );
}

export default React.memo(StaffPages);
