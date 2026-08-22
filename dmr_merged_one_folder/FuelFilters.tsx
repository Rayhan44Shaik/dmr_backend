import { Search } from "lucide-react";
import Select from "react-select";
import { ModernDatePicker } from "./ModernDatePicker";

interface Props {
  fromDate: string;
  toDate: string;
  selectedVehicles: string[];
  activeVehicles: string[];
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  setSelectedVehicles: (v: string[]) => void;
  onSearch: () => void;
  onReset: () => void;
}

const parseDate = (str: string) => (str ? new Date(str + "T00:00:00") : null);
const formatDate = (date: Date | null) => {
  if (!date) return "";
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

export function FuelFilters({
  fromDate,
  toDate,
  selectedVehicles,
  activeVehicles,
  setFromDate,
  setToDate,
  setSelectedVehicles,
  onSearch,
  onReset,
}: Props) {
  const vehicleOptions = activeVehicles.map((v) => ({ value: v, label: v }));

  const selectStyles = {
    control: (base: any) => ({
      ...base,
      borderRadius: 8,
      borderColor: "#e2e8f0",
      boxShadow: "none",
      minHeight: 40,
      fontSize: "14px",
      "&:hover": { borderColor: "#94a3b8" },
      "&:focus-within": { borderColor: "#3b82f6", boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.15)" },
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#2563eb" : isFocused ? "#eff6ff" : "white",
      color: isSelected ? "white" : "#1e293b",
      fontSize: "14px",
      padding: "10px 12px", // Adjusted padding to ensure ~40px height per item
    }),
    menu: (base: any) => ({ ...base, zIndex: 50 }),
    placeholder: (base: any) => ({ ...base, color: "#94a3b8", fontSize: "14px" }),
    multiValue: (base: any) => ({
      ...base,
      backgroundColor: "#e0f2fe",
      borderRadius: 4,
    }),
    multiValueLabel: (base: any) => ({
      ...base,
      color: "#0369a1",
      fontSize: "12px",
      fontWeight: 500,
    }),
    multiValueRemove: (base: any) => ({
      ...base,
      color: "#0369a1",
      ":hover": { backgroundColor: "#bae6fd", color: "#0c4a6e" },
    }),
    indicatorsContainer: (base: any) => ({
      ...base,
      height: "auto",
    }),
    clearIndicator: (base: any) => ({
      ...base,
      padding: "0 4px",
    }),
    valueContainer: (base: any) => ({
      ...base,
      padding: "0 4px",
      flexWrap: "nowrap",
      overflow: "hidden",
    }),
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
      {/* Inputs Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {/* From Date - 25% (1/4 columns) */}
        <div className="md:col-span-1">
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">From Date</label>
          <ModernDatePicker
            id="from-date"
            selected={parseDate(fromDate)}
            onChange={(date) => setFromDate(formatDate(date))}
            placeholder="Select start"
            className="w-full"
          />
        </div>

        {/* To Date - 25% (1/4 columns) */}
        <div className="md:col-span-1">
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">To Date</label>
          <ModernDatePicker
            id="to-date"
            selected={parseDate(toDate)}
            onChange={(date) => setToDate(formatDate(date))}
            placeholder="Select end"
            className="w-full"
          />
        </div>

        {/* Vehicles - 50% (2/4 columns) */}
        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">Vehicles</label>
          <Select
            options={vehicleOptions}
            value={vehicleOptions.filter((opt) => selectedVehicles.includes(opt.value))}
            onChange={(selected) => {
              setSelectedVehicles(selected ? selected.map((s: any) => s.value) : []);
            }}
            isMulti
            isSearchable
            placeholder="Select vehicles..."
            styles={selectStyles}
            maxMenuHeight={200} // Strictly sets the dropdown menu to fit ~5 items
            className="w-full"
          />
        </div>
      </div>

      {/* Divider matching the image */}
      <hr className="border-slate-100" />

      {/* Actions Row */}
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={onSearch}
          className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
        >
          <Search size={16} /> Search
        </button>
        <button
          onClick={onReset}
          className="h-10 px-5 rounded-lg border border-red-500 bg-white text-red-600 text-sm font-medium transition-all hover:bg-red-50 active:scale-95"
        >
          Reset
        </button>
      </div>
    </div>
  );
}