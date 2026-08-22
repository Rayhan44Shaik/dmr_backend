/**
 * Bulk Import service for the five master entities.
 *
 * Each import is atomic: all rows are validated first, conflicts with
 * existing records are detected, and all inserts run inside a single
 * PostgreSQL transaction (BEGIN … COMMIT). Any validation error or database
 * constraint violation rolls the whole batch back — no partial imports.
 */
import type { PoolClient, QueryResult } from "pg";
import { withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  BirdType,
  Employee,
  Farm,
  Shop,
  Vehicle,
} from "../types/models.js";
import {
  mapBirdType,
  mapEmployee,
  mapFarm,
  mapShop,
  mapVehicle,
} from "./mastersService.js";
import {
  validateBulkRows,
  type BulkEntityKind,
  type BulkRowError,
  type NormalizedBirdTypeRow,
  type NormalizedBulkRow,
  type NormalizedEmployeeRow,
  type NormalizedFarmRow,
  type NormalizedShopRow,
  type NormalizedVehicleRow,
} from "../validation/mastersBulk.js";

export interface BulkImportResult<T> {
  total: number;
  successful: number;
  failed: number;
  errors: BulkRowError[];
  created: T[];
}

type PgRow = Record<string, unknown>;

interface KindConfig<Row, Mapped> {
  kind: BulkEntityKind;
  table: string;
  noColumn: string;
  noField: string;
  noOf: (row: Row) => number | null;
  insert: (client: PoolClient, row: Row, no: number) => Promise<QueryResult<PgRow>>;
  map: (row: PgRow) => Mapped;
}

// ---------------------------------------------------------------------------
// Per-kind insert statements — mirror the singular create endpoints exactly
// ---------------------------------------------------------------------------

const SHOP_CONFIG: KindConfig<NormalizedShopRow, Shop> = {
  kind: "shops",
  table: "shops",
  noColumn: "shop_no",
  noField: "shopNo",
  noOf: (row) => row.shopNo,
  insert: (client, row, no) =>
    client.query(
      `INSERT INTO shops (
         shop_no, shop_name, owner_name, phone_number, village, address, status, email
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [no, row.shopName, row.ownerName, row.phoneNumber, row.village, row.address, row.status, row.email]
    ),
  map: mapShop,
};

const VEHICLE_CONFIG: KindConfig<NormalizedVehicleRow, Vehicle> = {
  kind: "vehicles",
  table: "vehicles",
  noColumn: "vehicle_no",
  noField: "vehicleNo",
  noOf: (row) => row.vehicleNo,
  insert: (client, row, no) =>
    client.query(
      `INSERT INTO vehicles (
         vehicle_no, vehicle_number, vehicle_type, no_of_boxes, bird_capacity,
         capacity_kg, tracking_id, fastag_bank, engine_number, chassis_number,
         insurance_expiry, permit_expiry, fitness_expiry, purchase_date,
         purchase_amount, emi_start_date, rc_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        no,
        row.vehicleNumber,
        row.vehicleType,
        row.noOfBoxes,
        row.birdCapacity,
        row.capacityKg,
        row.trackingId,
        row.fastagBank,
        row.engineNumber,
        row.chassisNumber,
        row.insuranceExpiry,
        row.permitExpiry,
        row.fitnessExpiry,
        row.purchaseDate,
        row.purchaseAmount,
        row.emiStartDate,
        row.rcDate,
        row.status,
      ]
    ),
  map: mapVehicle,
};

const EMPLOYEE_CONFIG: KindConfig<NormalizedEmployeeRow, Employee> = {
  kind: "employees",
  table: "employees",
  noColumn: "employee_no",
  noField: "employeeNo",
  noOf: (row) => row.employeeNo,
  insert: (client, row, no) =>
    client.query(
      `INSERT INTO employees (
         employee_no, employee_name, department, role, phone_number, email,
         address, joining_date, aadhar_number, license_number, salary, status, avatar
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        no,
        row.employeeName,
        row.department,
        row.role,
        row.phoneNumber,
        row.email,
        row.address,
        row.joiningDate,
        row.aadharNumber,
        row.licenseNumber,
        row.salary,
        row.status,
        row.avatar,
      ]
    ),
  map: mapEmployee,
};

const FARM_CONFIG: KindConfig<NormalizedFarmRow, Farm> = {
  kind: "farms",
  table: "farms",
  noColumn: "farm_no",
  noField: "farmNo",
  noOf: (row) => row.farmNo,
  insert: (client, row, no) =>
    client.query(
      `INSERT INTO farms (
         farm_no, farm_name, owner_name, supervisor_name, phone_number,
         village, address, capacity, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        no,
        row.farmName,
        row.ownerName,
        row.supervisorName,
        row.phoneNumber,
        row.village,
        row.address,
        row.capacity,
        row.status,
      ]
    ),
  map: mapFarm,
};

