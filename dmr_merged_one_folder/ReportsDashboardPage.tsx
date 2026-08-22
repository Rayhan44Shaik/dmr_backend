import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import type { ReportFilters, ReportType } from '../types/reportTypes';
import { getReportData } from '../services/reportService';
import ReportFiltersComponent from '../components/ReportFilters';
import ReportCard from '../components/ReportCard';
import ShopLedgerPage from './ShopLedgerPage';
import VehicleReportPage from '../vehicle/pages/VehicleReportPage';

// ========== IMPORTS ==========
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import { useEmployees } from '../../masters/employees/hooks/useEmployees';
import { useShops } from '../../masters/shops/hooks/useShops';
import { exportToPDF, exportToExcel } from '../../../utils/exportUtils';

// ========== REPORT CONFIGURATIONS ==========
const REPORT_LABELS: Record<ReportType, string> = {
  weekly: 'Weekly Report',
  vehicle: 'Vehicle Report',
  shopSales: 'Shop Sales Report',
  collection: 'Collection Report',
  shopLedger: 'Shop Ledger',
  expenses: 'Expenses Report',
};

const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  weekly: 'Complete business summary for the selected week',
  vehicle: 'Detailed report for all vehicles and trips',
  shopSales: 'Sales details for all shops for selected period',
  collection: 'Collection details for all shops and collectors',
  shopLedger: 'Individual shop ledger with sales & collections',
  expenses: 'All business expenses report for selected period',
};

const REPORT_INCLUDES: Record<ReportType, string[]> = {
  weekly: ['Sales, Collections & Outstanding Summary', 'Trips, Birds, Mortality Summary', 'Expense Summary (Fuel, Maintenance, Fastag, Office)', 'Profit & Loss Summary'],
  vehicle: ['Trip Summary (Vehicle Wise)', 'KM Summary & Distance', 'Fuel Consumption & Expense', 'Maintenance, Fastag, Insurance & Permit', 'Vehicle Availability & Status'],
  shopSales: ['Shop Wise Sales Summary', 'Daily Sales Breakdown', 'Birds, Weight, Boxes, Amount', 'Sales Comparison', 'Top Performing Shops'],
  collection: ['Collection Register', 'Shop Wise Collection Summary', 'Collector Wise Collection', 'Payment Mode Wise Collection', 'Pending vs Collected Summary'],
  shopLedger: ['Opening Balance', 'Sales (Debit)', 'Collections (Credit)', 'Running Balance', 'Closing Balance & Outstanding'],
  expenses: ['Fuel Expense', 'Vehicle Maintenance Expense', 'Fastag Expense', 'Office Expense', 'Insurance & Permit Expense', 'Total Expense Summary'],
};

// ========== DEFAULT FILTERS ==========
const getDefaultFilters = (type: ReportType): ReportFilters => {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const common = {
    dateFrom: format(sevenDaysAgo, 'yyyy-MM-dd'),
    dateTo: format(now, 'yyyy-MM-dd'),
    format: 'PDF' as const,
    includeCharts: true,
  };
  switch (type) {
    case 'weekly':
      return { ...common, includeSections: ['Sales Summary', 'Collections Summary', 'Trips, Birds & Mortality'] };
    case 'vehicle':
      return { ...common, vehicle: 'All Vehicles', driver: 'All Drivers', tripStatus: 'All' };
    case 'shopSales':
      return { ...common, shop: 'All Shops', groupBy: 'Shop' };
    case 'collection':
      return { ...common, shop: 'All Shops', collector: 'All Collectors', paymentMode: 'All' };
    case 'shopLedger':
      return { ...common, shop: 'All Shops', groupBy: 'Shop' };
    case 'expenses':
      return { ...common, groupBy: 'Category' };
    default:
      return common;
  }
};

// ========== MAIN COMPONENT ==========
type ReportsDashboardPageProps = { embedded?: boolean };

