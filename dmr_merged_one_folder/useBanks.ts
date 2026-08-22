import { useCallback, useEffect, useState } from "react";

import type { Bank } from "../types/bank";
import {
  createBank,
  deleteBank,
  handleApiError,
  loadBanks,
  refreshBanks,
  updateBank,
  type BankInput,
} from "../services/bankService";

/**
 * Banks page data hook — table state comes only from GET /api/masters/banks.
 */
export function useBanks() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadBanks();
      setBanks(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      setBanks([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      /* error already captured in state */
    });
  }, [reload]);

  const addBank = useCallback(async (input: BankInput) => {
    setSaving(true);
    setError(null);
    try {
      await createBank(input);
      const data = await refreshBanks();
      setBanks(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const editBank = useCallback(async (id: number, input: BankInput) => {
    setSaving(true);
    setError(null);
    try {
      await updateBank(id, input);
      const data = await refreshBanks();
      setBanks(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeBank = useCallback(async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      await deleteBank(id);
      const data = await refreshBanks();
      setBanks(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    banks,
    loading,
    saving,
    error,
    reload,
    addBank,
    editBank,
    removeBank,
  };
}
