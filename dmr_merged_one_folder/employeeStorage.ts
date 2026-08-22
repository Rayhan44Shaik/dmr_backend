// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\storage\employeeStorage.ts

import { logAuditEvent } from "../../../utils/securityUtils";
import { StorageWrapper } from "../../../storage/storageWrapper";

const EMPLOYEE_STORAGE_KEY = "dmr_poultries_employees_master_data";

export type Employee = {
  id: number;
  employeeNo: number;
  employeeName: string;
  department: string;
  role: string;
  phoneNumber: string;
  email: string;
  address: string;
  joiningDate: string;
  aadharNumber?: string;
  licenseNumber?: string;
  salary: number;
  status: "Active" | "Inactive";
};

/**
 * Retrieves all stored employee records from offline browser storage using StorageWrapper.
 */
export function getStoredEmployees(): Employee[] {
  try {
    const data = StorageWrapper.get<Employee[]>(EMPLOYEE_STORAGE_KEY);
    if (!data || data.length === 0) {
      // Default initial seed data if nothing is in offline storage yet
      const initialEmployees: Employee[] = [
        {
          id: 1,
          employeeNo: 1,
          employeeName: "Satish Kumar",
          department: "Farm Operations",
          role: "Supervisor",
          phoneNumber: "9888112233",
          email: "satish.kumar@dmrpoultries.com",
          address: "Velpur, Tanuku",
          joiningDate: "2024-01-15",
          aadharNumber: "[Aadhaar Redacted]",
          licenseNumber: "AP0920210001234",
          salary: 25000,
          status: "Active",
        },
        {
          id: 2,
          employeeNo: 2,
          employeeName: "Anji Reddy",
          department: "Feed Mill",
          role: "Operator",
          phoneNumber: "9777223344",
          email: "anji.reddy@dmrpoultries.com",
          address: "Tanuku",
          joiningDate: "2024-03-01",
          aadharNumber: "[Aadhaar Redacted]",
          licenseNumber: "AP0920220005678",
          salary: 18000,
          status: "Active",
        },
      ];
      persistEmployees(initialEmployees);
      return initialEmployees;
    }
    return data;
  } catch (error) {
    console.error("Failed to parse employees from storage:", error);
    return [];
  }
}

/**
 * Persists the entire list of employee records into offline browser storage securely using StorageWrapper.
 */
export function persistEmployees(employees: Employee[]): void {
  try {
    StorageWrapper.set(EMPLOYEE_STORAGE_KEY, employees);
  } catch (error) {
    console.error("Failed to save employees to storage:", error);
  }
}

/**
 * Saves a single employee (creates a new entry or updates an existing record).
 */
export function saveEmployeeRecord(
  employeeData: Omit<Employee, "id" | "employeeNo">,
  existingId?: number
): Employee[] {
  const currentEmployees = getStoredEmployees();
  let updatedEmployees: Employee[];

  if (existingId) {
    updatedEmployees = currentEmployees.map((emp) =>
      emp.id === existingId ? { ...emp, ...employeeData } : emp
    );
    logAuditEvent("UPDATE_EMPLOYEE_OFFLINE", "Employees", existingId);
  } else {
    const newEmployee: Employee = {
      id: Date.now(),
      employeeNo: currentEmployees.length + 1,
      ...employeeData,
    };
    updatedEmployees = [...currentEmployees, newEmployee];
    logAuditEvent("CREATE_EMPLOYEE_OFFLINE", "Employees", newEmployee.id);
  }

  persistEmployees(updatedEmployees);
  return updatedEmployees;
}

/**
 * Deletes an employee record by its unique identifier and re-sequences employee serial numbers.
 */
export function deleteEmployeeRecord(id: number): Employee[] {
  const currentEmployees = getStoredEmployees();
  const filtered = currentEmployees.filter((emp) => emp.id !== id);

  // Re-index employeeNo sequentially
  const resequenced = filtered.map((emp, index) => ({
    ...emp,
    employeeNo: index + 1,
  }));

  persistEmployees(resequenced);
  logAuditEvent("DELETE_EMPLOYEE_OFFLINE", "Employees", id);
  return resequenced;
}