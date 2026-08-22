// src/modules/operations/vehicle-trips/components/Step_5/GeneralExpensesTable.tsx

import React, { useRef } from "react";
import { Clock, Lock } from "lucide-react";
import { TRIP_FIELD_DEFINITIONS } from "../../../../../shared/trip/definitions";
import { meterMustBeGreaterThan } from "../../utils/meterValidation";

interface GeneralExpensesTableProps {
  sheetData: any;
  handleChange: (field: string, value: any) => void;
  pickupTolls: number;
  totalExpenses1: number;
  totalExpenses2: number;
  totalAllExpenses: number;
  totalDistanceCovered: number;
  averageKmLtr: string;
  openingMeter: number;
  destMeter: number;
  trip?: any;
  readOnly?: boolean;
  onMeterNotice?: (message: string) => void;
}

export default function GeneralExpensesTable({
  sheetData,
  handleChange,
  pickupTolls,
  totalExpenses1,
  totalExpenses2,
  totalAllExpenses: _totalAllExpenses,
  totalDistanceCovered,
  averageKmLtr: _averageKmLtr,
  openingMeter,
  destMeter,
  trip,
  readOnly = false,
  onMeterNotice,
}: GeneralExpensesTableProps) {
  const meterInvalidRef = useRef(false);
  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["e", "E", "+", "-"].includes(e.key)) {
      e.preventDefault();
    }
  };

  const formatZero = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
    return Number(val) === 0 ? "" : val;
  };

  // Locked start meter (from trip)
  const actualStartMeter = openingMeter || 0;
  const actualDestMeter = destMeter || 0;

  // Compute highest diesel meter from sheetData
  let highestDieselMeter = 0;
  if (sheetData) {
    Object.keys(sheetData).forEach((key) => {
      if (key.startsWith("dieselMeter")) {
        const val = Number(sheetData[key]);
        if (!isNaN(val) && val > highestDieselMeter) {
          highestDieselMeter = val;
        }
      }
    });
  }

  // Min required for endMeter
  let requiredMinMeter = actualStartMeter;
  if (actualDestMeter > requiredMinMeter) {
    requiredMinMeter = actualDestMeter;
  }
  if (highestDieselMeter > requiredMinMeter) {
    requiredMinMeter = highestDieselMeter;
  }

  const currentEndMeter = Number(sheetData.endMeter);
  const hasEndMeter = sheetData.endMeter !== undefined && sheetData.endMeter !== null && sheetData.endMeter !== "";
  const isEndMeterInvalid = hasEndMeter && actualStartMeter > 0 && currentEndMeter <= requiredMinMeter;

  // Distance & average
  const computedDistance =
    hasEndMeter && actualStartMeter > 0 && currentEndMeter > actualStartMeter
      ? currentEndMeter - actualStartMeter
      : totalDistanceCovered > 0
      ? totalDistanceCovered
      : 0;

  let totalDieselLiters = 0;
  for (let i = 1; i <= 6; i++) {
    if (!sheetData[`dieselSubmitted${i}`]) continue;
    totalDieselLiters += Number(sheetData[`dieselLtr${i}`] || 0);
  }
  const computedAverage =
    computedDistance > 0 && totalDieselLiters > 0
      ? (computedDistance / totalDieselLiters).toFixed(2)
      : null;
  const vehicleNo = trip?.vehicleNo || sheetData.vehicleNo || "";
  const advance = trip?.advanceAmount ?? sheetData.advance ?? "";
  const timestamp = trip?.expensesStepSubmittedAt || sheetData.submittedAtTimestamp || "Captured on first submit";

  return (
    <div className="rounded-xl border border-slate-200 overflow-x-auto shadow-xs bg-white">
      {/* Metadata row */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-b border-slate-200 bg-slate-50/80 text-xs">
        <div className="py-2.5 px-3 flex items-center gap-1.5 border-b md:border-b-0 md:border-r border-slate-200">
          <span className="font-bold text-slate-700 flex items-center gap-1 shrink-0">
            <Clock size={13} className="text-slate-500" />
            Date & Time :
          </span>
          <span className="font-semibold text-slate-900 truncate">
            {timestamp}
          </span>
        </div>

        <div className="py-2.5 px-3 flex items-center gap-2 border-b md:border-b-0 md:border-r border-slate-200">
          <span className="font-bold text-slate-700 whitespace-nowrap">Vehicle No :</span>
          <span className="font-bold text-blue-700 text-xs uppercase truncate">{vehicleNo || "--"}</span>
        </div>

        <div className="py-2.5 px-3 flex items-center gap-2">
          <span className="font-bold text-slate-700 whitespace-nowrap">Advance ₹ :</span>
          <span className="font-bold text-emerald-700 text-xs">
            {advance === "" || advance == null ? "--" : Number(advance).toFixed(2)}
          </span>
        </div>
      </div>

      <table className="sheet-joined-table w-full border-collapse">
        <tbody>
          <tr className="bg-slate-100/50 text-[11px] font-bold text-slate-600 border-b border-slate-200">
            <td className="py-1.5 px-3 w-[28%]">Expense Category</td>
            <td colSpan={2} className="py-1.5 px-3 w-[22%] border-r border-slate-200">
              Amount (₹)
            </td>
            <td colSpan={2} className="py-1.5 px-3 w-[28%] border-r border-slate-200">
              Expense Category
            </td>
            <td colSpan={2} className="py-1.5 px-3 w-[22%]">
              Amount (₹)
            </td>
          </tr>

          {/* Expense rows */}
          {readOnly ? (
            <>
              {[
                ["Meals", sheetData.meals],
                ["Loading", sheetData.loading],
                ["Meals / Tiffin", sheetData.mealsTiffin],
                ["Vehicle Maintenance", sheetData.vehicleMaintenance],
                ["Tea", sheetData.othersRC],
                ["Driver", sheetData.others1Amt],
                ["Supervisor", sheetData.others2Amt],
                ["Helper & loader", sheetData.others3Amt],
                ["Others", sheetData.others4Amt],
                ["Others", sheetData.others5Amt],
              ]
                .filter(([, amt]) => Number(amt) > 0)
                .map(([label, amt], i) => (
                  <tr key={`${label}-${i}`} className="border-b border-slate-100">
                    <td className="font-medium text-slate-700 py-2.5 px-3">{label}</td>
                    <td colSpan={6} className="font-semibold text-slate-900 px-3">₹{Number(amt).toFixed(2)}</td>
                  </tr>
                ))}
            </>
          ) : (
            <>
          <tr className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
            <td className="font-medium text-slate-700 py-2.5 px-3">Meals</td>
            <td colSpan={2} className="p-0 border-r border-slate-200">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.meals)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("meals", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
            <td colSpan={2} className="font-medium text-slate-700 py-2.5 px-3 border-r border-slate-200 bg-slate-50/30">
              Driver
            </td>
            <td colSpan={2} className="p-0">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.others1Amt)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("others1Amt", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
          </tr>

          <tr className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
            <td className="font-medium text-slate-700 py-2.5 px-3">Loading</td>
            <td colSpan={2} className="p-0 border-r border-slate-200">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.loading)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("loading", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
            <td colSpan={2} className="font-medium text-slate-700 py-2.5 px-3 border-r border-slate-200 bg-slate-50/30">
              Supervisor
            </td>
            <td colSpan={2} className="p-0">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.others2Amt)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("others2Amt", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
          </tr>

          <tr className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
            <td className="font-medium text-slate-700 py-2.5 px-3">Meals / Tiffin</td>
            <td colSpan={2} className="p-0 border-r border-slate-200">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.mealsTiffin)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("mealsTiffin", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
            <td colSpan={2} className="font-medium text-slate-700 py-2.5 px-3 border-r border-slate-200 bg-slate-50/30">
              Helper & loader
            </td>
            <td colSpan={2} className="p-0">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.others3Amt)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("others3Amt", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
          </tr>

          <tr className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
            <td className="font-medium text-slate-700 py-2.5 px-3">Vehicle Maintenance</td>
            <td colSpan={2} className="p-0 border-r border-slate-200">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.vehicleMaintenance)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("vehicleMaintenance", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
            <td colSpan={2} className="font-medium text-slate-700 py-2.5 px-3 border-r border-slate-200 bg-slate-50/30">
              Others
            </td>
            <td colSpan={2} className="p-0">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.others4Amt)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("others4Amt", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
          </tr>

          <tr className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
            <td className="font-medium text-slate-700 py-2.5 px-3">Tea</td>
            <td colSpan={2} className="p-0 border-r border-slate-200">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.othersRC)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("othersRC", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
            <td colSpan={2} className="font-medium text-slate-700 py-2.5 px-3 border-r border-slate-200 bg-slate-50/30">
              Others
            </td>
            <td colSpan={2} className="p-0">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={formatZero(sheetData.others5Amt)}
                onKeyDown={blockInvalidChar}
                onChange={(e) =>
                  handleChange("others5Amt", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="font-medium w-full p-2.5 outline-none bg-transparent"
              />
            </td>
          </tr>
            </>
          )}

          <tr className="bg-slate-100/80 font-bold text-slate-800 text-xs border-b border-slate-200">
            <td className="py-2.5 px-3">TOTAL (₹)</td>
            <td colSpan={2} className="text-slate-900 px-3 border-r border-slate-200">
              {totalExpenses1.toFixed(2)}
            </td>
            <td colSpan={2} className="py-2.5 px-3 border-r border-slate-200">
              TOTAL (₹)
            </td>
            <td colSpan={2} className="text-slate-900 px-3">
              {totalExpenses2.toFixed(2)}
            </td>
          </tr>
          <tr className="bg-emerald-50/80 font-bold text-slate-800 text-xs border-b border-slate-200">
            <td className="py-2.5 px-3" colSpan={5}>
              Combined expense total (₹)
            </td>
            <td colSpan={2} className="text-slate-900 px-3">
              {(totalExpenses1 + totalExpenses2).toFixed(2)}
            </td>
          </tr>

          {/* ODOMETER SECTION */}
          <tr className="border-b border-slate-100">
            <td className="font-medium text-slate-700 py-3 px-3 flex items-center gap-1.5">
              <span>Start Meter Reading</span>
              <span title="Locked from Step 1" className="inline-flex items-center cursor-help">
                <Lock size={12} className="text-slate-400" />
              </span>
            </td>
            <td colSpan={2} className="font-bold text-slate-900 px-3 bg-slate-100/60 border-r border-slate-200 select-none">
              {actualStartMeter > 0 ? `${actualStartMeter} KM` : "---"}
            </td>
            <td colSpan={2} className="font-medium text-slate-700 px-3 border-r border-slate-200 bg-slate-50/30">
              Total Distance Covered (KM)
            </td>
            <td colSpan={2} className="font-bold text-slate-900 px-3 bg-slate-50/50">
              {computedDistance > 0 ? computedDistance : "---"}
            </td>
          </tr>

          <tr className="border-b border-slate-200">
            <td className="font-medium text-slate-700 py-3 px-3">
              {TRIP_FIELD_DEFINITIONS.closingMeter.label} {TRIP_FIELD_DEFINITIONS.closingMeter.required && <span className="text-red-500">*</span>}
            </td>
            <td colSpan={2} className="p-0 relative border-r border-slate-200">
              <div className="flex flex-col justify-center h-full px-2 py-1">
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={formatZero(sheetData.endMeter)}
                  onKeyDown={blockInvalidChar}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleChange("endMeter", val);
                    const n = Number(val);
                    const invalid =
                      val !== "" && requiredMinMeter > 0 && Number.isFinite(n) && n <= requiredMinMeter;
                    if (invalid) {
                      const msg = meterMustBeGreaterThan(requiredMinMeter);
                      if (!meterInvalidRef.current) {
                        meterInvalidRef.current = true;
                        onMeterNotice?.(msg);
                      }
                    } else {
                      meterInvalidRef.current = false;
                    }
                  }}
                  className={`w-full font-bold outline-none bg-transparent transition-colors ${
                    isEndMeterInvalid ? "text-red-600 border border-red-500 rounded bg-red-50 px-1" : "text-blue-600"
                  }`}
                />
                {isEndMeterInvalid ? (
                  <div className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
                    {meterMustBeGreaterThan(requiredMinMeter)}
                  </div>
                ) : null}
              </div>
            </td>
            <td colSpan={2} className="font-medium text-slate-700 px-3 border-r border-slate-200 bg-slate-50/30">
              Average (KM/Ltr)
            </td>
            <td colSpan={2} className="font-bold text-blue-600 px-3 bg-slate-50/50">
              {computedAverage ? computedAverage : "Not available"}
            </td>
          </tr>

          <tr className="bg-slate-50/50">
            <td className="font-medium text-slate-700 py-3 px-3">
              Total Toll Gates (Pickup) <span className="text-red-500">*</span>
            </td>
            <td colSpan={2} className="font-semibold text-slate-900 px-3 select-none border-r border-slate-200">
              {pickupTolls}
            </td>
            <td colSpan={2} className="font-medium text-slate-700 px-3 border-r border-slate-200 bg-slate-50/30">
              {TRIP_FIELD_DEFINITIONS.deliveryTolls.label} {TRIP_FIELD_DEFINITIONS.deliveryTolls.required && <span className="text-red-500">*</span>}
            </td>
            <td colSpan={2} className="p-0">
              <input
                type="number"
                step="1"
                min="0"
                required
                placeholder="0"
                value={formatZero(sheetData.destinationTolls)}
                onKeyDown={blockInvalidChar}
                onChange={(e) => {
                  const val = e.target.value;
                  handleChange("destinationTolls", val === "" ? "" : Math.floor(Number(val)));
                }}
                onWheel={(e) => e.currentTarget.blur()}
                className="font-bold text-blue-600 w-full p-2.5 outline-none bg-transparent"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}