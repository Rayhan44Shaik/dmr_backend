import { Check, CircleAlert, CircleX, Save, Send, X } from "lucide-react";

export type WizardNoticeState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export function WizardStepNotice({
  notice,
  dirty = false,
}: {
  notice?: WizardNoticeState;
  dirty?: boolean;
}) {
  const shown = notice ?? (dirty ? { type: "info" as const, message: "You have unsaved changes." } : null);
  const styles = shown?.type === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : shown?.type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  const Icon = shown?.type === "success" ? Check : shown?.type === "error" ? CircleX : CircleAlert;

  return (
    <div className="min-h-9" aria-live="polite">
      {shown && (
        <div className={`h-9 px-3 rounded-lg border flex items-center gap-2 text-xs font-medium ${styles}`}>
          <Icon size={14} className="shrink-0" />
          <span className="truncate">{shown.message}</span>
        </div>
      )}
    </div>
  );
}

type WizardActionBarProps = {
  onCancel: () => void;
  onSave?: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  saveDisabled?: boolean;
  submitDisabled?: boolean;
  busy?: boolean;
  saveLabel?: string;
  submitLabel: string;
};

export function WizardActionBar({
  onCancel,
  onSave,
  onSubmit,
  saveDisabled = false,
  submitDisabled = false,
  busy = false,
  saveLabel = "Save Progress",
  submitLabel,
}: WizardActionBarProps) {
  const base = "w-full sm:w-auto h-10 px-5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-1.5";
  return (
    <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-100">
      <button type="button" onClick={onCancel} disabled={busy} className={`${base} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
        <X size={14} /> Cancel
      </button>
      {onSave && (
        <button type="button" onClick={() => void onSave()} disabled={busy || saveDisabled} className={`${base} border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}>
          <Save size={14} /> {busy ? "Please wait…" : saveLabel}
        </button>
      )}
      <button type="button" onClick={() => void onSubmit()} disabled={busy || submitDisabled} className={`${base} bg-blue-600 text-white hover:bg-blue-700 shadow-sm`}>
        <Send size={14} /> {busy ? "Please wait…" : submitLabel}
      </button>
    </div>
  );
}
