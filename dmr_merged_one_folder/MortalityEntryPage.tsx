// src/modules/operations/mortality/pages/MortalityEntryPage.tsx
// Mortality entry: summary tiles + entry form + register table.

import { useMemo } from "react";
import { Bird } from "lucide-react";
import MortalityForm, { type MortalityFormValues } from "../components/MortalityForm";
import MortalityTable from "../components/MortalityTable";
import MortalitySummary from "../components/MortalitySummary";
import { useMortality } from "../hooks/useMortality";
import { mortalityService } from "../services/mortalityService";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { getCurrentUser } from "../../../settings/services";
import { opsPageClass, opsPageTitleClass } from "../../../../shared/ui/operationsStyles";

interface MortalityEntryPageProps {
  embedded?: boolean;
}

export default function MortalityEntryPage({ embedded: _embedded = false }: MortalityEntryPageProps) {
  const { records, saving, create, remove } = useMortality();
  const { showNotification } = useSafeNotification();
  const summary = useMemo(() => mortalityService.getSummary(), [records]); // eslint-disable-line react-hooks/exhaustive-deps

  // Farms available for the form — from legacy storage so it works offline.
  const farms = useMemo(() => {
    try {
      const raw = localStorage.getItem("dmr-farms");
      const list = raw ? (JSON.parse(raw) as { farmName?: string }[]) : [];
      return list.map((f) => f.farmName ?? "").filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  const handleSave = (values: MortalityFormValues) => {
    const user = getCurrentUser();
    create({
      date: values.date,
      tripNo: values.tripNo,
      farm: values.farm,
      birdType: values.birdType,
      birds: Number(values.birds) || 0,
      weightKg: Number(values.weightKg) || 0,
      reason: values.reason as never,
      notes: values.notes,
      recordedBy: user.name,
    });
    showNotification("Mortality record saved.", "success");
  };

  const handleDelete = (id: string) => {
    remove(id);
    showNotification("Mortality record removed.", "info");
  };

  return (
    <div className={opsPageClass}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Bird size={17} />
        </span>
        <div>
          <h2 className={opsPageTitleClass}>Mortality Entry</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">Track and analyse bird losses to keep mortality under control</p>
        </div>
      </div>

      <MortalitySummary summary={summary} />
      <MortalityForm farms={farms} onSave={handleSave} saving={saving} />
      <MortalityTable records={records} onDelete={handleDelete} />
    </div>
  );
}
