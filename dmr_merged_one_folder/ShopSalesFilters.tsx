// src/modules/operations/shop-sales/components/ShopSalesFilters.tsx

import React from "react";
import Select from "react-select";
import { Search, RotateCcw, Filter } from "lucide-react";
import { DatePicker } from "../../../../components/common/DatePicker";
import {
  opsFilterCardClass,
  opsFilterLabelClass,
  opsPrimaryButtonClass,
  opsSecondaryButtonClass,
  opsReactSelectStyles,
} from "../../../../shared/ui/operationsStyles";

interface Props {
  fromDate: string;
  toDate: string;
  shopName: string;
  sortBy: string;
  shopNames: string[];
  totalEntries: number;
  searchQuery: string;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  setShopName: (value: string) => void;
  setSortBy: (value: string) => void;
  setSearchQuery: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  hasFilters: boolean;
}

function ShopSalesFilters({
  fromDate,
  toDate,
  shopName,
  sortBy,
  shopNames,
  setFromDate,
  setToDate,
  setShopName,
  setSortBy,
  searchQuery,
  setSearchQuery,
  onSearch,
  onReset,
  hasFilters,
  totalEntries,
}: Props) {
  const sortedShopNames = [...shopNames].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "accent", numeric: true })
  );

  const shopOptions = [
    { value: "", label: "All Shops" },
    ...sortedShopNames.map((shop) => ({ value: shop, label: shop })),
  ];

  const sortOptions = [
    { value: "latest", label: "Latest Date" },
    { value: "oldest", label: "Oldest Date" },
    { value: "shop_asc", label: "Shop Name A-Z" },
    { value: "shop_desc", label: "Shop Name Z-A" },
    { value: "amount_desc", label: "Highest Amount" },
    { value: "amount_asc", label: "Lowest Amount" },
  ];

  const selectStyles = opsReactSelectStyles();

  return (
    <div className={opsFilterCardClass}>
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <Filter size={15} />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Filters</h3>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          {hasFilters ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-semibold border border-emerald-200/60 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              Filters active
            </span>
          ) : (
            <span>Showing all records</span>
          )}
        </div>
      </div>

      {/* Inputs Grid */}
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
            onChange={(e) => setSortBy(e?.value || "latest")}
            styles={selectStyles}
          />
        </div>
      </div>

      {/* Search with Actions */}
      <div className="pt-2 border-t border-slate-100">
        <label className={opsFilterLabelClass}>Search</label>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
            placeholder="Search Shop Sales No, Shop Name, Trip No..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
          />
          <button type="button" onClick={onSearch} className={opsPrimaryButtonClass}>
            <Search size={14} />
            Search
          </button>
          <button type="button" onClick={onReset} className={opsSecondaryButtonClass}>
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400 font-medium">
          Tip: a full Shop Sales No (TR-20260820-001-S002) returns that sale; a Trip No
          (TR-20260820-001) returns every sale on that trip; a shop name returns its sales.
        </p>
      </div>
    </div>
  );
}

export default React.memo(ShopSalesFilters);