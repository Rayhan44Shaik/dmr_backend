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
export function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  // EPSILON compensates for binary floating-point representation (e.g. 0.29).
  return Math.round((value + Number.EPSILON) * 100);
}

/** Convert integer cents back to a plain number for JSON responses. */
export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

/** Round an arbitrary money value to cents — the public entry point used only
 *  by tests / other backend modules that need a canonical 2-dp number. */
export function money(value: number): number {
  return centsToAmount(toCents(value));
}

export function calculateTotals(c: SalaryComponents): SalaryTotals {
  const totalGross =
    toCents(c.basicSalary ?? 0) +
    toCents(c.overtime ?? 0) +
    toCents(c.incentives ?? 0) +
    toCents(c.fuelAllowance ?? 0) +
    toCents(c.nightAllowance ?? 0);

  const totalDeductions =
    toCents(c.leaveDeduction ?? 0) +
    toCents(c.advanceRecovery ?? 0) +
    toCents(c.loanEMI ?? 0) +
    toCents(c.latePenalty ?? 0) +
    toCents(c.otherDeductions ?? 0);

  const netSalary = centsToAmount(Math.max(0, totalGross - totalDeductions));

  return {
    totalGross: centsToAmount(totalGross),
    totalDeductions: centsToAmount(totalDeductions),
    netSalary,
  };
}

export const salaryCalculationService = {
  calculateTotals,
  toCents,
  centsToAmount,
  money,
};