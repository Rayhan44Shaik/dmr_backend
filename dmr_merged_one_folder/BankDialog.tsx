import { useState } from "react";
import BankForm from "../forms/BankForm";
import type { Bank } from "../types/bank";

type BankDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (bank: any) => void | boolean | Promise<void | boolean>;
  bank?: Bank | null;
};

function BankDialog({ open, onClose, onSave, bank }: BankDialogProps) {
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
      {/* Increased width to max-w-4xl – same as other forms */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        {/* No duplicate title – BankForm provides its own header */}
        <BankForm
          bank={bank}
          onSave={handleSave}
          onCancel={onClose}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
}

export default BankDialog;
