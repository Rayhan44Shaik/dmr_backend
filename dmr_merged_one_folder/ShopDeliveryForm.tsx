import React from "react";
import Select from "react-select";
import {
  X,
  ShoppingCart,
  Layers,
  Box,
  Scale,
  MessageSquare,
  AlertCircle,
  Clock,
  PackageCheck,
  Tag,
} from "lucide-react";
import BoxSelector from "./BoxSelector";
import type { ShopDelivery, BoxDetail } from "../../types/trip";

export interface Props {
  mode: "box" | "weight";
  setMode: (mode: "box" | "weight") => void;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  validationErrors: any;

  farmBirds: number;
  farmWeight: number;
  boxCount: number;
  weightModeTotals: { birds: number; weight: number };
  mortKg: number;
  deliveredBirds: number;
  deliveredWeight: number;

  usedBoxIds: number[];
  safeBoxDetails: any[];
  readOnly: boolean;
  autoCaptureTime: string;

  editingId: number | null;
  editingShopId?: number | null;

  onClose: () => void;
  onSubmit: () => void;
  handleShopSelect: (selected: any) => void;
  handleBirdSelect: (selected: any) => void;
  handleBoxSelection: (ids: number[]) => void;
  handleFormChange: (field: string, value: any) => void;
  handlePerBoxChange: (index: number, field: "birds" | "weight", value: number) => void;

  shopOptions: any[];
  birdOptions: any[];
  isFormValid: boolean;

  rows?: ShopDelivery[];
  setRows?: React.Dispatch<React.SetStateAction<ShopDelivery[]>>;
  shops?: any[];
  birdTypes?: any[];
  boxDetails?: BoxDetail[];
  tripDate?: string;
  [key: string]: any;
}

