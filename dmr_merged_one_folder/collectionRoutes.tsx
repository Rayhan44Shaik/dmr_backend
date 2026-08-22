import type { RouteObject } from "react-router-dom";
import DashboardLayout from "../../../../layouts/DashboardLayout/DashboardLayout";
import CollectionEntryPage from "../pages/CollectionEntryPage";
import PendingCollectionsPage from "../pages/PendingCollectionsPage";
import CollectionReportPage from "../pages/CollectionReportPage"; // new

const collectionRoutes: RouteObject[] = [
  {
    path: "/operations/collections/entry",
    element: (
      <DashboardLayout>
        <CollectionEntryPage />
      </DashboardLayout>
    )
  },
  {
    path: "/operations/collections/pending",
    element: (
      <DashboardLayout>
        <PendingCollectionsPage />
      </DashboardLayout>
    )
  },
  {
    path: "/operations/collections/report", // new route
    element: (
      <DashboardLayout>
        <CollectionReportPage />
      </DashboardLayout>
    )
  }
];

export default collectionRoutes;