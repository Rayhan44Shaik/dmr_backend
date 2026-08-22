import { useCallback, useEffect, useState } from "react";

import type { Vehicle } from "../types/vehicle";
import {
  bulkCreateVehicles,
  createVehicle,
  deleteVehicle,
  handleApiError,
  loadVehicles,
  refreshVehicles,
  updateVehicle,
  type VehicleInput,
} from "../services/vehicleService";

/**
 * Vehicles page data hook — table state comes only from GET /api/masters/vehicles.
 */
export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadVehicles();
      setVehicles(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      setVehicles([]);
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

  const addVehicle = useCallback(async (input: VehicleInput) => {
    setSaving(true);
    setError(null);
    try {
      await createVehicle(input);
      const data = await refreshVehicles();
      setVehicles(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Uses the real transactional POST /api/masters/vehicles/bulk endpoint.
  // If ANY row is invalid/duplicate the backend rejects the whole batch (400/409).
  const addVehiclesBulk = useCallback(async (inputs: VehicleInput[]) => {
    setSaving(true);
    setError(null);
    try {
      await bulkCreateVehicles(inputs);
      const data = await refreshVehicles();
      setVehicles(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const editVehicle = useCallback(async (id: number, input: VehicleInput) => {
    setSaving(true);
    setError(null);
    try {
      await updateVehicle(id, input);
      const data = await refreshVehicles();
      setVehicles(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeVehicle = useCallback(async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      await deleteVehicle(id);
      const data = await refreshVehicles();
      setVehicles(data);
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
    vehicles,
    loading,
    saving,
    error,
    reload,
    addVehicle,
    addVehiclesBulk,
    editVehicle,
    removeVehicle,
  };
}
