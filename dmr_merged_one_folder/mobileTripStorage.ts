import localforage from "localforage";
import type { Trip } from "../../operations/vehicle-trips/types/trip";
import type { TripWizardStep } from "../../operations/vehicle-trips/services/tripHeaderApiService";

const STORE_VERSION = 2 as const;

const mobileStore = localforage.createInstance({
  name: "dmr-poultries",
  storeName: "supervisor_mobile_trip",
  description: "Temporary, supervisor-scoped Trip Entry working state and durable sync queue",
});

export type MobileOperationStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "FAILED_RETRYABLE"
  | "CONFLICT"
  | "FAILED_PERMANENT";

export type MobileOperationAck = {
  tripId: number;
  tripNo: string;
  status: Trip["status"];
  version: number;
  updatedAt: string | null;
  serverTime: string;
};

export type MobileSyncOperation = {
  version: typeof STORE_VERSION;
  ownerKey: string;
  operationId: string;
  clientDraftId: string;
  tripId: number | null;
  step: TripWizardStep;
  mode: "save" | "submit";
  sequence: number;
  expectedVersion: number | null;
  payload: Partial<Trip>;
  status: MobileOperationStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  errorCode: string | null;
  acknowledgement: MobileOperationAck | null;
};

export type MobileWorkingDraft = {
  version: typeof STORE_VERSION;
  ownerKey: string;
  clientDraftId: string;
  trip: Trip;
  activeStep: number;
  serverVersion: number | null;
  savedAt: string;
};

type LegacyWorkingDraft = {
  version: 1;
  ownerKey: string;
  clientDraftId: string;
  trip: Trip;
  activeStep: number;
  baseServerUpdatedAt?: string | null;
  pendingSteps?: Array<{ step: TripWizardStep; mode: "save" | "submit" }>;
};

const mutationChains = new Map<string, Promise<unknown>>();

function safeOwnerKey(ownerKey: string): string {
  return ownerKey.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
}

function workingKey(ownerKey: string): string {
  return `working:${safeOwnerKey(ownerKey)}`;
}

function draftsKey(ownerKey: string): string {
  return `drafts:${safeOwnerKey(ownerKey)}`;
}

function queueKey(ownerKey: string): string {
  return `queue:${safeOwnerKey(ownerKey)}`;
}

