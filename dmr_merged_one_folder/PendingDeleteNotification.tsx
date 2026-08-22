import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import {
  PENDING_DELETE_SECONDS,
  pendingDeleteBarPercent,
  pendingDeleteCountdownLabel,
  type PendingDeleteSnapshot,
} from "../../shared/ui/pendingDelete";

export type PendingDeleteNoticeItem<TId extends string | number = string | number> =
  PendingDeleteSnapshot<TId> & {
    label?: string;
  };

type PendingDeleteNotificationProps<TId extends string | number> = {
  items: PendingDeleteNoticeItem<TId>[];
  onCancel: (id: TId) => void;
  totalSeconds?: number;
};

function mixRoseToSlate(progress01: number): string {
  const t = 1 - Math.max(0, Math.min(1, progress01));
  const r = Math.round(225 + (203 - 225) * t);
  const g = Math.round(29 + (213 - 29) * t);
  const b = Math.round(72 + (225 - 72) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function PendingDeleteNotification<TId extends string | number>({
  items,
  onCancel,
  totalSeconds = PENDING_DELETE_SECONDS,
}: PendingDeleteNotificationProps<TId>) {
  if (typeof document === "undefined" || items.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/25 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pending deletion"
    >
      <div className="flex w-full max-w-[480px] flex-col gap-3">
        {items.map((item) => {
          const remaining = item.committing ? 0 : item.secondsLeft;
          const percent = pendingDeleteBarPercent(remaining, totalSeconds);
          const secondsLabel = pendingDeleteCountdownLabel(item.secondsLeft);
          return (
            <div
              key={String(item.id)}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10"
            >
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600">
                  <Trash2 size={22} />
                </div>
                <h3 className="mt-3 text-base font-bold tracking-tight text-slate-800">
                  {item.label || "Delete Record?"}
                </h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  This record will be deleted automatically in {totalSeconds} seconds.
                </p>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-rose-700">{secondsLabel}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-500">
                    {Math.max(item.secondsLeft, item.committing ? 0 : 1)}s
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-1000 ease-linear"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: mixRoseToSlate(percent / 100),
                    }}
                  />
                </div>
              </div>

              {item.committing ? (
                <p className="mt-4 text-center text-xs font-medium text-slate-400">Deleting…</p>
              ) : (
                <button
                  type="button"
                  onClick={() => onCancel(item.id)}
                  className="mt-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
