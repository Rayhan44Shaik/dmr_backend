import { useEffect, useState } from "react";
import type { Farm } from "../types/farm";

type FarmFormProps = {
  farm?: Farm | null;
  onSave: (farm: {
    farmName: string;
    ownerName: string;
    supervisorName: string;
    phoneNumber: string;
    village: string;
    address: string;
    capacity: number;
    status: "Active" | "Inactive";
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

function FarmForm({ farm, onSave, onCancel, isSaving = false }: FarmFormProps) {
  const [farmName, setFarmName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [village, setVillage] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const [errors, setErrors] = useState({
    farmName: "",
    ownerName: "",
    supervisorName: "",
    phoneNumber: "",
    village: "",
    capacity: "",
  });

  useEffect(() => {
    if (farm) {
      setFarmName(farm.farmName);
      setOwnerName(farm.ownerName);
      setSupervisorName(farm.supervisorName);
      setPhoneNumber(farm.phoneNumber);
      setVillage(farm.village);
      setAddress(farm.address ?? "");
      setCapacity(farm.capacity ?? "");
      setStatus(farm.status);
    } else {
      setFarmName("");
      setOwnerName("");
      setSupervisorName("");
      setPhoneNumber("");
      setVillage("");
      setAddress("");
      setCapacity("");
      setStatus("Active");
    }
    setErrors({
      farmName: "",
      ownerName: "",
      supervisorName: "",
      phoneNumber: "",
      village: "",
      capacity: "",
    });
  }, [farm]);

  const clearFieldError = (field: keyof typeof errors) => {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = () => {
    let hasError = false;
    const newErrors = { ...errors };

    if (!farmName.trim()) {
      newErrors.farmName = "Farm Name is required.";
      hasError = true;
    } else {
      newErrors.farmName = "";
    }

    if (!ownerName.trim()) {
      newErrors.ownerName = "Owner Name is required.";
      hasError = true;
    } else if (ownerName.trim().length < 3) {
      newErrors.ownerName = "Owner Name must contain at least 3 characters.";
      hasError = true;
    } else {
      newErrors.ownerName = "";
    }

    if (!supervisorName.trim()) {
      newErrors.supervisorName = "Supervisor Name is required.";
      hasError = true;
    } else {
      newErrors.supervisorName = "";
    }

    if (!phoneNumber.trim()) {
      newErrors.phoneNumber = "Mobile Number is required.";
      hasError = true;
    } else if (!/^[0-9]{10}$/.test(phoneNumber)) {
      newErrors.phoneNumber = "Mobile Number must be exactly 10 digits.";
      hasError = true;
    } else {
      newErrors.phoneNumber = "";
    }

    if (!village.trim()) {
      newErrors.village = "Village is required.";
      hasError = true;
    } else {
      newErrors.village = "";
    }

    if (capacity === "" || capacity === null || capacity === undefined) {
      newErrors.capacity = "Bird Capacity is required.";
      hasError = true;
    } else if (Number(capacity) <= 0) {
      newErrors.capacity = "Bird Capacity must be a positive number.";
      hasError = true;
    } else {
      newErrors.capacity = "";
    }

    setErrors(newErrors);
    if (hasError) return;

    onSave({
      farmName: farmName.trim(),
      ownerName: ownerName.trim(),
      supervisorName: supervisorName.trim(),
      phoneNumber: phoneNumber.trim(),
      village: village.trim(),
      address: address.trim(),
      capacity: Number(capacity),
      status,
    });
  };

  const inputClass = (field: keyof typeof errors) =>
    `w-full rounded-lg border bg-white p-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
      errors[field]
        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-200"
        : "border-slate-200 focus:border-indigo-300 focus:ring-indigo-100"
    }`;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/50 sm:p-8">
      {/* Header with logo, title, and status toggle on the right */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-8.25-4.5-8.25 4.5m16.5 0v9m-16.5-9v9m16.5 0l-8.25 4.5-8.25-4.5m16.5 0l-8.25 4.5-8.25-4.5"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {farm ? "Edit Farm" : "Add New Farm"}
            </h2>
            {/* Dynamic subtitle */}
            <p className="text-sm text-slate-500">
              {farm ? "Update details" : "Fill in the details below"}
            </p>
          </div>
        </div>
        {/* Status toggle – moved to top right */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Status</span>
          <button
            type="button"
            onClick={() => {
              if (!isSaving) setStatus(status === "Active" ? "Inactive" : "Active");
            }}
            disabled={isSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
              status === "Active" ? "bg-emerald-500" : "bg-slate-300"
            } ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                status === "Active" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${status === "Active" ? "text-emerald-600" : "text-slate-500"}`}>
            {status}
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {/* Row 1: Farm Name + Owner Name */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Farm Name <span className="text-rose-500">*</span>
            </label>
            <input
              value={farmName}
              onChange={(e) => {
                setFarmName(e.target.value);
                clearFieldError("farmName");
              }}
              placeholder="e.g. Green Valley Farm"
              className={inputClass("farmName")}
            />
            {errors.farmName && (
              <p className="mt-1 text-sm text-rose-500">{errors.farmName}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Owner Name <span className="text-rose-500">*</span>
            </label>
            <input
              value={ownerName}
              onChange={(e) => {
                setOwnerName(e.target.value);
                clearFieldError("ownerName");
              }}
              placeholder="Full name"
              className={inputClass("ownerName")}
            />
            {errors.ownerName && (
              <p className="mt-1 text-sm text-rose-500">{errors.ownerName}</p>
            )}
          </div>
        </div>

        {/* Row 2: Supervisor Name + Mobile Number */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Supervisor Name <span className="text-rose-500">*</span>
            </label>
            <input
              value={supervisorName}
              onChange={(e) => {
                setSupervisorName(e.target.value);
                clearFieldError("supervisorName");
              }}
              placeholder="Full name"
              className={inputClass("supervisorName")}
            />
            {errors.supervisorName && (
              <p className="mt-1 text-sm text-rose-500">{errors.supervisorName}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Mobile Number <span className="text-rose-500">*</span>
            </label>
            <input
              value={phoneNumber}
              maxLength={10}
              onChange={(e) => {
                setPhoneNumber(e.target.value.replace(/\D/g, ""));
                clearFieldError("phoneNumber");
              }}
              placeholder="10 digits"
              className={inputClass("phoneNumber")}
            />
            {errors.phoneNumber && (
              <p className="mt-1 text-sm text-rose-500">{errors.phoneNumber}</p>
            )}
          </div>
        </div>

        {/* Row 3: Village + Bird Capacity */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Village <span className="text-rose-500">*</span>
            </label>
            <input
              value={village}
              onChange={(e) => {
                setVillage(e.target.value);
                clearFieldError("village");
              }}
              placeholder="Village name"
              className={inputClass("village")}
            />
            {errors.village && (
              <p className="mt-1 text-sm text-rose-500">{errors.village}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Bird Capacity <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value === "" ? "" : Number(e.target.value));
                clearFieldError("capacity");
              }}
              placeholder="e.g. 500"
              className={`
                ${inputClass("capacity")}
                [appearance:textfield] 
                [&::-webkit-inner-spin-button]:appearance-none 
                [&::-webkit-outer-spin-button]:appearance-none
              `}
            />
            {errors.capacity && (
              <p className="mt-1 text-sm text-rose-500">{errors.capacity}</p>
            )}
          </div>
        </div>

        {/* Address – full width */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Address
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, landmark, etc."
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm transition-colors focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            rows={2}
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="w-full rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 sm:w-auto disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
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
            {isSaving ? "Saving..." : farm ? "Update Farm" : "Save Farm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FarmForm;