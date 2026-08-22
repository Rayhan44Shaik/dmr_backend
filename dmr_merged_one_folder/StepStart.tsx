// src/modules/operations/vehicle-trips/components/StepStart.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { Clock, User, Truck, Gauge, Wallet, Pencil, X } from "lucide-react";
import Select from "react-select";
import type { Trip } from "../types/trip";
import { validateStartStep } from "../../../../shared/trip/validation";
import { fetchLastClosingMeter } from "../services/tripHeaderApiService";
import { WizardActionBar, WizardStepNotice, type WizardNoticeState } from "./WizardStepUI";
import {
  TRIP_FIELD_DEFINITIONS,
  TRIP_STEP_DEFINITIONS,
} from "../../../../shared/trip/definitions";

type VehicleOption = { id: number; vehicleNumber: string };
type EmployeeOption = { id: number; employeeName: string; department: string };
type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  tripId: number;
  tripNo?: string;
  startTime: string;
  startStepSubmitted: boolean;
  loadSnapshot: Trip;
  updateTrip: (updates: Partial<Trip>) => void;
  submitStartStep: (data: Partial<Trip>) => Promise<boolean>;
  updateStartStep?: (data: Partial<Trip>) => Promise<boolean>;
  saveStartProgress?: (data: Partial<Trip>) => Promise<boolean>;
  hasUnsavedChanges?: boolean;
  vehicleOptions: VehicleOption[];
  employeeOptions: EmployeeOption[];
  editable?: boolean;
  canEdit?: boolean;
  onCancel?: () => void;
  clearForm?: () => void;
  headerLoading?: boolean;
  subscribeHeaderSaveStatus: (listener: () => void) => () => void;
  getHeaderSaveStatus: () => SaveStatus;
}

type Step1FormState = {
  vehicleId: number;
  vehicleNo: string;
  driverId: number;
  driverName: string;
  supervisorId: number;
  supervisorName: string;
  helpers: string[];
  loaders: string[];
  openingMeterText: string;
  advanceText: string;
};

const MENU_PORTAL_TARGET = typeof document !== "undefined" ? document.body : null;

const EMPTY_FORM: Step1FormState = {
  vehicleId: 0,
  vehicleNo: "",
  driverId: 0,
  driverName: "",
  supervisorId: 0,
  supervisorName: "",
  helpers: [],
  loaders: [],
  openingMeterText: "",
  advanceText: "",
};

function formatNumericField(value: number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function parseNumericField(text: string): number | null {
  if (text.trim() === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function tripToForm(trip: Trip): Step1FormState {
  return {
    vehicleId: trip.vehicleId,
    vehicleNo: trip.vehicleNo,
    driverId: trip.driverId,
    driverName: trip.driverName,
    supervisorId: trip.supervisorId,
    supervisorName: trip.supervisorName,
    helpers: trip.helpers ? [...trip.helpers] : [],
    loaders: trip.loaders ? [...trip.loaders] : [],
    openingMeterText: formatNumericField(trip.openingMeter),
    advanceText: formatNumericField(trip.advanceAmount),
  };
}

function formHasEdits(form: Step1FormState): boolean {
  return Boolean(
    form.vehicleId ||
    form.driverId ||
    form.supervisorId ||
    form.openingMeterText.trim() ||
    form.advanceText.trim() ||
    form.helpers.length ||
    form.loaders.length
  );
}

function formToTripPatch(form: Step1FormState): Partial<Trip> {
  return {
    vehicleId: form.vehicleId,
    vehicleNo: form.vehicleNo,
    driverId: form.driverId,
    driverName: form.driverName,
    supervisorId: form.supervisorId,
    supervisorName: form.supervisorName,
    helpers: form.helpers,
    loaders: form.loaders,
    openingMeter: parseNumericField(form.openingMeterText),
    advanceAmount: parseNumericField(form.advanceText),
  };
}

const getVehicleLabel = (option: VehicleOption) => option.vehicleNumber || "";
const getVehicleValue = (option: VehicleOption) => String(option.id ?? "");
const getEmployeeLabel = (option: EmployeeOption) => option.employeeName || "";
const getEmployeeValue = (option: EmployeeOption) => option.employeeName || "";

const selectStyles: any = {
  menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }),
  control: (base: any, state: any) => ({
    ...base,
    minHeight: 42,
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    backgroundColor: "#ffffff",
    boxShadow: state.isFocused ? "0 0 0 2px rgba(37, 99, 235, 0.15)" : "none",
    "&:hover": { borderColor: "#cbd5e1" },
  }),
  singleValue: (base: Record<string, unknown>) => ({
    ...base,
    color: "#0f172a",
    fontWeight: "500",
    fontSize: "14px",
  }),
  multiValue: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: "#f1f5f9",
    borderRadius: "0.375rem",
  }),
  multiValueLabel: (base: Record<string, unknown>) => ({
    ...base,
    color: "#0f172a",
    fontSize: "13px",
    paddingLeft: "6px",
    paddingRight: "6px",
  }),
  multiValueRemove: (base: Record<string, unknown>) => ({
    ...base,
    color: "#64748b",
    "&:hover": { backgroundColor: "#e2e8f0", color: "#0f172a" },
  }),
  placeholder: (base: Record<string, unknown>) => ({
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
  menu: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "0.75rem",
    maxHeight: 180,
    overflowY: "auto",
    scrollbarWidth: "none",
  }),
};

