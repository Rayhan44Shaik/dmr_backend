import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Clock, Pencil, X, CheckCircle2, Save, Send, Loader2, 
  AlertTriangle, RefreshCw, LogOut, CheckCircle, AlertCircle 
} from "lucide-react";
import type { Trip } from "../modules/operations/vehicle-trips/types/trip";


interface Props {
  trip: Trip;
  setTrip?: React.Dispatch<React.SetStateAction<Trip>>;
  updateTrip: (updates: Partial<Trip>, persist?: boolean, silent?: boolean) => void;
  submitStartStep?: (data: Partial<Trip>) => boolean | Promise<boolean>;
  vehicleOptions?: { id: number; vehicleNumber: string }[];
  editable?: boolean;
  canEdit?: boolean;
  onCancel?: () => void;
  clearForm?: () => void;
}

// ─── Confirmation Modal Component ───────────────────────────────────
function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = "Yes, Proceed",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  type = "warning",
}: {
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
  const bgGradient = type === "warning"
    ? "from-amber-50 to-orange-50"
    : "from-emerald-50 to-teal-50";

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
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-600 transition-all shadow-xs"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-lg text-sm font-bold text-white shadow-xs transition-all active:scale-[0.98] ${
              type === "warning"
                ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast Notification Component ─────────────────────────────────────
function Toast({ 
  message, 
  type = "success", 
  onClose 
}: { 
  message: string; 
  type?: "success" | "error" | "warning" | "info"; 
  onClose: () => void 
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: "bg-emerald-50 border-emerald-300 text-emerald-900 shadow-emerald-100/50",
    warning: "bg-amber-50 border-amber-300 text-amber-300 text-amber-900 shadow-amber-100/50",
    info: "bg-blue-50 border-blue-300 text-blue-900 shadow-blue-100/50",
    error: "bg-rose-50 border-rose-300 text-rose-900 shadow-rose-100/50",
  }[type];

  const icon = type === "success" ? (
    <CheckCircle size={18} className="text-emerald-600 flex-shrink-0" />
  ) : type === "warning" ? (
    <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
  ) : type === "info" ? (
    <AlertCircle size={18} className="text-blue-600 flex-shrink-0" />
  ) : (
    <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
  );

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 border text-xs sm:text-sm font-semibold ${styles}`}>
        {icon}
        <span>{message}</span>
        <button 
          onClick={onClose} 
          className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

export default function StepExpenses({
  trip,
  updateTrip,
  submitStartStep,
  editable = false,
  canEdit = true,
  onCancel,
  clearForm,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // ─── Continuous Saving & Toast State ─────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" | "info" } | null>(null);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);

  // ─── Confirmation Modal State ────────────────────────────────────
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

  const pickupTolls = trip.pickupTolls ?? 0;

  const getCurrentFormattedDateTime = () => {
    return new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const [sheetData, setSheetData] = useState({
    vehicleNo: trip.vehicleNo || "AP-39-VD-6799",
    submittedAtTimestamp:
      (trip as any).submittedAtTimestamp || (trip as any).submittedAt || "",
    advance: (trip.advanceAmount ?? 1000) as string | number,

    // Expenses Group 1
    meals: ((trip as any).meals ?? 100) as string | number,
    loading: ((trip as any).loading ?? "") as string | number,
    mealsTiffin: ((trip as any).mealsTiffin ?? 50) as string | number,
    vehicleMaintenance: ((trip as any).vehicleMaintenance ?? "") as string | number,
    othersRC: ((trip as any).othersRC ?? "") as string | number, // Tea field

    // Expenses Group 2
    others1Note: (trip as any).others1Note || "Driver (R)",
    others1Amt: ((trip as any).others1Amt ?? 50) as string | number,
    others2Note: (trip as any).others2Note || "Supervisor (P)",
    others2Amt: ((trip as any).others2Amt ?? "") as string | number,
    others3Note: (trip as any).others3Note || "Others",
    others3Amt: ((trip as any).others3Amt ?? "") as string | number,
    others4Note: (trip as any).others4Note || "Others 1",
    others4Amt: ((trip as any).others4Amt ?? "") as string | number,
    others5Note: (trip as any).others5Note || "Others 5",
    others5Amt: ((trip as any).others5Amt ?? "") as string | number,

    // Odometer
    startMeter: Number((trip as any).startMeter ?? trip.openingMeter ?? 183821),
    endMeter: ((trip as any).endMeter ?? (trip as any).endingReading ?? 184321) as string | number,

    // Tolls (Destination editable integer)
    destinationTolls: ((trip as any).destinationTolls ?? (trip as any).dropTolls ?? "") as string | number,

    // Diesel Details (6 Entries Side-by-Side with Liters, Rates, Meters, Bunks)
    dieselLtr1: ((trip as any).dieselLtr1 ?? "") as string | number,
    dieselRate1: ((trip as any).dieselRate1 ?? "") as string | number,
    dieselMeter1: ((trip as any).dieselMeter1 ?? "") as string | number,
    dieselBunk1: (trip as any).dieselBunk1 || "",

    dieselLtr2: ((trip as any).dieselLtr2 ?? "") as string | number,
    dieselRate2: ((trip as any).dieselRate2 ?? "") as string | number,
    dieselMeter2: ((trip as any).dieselMeter2 ?? "") as string | number,
    dieselBunk2: (trip as any).dieselBunk2 || "",

    dieselLtr3: ((trip as any).dieselLtr3 ?? "") as string | number,
    dieselRate3: ((trip as any).dieselRate3 ?? "") as string | number,
    dieselMeter3: ((trip as any).dieselMeter3 ?? "") as string | number,
    dieselBunk3: (trip as any).dieselBunk3 || "",

    dieselLtr4: ((trip as any).dieselLtr4 ?? "") as string | number,
    dieselRate4: ((trip as any).dieselRate4 ?? "") as string | number,
    dieselMeter4: ((trip as any).dieselMeter4 ?? "") as string | number,
    dieselBunk4: (trip as any).dieselBunk4 || "",

    dieselLtr5: ((trip as any).dieselLtr5 ?? "") as string | number,
    dieselRate5: ((trip as any).dieselRate5 ?? "") as string | number,
    dieselMeter5: ((trip as any).dieselMeter5 ?? "") as string | number,
    dieselBunk5: (trip as any).dieselBunk5 || "",

    dieselLtr6: ((trip as any).dieselLtr6 ?? "") as string | number,
    dieselRate6: ((trip as any).dieselRate6 ?? "") as string | number,
    dieselMeter6: ((trip as any).dieselMeter6 ?? "") as string | number,
    dieselBunk6: (trip as any).dieselBunk6 || "",

    // Remarks
    remarks: (trip as any).remarks || "",
  });

  const isSubmitted =
    trip.startStepSubmitted ||
    Boolean((trip as any).submittedAtTimestamp || (trip as any).submittedAt);

  // Calculations
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

  const totalDistanceCovered =
    sheetData.endMeter !== ""
      ? Math.max(0, Number(sheetData.endMeter) - Number(sheetData.startMeter))
      : 0;

  const dieselAmt1 = Number(sheetData.dieselLtr1 || 0) * Number(sheetData.dieselRate1 || 0);
  const dieselAmt2 = Number(sheetData.dieselLtr2 || 0) * Number(sheetData.dieselRate2 || 0);
  const dieselAmt3 = Number(sheetData.dieselLtr3 || 0) * Number(sheetData.dieselRate3 || 0);
  const dieselAmt4 = Number(sheetData.dieselLtr4 || 0) * Number(sheetData.dieselRate4 || 0);
  const dieselAmt5 = Number(sheetData.dieselLtr5 || 0) * Number(sheetData.dieselRate5 || 0);
  const dieselAmt6 = Number(sheetData.dieselLtr6 || 0) * Number(sheetData.dieselRate6 || 0);

  const totalDieselLiters =
    Number(sheetData.dieselLtr1 || 0) +
    Number(sheetData.dieselLtr2 || 0) +
    Number(sheetData.dieselLtr3 || 0) +
    Number(sheetData.dieselLtr4 || 0) +
    Number(sheetData.dieselLtr5 || 0) +
    Number(sheetData.dieselLtr6 || 0);

  const totalDieselAmount =
    dieselAmt1 + dieselAmt2 + dieselAmt3 + dieselAmt4 + dieselAmt5 + dieselAmt6;

  const averageKmLtr =
    totalDieselLiters > 0
      ? (totalDistanceCovered / totalDieselLiters).toFixed(2)
      : "0.00";

  const remainingBalance =
    Number(sheetData.advance || 0) - totalAllExpenses - totalDieselAmount;

  const prepareFinalPayload = (isStepSubmitted = false) => {
    const existingTimestamp =
      (trip as any).submittedAtTimestamp ||
      (trip as any).submittedAt ||
      sheetData.submittedAtTimestamp;
      
    const capturedTimestamp = existingTimestamp || getCurrentFormattedDateTime();

    return {
      ...sheetData,
      date: capturedTimestamp,
      submittedAtTimestamp: capturedTimestamp,
      totalExpenses: totalAllExpenses,
      totalDieselAmount,
      totalDistanceCovered,
      averageKmLtr,
      remainingBalance,
      pickupTolls,
      destinationTolls: sheetData.destinationTolls === "" ? 0 : Number(sheetData.destinationTolls),
      advanceAmount: sheetData.advance === "" ? 0 : Number(sheetData.advance),
      openingMeter: Number(sheetData.startMeter),
      startStepSubmitted: isStepSubmitted,
    };
  };

  // ─── Auto-Save Trigger Effect ─────────────────────────────────────
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    
    if (isSavingRef.current || (isSubmitted && !isLocalEditing) || !updateTrip) {
      setIsAutoSaving(false);
      return;
    }

    setIsAutoSaving(true);
    autoSaveTimeout.current = setTimeout(() => {
      if (!isSavingRef.current && updateTrip) {
        const payload = prepareFinalPayload(isSubmitted);
        updateTrip(payload as any, true, true);
      }
      setIsAutoSaving(false);
      autoSaveTimeout.current = null;
    }, 1000);
  }, [sheetData, updateTrip, isSubmitted, isLocalEditing]);

  useEffect(() => {
    if (!isSubmitted || isLocalEditing) {
      triggerAutoSave();
    }
    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    };
  }, [sheetData, triggerAutoSave, isSubmitted, isLocalEditing]);

  const handleChange = (field: string, value: any) => {
    setErrorMsg("");
    const updated = { ...sheetData, [field]: value };
    setSheetData(updated);

    if (typeof updateTrip === "function") {
      updateTrip({
        ...updated,
        advanceAmount: updated.advance === "" ? 0 : Number(updated.advance),
        openingMeter: Number(updated.startMeter),
        destinationTolls: updated.destinationTolls === "" ? 0 : Number(updated.destinationTolls),
      } as any, false, true);
    }
  };

  // ─── Manual Save Progress Handler ──────────────────────────────
  const handleSaveProgress = () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
      autoSaveTimeout.current = null;
      setIsAutoSaving(false);
    }

    try {
      const payload = prepareFinalPayload(isSubmitted);
      if (updateTrip) {
        updateTrip(payload as any, true, false);
      }
      setToast({ message: "Expenses progress saved successfully!", type: "success" });
    } catch (error) {
      console.error("Save progress error:", error);
      setToast({ message: "Failed to save progress. Please try again.", type: "error" });
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        isSavingRef.current = false;
      }, 100);
    }
  };

  // ─── Submit / Update Handler with Confirmation ──────────────────
  const handleInitiateSubmit = () => {
    const endMeterNum = Number(sheetData.endMeter);

    if (sheetData.endMeter === "" || isNaN(endMeterNum)) {
      setErrorMsg("End Meter Reading is required.");
      setToast({ message: "End Meter Reading is required.", type: "warning" });
      return;
    }

    if (endMeterNum < Number(sheetData.startMeter)) {
      const msg = `End Meter Reading (${sheetData.endMeter}) must be greater than or equal to Start Meter Reading (${sheetData.startMeter}).`;
      setErrorMsg(msg);
      setToast({ message: msg, type: "warning" });
      return;
    }

    if (sheetData.destinationTolls === "" || isNaN(Number(sheetData.destinationTolls))) {
      setErrorMsg("Total Toll Gates (Destination) is required.");
      setToast({ message: "Total Toll Gates (Destination) is required.", type: "warning" });
      return;
    }

    setConfirmation({
      isOpen: true,
      title: isSubmitted ? "Update Expenses Sheet" : "Submit Expenses Sheet",
      message: isSubmitted 
        ? "Are you sure you want to update the submitted expenses sheet with recent changes?" 
        : "Are you sure you want to submit this expenses sheet? This will lock current entries.",
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

  const executeSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const finalData = prepareFinalPayload(true);
      let success = true;

      if (typeof submitStartStep === "function") {
        const result = await submitStartStep(finalData as any);
        if (result === false) success = false;
      }

      if (success) {
        if (typeof updateTrip === "function") {
          updateTrip(finalData as any, true, false);
        }

        setSheetData(finalData);
        setIsLocalEditing(false);
        setShowSuccessModal(true);
        setToast({ message: "Expenses sheet successfully submitted!", type: "success" });
      } else {
        setErrorMsg("Failed to save step details. Please try again.");
        setToast({ message: "Failed to save step details.", type: "error" });
      }
    } catch (err: any) {
      console.error("Failed to submit step:", err);
      setErrorMsg(err?.message || "Failed to save step details.");
      setToast({ message: err?.message || "Failed to save step details.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseView = () => {
    if (isLocalEditing) {
      setIsLocalEditing(false);
      setToast({ message: "Edit cancelled.", type: "info" });
    } else if (onCancel) {
      onCancel();
    }
  };

  return (
    <>
      <style>{`
        .sheet-joined-table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .sheet-joined-table th, 
        .sheet-joined-table td {
          border: 1px solid #e2e8f0;
          padding: 6px 8px;
          font-size: 0.8125rem;
          line-height: 1.2;
          text-align: left !important;
        }
        .sheet-joined-table input[type="number"]::-webkit-inner-spin-button,
        .sheet-joined-table input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        .sheet-joined-table input[type="number"] {
          -moz-appearance: textfield !important;
          appearance: textfield !important;
        }
        .sheet-joined-table input {
          width: 100%;
          outline: none;
          background: transparent;
          font-size: 0.8125rem;
          color: #0f172a;
          font-weight: 500;
          padding: 2px;
          text-align: left !important;
        }
        .auto-save-indicator {
          font-size: 0.65rem;
          color: #059669;
          display: flex;
          align-items: center;
          gap: 4px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* SUCCESS POPUP MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-lg space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Expenses Saved!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Expenses Sheet & Trip details have been updated successfully.
              </p>
            </div>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                if (onCancel) onCancel();
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* SUBMITTED / LOCKED SUMMARY VIEW */}
      {isSubmitted && !isLocalEditing ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0">
                5
              </span>
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                EXPENSES SHEET (SUBMITTED)
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <button
                  onClick={() => setIsLocalEditing(true)}
                  className="bg-white hover:bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-slate-700 transition-all active:scale-95 flex items-center gap-1 text-xs font-semibold"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap">
                Completed & Saved
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Date & Time</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">
                {sheetData.submittedAtTimestamp || "--"}
              </p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Vehicle No</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">
                {sheetData.vehicleNo}
              </p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Total Expenses</p>
              <p className="text-xs font-semibold text-red-600 mt-0.5">
                ₹{totalAllExpenses.toFixed(2)}
              </p>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/80 p-2.5 rounded-lg">
              <p className="text-[11px] text-slate-500 font-medium">Remaining Balance</p>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                ₹{remainingBalance.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* EDITABLE FORM VIEW */
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0">
                5
              </span>
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                EXPENSES SHEET
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {isAutoSaving && (
                <span className="auto-save-indicator text-emerald-600 text-xs flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Saving...
                </span>
              )}
              <span className="text-[11px] text-slate-700 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 whitespace-nowrap">
                Editable View
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* TABLE WITH 7 COLUMNS */}
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="sheet-joined-table bg-white min-w-[750px]">
              <tbody>
                {/* DATE, VEHICLE & ADVANCE */}
                <tr className="bg-slate-50/70">
                  <td colSpan={3}>
                    <div className="flex items-center gap-1.5 justify-start">
                      <span className="font-bold text-slate-800 text-xs flex items-center gap-1 shrink-0">
                        <Clock size={13} className="text-slate-500" />
                        Date & Time :
                      </span>
                      <span className="font-semibold text-slate-900 text-xs">
                        {sheetData.submittedAtTimestamp || "Captured on first submit"}
                      </span>
                    </div>
                  </td>
                  <td colSpan={2}>
                    <div className="flex items-center gap-1 justify-start">
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">
                        Vehicle No :
                      </span>
                      <input
                        type="text"
                        value={sheetData.vehicleNo}
                        onChange={(e) => handleChange("vehicleNo", e.target.value)}
                        className="font-semibold text-slate-900 text-xs uppercase"
                      />
                    </div>
                  </td>
                  <td colSpan={2}>
                    <div className="flex items-center gap-1 justify-start">
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">
                        Advance ₹ :
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={sheetData.advance}
                        onChange={(e) =>
                          handleChange(
                            "advance",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="font-semibold text-slate-900 text-xs"
                      />
                    </div>
                  </td>
                </tr>

                {/* EXPENSES ROWS */}
                <tr>
                  <td className="font-medium text-slate-700">Meals</td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.meals}
                      onChange={(e) =>
                        handleChange(
                          "meals",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="text"
                      placeholder="Driver (R)"
                      value={sheetData.others1Note}
                      onChange={(e) => handleChange("others1Note", e.target.value)}
                      className="text-slate-600"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.others1Amt}
                      onChange={(e) =>
                        handleChange(
                          "others1Amt",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">Loading</td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.loading}
                      onChange={(e) =>
                        handleChange(
                          "loading",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="text"
                      placeholder="Supervisor (P)"
                      value={sheetData.others2Note}
                      onChange={(e) => handleChange("others2Note", e.target.value)}
                      className="text-slate-600"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.others2Amt}
                      onChange={(e) =>
                        handleChange(
                          "others2Amt",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">Meals / Tiffin</td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.mealsTiffin}
                      onChange={(e) =>
                        handleChange(
                          "mealsTiffin",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="text"
                      placeholder="Others"
                      value={sheetData.others3Note}
                      onChange={(e) => handleChange("others3Note", e.target.value)}
                      className="text-slate-600"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.others3Amt}
                      onChange={(e) =>
                        handleChange(
                          "others3Amt",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">Vehicle Maintenance</td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.vehicleMaintenance}
                      onChange={(e) =>
                        handleChange(
                          "vehicleMaintenance",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="text"
                      placeholder="Others 1"
                      value={sheetData.others4Note}
                      onChange={(e) => handleChange("others4Note", e.target.value)}
                      className="text-slate-600"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.others4Amt}
                      onChange={(e) =>
                        handleChange(
                          "others4Amt",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">Tea</td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.othersRC}
                      onChange={(e) =>
                        handleChange(
                          "othersRC",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="text"
                      placeholder="Others 5"
                      value={sheetData.others5Note}
                      onChange={(e) => handleChange("others5Note", e.target.value)}
                      className="text-slate-600"
                    />
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sheetData.others5Amt}
                      onChange={(e) =>
                        handleChange(
                          "others5Amt",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="font-medium"
                    />
                  </td>
                </tr>

                {/* EXPENSES TOTALS ROW */}
                <tr className="bg-slate-50 font-bold text-slate-800 text-xs">
                  <td>TOTAL (₹)</td>
                  <td colSpan={2} className="text-slate-900 pl-1">{totalExpenses1.toFixed(2)}</td>
                  <td colSpan={2}>TOTAL (₹)</td>
                  <td colSpan={2} className="text-slate-900 pl-1">{totalExpenses2.toFixed(2)}</td>
                </tr>

                {/* ODOMETER */}
                <tr>
                  <td className="font-medium text-slate-700">Start Meter Reading</td>
                  <td colSpan={2} className="font-semibold text-slate-900 pl-1 select-none bg-slate-100/50">
                    {sheetData.startMeter}
                  </td>
                  <td colSpan={2} className="font-medium text-slate-700">Total Distance Covered (KM)</td>
                  <td colSpan={2} className="font-semibold text-slate-900 pl-1 bg-slate-50/50">
                    {totalDistanceCovered}
                  </td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">
                    End Meter Reading <span className="text-red-500">*</span>
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      required
                      placeholder="0.00"
                      value={sheetData.endMeter}
                      onChange={(e) => handleChange("endMeter", e.target.value)}
                      className="font-semibold text-blue-600"
                    />
                  </td>
                  <td colSpan={2} className="font-medium text-slate-700">Average (KM/Ltr)</td>
                  <td colSpan={2} className="font-semibold text-blue-600 pl-1 bg-slate-50/50">
                    {averageKmLtr}
                  </td>
                </tr>

                {/* TOLLS */}
                <tr className="bg-slate-50/40">
                  <td className="font-medium text-slate-700">
                    Total Toll Gates (Pickup) <span className="text-red-500">*</span>
                  </td>
                  <td colSpan={2} className="font-semibold text-slate-900 pl-1 select-none bg-slate-100/50">
                    {pickupTolls}
                  </td>
                  <td colSpan={2} className="font-medium text-slate-700">
                    Total Toll Gates (Destination) <span className="text-red-500">*</span>
                  </td>
                  <td colSpan={2} className="p-0">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      required
                      placeholder="0"
                      value={sheetData.destinationTolls}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleChange(
                          "destinationTolls",
                          val === "" ? "" : Math.floor(Number(val))
                        );
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="font-semibold text-blue-600"
                    />
                  </td>
                </tr>

                {/* DIESEL SECTION HEADER */}
                <tr className="bg-slate-50 font-bold text-slate-700 text-[11px] tracking-wider">
                  <td className="py-1">DIESEL DETAILS</td>
                  <td className="uppercase py-1 text-center">ENTRY 1</td>
                  <td className="uppercase py-1 text-center">ENTRY 2</td>
                  <td className="uppercase py-1 text-center">ENTRY 3</td>
                  <td className="uppercase py-1 text-center">ENTRY 4</td>
                  <td className="uppercase py-1 text-center">ENTRY 5</td>
                  <td className="uppercase py-1 text-center">ENTRY 6</td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">Diesel (Ltr)</td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselLtr1} onChange={(e) => handleChange("dieselLtr1", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselLtr2} onChange={(e) => handleChange("dieselLtr2", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselLtr3} onChange={(e) => handleChange("dieselLtr3", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselLtr4} onChange={(e) => handleChange("dieselLtr4", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselLtr5} onChange={(e) => handleChange("dieselLtr5", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselLtr6} onChange={(e) => handleChange("dieselLtr6", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                </tr>

                <tr>
                  <td className="font-medium text-slate-700">Rate (₹ / Ltr)</td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselRate1} onChange={(e) => handleChange("dieselRate1", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselRate2} onChange={(e) => handleChange("dieselRate2", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselRate3} onChange={(e) => handleChange("dieselRate3", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselRate4} onChange={(e) => handleChange("dieselRate4", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselRate5} onChange={(e) => handleChange("dieselRate5", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" step="0.01" placeholder="0.00" value={sheetData.dieselRate6} onChange={(e) => handleChange("dieselRate6", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                </tr>

                <tr className="bg-slate-50 font-bold text-slate-800 text-xs">
                  <td>Amount (₹)</td>
                  <td className="pl-1">{dieselAmt1.toFixed(2)}</td>
                  <td className="pl-1">{dieselAmt2.toFixed(2)}</td>
                  <td className="pl-1">{dieselAmt3.toFixed(2)}</td>
                  <td className="pl-1">{dieselAmt4.toFixed(2)}</td>
                  <td className="pl-1">{dieselAmt5.toFixed(2)}</td>
                  <td className="pl-1">{dieselAmt6.toFixed(2)}</td>
                </tr>

                {/* METER READING ROW */}
                <tr>
                  <td className="font-medium text-slate-700">Meter Reading</td>
                  <td className="p-0"><input type="number" placeholder="Meter" value={sheetData.dieselMeter1} onChange={(e) => handleChange("dieselMeter1", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" placeholder="Meter" value={sheetData.dieselMeter2} onChange={(e) => handleChange("dieselMeter2", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" placeholder="Meter" value={sheetData.dieselMeter3} onChange={(e) => handleChange("dieselMeter3", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" placeholder="Meter" value={sheetData.dieselMeter4} onChange={(e) => handleChange("dieselMeter4", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" placeholder="Meter" value={sheetData.dieselMeter5} onChange={(e) => handleChange("dieselMeter5", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                  <td className="p-0"><input type="number" placeholder="Meter" value={sheetData.dieselMeter6} onChange={(e) => handleChange("dieselMeter6", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                </tr>

                {/* BUNK ADDRESS ROW */}
                <tr>
                  <td className="font-medium text-slate-700">Bunk Address</td>
                  <td className="p-0"><input type="text" placeholder="Fuel Bunk / Location" value={sheetData.dieselBunk1} onChange={(e) => handleChange("dieselBunk1", e.target.value)} /></td>
                  <td className="p-0"><input type="text" placeholder="Fuel Bunk / Location" value={sheetData.dieselBunk2} onChange={(e) => handleChange("dieselBunk2", e.target.value)} /></td>
                  <td className="p-0"><input type="text" placeholder="Fuel Bunk / Location" value={sheetData.dieselBunk3} onChange={(e) => handleChange("dieselBunk3", e.target.value)} /></td>
                  <td className="p-0"><input type="text" placeholder="Fuel Bunk / Location" value={sheetData.dieselBunk4} onChange={(e) => handleChange("dieselBunk4", e.target.value)} /></td>
                  <td className="p-0"><input type="text" placeholder="Fuel Bunk / Location" value={sheetData.dieselBunk5} onChange={(e) => handleChange("dieselBunk5", e.target.value)} /></td>
                  <td className="p-0"><input type="text" placeholder="Fuel Bunk / Location" value={sheetData.dieselBunk6} onChange={(e) => handleChange("dieselBunk6", e.target.value)} /></td>
                </tr>

                {/* REMARKS */}
                <tr>
                  <td colSpan={7} className="p-2">
                    <textarea
                      rows={2}
                      value={sheetData.remarks}
                      onChange={(e) => handleChange("remarks", e.target.value)}
                      placeholder="Enter optional trip notes or destination remarks..."
                      className="w-full text-xs font-medium text-slate-800 outline-none bg-transparent resize-none placeholder:text-slate-400 text-left"
                    />
                  </td>
                </tr>

                {/* FOOTER TOTALS */}
                <tr className="bg-slate-50/90 font-bold text-xs text-slate-900 text-left">
                  <td colSpan={2} className="py-2 pl-2">
                    Total Expenses:{" "}
                    <span className="text-red-600">₹{totalAllExpenses.toFixed(2)}</span>
                  </td>
                  <td colSpan={3} className="py-2 pl-2">
                    Total Diesel:{" "}
                    <span className="text-blue-600">₹{totalDieselAmount.toFixed(2)}</span>
                  </td>
                  <td colSpan={2} className="py-2 pl-2">
                    Balance Remaining:{" "}
                    <span className="text-emerald-600">₹{remainingBalance.toFixed(2)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ACTION BUTTONS (Mimicking UnLoadingTable control bar) */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCloseView}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
            >
              <LogOut size={15} className="text-slate-500" />
              <span>Close</span>
            </button>

            <button
              type="button"
              onClick={handleSaveProgress}
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 disabled:opacity-50"
            >
              <Save size={15} />
              <span>{isSaving ? "Saving..." : "Save Progress"}</span>
            </button>

            <button
              type="button"
              onClick={handleInitiateSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSubmitted ? <RefreshCw size={15} /> : <Send size={15} />}
              <span>{isSubmitting ? "Processing..." : isSubmitted ? "Update Expenses Sheet" : "Submit Expenses Sheet"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Confirmation Modal */}
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