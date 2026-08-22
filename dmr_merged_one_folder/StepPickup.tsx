import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Scale, Bird, Box, Gauge, Clock, Pencil,
  Plus, Trash2, FileText, AlertTriangle, Camera, Download, X
} from "lucide-react";
import type { Trip, BoxDetail } from "../types/trip";
import { getVehicles } from "../../../masters/vehicles/services/vehicleService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { WizardActionBar, WizardStepNotice } from "./WizardStepUI";
import { calculatePickupTotals, calculateBoxAvgWeight } from "../../../../shared/trip/calculations";
import {
  TRIP_FIELD_DEFINITIONS,
  TRIP_STEP_DEFINITIONS,
} from "../../../../shared/trip/definitions";

interface Props {
  trip: Trip;
  setTrip: React.Dispatch<React.SetStateAction<Trip>>;
  updateTrip: (updates: Partial<Trip>) => void;
  updateBoxDetails: (rows: BoxDetail[], persistToStorage?: boolean, silent?: boolean) => void;
  submitPickupStep: (data: Partial<Trip>) => boolean | Promise<boolean>;
  savePickupProgress?: (data: Partial<Trip>) => Promise<boolean>;
  editable?: boolean;
  canEdit?: boolean;
  onCancel?: () => void;
  clearForm?: () => void;
}

type Row = BoxDetail & { uid: string };
type PickupPhoto = { key: string; mime: string; data: string };
const generateUid = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
const makeRow = (boxNo: number): Row => ({
  uid: generateUid(),
  boxNo,
  birds: 0,
  weight: 0,
  avgWeight: null,
});

function formatAvg(birds: number, weight: number, stored?: number | null) {
  const avg = stored != null && Number.isFinite(stored) && stored > 0
    ? stored
    : calculateBoxAvgWeight(birds, weight);
  return avg == null ? "—" : String(avg);
}

function photosFromTrip(trip: Trip): PickupPhoto[] {
  const out: PickupPhoto[] = [];
  if (trip.dcPhotoData && trip.dcPhotoData.startsWith("data:image/")) {
    out.push({
      key: trip.dcPhotoKey || `dc_photo_${trip.id}_1`,
      mime: trip.dcPhotoMime || "image/jpeg",
      data: trip.dcPhotoData,
    });
  }
  if (trip.dcPhotoData2 && trip.dcPhotoData2.startsWith("data:image/")) {
    out.push({
      key: trip.dcPhotoKey2 || `dc_photo_${trip.id}_2`,
      mime: trip.dcPhotoMime2 || "image/jpeg",
      data: trip.dcPhotoData2,
    });
  }
  return out.slice(0, 2);
}

// ─── Confirmation Modal ──────────────────────────────────────────────
interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "warning" | "info";
}

