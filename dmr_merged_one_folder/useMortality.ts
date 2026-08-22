// src/modules/operations/mortality/hooks/useMortality.ts

import { useCallback, useState } from "react";
import { mortalityService } from "../services/mortalityService";
import type { MortalityRecord } from "../types/mortality";

export function useMortality() {
  const [records, setRecords] = useState<MortalityRecord[]>(() => mortalityService.getAll());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setRecords(mortalityService.getAll());
  }, []);

  const create = useCallback(
    (input: Parameters<typeof mortalityService.create>[0]) => {
      setSaving(true);
      try {
        const record = mortalityService.create(input);
        refresh();
        return record;
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      mortalityService.remove(id);
      refresh();
    },
    [refresh]
  );

  return { records, saving, create, remove, refresh };
}
