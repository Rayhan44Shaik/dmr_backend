import { str } from "./coerce.js";

// ---------------------------------------------------------------------------
// Shared master-validation helpers.
// Single source of truth for field rules used by BOTH the normal CRUD
// upserts and the bulk-import paths (no duplicated validation logic).
// Each validator normalises the raw record (camelCase + snake_case) and
// returns an array of { field, message } — empty when the row is valid.
// ---------------------------------------------------------------------------

export const EMPLOYEE_DEPARTMENTS = [
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

export const ACTIVE_STATUSES = ["Active", "Inactive"];
export const EMPLOYEE_STATUSES = ["Active", "Inactive", "Suspended"];

export type FieldError = { field: string; message: string };

export function isMissing(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

export function isPositiveNumber(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function isValidDateInput(value: unknown): boolean {
  if (isMissing(value)) return true;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  const parsed = new Date(s);
  return !Number.isNaN(parsed.getTime());
}

export function aadharNumberOrNull(raw: Record<string, unknown>): string | null {
  const value = str(raw.aadharNumber ?? raw.aadhar_number ?? "").replace(/\s/g, "");
  return value || null;
}

export function licenseNumberOrNull(raw: Record<string, unknown>): string | null {
  const value = str(raw.licenseNumber ?? raw.license_number ?? "").trim();
  return value || null;
}

export function validateShopFields(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const shopName = str(raw.shopName ?? raw.shop_name).trim();
  const ownerName = str(raw.ownerName ?? raw.owner_name).trim();
  const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
  const village = str(raw.village).trim();

  if (isMissing(shopName)) errors.push({ field: "shopName", message: "Shop Name is required." });
  else if (shopName.length < 3) errors.push({ field: "shopName", message: "Shop Name must contain at least 3 characters." });
  if (isMissing(ownerName)) errors.push({ field: "ownerName", message: "Owner Name is required." });
  else if (ownerName.length < 3) errors.push({ field: "ownerName", message: "Owner Name must contain at least 3 characters." });
  if (isMissing(phoneNumber)) errors.push({ field: "phoneNumber", message: "Mobile Number is required." });
  else if (!/^[0-9]{10}$/.test(phoneNumber)) errors.push({ field: "phoneNumber", message: "Mobile Number must be exactly 10 digits." });
  if (isMissing(village)) errors.push({ field: "village", message: "Village is required." });
  if (!isMissing(raw.openingBalance) && !Number.isFinite(Number(raw.openingBalance))) {
    errors.push({ field: "openingBalance", message: "Opening Balance must be a valid number." });
  }
  if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
    errors.push({ field: "status", message: "Status must be Active or Inactive." });
  }
  return errors;
}

export function validateFarmFields(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const farmName = str(raw.farmName ?? raw.farm_name).trim();
  const ownerName = str(raw.ownerName ?? raw.owner_name).trim();
  const supervisorName = str(raw.supervisorName ?? raw.supervisor_name).trim();
  const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
  const village = str(raw.village).trim();
  const capacity = raw.capacity ?? raw.birdCapacity;

  if (isMissing(farmName)) errors.push({ field: "farmName", message: "Farm Name is required." });
  if (isMissing(ownerName)) errors.push({ field: "ownerName", message: "Owner Name is required." });
  else if (ownerName.length < 3) errors.push({ field: "ownerName", message: "Owner Name must contain at least 3 characters." });
  if (isMissing(supervisorName)) errors.push({ field: "supervisorName", message: "Supervisor Name is required." });
  if (isMissing(phoneNumber)) errors.push({ field: "phoneNumber", message: "Mobile Number is required." });
  else if (!/^[0-9]{10}$/.test(phoneNumber)) errors.push({ field: "phoneNumber", message: "Mobile Number must be exactly 10 digits." });
  if (isMissing(village)) errors.push({ field: "village", message: "Village is required." });
  if (!isPositiveNumber(capacity)) errors.push({ field: "capacity", message: "Bird Capacity must be a positive number." });
  if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
    errors.push({ field: "status", message: "Status must be Active or Inactive." });
  }
  return errors;
}

const VEHICLE_DATE_FIELDS = [
  "insuranceExpiry",
  "permitExpiry",
  "fitnessExpiry",
  "purchaseDate",
  "emiStartDate",
  "rcDate",
];

export function validateVehicleFields(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const vehicleNumber = str(raw.vehicleNumber ?? raw.vehicle_number).trim();
  const vehicleType = str(raw.vehicleType ?? raw.vehicle_type).trim();
  const engineNumber = str(raw.engineNumber ?? raw.engine_number).trim();
  const chassisNumber = str(raw.chassisNumber ?? raw.chassis_number).trim();
  const noOfBoxes = raw.noOfBoxes;
  const birdCapacity = raw.birdCapacity;
  const capacityKg = raw.capacityKg;
  const emiDay = raw.emiDay;
  const totalEMIs = raw.totalEMIs;

  if (isMissing(vehicleNumber)) errors.push({ field: "vehicleNumber", message: "Vehicle Number is required." });
  if (isMissing(vehicleType)) errors.push({ field: "vehicleType", message: "Vehicle Type is required." });
  if (!isPositiveNumber(noOfBoxes)) errors.push({ field: "noOfBoxes", message: "No. of Boxes must be a positive number." });
  if (!isPositiveNumber(birdCapacity)) errors.push({ field: "birdCapacity", message: "Bird Capacity must be a positive number." });
  if (!isPositiveNumber(capacityKg)) errors.push({ field: "capacityKg", message: "Capacity (Kg) must be a positive number." });
  if (isMissing(engineNumber)) errors.push({ field: "engineNumber", message: "Engine Number is required." });
  if (isMissing(chassisNumber)) errors.push({ field: "chassisNumber", message: "Chassis Number is required." });

  if (!isMissing(emiDay)) {
    const day = Number(emiDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.push({ field: "emiDay", message: "EMI Day must be between 1 and 31." });
    }
  }
  if (!isMissing(totalEMIs)) {
    const count = Number(totalEMIs);
    if (!Number.isFinite(count) || count <= 0) {
      errors.push({ field: "totalEMIs", message: "Total EMIs must be greater than zero." });
    }
  }

  for (const field of VEHICLE_DATE_FIELDS) {
    if (!isValidDateInput(raw[field])) errors.push({ field, message: `${field} must be a valid date (YYYY-MM-DD).` });
  }
  if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
    errors.push({ field: "status", message: "Status must be Active or Inactive." });
  }
  return errors;
}

