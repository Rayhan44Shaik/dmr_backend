/* DEFERRED / FUTURE WORK — not part of current Fleet Operations production scope. */
/*
import { memo } from 'react';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import { useExpenseReportData } from '../hooks/useExpenseReportData';
import ErrorBoundary from '../components/common/ErrorBoundary';
import KpiCard from '../components/common/KpiCard';
import { exportFleetReport } from '../utils/fleetExport';

const VehicleExpenseReportPage = () => {
  const { vehicles } = useVehicles();
  const {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedVehicle,
    setSelectedVehicle,
    filtered,
    totals,
    summary,
  } = useExpenseReportData();

  const handleExportPDF = () => {
    const exportData = filtered.map((r: any) => ({
      'Vehicle No.': r.vehicle.vehicleNumber,
      'Fuel': r.fuelCost,
      'Maintenance': r.maintCost,
      'Toll': r.tollCost,
      'EMI': r.emiCost,
      'Other': r.otherCost,
      'Total': r.totalCost,
    }));
    exportFleetReport(exportData, 'Vehicle_Expense', 'pdf');
  };

  const handleExportExcel = () => {
    const exportData = filtered.map((r: any) => ({
      'Vehicle No.': r.vehicle.vehicleNumber,
      'Fuel': r.fuelCost,
      'Maintenance': r.maintCost,
      'Toll': r.tollCost,
      'EMI': r.emiCost,
      'Other': r.otherCost,
      'Total': r.totalCost,
    }));
    exportFleetReport(exportData, 'Vehicle_Expense', 'excel');
  };

  // ✅ Ensure all tiles have valid values
  const summaryTiles = [
    { label: 'Total Expense', value: totals?.totalCost ?? 0, format: 'currency' as const },
    { label: 'Highest Expense', value: summary?.highest?.totalCost ?? 0, format: 'currency' as const },
    { label: 'Lowest Expense', value: summary?.lowest?.totalCost ?? 0, format: 'currency' as const },
    { label: 'Average per Vehicle', value: summary?.avg ?? 0, format: 'currency' as const },
  ];

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap gap-4 justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Vehicle Expense Report</h1>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Excel
            </button>
          </div>
        </div>

        {// Filters }
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Vehicles</option>
                {vehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.vehicleNumber}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {// Expense Table }
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicle No.
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fuel
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Maintenance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Toll
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    EMI
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Other
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No expense data found for the selected period.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row: any) => (
                    <tr key={row.vehicle.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.vehicle.vehicleNumber}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₹{row.fuelCost.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₹{row.maintCost.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₹{row.tollCost.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₹{row.emiCost.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₹{row.otherCost.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">
                        ₹{row.totalCost.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
                {filtered.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right">₹{totals.fuelCost.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">₹{totals.maintCost.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">₹{totals.tollCost.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">₹{totals.emiCost.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">₹{totals.otherCost.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-blue-600">₹{totals.totalCost.toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {// Summary Tiles - Only render if there is data }
        {filtered.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summaryTiles.map((tile, idx) => (
              <KpiCard
                key={idx}
                label={tile.label}
                value={tile.value}
                format={tile.format}
              />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default memo(VehicleExpenseReportPage);*/

import { memo } from 'react';
import ErrorBoundary from '../components/common/ErrorBoundary';

interface VehicleReportsPageProps {
  embedded?: boolean;
}

const VehicleReportsPage = ({ embedded = false }: VehicleReportsPageProps) => {
  return (
    <ErrorBoundary>
      <div className={`w-full flex items-center justify-center animate-in fade-in duration-500 ${
        embedded ? 'min-h-[60vh]' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
      }`}>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center max-w-md w-full mx-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 border border-blue-100 shadow-sm animate-bounce">
            🚧
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Vehicle Reports - Coming Soon</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            This module is currently being enhanced and will be made fully available after the upcoming updates.
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(VehicleReportsPage);