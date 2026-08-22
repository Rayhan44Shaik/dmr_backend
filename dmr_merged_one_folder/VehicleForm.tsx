import { useEffect, useState, useRef } from "react";
import type { Vehicle } from "../types/vehicle";
import type { VehicleInput } from "../services/vehicleService";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import {
  Truck,
  Package,
  Weight,
  Bird,
  MapPin,
  Landmark,
  Gauge,
  Cpu,
  IndianRupee,
  CalendarDays,
  Clock,
  Calendar,
} from "lucide-react";
import DatePicker from "../../../../components/common/DatePicker";

// The form collects the vehicle fields it owns; insurance/permit/fitness
// expiries are managed on the fleet documents pages.
type VehicleFormSave = Omit<VehicleInput, "insuranceExpiry" | "permitExpiry" | "fitnessExpiry"> & {
  emiDay?: number;
  totalEMIs?: number;
};

/** Master record plus the extra EMI fields the backend payload accepts. */
type VehicleModel = Vehicle & { emiDay?: number; totalEMIs?: number };

type VehicleFormProps = {
  vehicle?: Vehicle | null;
  onSave: (vehicle: VehicleFormSave) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

function VehicleForm({ vehicle, onSave, onCancel, isSaving = false }: VehicleFormProps) {
  const { showNotification } = useSafeNotification();

  // Fields (in new order)
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [noOfBoxes, setNoOfBoxes] = useState<number | "">("");
  const [birdCapacity, setBirdCapacity] = useState<number | "">("");
  const [capacityKg, setCapacityKg] = useState<number | "">("");
  const [fastagBank, setFastagBank] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState<number | "">(""); // renamed from loanAmount
  const [emiDay, setEmiDay] = useState<number | "">("");
  const [totalEMIs, setTotalEMIs] = useState<number | "">("");
  const [engineNumber, setEngineNumber] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [rcDate, setRcDate] = useState("");

  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  // Raw digits for Purchase Amount (without commas)
  const [purchaseAmountRaw, setPurchaseAmountRaw] = useState<string>("");
  const purchaseInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!vehicle;

  // Helper to format Indian number with commas
  const formatIndianNumber = (numStr: string): string => {
    if (!numStr) return "";
    const clean = numStr.replace(/,/g, "");
    if (clean === "") return "";
    const num = parseFloat(clean);
    if (isNaN(num)) return "";
    return num.toLocaleString('en-IN');
  };

  useEffect(() => {
    if (vehicle) {
      setVehicleNumber(vehicle.vehicleNumber);
      setVehicleType(vehicle.vehicleType);
      setTrackingId(vehicle.trackingId ?? "");
      setNoOfBoxes(vehicle.noOfBoxes);
      setBirdCapacity(vehicle.birdCapacity);
      setCapacityKg(vehicle.capacityKg);
      setFastagBank(vehicle.fastagBank ?? "");
      setPurchaseDate(vehicle.purchaseDate ?? "");
      setPurchaseAmount(vehicle.purchaseAmount ?? "");
      setPurchaseAmountRaw(vehicle.purchaseAmount ? String(vehicle.purchaseAmount) : "");
      const model = vehicle as VehicleModel;
      setEmiDay(model.emiDay ?? "");
      setTotalEMIs(model.totalEMIs ?? "");
      setEngineNumber(vehicle.engineNumber ?? "");
      setChassisNumber(vehicle.chassisNumber ?? "");
      setRcDate(vehicle.rcDate ?? "");
      setStatus(vehicle.status);
    } else {
      // Reset all
      setVehicleNumber("");
      setVehicleType("");
      setTrackingId("");
      setNoOfBoxes("");
      setBirdCapacity("");
      setCapacityKg("");
      setFastagBank("");
      setPurchaseDate("");
      setPurchaseAmount("");
      setPurchaseAmountRaw("");
      setEmiDay("");
      setTotalEMIs("");
      setEngineNumber("");
      setChassisNumber("");
      setRcDate("");
      setStatus("Active");
    }
  }, [vehicle]);

  // Sync purchaseAmountRaw with purchaseAmount when vehicle changes
  useEffect(() => {
    if (purchaseInputRef.current) {
      const formatted = purchaseAmountRaw ? formatIndianNumber(purchaseAmountRaw) : "";
      purchaseInputRef.current.value = formatted;
    }
  }, [purchaseAmountRaw]);

  // Handlers for Purchase Amount input
  const handlePurchaseFocus = () => {
    if (purchaseInputRef.current) {
      purchaseInputRef.current.value = purchaseAmountRaw;
    }
  };

  const handlePurchaseBlur = () => {
    if (purchaseInputRef.current) {
      const formatted = purchaseAmountRaw ? formatIndianNumber(purchaseAmountRaw) : "";
      purchaseInputRef.current.value = formatted;
    }
  };

  const handlePurchaseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/,/g, "").replace(/[^0-9]/g, "");
    setPurchaseAmountRaw(val);
    setPurchaseAmount(val === "" ? "" : parseFloat(val));
  };

  // Bird Capacity – integer only
  const handleBirdCapacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    if (val === "") {
      setBirdCapacity("");
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 0) {
      setBirdCapacity(num);
    }
  };

  // EMI Day validation (1-31)
  const handleEmiDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    if (val === "") {
      setEmiDay("");
      return;
    }
    const num = parseInt(val, 10);
    if (num >= 1 && num <= 31) {
      setEmiDay(num);
    }
  };

  const handleEmiDayBlur = () => {
    if (emiDay !== "") {
      const num = Number(emiDay);
      if (num < 1 || num > 31) {
        showNotification("EMI day must be between 1 and 31.", "error");
        setEmiDay("");
      }
    }
  };

  // Total EMIs handler
  const handleTotalEMIsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    if (val === "") {
      setTotalEMIs("");
      return;
    }
    const num = parseInt(val, 10);
    if (num > 0) {
      setTotalEMIs(num);
    }
  };

  const handleSubmit = () => {
    // Required fields
    if (!vehicleNumber || !vehicleType || noOfBoxes === "" || birdCapacity === "" || capacityKg === "") {
      showNotification("Please fill all required fields.", "error");
      return;
    }
    // Engine and Chassis are now mandatory
    if (!engineNumber.trim()) {
      showNotification("Engine Number is required.", "error");
      return;
    }
    if (!chassisNumber.trim()) {
      showNotification("Chassis Number is required.", "error");
      return;
    }
    onSave({
      vehicleNumber,
      vehicleType,
      trackingId,
      noOfBoxes: Number(noOfBoxes),
      birdCapacity: Number(birdCapacity),
      capacityKg: Number(capacityKg),
      fastagBank,
      purchaseDate,
      purchaseAmount: purchaseAmount === "" ? undefined : Number(purchaseAmount),
      emiDay: emiDay === "" ? undefined : Number(emiDay),
      totalEMIs: totalEMIs === "" ? undefined : Number(totalEMIs),
      engineNumber,
      chassisNumber,
      rcDate,
      status,
    });
  };

  const inputClass = () =>
    "w-full pl-12 pr-4 py-4 text-base border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition border-slate-200 bg-white appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const numberInputClass = () =>
    inputClass() + " [&::-moz-inner-spin-button]:appearance-none";

  const iconWrapperClass = "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400";

  const title = isEditing ? "Edit Vehicle" : "Add Vehicle";
  const subtitle = isEditing ? "Update information" : "Fill in the information";

  const toggleStatus = () => {
    if (!isSaving) {
      setStatus(status === "Active" ? "Inactive" : "Active");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-200/80 px-8 py-5 flex items-center justify-between border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-2xl">
            <Truck className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h2>
            <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
          </div>
        </div>
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

      {/* Form Body – 3 columns */}
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Row 1: Vehicle Number, Vehicle Type, Tracking ID */}
          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Vehicle Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Truck className={iconWrapperClass} size={20} />
              <input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g., AP-01-AB-1234"
                className={inputClass()}
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Vehicle Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Package className={iconWrapperClass} size={20} />
              <input
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                placeholder="e.g., LCV, Truck, Trailer"
                className={inputClass()}
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Tracking ID
            </label>
            <div className="relative">
              <MapPin className={iconWrapperClass} size={20} />
              <input
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder="GPS tracking ID"
                className={inputClass()}
              />
            </div>
          </div>

          {/* Row 2: No. of Boxes, Bird Capacity, Capacity (kg) */}
          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              No. of Boxes <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Package className={iconWrapperClass} size={20} />
              <input
                type="number"
                value={noOfBoxes}
                onChange={(e) => setNoOfBoxes(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g., 12"
                className={numberInputClass()}
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Bird Capacity <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Bird className={iconWrapperClass} size={20} />
              <input
                type="number"
                step="1"
                value={birdCapacity}
                onChange={handleBirdCapacityChange}
                placeholder="e.g., 2000"
                className={numberInputClass()}
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Capacity (Kg) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Weight className={iconWrapperClass} size={20} />
              <input
                type="number"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g., 5000"
                className={numberInputClass()}
              />
            </div>
          </div>

          {/* Row 3: Fastag Bank, Purchase Date, Purchase Amount */}
          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Fastag Bank
            </label>
            <div className="relative">
              <Landmark className={iconWrapperClass} size={20} />
              <input
                value={fastagBank}
                onChange={(e) => setFastagBank(e.target.value)}
                placeholder="e.g., HDFC, Axis"
                className={inputClass()}
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Purchase Date
            </label>
            <div className="relative">
              <CalendarDays className={iconWrapperClass} size={20} />
              <DatePicker
                value={purchaseDate}
                onChange={setPurchaseDate}
                placeholder="Select date"
                placement="top"
                className="w-full pl-12 pr-4 py-4 text-base border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition border-slate-200 bg-white appearance-none"
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Purchase Amount (₹) {/* 👈 Changed from Loan Amount */}
            </label>
            <div className="relative">
              <IndianRupee className={iconWrapperClass} size={20} />
              <input
                ref={purchaseInputRef}
                type="text"
                onFocus={handlePurchaseFocus}
                onBlur={handlePurchaseBlur}
                onChange={handlePurchaseChange}
                placeholder="e.g., 800000"
                className={inputClass()}
                defaultValue={purchaseAmountRaw ? formatIndianNumber(purchaseAmountRaw) : ""}
              />
            </div>
          </div>

          {/* Row 4: EMI Day, Total EMIs, RC Date */}
          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              EMI Day (1–31)
            </label>
            <div className="relative">
              <CalendarDays className={iconWrapperClass} size={20} />
              <input
                type="number"
                min="1"
                max="31"
                value={emiDay}
                onChange={handleEmiDayChange}
                onBlur={handleEmiDayBlur}
                placeholder="e.g., 15"
                className={numberInputClass()}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              EMI due day each month. Month‑end dates adjust automatically.
            </p>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Total EMIs (months)
            </label>
            <div className="relative">
              <Clock className={iconWrapperClass} size={20} />
              <input
                type="number"
                min="1"
                value={totalEMIs}
                onChange={handleTotalEMIsChange}
                placeholder="e.g., 36"
                className={numberInputClass()}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Total number of monthly installments.
            </p>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              RC Date
            </label>
            <div className="relative">
              <Calendar className={iconWrapperClass} size={20} />
              <DatePicker
                value={rcDate}
                onChange={setRcDate}
                placeholder="Select date"
                placement="top"
                className="w-full pl-12 pr-4 py-4 text-base border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition border-slate-200 bg-white appearance-none"
              />
            </div>
          </div>

          {/* Row 5: Engine Number, Chassis Number, (empty) */}
          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Engine Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Gauge className={iconWrapperClass} size={20} />
              <input
                value={engineNumber}
                onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
                placeholder="Engine number"
                className={inputClass()}
              />
            </div>
          </div>

          <div className="relative">
            <label className="block mb-2 text-base font-medium text-slate-700">
              Chassis Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Cpu className={iconWrapperClass} size={20} />
              <input
                value={chassisNumber}
                onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                placeholder="Chassis number"
                className={inputClass()}
              />
            </div>
          </div>

          <div className="relative">{/* empty placeholder */}</div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-8 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 transition font-medium text-base text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition shadow-sm hover:shadow font-medium text-base disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
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
            {isSaving ? "Saving..." : isEditing ? "Update Vehicle" : "Save Vehicle"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VehicleForm;