export function validateEmployeeFields(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const employeeName = str(raw.employeeName ?? raw.employee_name).trim();
  const department = str(raw.department).trim();
  const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
  const email = str(raw.email).trim();
  const aadharNumber = str(raw.aadharNumber ?? raw.aadhar_number).replace(/\s/g, "");
  const salary = raw.salary;

  if (isMissing(employeeName)) errors.push({ field: "employeeName", message: "Employee Name is required." });
  if (isMissing(department)) errors.push({ field: "department", message: "Department is required." });
  else if (!EMPLOYEE_DEPARTMENTS.some((d) => d.toLowerCase() === department.toLowerCase())) {
    errors.push({ field: "department", message: `Department "${department}" is not valid.` });
  }
  if (isMissing(phoneNumber)) errors.push({ field: "phoneNumber", message: "Phone Number is required." });
  else if (!/^[0-9]{10}$/.test(phoneNumber)) errors.push({ field: "phoneNumber", message: "Mobile Number must be exactly 10 digits." });

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "Please enter a valid email address." });
  }

  const salaryNum = Number(salary);
  if (isMissing(salary) || !Number.isFinite(salaryNum) || salaryNum < 0) {
    errors.push({ field: "salary", message: "Salary must be a non-negative number." });
  }

  if (aadharNumber && !/^[0-9]{12}$/.test(aadharNumber)) {
    errors.push({ field: "aadharNumber", message: "Aadhar Number must be exactly 12 digits." });
  }
  if (
    (department.toLowerCase() === "driver" || department.toLowerCase() === "collection") &&
    isMissing(raw.licenseNumber)
  ) {
    errors.push({ field: "licenseNumber", message: "License Number is required for Driver and Collection departments." });
  }
  if (!isValidDateInput(raw.joiningDate)) {
    errors.push({ field: "joiningDate", message: "Joining Date must be a valid date (YYYY-MM-DD)." });
  }
  if (!isMissing(raw.status) && !EMPLOYEE_STATUSES.includes(String(raw.status).trim())) {
    errors.push({ field: "status", message: "Status must be Active, Inactive or Suspended." });
  }
  return errors;
}

export function validateBirdTypeFields(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const birdType = str(raw.birdType ?? raw.bird_type).trim();
  const averageWeight = raw.averageWeight ?? raw.averageWeightKg ?? raw.average_weight;

  if (isMissing(birdType)) errors.push({ field: "birdType", message: "Bird Type is required." });
  if (!isPositiveNumber(averageWeight)) {
    errors.push({ field: "averageWeight", message: "Average Weight must be a positive number." });
  }
  if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
    errors.push({ field: "status", message: "Status must be Active or Inactive." });
  }
  return errors;
}

export function validateRouteFields(raw: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const routeName = str(raw.routeName ?? raw.route_name).trim();

  if (isMissing(routeName)) errors.push({ field: "routeName", message: "Route name is required." });
  if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
    errors.push({ field: "status", message: "Status must be Active or Inactive." });
  }
  return errors;
}
