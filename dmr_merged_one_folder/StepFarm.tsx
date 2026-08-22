import React, { useState } from "react";
import { Clock, MapPin, Gauge, Store, Ticket, MessageSquare, Loader2, Scale, Pencil, X } from "lucide-react";
import Select from "react-select";
import type { Trip } from "../types/trip";
import { WizardActionBar, WizardStepNotice } from "./WizardStepUI";
import { GpsAddressText } from "./GpsAddressText";
import {
  TRIP_FIELD_DEFINITIONS,
  TRIP_STEP_DEFINITIONS,
} from "../../../../shared/trip/definitions";
import { validateFarmStep } from "../../../../shared/trip/validation";
import { isMeterInvalid, meterMustBeGreaterThan } from "../utils/meterValidation";

interface Props {
  trip: Trip;
  setTrip: React.Dispatch<React.SetStateAction<Trip>>;
  updateTrip: (updates: Partial<Trip>) => void;
  submitFarmStep: (data: Partial<Trip>) => boolean | Promise<boolean>;
  saveFarmProgress?: (data: Partial<Trip>) => Promise<boolean>;
  hasUnsavedChanges?: boolean;
  farms: any[];
  editable?: boolean;
  canEdit?: boolean;
  onCancel?: () => void;
  showNotification?: (message: string, type?: "info" | "success" | "error" | "warning") => void;
}

function farmMasterAddress(farm: any): string {
  return String(farm?.address ?? farm?.farmAddress ?? "").trim();
}

