import { useCallback, useEffect, useState } from "react";

import type { Farm } from "../types/farm";
import {
  bulkCreateFarms,
  createFarm,
  deleteFarm,
  handleApiError,
  loadFarms,
  refreshFarms,
  updateFarm,
  type FarmInput,
} from "../services/farmService";

/**
 * Farms page data hook — table state comes only from GET /api/masters/farms.
 */
export function useFarms() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadFarms();
      setFarms(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      setFarms([]);
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

  const addFarm = useCallback(async (input: FarmInput) => {
    setSaving(true);
    setError(null);
    try {
      await createFarm(input);
      const data = await refreshFarms();
      setFarms(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Uses the real transactional POST /api/masters/farms/bulk endpoint.
  // If ANY row is invalid/duplicate the backend rejects the whole batch (400/409).
  const addFarmsBulk = useCallback(async (inputs: FarmInput[]) => {
    setSaving(true);
    setError(null);
    try {
      await bulkCreateFarms(inputs);
      const data = await refreshFarms();
      setFarms(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const editFarm = useCallback(async (id: number, input: FarmInput) => {
    setSaving(true);
    setError(null);
    try {
      await updateFarm(id, input);
      const data = await refreshFarms();
      setFarms(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeFarm = useCallback(async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      await deleteFarm(id);
      const data = await refreshFarms();
      setFarms(data);
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
    farms,
    loading,
    saving,
    error,
    reload,
    addFarm,
    addFarmsBulk,
    editFarm,
    removeFarm,
  };
}