const StartTimeField = React.memo(function StartTimeField({ startTime }: { startTime: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <Clock size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.startTime.label} {TRIP_FIELD_DEFINITIONS.startTime.required && <span className="text-red-500">*</span>}
      </label>
      <div className="mt-1 h-[42px] bg-white border border-slate-200 rounded-xl px-4 flex items-center text-sm font-medium text-slate-800">
        {startTime ? (
          startTime
        ) : (
          <span className="text-slate-400 font-normal text-xs">Will be captured when trip starts</span>
        )}
      </div>
    </div>
  );
});

function buildSelectStyles(invalid: boolean): any {
  return {
    ...selectStyles,
    control: (base: any, state: any) => ({
      ...selectStyles.control(base, state),
      borderColor: invalid
        ? "#ef4444"
        : state.isFocused
          ? "#2563eb"
          : "#e2e8f0",
      boxShadow: invalid
        ? "0 0 0 2px rgba(239, 68, 68, 0.1)"
        : state.isFocused
          ? "0 0 0 2px rgba(37, 99, 235, 0.15)"
          : "none",
    }),
  };
}

const VehicleField = React.memo(function VehicleField({
  vehicleId,
  options,
  disabled,
  invalid,
  onSelect,
}: {
  vehicleId: number;
  options: VehicleOption[];
  disabled: boolean;
  invalid?: boolean;
  onSelect: (vehicleId: number, vehicleNo: string) => void;
}) {
  const value = useMemo(
    () => options.find((option) => option.id === vehicleId) || null,
    [options, vehicleId]
  );
  const handleChange = useCallback(
    (option: VehicleOption | null) => {
      onSelect(option?.id || 0, option?.vehicleNumber || "");
    },
    [onSelect]
  );
  const styles = useMemo(() => buildSelectStyles(Boolean(invalid)), [invalid]);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <Truck size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.vehicleId.label} {TRIP_FIELD_DEFINITIONS.vehicleId.required && <span className="text-red-500">*</span>}
      </label>
      <Select<VehicleOption, false>
        options={options}
        getOptionLabel={getVehicleLabel}
        getOptionValue={getVehicleValue}
        value={value}
        onChange={handleChange}
        className="mt-1 text-sm"
        placeholder="Search Vehicle..."
        isSearchable
        isDisabled={disabled}
        styles={styles}
        menuPortalTarget={MENU_PORTAL_TARGET}
      />
    </div>
  );
});