export default function StepFarm({
  trip,
  setTrip,
  updateTrip,
  submitFarmStep,
  saveFarmProgress,
  hasUnsavedChanges = false,
  farms,
  editable = false,
  canEdit = false,
  onCancel,
  showNotification,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [destMeterError, setDestMeterError] = useState<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);

  const notify = (msg: string, type: "success" | "error" | "warning" = "success") => {
    if (showNotification) {
      showNotification(msg, type);
    } else {
      setToast({ message: msg, type });
    }
  };

  const farmAddress = trip.farmAddress || "";
  const remarks = trip.remarks || "";
  const avgBirdWeight = trip.avgBirdWeight || 0;
  const hasGps =
    trip.farmGpsLat != null &&
    trip.farmGpsLon != null &&
    Number.isFinite(Number(trip.farmGpsLat)) &&
    Number.isFinite(Number(trip.farmGpsLon)) &&
    !(Number(trip.farmGpsLat) === 0 && Number(trip.farmGpsLon) === 0);

  const farmOptions = farms
    .filter((farm: any) => {
      const active = String(farm.status ?? "Active") === "Active";
      return active || farm.id === trip.sourceFarmId;
    })
    .slice()
    .sort((a: any, b: any) => String(a.farmName ?? "").localeCompare(String(b.farmName ?? "")))
    .map((farm: any) => ({
      value: farm.id,
      label: farm.farmName,
    }));

  const selectStyles = {
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
    control: (base: any, state: any) => ({
      ...base,
      minHeight: 42,
      borderRadius: "0.75rem",
      borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
      backgroundColor: "#ffffff",
      boxShadow: state.isFocused ? "0 0 0 2px rgba(37, 99, 235, 0.15)" : "none",
      "&:hover": { borderColor: "#cbd5e1" },
    }),
    singleValue: (base: any) => ({
      ...base,
      color: "#0f172a",
      fontWeight: "500",
      fontSize: "14px",
    }),
    placeholder: (base: any) => ({
      ...base,
      color: "#94a3b8",
      fontSize: "14px",
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? "#2563eb" : isFocused ? "#f8fafc" : "#ffffff",
      color: isSelected ? "#ffffff" : "#1e293b",
      fontSize: "13px",
      cursor: "pointer",
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "0.75rem",
      maxHeight: 180,
      overflowY: "auto",
      scrollbarWidth: "none",
      ":-webkit-scrollbar": { display: "none" },
    }),
  };

  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      notify("Geolocation is not supported by your browser.", "error");
      return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180 ||
          (latitude === 0 && longitude === 0)
        ) {
          notify("GPS capture returned invalid coordinates. Existing GPS was not changed.", "error");
          setIsFetchingLocation(false);
          return;
        }
        updateTrip({
          farmGpsLat: latitude,
          farmGpsLon: longitude,
          farmGpsAccuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
          farmGpsTime: new Date(position.timestamp).toISOString(),
        });
        setIsFetchingLocation(false);
      },
      (error) => {
        notify("Unable to fetch location. Check browser permissions.", "error");
        setIsFetchingLocation(false);
        void error;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleFarmSelect = (option: { value: number; label: string } | null) => {
    const farm = farms.find((f: any) => f.id === option?.value);
    setTrip((prev) => ({
      ...prev,
      sourceFarmId: option?.value || 0,
      sourceFarm: option?.label || "",
      farmAddress: farm ? farmMasterAddress(farm) : "",
    }));
  };

  const handleDestMeterChange = (value: string) => {
    const num = value === "" ? 0 : Number(value);
    updateTrip({ destMeter: num });
    const prev = Number(trip.openingMeter ?? 0);
    const invalid = isMeterInvalid(num, prev) && num > 0;
    setDestMeterError(invalid ? meterMustBeGreaterThan(prev) : null);
  };

  const handleTollsChange = (value: string) => {
    if (value === "") {
      updateTrip({ pickupTolls: 0 });
      return;
    }
    const num = Number(value);
    updateTrip({ pickupTolls: Number.isFinite(num) && num < 0 ? 0 : Number.isFinite(num) ? num : 0 });
  };

  const handleSubmit = async () => {
    const validation = validateFarmStep(trip);
    if (!validation.valid) {
      notify(validation.errors[0], "warning");
      return;
    }
    if (destMeterError) {
      notify(destMeterError, "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await submitFarmStep({});
      if (success) {
        setIsLocalEditing(false);
        notify("Step 2 submitted successfully.", "success");
      } else {
        notify("Submission failed. Please try again.", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProgress = async () => {
    if (!saveFarmProgress) return;
    setIsSubmitting(true);
    try {
      const success = await saveFarmProgress({});
      if (success) notify("Progress saved successfully.", "success");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (trip.farmStepSubmitted && !editable && !isLocalEditing) {
    const destMeterLabel =
      trip.destMeter == null || Number(trip.destMeter) === 0
        ? "Not entered"
        : `${trip.destMeter} KM`;
    const avgWeightLabel =
      trip.avgBirdWeight == null || Number(trip.avgBirdWeight) === 0
        ? "Not entered"
        : `${Number(trip.avgBirdWeight).toFixed(2)} kg`;
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              2
            </span>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              {TRIP_STEP_DEFINITIONS[1].title.toUpperCase()}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
              title="Close Trip"
              aria-label="Close Trip"
            >
              <X size={14} />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsLocalEditing(true)}
                className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700 transition-all active:scale-95"
                title="Edit Step"
              >
                <Pencil size={14} />
              </button>
            )}
            <span className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap">
              Submitted & Locked
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Clock size={12} className="text-slate-500" /> Reached Time
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{trip.reachedTime || "Not entered"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Store size={12} className="text-blue-500" /> Farm
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{trip.sourceFarm || "Not entered"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs sm:col-span-2">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <MapPin size={12} className="text-slate-500" /> Farm Address
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{trip.farmAddress || "Not entered"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Gauge size={12} className="text-purple-500" /> Farm Meter
            </span>
            <span className="text-xs font-bold text-slate-800">{destMeterLabel}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Ticket size={12} className="text-violet-500" /> Tolls
            </span>
            <span className="text-xs font-bold text-slate-800">{trip.pickupTolls ?? 0}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Scale size={12} className="text-emerald-500" /> Avg Bird Weight
            </span>
            <span className="text-xs font-bold text-slate-800">{avgWeightLabel}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <MapPin size={12} className="text-slate-500" /> GPS
            </span>
            <span
              className="text-xs font-bold text-slate-800 truncate"
              title={
                hasGps
                  ? `${Number(trip.farmGpsLat).toFixed(6)}, ${Number(trip.farmGpsLon).toFixed(6)}`
                  : undefined
              }
            >
              {hasGps ? (
                <GpsAddressText lat={trip.farmGpsLat} lon={trip.farmGpsLon} fallback="Location captured" />
              ) : (
                "Not captured"
              )}
            </span>
          </div>
        </div>
        {trip.remarks ? (
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-400 uppercase text-[10px]">Remarks </span>
            {trip.remarks}
          </p>
        ) : null}

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between">
          <p className="text-xs text-slate-600 font-normal">Farm details submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .hide-spinner::-webkit-inner-spin-button,
        .hide-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .hide-spinner { -moz-appearance: textfield; appearance: none; }
      `}</style>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              2
            </span>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              {TRIP_STEP_DEFINITIONS[1].title.toUpperCase()}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
              title="Close Trip"
              aria-label="Close Trip"
            >
              <X size={14} />
            </button>
            {editable && trip.farmStepSubmitted && (
              <span className="text-xs text-slate-700 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap">
                Editable View
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 sm:gap-x-6 gap-y-3.5 sm:gap-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Clock size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.reachedTime.label}{" "}
              {TRIP_FIELD_DEFINITIONS.reachedTime.required && <span className="text-red-500">*</span>}
            </label>
            <div className="mt-1 h-[42px] bg-white border border-slate-200 rounded-xl px-4 flex items-center text-sm font-medium text-slate-800">
              {trip.reachedTime ? trip.reachedTime : <span className="text-slate-400 font-normal text-xs">Auto-captured on submit</span>}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Store size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.sourceFarmId.label}{" "}
              {TRIP_FIELD_DEFINITIONS.sourceFarmId.required && <span className="text-red-500">*</span>}
            </label>
            <Select<{ value: number; label: string }, false>
              options={farmOptions}
              getOptionLabel={(e) => e?.label || ""}
              getOptionValue={(e) => e?.value.toString() || ""}
              value={farmOptions.find((o) => o.value === trip.sourceFarmId) || null}
              onChange={handleFarmSelect}
              className="mt-1 text-sm"
              placeholder="Search Farm..."
              isSearchable
              styles={selectStyles}
              menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <MapPin size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.farmAddress.label}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={farmAddress}
              onChange={(e) => updateTrip({ farmAddress: e.target.value })}
              className="w-full mt-1 h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400"
              placeholder="Filled from Farm Master — required on submit"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <MapPin size={14} className="text-slate-400" /> GPS
            </label>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 min-w-0 h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 flex items-center">
                {hasGps ? (
                  <span className="truncate" title={`${Number(trip.farmGpsLat).toFixed(6)}, ${Number(trip.farmGpsLon).toFixed(6)}`}>
                    <GpsAddressText lat={trip.farmGpsLat} lon={trip.farmGpsLon} fallback="Location captured" />
                    {trip.farmGpsAccuracy != null ? ` (±${Number(trip.farmGpsAccuracy).toFixed(1)} m)` : ""}
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal text-xs">GPS: Not captured</span>
                )}
              </div>
              <button
                type="button"
                onClick={fetchCurrentLocation}
                disabled={isFetchingLocation}
                className="shrink-0 h-[42px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isFetchingLocation ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                <span className="hidden sm:inline">Get GPS</span>
              </button>
            </div>
            {hasGps && trip.farmGpsTime ? (
              <p className="text-[11px] text-slate-400 mt-1">Captured: {trip.farmGpsTime}</p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">GPS stays empty until you click Get GPS. Farm Address is separate.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Gauge size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.destMeter.label}{" "}
              {TRIP_FIELD_DEFINITIONS.destMeter.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={trip.destMeter === 0 ? "" : trip.destMeter ?? ""}
              onChange={(e) => handleDestMeterChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={`hide-spinner w-full mt-1 h-[42px] rounded-xl border ${
                destMeterError ? "border-red-500" : "border-slate-200"
              } bg-white px-4 text-sm font-medium text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400`}
              placeholder="0.00"
            />
            {destMeterError ? (
              <div className="mt-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                {destMeterError}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                Start Meter: <span className="font-semibold text-slate-600">{trip.openingMeter ?? "Not entered"} KM</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Ticket size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.pickupTolls.label}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={trip.pickupTolls ?? 0}
              onChange={(e) => handleTollsChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className="hide-spinner w-full mt-1 h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400"
              placeholder="0"
            />
            <p className="text-[11px] text-slate-400 mt-1">0 is valid. Negative values become 0.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Scale size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.avgBirdWeight.label}{" "}
              {TRIP_FIELD_DEFINITIONS.avgBirdWeight.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={avgBirdWeight === 0 ? "" : avgBirdWeight}
              onChange={(e) => {
                const val = e.target.value === "" ? 0 : Number(e.target.value);
                updateTrip({ avgBirdWeight: val });
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="hide-spinner w-full mt-1 h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400"
              placeholder="e.g., 1.5"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.remarks.label}
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => updateTrip({ remarks: e.target.value })}
              className="w-full mt-1 h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400"
              placeholder="Optional"
            />
          </div>
        </div>

        <WizardStepNotice
          notice={toast ? { type: toast.type === "warning" ? "info" : toast.type, message: toast.message } : null}
          dirty={hasUnsavedChanges}
        />
        <WizardActionBar
          onCancel={() => {
            if (isLocalEditing) {
              setIsLocalEditing(false);
              return;
            }
            onCancel?.();
          }}
          onSave={saveFarmProgress ? handleSaveProgress : undefined}
          onSubmit={handleSubmit}
          busy={isSubmitting}
          saveDisabled={!hasUnsavedChanges}
          submitDisabled={!!destMeterError}
          submitLabel={trip.farmStepSubmitted ? "Update Farm Details" : "Submit Farm Details"}
        />
      </div>
    </>
  );
}
