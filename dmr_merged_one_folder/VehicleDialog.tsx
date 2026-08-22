// VehicleDialog.tsx
import { useState } from "react";
import VehicleForm from "../forms/VehicleForm";
import type { Vehicle } from "../types/vehicle";

type VehicleDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (vehicle: any) => void | boolean | Promise<void | boolean>;
  vehicle?: Vehicle | null;
};

function VehicleDialog({ open, onClose, onSave, vehicle }: VehicleDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const handleSave = async (formData: any) => {
    setIsSaving(true);
    try {
      const result = await Promise.resolve(onSave(formData));
      if (result === false) return;
      onClose();
    } catch (error) {
      console.error("Save failed", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        <VehicleForm
          vehicle={vehicle}
          onSave={handleSave}
          onCancel={onClose}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
}

export default VehicleDialog;
