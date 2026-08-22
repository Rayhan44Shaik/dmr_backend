import { Calculator, AlertTriangle, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface CollectionAmountProps {
  amount: number;
  remarks: string;
  currentOutstanding: number;
  receivedToday: number;
  projectedBalance: number;
  showSummary: boolean;
  ledgerLoaded: boolean;
  amountError?: string;
  onAmountChange: (value: number) => void;
  onRemarksChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  disableSave: boolean;
}

const inr = (n: number) =>
  "₹ " + Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Format number with Indian comma separators (e.g., 100000 -> 1,00,000.00)
const formatWithCommas = (num: number): string => {
  if (isNaN(num)) return "0.00";
  const parts = num.toFixed(2).split(".");
  const integerPart = parts[0];
  const decimalPart = parts[1] || "00";
  // Indian numbering: group last 3 digits, then groups of 2
  const lastThree = integerPart.slice(-3);
  const otherNumbers = integerPart.slice(0, -3);
  const formattedInteger =
    otherNumbers !== ""
      ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;
  return formattedInteger + "." + decimalPart;
};

export default function CollectionAmount({
  amount,
  remarks,
  currentOutstanding,
  receivedToday,
  projectedBalance,
  showSummary,
  ledgerLoaded,
  amountError,
  onAmountChange,
  onRemarksChange,
  onSave,
  onCancel,
  isSaving,
  disableSave,
}: CollectionAmountProps) {
  // Local input state – stores the raw number string (without commas) while editing
  const [inputValue, setInputValue] = useState<string>(
    amount ? amount.toFixed(2) : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusedRef = useRef(false);

  // Sync with external `amount` when it changes (e.g., after reset)
  useEffect(() => {
    if (!isFocusedRef.current) {
      // When not focused, show formatted value with commas
      setInputValue(amount ? formatWithCommas(amount) : "");
    }
  }, [amount]);

  const handleFocus = () => {
    isFocusedRef.current = true;
    // On focus, convert formatted string back to raw number for easy typing
    const raw = parseFloat(inputValue.replace(/,/g, ""));
    if (!isNaN(raw)) {
      setInputValue(raw.toFixed(2));
    } else {
      setInputValue("");
    }
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    const raw = parseFloat(inputValue.replace(/,/g, ""));
    if (!isNaN(raw)) {
      const rounded = Math.round(raw * 100) / 100;
      onAmountChange(rounded);
      // Show formatted with commas
      setInputValue(formatWithCommas(rounded));
    } else {
      onAmountChange(0);
      setInputValue("0.00");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits and decimal point
    let val = e.target.value.replace(/[^0-9.]/g, "");
    // Allow only one decimal point
    const parts = val.split(".");
    if (parts.length > 2) {
      val = parts[0] + "." + parts.slice(1).join("");
    }
    setInputValue(val);
  };

  // Determine display values - show zeros when ledger not loaded
  const displayOutstanding = (showSummary && ledgerLoaded) ? currentOutstanding : 0;
  const displayReceived = (showSummary && ledgerLoaded) ? receivedToday : 0;
  const displayProjected = (showSummary && ledgerLoaded) ? projectedBalance : 0;

  let statusText = "";
  let statusClass = "";
  let statusIcon = null;
  
  if (!showSummary || !ledgerLoaded) {
    statusText = "Select Shop & View Ledger";
    statusClass = "bg-slate-100 text-slate-600";
    statusIcon = <Clock size={10} />;
  } else if (displayProjected < 0) {
    statusText = "Overpaid — Exceeds Outstanding";
    statusClass = "bg-blue-100 text-blue-800 border-blue-200";
    statusIcon = <AlertTriangle size={10} />;
  } else if (displayProjected === 0) {
    statusText = "Fully Collected — Balance Zero";
    statusClass = "bg-green-100 text-green-800 border-green-200";
    statusIcon = <CheckCircle size={10} />;
  } else {
    statusText = "Pending Approval — Not Yet Deducted";
    statusClass = "bg-amber-100 text-amber-800 border-amber-200";
    statusIcon = <Clock size={10} />;
  }

  const formattedProjected = displayProjected < 0
    ? `- ${inr(Math.abs(displayProjected))}`
    : inr(displayProjected);

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <Calculator size={16} />
        </div>
        <h2 className="text-lg font-semibold text-emerald-800">Collection Amount</h2>
      </div>

      {/* Amount Input */}
      <div className="flex items-center gap-4">
        <label htmlFor="amount" className="whitespace-nowrap text-sm font-medium text-slate-700">
          Amount Received <span className="text-red-500">*</span>
        </label>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
          <input
            ref={inputRef}
            id="amount"
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`h-10 w-full rounded-md border ${amountError ? "border-red-500" : "border-slate-300"} pl-8 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            placeholder="0.00"
          />
        </div>
      </div>
      {amountError && <p className="mt-1 text-xs text-red-500">{amountError}</p>}
      <p className="mt-1 text-xs text-slate-400">Enter the amount received from the selected shop.</p>

      {/* Remarks */}
      <div className="mt-4 flex items-center gap-4">
        <label htmlFor="remarks" className="whitespace-nowrap text-sm font-medium text-slate-700">
          Remarks (Optional)
        </label>
        <input
          id="remarks"
          type="text"
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder="Enter remarks..."
          className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
        />
      </div>

      {/* Collection Preview Calculation */}
      <div className="mt-5 flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="mb-3 text-base font-bold text-emerald-800 flex items-center gap-2">
          <Calculator size={16} />
          Collection Preview
        </h3>
        
        {/* BEFORE COLLECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-600">BEFORE COLLECTION</span>
            <span className="font-bold text-emerald-700">Current Outstanding</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-slate-800 bg-white rounded-lg px-3 py-2 border border-slate-200">
            <span>Current Outstanding</span>
            <span>{inr(displayOutstanding)}</span>
          </div>

          <div className="my-2 border-t border-dashed border-slate-200" />

          {/* COLLECTION */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-600">COLLECTION ENTRY</span>
            <span className="font-bold text-emerald-700">Pending Approval</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-emerald-700 bg-white rounded-lg px-3 py-2 border border-emerald-200">
            <span className="flex items-center gap-1.5">
              <ArrowRight size={14} className="text-emerald-600" />
              Received Today
            </span>
            <span>{inr(displayReceived)}</span>
          </div>

          <div className="my-2 border-t border-dashed border-slate-200" />

          {/* AFTER APPROVAL */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-600">AFTER APPROVAL</span>
            <span className="font-bold text-slate-700">Projected Balance</span>
          </div>
          <div className="flex items-center justify-between text-base font-extrabold bg-white rounded-lg px-3 py-2 border border-slate-200">
            <span>Projected Balance After Approval</span>
            <span className={displayProjected < 0 ? "text-blue-600" : displayProjected === 0 ? "text-emerald-700" : "text-rose-600"}>
              {formattedProjected}
            </span>
          </div>

          {/* Status Badge */}
          <div className="pt-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border ${statusClass}`}>
              {statusIcon}
              {statusText}
            </span>
            {!showSummary || !ledgerLoaded ? (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Click "View Shop Ledger" to load current outstanding
              </p>
            ) : displayProjected < 0 ? (
              <p className="mt-1.5 text-[11px] text-blue-600">
                Collection exceeds current outstanding. Verify amount before saving.
              </p>
            ) : displayProjected === 0 ? (
              <p className="mt-1.5 text-[11px] text-emerald-600">
                This collection will fully settle the outstanding balance.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-amber-600">
                This collection will reduce outstanding ONLY after approval.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={disableSave || isSaving}
          className={`rounded-md px-5 py-2 text-sm font-medium text-white transition ${
            disableSave || isSaving
              ? "cursor-not-allowed bg-slate-400"
              : "bg-emerald-700 hover:bg-emerald-800"
          }`}
        >
          {isSaving ? "Saving..." : "Save Collection"}
        </button>
      </div>
    </div>
  );
}