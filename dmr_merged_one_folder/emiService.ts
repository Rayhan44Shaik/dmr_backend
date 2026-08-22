import { loadVehicles } from '../../masters/vehicles/services/vehicleService';
import type { Vehicle } from '../../masters/vehicles/types/vehicle';
import type { EmiOverview, EmiInstallment } from '../types';

/**
 * Compute EMI due dates for a vehicle based on Master Vehicle data.
 * Uses emiDay (day of month) and emiStartDate or purchaseDate as start.
 */
function generateEmiSchedule(vehicle: Vehicle): EmiInstallment[] {
  const totalEMIs = vehicle.totalEMIs;
  const emiDay = vehicle.emiDay;
  const purchaseAmount = vehicle.purchaseAmount;
  const emiStartDate = vehicle.emiStartDate || vehicle.purchaseDate;

  if (!totalEMIs || !emiDay || !emiStartDate || !purchaseAmount || totalEMIs <= 0) {
    return [];
  }

  const emiAmount = purchaseAmount / totalEMIs;
  const startDate = new Date(`${emiStartDate}T00:00:00`);
  const schedule: EmiInstallment[] = [];

  for (let i = 1; i <= totalEMIs; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));
    dueDate.setDate(emiDay);

    // Handle month overflow (e.g., Jan 31 + 1 month = Feb 31 -> Feb 28/29)
    if (dueDate.getDate() !== emiDay) {
      dueDate.setDate(0); // Last day of previous month
    }

    const dueDateStr = dueDate.toISOString().split('T')[0];
    schedule.push({
      installmentNo: i,
      dueDate: dueDateStr,
      amount: emiAmount,
      status: 'PENDING',
    });
  }

  return schedule;
}

/**
 * Determine completed EMIs by comparing due dates with current date.
 * An EMI is completed if its due date has passed.
 */
function computeCompletedEmis(schedule: EmiInstallment[]): { completed: number; pending: number; updatedSchedule: EmiInstallment[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let completed = 0;
  const updatedSchedule = schedule.map((installment) => {
    const dueDate = new Date(`${installment.dueDate}T00:00:00`);
    const isCompleted = dueDate <= today;
    if (isCompleted) completed++;
    return {
      ...installment,
      status: isCompleted ? 'COMPLETED' as const : 'PENDING' as const,
    };
  });

  return {
    completed,
    pending: schedule.length - completed,
    updatedSchedule,
  };
}

/**
 * Build EMI Overview for all vehicles with valid EMI data.
 * No "Active" filter — eligibility = Master Vehicle has EMI information.
 */
export async function buildEmiOverview(): Promise<EmiOverview[]> {
  const vehicles = await loadVehicles();

  // Filter vehicles that have at least the minimum EMI data to generate a schedule
  const vehiclesWithEmi = vehicles.filter((v: Vehicle) => {
    return v.purchaseAmount != null &&
      v.purchaseAmount > 0 &&
      v.totalEMIs != null &&
      v.totalEMIs > 0 &&
      v.emiDay != null &&
      v.emiDay > 0 &&
      v.emiDay <= 31 &&
      (v.emiStartDate || v.purchaseDate);
  });

  return vehiclesWithEmi.map((vehicle: Vehicle) => {
    const schedule = generateEmiSchedule(vehicle);
    const { completed, pending } = computeCompletedEmis(schedule);
    const totalEMIs = vehicle.totalEMIs || 0;
    const purchaseAmount = vehicle.purchaseAmount || 0;
    const status: EmiOverview['status'] = pending === 0 ? 'COMPLETED' : 'PENDING';

    return {
      vehicleId: vehicle.id,
      vehicleNo: String(vehicle.vehicleNo),
      vehicleNumber: vehicle.vehicleNumber,
      purchaseAmount,
      totalEMIs,
      completedEMIs: completed,
      pendingEMIs: pending,
      emiDay: vehicle.emiDay ?? null,
      emiStartDate: vehicle.emiStartDate ?? vehicle.purchaseDate ?? null,
      status,
    };
  });
}

/**
 * Get EMI schedule detail for a specific vehicle.
 */
export async function getEmiSchedule(vehicleId: number): Promise<EmiInstallment[]> {
  const vehicles = await loadVehicles();
  const vehicle = vehicles.find((v: Vehicle) => v.id === vehicleId);
  if (!vehicle) return [];

  const schedule = generateEmiSchedule(vehicle);
  const { updatedSchedule } = computeCompletedEmis(schedule);
  return updatedSchedule;
}

/**
 * Get KPI summary for the EMI dashboard.
 * Returns VEHICLE-LEVEL counts, not installment counts.
 */
export function computeKpis(overview: EmiOverview[]) {
  const totalVehicles = overview.length;
  const completedEmiVehicles = overview.filter((v) => v.pendingEMIs === 0).length;
  const pendingEmiVehicles = overview.filter((v) => v.pendingEMIs > 0).length;

  return {
    totalVehicles,
    completedEmiVehicles,
    pendingEmiVehicles,
  };
}