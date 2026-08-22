import { useCallback, useEffect, useRef, useState } from "react";
import type { Trip } from "../../operations/vehicle-trips/types/trip";
import type { TripWizardStep } from "../../operations/vehicle-trips/services/tripHeaderApiService";
import {
  applyMobileTripStep,
  asMobileApiError,
  createMobileTrip,
  mobileHealth,
  loadMobileTrip,
  type MobileAcknowledgement,
  type MobileTrip,
} from "../services/mobileApiClient";
import {
  appendMobileOperation,
  assignServerTripToOperations,
  clearWorkingDraft,
  compactSyncedOperations,
  loadMobileOperations,
  newMobileOperationId,
  removeCachedDraft,
  saveWorkingDraft,
  updateMobileOperation,
  type MobileOperationAck,
  type MobileSyncOperation,
} from "../services/mobileTripStorage";

export type MobileCommitResult = "synced" | "queued" | "conflict" | "rejected";
export type OfficeReachability = "unknown" | "checking" | "reachable" | "unreachable";

type Options = {
  ownerKey: string;
  clientDraftId: string;
  trip: Trip;
  activeStep: number;
  onLocalTrip: (trip: Trip) => void;
  onAuthoritativeTrip: (trip: MobileTrip) => void;
  onPendingTripSubmitted: (trip: MobileTrip) => void;
  onUnauthorized: () => Promise<void>;
  refreshDrafts: () => Promise<unknown>;
  notify: (message: string, type?: "success" | "error" | "info") => void;
};

function acknowledgementSummary(ack: MobileAcknowledgement): MobileOperationAck {
  return {
    tripId: ack.trip.id,
    tripNo: ack.trip.tripNo,
    status: ack.trip.status,
    version: ack.trip.version,
    updatedAt: ack.trip.updatedAt ?? null,
    serverTime: ack.serverTime,
  };
}

function operationTrip(operation: MobileSyncOperation): Trip {
  const ack = operation.acknowledgement;
  return {
    ...(operation.payload as Trip),
    id: ack?.tripId ?? operation.tripId ?? Number((operation.payload as Trip).id || 0),
    tripNo: ack?.tripNo ?? String((operation.payload as Trip).tripNo || ""),
    status: ack?.status ?? ((operation.payload as Trip).status || "Draft"),
    updatedAt: ack?.updatedAt ?? (operation.payload as Trip).updatedAt,
  };
}

