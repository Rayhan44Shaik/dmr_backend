// src/modules/operations/fuel-expenses/components/FuelEntryForm.tsx

import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import Select from "react-select";
import { MapPin, Upload, X, Loader2 } from "lucide-react";
import type { FuelExpense, FuelExpenseDraft } from "../types/fuelExpense";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { opsReactSelectStyles } from "../../../../shared/ui/operationsStyles";

interface Props {
  onSave: (data: FuelExpenseDraft) => void;
  onUpdate: (id: string, updates: Partial<FuelExpense>) => void;
  editingId?: string | null;
  initialData?: FuelExpense | null;
  vehicles: any[];
  drivers: any[];
  supervisors: any[];
  onCancel?: () => void;
}

export interface FuelEntryFormRef {
  resetForm: () => void;
}

export const FuelEntryForm = forwardRef<FuelEntryFormRef, Props>(({
  onSave,
  onUpdate,
  editingId,
  initialData,
  vehicles,
  drivers,
  supervisors,
  onCancel,
}, ref) => {
  const { showNotification } = useSafeNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehicleId, setVehicleId] = useState<number>(0);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverId, setDriverId] = useState<number>(0);
  const [driverName, setDriverName] = useState("");
  const [supervisorId, setSupervisorId] = useState<number>(0);
  const [supervisorName, setSupervisorName] = useState("");
  const [meterReading, setMeterReading] = useState<number>(0);
  const [minMeterReading, setMinMeterReading] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [litres, setLitres] = useState<number>(0);
  const [petrolBunk, setPetrolBunk] = useState("");
  const [remarks, setRemarks] = useState("");
  const [image, setImage] = useState<string>("");
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLon, setGpsLon] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsCapturedAt, setGpsCapturedAt] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const activeVehicles = vehicles.filter(v => (v.status?.toLowerCase() === "active"));

  // ✅ Validator used for min meter reading checks; warning banner intentionally not shown

  useEffect(() => {
    if (initialData && editingId) {
      setDate(initialData.date);
      setVehicleId(initialData.vehicleId);
      setVehicleNo(initialData.vehicleNo);
      setDriverId(initialData.driverId);
      setDriverName(initialData.driverName);
      setSupervisorId(initialData.supervisorId);
      setSupervisorName(initialData.supervisorName);
      setMeterReading(initialData.meterReading);
      setMinMeterReading(initialData.meterReading);
      setAmount(initialData.amount);
      setRate(initialData.rate);
      setLitres(initialData.litres);
      setPetrolBunk(initialData.petrolBunk);
      setRemarks(initialData.remarks || "");
      setImage(initialData.image || "");
      setImageName(initialData.imageName || "");
      setGpsLat(initialData.gpsLat ?? null);
      setGpsLon(initialData.gpsLon ?? null);
      setGpsAccuracy(initialData.gpsAccuracy ?? null);
      setGpsCapturedAt(initialData.gpsCapturedAt ?? null);
    }
  }, [initialData, editingId]);

  useEffect(() => {
    if (litres > 0 && rate > 0) {
      setAmount(Number((litres * rate).toFixed(2)));
    } else {
      setAmount(0);
    }
  }, [litres, rate]);

  const resetForm = () => {
    setDate(new Date().toISOString().split("T")[0]);
    setVehicleId(0);
    setVehicleNo("");
    setDriverId(0);
    setDriverName("");
    setSupervisorId(0);
    setSupervisorName("");
    setMeterReading(0);
    setMinMeterReading(0);
    setAmount(0);
    setRate(0);
    setLitres(0);
    setPetrolBunk("");
    setRemarks("");
    setImage("");
    setImageName("");
    setGpsLat(null);
    setGpsLon(null);
    setGpsAccuracy(null);
    setGpsCapturedAt(null);
    setGpsError(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useImperativeHandle(ref, () => ({
    resetForm,
  }));

  const vehicleOptions = activeVehicles.map((v) => ({ value: v.id, label: v.vehicleNumber }));
  const driverOptions = drivers.map((d) => ({ value: d.id, label: d.employeeName }));
  const supervisorOptions = supervisors.map((s) => ({ value: s.id, label: s.employeeName }));

  const selectStyles = opsReactSelectStyles();

  const handleVehicleChange = (selected: any) => {
    const v = activeVehicles.find((x) => x.id === selected?.value);
    if (v) {
      setVehicleId(v.id);
      setVehicleNo(v.vehicleNumber);
      if (!editingId) {
        setMeterReading(0);
        setMinMeterReading(0);
      }
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) return;
    if (file.size === 0) {
      setFileError("Bill photo is empty.");
      return;
    }
    if (file.size > 1_048_576) {
      setFileError("Bill photo exceeds 1 MB.");
      return;
    }
    if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
      setFileError("Bill photo must be a JPEG or PNG image.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage("");
    setImageName("");
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const fetchGPSLocation = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported.");
      showNotification("Geolocation not supported.", "error");
      return;
    }
    setIsFetchingLocation(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setGpsLat(latitude);
        setGpsLon(longitude);
        setGpsAccuracy(accuracy);
        setGpsCapturedAt(new Date().toISOString());
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`
          );
          const data = await response.json();
          if (data && data.display_name) {
            setPetrolBunk(data.display_name);
          }
        } catch {
          /* keep coordinates even if reverse geocode fails */
        } finally {
          setIsFetchingLocation(false);
        }
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "GPS permission denied."
            : err.code === err.TIMEOUT
              ? "GPS timed out."
              : "GPS location unavailable.";
        setGpsError(message);
        showNotification(message, "error");
        setIsFetchingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = () => {
    if (!date || !vehicleId || litres <= 0 || rate <= 0) {
      showNotification("Please fill date, vehicle, litres, and rate.", "error");
      return;
    }
    if (fileError) {
      showNotification(fileError, "error");
      return;
    }

    const data: FuelExpenseDraft = {
      date,
      vehicleId,
      vehicleNo,
      driverId,
      driverName,
      supervisorId,
      supervisorName,
      meterReading,
      amount,
      rate,
      litres,
      petrolBunk,
      remarks,
      image,
      imageName,
      gpsLat,
      gpsLon,
      gpsAccuracy,
      gpsCapturedAt,
    };
    if (editingId) {
      onUpdate(editingId, data);
    } else {
      onSave(data);
      resetForm();
    }
  };

  return (
    <>
      <style>{`
        .no-spinner::-webkit-inner-spin-button,
        .no-spinner::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">
          {editingId ? "Edit Fuel Bill" : "Add Fuel Bill"}
        </h3>

        {/* ✅ Removed the pending warning banner */}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Date */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Date <span className="text-red-500">*</span></label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500" />
          </div>

          {/* Vehicle */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Vehicle <span className="text-red-500">*</span></label>
            <Select options={vehicleOptions} value={vehicleOptions.find((opt) => opt.value === vehicleId) || null} onChange={handleVehicleChange} isSearchable placeholder="Select Vehicle" styles={selectStyles} />
          </div>

          {/* Driver */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Driver <span className="text-red-500">*</span></label>
            <Select options={driverOptions} value={driverOptions.find((opt) => opt.value === driverId) || null} onChange={(selected) => { const d = drivers.find((x) => x.id === selected?.value); if (d) { setDriverId(d.id); setDriverName(d.employeeName); } }} isSearchable placeholder="Select Driver" styles={selectStyles} />
          </div>

          {/* Supervisor */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Supervisor <span className="text-red-500">*</span></label>
            <Select options={supervisorOptions} value={supervisorOptions.find((opt) => opt.value === supervisorId) || null} onChange={(selected) => { const s = supervisors.find((x) => x.id === selected?.value); if (s) { setSupervisorId(s.id); setSupervisorName(s.employeeName); } }} isSearchable placeholder="Select Supervisor" styles={selectStyles} />
          </div>

          {/* Meter Reading */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Meter Reading (KM) <span className="text-red-500">*</span></label>
            <input type="number" value={meterReading || ""} onChange={(e) => setMeterReading(Number(e.target.value))} className="no-spinner w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500" placeholder="0" />
            {minMeterReading > 0 && (
              <div className="text-[10px] text-slate-400 mt-0.5">Minimum allowed: {minMeterReading} KM</div>
            )}
          </div>

          {/* Litres */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Fuel Quantity (Litres) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={litres || ""} onChange={(e) => setLitres(Number(e.target.value))} className="no-spinner w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500" placeholder="0.00" />
          </div>

          {/* Rate */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Fuel Rate (₹/Litre) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} className="no-spinner w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500" placeholder="0.00" />
          </div>

          {/* Amount (preview) */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Amount (₹) — litres × rate</label>
            <input type="number" step="0.01" value={amount} readOnly className="no-spinner w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700" />
          </div>

          {/* Petrol Bunk with GPS button */}
          <div className="lg:col-span-2">
            <label className="text-xs font-medium text-slate-500 block mb-1">Petrol Bunk <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-2">
              <input type="text" value={petrolBunk} onChange={(e) => setPetrolBunk(e.target.value)} className="flex-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500" placeholder="Enter bunk name" />
              <button
                type="button"
                onClick={fetchGPSLocation}
                disabled={isFetchingLocation}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-200 transition disabled:opacity-60"
              >
                {isFetchingLocation ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                <span className="hidden sm:inline">GPS</span>
              </button>
            </div>
            {gpsLat != null && gpsLon != null ? (
              <div className="text-[10px] text-emerald-700 mt-1">
                GPS captured: {gpsLat.toFixed(6)}, {gpsLon.toFixed(6)}
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 mt-1">GPS not captured</div>
            )}
            {gpsError && <div className="text-[10px] text-red-600 mt-1">{gpsError}</div>}
          </div>

          {/* Image Upload */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Bill Image</label>
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-200 transition"
              >
                <Upload size={16} className="inline mr-1" /> Upload
              </button>
              {image && (
                <button type="button" onClick={removeImage} className="text-red-500 hover:text-red-700">
                  <X size={18} />
                </button>
              )}
            </div>
            {fileError && <div className="text-[10px] text-red-600 mt-1">{fileError}</div>}
            {image && (
              <div className="mt-1">
                <img src={image} alt="Bill" className="max-h-12 rounded border border-slate-200" />
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="lg:col-span-3">
            <label className="text-xs font-medium text-slate-500 block mb-1">Remarks (Optional)</label>
            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500" placeholder="Any remarks..." />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
          )}
          <button onClick={handleSubmit} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-sm transition active:scale-95">
            {editingId ? "Update Bill" : "Save Bill"}
          </button>
        </div>
      </div>
    </>
  );
});

FuelEntryForm.displayName = "FuelEntryForm";