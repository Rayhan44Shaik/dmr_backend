/**
 * Employee bulk-import configuration — uses the transactional bulk create API
 * (addEmployeesBulk -> POST /masters/employees/bulk) for the whole batch.
 */
import type { BulkImportConfig } from "../components/bulk-import/bulkImportTypes";
import type { Employee } from "./types/employee";
import type { EmployeeInput } from "./services/employeeService";

// Departments listed alphabetically — mirrors EmployeeForm.
const DEPARTMENTS = [
  "Accountant",
  "Collection",
  "Driver",
  "Helper",
  "Loader",
  "Office Staff",
  "Operations",
  "Other",
  "Sales",
  "Supervisor",
];

export type EmployeeBulkRow = {
  employeeName: string;
  department: string;
  role: string;
  phoneNumber: string;
  email: string;
  address: string;
  joiningDate: string;
  aadharNumber: string;
  licenseNumber: string;
  salary: number;
  status: "Active" | "Inactive";
};

function toEmployeePayload(row: EmployeeBulkRow): EmployeeInput {
  return {
    employeeName: row.employeeName.trim(),
    department: row.department.trim(),
    role: row.role.trim(),
    phoneNumber: row.phoneNumber.trim(),
    email: row.email.trim(),
    address: row.address.trim(),
    joiningDate: row.joiningDate.trim(),
    aadharNumber: row.aadharNumber.trim() || undefined,
    licenseNumber: row.licenseNumber.trim() || undefined,
    salary: row.salary || 0,
    status: row.status,
  };
}

function validateEmployeeRow(row: EmployeeBulkRow, existing: Employee[]): string[] {
  const errors: string[] = [];
  const name = row.employeeName.trim();
  const department = row.department.trim();
  const phoneNumber = row.phoneNumber.trim();
  const email = row.email.trim();
  const aadharNumber = row.aadharNumber.trim().replace(/\s/g, "");
  const salary = Number(row.salary);

  if (!name) errors.push("Employee Name is required.");
  if (!department) errors.push("Department is required.");
  else if (!DEPARTMENTS.some((d) => d.toLowerCase() === department.toLowerCase())) {
    errors.push(`Department "${department}" is not valid. Must be one of: ${DEPARTMENTS.join(", ")}.`);
  }

  if (!phoneNumber) errors.push("Phone Number is required.");
  else if (!/^[0-9]{10}$/.test(phoneNumber)) errors.push("Mobile Number must be exactly 10 digits.");

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Please enter a valid email address.");
  }

  if (Number.isNaN(salary) || salary < 0) {
    errors.push("Salary must be a positive number.");
  }

  if (
    (department.toLowerCase() === "driver" || department.toLowerCase() === "collection") &&
    !row.licenseNumber.trim()
  ) {
    errors.push("License Number is required for Driver and Collection departments.");
  }

  if (aadharNumber && !/^[0-9]{12}$/.test(aadharNumber)) {
    errors.push("Aadhar Number must be exactly 12 digits.");
  }

  const duplicateName = existing.some(
    (e) =>
      e.department.trim().toLowerCase() === department.toLowerCase() &&
      e.employeeName.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicateName) {
    errors.push(`An employee with the name "${name}" already exists in the ${department} department.`);
  }

  const duplicatePhone = existing.some((e) => e.phoneNumber === phoneNumber);
  if (duplicatePhone) errors.push("Phone Number already exists.");

  if (email) {
    const duplicateEmail = existing.some(
      (e) => e.email.trim().toLowerCase() === email.toLowerCase() && e.email !== ""
    );
    if (duplicateEmail) errors.push("Email already exists.");
  }

  return errors;
}

type EmployeeBulkDeps = {
  /** Wraps the transactional POST /masters/employees/bulk endpoint. */
  addEmployeesBulk: (inputs: EmployeeInput[]) => Promise<unknown>;
  /** Re-fetch the employees list (hook's reload). */
  reload: () => Promise<unknown>;
};

/** Build the full Employee BulkImportConfig wired to the employees hook. */
export function buildEmployeeBulkImportConfig({
  addEmployeesBulk,
  reload,
}: EmployeeBulkDeps): BulkImportConfig<EmployeeBulkRow, Employee> {
  return {
    title: "Bulk Import Employees",
    subtitle: "Upload employees in one batch",
    noun: "Employee",
    nounPlural: "Employees",
    filenamePrefix: "Employees",
    columns: [
      { key: "Employee Name", required: true, sample: "Ravi Kumar" },
      { key: "Department", required: true, sample: "Driver" },
      { key: "Role", sample: "Manager" },
      { key: "Phone", aliases: ["Mobile Number", "Phone Number"], required: true, sample: "9876543210" },
      { key: "Email", sample: "ravi@example.com" },
      { key: "Joining Date", sample: "2025-01-15" },
      { key: "Salary", required: true, sample: 20000 },
      { key: "Aadhar Number", sample: "304460642044" },
      { key: "License Number", sample: "AP-11-2000-1234567" },
      { key: "Address", sample: "Main Road, Bhimavaram" },
      { key: "Status", sample: "Active" },
    ],
    parseRow: (record) => {
      const status = String(record["Status"] ?? "Active").trim();
      return {
        employeeName: String(record["Employee Name"] ?? "").trim(),
        department: String(record["Department"] ?? "").trim(),
        role: String(record["Role"] ?? "").trim(),
        phoneNumber: String(record["Phone"] ?? "").trim(),
        email: String(record["Email"] ?? "").trim(),
        address: String(record["Address"] ?? "").trim(),
        joiningDate: String(record["Joining Date"] ?? "").trim(),
        aadharNumber: String(record["Aadhar Number"] ?? "").trim(),
        licenseNumber: String(record["License Number"] ?? "").trim(),
        salary: Number(record["Salary"] ?? 0),
        status: status === "Inactive" ? "Inactive" : "Active",
      };
    },
    validateRow: validateEmployeeRow,
    duplicateKey: (row) =>
      `${row.department.toLowerCase()}|${row.employeeName.toLowerCase()}`,
    toPayload: toEmployeePayload,
    createMany: async (rows, onProgress) => {
      const total = rows.length;
      const payloads = rows.map((r) => toEmployeePayload(r.data));
      onProgress(0, total);
      try {
        await addEmployeesBulk(payloads);
        onProgress(total, total);
        return { total, attempted: total, imported: total, failed: 0, errors: [] };
      } catch (err) {
        onProgress(total, total);
        return {
          total,
          attempted: total,
          imported: 0,
          failed: total,
          errors: [{
            row: 0,
            message: err instanceof Error ? err.message : "Employee import failed.",
          }],
        };
      }
    },
    refresh: reload,
    errorToString: (err) =>
      err instanceof Error ? err.message : "Import failed. Please try again.",
  };
}