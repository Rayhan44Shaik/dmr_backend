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
export const ASSOCIATION_TYPES = ["Vencob Vij", "Vencob Gun", "Ass Vij", "Ass Gun"];
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
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return true;
    const parsed = new Date(s);
    return !Number.isNaN(parsed.getTime());
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
    // `city` replaced the legacy `village` field (shop master redesign); accept
    // either key, consistent with the other alias fallbacks above.
    const city = str(raw.city ?? raw.village).trim();
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
    if (isMissing(city))
        errors.push({ field: "city", message: "City is required." });
    // Shop master redesign (migration 040): Email ID is REQUIRED on create,
    // update and bulk import.
    const email = str(raw.email).trim();
    if (isMissing(email)) {
        errors.push({ field: "email", message: "Email ID is required." });
    }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ field: "email", message: "Please enter a valid email address." });
    }
    const secondaryPhone = str(raw.secondaryPhoneNumber ?? raw.secondary_phone_number).trim();
    if (!isMissing(secondaryPhone) && !/^[0-9]{10}$/.test(secondaryPhone)) {
        errors.push({ field: "secondaryPhoneNumber", message: "Secondary Mobile Number must be exactly 10 digits." });
    }
    const latitude = raw.latitude;
    if (!isMissing(latitude)) {
        const lat = Number(latitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            errors.push({ field: "latitude", message: "Latitude must be between -90 and 90." });
        }
    }
    const longitude = raw.longitude;
    if (!isMissing(longitude)) {
        const lon = Number(longitude);
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
            errors.push({ field: "longitude", message: "Longitude must be between -180 and 180." });
        }
    }
    const paperRate = raw.paperRate;
    if (!isMissing(paperRate)) {
        const rate = Number(paperRate);
        if (!Number.isInteger(rate) || rate < 1 || rate > 30) {
            errors.push({ field: "paperRate", message: "Paper Rate must be an integer between 1 and 30." });
        }
    }
    const associationType = str(raw.associationType ?? raw.association_type).trim();
    if (isMissing(associationType)) {
        errors.push({ field: "associationType", message: "Association Type is required." });
    }
    else if (!ASSOCIATION_TYPES.includes(associationType)) {
        errors.push({ field: "associationType", message: `Association Type must be one of: ${ASSOCIATION_TYPES.join(", ")}` });
    }
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
        if (!Number.isFinite(count) || count <= 0) {
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
    if (isMissing(birdType))
        errors.push({ field: "birdType", message: "Bird Type is required." });
    if (!isPositiveNumber(averageWeight)) {
        errors.push({ field: "averageWeight", message: "Average Weight must be a positive number." });
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