import React, { useCallback } from "react";
import { Pencil, X } from "lucide-react";
import type { Trip } from "../types/trip";

interface Props {
  open: boolean;
  trip: Trip | null;
  onClose: () => void;
  onEdit: (trip: Trip) => void;
}

function TripEditModal({ open, trip, onClose, onEdit }: Props) {
  const handleEdit = useCallback(() => {
    if (trip) {
      onClose();
      onEdit(trip);
    }
  }, [trip, onClose, onEdit]);

  if (!open || !trip) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[480px]">
        <div className="flex items-center justify-between px-6 py-5 border-b">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
              <Pencil size={22} className="text-green-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Edit Trip</h2>
              <p className="text-sm text-slate-500">Edit selected trip</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-6 space-y-5">
          <div className="text-slate-700">
            This trip will be loaded into the Trip Entry screen for editing.
          </div>
          <div className="rounded-xl border bg-slate-50 p-5 space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Trip No</span>
              <span className="font-semibold">{trip.tripNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Vehicle</span>
              <span>{trip.vehicleNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Driver</span>
              <span>{trip.driverName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span>{trip.tripDate}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-5 border-t">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border">
            Cancel
          </button>
          <button
            onClick={handleEdit}
            className="px-5 py-2 rounded-xl bg-green-700 hover:bg-green-800 text-white"
          >
            Edit Trip
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(TripEditModal);