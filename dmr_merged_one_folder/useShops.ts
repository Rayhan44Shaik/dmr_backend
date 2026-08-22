import { useCallback, useEffect, useState } from "react";

import type { Shop } from "../types/shop";
import {
  createShop,
  createShopsBulk,
  deleteShop,
  handleApiError,
  loadShops,
  refreshShops as refreshShopsFromApi,
  updateShop,
  type ShopInput,
} from "../services/shopService";

/**
 * Shops page data hook — table state comes only from GET /api/masters/shops.
 */
export function useShops() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadShops();
      setShops(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      setShops([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Alias kept for ShopSalesPage and other consumers. */
  const refreshShops = reload;

  useEffect(() => {
    void reload().catch(() => {
      /* error already captured in state */
    });
  }, [reload]);

  const addShop = useCallback(async (input: ShopInput) => {
    setSaving(true);
    setError(null);
    try {
      await createShop(input);
      const data = await refreshShopsFromApi();
      setShops(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const addShopsBulk = useCallback(async (inputs: ShopInput[]) => {
    setSaving(true);
    setError(null);
    try {
      await createShopsBulk(inputs);
      const data = await refreshShopsFromApi();
      setShops(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const editShop = useCallback(async (id: number, input: ShopInput) => {
    setSaving(true);
    setError(null);
    try {
      await updateShop(id, input);
      const data = await refreshShopsFromApi();
      setShops(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeShop = useCallback(async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      await deleteShop(id);
      const data = await refreshShopsFromApi();
      setShops(data);
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
    shops,
    loading,
    saving,
    error,
    reload,
    refreshShops,
    addShop,
    addShopsBulk,
    editShop,
    removeShop,
  };
}
