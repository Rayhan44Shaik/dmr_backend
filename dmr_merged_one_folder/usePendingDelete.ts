import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPendingDeleteController,
  type PendingDeleteSnapshot,
} from "../shared/ui/pendingDelete";

export type PendingDeleteRequestOptions = {
  label?: string;
};

export type PendingDeleteItem<TId extends string | number> = PendingDeleteSnapshot<TId> & {
  label?: string;
};

export type PendingDeleteControls<TId extends string | number> = {
  requestDelete: (id: TId, options?: PendingDeleteRequestOptions) => void;
  cancel: (id: TId) => void;
  isPending: (id: TId) => boolean;
  secondsLeft: (id: TId) => number;
  isCommitting: (id: TId) => boolean;
  pendingItems: PendingDeleteItem<TId>[];
};

/**
 * Shared delayed-delete UX. Cancel never calls onDelete.
 * Countdown completion calls the existing delete function once.
 *
 * React Strict Mode runs effect setup → cleanup → setup on the same instance.
 * The controller must be recreated after that cleanup, and requestDelete/cancel
 * must always go through the ref.
 */
export function usePendingDelete<TId extends string | number>(
  onDelete: (id: TId) => void | Promise<void>,
): PendingDeleteControls<TId> {
  const [snapshots, setSnapshots] = useState<PendingDeleteSnapshot<TId>[]>([]);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const labelsRef = useRef(new Map<TId, string>());

  const controllerRef = useRef<ReturnType<typeof createPendingDeleteController<TId>> | null>(null);

  const createController = () =>
    createPendingDeleteController<TId>({
      onExpire: (id) => onDeleteRef.current(id),
      onChange: setSnapshots,
    });

  if (controllerRef.current == null) {
    controllerRef.current = createController();
  }

  useEffect(() => {
    if (controllerRef.current == null) {
      controllerRef.current = createController();
    }
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const pendingItems = useMemo<PendingDeleteItem<TId>[]>(
    () =>
      snapshots.map((snapshot) => ({
        ...snapshot,
        label: labelsRef.current.get(snapshot.id),
      })),
    [snapshots],
  );

  const byId = useMemo(() => {
    const map = new Map<TId, PendingDeleteSnapshot<TId>>();
    for (const snapshot of snapshots) map.set(snapshot.id, snapshot);
    return map;
  }, [snapshots]);

  return {
    requestDelete: (id: TId, options?: PendingDeleteRequestOptions) => {
      if (options?.label) labelsRef.current.set(id, options.label);
      controllerRef.current?.requestDelete(id);
    },
    cancel: (id: TId) => {
      labelsRef.current.delete(id);
      controllerRef.current?.cancel(id);
    },
    isPending: (id: TId) => byId.has(id),
    secondsLeft: (id: TId) => byId.get(id)?.secondsLeft ?? 0,
    isCommitting: (id: TId) => byId.get(id)?.committing === true,
    pendingItems,
  };
}
