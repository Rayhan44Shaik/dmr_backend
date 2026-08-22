// src/modules/masters/employees/services/employeeService.ts
/**
 * Employees master — PostgreSQL ONLY via shared Axios helpers.
 * Static/mock arrays and localStorage are not used as a data source.
 */

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../../api";
import type { Employee } from "../types/employee";

const EMPLOYEES_PATH = "/masters/employees";

/** Legacy browser keys that previously held mock employee lists. */
const LEGACY_STORAGE_KEYS = [
  "dmr-employees",
  "dmr_poultries_employees_master_data",
] as const;

/** Cache filled exclusively by GET /api/masters/employees (and mutations that reload). */
let employeesCache: Employee[] = [];

export type EmployeeInput = Omit<Employee, "id" | "employeeNo"> & {
  id?: number;
  employeeNo?: number;
};

function clearLegacyEmployeeStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage access errors */
  }
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function normalizeStatus(status: unknown): Employee["status"] {
  if (
    status === true ||
    status === 1 ||
    status === "Active" ||
    status === "active"
  ) {
    return "Active";
  }
  return "Inactive";
}

function mapEmployee(raw: Record<string, unknown>): Employee {
  return {
    id: Number(raw.id),
    employeeNo: Number(raw.employeeNo ?? raw.employee_no ?? 0),
    employeeName: String(raw.employeeName ?? raw.employee_name ?? ""),
    department: String(raw.department ?? ""),
    role: String(raw.role ?? ""),
    phoneNumber: String(raw.phoneNumber ?? raw.phone_number ?? ""),
    email: String(raw.email ?? ""),
    address: String(raw.address ?? ""),
    joiningDate: normalizeDate(
      (raw.joiningDate ?? raw.joining_date) as string | null | undefined
    ),
    aadharNumber: raw.aadharNumber
      ? String(raw.aadharNumber)
      : raw.aadhar_number
        ? String(raw.aadhar_number)
        : undefined,
    licenseNumber: raw.licenseNumber
      ? String(raw.licenseNumber)
      : raw.license_number
        ? String(raw.license_number)
        : undefined,
    salary: Number(raw.salary ?? 0),
    status: normalizeStatus(raw.status),
  };
}

function toPayload(
  input: (EmployeeInput | Partial<Employee>) & { id?: number }
): Record<string, unknown> {
  const salary = Number(input.salary ?? 0);
  const payload: Record<string, unknown> = {
    employeeNo: input.employeeNo,
    employeeName: input.employeeName?.trim(),
    department: input.department,
    role: input.role?.trim() ?? "",
    phoneNumber: input.phoneNumber?.trim() ?? "",
    email: input.email?.trim() ?? "",
    address: input.address?.trim() ?? "",
    joiningDate: input.joiningDate
      ? normalizeDate(input.joiningDate) || null
      : null,
    aadharNumber: input.aadharNumber?.trim() || null,
    licenseNumber: input.licenseNumber?.trim() || null,
    salary: Number.isFinite(salary) ? salary : 0,
    // Backend expects "Active" | "Inactive", never a boolean.
    status: normalizeStatus(input.status ?? "Active"),
  };

  if (input.id != null && !Number.isNaN(Number(input.id))) {
    payload.id = Number(input.id);
  }

  return payload;
}

function setCacheFromApi(rows: Record<string, unknown>[] | null | undefined): Employee[] {
  employeesCache = Array.isArray(rows) ? rows.map(mapEmployee) : [];
  return employeesCache;
}

/** Sync snapshot for other modules — reflects last successful API load only. */
export function getEmployees(): Employee[] {
  return employeesCache;
}

/**
 * @deprecated Do not use for Employees UI. Mutations must go through API helpers.
 */
export function saveEmployees(_employees: Employee[]): void {
  // Intentionally no-op for Employees page data. Cache is API-owned.
}

/** GET /api/masters/employees — sole source of truth for the Employees table. */
export async function loadEmployees(department?: string): Promise<Employee[]> {
  clearLegacyEmployeeStorage();
  const { data } = await apiGet<Record<string, unknown>[]>(EMPLOYEES_PATH, {
    params: department ? { department } : undefined,
  });
  return setCacheFromApi(data);
}

/** POST /api/masters/employees then caller should reload via GET. */
export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  clearLegacyEmployeeStorage();
  const { data } = await apiPost<Record<string, unknown>>(
    EMPLOYEES_PATH,
    toPayload(input)
  );
  return mapEmployee(data);
}

/** POST /api/masters/employees/bulk — Upload multiple employees from Excel */
export async function bulkCreateEmployees(inputs: EmployeeInput[]): Promise<Employee[]> {
  clearLegacyEmployeeStorage();
  const payload = inputs.map(toPayload);
  const { data } = await apiPost<Record<string, unknown>[]>(
    `${EMPLOYEES_PATH}/bulk`,
    payload
  );
  return Array.isArray(data) ? data.map(mapEmployee) : [];
}

/** PUT /api/masters/employees/:id then caller should reload via GET. */
export async function updateEmployee(
  id: number,
  input: EmployeeInput | Partial<Employee>
): Promise<Employee> {
  clearLegacyEmployeeStorage();
  // Send the complete employee object, including id, for the PUT body.
  const { data } = await apiPut<Record<string, unknown>>(
    `${EMPLOYEES_PATH}/${id}`,
    toPayload({
      ...(input as EmployeeInput),
      id,
      employeeNo: input.employeeNo,
    })
  );
  return mapEmployee(data);
}

/** DELETE /api/masters/employees/:id then caller should reload via GET. */
export async function deleteEmployee(id: number): Promise<void> {
  clearLegacyEmployeeStorage();
  await apiDelete(`${EMPLOYEES_PATH}/${id}`);
}

/** Always re-fetch from PostgreSQL. */
export async function refreshEmployees(): Promise<Employee[]> {
  return loadEmployees();
}

export { handleApiError };
