import {
  Check,
  CloudOff,
  LoaderCircle,
  RefreshCw,
  ServerOff,
  ShieldAlert,
  TriangleAlert,
  Wifi,
} from "lucide-react";

export type MobileSyncState =
  | "synced"
  | "syncing"
  | "offline"
  | "waiting-office"
  | "local"
  | "failed"
  | "conflict";

const stateConfig = {
  synced: {
    label: "Synced",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Icon: Check,
  },
  syncing: {
    label: "Syncing…",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    Icon: LoaderCircle,
  },
  offline: {
    label: "Offline",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    Icon: CloudOff,
  },
  "waiting-office": {
    label: "Waiting for Office",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    Icon: ServerOff,
  },
  local: {
    label: "Saved locally",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    Icon: Wifi,
  },
  failed: {
    label: "Sync failed",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    Icon: TriangleAlert,
  },
  conflict: {
    label: "Conflict",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    Icon: ShieldAlert,
  },
} as const;

export default function MobileSyncIndicator({
  state,
  onRetry,
}: {
  state: MobileSyncState;
  onRetry?: () => void;
}) {
  const config = stateConfig[state];
  const Icon = config.Icon;
  const canRetry = (state === "failed" || state === "waiting-office" || state === "local") && onRetry;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${config.className}`}
        role="status"
        aria-live="polite"
      >
        <Icon size={13} className={state === "syncing" ? "animate-spin" : ""} />
        {config.label}
      </span>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600"
          aria-label="Retry synchronization"
          title="Retry"
        >
          <RefreshCw size={13} />
        </button>
      )}
    </div>
  );
}