export default function ShopDeliveryForm({
  mode,
  setMode,
  formData,
  validationErrors,
  farmBirds,
  farmWeight,
  boxCount,
  mortKg,
  deliveredBirds,
  deliveredWeight,
  usedBoxIds,
  safeBoxDetails,
  readOnly,
  autoCaptureTime,
  editingId,
  onClose,
  onSubmit,
  handleShopSelect,
  handleBirdSelect,
  handleBoxSelection,
  handleFormChange,
  handlePerBoxChange,
  shopOptions,
  birdOptions,
  isFormValid,
}: Props) {
  const selectedBoxIds: number[] = formData.selectedBoxIds || [];

  // Compact & Clean React-Select Styles
  const customSelectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      minHeight: 38,
      height: 38,
      borderRadius: 8,
      borderColor: state.isFocused ? "#3b82f6" : "#e2e8f0",
      backgroundColor: "#ffffff",
      boxShadow: "none",
      "&:hover": {
        borderColor: "#cbd5e1",
      },
    }),
    valueContainer: (base: any) => ({
      ...base,
      padding: "0 10px",
    }),
    input: (base: any) => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
    menu: (base: any) => ({
      ...base,
      zIndex: 9999,
      borderRadius: 8,
      overflow: "hidden",
      border: "1px solid #e2e8f0",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#eff6ff"
        : state.isFocused
        ? "#f8fafc"
        : "white",
      color: state.isSelected ? "#1d4ed8" : "#1e293b",
      cursor: "pointer",
      fontSize: "13px",
      padding: "6px 12px",
    }),
  };

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
      {/* Form Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            {editingId !== null ? "Edit Shop Delivery" : "Add New Shop Delivery"}
          </h3>
          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
            <Clock size={12} className="text-slate-400" />
            Auto-Captured: <span className="font-medium text-slate-600">{autoCaptureTime}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Row 1: Delivery Mode & Shop Name */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
        {/* Delivery Mode Toggle */}
        <div className="sm:col-span-5">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Delivery Mode
          </label>
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/60 h-[38px]">
            <button
              type="button"
              onClick={() => setMode("box")}
              className={`flex items-center justify-center gap-1.5 rounded-md text-xs transition-all ${
                mode === "box"
                  ? "bg-white text-blue-700 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Box size={13} />
              Box Mode
            </button>
            <button
              type="button"
              onClick={() => setMode("weight")}
              className={`flex items-center justify-center gap-1.5 rounded-md text-xs transition-all ${
                mode === "weight"
                  ? "bg-white text-blue-700 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Scale size={13} />
              Weight Mode
            </button>
          </div>
        </div>

        {/* Shop Select */}
        <div className="sm:col-span-7">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
            <ShoppingCart size={13} className="text-slate-400" />
            Shop Name <span className="text-rose-500">*</span>
          </label>
          <Select
            key={`shop-${shopOptions.length}`}
            value={
              formData.shopId
                ? { value: formData.shopId, label: formData.shopName }
                : null
            }
            options={shopOptions}
            placeholder={shopOptions.length > 0 ? "Select Shop..." : "No shops available"}
            isSearchable
            isDisabled={shopOptions.length === 0 || shopOptions[0]?.isDisabled}
            onChange={handleShopSelect}
            maxMenuHeight={150}
            styles={customSelectStyles}
          />
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {shopOptions.length} shop(s) available
          </span>
        </div>
      </div>

      {/* Row 2: Bird Type & Box Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
        {/* Bird Type Select */}
        <div className="sm:col-span-5">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Layers size={13} className="text-slate-400" />
            Bird Type <span className="text-rose-500">*</span>
          </label>
          <Select
            key={`bird-${birdOptions.length}`}
            value={
              formData.birdTypeId
                ? { value: formData.birdTypeId, label: formData.birdType }
                : null
            }
            options={birdOptions}
            placeholder={birdOptions.length > 0 ? "Select Bird..." : "No bird types available"}
            isSearchable
            isDisabled={birdOptions.length === 0 || birdOptions[0]?.isDisabled}
            onChange={handleBirdSelect}
            maxMenuHeight={150}
            styles={customSelectStyles}
          />
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {birdOptions.length} bird type(s) available
          </span>
        </div>

        {/* Box Selector Container */}
        <div className="sm:col-span-7">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
            <PackageCheck size={13} className="text-slate-400" />
            Select Available Boxes
          </label>
          {safeBoxDetails.length > 0 ? (
            <div className="bg-slate-50/50 p-2 border border-slate-200 rounded-lg">
              <BoxSelector
                boxes={safeBoxDetails}
                selectedIds={formData.selectedBoxIds}
                onSelectionChange={handleBoxSelection}
                disabled={readOnly}
                usedBoxIds={usedBoxIds}
              />
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 text-center flex items-center justify-center gap-1.5 h-[38px]">
              <AlertCircle size={14} className="text-slate-400" />
              <p className="text-xs text-slate-500">No boxes available from pickup.</p>
            </div>
          )}
        </div>
      </div>

      {/* Conditional Delivery Mode Breakdown Section */}
      {mode === "box" ? (
        <div className="bg-slate-50/60 border border-slate-200/80 p-3.5 rounded-xl space-y-3">
          {/* Top Metric Inputs Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* 1. Selected Boxes Count Box */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Selected Boxes
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 flex items-center h-[38px]">
                {boxCount}
              </div>
            </div>

            {/* 2. Farm Birds */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Farm Birds
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 flex items-center h-[38px]">
                {farmBirds}
              </div>
            </div>

            {/* 3. Mortality Birds */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Mortality (Birds)
              </label>
              <input
                type="number"
                value={formData.mortality || ""}
                onChange={(e) => handleFormChange("mortality", Number(e.target.value))}
                placeholder="0"
                min="0"
                className={`w-full rounded-lg border px-3 text-xs font-medium outline-none transition-all h-[38px] ${
                  validationErrors.birdsExceed
                    ? "border-rose-500 bg-rose-50 text-rose-900 focus:ring-1 focus:ring-rose-300"
                    : "border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                }`}
              />
              {validationErrors.birdsExceed && (
                <p className="text-[10px] text-rose-600 mt-0.5 flex items-center gap-1">
                  <AlertCircle size={10} /> Max: {farmBirds}
                </p>
              )}
            </div>

            {/* 4. Delivered Birds */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Delivered Birds
              </label>
              <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 text-xs font-bold text-emerald-700 flex items-center h-[38px]">
                {deliveredBirds}
              </div>
            </div>
          </div>

          {/* Bottom Weights & Selected Box Nos Tags Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
            {/* Box Numbers Tag List (Placed directly in lower-left space) */}
            <div className="flex flex-col justify-start">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Box Nos List
              </label>
              <div className="p-2 bg-white border border-slate-200 rounded-lg min-h-[38px] max-h-[85px] overflow-y-auto flex flex-wrap gap-1">
                {selectedBoxIds.length > 0 ? (
                  selectedBoxIds.map((id) => (
                    <span
                      key={id}
                      className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/80 rounded text-[10px] font-semibold flex items-center gap-0.5 shrink-0"
                    >
                      <Tag size={9} className="text-blue-500" />
                      #{id}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">None selected</span>
                )}
              </div>
            </div>

            {/* Farm Weight */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Farm Weight (kg)
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 flex items-center h-[38px]">
                {farmWeight.toFixed(2)}
              </div>
            </div>

            {/* Mortality Weight */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Mortality Weight (kg)
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 flex items-center h-[38px]">
                {mortKg > 0 ? mortKg.toFixed(2) : "0.00"}
              </div>
            </div>

            {/* Delivered Weight */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Delivered Weight (kg)
              </label>
              <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 text-xs font-bold text-emerald-700 flex items-center h-[38px]">
                {deliveredWeight > 0 ? deliveredWeight.toFixed(2) : "0.00"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Weight Mode Breakdown Table */
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                <tr>
                  <th className="px-3 py-2">Box No</th>
                  <th className="px-3 py-2">Farm Birds</th>
                  <th className="px-3 py-2">
                    Delivered Birds <span className="text-rose-500">*</span>
                  </th>
                  <th className="px-3 py-2">Farm Weight (kg)</th>
                  <th className="px-3 py-2">
                    Delivered Weight (kg) <span className="text-rose-500">*</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {formData.perBoxData.map((item: any, index: number) => {
                  const farmBox = safeBoxDetails.find((b) => b.boxNo === item.boxNo);
                  const birdsError = validationErrors.perBoxBirdsErrors[index] || false;
                  const weightError = validationErrors.perBoxWeightErrors[index] || false;
                  return (
                    <tr key={item.boxNo}>
                      <td className="px-3 py-1.5 font-bold text-slate-800">#{item.boxNo}</td>
                      <td className="px-3 py-1.5">{farmBox?.birds || 0}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={item.birds || ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsed = raw === "" ? 0 : Number(raw);
                            handlePerBoxChange(index, "birds", Number.isFinite(parsed) ? parsed : 0);
                          }}
                          placeholder="0"
                          min="0"
                          className={`w-20 rounded border px-2 py-1 text-xs outline-none ${
                            birdsError
                              ? "border-rose-500 bg-rose-50"
                              : "border-slate-200 focus:border-blue-500"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-1.5">{farmBox?.weight?.toFixed(2) || "0.00"}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={item.weight || ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsed = raw === "" ? 0 : Number(raw);
                            handlePerBoxChange(index, "weight", Number.isFinite(parsed) ? parsed : 0);
                          }}
                          placeholder="0.00"
                          min="0"
                          className={`w-24 rounded border px-2 py-1 text-xs outline-none ${
                            weightError
                              ? "border-rose-500 bg-rose-50"
                              : "border-slate-200 focus:border-blue-500"
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Mortality (Birds)
              </label>
              <input
                type="number"
                value={formData.mortality || ""}
                onChange={(e) => handleFormChange("mortality", Number(e.target.value))}
                placeholder="0"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500 h-[38px]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Mortality Weight (kg)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.mortWeight || ""}
                onChange={(e) => handleFormChange("mortWeight", Number(e.target.value))}
                placeholder="0.00"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500 h-[38px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Remarks */}
      <div>
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
          <MessageSquare size={13} className="text-slate-400" />
          Remarks
        </label>
        <input
          value={formData.remarks || ""}
          onChange={(e) => handleFormChange("remarks", e.target.value)}
          placeholder="Optional delivery notes..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-500 h-[38px]"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!isFormValid}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            isFormValid
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {editingId !== null ? "Update Delivery" : "Save Delivery"}
        </button>
      </div>
    </div>
  );
}