const SupervisorField = React.memo(function SupervisorField({
  supervisorName,
  options,
  disabled,
  invalid,
  onSelect,
}: {
  supervisorName: string;
  options: EmployeeOption[];
  disabled: boolean;
  invalid?: boolean;
  onSelect: (supervisorId: number, supervisorName: string) => void;
}) {
  const value = useMemo(
    () => options.find((option) => option.employeeName === supervisorName) || null,
    [options, supervisorName]
  );
  const handleChange = useCallback(
    (option: EmployeeOption | null) => {
      onSelect(option?.id || 0, option?.employeeName || "");
    },
    [onSelect]
  );
  const styles = useMemo(() => buildSelectStyles(Boolean(invalid)), [invalid]);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <User size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.supervisorId.label} {TRIP_FIELD_DEFINITIONS.supervisorId.required && <span className="text-red-500">*</span>}
      </label>
      <Select<EmployeeOption, false>
        options={options}
        getOptionLabel={getEmployeeLabel}
        getOptionValue={getEmployeeValue}
        value={value}
        onChange={handleChange}
        className="mt-1 text-sm"
        placeholder="Search Supervisor..."
        isSearchable
        isDisabled={disabled}
        styles={styles}
        menuPortalTarget={MENU_PORTAL_TARGET}
      />
    </div>
  );
});

const DriverField = React.memo(function DriverField({
  driverName,
  options,
  disabled,
  invalid,
  onSelect,
}: {
  driverName: string;
  options: EmployeeOption[];
  disabled: boolean;
  invalid?: boolean;
  onSelect: (driverId: number, driverName: string) => void;
}) {
  const value = useMemo(
    () => options.find((option) => option.employeeName === driverName) || null,
    [options, driverName]
  );
  const handleChange = useCallback(
    (option: EmployeeOption | null) => {
      onSelect(option?.id || 0, option?.employeeName || "");
    },
    [onSelect]
  );
  const styles = useMemo(() => buildSelectStyles(Boolean(invalid)), [invalid]);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <User size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.driverId.label} {TRIP_FIELD_DEFINITIONS.driverId.required && <span className="text-red-500">*</span>}
      </label>
      <Select<EmployeeOption, false>
        options={options}
        getOptionLabel={getEmployeeLabel}
        getOptionValue={getEmployeeValue}
        value={value}
        onChange={handleChange}
        className="mt-1 text-sm"
        placeholder="Search Driver..."
        isSearchable
        isDisabled={disabled}
        styles={styles}
        menuPortalTarget={MENU_PORTAL_TARGET}
      />
    </div>
  );
});

const OpeningMeterField = React.memo(function OpeningMeterField({
  value,
  disabled,
  invalid,
  error,
  onChange,
}: {
  value: string;
  disabled: boolean;
  invalid?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
}) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange]
  );
  const handleWheel = useCallback((event: React.WheelEvent<HTMLInputElement>) => {
    event.currentTarget.blur();
  }, []);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <Gauge size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.openingMeter.label} {TRIP_FIELD_DEFINITIONS.openingMeter.required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onWheel={handleWheel}
        disabled={disabled}
        className={`hide-spinner w-full mt-1 h-[42px] rounded-xl border bg-white px-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 ${
          invalid
            ? "border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/10"
            : "border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10"
        }`}
        placeholder="0.00"
      />
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600 flex items-start gap-1">
          <span aria-hidden>⚠</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
});

const AdvanceField = React.memo(function AdvanceField({
  value,
  disabled,
  invalid,
  onChange,
}: {
  value: string;
  disabled: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange]
  );
  const handleWheel = useCallback((event: React.WheelEvent<HTMLInputElement>) => {
    event.currentTarget.blur();
  }, []);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <Wallet size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.advanceAmount.label} {TRIP_FIELD_DEFINITIONS.advanceAmount.required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onWheel={handleWheel}
        disabled={disabled}
        className={`hide-spinner w-full mt-1 h-[42px] rounded-xl border bg-white px-4 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 ${
          invalid
            ? "border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/10"
            : "border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10"
        }`}
        placeholder="0.00"
      />
    </div>
  );
});