const ReportsDashboardPage: React.FC<ReportsDashboardPageProps> = React.memo(({ embedded = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  // Tab resolution: query param first, then the /reports/vehicle path alias.
  const activeTab = useMemo<ReportType>(() => {
    const tab = searchParams.get('tab') as ReportType | null;
    if (tab) return tab;
    if (location.pathname === '/reports/vehicle' || location.pathname.startsWith('/reports/vehicle/')) {
      return 'vehicle';
    }
    return 'shopLedger';
  }, [searchParams, location.pathname]);

  const { showNotification } = useSafeNotification();

  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { shops } = useShops();

  const [filters, setFilters] = useState<ReportFilters>(() => getDefaultFilters(activeTab));

  // Redirect bare /reports to the default tab. Path aliases such as
  // /reports/vehicle resolve through activeTab and are left untouched.
  useEffect(() => {
    if (!searchParams.get('tab') && location.pathname === '/reports') {
      navigate('/reports?tab=shopLedger', { replace: true });
    }
  }, [location.pathname, location.search, navigate, searchParams]);

  // Update filters when active tab changes from query params
  useEffect(() => {
    setFilters(getDefaultFilters(activeTab));
  }, [activeTab]);

  const vehicleOptions = useMemo(
    () => [
      { value: 'All Vehicles', label: 'All Vehicles' },
      ...vehicles.map((v) => ({ value: v.vehicleNumber, label: v.vehicleNumber })),
    ],
    [vehicles]
  );

  const driverOptions = useMemo(
    () => [
      { value: 'All Drivers', label: 'All Drivers' },
      ...employees
        .filter((e) => e.department === 'Driver')
        .map((e) => ({ value: e.employeeName, label: e.employeeName })),
    ],
    [employees]
  );

  const collectorOptions = useMemo(
    () => [
      { value: 'All Collectors', label: 'All Collectors' },
      ...employees
        .filter((e) => e.department === 'Collection')
        .map((e) => ({ value: e.employeeName, label: e.employeeName })),
    ],
    [employees]
  );

  const shopOptions = useMemo(
    () => [
      { value: 'All Shops', label: 'All Shops' },
      ...shops.map((s) => ({ value: s.shopName, label: s.shopName })),
    ],
    [shops]
  );

  const reportData = useMemo(() => {
    // The new Vehicle Report page owns its data pipeline; the legacy card
    // flow is only used for the remaining report types.
    if (activeTab === 'shopLedger' || activeTab === 'vehicle') return null;
    try {
      return getReportData(activeTab, filters);
    } catch (error) {
      console.error('Error generating report:', error);
      return null;
    }
  }, [activeTab, filters]);

  const isDataAvailable = useMemo(() => {
    if (!reportData) return false;
    if (reportData.isEmpty !== undefined) return !reportData.isEmpty;
    if (reportData.details) {
      if (Array.isArray(reportData.details)) return reportData.details.length > 0;
      return Object.keys(reportData.details).length > 0;
    }
    return Object.keys(reportData.summary || {}).length > 0;
  }, [reportData]);

  const handleExport = useCallback(
    (formatType: 'PDF' | 'Excel') => {
      if (!reportData || !isDataAvailable) {
        showNotification('No data to export. Please adjust filters.', 'error');
        return;
      }

      try {
        const headers = ['Metric', 'Value'];
        const rows = Object.entries(reportData.summary).map(([key, value]) => [key, String(value)]);
        const filename = `${activeTab}_${format(new Date(), 'yyyy-MM-dd')}`;
        const title = REPORT_LABELS[activeTab];

        if (formatType === 'PDF') {
          exportToPDF(title, headers, rows, filename);
        } else {
          exportToExcel(title, headers, rows, filename);
        }
        showNotification(`Report downloaded as ${formatType}`, 'success');
      } catch (error) {
        console.error('Export error:', error);
        showNotification('Failed to generate report. Please try again.', 'error');
      }
    },
    [reportData, activeTab, isDataAvailable, showNotification]
  );

  const content = (
    <div className="w-full px-4 pb-8 pt-6 sm:px-5 lg:px-6">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        {activeTab === 'shopLedger' ? (
          <ShopLedgerPage embedded={true} />
        ) : activeTab === 'vehicle' ? (
          <VehicleReportPage embedded={true} />
        ) : (
          <>
            <ReportFiltersComponent
              reportType={activeTab}
              filters={filters}
              setFilters={setFilters}
              vehicleOptions={vehicleOptions}
              driverOptions={driverOptions}
              shopOptions={shopOptions}
              collectorOptions={collectorOptions}
            />
            <ReportCard
              title={REPORT_LABELS[activeTab]}
              description={REPORT_DESCRIPTIONS[activeTab]}
              includeList={REPORT_INCLUDES[activeTab]}
              onDownloadPDF={() => handleExport('PDF')}
              onDownloadExcel={() => handleExport('Excel')}
              isDataAvailable={isDataAvailable}
            />
          </>
        )}
      </div>
    </div>
  );

  if (embedded) return content;
  return <div className="w-full">{content}</div>;
});

export default ReportsDashboardPage;