export function useDurableMobileSync(options: Options) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  const [operations, setOperations] = useState<MobileSyncOperation[]>([]);
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [officeReachability, setOfficeReachability] = useState<OfficeReachability>("unknown");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const actionLocksRef = useRef(new Map<string, Promise<MobileCommitResult>>());

  const reloadOperations = useCallback(async () => {
    const loaded = await loadMobileOperations(optionsRef.current.ownerKey);
    setOperations(loaded);
    const conflict = loaded.find((operation) => operation.status === "CONFLICT");
    const permanent = loaded.find((operation) => operation.status === "FAILED_PERMANENT");
    if (conflict) {
      setConflictMessage(
        conflict.lastError ||
          "This Trip was changed from another device. Your local operation was preserved."
      );
    }
    if (permanent) setSyncError(permanent.lastError || "A queued operation was rejected.");
    return loaded;
  }, []);

  const applyRecoveredAcknowledgements = useCallback(async (queue: MobileSyncOperation[]) => {
    const { ownerKey, onAuthoritativeTrip, onPendingTripSubmitted } = optionsRef.current;
    const acknowledged = queue.filter(
      (operation) => operation.status === "SYNCED" && operation.acknowledgement
    );
    for (const operation of acknowledged) {
      const local = operationTrip(operation) as MobileTrip;
      local.version = operation.acknowledgement?.version ?? 1;
      if (local.status === "Draft") {
        onAuthoritativeTrip(local);
      } else {
        onPendingTripSubmitted(local);
        await clearWorkingDraft(ownerKey);
        await removeCachedDraft(ownerKey, local.id);
      }
    }
    if (acknowledged.length) {
      await compactSyncedOperations(ownerKey);
      await reloadOperations();
    }
  }, [reloadOperations]);

  useEffect(() => {
    const online = () => setBrowserOnline(true);
    const offline = () => {
      setBrowserOnline(false);
      setOfficeReachability("unknown");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const queue = await reloadOperations();
      if (!cancelled) await applyRecoveredAcknowledgements(queue);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRecoveredAcknowledgements, reloadOperations]);

  const checkOffice = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) {
      setBrowserOnline(false);
      setOfficeReachability("unknown");
      return false;
    }
    setOfficeReachability("checking");
    try {
      const health = await mobileHealth();
      if (!health.ok || !health.authenticated || !health.databaseReachable) {
        throw new Error("Invalid office health response");
      }
      setOfficeReachability("reachable");
      return true;
    } catch (error) {
      const apiError = asMobileApiError(error);
      if (apiError.status === 401 || apiError.status === 403) {
        await optionsRef.current.onUnauthorized();
      }
      setOfficeReachability("unreachable");
      return false;
    }
  }, []);

  const processQueue = useCallback(async (): Promise<void> => {
    if (syncPromiseRef.current) return syncPromiseRef.current;

    const run = (async () => {
      const {
        ownerKey,
        clientDraftId,
        onAuthoritativeTrip,
        onPendingTripSubmitted,
        onUnauthorized,
        refreshDrafts,
        notify,
      } = optionsRef.current;
      if (!(await checkOffice())) return;

      setSyncing(true);
      setSyncError(null);
      try {
        let queue = await loadMobileOperations(ownerKey);
        await applyRecoveredAcknowledgements(queue);
        queue = await loadMobileOperations(ownerKey);

        const blockedDrafts = new Set(
          queue
            .filter((operation) =>
              operation.status === "CONFLICT" || operation.status === "FAILED_PERMANENT"
            )
            .map((operation) => operation.clientDraftId)
        );
        const versionByDraft = new Map<string, number>();
        const tripIdByDraft = new Map<string, number>();
        const current = optionsRef.current.trip as Trip & { version?: number };
        if (current.id > 0 && current.version) {
          versionByDraft.set(clientDraftId, current.version);
          tripIdByDraft.set(clientDraftId, current.id);
        }

        const ordered = queue
          .filter((operation) =>
            ["PENDING", "FAILED_RETRYABLE", "SYNCING"].includes(operation.status)
          )
          .sort((a, b) =>
            a.clientDraftId === b.clientDraftId
              ? a.sequence - b.sequence
              : a.createdAt.localeCompare(b.createdAt)
          );

        for (let operation of ordered) {
          if (blockedDrafts.has(operation.clientDraftId)) continue;

          const knownTripId = tripIdByDraft.get(operation.clientDraftId);
          if (!operation.tripId && knownTripId) {
            operation =
              (await updateMobileOperation(ownerKey, operation.operationId, {
                tripId: knownTripId,
              })) ?? operation;
          }

          const isCreate = operation.step === "start" && !operation.tripId;
          const knownVersion = versionByDraft.get(operation.clientDraftId);
          if (!isCreate && operation.attempts === 0 && knownVersion) {
            operation =
              (await updateMobileOperation(ownerKey, operation.operationId, {
                expectedVersion: knownVersion,
              })) ?? operation;
          }
          if (!isCreate && operation.tripId && !operation.expectedVersion) {
            try {
              const latest = await loadMobileTrip(operation.tripId);
              const localUpdatedAt = (operation.payload as Trip).updatedAt;
              if (
                localUpdatedAt &&
                latest.updatedAt &&
                new Date(localUpdatedAt).getTime() !== new Date(latest.updatedAt).getTime()
              ) {
                await updateMobileOperation(ownerKey, operation.operationId, {
                  status: "CONFLICT",
                  lastError: "This Trip changed before the offline operation could synchronize.",
                  errorCode: "TRIP_UPDATED_AT_CONFLICT",
                });
                blockedDrafts.add(operation.clientDraftId);
                setConflictMessage(
                  "This Trip was changed from another device. Your local changes were preserved and were not uploaded."
                );
                continue;
              }
              operation =
                (await updateMobileOperation(ownerKey, operation.operationId, {
                  expectedVersion: latest.version,
                })) ?? operation;
              versionByDraft.set(operation.clientDraftId, latest.version);
            } catch (error) {
              const apiError = asMobileApiError(error);
              await updateMobileOperation(ownerKey, operation.operationId, {
                status: apiError.status === 403 ? "FAILED_PERMANENT" : "FAILED_RETRYABLE",
                lastError: apiError.message,
                errorCode: apiError.code,
              });
              continue;
            }
          }
          if (!isCreate && (!operation.tripId || !operation.expectedVersion)) {
            await updateMobileOperation(ownerKey, operation.operationId, {
              status: "FAILED_RETRYABLE",
              lastError: "Waiting for the preceding Trip operation acknowledgement.",
              errorCode: "WAITING_FOR_PREVIOUS_OPERATION",
            });
            continue;
          }

          operation =
            (await updateMobileOperation(ownerKey, operation.operationId, {
              status: "SYNCING",
              attempts: operation.attempts + 1,
              lastError: null,
              errorCode: null,
            })) ?? operation;
          setOperations(await loadMobileOperations(ownerKey));

          try {
            const request = {
              operationId: operation.operationId,
              clientDraftId: operation.clientDraftId,
              expectedVersion: isCreate ? null : operation.expectedVersion,
              mode: operation.mode,
              payload: operation.payload,
            } as const;
            const ack = isCreate
              ? await createMobileTrip(request)
              : await applyMobileTripStep(
                  operation.tripId as number,
                  operation.step,
                  request
                );
            if (ack.operationId !== operation.operationId || !ack.acknowledged) {
              throw new Error("Office acknowledgement did not match the queued operation");
            }

            await updateMobileOperation(ownerKey, operation.operationId, {
              status: "SYNCED",
              acknowledgement: acknowledgementSummary(ack),
              tripId: ack.trip.id,
              expectedVersion: ack.trip.version,
            });
            tripIdByDraft.set(operation.clientDraftId, ack.trip.id);
            versionByDraft.set(operation.clientDraftId, ack.trip.version);
            await assignServerTripToOperations(
              ownerKey,
              operation.clientDraftId,
              ack.trip.id,
              ack.trip.version
            );

            if (ack.trip.status === "Draft") {
              onAuthoritativeTrip(ack.trip);
              await saveWorkingDraft(ownerKey, {
                clientDraftId: operation.clientDraftId,
                trip: ack.trip,
                activeStep: optionsRef.current.activeStep,
                serverVersion: ack.trip.version,
              });
            } else {
              onPendingTripSubmitted(ack.trip);
              await clearWorkingDraft(ownerKey);
              await removeCachedDraft(ownerKey, ack.trip.id);
            }

            // Acknowledgement is durable locally before compaction. If the app
            // dies earlier, the same operation ID is retried safely server-side.
            await compactSyncedOperations(ownerKey);
          } catch (error) {
            const apiError = asMobileApiError(error);
            if (apiError.status === 401) {
              await updateMobileOperation(ownerKey, operation.operationId, {
                status: "FAILED_RETRYABLE",
                lastError: apiError.message,
                errorCode: apiError.code,
              });
              await onUnauthorized();
              break;
            }
            if (apiError.status === 409) {
              await updateMobileOperation(ownerKey, operation.operationId, {
                status: "CONFLICT",
                lastError: apiError.message,
                errorCode: apiError.code,
              });
              blockedDrafts.add(operation.clientDraftId);
              setConflictMessage(
                "This Trip was changed from another device. Your local changes were preserved and were not uploaded."
              );
              break;
            }
            if (apiError.status === 403 || (apiError.status >= 400 && apiError.status < 500 && !apiError.retryable)) {
              await updateMobileOperation(ownerKey, operation.operationId, {
                status: "FAILED_PERMANENT",
                lastError: apiError.message,
                errorCode: apiError.code,
              });
              blockedDrafts.add(operation.clientDraftId);
              setSyncError(apiError.message);
              break;
            }
            await updateMobileOperation(ownerKey, operation.operationId, {
              status: "FAILED_RETRYABLE",
              lastError: apiError.message,
              errorCode: apiError.code,
            });
            setOfficeReachability("unreachable");
            setSyncError(apiError.message);
            break;
          }
        }

        setOperations(await loadMobileOperations(ownerKey));
        await refreshDrafts();
        if ((await loadMobileOperations(ownerKey)).length === 0) {
          notify("All device changes are synchronized with the ERP.", "success");
        }
      } finally {
        setSyncing(false);
      }
    })();

    syncPromiseRef.current = run;
    try {
      await run;
    } finally {
      syncPromiseRef.current = null;
    }
  }, [applyRecoveredAcknowledgements, checkOffice]);

  const commit = useCallback(
    async (
      step: TripWizardStep,
      mode: "save" | "submit",
      localTrip: Trip
    ): Promise<MobileCommitResult> => {
      const lockKey = `${optionsRef.current.clientDraftId}:${step}:${mode}`;
      const existing = actionLocksRef.current.get(lockKey);
      if (existing) return existing;

      const action = (async (): Promise<MobileCommitResult> => {
        const { ownerKey, clientDraftId, activeStep, onLocalTrip, notify } = optionsRef.current;
        const current = optionsRef.current.trip as Trip & { version?: number };
        const operation = await appendMobileOperation(ownerKey, {
          operationId: newMobileOperationId(),
          clientDraftId,
          tripId: current.id > 0 ? current.id : null,
          step,
          mode,
          expectedVersion: current.id > 0 ? current.version ?? null : null,
          payload: localTrip,
        });

        // Queue durability is established before the UI reports local success.
        await saveWorkingDraft(ownerKey, {
          clientDraftId,
          trip: localTrip,
          activeStep,
          serverVersion: current.version ?? null,
        });
        onLocalTrip(localTrip);
        setOperations(await loadMobileOperations(ownerKey));

        if (!navigator.onLine) {
          notify("Saved locally. Waiting for connection.", "info");
          return "queued";
        }

        await processQueue();
        const latest = (await loadMobileOperations(ownerKey)).find(
          (item) => item.operationId === operation.operationId
        );
        if (!latest) return "synced";
        if (latest.status === "CONFLICT") return "conflict";
        if (latest.status === "FAILED_PERMANENT") return "rejected";
        notify("Saved locally. Waiting for the office backend.", "info");
        return "queued";
      })();

      actionLocksRef.current.set(lockKey, action);
      try {
        return await action;
      } finally {
        actionLocksRef.current.delete(lockKey);
      }
    }, [processQueue]
  );

  useEffect(() => {
    if (!browserOnline || operations.length === 0) return;
    const retryable = operations.some((operation) =>
      ["PENDING", "FAILED_RETRYABLE", "SYNCING", "SYNCED"].includes(operation.status)
    );
    if (!retryable) return;
    const timer = window.setTimeout(() => void processQueue(), 0);
    return () => window.clearTimeout(timer);
  }, [browserOnline, operations, processQueue]);

  useEffect(() => {
    if (!browserOnline || operations.length === 0) return;
    const timer = window.setInterval(() => void processQueue(), 30_000);
    return () => window.clearInterval(timer);
  }, [browserOnline, operations.length, processQueue]);

  return {
    operations,
    browserOnline,
    officeReachability,
    syncing,
    syncError,
    conflictMessage,
    commit,
    retry: processQueue,
    checkOffice,
    reloadOperations,
  };
}