const HelpersField = React.memo(function HelpersField({
  helpers,
  options,
  disabled,
  invalid,
  onChange,
}: {
  helpers: string[];
  options: EmployeeOption[];
  disabled: boolean;
  invalid?: boolean;
  onChange: (helpers: string[]) => void;
}) {
  const value = useMemo(
    () => options.filter((option) => helpers.includes(option.employeeName)),
    [options, helpers]
  );
  const handleChange = useCallback(
    (selected: readonly EmployeeOption[] | null) => {
      onChange(selected ? selected.map((option) => option.employeeName) : []);
    },
    [onChange]
  );
  const styles = useMemo(() => buildSelectStyles(Boolean(invalid)), [invalid]);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <User size={14} className="text-slate-400" /> {TRIP_FIELD_DEFINITIONS.helpers.label} {TRIP_FIELD_DEFINITIONS.helpers.required && <span className="text-red-500">*</span>}
      </label>
      <Select<EmployeeOption, true>
        options={options}
        getOptionLabel={getEmployeeLabel}
        getOptionValue={getEmployeeValue}
        value={value}
        onChange={handleChange}
        className="mt-1 text-sm"
        placeholder="Select helpers..."
        isMulti
        isSearchable
        isDisabled={disabled}
        styles={styles}
        menuPortalTarget={MENU_PORTAL_TARGET}
      />
    </div>
  );
});

const LoadersField = React.memo(function LoadersField({
  loaders,
  options,
  disabled,
  invalid,
  onChange,
}: {
  loaders: string[];
  options: EmployeeOption[];
  disabled: boolean;
  invalid?: boolean;
  onChange: (loaders: string[]) => void;
}) {
  const value = useMemo(
    () => options.filter((option) => loaders.includes(option.employeeName)),
    [options, loaders]
  );
  const handleChange = useCallback(
    (selected: readonly EmployeeOption[] | null) => {
      onChange(selected ? selected.map((option) => option.employeeName) : []);
    },
    [onChange]
  );
  const styles = useMemo(() => buildSelectStyles(Boolean(invalid)), [invalid]);

  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <User size={14} className="text-amber-500" /> {TRIP_FIELD_DEFINITIONS.loaders.label} {TRIP_FIELD_DEFINITIONS.loaders.required && <span className="text-red-500">*</span>}
      </label>
      <Select<EmployeeOption, true>
        options={options}
        getOptionLabel={getEmployeeLabel}
        getOptionValue={getEmployeeValue}
        value={value}
        onChange={handleChange}
        className="mt-1 text-sm"
        placeholder="Select loaders..."
        isMulti
        isSearchable
        isDisabled={disabled}
        styles={styles}
        menuPortalTarget={MENU_PORTAL_TARGET}
      />
    </div>
  );
});