function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = "Yes, Proceed",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  type = "warning",
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const iconColor = type === "warning" ? "text-amber-600" : "text-blue-600";
  const borderColor = type === "warning" ? "border-amber-200" : "border-slate-200";
  const bgGradient = type === "warning"
    ? "from-amber-50 to-orange-50"
    : "from-blue-50 to-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border ${borderColor}`}>
        <div className={`bg-gradient-to-br ${bgGradient} p-6`}>
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 p-2 rounded-full bg-white/60 border ${borderColor}`}>
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
            className="px-5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-600 transition-all hover:shadow-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] ${
              type === "warning"
                ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StepPickup({
  trip,
  setTrip: _setTrip,
  updateTrip,
  updateBoxDetails: _updateBoxDetails,
  submitPickupStep,
  savePickupProgress,
  editable = false,
  canEdit = false,
  onCancel,
  clearForm,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [removedBoxNos, setRemovedBoxNos] = useState<number[]>([]);
  const [rows, setRows] = useState<Row[]>(() => {
    const details = trip.boxDetails || [];
    return details.length > 0 ? details.map((d) => ({ ...d, uid: generateUid() })) : [makeRow(1)];
  });

  const maxBoxes = useMemo(() => {
    if (trip.vehicleBoxCapacity && trip.vehicleBoxCapacity > 0) return trip.vehicleBoxCapacity;
    try {
      const vehicles = getVehicles();
      const matched = vehicles.find(
        (v) =>
          v.vehicleNumber?.trim().toLowerCase() === trip.vehicleNo?.trim().toLowerCase()
      );
      return matched?.noOfBoxes && matched.noOfBoxes > 0 ? matched.noOfBoxes : 0;
    } catch {
      return 0;
    }
  }, [trip.vehicleNo, trip.vehicleBoxCapacity]);

  const [photos, setPhotos] = useState<PickupPhoto[]>(() => photosFromTrip(trip));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedPhotosRef = useRef<PickupPhoto[]>(photosFromTrip(trip));

  // ─── Toast state ────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ─── Confirmation state ─────────────────────────────────────────────
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

  const hasUnsavedChanges = useMemo(() => {
    const currentBoxes = rows.map(({ uid, ...rest }) => rest);
    const savedBoxes = trip.boxDetails || [];
    return JSON.stringify(currentBoxes) !== JSON.stringify(savedBoxes) ||
      JSON.stringify(photos.map((p) => p.key)) !== JSON.stringify(savedPhotosRef.current.map((p) => p.key));
  }, [rows, trip.boxDetails, photos]);

  useEffect(() => {
    setPhotos(photosFromTrip(trip));
    savedPhotosRef.current = photosFromTrip(trip);
  }, [trip.id, trip.dcPhotoKey, trip.dcPhotoKey2, trip.dcPhotoData, trip.dcPhotoData2]);

  useEffect(() => {
    const details = trip.boxDetails || [];
    if (details.length > 0) {
      setRows(details.map((d) => ({ ...d, uid: generateUid() })));
    } else {
      setRows([makeRow(1)]);
    }
  }, [trip.id, isLocalEditing, trip.boxDetails?.length]);

  const totals = useMemo(() => calculatePickupTotals(rows), [rows]);

  // ─── Row operations with Max Box Limit Check ───────────────────────
  const addRow = () => {
    if (maxBoxes > 0 && rows.length >= maxBoxes) {
      setToast({
        message: `Box limit exceeded! Maximum allowed boxes for this vehicle is ${maxBoxes}.`,
        type: "error",
      });
      return;
    }
    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      if (!(lastRow.birds > 0) || !(lastRow.weight > 0)) {
        setToast({
          message: "Please fill the current box (Birds & Weight) before adding a new one.",
          type: "error",
        });
        return;
      }
    }
    setRows((prev) => [...prev, makeRow(prev.length + 1)]);
  };

  const removeRow = (uid: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const last = prev[prev.length - 1];
      if (last.uid !== uid) {
        setToast({ message: "Remove the last box first.", type: "error" });
        return prev;
      }
      setRemovedBoxNos((ids) => [...ids, last.boxNo]);
      return prev.slice(0, -1);
    });
  };

  const updateRow = (uid: string, field: "birds" | "weight", value: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const next = { ...r, [field]: value };
        next.avgWeight = calculateBoxAvgWeight(next.birds, next.weight);
        return next;
      })
    );
  };

  const blockScrollAndArrows = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  };

  const getBoxDetails = (): BoxDetail[] => rows.map(({ uid, ...rest }) => rest);

  const isLastRowComplete = useMemo(() => {
    if (rows.length === 0) return true;
    const lastRow = rows[rows.length - 1];
    return lastRow.birds > 0 && lastRow.weight > 0;
  }, [rows]);

  // ─── Image upload handlers ──────────────────────────────────────────
  const photoFields = (): Partial<Trip> & { syncPickupPhotos: boolean } => ({
    dcPhotoKey: photos[0]?.key,
    dcPhotoMime: photos[0]?.mime,
    dcPhotoData: photos[0]?.data,
    dcPhotoKey2: photos[1]?.key,
    dcPhotoMime2: photos[1]?.mime,
    dcPhotoData2: photos[1]?.data,
    syncPickupPhotos: true,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setToast({ message: "Please select a valid image file.", type: "error" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast({ message: "Image size must be less than 5MB.", type: "error" });
      return;
    }
    if (photos.length >= 2) {
      setToast({ message: "A maximum of 2 photos is allowed.", type: "error" });
      return;
    }

    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (!data.startsWith("data:image/")) {
        setToast({ message: "Please select a valid image file.", type: "error" });
        return;
      }
      const next: PickupPhoto = {
        key: `dc_photo_${trip.id}_${photos.length + 1}_${Date.now()}`,
        mime: file.type,
        data,
      };
      const nextPhotos = [...photos, next].slice(0, 2);
      setPhotos(nextPhotos);
      updateTrip({
        dcPhotoKey: nextPhotos[0]?.key,
        dcPhotoMime: nextPhotos[0]?.mime,
        dcPhotoData: nextPhotos[0]?.data,
        dcPhotoKey2: nextPhotos[1]?.key,
        dcPhotoMime2: nextPhotos[1]?.mime,
        dcPhotoData2: nextPhotos[1]?.data,
      });
    } catch (error) {
      console.error("Failed to read image:", error);
      setToast({ message: "Failed to read image. Please try again.", type: "error" });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = async (key: string) => {
    const nextPhotos = photos.filter((p) => p.key !== key);
    setPhotos(nextPhotos);
    updateTrip({
      dcPhotoKey: nextPhotos[0]?.key,
      dcPhotoMime: nextPhotos[0]?.mime,
      dcPhotoData: nextPhotos[0]?.data,
      dcPhotoKey2: nextPhotos[1]?.key,
      dcPhotoMime2: nextPhotos[1]?.mime,
      dcPhotoData2: nextPhotos[1]?.data,
    });
  };

  // ─── Download Image ──────────────────────────────────────────────────
  const downloadImage = async () => {
    if (!photos[0]?.data) return;
    try {
      const link = document.createElement("a");
      link.href = photos[0].data;
      link.download = `DC_Photo_${trip.tripNo || "trip"}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to download image:", error);
      setToast({ message: "Failed to download image.", type: "error" });
    }
  };

  // ─── Manual Save ────────────────────────────────────────────────
  const handleSaveProgress = async () => {
    if (!savePickupProgress) return;
    setIsSaving(true);
    const success = await savePickupProgress({
      boxDetails: getBoxDetails(),
      removedBoxNos,
      ...photoFields(),
    } as Partial<Trip>);
    setToast(success
      ? { message: "Progress saved successfully.", type: "success" }
      : { message: "Unable to save pickup details. Please try again.", type: "error" });
    if (success) {
      savedPhotosRef.current = photos;
      setRemovedBoxNos([]);
    }
    setIsSaving(false);
  };

  // ─── Cancel discards unsaved Step 3 fields (no API / no draft) ─────
  const handleClose = () => {
    if (clearForm && !trip.pickupStepSubmitted) {
      clearForm();
      return;
    }
    if (onCancel) {
      onCancel();
      return;
    }
    setIsLocalEditing(false);
  };

  // ─── Submit / Update with confirmation ─────────────────────────────
  const handleSubmit = () => {
    if (rows.length === 0) return;
    if (isSubmitting) return;
    if (trip.pickupStepSubmitted && !editable && !isLocalEditing) return;

    if (!photos.length) {
      setToast({ message: "Please upload a DC photo before submitting.", type: "error" });
      return;
    }

    // Persisted flag decides Create vs Update: React state (isLocalEditing) is
    // only ever an entry-mode toggle and must NOT drive the label.
    const isEditMode = Boolean(trip.pickupStepSubmitted) && (editable || isLocalEditing);
    const title = isEditMode ? "Update Pickup KPI" : "Create Pickup KPI";
    const message = isEditMode
      ? "Are you sure you want to update this pickup KPI? Changes will be saved and the step will remain unlocked for further edits."
      : "Are you sure you want to create this pickup KPI? You won't be able to edit it unless you have admin permissions.";

    setConfirmation({
      isOpen: true,
      title,
      message,
      confirmLabel: isEditMode ? "Yes, Update" : "Yes, Create",
      cancelLabel: "Cancel",
      type: isEditMode ? "info" : "warning",
      onConfirm: () => {
        setConfirmation((prev) => ({ ...prev, isOpen: false }));
        void (async () => {
          setIsSubmitting(true);
          try {
            const success = await submitPickupStep({
              boxDetails: getBoxDetails(),
              ...photoFields(),
            });
            if (success) {
              setIsLocalEditing(false);
              setToast({ message: "Step 3 submitted successfully.", type: "success" });
            } else {
              setToast({ message: "Unable to submit pickup details. Please try again.", type: "error" });
            }
          } finally {
            setIsSubmitting(false);
          }
        })();
      },
      onCancel: () => {
        setConfirmation((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const canSubmit = rows.length > 0 && totals.totalBirds > 0 && totals.dcWeight > 0 && photos.length >= 1;

  // ─── PDF Generation ─────────────────────────────────────────────────
  const generatePDF = () => {
    if (!trip.pickupStepSubmitted) return;
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const primaryColor: [number, number, number] = [37, 99, 235];
      const secondaryColor: [number, number, number] = [71, 85, 105];

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42);
      doc.text('DMR POULTRY', 14, 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text('Trip Pickup KPI Report', 14, 28);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text('TRIP #:', pageWidth - 14, 20, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(trip.tripNo || 'N/A', pageWidth - 14, 25, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(14, 34, pageWidth - 14, 34);

      const details = [
        ['Generation Date', trip.tripDate || 'N/A'],
        ['Farm', trip.sourceFarm || 'N/A'],
        ['Vehicle', trip.vehicleNo || 'N/A'],
        ['Driver', trip.driverName || 'N/A'],
        ['Supervisor', trip.supervisorName || 'N/A'],
      ];
      let y = 42;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      details.forEach(([label, value]) => {
        doc.text(label + ':', 14, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), 70, y);
        y += 7;
        doc.setFont('helvetica', 'bold');
      });

      const boxData = trip.boxDetails || [];
      const tableRows = boxData.map((r) => [
        r.boxNo,
        r.birds,
        Number(r.weight).toFixed(2),
        formatAvg(Number(r.birds), Number(r.weight), r.avgWeight),
      ]);

      autoTable(doc, {
        startY: y + 6,
        head: [['Box #', 'Birds', 'Weight (Kg)', 'Avg WT (Kg)']],
        body: tableRows.length > 0 ? tableRows : [['—', '—', '—', '—']],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        foot: tableRows.length > 0
          ? [[
              { content: 'Total', colSpan: 1, styles: { fontStyle: 'bold' } },
              { content: String(trip.totalBirds || totals.totalBirds), styles: { fontStyle: 'bold' } },
              { content: Number(trip.dcWeight || totals.dcWeight).toFixed(2), styles: { fontStyle: 'bold' } },
              { content: formatAvg(Number(trip.totalBirds), Number(trip.dcWeight), trip.avgWeight), styles: { fontStyle: 'bold' } },
            ]]
          : undefined,
      });

      const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('SUMMARY', 14, finalY + 10);

      const summaryData = [
        ['Pickup Time', trip.pickupLoadTime || 'Not entered'],
        ['Total DC Weight', Number(trip.dcWeight || 0).toFixed(2) + ' Kg'],
        ['Total Birds', trip.totalBirds || 0],
        ['Loaded Boxes', `${trip.boxes || totals.boxes} / ${maxBoxes || '—'}`],
        ['Average Weight', formatAvg(Number(trip.totalBirds), Number(trip.dcWeight), trip.avgWeight) + (trip.avgWeight ? ' Kg' : '')],
      ];
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      let sumY = finalY + 18;
      summaryData.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label + ':', 14, sumY);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), 70, sumY);
        sumY += 7;
      });

      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.setDrawColor(241, 245, 249);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      doc.text('Confidential Business Report • Generated Automatically', 14, pageHeight - 10);
      doc.text(`Page 1 of 1`, pageWidth - 14, pageHeight - 10, { align: 'right' });

      doc.save(`Trip_${trip.tripNo || 'report'}_PickupKPI.pdf`);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  // ─── LOCKED VIEW ───────────────────────────────────────────────────
  if (trip.pickupStepSubmitted && !editable && !isLocalEditing) {
    const grouped = trip.boxDetails?.reduce((acc: BoxDetail[][], _, i, arr) => {
      if (i % 3 === 0) acc.push(arr.slice(i, i + 3));
      return acc;
    }, []) || [];

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              3
            </span>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              {TRIP_STEP_DEFINITIONS[2].title.toUpperCase()}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
              title="Close Trip"
              aria-label="Close Trip"
            >
              <X size={14} />
            </button>
            {canEdit && (
              <button
                onClick={() => setIsLocalEditing(true)}
                className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700 transition-all active:scale-95"
                title="Edit Pickup KPI"
              >
                <Pencil size={14} />
              </button>
            )}
            <span className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap">
              Submitted & Locked
            </span>
          </div>
        </div>

        {/* 5 Column Compact Deliveries-Style KPI Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Clock size={12} className="text-slate-500" /> Time
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{trip.pickupLoadTime || "--"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Scale size={12} className="text-emerald-500" /> DC Wt
            </span>
            <span className="text-xs font-bold text-slate-800">{trip.dcWeight ? `${Number(trip.dcWeight).toFixed(2)} Kg` : "Not entered"}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Bird size={12} className="text-blue-500" /> Birds
            </span>
            <span className="text-xs font-bold text-slate-800">{trip.totalBirds}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Box size={12} className="text-amber-500" /> Boxes
            </span>
            <span className="text-xs font-bold text-slate-800">{trip.boxes} / {maxBoxes}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Gauge size={12} className="text-purple-500" /> Avg Wt
            </span>
            <span className="text-xs font-bold text-slate-800">{trip.avgWeight ? `${trip.avgWeight} Kg` : "—"}</span>
          </div>
        </div>

        {/* DC Photo Status Card */}
        {photos.length > 0 && (
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3 text-xs font-medium text-slate-700 flex-wrap">
            <Camera size={16} className="text-slate-400" />
            <span>{photos.length} photo{photos.length === 1 ? "" : "s"} uploaded</span>
            {photos.map((p) => (
              <img key={p.key} src={p.data} alt="Pickup" className="h-12 w-12 object-cover rounded-lg border border-slate-200" />
            ))}
          </div>
        )}

        {/* Box Table */}
        {trip.boxDetails && trip.boxDetails.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                {Array.from({ length: 12 }).map((_, i) => (
                  <col key={i} className="w-[8.33%]" />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] uppercase sticky top-0 z-10 border-b border-slate-200">
                  {[1, 2, 3].map((i, idx) => (
                    <React.Fragment key={i}>
                      <th className={`text-center px-2 py-2 font-bold bg-slate-50 text-slate-600 border-r border-slate-200 ${idx > 0 ? 'pl-4' : ''}`}>BOX</th>
                      <th className="text-center px-2 py-2 font-bold bg-slate-50 text-slate-600 border-r border-slate-200">BIRDS</th>
                      <th className="text-center px-2 py-2 font-bold bg-slate-50 text-slate-600 border-r border-slate-200">WT(KG)</th>
                      <th className={`text-center px-2 py-2 font-bold bg-slate-50 text-slate-600 ${idx < 2 ? 'border-r-2 border-slate-300' : ''}`}>AVG WT(KG)</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {grouped.map((group, idx) => (
                  <tr key={idx} className="bg-white hover:bg-slate-50 transition-colors">
                    {group.map((r, colIdx) => (
                      <React.Fragment key={r.boxNo}>
                        <td className={`text-center px-2 py-2 font-semibold text-slate-800 border-r border-slate-200 ${colIdx > 0 ? 'pl-4' : ''}`}>{r.boxNo}</td>
                        <td className="text-center px-2 py-2 font-bold text-slate-800 border-r border-slate-200">{r.birds || "Not entered"}</td>
                        <td className="text-center px-2 py-2 font-semibold text-slate-800 border-r border-slate-200">{r.weight ? Number(r.weight).toFixed(2) : "Not entered"}</td>
                        <td className={`text-center px-2 py-2 font-semibold text-slate-800 ${colIdx < 2 ? 'border-r-2 border-slate-300' : ''}`}>
                          {formatAvg(Number(r.birds), Number(r.weight), r.avgWeight)}
                        </td>
                      </React.Fragment>
                    ))}
                    {group.length < 3 &&
                      Array.from({ length: 3 - group.length }).map((_, i) => {
                        const emptyIdx = group.length + i;
                        return (
                          <React.Fragment key={i}>
                            <td className={`text-center px-2 py-2 text-slate-300 border-r border-slate-200 ${emptyIdx > 0 ? 'pl-4' : ''}`}>—</td>
                            <td className="text-center px-2 py-2 text-slate-300 border-r border-slate-200">—</td>
                            <td className="text-center px-2 py-2 text-slate-300 border-r border-slate-200">—</td>
                            <td className={`text-center px-2 py-2 text-slate-300 ${emptyIdx < 2 ? 'border-r-2 border-slate-300' : ''}`}>—</td>
                          </React.Fragment>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Banner with Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-600 font-normal">
            Pickup KPI details submitted successfully.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {photos.length > 0 && (
              <button
                onClick={downloadImage}
                className="flex items-center justify-center p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-all active:scale-95"
                title="Download Image"
              >
                <Download size={16} />
              </button>
            )}
            <button
              onClick={generatePDF}
              className="flex items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-all active:scale-95"
              title="Download PDF"
            >
              <FileText size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── EDIT / ENTRY VIEW ──────────────────────────────────────────────────
  const showAddSlot = isLastRowComplete && maxBoxes > 0 && rows.length < maxBoxes;
  const entrySlots: Array<{ type: "box"; row: Row } | { type: "add" }> = [
    ...rows.map((row) => ({ type: "box" as const, row })),
    ...(showAddSlot ? [{ type: "add" as const }] : []),
  ];
  const groupedRows = entrySlots.reduce((acc: typeof entrySlots[], _, i, arr) => {
    if (i % 3 === 0) acc.push(arr.slice(i, i + 3));
    return acc;
  }, [] as typeof entrySlots[]);

  const isEditMode = Boolean(trip.pickupStepSubmitted) && (editable || isLocalEditing);

  return (
    <>
      <style>{`
        .hide-spinner::-webkit-inner-spin-button,
        .hide-spinner::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .hide-spinner {
          -moz-appearance: textfield;
          appearance: none;
        }
        .mini-input {
          height: 28px;
          padding: 0 4px;
          font-size: 0.8rem;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          text-align: center;
          width: 100%;
          min-width: 0;
          transition: all 0.15s;
          color: #2563eb;
          font-weight: 700;
        }
        .mini-input::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }
        .mini-input:focus {
          background: white;
          border-color: #2563eb;
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
        }
        .mini-input:hover {
          border-color: #93c5fd;
        }
        .mini-delete {
          padding: 2px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
        }
        .mini-delete:hover:not(:disabled) {
          background: #fef2f2;
          color: #ef4444;
          border-color: #fecaca;
        }
        .mini-delete:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              3
            </span>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              {TRIP_STEP_DEFINITIONS[2].title.toUpperCase()}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
              title="Close Trip"
              aria-label="Close Trip"
            >
              <X size={14} />
            </button>
            {(isEditMode || isLocalEditing) && trip.pickupStepSubmitted && (
              <span className="text-xs text-slate-700 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap">
                Editing Trip {trip.tripNo}
              </span>
            )}
          </div>
        </div>

        {/* Auto time */}
        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
          <Clock size={14} className="text-slate-400" />
          <span>{trip.pickupLoadTime || "Auto time on submit"}</span>
        </div>

        {/* Image Upload Section */}
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Camera size={14} className="text-slate-400" />
                {TRIP_FIELD_DEFINITIONS.dcPhotoKey.label} {TRIP_FIELD_DEFINITIONS.dcPhotoKey.required && <span className="text-red-500">*</span>}
              </label>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                {photos.length < 2 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all shadow-xs"
                  >
                    Choose Image
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  {photos.length ? `${photos.length} of 2 uploaded` : "No image selected"}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="text-[10px] text-slate-400 mt-1">Max 2 photos, 5MB each, JPG/PNG. Submit requires at least 1.</p>
            </div>
            {photos.length > 0 && (
              <div className="flex-shrink-0 flex gap-2">
                {photos.map((p) => (
                  <div key={p.key} className="relative">
                    <img src={p.data} alt="Pickup" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => void removeImage(p.key)}
                      className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 text-[10px] leading-5"
                      title="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Entry Table Container */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">
              Box entries (Max limit: {maxBoxes || "—"} boxes)
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs max-h-80 overflow-y-auto">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                {Array.from({ length: 12 }).map((_, i) => (
                  <col key={i} className="w-[8.33%]" />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold sticky top-0 z-10 border-b border-slate-200">
                  {[1, 2, 3].map((blockIdx) => (
                    <React.Fragment key={blockIdx}>
                      <th className={`text-center px-1 py-2 font-bold text-slate-600 bg-slate-50 border-r border-slate-200 ${blockIdx > 1 ? 'pl-4' : ''}`}>BOX</th>
                      <th className="text-center px-1 py-2 font-bold text-slate-600 bg-slate-50 border-r border-slate-200">BIRDS</th>
                      <th className="text-center px-1 py-2 font-bold text-slate-600 bg-slate-50 border-r border-slate-200">WT(KG)</th>
                      <th className={`text-center px-1 py-2 font-bold text-slate-600 bg-slate-50 ${blockIdx < 3 ? 'border-r-2 border-slate-300' : ''}`}>AVG WT(KG)</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {groupedRows.map((group, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors bg-white">
                    {group.map((slot, groupIdx) => {
                      if (slot.type === "add") {
                        return (
                          <td
                            key="add-box"
                            colSpan={4}
                            className={`px-1 py-1.5 bg-white ${groupIdx < 2 ? "border-r-2 border-slate-300" : ""}`}
                          >
                            <button
                              type="button"
                              onClick={addRow}
                              className="w-full h-8 text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg"
                            >
                              <Plus size={12} className="inline mr-1" /> Add Box
                            </button>
                          </td>
                        );
                      }
                      const row = slot.row;
                      return (
                      <React.Fragment key={row.uid}>
                        <td className={`text-center px-1 py-1.5 font-bold text-slate-700 text-xs bg-white border-r border-slate-200 ${groupIdx > 0 ? 'pl-4' : ''}`}>{row.boxNo}</td>
                        <td className="px-1 py-1.5 bg-white border-r border-slate-200">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={row.birds || ""}
                            onChange={(e) => updateRow(row.uid, "birds", parseInt(e.target.value) || 0)}
                            onWheel={(e) => e.currentTarget.blur()}
                            onKeyDown={blockScrollAndArrows}
                            placeholder="0"
                            className="mini-input hide-spinner"
                          />
                        </td>
                        <td className="px-1 py-1.5 bg-white border-r border-slate-200">
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.weight || ""}
                              onChange={(e) => updateRow(row.uid, "weight", parseFloat(e.target.value) || 0)}
                              onWheel={(e) => e.currentTarget.blur()}
                              onKeyDown={blockScrollAndArrows}
                              placeholder="0.00"
                              className="mini-input hide-spinner"
                            />
                            <button
                              type="button"
                              onClick={() => removeRow(row.uid)}
                              disabled={rows.length === 1 || row.uid !== rows[rows.length - 1]?.uid}
                              className="mini-delete shrink-0"
                              title="Delete box"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                        <td className={`text-center px-1 py-1.5 text-xs font-semibold text-slate-700 bg-white ${groupIdx < 2 ? 'border-r-2 border-slate-300' : ''}`}>
                          {formatAvg(row.birds, row.weight, row.avgWeight)}
                        </td>
                      </React.Fragment>
                      );
                    })}
                    {group.length < 3 &&
                      Array.from({ length: 3 - group.length }).map((_, i) => {
                        const emptyIdx = group.length + i;
                        return (
                          <React.Fragment key={i}>
                            <td className={`text-center px-1 py-1.5 text-slate-300 text-xs bg-white border-r border-slate-200 ${emptyIdx > 0 ? 'pl-4' : ''}`}>—</td>
                            <td className="text-center px-1 py-1.5 text-slate-300 text-xs bg-white border-r border-slate-200">—</td>
                            <td className="text-center px-1 py-1.5 text-slate-300 text-xs bg-white border-r border-slate-200">—</td>
                            <td className={`text-center px-1 py-1.5 text-slate-300 text-xs bg-white ${emptyIdx < 2 ? 'border-r-2 border-slate-300' : ''}`}>—</td>
                          </React.Fragment>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Use <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[9px] font-semibold">Tab</kbd> to navigate.
            {!isLastRowComplete && rows.length > 0 && (
              <span className="text-amber-600 ml-2">⚠️ Fill the current box before adding another.</span>
            )}
            {rows.length >= maxBoxes && (
              <span className="text-red-600 ml-2 font-bold">🚫 Box limit ({maxBoxes}) reached for this vehicle.</span>
            )}
          </p>
        </div>

        {/* Totals Summary Bar - Deliveries Style KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Box size={12} className="text-amber-500" /> Boxes
            </span>
            <span className="text-xs font-bold text-slate-800">{totals.boxes} / {maxBoxes}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Bird size={12} className="text-blue-500" /> Birds
            </span>
            <span className="text-xs font-bold text-slate-800">{totals.totalBirds}</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Scale size={12} className="text-emerald-500" /> DC Wt
            </span>
            <span className="text-xs font-bold text-slate-800">{totals.dcWeight.toFixed(2)} Kg</span>
          </div>
          <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <Gauge size={12} className="text-purple-500" /> Avg Wt
            </span>
            <span className="text-xs font-bold text-slate-800">
              {totals.avgWeight > 0 ? `${totals.avgWeight} Kg` : "—"}
            </span>
          </div>
        </div>

        <WizardStepNotice
          notice={toast ? { type: toast.type, message: toast.message } : null}
          dirty={hasUnsavedChanges}
        />
        <WizardActionBar
          onCancel={handleClose}
          onSave={savePickupProgress ? handleSaveProgress : undefined}
          onSubmit={handleSubmit}
          busy={isSaving || isSubmitting}
          saveDisabled={false}
          submitDisabled={!canSubmit || (trip.pickupStepSubmitted && !isEditMode)}
          submitLabel={isEditMode ? "Update Pickup" : "Create Pickup"}
        />
      </div>

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