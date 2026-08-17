import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  Bank,
  BirdType,
  Employee,
  Farm,
  Shop,
  Vehicle,
} from "../types/models.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import {
  aadharNumberOrNull,
  isMissing,
  licenseNumberOrNull,
  validateBirdTypeFields,
  validateEmployeeFields,
  validateFarmFields,
  validateShopFields,
  validateVehicleFields,
} from "../utils/masterValidation.js";

export function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    id: num(row.id),
    employeeNo: num(row.employee_no),
    employeeName: str(row.employee_name),
    department: str(row.department),
    role: str(row.role),
    phoneNumber: str(row.phone_number),
    email: str(row.email),
    address: str(row.address),
    joiningDate: dateOnly(row.joining_date),
    aadharNumber: row.aadhar_number ? str(row.aadhar_number) : null,
    licenseNumber: row.license_number ? str(row.license_number) : null,
    salary: num(row.salary),
    status: str(row.status) as Employee["status"],
    avatar: row.avatar ? str(row.avatar) : null,
  };
}

export function mapVehicle(row: Record<string, unknown>): Vehicle {
  return {
    id: num(row.id),
    vehicleNo: num(row.vehicle_no),
    vehicleNumber: str(row.vehicle_number),
    vehicleType: str(row.vehicle_type),
    noOfBoxes: num(row.no_of_boxes),
    birdCapacity: num(row.bird_capacity),
    capacityKg: num(row.capacity_kg),
    trackingId: str(row.tracking_id),
    fastagBank: str(row.fastag_bank),
    engineNumber: str(row.engine_number),
    chassisNumber: str(row.chassis_number),
    insuranceExpiry: dateOnly(row.insurance_expiry),
    permitExpiry: dateOnly(row.permit_expiry),
    fitnessExpiry: dateOnly(row.fitness_expiry),
    purchaseDate: dateOnly(row.purchase_date),
    purchaseAmount: row.purchase_amount == null ? null : num(row.purchase_amount),
    emiStartDate: dateOnly(row.emi_start_date),
    emiDay: numOrNull(row.emi_day),
    totalEMIs: numOrNull(row.total_emis),
    rcDate: dateOnly(row.rc_date),
    status: str(row.status) as Vehicle["status"],
  };
}

export function mapFarm(row: Record<string, unknown>): Farm {
  return {
    id: num(row.id),
    farmNo: num(row.farm_no),
    farmName: str(row.farm_name),
    ownerName: str(row.owner_name),
    supervisorName: str(row.supervisor_name),
    phoneNumber: str(row.phone_number),
    village: str(row.village),
    address: str(row.address),
    capacity: num(row.capacity),
    status: str(row.status) as Farm["status"],
  };
}

export function mapShop(row: Record<string, unknown>): Shop {
  return {
    id: num(row.id),
    shopNo: num(row.shop_no),
    shopName: str(row.shop_name),
    ownerName: str(row.owner_name),
    phoneNumber: str(row.phone_number),
    village: str(row.village),
    address: row.address == null ? null : str(row.address),
    status: str(row.status) as Shop["status"],
    openingBalance: num(row.opening_balance),
    currentBalance: num(row.current_balance),
  };
}

function mapBank(row: Record<string, unknown>): Bank {
  return {
    id: num(row.id),
    bankNo: num(row.bank_no),
    bankName: str(row.bank_name),
    branch: str(row.branch),
    accountNumber: str(row.account_number),
    ifscCode: str(row.ifsc_code),
    upiId: str(row.upi_id),
    status: str(row.status) as Bank["status"],
  };
}

export function mapBirdType(row: Record<string, unknown>): BirdType {
  return {
    id: num(row.id),
    birdTypeNo: num(row.bird_type_no),
    birdType: str(row.bird_type),
    averageWeight: num(row.average_weight),
    description: str(row.description),
    status: str(row.status) as BirdType["status"],
  };
}

const UNIQUE_CHECK: Record<
  string,
  { table: string; column: string; label: string; numeric?: boolean }
