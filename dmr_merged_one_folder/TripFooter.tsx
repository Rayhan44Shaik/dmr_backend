import React from "react";
import { RotateCcw, Save, SaveAll } from "lucide-react";

interface Props {
  onClear: () => void;
  onSave: () => void;
  onSaveNew: () => void;
}

function TripFooter({ onClear, onSave, onSaveNew }: Props) {
  return (
    <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-200 mt-8">
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
      >
        <RotateCcw size={16} />
        Clear
      </button>
      <button
        type="button"
        onClick={onSave}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-all"
      >
        <Save size={16} />
        Save Trip
      </button>
      <button
        type="button"
        onClick={onSaveNew}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-all"
      >
        <SaveAll size={16} />
        Save & New
      </button>
    </div>
  );
}

export default React.memo(TripFooter);