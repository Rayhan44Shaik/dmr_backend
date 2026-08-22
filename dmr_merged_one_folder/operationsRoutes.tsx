// src/modules/operations/routes/operationsRoutes.tsx

import { type RouteObject } from "react-router-dom";
import DashboardLayout from "../../../layouts/DashboardLayout/DashboardLayout";
import OperationsPages from "../pages/OperationsPages";

const operationsRoutes: RouteObject[] = [
  {
    path: "/operations",
    element: (
      <DashboardLayout>
        <OperationsPages />
      </DashboardLayout>
    ),
  },
  {
    // 🔴 CRITICAL: Catch all sub-paths so /operations/overview, /operations/shop/shop-sales, etc.
    // all load OperationsPages (which renders the top tabs)
    path: "/operations/*",
    element: (
      <DashboardLayout>
        <OperationsPages />
      </DashboardLayout>
    ),
  },
];

export default operationsRoutes;