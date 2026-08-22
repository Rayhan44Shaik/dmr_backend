// src/modules/masters/employees/dialogs/EmployeeDialog.tsx
import { useState } from "react";
import EmployeeForm from "../forms/EmployeeForm";
import type { Employee } from "../types/employee";

type EmployeeDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (employee: any) => void | boolean | Promise<void | boolean>;
  employee?: Employee | null;
};

function EmployeeDialog({ open, onClose, onSave, employee }: EmployeeDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const handleSave = async (formData: any) => {
    setIsSaving(true);
    try {
      const result = await Promise.resolve(onSave(formData));
      // Keep dialog open when parent signals validation/API failure (false)
      if (result === false) return;
      onClose();
    } catch (error) {
      console.error("Save failed", error);
      // Keep dialog open so the user can fix and retry
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        <EmployeeForm
          employee={employee}
          onSave={handleSave}
          onCancel={onClose}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
}

export default EmployeeDialog;
