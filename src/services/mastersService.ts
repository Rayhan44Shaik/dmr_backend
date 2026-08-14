import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  Bank,
  BirdType,
  Employee,
  Farm,
  Shop,
  Vehicle,
} from "../types/models.js";
import { dateOnly, num, str } from "../utils/coerce.js";

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
    if (body.id) {
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

  async deleteEmployee(id: number) {
    const result = await query(`DELETE FROM employees WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Employee not found");
    return { id, deleted: true };
  },

  async listVehicles() {
    const result = await query(`SELECT * FROM vehicles ORDER BY vehicle_number`);
    return result.rows.map(mapVehicle);
  },

  async upsertVehicle(body: Partial<Vehicle> & { vehicleNumber: string }) {
    if (body.id) {
      const result = await query(
        `UPDATE vehicles SET
          vehicle_no=$2, vehicle_number=$3, vehicle_type=$4, no_of_boxes=$5,
          bird_capacity=$6, capacity_kg=$7, tracking_id=$8, fastag_bank=$9,
          engine_number=$10, chassis_number=$11, insurance_expiry=$12,
          permit_expiry=$13, fitness_expiry=$14, purchase_date=$15,
          purchase_amount=$16, emi_start_date=$17, rc_date=$18, status=$19
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
        ]
      );
      return mapVehicle(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(vehicle_no), 0) + 1 AS n FROM vehicles`
    );
    const result = await query(
      `INSERT INTO vehicles (
         vehicle_no, vehicle_number, vehicle_type, no_of_boxes, bird_capacity,
         capacity_kg, tracking_id, fastag_bank, engine_number, chassis_number,
         insurance_expiry, permit_expiry, fitness_expiry, purchase_date,
         purchase_amount, emi_start_date, rc_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
      ]
    );
    return mapVehicle(result.rows[0]);
  },

  async deleteVehicle(id: number) {
    const result = await query(`DELETE FROM vehicles WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Vehicle not found");
    return { id, deleted: true };
  },

  async listFarms() {
    const result = await query(`SELECT * FROM farms ORDER BY farm_name`);
    return result.rows.map(mapFarm);
  },

  async upsertFarm(body: Partial<Farm> & { farmName: string }) {
    if (body.id) {
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

  async deleteFarm(id: number) {
    const result = await query(`DELETE FROM farms WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Farm not found");
    return { id, deleted: true };
  },

  async listShops() {
    const result = await query(`SELECT * FROM shops ORDER BY shop_name`);
    return result.rows.map(mapShop);
  },

  async upsertShop(body: Partial<Shop> & { shopName: string }) {
    if (body.id) {
      const result = await query(
        `UPDATE shops SET
          shop_no=$2, shop_name=$3, owner_name=$4, phone_number=$5,
          village=$6, address=$7, status=$8
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
        ]
      );
      return mapShop(result.rows[0]);
    }

    const nextNo = await query<{ n: number }>(
      `SELECT COALESCE(MAX(shop_no), 0) + 1 AS n FROM shops`
    );
    const result = await query(
      `INSERT INTO shops (
         shop_no, shop_name, owner_name, phone_number, village, address, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        body.shopNo ?? nextNo.rows[0].n,
        body.shopName,
        body.ownerName ?? "",
        body.phoneNumber ?? "",
        body.village ?? "",
        body.address ?? null,
        body.status ?? "Active",
      ]
    );
    return mapShop(result.rows[0]);
  },

  async deleteShop(id: number) {
    const result = await query(`DELETE FROM shops WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Shop not found");
    return { id, deleted: true };
  },

  async listBanks() {
    const result = await query(`SELECT * FROM banks ORDER BY bank_name`);
    return result.rows.map(mapBank);
  },

  async upsertBank(body: Partial<Bank> & { bankName: string }) {
    if (body.id) {
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

  async deleteBank(id: number) {
    const result = await query(`DELETE FROM banks WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Bank not found");
    return { id, deleted: true };
  },

  async listBirdTypes() {
    const result = await query(`SELECT * FROM bird_types ORDER BY bird_type`);
    return result.rows.map(mapBirdType);
  },

  async upsertBirdType(body: Partial<BirdType> & { birdType: string }) {
    if (body.id) {
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

  async deleteBirdType(id: number) {
    const result = await query(`DELETE FROM bird_types WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Bird type not found");
    return { id, deleted: true };
  },
};
