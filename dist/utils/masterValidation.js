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
export function isMissing(value) {
    return value === undefined || value === null || String(value).trim() === "";
}
export function isPositiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
}
export function isValidDateInput(value) {
    if (isMissing(value))
        return true;
    const s = String(value).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!iso)
        return false;
    const [, year, month, day] = iso;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return parsed.getUTCFullYear() === Number(year)
        && parsed.getUTCMonth() === Number(month) - 1
        && parsed.getUTCDate() === Number(day);
}
export function aadharNumberOrNull(raw) {
    const value = str(raw.aadharNumber ?? raw.aadhar_number ?? "").replace(/\s/g, "");
    return value || null;
}
export function licenseNumberOrNull(raw) {
    const value = str(raw.licenseNumber ?? raw.license_number ?? "").trim();
    return value || null;
}
export function validateShopFields(raw) {
    const errors = [];
    const shopName = str(raw.shopName ?? raw.shop_name).trim();
    const ownerName = str(raw.ownerName ?? raw.owner_name).trim();
    const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
    const village = str(raw.city ?? raw.village).trim();
    if (isMissing(shopName))
        errors.push({ field: "shopName", message: "Shop Name is required." });
    else if (shopName.length < 3)
        errors.push({ field: "shopName", message: "Shop Name must contain at least 3 characters." });
    if (isMissing(ownerName))
        errors.push({ field: "ownerName", message: "Owner Name is required." });
    else if (ownerName.length < 3)
        errors.push({ field: "ownerName", message: "Owner Name must contain at least 3 characters." });
    if (isMissing(phoneNumber))
        errors.push({ field: "phoneNumber", message: "Mobile Number is required." });
    else if (!/^[0-9]{10}$/.test(phoneNumber))
        errors.push({ field: "phoneNumber", message: "Mobile Number must be exactly 10 digits." });
    if (isMissing(village))
        errors.push({ field: "city", message: "City is required." });
    if (!isMissing(raw.openingBalance) && !Number.isFinite(Number(raw.openingBalance))) {
        errors.push({ field: "openingBalance", message: "Opening Balance must be a valid number." });
    }
    if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
        errors.push({ field: "status", message: "Status must be Active or Inactive." });
    }
    return errors;
}
export function validateFarmFields(raw) {
    const errors = [];
    const farmName = str(raw.farmName ?? raw.farm_name).trim();
    const ownerName = str(raw.ownerName ?? raw.owner_name).trim();
    const supervisorName = str(raw.supervisorName ?? raw.supervisor_name).trim();
    const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
    const village = str(raw.village).trim();
    const capacity = raw.capacity ?? raw.birdCapacity;
    if (isMissing(farmName))
        errors.push({ field: "farmName", message: "Farm Name is required." });
    if (isMissing(ownerName))
        errors.push({ field: "ownerName", message: "Owner Name is required." });
    else if (ownerName.length < 3)
        errors.push({ field: "ownerName", message: "Owner Name must contain at least 3 characters." });
    if (isMissing(supervisorName))
        errors.push({ field: "supervisorName", message: "Supervisor Name is required." });
    if (isMissing(phoneNumber))
        errors.push({ field: "phoneNumber", message: "Mobile Number is required." });
    else if (!/^[0-9]{10}$/.test(phoneNumber))
        errors.push({ field: "phoneNumber", message: "Mobile Number must be exactly 10 digits." });
    if (isMissing(village))
        errors.push({ field: "village", message: "Village is required." });
    if (!isPositiveNumber(capacity))
        errors.push({ field: "capacity", message: "Bird Capacity must be a positive number." });
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
export function validateVehicleFields(raw) {
    const errors = [];
    const vehicleNumber = str(raw.vehicleNumber ?? raw.vehicle_number).trim();
    const vehicleType = str(raw.vehicleType ?? raw.vehicle_type).trim();
    const engineNumber = str(raw.engineNumber ?? raw.engine_number).trim();
    const chassisNumber = str(raw.chassisNumber ?? raw.chassis_number).trim();
    const noOfBoxes = raw.noOfBoxes;
    const birdCapacity = raw.birdCapacity;
    const capacityKg = raw.capacityKg;
    const emiDay = raw.emiDay;
    const totalEMIs = raw.totalEMIs;
    if (isMissing(vehicleNumber))
        errors.push({ field: "vehicleNumber", message: "Vehicle Number is required." });
    if (isMissing(vehicleType))
        errors.push({ field: "vehicleType", message: "Vehicle Type is required." });
    if (!isPositiveNumber(noOfBoxes))
        errors.push({ field: "noOfBoxes", message: "No. of Boxes must be a positive number." });
    if (!isPositiveNumber(birdCapacity))
        errors.push({ field: "birdCapacity", message: "Bird Capacity must be a positive number." });
    if (!isPositiveNumber(capacityKg))
        errors.push({ field: "capacityKg", message: "Capacity (Kg) must be a positive number." });
    if (isMissing(engineNumber))
        errors.push({ field: "engineNumber", message: "Engine Number is required." });
    if (isMissing(chassisNumber))
        errors.push({ field: "chassisNumber", message: "Chassis Number is required." });
    if (!isMissing(emiDay)) {
        const day = Number(emiDay);
        if (!Number.isInteger(day) || day < 1 || day > 31) {
            errors.push({ field: "emiDay", message: "EMI Day must be between 1 and 31." });
        }
    }
    if (!isMissing(totalEMIs)) {
        const count = Number(totalEMIs);
        if (!Number.isInteger(count) || count <= 0 || count > 1200) {
            errors.push({ field: "totalEMIs", message: "Total EMIs must be greater than zero." });
        }
    }
    for (const field of VEHICLE_DATE_FIELDS) {
        if (!isValidDateInput(raw[field]))
            errors.push({ field, message: `${field} must be a valid date (YYYY-MM-DD).` });
    }
    if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
        errors.push({ field: "status", message: "Status must be Active or Inactive." });
    }
    return errors;
}
export function validateEmployeeFields(raw) {
    const errors = [];
    const employeeName = str(raw.employeeName ?? raw.employee_name).trim();
    const department = str(raw.department).trim();
    const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
    const email = str(raw.email).trim();
    const aadharNumber = str(raw.aadharNumber ?? raw.aadhar_number).replace(/\s/g, "");
    const salary = raw.salary;
    if (isMissing(employeeName))
        errors.push({ field: "employeeName", message: "Employee Name is required." });
    if (isMissing(department))
        errors.push({ field: "department", message: "Department is required." });
    else if (!EMPLOYEE_DEPARTMENTS.some((d) => d.toLowerCase() === department.toLowerCase())) {
        errors.push({ field: "department", message: `Department "${department}" is not valid.` });
    }
    if (isMissing(phoneNumber))
        errors.push({ field: "phoneNumber", message: "Phone Number is required." });
    else if (!/^[0-9]{10}$/.test(phoneNumber))
        errors.push({ field: "phoneNumber", message: "Mobile Number must be exactly 10 digits." });
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
    if ((department.toLowerCase() === "driver" || department.toLowerCase() === "collection") &&
        isMissing(raw.licenseNumber)) {
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
export function validateBirdTypeFields(raw) {
    const errors = [];
    const birdType = str(raw.birdType ?? raw.bird_type).trim();
    const averageWeight = raw.averageWeight ?? raw.averageWeightKg ?? raw.average_weight;
    const category = str(raw.category || "Bird");
    if (isMissing(birdType))
        errors.push({ field: "birdType", message: "Name is required." });
    if (category === "Bird" && !isPositiveNumber(averageWeight)) {
        errors.push({ field: "averageWeight", message: "Average Weight must be a positive number." });
    }
    if (!["Bird", "Fuel Bunk"].includes(category))
        errors.push({ field: "category", message: "Category must be Bird or Fuel Bunk." });
    if (category === "Fuel Bunk") {
        if (isMissing(raw.ownerName))
            errors.push({ field: "ownerName", message: "Owner name is required." });
        if (isMissing(raw.mobileNumber))
            errors.push({ field: "mobileNumber", message: "Mobile number is required." });
        else if (!/^[0-9]{10}$/.test(str(raw.mobileNumber)))
            errors.push({ field: "mobileNumber", message: "Mobile number must be exactly 10 digits." });
        if (isMissing(raw.address))
            errors.push({ field: "address", message: "Bunk address is required." });
        const lat = Number(raw.latitude);
        const lon = Number(raw.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0))
            errors.push({ field: "latitude", message: "Valid GPS is required." });
    }
    if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
        errors.push({ field: "status", message: "Status must be Active or Inactive." });
    }
    return errors;
}
export function validateRouteFields(raw) {
    const errors = [];
    const routeName = str(raw.routeName ?? raw.route_name).trim();
    if (isMissing(routeName))
        errors.push({ field: "routeName", message: "Route name is required." });
    if (!isMissing(raw.status) && !ACTIVE_STATUSES.includes(String(raw.status).trim())) {
        errors.push({ field: "status", message: "Status must be Active or Inactive." });
    }
    return errors;
}
/** All rate columns on a market-rate record (Additional Metrics + Company Rates + Size Categories). */
export const MARKET_RATE_NUMERIC_FIELDS = [
    "vij",
    "gun",
    "rp",
    "sneha",
    "vencobRate",
    "vencobVii",
    "vencobGun",
    "associationVii",
    "c17",
    "c15",
    "c13",
    "c12",
    "c10",
];
const MARKET_RATE_LABELS = {
    vij: "Vij",
    gun: "Gun",
    rp: "R.P",
    sneha: "Sneha",
    vencobRate: "VenCob R.",
    vencobVii: "VenCob V.",
    vencobGun: "VenCob G.",
    associationVii: "Assoc V.",
    c17: "17",
    c15: "15",
    c13: "13",
    c12: "12",
    c10: "10",
};
export function validateMarketRateFields(raw) {
    const errors = [];
    const businessDate = str(raw.businessDate ?? raw.business_date).trim();
    if (isMissing(businessDate)) {
        errors.push({ field: "businessDate", message: "Business Date is required." });
    }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
        errors.push({ field: "businessDate", message: "Business Date must be a valid date (YYYY-MM-DD)." });
    }
    else {
        const parsed = new Date(`${businessDate}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) {
            errors.push({ field: "businessDate", message: "Business Date must be a valid date (YYYY-MM-DD)." });
        }
    }
    for (const field of MARKET_RATE_NUMERIC_FIELDS) {
        const value = raw[field];
        if (isMissing(value))
            continue;
        const n = Number(value);
        if (!Number.isFinite(n)) {
            errors.push({ field, message: `${MARKET_RATE_LABELS[field]} must be a valid number.` });
        }
        else if (n < 0) {
            errors.push({ field, message: `${MARKET_RATE_LABELS[field]} must be a non-negative number.` });
        }
    }
    return errors;
}
//# sourceMappingURL=masterValidation.js.map