export function newMobileOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16).padStart(8, "0").slice(-8)}-0000-4000-8000-${Math.random()
    .toString(16)
    .slice(2, 14)
    .padEnd(12, "0")}`;
}

function serializedMutation<T>(ownerKey: string, mutation: () => Promise<T>): Promise<T> {
  const key = safeOwnerKey(ownerKey);
  const previous = mutationChains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(mutation);
  mutationChains.set(key, next);
  return next.finally(() => {
    if (mutationChains.get(key) === next) mutationChains.delete(key);
  });
}

export function isActualDraft(trip: Trip): boolean {
  return trip.status === "Draft" && trip.deleted !== true;
}

export function nextIncompleteStep(trip: Trip): number {
  if (!trip.startStepSubmitted) return 0;
  if (!trip.farmStepSubmitted) return 1;
  if (!trip.pickupStepSubmitted) return 2;
  if (!trip.deliveryStepSubmitted) return 3;
  return 4;
}

export function hasTripWork(trip: Trip): boolean {
  return Boolean(
    trip.id ||
      trip.tripNo ||
      trip.startStepSubmitted ||
      trip.vehicleId ||
      trip.driverId ||
      trip.supervisorId ||
      trip.sourceFarmId ||
      trip.boxDetails?.length ||
      trip.deliveries?.length ||
      trip.closingMeter
  );
}

export function mergeDraftSnapshots(
  serverDrafts: Trip[],
  working: MobileWorkingDraft | null
): Trip[] {
  const drafts = serverDrafts.filter(isActualDraft);
  if (!working || !isActualDraft(working.trip) || !hasTripWork(working.trip)) return drafts;
  const withoutWorking = working.trip.id
    ? drafts.filter((trip) => trip.id !== working.trip.id)
    : drafts;
  return [working.trip, ...withoutWorking].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || a.tripDate).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || b.tripDate).getTime();
    return bTime - aTime;
  });
}

function isWorkingDraft(value: unknown, ownerKey: string): value is MobileWorkingDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MobileWorkingDraft>;
  return (
    candidate.version === STORE_VERSION &&
    candidate.ownerKey === ownerKey &&
    typeof candidate.clientDraftId === "string" &&
    Boolean(candidate.trip)
  );
}

function isLegacyWorkingDraft(value: unknown, ownerKey: string): value is LegacyWorkingDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyWorkingDraft>;
  return candidate.version === 1 && candidate.ownerKey === ownerKey && Boolean(candidate.trip);
}

export async function loadWorkingDraft(ownerKey: string): Promise<MobileWorkingDraft | null> {
  const stored = await mobileStore.getItem<unknown>(workingKey(ownerKey));
  if (isWorkingDraft(stored, ownerKey)) return stored;
  if (!isLegacyWorkingDraft(stored, ownerKey)) return null;

  const migrated: MobileWorkingDraft = {
    version: STORE_VERSION,
    ownerKey,
    clientDraftId: stored.clientDraftId || newMobileOperationId(),
    trip: stored.trip,
    activeStep: stored.activeStep ?? nextIncompleteStep(stored.trip),
    serverVersion: Number((stored.trip as Trip & { version?: number }).version) || null,
    savedAt: new Date().toISOString(),
  };
  await mobileStore.setItem(workingKey(ownerKey), migrated);

  // Preserve Phase 1 unsynchronized edits as durable Phase 2 operations.
  for (const pending of stored.pendingSteps ?? []) {
    await appendMobileOperation(ownerKey, {
      operationId: newMobileOperationId(),
      clientDraftId: migrated.clientDraftId,
      tripId: stored.trip.id > 0 ? stored.trip.id : null,
      step: pending.step,
      mode: pending.mode,
      expectedVersion: migrated.serverVersion,
      payload: stored.trip,
    });
  }
  return migrated;
}

export async function saveWorkingDraft(
  ownerKey: string,
  draft: Omit<MobileWorkingDraft, "version" | "ownerKey" | "savedAt">
): Promise<MobileWorkingDraft> {
  const stored: MobileWorkingDraft = {
    ...draft,
    version: STORE_VERSION,
    ownerKey,
    savedAt: new Date().toISOString(),
  };
  await mobileStore.setItem(workingKey(ownerKey), stored);
  return stored;
}

export async function clearWorkingDraft(ownerKey: string): Promise<void> {
  await mobileStore.removeItem(workingKey(ownerKey));
}

export async function loadCachedDrafts(ownerKey: string): Promise<Trip[]> {
  const stored = await mobileStore.getItem<unknown>(draftsKey(ownerKey));
  if (!Array.isArray(stored)) return [];
  return (stored as Trip[]).filter(isActualDraft);
}

export async function cacheDrafts(ownerKey: string, trips: Trip[]): Promise<void> {
  await mobileStore.setItem(draftsKey(ownerKey), trips.filter(isActualDraft));
}

export async function removeCachedDraft(ownerKey: string, tripId: number): Promise<void> {
  if (!tripId) return;
  const drafts = await loadCachedDrafts(ownerKey);
  await cacheDrafts(ownerKey, drafts.filter((trip) => trip.id !== tripId));
}

async function readQueue(ownerKey: string): Promise<MobileSyncOperation[]> {
  const value = await mobileStore.getItem<unknown>(queueKey(ownerKey));
  if (!Array.isArray(value)) return [];
  return (value as MobileSyncOperation[]).filter(
    (operation) => operation.version === STORE_VERSION && operation.ownerKey === ownerKey
  );
}

export async function loadMobileOperations(ownerKey: string): Promise<MobileSyncOperation[]> {
  return serializedMutation(ownerKey, async () => {
    const queue = await readQueue(ownerKey);
    let recovered = false;
    const operations = queue.map((operation) => {
      if (operation.status !== "SYNCING") return operation;
      recovered = true;
      return {
        ...operation,
        status: "PENDING" as const,
        updatedAt: new Date().toISOString(),
        lastError: "Application closed while synchronizing; safe retry scheduled.",
        errorCode: "INTERRUPTED",
      };
    });
    if (recovered) await mobileStore.setItem(queueKey(ownerKey), operations);
    return operations;
  });
}

export async function appendMobileOperation(
  ownerKey: string,
  input: Pick<
    MobileSyncOperation,
    | "operationId"
    | "clientDraftId"
    | "tripId"
    | "step"
    | "mode"
    | "expectedVersion"
    | "payload"
  >
): Promise<MobileSyncOperation> {
  return serializedMutation(ownerKey, async () => {
    const queue = await readQueue(ownerKey);
    const existing = queue.find((operation) => operation.operationId === input.operationId);
    if (existing) return existing;
    const sequence =
      Math.max(
        0,
        ...queue
          .filter((operation) => operation.clientDraftId === input.clientDraftId)
          .map((operation) => operation.sequence)
      ) + 1;
    const now = new Date().toISOString();
    const operation: MobileSyncOperation = {
      ...input,
      version: STORE_VERSION,
      ownerKey,
      sequence,
      status: "PENDING",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      lastError: null,
      errorCode: null,
      acknowledgement: null,
    };
    await mobileStore.setItem(queueKey(ownerKey), [...queue, operation]);
    return operation;
  });
}

export async function updateMobileOperation(
  ownerKey: string,
  operationId: string,
  patch: Partial<MobileSyncOperation>
): Promise<MobileSyncOperation | null> {
  return serializedMutation(ownerKey, async () => {
    const queue = await readQueue(ownerKey);
    const index = queue.findIndex((operation) => operation.operationId === operationId);
    if (index < 0) return null;
    const updated: MobileSyncOperation = {
      ...queue[index],
      ...patch,
      operationId: queue[index].operationId,
      ownerKey,
      updatedAt: new Date().toISOString(),
    };
    const next = [...queue];
    next[index] = updated;
    await mobileStore.setItem(queueKey(ownerKey), next);
    return updated;
  });
}

export async function assignServerTripToOperations(
  ownerKey: string,
  clientDraftId: string,
  tripId: number,
  expectedVersion: number
): Promise<MobileSyncOperation[]> {
  return serializedMutation(ownerKey, async () => {
    const queue = await readQueue(ownerKey);
    const next = queue.map((operation) =>
      operation.clientDraftId === clientDraftId && operation.status !== "SYNCED"
        ? { ...operation, tripId, expectedVersion, updatedAt: new Date().toISOString() }
        : operation
    );
    await mobileStore.setItem(queueKey(ownerKey), next);
    return next;
  });
}

export async function compactSyncedOperations(ownerKey: string): Promise<void> {
  await serializedMutation(ownerKey, async () => {
    const queue = await readQueue(ownerKey);
    await mobileStore.setItem(
      queueKey(ownerKey),
      queue.filter((operation) => operation.status !== "SYNCED")
    );
  });
}
