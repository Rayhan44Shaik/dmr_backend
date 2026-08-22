// src/modules/operations/vehicle-trips/components/Step_5/StepEnd.tsx

import React, { useState, useEffect, useRef } from "react";
import {
  Pencil,
  AlertTriangle,
  X,
} from "lucide-react";
import type { Trip } from "../../types/trip";
import { WizardActionBar, WizardStepNotice } from "../WizardStepUI";
import { TRIP_STEP_DEFINITIONS } from "../../../../../shared/trip/definitions";
import GeneralExpensesTable from "./GeneralExpensesTable";
import DieselExpensesTable from "./DieselExpensesTable";

// ─── ConfirmationModal ────────────────────────────────────────────
function ConfirmationModal({ isOpen, title, message, confirmLabel = "Yes, Proceed", cancelLabel = "Cancel", onConfirm, onCancel, type = "warning" }: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "warning" | "info";
}) {
  if (!isOpen) return null;
  const iconColor = type === "warning" ? "text-amber-600" : "text-emerald-600";
  const borderColor = type === "warning" ? "border-amber-200" : "border-emerald-200";
  const bgGradient = type === "warning" ? "from-amber-50 to-orange-50" : "from-emerald-50 to-teal-50";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border ${borderColor}`}>
        <div className={`bg-gradient-to-br ${bgGradient} p-6`}>
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 p-2 rounded-full bg-white/80 border ${borderColor}`}>
              <AlertTriangle size={22} className={iconColor} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">{title}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onCancel} className="px-5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-600 transition-all shadow-xs">{cancelLabel}</button>
          <button onClick={onConfirm} className={`px-5 py-2 rounded-lg text-sm font-bold text-white shadow-xs transition-all active:scale-[0.98] ${type === "warning" ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

interface SheetData extends Record<string, any> {
  vehicleNo: string;
  submittedAtTimestamp: string;
  advance: number | string;
  meals: number | string;
  loading: number | string;
  mealsTiffin: number | string;
  vehicleMaintenance: number | string;
  othersRC: number | string;
  others1Amt: number | string;
  others2Amt: number | string;
  others3Amt: number | string;
  others4Amt: number | string;
  others5Amt: number | string;
  startMeter: number | string;
  endMeter: number | string;
  destinationTolls: number | string;
  remarks: string;
}

interface Props {
  trip: Trip;
  setTrip?: React.Dispatch<React.SetStateAction<Trip>>;
  updateTrip: (updates: Partial<Trip>, persist?: boolean, silent?: boolean) => void;
  submitExpensesStep?: (data: Partial<Trip>) => boolean | Promise<boolean>;
  saveEndProgress?: (data: Partial<Trip>) => Promise<boolean>;
  submitStartStep?: (data: Partial<Trip>) => boolean | Promise<boolean>;
  editable?: boolean;
  canEdit?: boolean;
  onCancel?: () => void;
  clearForm?: () => void;
}

export default function StepEnd({
  trip,
  updateTrip: _updateTrip,
  submitExpensesStep,
  saveEndProgress,
  submitStartStep,
  editable: _editable = false,
  canEdit = true,
  onCancel,
  clearForm,
}: Props) {
  // ─── State ─────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" | "info" } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: "warning" | "info";
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  // ─── Local isSubmitted state ─────────────────────────────────────
  const [isSubmittedLocal, setIsSubmittedLocal] = useState(false);
  const isSubmitted = Boolean((trip as any).expensesStepSubmitted || (trip as any).endStepSubmitted || isSubmittedLocal);

  // ─── Helper to build sheet data from trip ──────────────────────
  const buildSheetDataFromTrip = (tripData: Trip): SheetData => {
    const data: SheetData = {
      vehicleNo: tripData.vehicleNo || "",
      submittedAtTimestamp: (tripData as any).expensesStepSubmittedAt || (tripData as any).submittedAtTimestamp || (tripData as any).submittedAt || "",
      advance: tripData.advanceAmount ?? "",
      meals: (tripData as any).meals ?? "",
      loading: (tripData as any).loading ?? "",
      mealsTiffin: (tripData as any).mealsTiffin ?? "",
      vehicleMaintenance: (tripData as any).vehicleMaintenance ?? "",
      othersRC: (tripData as any).othersRC ?? "",
      others1Amt: (tripData as any).others1Amt ?? "",
      others2Amt: (tripData as any).others2Amt ?? "",
      others3Amt: (tripData as any).others3Amt ?? "",
      others4Amt: (tripData as any).others4Amt ?? "",
      others5Amt: (tripData as any).others5Amt ?? "",
      startMeter: tripData.openingMeter || 0,
      endMeter: (tripData as any).endMeter ?? (tripData as any).closingMeter ?? "",
      destinationTolls: (tripData as any).destinationTolls ?? (tripData as any).deliveryTolls ?? "",
      remarks: (tripData as any).remarks ?? "",
    };
    // Copy all diesel fields from trip
    Object.keys(tripData).forEach(key => {
      if (key.startsWith("diesel")) {
        (data as any)[key] = (tripData as any)[key];
      }
    });
    return data;
  };

  // ─── Sheet Data state ───────────────────────────────────────────
  const [sheetData, setSheetData] = useState<SheetData>(() => buildSheetDataFromTrip(trip));

  // ─── Reset sheetData when trip changes ──────────────────────────
  const prevTripId = useRef<number>(trip.id);
  useEffect(() => {
    if (trip.id !== prevTripId.current) {
      prevTripId.current = trip.id;
      setSheetData(buildSheetDataFromTrip(trip));
      setIsSubmittedLocal(false);
      setErrorMsg("");
      setIsLocalEditing(false);
    }
  }, [trip.id, trip]);

  // ─── Compute Distance & Average ──────────────────────────────────
  const openingMeter = trip.openingMeter || 0;
  const destMeter = trip.destMeter || 0;
  const endMeterNum = Number(sheetData.endMeter);

  let totalDistanceCovered = 0;
  if (openingMeter > 0 && endMeterNum > 0 && endMeterNum > openingMeter) {
    totalDistanceCovered = endMeterNum - openingMeter;
  }

  // ─── Dynamically compute diesel totals from all rows ────────────
  const getDieselIndices = (data: SheetData): number[] => {
    const indices: number[] = [];
    Object.keys(data).forEach(key => {
      const match = key.match(/^dieselLtr(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (!indices.includes(idx)) indices.push(idx);
      }
    });
    return indices.sort((a,b) => a - b);
  };

  const dieselIndices = getDieselIndices(sheetData).filter((idx) => sheetData[`dieselSubmitted${idx}`]);
  const dieselAmounts = getDieselIndices(sheetData).map(idx => {
    const ltr = Number(sheetData[`dieselLtr${idx}`] || 0);
    const rate = Number(sheetData[`dieselRate${idx}`] || 0);
    return ltr * rate;
  });
  const totalDieselAmount = dieselIndices.reduce((acc, idx) => {
    const ltr = Number(sheetData[`dieselLtr${idx}`] || 0);
    const rate = Number(sheetData[`dieselRate${idx}`] || 0);
    return acc + ltr * rate;
  }, 0);
  const totalDieselLiters = dieselIndices.reduce((acc, idx) => acc + Number(sheetData[`dieselLtr${idx}`] || 0), 0);

  let averageKmLtr = "";
  if (totalDistanceCovered > 0 && totalDieselLiters > 0) {
    averageKmLtr = (totalDistanceCovered / totalDieselLiters).toFixed(2);
  }

  const savedSheetRef = useRef(JSON.stringify(buildSheetDataFromTrip(trip)));
  const hasUnsavedChanges = JSON.stringify(sheetData) !== savedSheetRef.current;

  // ─── Handle field changes in React state only ──────────────────
  const handleChange = (field: string, value: any) => {
    setErrorMsg("");
    setSheetData((prev) => ({ ...prev, [field]: value }));
  };

  const applyBatchUpdates = (updates: Record<string, any>) => {
    setErrorMsg("");
    setSheetData((prev) => ({ ...prev, ...updates }));
  };

  // ─── Compute derived values ──────────────────────────────────────
  const totalExpenses1 =
    Number(sheetData.meals || 0) +
    Number(sheetData.loading || 0) +
    Number(sheetData.mealsTiffin || 0) +
    Number(sheetData.vehicleMaintenance || 0) +
    Number(sheetData.othersRC || 0);

  const totalExpenses2 =
    Number(sheetData.others1Amt || 0) +
    Number(sheetData.others2Amt || 0) +
    Number(sheetData.others3Amt || 0) +
    Number(sheetData.others4Amt || 0) +
    Number(sheetData.others5Amt || 0);

  const totalAllExpenses = totalExpenses1 + totalExpenses2;

  const remainingBalance =
    Number(trip.advanceAmount || 0) - totalAllExpenses - totalDieselAmount;

  const highestDieselMeter = dieselIndices.reduce((max, idx) => {
    const val = Number(sheetData[`dieselMeter${idx}`] || 0);
    return val > max ? val : max;
  }, 0);
  const requiredMinEndMeter = Math.max(openingMeter, destMeter, highestDieselMeter, 0);
  const endMeterInvalid =
    sheetData.endMeter !== "" &&
    sheetData.endMeter != null &&
    requiredMinEndMeter > 0 &&
    Number(sheetData.endMeter) <= requiredMinEndMeter;

  const EXPENSE_KEYS = [
    "meals",
    "loading",
    "mealsTiffin",
    "vehicleMaintenance",
    "othersRC",
    "others1Amt",
    "others2Amt",
    "others3Amt",
    "others4Amt",
    "others5Amt",
  ] as const;

  const positiveExpense = (value: unknown): number | undefined => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  };

  const prepareFinalPayload = (stepSubmitted = false) => {
    const expenses: Record<string, number> = {};
    for (const key of EXPENSE_KEYS) {
      const n = positiveExpense(sheetData[key]);
      if (n != null) expenses[key] = n;
    }

    return {
      ...expenses,
      endMeter: sheetData.endMeter,
      closingMeter: Number(sheetData.endMeter) || 0,
      destinationTolls: sheetData.destinationTolls === "" ? 0 : Number(sheetData.destinationTolls),
      deliveryTolls: sheetData.destinationTolls === "" ? 0 : Number(sheetData.destinationTolls),
      remarks: sheetData.remarks,
      totalExpenses: totalAllExpenses,
      totalDieselAmount,
      remainingBalance,
      pickupTolls: trip.pickupTolls || 0,
      expensesStepSubmitted: stepSubmitted,
      endStepSubmitted: stepSubmitted,
    };
  };

  // ─── Save progress (manual) ──────────────────────────────────────
  const handleSaveProgress = async () => {
    if (!saveEndProgress) return;
    setIsSubmitting(true);
    const payload = prepareFinalPayload(false);
    const success = await saveEndProgress(payload as Partial<Trip>);
    if (success) {
      savedSheetRef.current = JSON.stringify(sheetData);
      setToast({ message: "End details saved successfully.", type: "success" });
    } else {
      setToast({ message: "Unable to save end details. Please try again.", type: "error" });
    }
    setIsSubmitting(false);
  };

  // ─── Initiate submit ──────────────────────────────────────────────
  const handleInitiateSubmit = () => {
    const endMeterNum = Number(sheetData.endMeter);
    if (sheetData.endMeter === "" || sheetData.endMeter === null || isNaN(endMeterNum)) {
      setErrorMsg("End Meter Reading is required.");
      return;
    }

    const actualDestMeter = destMeter || 0;
    let highestDieselMeter = 0;
    Object.keys(sheetData).forEach((key) => {
      if (key.startsWith("dieselMeter")) {
        const idx = key.replace("dieselMeter", "");
        if (!sheetData[`dieselSubmitted${idx}`]) return;
        const val = Number(sheetData[key]);
        if (!isNaN(val) && val > highestDieselMeter) highestDieselMeter = val;
      }
    });
    let requiredMinMeter = openingMeter;
    let requiredMinLabel = `Start Meter (${openingMeter})`;
    if (actualDestMeter > requiredMinMeter) {
      requiredMinMeter = actualDestMeter;
      requiredMinLabel = `Dest Meter (${actualDestMeter})`;
    }
    if (highestDieselMeter > requiredMinMeter) {
      requiredMinMeter = highestDieselMeter;
      requiredMinLabel = `Diesel Entry (${highestDieselMeter})`;
    }
    if (requiredMinMeter > 0 && endMeterNum <= requiredMinMeter) {
      setErrorMsg(`Meter reading must be greater than ${requiredMinMeter}.`);
      return;
    }

    const destTollsNum = Number(sheetData.destinationTolls);
    if (sheetData.destinationTolls === "" || sheetData.destinationTolls === null || isNaN(destTollsNum) || destTollsNum < 0) {
      setErrorMsg("Total Toll Gates (Destination) must be 0 or greater.");
      return;
    }

    const draftCount = getDieselIndices(sheetData).filter((idx) => {
      if (sheetData[`dieselSubmitted${idx}`]) return false;
      return Boolean(
        sheetData[`dieselLtr${idx}`] ||
        sheetData[`dieselRate${idx}`] ||
        sheetData[`dieselMeter${idx}`] ||
        sheetData[`dieselBunk${idx}`] ||
        sheetData[`dieselImage${idx}`]
      );
    }).length;

    const proceedToFinalConfirm = () => {
      setConfirmation({
        isOpen: true,
        title: isSubmitted ? "Update Expenses Sheet" : "Submit Expenses Sheet",
        message: isSubmitted
          ? "Are you sure you want to update the submitted expenses sheet with recent changes?"
          : "Are you sure you want to submit this expenses sheet? This will mark the trip as completed and lock current entries.",
        confirmLabel: isSubmitted ? "Yes, Update" : "Yes, Submit",
        cancelLabel: "Cancel",
        type: "info",
        onConfirm: () => {
          setConfirmation((prev) => ({ ...prev, isOpen: false }));
          executeSubmit();
        },
        onCancel: () => setConfirmation((prev) => ({ ...prev, isOpen: false })),
      });
    };

    if (draftCount > 0) {
      setConfirmation({
        isOpen: true,
        title: "Diesel bills are still in draft",
        message:
          draftCount === 1
            ? "Diesel bills are still in draft. Only submitted diesel bills are saved. Do you want to submit Step 5 without submitting these draft bills? You have 1 diesel bill that has not been submitted."
            : `Diesel bills are still in draft. Only submitted diesel bills are saved. Do you want to submit Step 5 without submitting these draft bills? You have ${draftCount} diesel bills in draft.`,
        confirmLabel: "Submit Step 5 Without Draft",
        cancelLabel: draftCount === 1 ? "Go Back" : "Review Drafts",
        type: "warning",
        onConfirm: () => {
          setConfirmation((prev) => ({ ...prev, isOpen: false }));
          proceedToFinalConfirm();
        },
        onCancel: () => setConfirmation((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    proceedToFinalConfirm();
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const finalData = prepareFinalPayload(true);
      let success = true;
      const submitFn = submitExpensesStep || submitStartStep;
      if (typeof submitFn === "function") {
        const result = await submitFn(finalData as any);
        if (result === false) success = false;
      }
      if (success) {
        setIsLocalEditing(false);
        setIsSubmittedLocal(true);
        setToast({ message: "Step 5 submitted successfully.", type: "success" });
      } else {
        // Single inline presentation — the inline error box below shows the
        // same message; do NOT duplicate it through the notice toast.
        setErrorMsg("Failed to save step details.");
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      setErrorMsg(err?.message || "Failed to save step details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseView = () => {
    if (isLocalEditing) {
      setIsLocalEditing(false);
      setToast({ message: "Edit cancelled.", type: "info" });
      return;
    }
    // Cancel active wizard — discard unsaved Step 5 only.
    if (clearForm) {
      clearForm();
      return;
    }
    onCancel?.();
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .sheet-joined-table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 0.5rem; overflow: hidden; }
        .sheet-joined-table th, .sheet-joined-table td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 0.8125rem; line-height: 1.2; text-align: left !important; }
        .sheet-joined-table input[type="number"]::-webkit-inner-spin-button,
        .sheet-joined-table input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        .sheet-joined-table input[type="number"] { -moz-appearance: textfield !important; appearance: textfield !important; }
        .sheet-joined-table input { width: 100%; outline: none; background: transparent; font-size: 0.8125rem; color: #0f172a; font-weight: 500; padding: 2px; text-align: left !important; }
      `}</style>

      {isSubmitted && !isLocalEditing ? (
        // ─── Locked View ──────────────────────────────────────────────
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0">5</span>
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">{TRIP_STEP_DEFINITIONS[4].title.toUpperCase()} (SUBMITTED)</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCloseView}
                className="bg-white hover:bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
                title="Close Trip"
                aria-label="Close Trip"
              >
                <X size={14} />
              </button>
              {canEdit && (
                <button
                  onClick={() => setIsLocalEditing(true)}
                  className="bg-white hover:bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-slate-700 transition-all active:scale-95"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              )}
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap">
                Submitted & Locked
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Date & Time</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">{sheetData.submittedAtTimestamp || (trip as any).expensesStepSubmittedAt || "--"}</p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Vehicle No</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">{trip.vehicleNo || "--"}</p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Advance</p>
              <p className="text-xs font-semibold text-emerald-700 mt-0.5">₹{Number(trip.advanceAmount || 0).toFixed(2)}</p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Total Expenses</p>
              <p className="text-xs font-semibold text-red-600 mt-0.5">₹{totalAllExpenses.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Total Diesel</p>
              <p className="text-xs font-semibold text-blue-600 mt-0.5">₹{totalDieselAmount.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Remaining Balance</p>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">₹{remainingBalance.toFixed(2)}</p>
            </div>
          </div>
          <GeneralExpensesTable
            sheetData={sheetData}
            handleChange={handleChange}
            pickupTolls={trip.pickupTolls || 0}
            totalExpenses1={totalExpenses1}
            totalExpenses2={totalExpenses2}
            totalAllExpenses={totalAllExpenses}
            totalDistanceCovered={totalDistanceCovered}
            averageKmLtr={averageKmLtr}
            openingMeter={openingMeter}
            destMeter={destMeter}
            trip={trip}
            readOnly
            onMeterNotice={(msg) => setToast({ message: msg, type: "warning" })}
          />
          <DieselExpensesTable
            tripId={trip.id}
            sheetData={sheetData}
            handleChange={handleChange}
            applyBatchUpdates={applyBatchUpdates}
            dieselAmounts={dieselAmounts}
            totalDieselAmount={totalDieselAmount}
            destMeter={destMeter}
            readOnly
          />
        </div>
      ) : (
        // ─── Editable View ────────────────────────────────────────────
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0">5</span>
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">{TRIP_STEP_DEFINITIONS[4].title.toUpperCase()}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCloseView}
                className="bg-white hover:bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
                title="Close Trip"
                aria-label="Close Trip"
              >
                <X size={14} />
              </button>
              <span className="text-[11px] text-slate-700 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 whitespace-nowrap">Editable View</span>
            </div>
          </div>

          <GeneralExpensesTable
            key={`general-${trip.id}`}
            sheetData={sheetData}
            handleChange={handleChange}
            pickupTolls={trip.pickupTolls || 0}
            totalExpenses1={totalExpenses1}
            totalExpenses2={totalExpenses2}
            totalAllExpenses={totalAllExpenses}
            totalDistanceCovered={totalDistanceCovered}
            averageKmLtr={averageKmLtr}
            openingMeter={openingMeter}
            destMeter={destMeter}
            trip={trip}
            onMeterNotice={(msg) => setToast({ message: msg, type: "warning" })}
          />

          <DieselExpensesTable
            key={`diesel-${trip.id}`}
            tripId={trip.id}
            sheetData={sheetData}
            handleChange={handleChange}
            applyBatchUpdates={applyBatchUpdates}
            dieselAmounts={dieselAmounts}
            totalDieselAmount={totalDieselAmount}
            destMeter={destMeter}
          />

          {errorMsg ? (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg">
              {errorMsg}
            </div>
          ) : null}

          <div className="border border-slate-200 rounded-lg p-2.5 bg-white">
            <textarea
              rows={2}
              value={sheetData.remarks}
              onChange={(e) => {
                setErrorMsg("");
                const val = e.target.value;
                const updated = { ...sheetData, remarks: val };
                setSheetData(updated);
              }}
              placeholder="Enter optional trip notes or destination remarks..."
              className="w-full text-xs font-medium text-slate-800 outline-none bg-transparent resize-none placeholder:text-slate-400 text-left"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 font-bold text-xs text-slate-900">
            <div>Total Expenses: <span className="text-red-600">₹{totalAllExpenses.toFixed(2)}</span></div>
            <div>Total Diesel: <span className="text-blue-600">₹{totalDieselAmount.toFixed(2)}</span></div>
            <div>Balance Remaining: <span className="text-emerald-600">₹{remainingBalance.toFixed(2)}</span></div>
          </div>

          <WizardStepNotice
            notice={toast ? { type: toast.type === "warning" ? "info" : toast.type, message: toast.message } : null}
            dirty={hasUnsavedChanges}
          />
          <WizardActionBar
            onCancel={handleCloseView}
            onSave={saveEndProgress ? handleSaveProgress : undefined}
            onSubmit={handleInitiateSubmit}
            busy={isSubmitting}
            saveDisabled={!hasUnsavedChanges}
            submitDisabled={endMeterInvalid}
            submitLabel={isSubmitted ? "Update End Details" : "Submit End Details"}
          />
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirmLabel}
        cancelLabel={confirmation.cancelLabel}
        type={confirmation.type}
        onConfirm={confirmation.onConfirm}
        onCancel={confirmation.onCancel || (() => setConfirmation((prev) => ({ ...prev, isOpen: false })))}
      />
    </>
  );
}