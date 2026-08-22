export const PENDING_DELETE_SECONDS = 10;

export const PENDING_DELETE_ACTION_CELL_CLASS = "pending-delete-action";

/** Kept for callers that still toggle a pending class. Must never blur the row. */
export const PENDING_DELETE_ROW_CLASS = "";

export function pendingDeleteBarPercent(
  secondsLeft: number,
  totalSeconds: number = PENDING_DELETE_SECONDS,
): number {
  if (totalSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, (Math.max(secondsLeft, 0) / totalSeconds) * 100));
}

export function pendingDeleteCountdownLabel(secondsLeft: number): string {
  const seconds = Math.max(secondsLeft, 1);
  return seconds === 1 ? "Deleting in 1 second..." : `Deleting in ${seconds} seconds...`;
}

export type PendingDeleteSnapshot<TId extends string | number> = {
  id: TId;
  secondsLeft: number;
  committing: boolean;
};

type ControllerOptions<TId extends string | number> = {
  onExpire: (id: TId) => void | Promise<void>;
  onChange: (items: PendingDeleteSnapshot<TId>[]) => void;
  seconds?: number;
  intervalMs?: number;
};

export function createPendingDeleteController<TId extends string | number>(
  options: ControllerOptions<TId>,
) {
  const seconds = options.seconds ?? PENDING_DELETE_SECONDS;
  const intervalMs = options.intervalMs ?? 1000;
  const timers = new Map<TId, ReturnType<typeof setInterval>>();
  const inFlight = new Set<TId>();
  const items = new Map<TId, { secondsLeft: number; committing: boolean }>();
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    options.onChange(
      [...items.entries()].map(([id, value]) => ({
        id,
        secondsLeft: value.secondsLeft,
        committing: value.committing,
      })),
    );
  };

  const clearTimer = (id: TId) => {
    const timer = timers.get(id);
    if (timer) {
      clearInterval(timer);
      timers.delete(id);
    }
  };

  const commit = async (id: TId) => {
    if (disposed || inFlight.has(id)) return;
    inFlight.add(id);
    const current = items.get(id);
    if (current) {
      items.set(id, { secondsLeft: current.secondsLeft, committing: true });
      emit();
    }
    try {
      await options.onExpire(id);
    } catch {
      // Existing delete handlers report their own errors. Always clear pending so the row is restored.
    } finally {
      inFlight.delete(id);
      items.delete(id);
      emit();
    }
  };

  const requestDelete = (id: TId) => {
    if (disposed || items.has(id) || inFlight.has(id) || timers.has(id)) return;
    items.set(id, { secondsLeft: seconds, committing: false });
    emit();
    timers.set(
      id,
      setInterval(() => {
        const current = items.get(id);
        if (!current || current.committing) {
          clearTimer(id);
          return;
        }
        if (current.secondsLeft <= 1) {
          clearTimer(id);
          void commit(id);
          return;
        }
        items.set(id, { secondsLeft: current.secondsLeft - 1, committing: false });
        emit();
      }, intervalMs),
    );
  };

  const cancel = (id: TId) => {
    if (inFlight.has(id)) return;
    clearTimer(id);
    if (!items.has(id)) return;
    items.delete(id);
    emit();
  };

  const dispose = () => {
    disposed = true;
    for (const id of [...timers.keys()]) clearTimer(id);
    items.clear();
    inFlight.clear();
  };

  return { requestDelete, cancel, dispose };
}
