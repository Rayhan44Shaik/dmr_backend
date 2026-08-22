export type TripWizardStep = "start" | "farm" | "pickup" | "deliveries" | "expenses";
export declare const TRIP_STEP_ORDER: TripWizardStep[];
export declare const TRIP_STEP_LABELS: Record<TripWizardStep, string>;
export interface TripStepFlags {
    startStepSubmitted?: boolean;
    farmStepSubmitted?: boolean;
    pickupStepSubmitted?: boolean;
    deliveryStepSubmitted?: boolean;
    expensesStepSubmitted?: boolean;
    endStepSubmitted?: boolean;
    status?: string;
    deleted?: boolean;
}
export interface WizardProgress {
    start: boolean;
    farm: boolean;
    pickup: boolean;
    deliveries: boolean;
    expenses: boolean;
    completedSteps: number;
    totalSteps: number;
    percentComplete: number;
}
export declare function getWizardProgress(flags: TripStepFlags): WizardProgress;
/**
 * Resume engine — returns the first incomplete wizard step.
 * Terminal statuses (Completed, Deleted) return null.
 */
export declare function getResumeStep(flags: TripStepFlags): TripWizardStep | null;
export declare function getResumeLabel(flags: TripStepFlags): string | null;
export declare function assertStepOrder(step: TripWizardStep, flags: TripStepFlags): void;