function StepStart({
  tripId,
  tripNo,
  startTime,
  startStepSubmitted,
  loadSnapshot,
  updateTrip,
  submitStartStep,
  updateStartStep,
  hasUnsavedChanges = false,
  vehicleOptions,
  employeeOptions,
  editable = false,
  canEdit = false,
  onCancel,
  clearForm,
  headerLoading = false,
  subscribeHeaderSaveStatus: _subscribeHeaderSaveStatus,
  getHeaderSaveStatus: _getHeaderSaveStatus,
}: Props) {
  const [form, setForm] = useState<Step1FormState>(() => tripToForm(loadSnapshot));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<WizardNoticeState>(null);
  const [latestMeter, setLatestMeter] = useState<{
    meter: number;
    tripNo: string;
    tripDate: string;
  } | null>(null);

  const loadedTripIdRef = useRef(tripId);
  const formRef = useRef(form);
  formRef.current = form;

  // Opening-meter reference: the vehicle's latest recorded reading. Used for
  // field-level validation only — the backend remains the authority on submit.
  useEffect(() => {
    if (!form.vehicleId) {
      setLatestMeter(null);
      return;
    }
    let cancelled = false;
    setLatestMeter(null);
    fetchLastClosingMeter(form.vehicleId)
      .then((data) => {
        if (cancelled) return;
        if (!data || data.closingMeter == null) {
          setLatestMeter(null);
          return;
        }
        // Self-exclusion when editing: the latest event may be THIS trip's own
        // start/end meter, which must never constrain its own opening reading.
        const isSelf =
          tripId > 0 &&
          (data.source === "TRIP_START" || data.source === "TRIP_END") &&
          String(data.ref) === String(tripId);
        setLatestMeter(
          isSelf
            ? null
            : { meter: data.closingMeter, tripNo: data.tripNo, tripDate: data.tripDate }
        );
      })
      .catch(() => {
        if (!cancelled) setLatestMeter(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.vehicleId, tripId]);

  const driverOptions = useMemo(
    () => employeeOptions.filter((employee) => employee.department === "Driver"),
    [employeeOptions]
  );
  const supervisorOptions = useMemo(
    () => employeeOptions.filter((employee) => employee.department === "Supervisor"),
    [employeeOptions]
  );
  const helperOptions = useMemo(
    () => employeeOptions.filter((employee) => employee.department === "Helper" || employee.department === "Labor"),
    [employeeOptions]
  );
  const loaderOptions = useMemo(
    () => employeeOptions.filter((employee) => employee.department === "Loader"),
    [employeeOptions]
  );

  useEffect(() => {
    if (loadedTripIdRef.current === tripId) return;
    const previousId = loadedTripIdRef.current;
    loadedTripIdRef.current = tripId;

    if (tripId === 0 && previousId !== 0) {
      formRef.current = EMPTY_FORM;
      setForm(EMPTY_FORM);
      return;
    }

    if (previousId === 0 && tripId !== 0 && formHasEdits(formRef.current)) {
      return;
    }

    if (previousId !== tripId) {
      const loadedForm = tripToForm(loadSnapshot);
      formRef.current = loadedForm;
      setForm(loadedForm);
    }
  }, [tripId, loadSnapshot]);

  useEffect(() => {
    updateTrip(formToTripPatch(form));
  }, [form, updateTrip]);

  const patchForm = useCallback((updates: Partial<Step1FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...updates };
      formRef.current = next;
      return next;
    });
  }, []);

  const handleVehicleSelect = useCallback((vehicleId: number, vehicleNo: string) => {
    patchForm({ vehicleId, vehicleNo });
  }, [patchForm]);

  const handleSupervisorSelect = useCallback((supervisorId: number, supervisorName: string) => {
    patchForm({ supervisorId, supervisorName });
  }, [patchForm]);

  const handleDriverSelect = useCallback((driverId: number, driverName: string) => {
    patchForm({ driverId, driverName });
  }, [patchForm]);

  const handleHelpersChange = useCallback((helpers: string[]) => {
    patchForm({ helpers });
  }, [patchForm]);

  const handleLoadersChange = useCallback((loaders: string[]) => {
    patchForm({ loaders });
  }, [patchForm]);

  const handleOpeningMeterChange = useCallback((openingMeterText: string) => {
    patchForm({ openingMeterText });
  }, [patchForm]);

  const handleAdvanceChange = useCallback((advanceText: string) => {
    patchForm({ advanceText });
  }, [patchForm]);

  const fieldInvalid = useMemo(() => {
    const patch = formToTripPatch(form);
    const meterValue = Number(form.openingMeterText);
    const meterNumericBad =
      form.openingMeterText.trim() !== "" && (!Number.isFinite(meterValue) || meterValue < 0);
    // Field-level live rule: the opening reading must be strictly greater than
    // the vehicle's latest recorded reading (equal is invalid). This is the ONLY
    // field with live validation — all other Step 1 fields only flag after a
    // submit attempt (showErrors), so the user is never shown red borders while
    // simply filling the form.
    const meterBelowLatest =
      form.openingMeterText.trim() !== "" &&
      latestMeter != null &&
      Number.isFinite(meterValue) &&
      meterValue <= latestMeter.meter;
    return {
      vehicle: showErrors && (!patch.vehicleId || !patch.vehicleNo),
      supervisor: showErrors && (!patch.supervisorId || !patch.supervisorName),
      driver: showErrors && (!patch.driverId || !patch.driverName),
      // KM / Advance are OPTIONAL — an empty value is valid (saved as NULL).
      // Only a non-empty value that is not a valid non-negative number is flagged.
      openingMeter: (showErrors && meterNumericBad) || meterBelowLatest,
      advance:
        showErrors &&
        form.advanceText.trim() !== "" &&
        (!Number.isFinite(Number(form.advanceText)) || Number(form.advanceText) < 0),
      helpers: showErrors && (!patch.helpers || patch.helpers.length === 0),
      loaders: showErrors && (!patch.loaders || patch.loaders.length === 0),
    };
  }, [form, showErrors, latestMeter]);

  const openingMeterError = useMemo(() => {
    const meterValue = Number(form.openingMeterText);
    const meterNumericBad =
      form.openingMeterText.trim() !== "" && (!Number.isFinite(meterValue) || meterValue < 0);
    if (showErrors && meterNumericBad) {
      return "Enter a valid non-negative meter reading.";
    }
    if (
      form.openingMeterText.trim() !== "" &&
      latestMeter != null &&
      Number.isFinite(meterValue) &&
      meterValue <= latestMeter.meter
    ) {
      const ref = latestMeter.tripNo ? ` (from ${latestMeter.tripNo})` : "";
      return `Reading must be greater than the vehicle's latest recorded reading of ${latestMeter.meter} KM${ref}.`;
    }
    return null;
  }, [form.openingMeterText, latestMeter, showErrors]);

  const handleFormKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON") return;
    event.preventDefault();
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (!startStepSubmitted && clearForm) {
      clearForm();
    } else if (editable && onCancel) {
      onCancel();
    } else {
      setIsLocalEditing(false);
    }
  }, [startStepSubmitted, clearForm, editable, onCancel]);

  const handleCloseStep = useCallback(() => {
    if (clearForm) {
      clearForm();
    } else if (onCancel) {
      onCancel();
    } else {
      setIsLocalEditing(false);
    }
  }, [clearForm, onCancel]);

  const inputsLocked = headerLoading || isSubmitting;
  const submitLabel = startStepSubmitted
    ? "Update Start Details"
    : "Submit Start Details";

  const handleSubmit = useCallback(async () => {
    const patch = formToTripPatch(formRef.current);
    const candidate = {
      ...loadSnapshot,
      ...patch,
      tripDate: loadSnapshot.tripDate,
      startStepSubmitted: false,
    } as Trip;
    const validation = validateStartStep(candidate);
    if (!validation.valid) {
      setShowErrors(true);
      setNotice({ type: "error", message: validation.errors[0] || "Please complete required fields." });
      return;
    }

    setShowErrors(false);
    setIsSubmitting(true);
    updateTrip(patch);
    // Editing an already-submitted Step 1 must re-submit via the existing-trip
    // submit endpoint (updateStartStep) so the step STAYS submitted and the
    // backend re-validates changed resources/meters. saveStartProgress is save
    // mode and would strip start_step_submitted — only used for a NEW trip's
    // manual "Save Progress" button, never for editing a submitted Step 1.
    const success =
      tripId > 0 && startStepSubmitted
        ? updateStartStep
          ? await updateStartStep(patch)
          : await submitStartStep(patch)
        : await submitStartStep(patch);
    if (success) {
      setIsLocalEditing(false);
      setNotice({ type: "success", message: "Step 1 submitted successfully." });
    }
    setIsSubmitting(false);
  }, [loadSnapshot, submitStartStep, updateStartStep, startStepSubmitted, tripId, updateTrip]);

  if (startStepSubmitted && !editable && !isLocalEditing) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              1
            </span>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">{TRIP_STEP_DEFINITIONS[0].title.toUpperCase()}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCloseStep}
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
              Trip Number
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{loadSnapshot.tripNo || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Clock size={12} className="text-slate-500" /> Start Time
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{startTime || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Truck size={12} className="text-blue-500" /> Vehicle No.
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{loadSnapshot.vehicleNo || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <User size={12} className="text-indigo-500" /> Supervisor
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{loadSnapshot.supervisorName || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <User size={12} className="text-emerald-500" /> Driver
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{loadSnapshot.driverName || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Gauge size={12} className="text-purple-500" /> Opening Meter
            </span>
            <span className="text-xs font-bold text-slate-800">
              {loadSnapshot.openingMeter == null
                ? "Not entered"
                : `${loadSnapshot.openingMeter} KM`}
            </span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Wallet size={12} className="text-amber-500" /> Advance / Expenses
            </span>
            <span className="text-xs font-bold text-slate-800">
              {loadSnapshot.advanceAmount == null
                ? "Not entered"
                : `₹${loadSnapshot.advanceAmount.toLocaleString()}`}
            </span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs sm:col-span-1">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <User size={12} className="text-slate-500" /> Helpers
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{loadSnapshot.helpers?.join(", ") || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs sm:col-span-1">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <User size={12} className="text-amber-500" /> Loaders
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">
              {loadSnapshot.loaders?.join(", ") || "--"}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between">
          <p className="text-xs text-slate-600 font-normal">Start details submitted successfully.</p>
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
      <div
        className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-sm"
        onKeyDown={handleFormKeyDown}
      >
        {headerLoading && <p className="text-xs text-slate-500">Loading trip header...</p>}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              1
            </span>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">{TRIP_STEP_DEFINITIONS[0].title.toUpperCase()}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCloseStep}
              className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
              title="Close Trip"
              aria-label="Close Trip"
            >
              <X size={14} />
            </button>
            {((editable && startStepSubmitted) || isLocalEditing) && (
              <span className="text-xs text-slate-700 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap">
                {tripNo ? `Editing Trip ${tripNo}` : "Editable View"}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 sm:gap-x-6 gap-y-4 sm:gap-y-5">
          <StartTimeField startTime={startTime} />
          <VehicleField
            vehicleId={form.vehicleId}
            options={vehicleOptions}
            disabled={inputsLocked}
            invalid={fieldInvalid.vehicle}
            onSelect={handleVehicleSelect}
          />
          <SupervisorField
            supervisorName={form.supervisorName}
            options={supervisorOptions}
            disabled={inputsLocked}
            invalid={fieldInvalid.supervisor}
            onSelect={handleSupervisorSelect}
          />
          <DriverField
            driverName={form.driverName}
            options={driverOptions}
            disabled={inputsLocked}
            invalid={fieldInvalid.driver}
            onSelect={handleDriverSelect}
          />
          <OpeningMeterField
            value={form.openingMeterText}
            disabled={inputsLocked}
            invalid={fieldInvalid.openingMeter}
            error={openingMeterError}
            onChange={handleOpeningMeterChange}
          />
          <AdvanceField
            value={form.advanceText}
            disabled={inputsLocked}
            invalid={fieldInvalid.advance}
            onChange={handleAdvanceChange}
          />
          <div className="col-span-1 sm:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <HelpersField
                helpers={form.helpers}
                options={helperOptions}
                disabled={inputsLocked}
                invalid={fieldInvalid.helpers}
                onChange={handleHelpersChange}
              />
              <LoadersField
                loaders={form.loaders}
                options={loaderOptions}
                disabled={inputsLocked}
                invalid={fieldInvalid.loaders}
                onChange={handleLoadersChange}
              />
            </div>
          </div>
        </div>

        <WizardStepNotice notice={notice} dirty={hasUnsavedChanges} />
        <WizardActionBar
          onCancel={handleCancelEdit}
          // Step 1 has NO "Save Progress": opening the page never creates a
          // draft, and Start Details are only persisted on submit.
          onSubmit={handleSubmit}
          busy={inputsLocked}
          saveDisabled={!hasUnsavedChanges}
          submitLabel={submitLabel}
        />
      </div>
    </>
  );
}

function areStepStartPropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.tripId === next.tripId &&
    prev.tripNo === next.tripNo &&
    prev.startTime === next.startTime &&
    prev.startStepSubmitted === next.startStepSubmitted &&
    prev.editable === next.editable &&
    prev.canEdit === next.canEdit &&
    prev.headerLoading === next.headerLoading &&
    prev.vehicleOptions === next.vehicleOptions &&
    prev.employeeOptions === next.employeeOptions &&
    prev.updateTrip === next.updateTrip &&
    prev.submitStartStep === next.submitStartStep &&
    prev.hasUnsavedChanges === next.hasUnsavedChanges &&
    prev.onCancel === next.onCancel &&
    prev.clearForm === next.clearForm &&
    prev.subscribeHeaderSaveStatus === next.subscribeHeaderSaveStatus &&
    prev.getHeaderSaveStatus === next.getHeaderSaveStatus &&
    prev.loadSnapshot === next.loadSnapshot
  );
}

export default React.memo(StepStart, areStepStartPropsEqual);