> = {
  employee: { table: "employees", column: "employee_no", label: "Employee No", numeric: true },
  vehicle: { table: "vehicles", column: "vehicle_number", label: "Vehicle number" },
  farm: { table: "farms", column: "farm_name", label: "Farm" },
  shop: { table: "shops", column: "shop_name", label: "Shop" },
  bank: { table: "banks", column: "bank_name", label: "Bank" },
  birdType: { table: "bird_types", column: "bird_type", label: "Bird type" },
};

async function assertUnique(
  key: keyof typeof UNIQUE_CHECK,
  value: string,
  excludeId?: number
) {
  const { table, column, label, numeric } = UNIQUE_CHECK[key];
  // LOWER() is only valid on text columns (employee_no is INTEGER).
  const compare = numeric ? `${column} = $1` : `LOWER(${column}) = LOWER($1)`;
  const result = await query(
    `SELECT id FROM ${table} WHERE ${compare}
       AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
    [value, excludeId ?? null]
  );
  if (result.rowCount) throw new AppError(409, `${label} "${value}" already exists.`);
}

function requireFields(body: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = body[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new AppError(400, `${field.replace(/^./, (c) => c.toUpperCase())} is required.`);
    }
  }
}

/** Throws the first shared-validation error as a 400 (normal CRUD format). */
function assertValid(
  errors: { field: string; message: string }[]
): void {
  if (errors.length) throw new AppError(400, errors[0].message);
}

/**
 * Rejects employee duplicates for department+name (case-insensitive),
 * phone and email — excluding the row being updated. Matches bulk rules.
 */
async function assertEmployeeUnique(
  body: {
    department?: string;
    employeeName?: string;
    phoneNumber?: string;
    email?: string;
  },
  excludeId?: number
) {
  const department = str(body.department ?? "").trim();
  const employeeName = str(body.employeeName ?? "").trim();
  const phoneNumber = str(body.phoneNumber ?? "").trim();
  const email = str(body.email ?? "").trim();

  const nameDup = await query(
    `SELECT id FROM employees
     WHERE LOWER(department) = LOWER($1) AND LOWER(employee_name) = LOWER($2)
       AND ($3::int IS NULL OR id <> $3) LIMIT 1`,
    [department, employeeName, excludeId ?? null]
  );
  if (nameDup.rowCount) {
    throw new AppError(
      409,
      `An employee with the name "${employeeName}" already exists in the ${department} department.`
    );
  }

  if (phoneNumber) {
    const phoneDup = await query(
      `SELECT id FROM employees
       WHERE phone_number = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [phoneNumber, excludeId ?? null]
    );
    if (phoneDup.rowCount) throw new AppError(409, `Phone Number "${phoneNumber}" already exists.`);
  }

  if (email) {
    const emailDup = await query(
      `SELECT id FROM employees
       WHERE LOWER(email) = LOWER($1) AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [email, excludeId ?? null]
    );
    if (emailDup.rowCount) throw new AppError(409, `Email "${email}" already exists.`);
  }
}

// ---------------------------------------------------------------------------
// Bulk-import helpers (Farms / Vehicles / Employees / Bird Types)
// ---------------------------------------------------------------------------

type BulkRowError = { row: number; field?: string; message: string };

function bulkValidationFailed(errors: BulkRowError[]): never {
  throw new AppError(400, "Bulk import validation failed", { errors });
}

export const mastersService = {
  async listEmployees(department?: string) {
    const result = department
      ? await query(
          `SELECT * FROM employees WHERE department = $1 ORDER BY employee_name`,
          [department]
        )
      : await query(`SELECT * FROM employees ORDER BY employee_name`);
    return result.rows.map(mapEmployee);
  },

  async upsertEmployee(body: Partial<Employee> & { employeeName: string }) {
    assertValid(validateEmployeeFields(body));

    if (body.id) {
      if (body.employeeNo != null) {
        await assertUnique("employee", String(body.employeeNo), body.id);
      }
      await assertEmployeeUnique(body, body.id);
      const result = await query(
        `UPDATE employees SET
          employee_no=$2, employee_name=$3, department=$4, role=$5,
          phone_number=$6, email=$7, address=$8, joining_date=$9,
          aadhar_number=$10, license_number=$11, salary=$12, status=$13, avatar=$14
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.employeeNo,
          body.employeeName,
          body.department ?? "",
          body.role ?? "",
          body.phoneNumber ?? "",
          body.email ?? "",
          body.address ?? "",
          body.joiningDate || null,
          body.aadharNumber ?? null,
          body.licenseNumber ?? null,
          body.salary ?? 0,
          body.status ?? "Active",
          body.avatar ?? null,
        ]
      );
      return mapEmployee(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(employee_no), 0) + 1 AS n FROM employees`
    );
    if (body.employeeNo != null) {
      await assertUnique("employee", String(body.employeeNo));
    }
    await assertEmployeeUnique(body);
    const result = await query(
      `INSERT INTO employees (
         employee_no, employee_name, department, role, phone_number, email,
         address, joining_date, aadhar_number, license_number, salary, status, avatar
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        body.employeeNo ?? nextNo.rows[0].n,
        body.employeeName,
        body.department ?? "",
        body.role ?? "",
        body.phoneNumber ?? "",
        body.email ?? "",
        body.address ?? "",
        body.joiningDate || null,
        body.aadharNumber ?? null,
        body.licenseNumber ?? null,
        body.salary ?? 0,
        body.status ?? "Active",
        body.avatar ?? null,
      ]
    );
    return mapEmployee(result.rows[0]);
  },

  async updateEmployeeStatus(id: number, status: Employee["status"]) {
    const result = await query(
      `UPDATE employees SET status=$2 WHERE id=$1 RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) throw new AppError(404, "Employee not found");
    return mapEmployee(result.rows[0]);
  },

  async deleteEmployee(id: number) {
    const result = await query(
      `UPDATE employees SET status='Inactive' WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Employee not found");
    return { id, deleted: true, deactivated: true };
  },

  async listVehicles() {
    const result = await query(`SELECT * FROM vehicles ORDER BY vehicle_number`);
    return result.rows.map(mapVehicle);
  },

  async upsertVehicle(body: Partial<Vehicle> & { vehicleNumber: string }) {
    assertValid(validateVehicleFields(body));

    if (body.id) {
      await assertUnique("vehicle", body.vehicleNumber, body.id);
      const result = await query(
        `UPDATE vehicles SET
          vehicle_no=$2, vehicle_number=$3, vehicle_type=$4, no_of_boxes=$5,
          bird_capacity=$6, capacity_kg=$7, tracking_id=$8, fastag_bank=$9,
          engine_number=$10, chassis_number=$11, insurance_expiry=$12,
          permit_expiry=$13, fitness_expiry=$14, purchase_date=$15,
          purchase_amount=$16, emi_start_date=$17, rc_date=$18, status=$19,
          emi_day=$20, total_emis=$21
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.vehicleNo,
          body.vehicleNumber,
          body.vehicleType ?? "",
          body.noOfBoxes ?? 85,
          body.birdCapacity ?? 0,
          body.capacityKg ?? 0,
          body.trackingId ?? "",
          body.fastagBank ?? "",
          body.engineNumber ?? "",
          body.chassisNumber ?? "",
          body.insuranceExpiry || null,
          body.permitExpiry || null,
          body.fitnessExpiry || null,
          body.purchaseDate || null,
          body.purchaseAmount ?? null,
          body.emiStartDate || null,
          body.rcDate || null,
          body.status ?? "Active",
          body.emiDay ?? null,
          body.totalEMIs ?? null,
        ]
      );
      return mapVehicle(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(vehicle_no), 0) + 1 AS n FROM vehicles`
    );
    await assertUnique("vehicle", body.vehicleNumber);
    const result = await query(
      `INSERT INTO vehicles (
         vehicle_no, vehicle_number, vehicle_type, no_of_boxes, bird_capacity,
         capacity_kg, tracking_id, fastag_bank, engine_number, chassis_number,
         insurance_expiry, permit_expiry, fitness_expiry, purchase_date,
         purchase_amount, emi_start_date, rc_date, status, emi_day, total_emis
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        body.vehicleNo ?? nextNo.rows[0].n,
        body.vehicleNumber,
        body.vehicleType ?? "",
        body.noOfBoxes ?? 85,
        body.birdCapacity ?? 0,
        body.capacityKg ?? 0,
        body.trackingId ?? "",
        body.fastagBank ?? "",
        body.engineNumber ?? "",
        body.chassisNumber ?? "",
        body.insuranceExpiry || null,
        body.permitExpiry || null,
        body.fitnessExpiry || null,
        body.purchaseDate || null,
        body.purchaseAmount ?? null,
        body.emiStartDate || null,
        body.rcDate || null,
        body.status ?? "Active",
        body.emiDay ?? null,
        body.totalEMIs ?? null,
      ]
    );
    return mapVehicle(result.rows[0]);
  },

  async updateVehicleStatus(id: number, status: Vehicle["status"]) {
    const result = await query(
      `UPDATE vehicles SET status=$2 WHERE id=$1 RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) throw new AppError(404, "Vehicle not found");
    return mapVehicle(result.rows[0]);
  },

  async deleteVehicle(id: number) {
    const result = await query(
      `UPDATE vehicles SET status='Inactive' WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Vehicle not found");
    return { id, deleted: true, deactivated: true };
  },

  async listFarms() {
    const result = await query(`SELECT * FROM farms ORDER BY farm_name`);
    return result.rows.map(mapFarm);
  },

  async upsertFarm(body: Partial<Farm> & { farmName: string }) {
    assertValid(validateFarmFields(body));

    if (body.id) {
      await assertUnique("farm", body.farmName, body.id);
      const result = await query(
        `UPDATE farms SET
          farm_no=$2, farm_name=$3, owner_name=$4, supervisor_name=$5,
          phone_number=$6, village=$7, address=$8, capacity=$9, status=$10
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.farmNo,
          body.farmName,
          body.ownerName ?? "",
          body.supervisorName ?? "",
          body.phoneNumber ?? "",
          body.village ?? "",
          body.address ?? "",
          body.capacity ?? 0,
          body.status ?? "Active",
        ]
      );
      return mapFarm(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(farm_no), 0) + 1 AS n FROM farms`
    );
    await assertUnique("farm", body.farmName);
    const result = await query(
      `INSERT INTO farms (
         farm_no, farm_name, owner_name, supervisor_name, phone_number,
         village, address, capacity, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        body.farmNo ?? nextNo.rows[0].n,
        body.farmName,
        body.ownerName ?? "",
        body.supervisorName ?? "",
        body.phoneNumber ?? "",
        body.village ?? "",
        body.address ?? "",
        body.capacity ?? 0,
        body.status ?? "Active",
      ]
    );
    return mapFarm(result.rows[0]);
  },

  async updateFarmStatus(id: number, status: Farm["status"]) {
    const result = await query(
      `UPDATE farms SET status=$2 WHERE id=$1 RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) throw new AppError(404, "Farm not found");
    return mapFarm(result.rows[0]);
  },

  async deleteFarm(id: number) {
    const result = await query(
      `UPDATE farms SET status='Inactive' WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Farm not found");
    return { id, deleted: true, deactivated: true };
  },

  async listShops() {
    const result = await query(`SELECT * FROM shops ORDER BY shop_name`);
    return result.rows.map(mapShop);
  },

  async upsertShop(body: Partial<Shop> & { shopName: string }) {
    assertValid(validateShopFields(body));

    if (body.id) {
      await assertUnique("shop", body.shopName, body.id);
      const result = await query(
        `UPDATE shops SET
          shop_no=$2, shop_name=$3, owner_name=$4, phone_number=$5,
          village=$6, address=$7, status=$8, opening_balance=$9,
          current_balance = $9 + COALESCE(
            (SELECT SUM(debit) - SUM(credit) FROM shop_ledger WHERE shop_id = $1), 0)
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.shopNo,
          body.shopName,
          body.ownerName ?? "",
          body.phoneNumber ?? "",
          body.village ?? "",
          body.address ?? null,
          body.status ?? "Active",
          body.openingBalance ?? 0,
        ]
      );
      return mapShop(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(shop_no), 0) + 1 AS n FROM shops`
    );
    await assertUnique("shop", body.shopName);
    const result = await query(
      `INSERT INTO shops (
         shop_no, shop_name, owner_name, phone_number, village, address, status,
         opening_balance, current_balance
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
      [
        body.shopNo ?? nextNo.rows[0].n,
        body.shopName,
        body.ownerName ?? "",
        body.phoneNumber ?? "",
        body.village ?? "",
        body.address ?? null,
        body.status ?? "Active",
        body.openingBalance ?? 0,
      ]
    );
    return mapShop(result.rows[0]);
  },

  async updateShopStatus(id: number, status: Shop["status"]) {
    const result = await query(
      `UPDATE shops SET status=$2 WHERE id=$1 RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) throw new AppError(404, "Shop not found");
    return mapShop(result.rows[0]);
  },

  async deleteShop(id: number) {
    const result = await query(
      `UPDATE shops SET status='Inactive' WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Shop not found");
    return { id, deleted: true, deactivated: true };
  },

  /** Bulk create — validates every row first, inserts all in one transaction. */
  async bulkCreateShops(inputs: (Partial<Shop> & { shopName: string })[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new AppError(400, "No shop rows provided.");
    }

    const errors: BulkRowError[] = [];
    inputs.forEach((raw, index) => {
      const row = index + 1;
      validateShopFields(raw).forEach(({ field, message }) =>
        errors.push({ row, field, message })
      );
    });
    if (errors.length) bulkValidationFailed(errors);

    return withTransaction(async (client) => {
      const created: Shop[] = [];
      for (const input of inputs) {
        const shopName = str(input.shopName).trim();

        const dup = await client.query(
          `SELECT 1 FROM shops WHERE LOWER(shop_name) = LOWER($1) LIMIT 1`,
          [shopName]
        );
        if (dup.rowCount) {
          throw new AppError(409, `Shop "${shopName}" already exists.`);
        }

        const no = await client.query<{ n: number }>(
          `SELECT COALESCE(MAX(shop_no), 0) + 1 AS n FROM shops`
        );
        const result = await client.query(
          `INSERT INTO shops (
             shop_no, shop_name, owner_name, phone_number, village, address,
             status, opening_balance, current_balance
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
          [
            input.shopNo ?? no.rows[0].n,
            shopName,
            str(input.ownerName).trim(),
            str(input.phoneNumber).trim(),
            str(input.village).trim(),
            input.address ? str(input.address).trim() : null,
            input.status ?? "Active",
            num(input.openingBalance ?? 0),
          ]
        );
        created.push(mapShop(result.rows[0]));
      }
      return created;
    });
  },

  /**
   * Bulk create farms — validates the whole batch first, then inserts all
   * rows in one transaction. Any failure rolls back the entire batch.
   */
  async bulkCreateFarms(inputs: Record<string, unknown>[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new AppError(400, "No farm rows provided.");
    }

    const errors: BulkRowError[] = [];
    inputs.forEach((raw, index) => {
      const row = index + 1;
      validateFarmFields(raw).forEach(({ field, message }) =>
        errors.push({ row, field, message })
      );
    });
    if (errors.length) bulkValidationFailed(errors);

    return withTransaction(async (client) => {
      const created: Farm[] = [];
      const seenNames = new Set<string>();
      for (let i = 0; i < inputs.length; i += 1) {
        const raw = inputs[i];
        const farmName = str(raw.farmName ?? raw.farm_name).trim();
        const key = farmName.toLowerCase();
        if (seenNames.has(key)) {
          throw new AppError(409, `Duplicate farm "${farmName}" within the uploaded batch.`);
        }
        seenNames.add(key);

        const dup = await client.query(
          `SELECT 1 FROM farms WHERE LOWER(farm_name) = LOWER($1) LIMIT 1`,
          [farmName]
        );
        if (dup.rowCount) throw new AppError(409, `Farm "${farmName}" already exists.`);

        const no = await client.query<{ n: number }>(
          `SELECT COALESCE(MAX(farm_no), 0) + 1 AS n FROM farms`
        );
        const result = await client.query(
          `INSERT INTO farms (
             farm_no, farm_name, owner_name, supervisor_name, phone_number,
             village, address, capacity, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            no.rows[0].n,
            farmName,
            str(raw.ownerName ?? raw.owner_name).trim(),
            str(raw.supervisorName ?? raw.supervisor_name).trim(),
            str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim(),
            str(raw.village).trim(),
            raw.address ? str(raw.address).trim() : "",
            num(raw.capacity ?? raw.birdCapacity ?? 0),
            raw.status ?? "Active",
          ]
        );
        created.push(mapFarm(result.rows[0]));
      }
      return created;
    });
  },

  /**
   * Bulk create vehicles — validates the whole batch first, then inserts all
   * rows in one transaction. Preserves emiDay and totalEMIs end to end.
   */
  async bulkCreateVehicles(inputs: Record<string, unknown>[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new AppError(400, "No vehicle rows provided.");
    }

    const errors: BulkRowError[] = [];
    inputs.forEach((raw, index) => {
      const row = index + 1;
      validateVehicleFields(raw).forEach(({ field, message }) =>
        errors.push({ row, field, message })
      );
    });
    if (errors.length) bulkValidationFailed(errors);

    return withTransaction(async (client) => {
      const created: Vehicle[] = [];
      const seenNumbers = new Set<string>();
      for (let i = 0; i < inputs.length; i += 1) {
        const raw = inputs[i];
        const vehicleNumber = str(raw.vehicleNumber ?? raw.vehicle_number).trim();
        const key = vehicleNumber.toLowerCase();
        if (seenNumbers.has(key)) {
          throw new AppError(409, `Duplicate vehicle "${vehicleNumber}" within the uploaded batch.`);
        }
        seenNumbers.add(key);

        const dup = await client.query(
          `SELECT 1 FROM vehicles WHERE LOWER(vehicle_number) = LOWER($1) LIMIT 1`,
          [vehicleNumber]
        );
        if (dup.rowCount) throw new AppError(409, `Vehicle number "${vehicleNumber}" already exists.`);

        const no = await client.query<{ n: number }>(
          `SELECT COALESCE(MAX(vehicle_no), 0) + 1 AS n FROM vehicles`
        );
        const result = await client.query(
          `INSERT INTO vehicles (
             vehicle_no, vehicle_number, vehicle_type, no_of_boxes, bird_capacity,
             capacity_kg, tracking_id, fastag_bank, engine_number, chassis_number,
             insurance_expiry, permit_expiry, fitness_expiry, purchase_date,
             purchase_amount, emi_start_date, rc_date, status, emi_day, total_emis
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING *`,
          [
            no.rows[0].n,
            vehicleNumber,
            str(raw.vehicleType ?? raw.vehicle_type).trim(),
            num(raw.noOfBoxes, 85),
            num(raw.birdCapacity, 0),
            num(raw.capacityKg, 0),
            str(raw.trackingId ?? raw.tracking_id).trim(),
            str(raw.fastagBank ?? raw.fastag_bank).trim(),
            str(raw.engineNumber ?? raw.engine_number).trim(),
            str(raw.chassisNumber ?? raw.chassis_number).trim(),
            raw.insuranceExpiry || null,
            raw.permitExpiry || null,
            raw.fitnessExpiry || null,
            raw.purchaseDate || null,
            isMissing(raw.purchaseAmount) ? null : num(raw.purchaseAmount, 0),
            raw.emiStartDate || null,
            raw.rcDate || null,
            raw.status ?? "Active",
            isMissing(raw.emiDay) ? null : num(raw.emiDay),
            isMissing(raw.totalEMIs) ? null : num(raw.totalEMIs),
          ]
        );
        created.push(mapVehicle(result.rows[0]));
      }
      return created;
    });
  },

  /**
   * Bulk create employees — validates the whole batch first, then inserts all
   * rows in one transaction. employeeNo is always server-assigned.
   */
  async bulkCreateEmployees(inputs: Record<string, unknown>[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new AppError(400, "No employee rows provided.");
    }

    const errors: BulkRowError[] = [];
    inputs.forEach((raw, index) => {
      const row = index + 1;
      validateEmployeeFields(raw).forEach(({ field, message }) =>
        errors.push({ row, field, message })
      );
    });
    if (errors.length) bulkValidationFailed(errors);

    return withTransaction(async (client) => {
      const created: Employee[] = [];
      const seenKeys = new Set<string>();
      const seenPhones = new Set<string>();
      const seenEmails = new Set<string>();
      for (let i = 0; i < inputs.length; i += 1) {
        const raw = inputs[i];
        const employeeName = str(raw.employeeName ?? raw.employee_name).trim();
        const department = str(raw.department).trim();
        const phoneNumber = str(raw.phoneNumber ?? raw.phone ?? raw.phone_number).trim();
        const email = str(raw.email).trim();

        const nameKey = `${department.toLowerCase()}|${employeeName.toLowerCase()}`;
        if (seenKeys.has(nameKey)) {
          throw new AppError(409, `Duplicate employee "${employeeName}" in ${department} within the uploaded batch.`);
        }
        seenKeys.add(nameKey);
        if (seenPhones.has(phoneNumber)) {
          throw new AppError(409, `Duplicate phone number "${phoneNumber}" within the uploaded batch.`);
        }
        seenPhones.add(phoneNumber);
        if (email) {
          const emailKey = email.toLowerCase();
          if (seenEmails.has(emailKey)) {
            throw new AppError(409, `Duplicate email "${email}" within the uploaded batch.`);
          }
          seenEmails.add(emailKey);
        }

        const nameDup = await client.query(
          `SELECT 1 FROM employees WHERE LOWER(department) = LOWER($1)
             AND LOWER(employee_name) = LOWER($2) LIMIT 1`,
          [department, employeeName]
        );
        if (nameDup.rowCount) {
          throw new AppError(409, `An employee with the name "${employeeName}" already exists in the ${department} department.`);
        }
        const phoneDup = await client.query(
          `SELECT 1 FROM employees WHERE phone_number = $1 LIMIT 1`,
          [phoneNumber]
        );
        if (phoneDup.rowCount) throw new AppError(409, `Phone Number "${phoneNumber}" already exists.`);
        if (email) {
          const emailDup = await client.query(
            `SELECT 1 FROM employees WHERE LOWER(email) = LOWER($1) LIMIT 1`,
            [email]
          );
          if (emailDup.rowCount) throw new AppError(409, `Email "${email}" already exists.`);
        }

        const no = await client.query<{ n: number }>(
          `SELECT COALESCE(MAX(employee_no), 0) + 1 AS n FROM employees`
        );
        const result = await client.query(
          `INSERT INTO employees (
             employee_no, employee_name, department, role, phone_number, email,
             address, joining_date, aadhar_number, license_number, salary, status, avatar
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            no.rows[0].n,
            employeeName,
            department,
            str(raw.role ?? "").trim(),
            phoneNumber,
            email,
            raw.address ? str(raw.address).trim() : "",
            raw.joiningDate || null,
            aadharNumberOrNull(raw),
            licenseNumberOrNull(raw),
            num(raw.salary, 0),
            raw.status ?? "Active",
            null,
          ]
        );
        created.push(mapEmployee(result.rows[0]));
      }
      return created;
    });
  },

  /**
   * Bulk create bird types — validates the whole batch first, then inserts all
   * rows in one transaction.
   */
  async bulkCreateBirdTypes(inputs: Record<string, unknown>[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new AppError(400, "No bird type rows provided.");
    }

    const errors: BulkRowError[] = [];
    inputs.forEach((raw, index) => {
      const row = index + 1;
      validateBirdTypeFields(raw).forEach(({ field, message }) =>
        errors.push({ row, field, message })
      );
    });
    if (errors.length) bulkValidationFailed(errors);

    return withTransaction(async (client) => {
      const created: BirdType[] = [];
      const seenNames = new Set<string>();
      for (let i = 0; i < inputs.length; i += 1) {
        const raw = inputs[i];
        const birdType = str(raw.birdType ?? raw.bird_type).trim();
        const key = birdType.toLowerCase();
        if (seenNames.has(key)) {
          throw new AppError(409, `Duplicate bird type "${birdType}" within the uploaded batch.`);
        }
        seenNames.add(key);

        const dup = await client.query(
          `SELECT 1 FROM bird_types WHERE LOWER(bird_type) = LOWER($1) LIMIT 1`,
          [birdType]
        );
        if (dup.rowCount) throw new AppError(409, `Bird type "${birdType}" already exists.`);

        const no = await client.query<{ n: number }>(
          `SELECT COALESCE(MAX(bird_type_no), 0) + 1 AS n FROM bird_types`
        );
        const result = await client.query(
          `INSERT INTO bird_types (
             bird_type_no, bird_type, average_weight, description, status
           ) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [
            no.rows[0].n,
            birdType,
            num(raw.averageWeight ?? raw.averageWeightKg ?? raw.average_weight ?? 0),
            raw.description ? str(raw.description).trim() : "",
            raw.status ?? "Active",
          ]
        );
        created.push(mapBirdType(result.rows[0]));
      }
      return created;
    });
  },

  async listBanks() {
    const result = await query(`SELECT * FROM banks ORDER BY bank_name`);
    return result.rows.map(mapBank);
  },

  async upsertBank(body: Partial<Bank> & { bankName: string }) {
    requireFields(body, ["bankName", "branch", "accountNumber", "ifscCode"]);

    if (body.id) {
      await assertUnique("bank", body.bankName, body.id);
      const result = await query(
        `UPDATE banks SET
          bank_no=$2, bank_name=$3, branch=$4, account_number=$5,
          ifsc_code=$6, upi_id=$7, status=$8
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.bankNo,
          body.bankName,
          body.branch ?? "",
          body.accountNumber ?? "",
          body.ifscCode ?? "",
          body.upiId ?? "",
          body.status ?? "Active",
        ]
      );
      return mapBank(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(bank_no), 0) + 1 AS n FROM banks`
    );
    await assertUnique("bank", body.bankName);
    const result = await query(
      `INSERT INTO banks (
         bank_no, bank_name, branch, account_number, ifsc_code, upi_id, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        body.bankNo ?? nextNo.rows[0].n,
        body.bankName,
        body.branch ?? "",
        body.accountNumber ?? "",
        body.ifscCode ?? "",
        body.upiId ?? "",
        body.status ?? "Active",
      ]
    );
    return mapBank(result.rows[0]);
  },

  async updateBankStatus(id: number, status: Bank["status"]) {
    const result = await query(
      `UPDATE banks SET status=$2 WHERE id=$1 RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) throw new AppError(404, "Bank not found");
    return mapBank(result.rows[0]);
  },

  async deleteBank(id: number) {
    const result = await query(
      `UPDATE banks SET status='Inactive' WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Bank not found");
    return { id, deleted: true, deactivated: true };
  },

  async listBirdTypes() {
    const result = await query(`SELECT * FROM bird_types ORDER BY bird_type`);
    return result.rows.map(mapBirdType);
  },

  async upsertBirdType(body: Partial<BirdType> & { birdType: string }) {
    assertValid(validateBirdTypeFields(body));

    if (body.id) {
      await assertUnique("birdType", body.birdType, body.id);
      const result = await query(
        `UPDATE bird_types SET
          bird_type_no=$2, bird_type=$3, average_weight=$4, description=$5, status=$6
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.birdTypeNo,
          body.birdType,
          body.averageWeight ?? 0,
          body.description ?? "",
          body.status ?? "Active",
        ]
      );
      return mapBirdType(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(bird_type_no), 0) + 1 AS n FROM bird_types`
    );
    await assertUnique("birdType", body.birdType);
    const result = await query(
      `INSERT INTO bird_types (
         bird_type_no, bird_type, average_weight, description, status
       ) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        body.birdTypeNo ?? nextNo.rows[0].n,
        body.birdType,
        body.averageWeight ?? 0,
        body.description ?? "",
        body.status ?? "Active",
      ]
    );
    return mapBirdType(result.rows[0]);
  },

async updateBirdTypeStatus(id: number, status: BirdType["status"]) {
    const result = await query(
      `UPDATE bird_types SET status=$2 WHERE id=$1 RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) throw new AppError(404, "Bird type not found");
    return mapBirdType(result.rows[0]);
  },

  async deleteBirdType(id: number) {
    const result = await query(
      `UPDATE bird_types SET status='Inactive' WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Bird type not found");
    return { id, deleted: true, deactivated: true };
  },
};
