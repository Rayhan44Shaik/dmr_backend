import { Fragment } from "react";
import { Check, Lock, Play, MapPin, Package, Truck, Wallet } from "lucide-react";
import { TRIP_STEP_KEYS } from "../../../../shared/trip/workflow";

export type TripWizardCompletedMask = {
  start: boolean;
  farm: boolean;
  pickup: boolean;
  delivery: boolean;
  end?: boolean;
};

interface Props {
  /** Index of the currently selected / viewed step. */
  currentStep: number;
  steps: string[];
  completedMask: TripWizardCompletedMask;
  onStepClick?: (index: number) => void;
  /**
   * Steps at these indexes are LOCKED (a previous step has not been
   * submitted yet). Locked steps can never become the active step; clicking
   * one forwards to `onLockedStepClick` so the parent can redirect to the
   * correct next incomplete step and explain why the step is locked.
   */
  lockedSteps?: boolean[];
  onLockedStepClick?: (index: number) => void;
}

const STEP_ICONS = [Play, MapPin, Package, Truck, Wallet];

export function resolveStepperCompletion(completedMask: TripWizardCompletedMask): boolean[] {
  return TRIP_STEP_KEYS.map((key) => {
    if (key === "expenses") return Boolean(completedMask.end);
    const maskKey = (key === "deliveries" ? "delivery" : key) as keyof TripWizardCompletedMask;
    return Boolean(completedMask[maskKey]);
  });
}

/**
 * Read-only 5-step trip wizard for the Trip View.
 * Every step is selectable; the selected step is strongly highlighted with a
 * smooth transition while completed steps keep their ✓ indication.
 */
export default function TripWizardStepper({
  currentStep,
  steps,
  completedMask,
  onStepClick,
  lockedSteps = [],
  onLockedStepClick,
}: Props) {
  const stepStatus = resolveStepperCompletion(completedMask);

  return (
    <div className="flex items-center gap-1 md:gap-1.5 overflow-x-auto scrollbar-none py-1.5 px-1 select-none">
      {steps.map((label, index) => {
        const isCompleted = stepStatus[index];
        const isActive = index === currentStep;
        const isLocked = Boolean(lockedSteps[index]);
        const isClickable = !!onStepClick && !isLocked;
        const Icon = STEP_ICONS[index % STEP_ICONS.length];

        const pillClasses = `
          inline-flex items-center gap-1.5 rounded-full border px-2.5 md:px-3 py-1.5 text-[11px] font-bold whitespace-nowrap shrink-0
          transition-all duration-300 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40
          ${isClickable ? "cursor-pointer active:scale-95" : "cursor-default"}
          ${
            isActive
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-transparent shadow-md shadow-emerald-500/25 scale-105"
              : isLocked
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-80"
                : isCompleted
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
          }
        `.trim();

        const chipClasses = `
          grid place-items-center w-[18px] h-[18px] rounded-full text-[9px] font-extrabold shrink-0
          transition-all duration-300
          ${
            isActive
              ? "bg-white/25 text-white"
              : isLocked
                ? "bg-slate-200 text-slate-400"
                : isCompleted
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-500"
          }
        `;

        const content = (
          <>
            <span className={chipClasses} aria-hidden>
              {isCompleted ? <Check size={11} strokeWidth={3.5} /> : index + 1}
            </span>
            {isLocked ? (
              <Lock size={11} strokeWidth={2.5} aria-hidden />
            ) : (
              <Icon size={13} strokeWidth={2.5} aria-hidden />
            )}
            <span>{label}</span>
            {isCompleted && (
              <span
                className={`hidden md:inline text-[9px] font-semibold ${
                  isActive ? "text-emerald-50/90" : "text-emerald-500"
                }`}
              >
                Submitted
              </span>
            )}
          </>
        );

        return (
          <Fragment key={`${index}-${label}`}>
            {isClickable ? (
              <button
                type="button"
                onClick={() => onStepClick(index)}
                className={pillClasses}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${label}`}
              >
                {content}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // A locked step must never become the active step. Only the
                  // dedicated lock handler (parent redirects to the next
                  // incomplete step) may fire; onStepClick is never reached.
                  if (isLocked) {
                    onLockedStepClick?.(index);
                    return;
                  }
                  onStepClick?.(index);
                }}
                disabled={!isLocked && !onStepClick}
                className={pillClasses}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${label}${isLocked ? " (locked)" : ""}`}
                title={isLocked ? "Complete the previous step first" : undefined}
              >
                {content}
              </button>
            )}
            {index < steps.length - 1 && (
              <div
                aria-hidden
                className={`h-[2px] flex-1 min-w-3 rounded-full transition-colors duration-500 ${
                  stepStatus[index] ? "bg-emerald-400/70" : "bg-slate-200"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}