const BIRD_TYPE_CONFIG: KindConfig<NormalizedBirdTypeRow, BirdType> = {
  kind: "bird-types",
  table: "bird_types",
  noColumn: "bird_type_no",
  noField: "birdTypeNo",
  noOf: (row) => row.birdTypeNo,
  insert: (client, row, no) =>
    client.query(
      `INSERT INTO bird_types (
         bird_type_no, bird_type, average_weight, description, status
       ) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [no, row.birdType, row.averageWeight, row.description, row.status]
    ),
  map: mapBirdType,
};

// ---------------------------------------------------------------------------
// Atomic bulk import (shared by all five endpoints)
// ---------------------------------------------------------------------------

interface PgErrorLike {
  code?: string;
}

function pgErrorCode(err: unknown): string | null {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as PgErrorLike).code)
    : null;
}

/** Maps unexpected database errors to safe AppErrors (no raw pg internals). */
function toBulkDbError(err: unknown, total: number, row: number): AppError | null {
  switch (pgErrorCode(err)) {
    case "23505": // unique_violation
      return new AppError(409, "Bulk import rejected: duplicate record", {
        total,
        successful: 0,
        failed: 1,
        errors: [{ row, field: "", message: "row violates a unique database constraint" }],
      });
    case "23503": // foreign_key_violation
      return new AppError(422, "Bulk import rejected: referenced record does not exist", {
        total,
        successful: 0,
        failed: 1,
        errors: [{ row, field: "", message: "row references a record that does not exist" }],
      });
    case "23514": // check_violation
      return new AppError(422, "Bulk import rejected: constraint check failed", {
        total,
        successful: 0,
        failed: 1,
        errors: [{ row, field: "", message: "row violates a database constraint" }],
      });
    case "22003": // numeric_value_out_of_range
      return new AppError(422, "Bulk import rejected: numeric value out of range", {
        total,
        successful: 0,
        failed: 1,
        errors: [{ row, field: "", message: "a numeric value is out of range" }],
      });
    case "22001": // string_data_right_truncation
      return new AppError(422, "Bulk import rejected: value too long for column", {
        total,
        successful: 0,
        failed: 1,
        errors: [{ row, field: "", message: "a text value is too long for its column" }],
      });
    case "22P02": // invalid_text_representation
    case "22007": // invalid_datetime_format
      return new AppError(400, "Bulk import rejected: invalid value", {
        total,
        successful: 0,
        failed: 1,
        errors: [{ row, field: "", message: "a value has an invalid format" }],
      });
    default:
      return null;
  }
}

async function bulkImport<Row extends NormalizedBulkRow, Mapped>(
  config: KindConfig<Row, Mapped>,
  body: unknown
): Promise<BulkImportResult<Mapped>> {
  // Step 1 — validate the whole batch (array shape, row fields, batch duplicates)
  const { rows } = validateBulkRows(config.kind, body) as { rows: Row[] };

  // Step 2 — BEGIN … detect DB conflicts … insert all rows … COMMIT
  let currentRow = 0;
  try {
    const created = await withTransaction(async (client) => {
      const providedNos = rows
        .map(config.noOf)
        .filter((no): no is number => no !== null);

      if (providedNos.length > 0) {
        const existing = await client.query<{ [key: string]: number }>(
          `SELECT ${config.noColumn} FROM ${config.table} WHERE ${config.noColumn} = ANY($1::int[])`,
          [providedNos]
        );
        if ((existing.rowCount ?? 0) > 0) {
          const taken = new Set(existing.rows.map((r) => Number(r[config.noColumn])));
          const errors: BulkRowError[] = [];
          rows.forEach((row, index) => {
            const no = config.noOf(row);
            if (no !== null && taken.has(no)) {
              errors.push({
                row: index + 1,
                field: config.noField,
                message: `${config.noField} ${no} already exists`,
              });
            }
          });
          throw new AppError(
            409,
            `Bulk import rejected: ${errors.length} row(s) conflict with existing records`,
            {
              total: rows.length,
              successful: 0,
              failed: errors.length,
              errors,
            }
          );
        }
      }

      const maxResult = await client.query<{ n: number }>(
        `SELECT COALESCE(MAX(${config.noColumn}), 0) AS n FROM ${config.table}`
      );
      let nextNo =
        Math.max(Number(maxResult.rows[0].n), providedNos.length > 0 ? Math.max(...providedNos) : 0) + 1;

      const created: Mapped[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        currentRow = index + 1;
        const row = rows[index];
        const no = config.noOf(row) ?? nextNo;
        const result = await config.insert(client, row, no);
        created.push(config.map(result.rows[0]));
        if (config.noOf(row) === null) nextNo += 1;
      }
      return created;
    });

    // Step 3 — batch result
    return {
      total: rows.length,
      successful: created.length,
      failed: 0,
      errors: [],
      created,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const mapped = toBulkDbError(error, rows.length, currentRow);
    if (mapped) throw mapped;
    throw error;
  }
}

export const mastersBulkService = {
  importShops(body: unknown): Promise<BulkImportResult<Shop>> {
    return bulkImport(SHOP_CONFIG, body);
  },

  importVehicles(body: unknown): Promise<BulkImportResult<Vehicle>> {
    return bulkImport(VEHICLE_CONFIG, body);
  },

  importEmployees(body: unknown): Promise<BulkImportResult<Employee>> {
    return bulkImport(EMPLOYEE_CONFIG, body);
  },

  importFarms(body: unknown): Promise<BulkImportResult<Farm>> {
    return bulkImport(FARM_CONFIG, body);
  },

  importBirdTypes(body: unknown): Promise<BulkImportResult<BirdType>> {
    return bulkImport(BIRD_TYPE_CONFIG, body);
  },
};
