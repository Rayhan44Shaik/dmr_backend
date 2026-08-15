/**
 * Salary Calculation — the ONLY authoritative salary engine in the backend.
 *
 * Routes and services never compute gross / deductions / net themselves and
 * never accept client-computed totals; every persisted salary uses
 * calculateTotals() below. Money arithmetic is performed exclusively in
 * integer "cents" (value × 100) so persisted amounts are always exactly
 * representable in the NUMERIC(12,2) columns — no floating-point drift, no
 * 0.1 + 0.2 rounding artifacts on the money fields.
 *
 * Formula (matches the existing salary_records schema):
 *   totalGross     = basicSalary + overtime + incentives + fuelAllowance + nightAllowance
 *   totalDeductions = leaveDeduction + advanceRecovery + loanEMI + latePenalty + otherDeductions
 *   netSalary      = max(0, totalGross - totalDeductions)   // never negative
 */
export interface SalaryComponents {
    basicSalary?: number;
    overtime?: number;
    incentives?: number;
    fuelAllowance?: number;
    nightAllowance?: number;
    leaveDeduction?: number;
    advanceRecovery?: number;
    loanEMI?: number;
    latePenalty?: number;
    otherDeductions?: number;
}
export interface SalaryTotals {
    totalGross: number;
    totalDeductions: number;
    netSalary: number;
}
/** Convert a JS money value to integer cents. Non-finite / negative input is
 *  treated as 0 (validation already rejects these; this is a defensive floor). */
export declare function toCents(value: number): number;
/** Convert integer cents back to a plain number for JSON responses. */
export declare function centsToAmount(cents: number): number;
/** Round an arbitrary money value to cents — the public entry point used only
 *  by tests / other backend modules that need a canonical 2-dp number. */
export declare function money(value: number): number;
export declare function calculateTotals(c: SalaryComponents): SalaryTotals;
export declare const salaryCalculationService: {
    calculateTotals: typeof calculateTotals;
    toCents: typeof toCents;
    centsToAmount: typeof centsToAmount;
    money: typeof money;
};
