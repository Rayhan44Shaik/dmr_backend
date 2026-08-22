import { AppError } from "../middleware/errorHandler.js";
export const TRIP_STEP_ORDER = [
    "start",
    "farm",
    "pickup",
    "deliveries",
    "expenses",
];
export const TRIP_STEP_LABELS = {
    start: "Step 1 — Trip Header",
    farm: "Step 2 — Farm Loading",
    pickup: "Step 3 — Pickup / DC",
    deliveries: "Step 4 — Shop Delivery",
    expenses: "Step 5 — Diesel & Expenses",
};
export function getWizardProgress(flags) {
    const start = Boolean(flags.startStepSubmitted);
    const farm = Boolean(flags.farmStepSubmitted);
    const pickup = Boolean(flags.pickupStepSubmitted);
    const deliveries = Boolean(flags.deliveryStepSubmitted);
    const expenses = Boolean(flags.expensesStepSubmitted || flags.endStepSubmitted);
    const completedSteps = [start, farm, pickup, deliveries, expenses].filter(Boolean).length;
    return {
        start,
        farm,
        pickup,
        deliveries,
        expenses,
        completedSteps,
        totalSteps: TRIP_STEP_ORDER.length,
        percentComplete: Math.round((completedSteps / TRIP_STEP_ORDER.length) * 100),
    };
}
/**
 * Resume engine — returns the first incomplete wizard step.
 * Terminal statuses (Completed, Deleted) return null.
 */
export function getResumeStep(flags) {
    if (flags.deleted || flags.status === "Deleted" || flags.status === "Completed") {
        return null;
    }
    const progress = getWizardProgress(flags);
    if (!progress.start)
        return "start";
    if (!progress.farm)
        return "farm";
    if (!progress.pickup)
        return "pickup";
    if (!progress.deliveries)
        return "deliveries";
    if (!progress.expenses)
        return "expenses";
    return null;
}
export function getResumeLabel(flags) {
    const step = getResumeStep(flags);
    return step ? TRIP_STEP_LABELS[step] : null;
}
export function assertStepOrder(step, flags) {
    const resume = getResumeStep(flags);
    if (resume == null)
        return;
    const requestedIndex = TRIP_STEP_ORDER.indexOf(step);
    const resumeIndex = TRIP_STEP_ORDER.indexOf(resume);
    // A step may only be submitted once every earlier step is complete (or when
    // re-submitting an already-completed step). Skipping ahead is blocked.
    if (requestedIndex > resumeIndex) {
        throw new AppError(422, `Complete ${TRIP_STEP_LABELS[resume]} before ${TRIP_STEP_LABELS[step]}`, {
            resumeStep: resume,
            requestedStep: step,
        });
    }
}
//# sourceMappingURL=tripResume.js.map