export {
  ACTIVE_FLEET_TABS,
  DEFERRED_FLEET_TABS,
  DEFAULT_FLEET_TAB,
  PLACEHOLDER_FLEET_TABS,
  VISIBLE_FLEET_TABS,
  isActiveFleetTab,
  isDeferredFleetTab,
  isPlaceholderFleetTab,
  isVisibleFleetTab,
} from './activeFleetScope';

// Export all pages (deferred Dashboard/Reports/Expenses remain exported for future work)
export { default as FleetDashboardPage } from './pages/FleetDashboardPage';
export { default as MaintenanceEntryPage } from './pages/MaintenanceEntryPage';
export { default as MaintenanceHistoryPage } from './pages/MaintenanceHistoryPage';
export { default as DocumentsExpiryPage } from './pages/DocumentsExpiryPage';
export { default as FastagDashboardPage } from './pages/FastagDashboardPage';
export { default as EmiLoansPage } from './pages/EmiLoansPage';
export { default as VehicleAnalyticsPage } from './pages/VehicleAnalyticsPage';
export { default as VehicleReportsPage } from './pages/VehicleReportsPage';
export { default as VehicleExpenseReportPage } from './pages/VehicleExpenseReportPage';

// Export routes
export { fleetRoutes } from './routes';

// Export types
export * from './types';

// Export utils
export * from './utils/formatters';
export {
  MAINTENANCE_TYPES,
  DOCUMENT_TYPES,
  DOCUMENT_LABELS,
  DOCUMENT_TYPE_ORDER,
  FASTAG_STATUSES,
  FASTAG_STATUS_LABELS,
  EMI_STATUSES,
  EMI_STATUS_LABELS,
  DEFAULT_PAGE_SIZE,
  DATE_FORMAT,
  DATE_DISPLAY_FORMAT,
  DATE_TIME_DISPLAY_FORMAT,
  FLEET_STORAGE_KEYS,
} from './utils/constants';
export * from './utils/helpers';
export * from './utils/fleetExport';