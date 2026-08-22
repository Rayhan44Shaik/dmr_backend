import { useState } from "react";
import type { Shop } from "../types/shop";
import ShopForm from "../forms/ShopForm";

type ShopDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (shop: any) => void | boolean | Promise<void | boolean>;
  shop?: Shop | null;
};

function ShopDialog({ open, onClose, onSave, shop }: ShopDialogProps) {
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
      {/* Increased max width to match FarmDialog */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        {/* ShopForm provides its own header – no duplicate title */}
        <ShopForm
          shop={shop}
          onSave={handleSave}
          onCancel={onClose}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
}

export default ShopDialog;
