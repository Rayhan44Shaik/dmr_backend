import React from "react";
import { RotateCcw, BookOpen, Wallet, Loader2 } from "lucide-react";
import Select from "react-select";
import type { CollectionEntry, CollectionErrors, PaymentMode } from "../../types/collection";
import { DatePicker } from "../../../../../components/common/DatePicker";
import { opsReactSelectStyles } from "../../../../../shared/ui/operationsStyles";

interface Props {
  entry: CollectionEntry;
  errors: CollectionErrors;
  shops: string[];
  collectors: string[];
  paymentModes: PaymentMode[];
  onDateChange: (value: string) => void;
  onShopChange: (value: string) => void;
  onCollectorChange: (value: string) => void;
  onPaymentModeChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onViewLedger: () => void;
  onReset: () => void;
  ledgerLoading?: boolean;
}

const startsWithFilter = (option: any, inputValue: string) => {
  if (!inputValue) return true;
  return option.label.toLowerCase().startsWith(inputValue.toLowerCase());
};

function CollectionInformation({
  entry,
  errors,
  shops,
  collectors,
  paymentModes,
  onDateChange,
  onShopChange,
  onCollectorChange,
  onPaymentModeChange,
  onReferenceChange,
  onViewLedger,
  onReset,
  ledgerLoading = false,
}: Props) {
  const shopOptions = shops.map((shop) => ({ value: shop, label: shop }));

  const selectStyles = opsReactSelectStyles();

  const isLedgerEnabled =
    entry.shopName.trim().length > 0 &&
    entry.collectorName.trim().length > 0 &&
    entry.paymentModeName.trim().length > 0;

  return (
    <div>
      {/* Header with green icon and larger bottom margin */}
      <div className="border-b border-slate-200 pb-3 mb-5 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Wallet size={16} />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Collection Information</h2>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Collection Date – now using DatePicker */}
          <div>
            <label htmlFor="collectionDate" className="mb-1 block text-sm font-medium text-slate-700">
              Collection Date
            </label>
            <DatePicker
              value={entry.collectionDate}
              onChange={onDateChange}
              placeholder="Select date"
              className="w-full"
            />
            {errors.collectionDate && (
              <p id="collectionDate-error" className="mt-1 text-xs text-red-600">
                {errors.collectionDate}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="collector" className="mb-1 block text-sm font-medium text-slate-700">
              Collector <span className="text-red-500">*</span>
            </label>
            <select
              id="collector"
              value={entry.collectorName}
              onChange={(e) => onCollectorChange(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              aria-describedby={errors.collectorName ? "collector-error" : undefined}
            >
              <option value="">Select Collector</option>
              {collectors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {errors.collectorName && (
              <p id="collector-error" className="mt-1 text-xs text-red-600">
                {errors.collectorName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="paymentMode" className="mb-1 block text-sm font-medium text-slate-700">
              Payment Mode <span className="text-red-500">*</span>
            </label>
            <select
              id="paymentMode"
              value={entry.paymentModeName}
              onChange={(e) => onPaymentModeChange(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              aria-describedby={errors.paymentModeName ? "paymentMode-error" : undefined}
            >
              {paymentModes.map((mode) => (
                <option key={mode.name} value={mode.name}>
                  {mode.name}
                </option>
              ))}
            </select>
            {errors.paymentModeName && (
              <p id="paymentMode-error" className="mt-1 text-xs text-red-600">
                {errors.paymentModeName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="referenceNo" className="mb-1 block text-sm font-medium text-slate-700">
              Reference No.
            </label>
            <input
              id="referenceNo"
              type="text"
              value={entry.referenceNo}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder="Reference Number"
              disabled={entry.paymentModeName === "Cash"}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
              aria-describedby={errors.referenceNo ? "referenceNo-error" : undefined}
            />
            {errors.referenceNo && (
              <p id="referenceNo-error" className="mt-1 text-xs text-red-600">
                {errors.referenceNo}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-1 lg:col-span-2">
            <label htmlFor="shopName" className="mb-1 block text-sm font-medium text-slate-700">
              Shop Name <span className="text-red-500">*</span>
            </label>
            <Select
              id="shopName"
              options={shopOptions}
              value={shopOptions.find((opt) => opt.value === entry.shopName) || null}
              onChange={(selected) => onShopChange(selected?.value || "")}
              isSearchable
              filterOption={startsWithFilter}
              placeholder="Select Shop"
              styles={selectStyles}
              maxMenuHeight={200}
            />
            {errors.shopName && (
              <p id="shopName-error" className="mt-1 text-xs text-red-600">
                {errors.shopName}
              </p>
            )}
          </div>

          <div className="flex items-end justify-end gap-3 sm:col-span-1">
            <button
              type="button"
              onClick={onViewLedger}
              disabled={!isLedgerEnabled || ledgerLoading}
              title={!isLedgerEnabled ? "Please select Shop, Collector, and Payment Mode" : ledgerLoading ? "Loading ledger..." : ""}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition ${
                isLedgerEnabled && !ledgerLoading
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "cursor-not-allowed bg-slate-400"
              }`}
            >
              {ledgerLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <BookOpen size={16} />
                  View Shop Ledger
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-600 transition hover:bg-red-50 active:scale-95"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(CollectionInformation);