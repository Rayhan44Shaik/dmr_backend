import { useEffect, useState } from "react";
import type { BirdType } from "../types/birdType";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import {
  Bird,
  Weight,
  FileText,
} from "lucide-react";

type BirdTypeFormProps = {
  birdType?: BirdType | null;
  onSave: (birdType: any) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

function BirdTypeForm({ birdType, onSave, onCancel, isSaving = false }: BirdTypeFormProps) {
  const { showNotification } = useSafeNotification();
  const [birdTypeName, setBirdTypeName] = useState("");
  const [averageWeight, setAverageWeight] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const isEditing = !!birdType;

  useEffect(() => {
    if (birdType) {
      setBirdTypeName(birdType.birdType);
      setAverageWeight(birdType.averageWeight);
      setDescription(birdType.description ?? "");
      setStatus(birdType.status);
    } else {
      setBirdTypeName("");
      setAverageWeight("");
      setDescription("");
      setStatus("Active");
    }
  }, [birdType]);

  const handleSubmit = () => {
    if (isSaving) return;

    if (!birdTypeName || averageWeight === "" || averageWeight <= 0) {
      showNotification("Please fill all required fields with valid values.", "error");
      return;
    }

    onSave({
      birdType: birdTypeName,
      averageWeight: Number(averageWeight),
      description,
      status,
    });
  };

  const inputClass = (hasError = false) =>
    `w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition ${
      hasError ? "border-red-300 focus:border-red-500" : "border-slate-200"
    } bg-white`;

  const iconWrapperClass = "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400";

  const title = isEditing ? "Edit Bird Type" : "Add Bird Type";
  const subtitle = isEditing ? "Update details" : "Fill in the details";

  const toggleStatus = () => {
    if (!isSaving) {
      setStatus(status === "Active" ? "Inactive" : "Active");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header with icon, title, and status toggle */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-200/80 px-6 py-5 flex items-center justify-between border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl">
            <Bird className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
            <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
          </div>
        </div>

        {/* Status toggle switch */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Status</span>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={isSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 ${
              status === "Active" ? "bg-emerald-500" : "bg-slate-300"
            } ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                status === "Active" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${
              status === "Active" ? "text-emerald-600" : "text-slate-500"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Form Body – 2 columns */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Bird Type */}
          <div className="relative">
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              Bird Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Bird className={iconWrapperClass} size={18} />
              <input
                value={birdTypeName}
                onChange={(e) => setBirdTypeName(e.target.value)}
                placeholder="e.g., Broiler, Layer"
                className={inputClass()}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Average Weight */}
          <div className="relative">
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              Average Weight (kg) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Weight className={iconWrapperClass} size={18} />
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={averageWeight}
                onChange={(e) => setAverageWeight(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g., 1.5"
                className={`${inputClass()} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Description – full width */}
          <div className="relative md:col-span-2">
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              Description
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-slate-400" size={18} />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                rows={2}
                className="w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition border-slate-200 bg-white resize-y"
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-6 pt-5 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition font-medium text-sm text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-sm hover:shadow font-medium text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSaving && (
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isSaving ? "Saving..." : isEditing ? "Update Bird Type" : "Save Bird Type"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BirdTypeForm;
