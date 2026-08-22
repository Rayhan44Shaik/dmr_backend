import { X, Filter } from "lucide-react";
import { useShopSearch } from "../../../../../core/hooks/useShopSearch";
import { DatePicker } from "../../../../../components/common/DatePicker"; // adjust if needed

interface FilterState {
  shopName: string;
  fromDate: string;
  toDate: string;
  recovery: number;
  sortBy: string;
}

interface PendingFiltersProps {
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  shops: string[];
  onClose: () => void;
}

export function PendingFilters({
  filters,
  onFilterChange,
  shops,
  onClose,
}: PendingFiltersProps) {
  const shopSearch = useShopSearch(shops, filters.shopName, (value) => {
    onFilterChange({ ...filters, shopName: value });
  });

  const handleDateChange = (
    field: "fromDate" | "toDate",
    value: string
  ) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const handleRecoveryChange = (value: number) => {
    onFilterChange({
      ...filters,
      recovery: value,
    });
  };

  const handleSortChange = (value: string) => {
    onFilterChange({ ...filters, sortBy: value });
  };

  const handleClearAll = () => {
    onFilterChange({
      shopName: "",
      fromDate: "",
      toDate: "",
      recovery: 0,
      sortBy: "highestBalance",
    });

    shopSearch.setQuery("");
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 transform overflow-y-auto bg-white shadow-xl transition-transform duration-300 ease-in-out">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">
              Filters
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Body */}
        <div className="flex-1 space-y-5 px-4 py-4">
          {/* Shop Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Shop Name
            </label>

            <div className="relative">
              <input
                type="text"
                value={shopSearch.query}
                onChange={(e) =>
                  shopSearch.handleInputChange(e.target.value)
                }
                onFocus={() => shopSearch.setIsOpen(true)}
                placeholder="Search shop..."
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              {shopSearch.isOpen && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-300 bg-white py-1 text-sm shadow-lg">
                  {shopSearch.filteredShops.length > 0 ? (
                    shopSearch.filteredShops.map((shop) => (
                      <li
                        key={shop}
                        className="cursor-pointer px-3 py-2 hover:bg-blue-50"
                        onClick={() => shopSearch.handleSelect(shop)}
                      >
                        {shop}
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-slate-500">
                      No shops found
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* From Date – replaced with DatePicker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              From Date
            </label>
            <DatePicker
              value={filters.fromDate}
              onChange={(value) => handleDateChange("fromDate", value)}
              placeholder="Select start"
              className="w-full"
            />
          </div>

          {/* To Date – replaced with DatePicker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              To Date
            </label>
            <DatePicker
              value={filters.toDate}
              onChange={(value) => handleDateChange("toDate", value)}
              placeholder="Select end"
              className="w-full"
            />
          </div>

          {/* Recovery */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">
                Recovery %
              </label>

              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                {filters.recovery}%
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={filters.recovery}
              onChange={(e) =>
                handleRecoveryChange(Number(e.target.value))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-green-600"
            />

            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Sort By */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Sort By
            </label>

            <select
              value={filters.sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="highestBalance">
                Highest Balance
              </option>
              <option value="shopName">
                Shop Name
              </option>
              <option value="overdueDays">
                Overdue Days
              </option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 py-3">
          <button
            onClick={handleClearAll}
            className="w-full rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-300"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}