import React, { useCallback, useMemo } from 'react';
import Select from 'react-select';
import type { ReportFilters, ReportType } from '../types/reportTypes';

interface Props {
  reportType: ReportType;
  filters: ReportFilters;
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>;
  vehicleOptions: { value: string; label: string }[];
  driverOptions: { value: string; label: string }[];
  shopOptions: { value: string; label: string }[];
  collectorOptions: { value: string; label: string }[];
}

const ReportFiltersComponent: React.FC<Props> = React.memo(({
  reportType,
  filters,
  setFilters,
  vehicleOptions,
  driverOptions,
  shopOptions,
  collectorOptions,
}) => {
  const handleChange = useCallback((field: keyof ReportFilters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, [setFilters]);

  const statusOptions = useMemo(() => [
    { value: 'All', label: 'All' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Completed', label: 'Completed' },
  ], []);

  const paymentOptions = useMemo(() => [
    { value: 'All', label: 'All' },
    { value: 'Cash', label: 'Cash' },
    { value: 'Bank Transfer', label: 'Bank Transfer' },
    { value: 'UPI', label: 'UPI' },
    { value: 'Other', label: 'Other' },
  ], []);

  const groupByOptions = useMemo(() => [
    { value: 'Shop', label: 'Shop' },
    { value: 'Category', label: 'Category' },
    { value: 'Sub Category', label: 'Sub Category' },
  ], []);

  const renderReportSpecificFilters = useCallback(() => {
    switch (reportType) {
      case 'vehicle':
        return (
          <>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Vehicle</label>
              <Select
                options={vehicleOptions}
                value={vehicleOptions.find(v => v.value === filters.vehicle) || null}
                onChange={(selected) => handleChange('vehicle', selected?.value || 'All Vehicles')}
                placeholder="All Vehicles"
                isSearchable
                className="text-sm"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                menuPortalTarget={document.body}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Driver</label>
              <Select
                options={driverOptions}
                value={driverOptions.find(d => d.value === filters.driver) || null}
                onChange={(selected) => handleChange('driver', selected?.value || 'All Drivers')}
                placeholder="All Drivers"
                isSearchable
                className="text-sm"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                menuPortalTarget={document.body}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Trip Status</label>
              <Select
                options={statusOptions}
                value={statusOptions.find(s => s.value === (filters.tripStatus || 'All'))}
                onChange={(selected) => handleChange('tripStatus', selected?.value || 'All')}
                placeholder="All"
                className="text-sm"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                menuPortalTarget={document.body}
              />
            </div>
          </>
        );
      case 'shopSales':
      case 'shopLedger':
        return (
          <div className="col-span-1">
            <label className="text-xs font-medium text-slate-500 block mb-1">Shop</label>
            <Select
              options={shopOptions}
              value={shopOptions.find(s => s.value === filters.shop) || null}
              onChange={(selected) => handleChange('shop', selected?.value || 'All Shops')}
              placeholder="All Shops"
              isSearchable
              className="text-sm"
              styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
            />
          </div>
        );
      case 'collection':
        return (
          <>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Shop</label>
              <Select
                options={shopOptions}
                value={shopOptions.find(s => s.value === filters.shop) || null}
                onChange={(selected) => handleChange('shop', selected?.value || 'All Shops')}
                placeholder="All Shops"
                isSearchable
                className="text-sm"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                menuPortalTarget={document.body}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Collector</label>
              <Select
                options={collectorOptions}
                value={collectorOptions.find(c => c.value === filters.collector) || null}
                onChange={(selected) => handleChange('collector', selected?.value || 'All Collectors')}
                placeholder="All Collectors"
                isSearchable
                className="text-sm"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                menuPortalTarget={document.body}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Payment Mode</label>
              <Select
                options={paymentOptions}
                value={paymentOptions.find(p => p.value === (filters.paymentMode || 'All'))}
                onChange={(selected) => handleChange('paymentMode', selected?.value || 'All')}
                placeholder="All Payment Modes"
                className="text-sm"
                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                menuPortalTarget={document.body}
              />
            </div>
          </>
        );
      case 'expenses':
        return (
          <div className="col-span-1">
            <label className="text-xs font-medium text-slate-500 block mb-1">Group By</label>
            <Select
              options={groupByOptions}
              value={groupByOptions.find(g => g.value === (filters.groupBy || 'Category'))}
              onChange={(selected) => handleChange('groupBy', selected?.value || 'Category')}
              placeholder="Group By"
              className="text-sm"
              styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
            />
          </div>
        );
      default:
        return null;
    }
  }, [reportType, filters, handleChange, vehicleOptions, driverOptions, shopOptions, collectorOptions, statusOptions, paymentOptions, groupByOptions]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-700 mb-4">Report Filters</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Date From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Date To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        {reportType === 'weekly' && (
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Include Charts</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleChange('includeCharts', true)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  filters.includeCharts !== false
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => handleChange('includeCharts', false)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  filters.includeCharts === false
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}
              >
                No
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Report Format</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange('format', 'PDF')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filters.format === 'PDF'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              PDF
            </button>
            <button
              onClick={() => handleChange('format', 'Excel')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filters.format === 'Excel'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              Excel
            </button>
          </div>
        </div>
        {renderReportSpecificFilters()}
      </div>
    </div>
  );
});

export default ReportFiltersComponent;