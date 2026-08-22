import React from "react";
import Select from "react-select";
import { RotateCcw, RefreshCw, Search } from "lucide-react";
import { DatePicker } from "../../../../../components/common/DatePicker";
import {
  opsFilterCardClass,
  opsFilterLabelClass,
  opsSecondaryButtonClass,
  opsReactSelectStyles,
  opsIconButtonClass,
} from "../../../../../shared/ui/operationsStyles";

interface Props {
  fromDate: string;
  toDate: string;
  shopName: string;
  sortBy: string;
  shopNames: string[];
  recoveryThreshold: number;
  searchQuery: string;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  setShopName: (value: string) => void;
  setSortBy: (value: string) => void;
  setRecoveryThreshold: (value: number) => void;
  setSearchQuery: (value: string) => void;
  onReset: () => void;
  onRefresh: () => void;
  hasFilters: boolean;
}

function PendingCollectionsFilters({
  fromDate,
  toDate,
  shopName,
  sortBy,
  shopNames,
  recoveryThreshold,
  searchQuery,
  setFromDate,
  setToDate,
  setShopName,
  setSortBy,
  setRecoveryThreshold,
  setSearchQuery,
  onReset,
  onRefresh,
  hasFilters,
}: Props) {
  const sortedShopNames = [...shopNames].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "accent", numeric: true })
  );

  const shopOptions = [
    { value: "", label: "All Shops" },
    ...sortedShopNames.map((shop) => ({ value: shop, label: shop })),
  ];

  const sortOptions = [
    { value: "alphabeticalAZ", label: "Shop Name A–Z" },
    { value: "alphabeticalZA", label: "Shop Name Z–A" },
    { value: "highestBalance", label: "Highest Balance" },
    { value: "lowestBalance", label: "Lowest Balance" },
    { value: "latestCollection", label: "Latest Collection" },
    { value: "oldestCollection", label: "Oldest Collection" },
  ];

  const selectStyles = opsReactSelectStyles();

  return (
    <div className={opsFilterCardClass}>
      {/* Row 1: From Date | To Date | Shop Name | Sort By */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
        <div className="lg:col-span-2">
          <label className={opsFilterLabelClass}>From Date</label>
          <DatePicker
            value={fromDate}
            onChange={setFromDate}
            placeholder="Select date"
            className="w-full text-xs"
          />
        </div>

        <div className="lg:col-span-2">
          <label className={opsFilterLabelClass}>To Date</label>
          <DatePicker
            value={toDate}
            onChange={setToDate}
            placeholder="Select date"
            className="w-full text-xs"
          />
        </div>

        <div className="lg:col-span-4">
          <label className={opsFilterLabelClass}>Shop Name</label>
          <Select
            options={shopOptions}
            value={shopOptions.find((x) => x.value === shopName)}
            onChange={(e) => setShopName(e?.value || "")}
            isSearchable
            placeholder="All Shops"
            styles={selectStyles}
          />
        </div>

        <div className="lg:col-span-4">
          <label className={opsFilterLabelClass}>Sort By</label>
          <Select
            options={sortOptions}
            value={sortOptions.find((x) => x.value === sortBy)}
            onChange={(e) => setSortBy(e?.value || "alphabeticalAZ")}
            styles={selectStyles}
          />
        </div>
      </div>

      {/* Row 2: Recovery % | Search input | Reset | Refresh */}
      <div className="pt-2 border-t border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-3">
            <label className={opsFilterLabelClass}>Recovery %</label>
            <div className="relative">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={recoveryThreshold}
                onChange={(e) => setRecoveryThreshold(Number(e.target.value))}
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
              />
              <div className="absolute top-[-20px] right-0 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                {recoveryThreshold}%
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <label className={opsFilterLabelClass}>Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shop..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
              />
            </div>
          </div>

          <div className="lg:col-span-2 flex items-end gap-1.5">
            <button type="button" onClick={onReset} className={opsSecondaryButtonClass} style={{ minWidth: "90px" }}>
              <RotateCcw size={12} className="mr-1" />
              Reset
            </button>
            <button type="button" onClick={onRefresh} className={opsIconButtonClass} title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(PendingCollectionsFilters);