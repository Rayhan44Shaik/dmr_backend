// src/modules/staff/services/dutyPlannerService.ts
// Duty Planner — PostgreSQL backed via the existing staff duty API.
// Uses the shared Axios helpers (same conventions as Masters).

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../api";
import type {
  DutyAssignment,
  Employee,
} from "../types/staffDashboard";

const DUTY_PLANNER_PATH = "/staff/duty-planner";

export type DutyType = DutyAssignment["dutyType"];

export interface DutyPlannerDay {
  date: string;
  weekday: string;
}

export interface DutyPlannerSaturday {
  required: number;
  assigned: number;
  shortage: number;
  status: string;
  requiredByRole: Record<string, number>;
  assignedByRole: Record<string, number>;
  availableByRole: Record<string, number>;
}

export interface DutyPlannerValidation {
  ok: boolean;
  problems: string[];
}

/** Frontend view model for GET /api/staff/duty-planner (mapped from backend DutyWeek). */
export interface DutyPlannerWeek {
  weekStart: string;
  weekEnd: string;
  status: string;
  allRoles: string[];
  days: DutyPlannerDay[];
  employees: Employee[];
  assignments: DutyAssignment[];
  saturday: DutyPlannerSaturday;
  validation: DutyPlannerValidation;
}

export interface AutoPlanRow {
  employeeId: number;
  employeeName: string;
  department: string;
  role: string;
  date: string;
  dutyType: DutyType;
  vehicleId?: number | null;
  vehicleNo?: string | null;
  proposed: boolean;
}

export interface AutoPlan {
  employeesAffected: number;
  delivery: number;
  repair: number;
  office: number;
  collection: number;
  weeklyOff: number;
  saturdayRequired: number;
  saturdayAssigned: number;
  saturdayShortage: number;
  conflicts: string[];
  rows: AutoPlanRow[];
}

export interface WeekStatusInfo {
  weekStart: string;
  weekEnd: string;
  status: string;
}

// ============================================================
// COERCION HELPERS (backend rows -> typed frontend values)
// ============================================================

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maybeNum(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function maybeStr(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value);
  return s.length ? s : undefined;
}

function toEmployeeStatus(raw: Record<string, unknown>): Employee["status"] {
  const status = raw.status ?? (raw.active ? "Active" : "Inactive");
  if (status === "Suspended" || status === "suspended") return "Suspended";
  return status === "Active" || status === "active" ? "Active" : "Inactive";
}

function mapEmployee(raw: Record<string, unknown>): Employee {
  return {
    id: num(raw.id),
    employeeNo: num(raw.employeeNo ?? raw.employee_no),
    employeeName: str(raw.name ?? raw.employeeName ?? raw.employee_name),
    department: str(raw.department),
    role: str(raw.role),
    phoneNumber: str(raw.phoneNumber ?? raw.phone_number),
    email: str(raw.email),
    salary: num(raw.salary),
    status: toEmployeeStatus(raw),
    joiningDate: str(raw.joiningDate ?? raw.joining_date),
  };
}

function mapAssignment(raw: Record<string, unknown>): DutyAssignment {
  return {
    id: str(raw.id),
    employeeId: num(raw.employeeId ?? raw.employee_id),
    employeeName: str(raw.employeeName ?? raw.employee_name),
    department: str(raw.department),
    role: str(raw.role),
    dutyType: str(raw.dutyType ?? raw.duty_type) as DutyAssignment["dutyType"],
    date: str(raw.date ?? raw.duty_date),
    vehicleId: maybeNum(raw.vehicleId ?? raw.vehicle_id),
    vehicleNo: maybeStr(raw.vehicleNo ?? raw.vehicle_no),
  };
}

function mapSaturday(raw: Record<string, unknown> | undefined): DutyPlannerSaturday {
  return {
    required: num(raw?.required),
    assigned: num(raw?.assigned),
    shortage: num(raw?.shortage),
    status: str(raw?.status),
    requiredByRole: (raw?.requiredByRole as Record<string, number> | undefined) ?? {},
    assignedByRole: (raw?.assignedByRole as Record<string, number> | undefined) ?? {},
    availableByRole: (raw?.availableByRole as Record<string, number> | undefined) ?? {},
  };
}

function mapAutoPlan(raw: Record<string, unknown>): AutoPlan {
  const rows = Array.isArray(raw.rows)
    ? (raw.rows as Record<string, unknown>[]).map((r): AutoPlanRow => ({
        employeeId: num(r.employeeId),
        employeeName: str(r.employeeName),
        department: str(r.department),
        role: str(r.role),
        date: str(r.date),
        dutyType: str(r.dutyType) as DutyType,
        vehicleId: r.vehicleId == null ? null : num(r.vehicleId),
        vehicleNo: r.vehicleNo == null ? null : str(r.vehicleNo),
        proposed: Boolean(r.proposed),
      }))
    : [];
  return {
    employeesAffected: num(raw.employeesAffected),
    delivery: num(raw.delivery),
    repair: num(raw.repair),
    office: num(raw.office),
    collection: num(raw.collection),
    weeklyOff: num(raw.weeklyOff),
    saturdayRequired: num(raw.saturdayRequired),
    saturdayAssigned: num(raw.saturdayAssigned),
    saturdayShortage: num(raw.saturdayShortage),
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts.map(str) : [],
    rows,
  };
}

