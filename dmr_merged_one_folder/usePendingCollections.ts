import { useEffect, useMemo, useState } from "react";
import type { PendingCollection, Collection } from "../types/collection";
import { collectionService } from "../services/collectionService";

/**
 * Backend-backed pending collections data source.
 * Every getter re-reads the PostgreSQL-fed cache; a refresh is always
 * triggered on mount so the page never serves stale/demo data.
 */
export default function usePendingCollections() {
  const [pending, setPending] = useState<PendingCollection[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      await collectionService.refreshFromBackend();
      setPending(collectionService.getPendingCollections());
      setCollections(collectionService.getCollections());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending collections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const totalPending = useMemo(
    () => pending.reduce((sum, row) => sum + row.currentPending, 0),
    [pending]
  );

  const pendingApprovalCount = useMemo(() => collectionService.getPendingApprovalCount(), [collections]);

  return {
    pending,
    collections,
    loading,
    error,
    totalPending,
    pendingApprovalCount,
    refresh,
  };
}