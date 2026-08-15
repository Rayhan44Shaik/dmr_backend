/** Convert a JS money value to integer cents. Non-finite / negative input is
 *  treated as 0 (validation already rejects these; this is a defensive floor). */
export function toCents(value) {
    if (!Number.isFinite(value) || value < 0)
        return 0;
    // EPSILON compensates for binary floating-point representation (e.g. 0.29).
    return Math.round((value + Number.EPSILON) * 100);
}
/** Convert integer cents back to a plain number for JSON responses. */
export function centsToAmount(cents) {
    return Math.round(cents) / 100;
}
/** Round an arbitrary money value to cents — the public entry point used only
 *  by tests / other backend modules that need a canonical 2-dp number. */
export function money(value) {
    return centsToAmount(toCents(value));
}
export function calculateTotals(c) {
    const totalGross = toCents(c.basicSalary ?? 0) +
        toCents(c.overtime ?? 0) +
        toCents(c.incentives ?? 0) +
        toCents(c.fuelAllowance ?? 0) +
        toCents(c.nightAllowance ?? 0);
    const totalDeductions = toCents(c.leaveDeduction ?? 0) +
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
//# sourceMappingURL=salaryCalculationService.js.map