/**
 * In-memory Fleet session cache for ACTIVE Fleet tabs only
 * (maintenance, permits, EMI, analytics). PostgreSQL remains the source of truth.
 * Do not add Dashboard / Reports / Expenses / FASTAG keys — those modules are deferred.
 */
const DEFAULT_TTL_MS = 60_000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function fleetCacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function fleetCacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function fleetCacheInvalidate(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Deduplicate concurrent GETs for the same key. */
export function fleetSharedGet<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = loader()
    .then((value) => {
      fleetCacheSet(key, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}
