// src/modules/operations/mortality/components/MortalityForm.tsx
// Professional entry form for bird mortality records.

import { useMemo, useState } from "react";
import { Bird, Save } from "lucide-react";
import type { MortalityReason } from "../types/mortality";

export interface MortalityFormValues {
  date: string;
  tripNo: string;
  farm: string;
  birdType: string;
  birds: string;
  weightKg: string;
  reason: MortalityReason | "";
  notes: string;
}

interface MortalityFormProps {
  farms: string[];
  onSave: (values: MortalityFormValues) => void;
  saving?: boolean;
}

const INITIAL: MortalityFormValues = {
  date: new Date().toISOString().slice(0, 10),
  tripNo: "",
  farm: "",
  birdType: "Broiler",
  birds: "",
  weightKg: "",
  reason: "",
  notes: "",
};

const REASONS: MortalityReason[] = ["Heat Stress", "Disease", "Suffocation", "Transportation", "Other"];

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

const labelClass = "mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300";

export default function MortalityForm({ farms, onSave, saving = false }: MortalityFormProps) {
  const [values, setValues] = useState<MortalityFormValues>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof MortalityFormValues, string>>>({});

  const set = (key: keyof MortalityFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!values.date) next.date = "Date is required";
    if (!values.farm) next.farm = "Select a farm";
    if (!values.birds || Number(values.birds) <= 0) next.birds = "Enter a valid bird count";
    if (values.weightKg !== "" && Number(values.weightKg) < 0) next.weightKg = "Weight cannot be negative";
    if (!values.reason) next.reason = "Select a loss reason";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(values);
    setValues((prev) => ({ ...INITIAL, date: prev.date, farm: prev.farm, birdType: prev.birdType }));
  };

  const estWeight = useMemo(() => {
    const birds = Number(values.birds);
    return Number.isFinite(birds) && birds > 0 ? (birds * 2.1).toFixed(1) : "";
  }, [values.birds]);

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <Bird size={15} />
        </span>
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">Record mortality</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">Log bird loss during trips or at farms</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={labelClass}>
            Date <span className="text-rose-500">*</span>
          </label>
          <input type="date" value={values.date} onChange={(e) => set("date", e.target.value)} className={fieldClass} />
          {errors.date && <p className="mt-1 text-xs text-rose-600">{errors.date}</p>}
        </div>

        <div>
          <label className={labelClass}>Trip No (optional)</label>
          <input type="text" value={values.tripNo} onChange={(e) => set("tripNo", e.target.value)} placeholder="e.g. TRP-20260814-001" className={fieldClass} />
        </div>

        <div>
          <label className={labelClass}>
            Farm <span className="text-rose-500">*</span>
          </label>
          <select value={values.farm} onChange={(e) => set("farm", e.target.value)} className={fieldClass}>
            <option value="">Select farm…</option>
            {farms.map((farm) => (
              <option key={farm} value={farm}>
                {farm}
              </option>
            ))}
          </select>
          {errors.farm && <p className="mt-1 text-xs text-rose-600">{errors.farm}</p>}
        </div>

        <div>
          <label className={labelClass}>Bird Type</label>
          <select value={values.birdType} onChange={(e) => set("birdType", e.target.value)} className={fieldClass}>
            <option>Broiler</option>
            <option>Layer</option>
            <option>Country Chicken</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>
            Birds Lost <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            value={values.birds}
            onChange={(e) => set("birds", e.target.value)}
            placeholder="0"
            className={fieldClass}
          />
          {errors.birds && <p className="mt-1 text-xs text-rose-600">{errors.birds}</p>}
        </div>

        <div>
          <label className={labelClass}>Weight (kg)</label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={values.weightKg}
            onChange={(e) => set("weightKg", e.target.value)}
            placeholder={estWeight ? `≈ ${estWeight} kg estimated` : "0.0"}
            className={fieldClass}
          />
          {errors.weightKg && <p className="mt-1 text-xs text-rose-600">{errors.weightKg}</p>}
        </div>

        <div>
          <label className={labelClass}>
            Loss Reason <span className="text-rose-500">*</span>
          </label>
          <select value={values.reason} onChange={(e) => set("reason", e.target.value)} className={fieldClass}>
            <option value="">Select reason…</option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
          {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason}</p>}
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <input type="text" value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional remarks" className={fieldClass} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Fields marked <span className="text-rose-500">*</span> are required
        </p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-500"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save record"}
        </button>
      </div>
    </form>
  );
}