export function mapDutyPlannerWeek(raw: Record<string, unknown>): DutyPlannerWeek {
  return {
    weekStart: str(raw.weekStart),
    weekEnd: str(raw.weekEnd),
    status: str(raw.status ?? "Open"),
    allRoles: Array.isArray(raw.allRoles) ? raw.allRoles.map(str) : [],
    days: Array.isArray(raw.days)
      ? (raw.days as Record<string, unknown>[]).map((d) => ({
          date: str(d.date),
          weekday: str(d.weekday),
        }))
      : [],
    employees: Array.isArray(raw.employees)
      ? (raw.employees as Record<string, unknown>[]).map(mapEmployee)
      : [],
    assignments: Array.isArray(raw.assignments)
      ? (raw.assignments as Record<string, unknown>[]).map(mapAssignment)
      : [],
    saturday: mapSaturday(raw.saturday as Record<string, unknown> | undefined),
    validation: {
      ok: Boolean((raw.validation as Record<string, unknown> | undefined)?.ok ?? true),
      problems: Array.isArray((raw.validation as Record<string, unknown> | undefined)?.problems)
        ? ((raw.validation as Record<string, unknown>).problems as unknown[]).map(str)
        : [],
    },
  };
}

// ============================================================
// API
// ============================================================

/** GET /api/staff/duty-planner?weekStart=YYYY-MM-DD */
export async function getDutyPlannerWeek(weekStart: string): Promise<DutyPlannerWeek> {
  const { data } = await apiGet<Record<string, unknown>>(DUTY_PLANNER_PATH, {
    params: { weekStart },
  });
  return mapDutyPlannerWeek(data);
}

/** GET /api/staff/duty-planner/week/:weekStart */
export async function getDutyPlannerWeekStatus(weekStart: string): Promise<WeekStatusInfo> {
  const { data } = await apiGet<Record<string, unknown>>(
    `${DUTY_PLANNER_PATH}/week/${weekStart}`
  );
  return {
    weekStart: str(data.weekStart),
    weekEnd: str(data.weekEnd),
    status: str(data.status ?? "Open"),
  };
}

export interface UpsertAssignmentInput {
  id?: string;
  employeeId: number;
  dutyType: DutyType;
  date: string;
}

/**
 * Create or update a duty assignment.
 * POST /api/staff/duty-planner/assign (create)
 * PUT  /api/staff/duty-planner/:id   (update)
 * Both return the reloaded DutyWeek.
 */
export async function upsertDutyAssignment(
  input: UpsertAssignmentInput
): Promise<DutyPlannerWeek> {
  const payload: Record<string, unknown> = {
    employeeId: input.employeeId,
    dutyType: input.dutyType,
    date: input.date,
  };
  const { data } = input.id
    ? await apiPut<Record<string, unknown>>(`${DUTY_PLANNER_PATH}/${input.id}`, payload)
    : await apiPost<Record<string, unknown>>(`${DUTY_PLANNER_PATH}/assign`, payload);
  return mapDutyPlannerWeek(data);
}

/** DELETE /api/staff/duty-planner/:id — returns the reloaded DutyWeek. */
export async function deleteDutyAssignment(id: string): Promise<DutyPlannerWeek> {
  const { data } = await apiDelete<Record<string, unknown>>(`${DUTY_PLANNER_PATH}/${id}`);
  return mapDutyPlannerWeek(data);
}

/** POST /api/staff/duty-planner/auto-assign/preview */
export async function autoAssignPreview(weekStart: string): Promise<AutoPlan> {
  const { data } = await apiPost<Record<string, unknown>>(
    `${DUTY_PLANNER_PATH}/auto-assign/preview`,
    { weekStart }
  );
  return mapAutoPlan(data);
}

/** POST /api/staff/duty-planner/auto-assign/apply — returns the reloaded DutyWeek. */
export async function autoAssignApply(
  weekStart: string,
  plan?: AutoPlan,
  changedBy = "user"
): Promise<DutyPlannerWeek> {
  const body: Record<string, unknown> = { weekStart, changedBy };
  if (plan) body.plan = plan;
  const { data } = await apiPost<Record<string, unknown>>(
    `${DUTY_PLANNER_PATH}/auto-assign/apply`,
    body
  );
  return mapDutyPlannerWeek(data);
}

/** POST /api/staff/duty-planner/submit — returns the reloaded DutyWeek. */
export async function submitDutyPlannerWeek(
  weekStart: string,
  submittedBy = "user"
): Promise<DutyPlannerWeek> {
  const { data } = await apiPost<Record<string, unknown>>(
    `${DUTY_PLANNER_PATH}/submit`,
    { weekStart, submittedBy }
  );
  return mapDutyPlannerWeek(data);
}

export { handleApiError };