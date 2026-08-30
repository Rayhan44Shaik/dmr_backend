import type { EmiOverview, VehicleEMI, VehicleEMIInstallment } from "../types/fleet.js";
export declare const vehicleEmiService: {
    /**
     * All EMI records across every vehicle, joined with the Vehicle Master for
     * the real registration number. Optional filters mirror what the EMI page
     * needs: a vehicle-wise lookup (vehicleId), a status filter, and a free-text
     * search over the vehicle number / finance company.
     */
    list(filters?: {
        vehicleId?: number;
        status?: string;
        search?: string;
    }): Promise<VehicleEMI[]>;
    /**
     * EMI Management overview — read-only, derived from the Vehicle Master.
     *
     * Every ACTIVE vehicle from `vehicles` is returned (whether or not it has an
     * EMI payment record yet). The authoritative vehicle facts — vehicle number,
     * purchase amount, purchase date, total EMI, EMI day — are read from the
     * Vehicle Master; the completed/payment state is LEFT JOINed from the
     * existing EMI payment schedule (vehicle_emis + vehicle_emi_installments)
     * when one exists. Status is restricted to pending | completed.
     *
     * The EMI page consumes ONLY this endpoint for its table and dashboard
     * cards. It never creates a separate vehicle or an EMI-specific copy of the
     * master data, and it never persists vehicle-master facts here.
     */
    overview(): Promise<EmiOverview[]>;
    getById(id: number): Promise<VehicleEMI>;
    /** EMI record for a specific vehicle (used by vehicle-wise EMI views). */
    getByVehicleId(vehicleId: number): Promise<VehicleEMI>;
    /** The persisted installment schedule for an EMI record, oldest first. */
    listSchedule(emiId: number): Promise<VehicleEMIInstallment[]>;
    /**
     * Create an EMI record + its full persisted schedule, atomically.
     *
     * - vehicleId must reference an existing Vehicle Master row (no duplicate
     *   vehicles are ever created). One EMI record per vehicle — a second
     *   attempt for the same vehicle is rejected (409).
     * - The schedule is generated from the authoritative inputs (loanAmount,
     *   totalEMIs, startDate + the vehicle's emi_day) inside the same
     *   transaction, so a failure on any installment rolls everything back.
     * - The returned record carries the derived fields the EMI page displays
     *   (emiAmount, endDate, paidEMIs, pendingEMIs, nextEMIDate, status).
     */
    create(body: unknown): Promise<VehicleEMI>;
    /**
     * Update an EMI record. Schedule-affecting fields (loanAmount, totalEMIs,
     * startDate, endDate, emiAmount) regenerate the pending schedule while
     * preserving the number of already-paid installments and their paid
     * timestamps; a plain financeCompany change touches only the record row.
     * Everything is atomic.
     */
    update(id: number, body: unknown): Promise<VehicleEMI>;
    /**
     * Mark the next pending installment as paid and recompute the EMI
     * aggregates (paidEMIs, nextEMIDate, status) in the same transaction so the
     * payment, the pending count, the next due date and the overall status can
     * never drift out of sync. Fully-paid EMIs reject further payments (409).
     *
     * When `idempotencyKey` is present, a retry of the same logical payment
     * returns the already-applied result and does not pay another installment.
     * The EMI row is locked so concurrent requests cannot double-apply.
     */
    pay(id: number, body: unknown): Promise<VehicleEMI>;
    /**
     * Delete an EMI record and its persisted schedule. The schedule rows follow
     * via ON DELETE CASCADE inside the same transaction.
     */
    remove(id: number): Promise<{
        id: number;
        vehicleId: number;
        deleted: boolean;
    }>;
};
