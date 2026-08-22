/**
 * Validation + normalization for the five master Bulk Import endpoints:
 *   POST /api/masters/{shops|vehicles|employees|farms|bird-types}/bulk
 *
 * The accepted payload mirrors the singular create endpoints (camelCase
 * localStorage model shapes), plus the same defaults those endpoints apply.
 * Unknown/obsolete fields are ignored — nothing outside the current schema
 * is ever persisted.
 */
import { AppError } from "../middleware/errorHandler.js";

export type BulkEntityKind =
  | "shops"
  | "vehicles"
  | "employees"
  | "farms"
  | "bird-types";

export const ACTIVE_STATUSES = ["Active", "Inactive"] as const;
export const EMPLOYEE_STATUSES = ["Active", "Inactive", "Suspended"] as const;

export interface BulkRowError {
  /** 1-based row number in the uploaded batch. */
  row: number;
  /** camelCase field name the error refers to ("" when row-level). */
  field: string;
  /** Safe, human-readable message. */
  message: string;
}

export interface NormalizedShopRow {
  shopNo: number | null;
  shopName: string;
  ownerName: string;
  phoneNumber: string;
  village: string;
  address: string | null;
  email: string;
  status: "Active" | "Inactive";
}

export interface NormalizedVehicleRow {
  vehicleNo: number | null;
  vehicleNumber: string;
  vehicleType: string;
  noOfBoxes: number;
  birdCapacity: number;
  capacityKg: number;
  trackingId: string;
  fastagBank: string;
  engineNumber: string;
  chassisNumber: string;
  insuranceExpiry: string | null;
  permitExpiry: string | null;
  fitnessExpiry: string | null;
  purchaseDate: string | null;
  purchaseAmount: number | null;
  emiStartDate: string | null;
  rcDate: string | null;
  status: "Active" | "Inactive";
}

export interface NormalizedEmployeeRow {
  employeeNo: number | null;
  employeeName: string;
  department: string;
  role: string;
  phoneNumber: string;
  email: string;
  address: string;
  joiningDate: string | null;
  aadharNumber: string | null;
  licenseNumber: string | null;
  salary: number;
  status: "Active" | "Inactive" | "Suspended";
  avatar: string | null;
}

export interface NormalizedFarmRow {
  farmNo: number | null;
  farmName: string;
  ownerName: string;
  supervisorName: string;
  phoneNumber: string;
  village: string;
  address: string;
  capacity: number;
  status: "Active" | "Inactive";
}

export interface NormalizedBirdTypeRow {
  birdTypeNo: number | null;
  birdType: string;
  averageWeight: number;
  description: string;
  status: "Active" | "Inactive";
}

export type NormalizedBulkRow =
  | NormalizedShopRow
  | NormalizedVehicleRow
  | NormalizedEmployeeRow
  | NormalizedFarmRow
  | NormalizedBirdTypeRow;

type RawRow = Record<string, unknown>;

function isPlainObject(value: unknown): value is RawRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Per-row field readers (collect errors instead of throwing per row)
// ---------------------------------------------------------------------------

class RowContext {
  readonly errors: BulkRowError[] = [];

  constructor(
    readonly index: number, // 1-based row number
    readonly raw: RawRow
  ) {}

  fail(field: string, message: string): void {
    this.errors.push({ row: this.index, field, message });
  }

  /** Optional text field; numbers are coerced (CSV cells often parse as numbers). */
  str(key: string, fallback = ""): string {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value.trim();
    this.fail(key, `${key} must be a string`);
    return fallback;
  }

  /** Required text field. */
  requiredStr(key: string): string {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") {
      this.fail(key, `${key} is required`);
      return "";
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        this.fail(key, `${key} is required`);
        return "";
      }
      return String(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        this.fail(key, `${key} is required`);
        return "";
      }
      return trimmed;
    }
    this.fail(key, `${key} must be a string`);
    return "";
  }

  /** Nullable text field. */
  nullableStr(key: string): string | null {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value.trim() || null;
    this.fail(key, `${key} must be a string or null`);
    return null;
  }

  /**
   * Numeric field. Accepts numbers and numeric strings (CSV cells), otherwise
   * reports a type error and falls back to the default.
   */
  num(key: string, opts: { fallback?: number; min?: number; integer?: boolean } = {}): number {
    const fallback = opts.fallback ?? 0;
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return fallback;

    let n: number;
    if (typeof value === "number") {
      n = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return fallback;
      n = Number(trimmed);
    } else {
      this.fail(key, `${key} must be a number`);
      return fallback;
    }

    if (!Number.isFinite(n)) {
      this.fail(key, `${key} must be a number`);
      return fallback;
    }
    if (opts.integer && !Number.isInteger(n)) {
      this.fail(key, `${key} must be an integer`);
      return fallback;
    }
    if (opts.min !== undefined && n < opts.min) {
      this.fail(key, `${key} must be at least ${opts.min}`);
      return fallback;
    }
    return n;
  }

  /** Nullable numeric field. */
  nullableNum(key: string, opts: { min?: number } = {}): number | null {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return null;

    let n: number;
    if (typeof value === "number") {
      n = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      n = Number(trimmed);
    } else {
      this.fail(key, `${key} must be a number or null`);
      return null;
    }

    if (!Number.isFinite(n)) {
      this.fail(key, `${key} must be a number or null`);
      return null;
    }
    if (opts.min !== undefined && n < opts.min) {
      this.fail(key, `${key} must be at least ${opts.min}`);
      return null;
    }
    return n;
  }

  /** Optional master number field (shopNo / vehicleNo / …). Auto-assigned when absent. */
  optionalNo(key: string): number | null {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return null;

    let n: number;
    if (typeof value === "number") {
      n = value;
    } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      n = Number(value.trim());
    } else {
      this.fail(key, `${key} must be a positive integer`);
      return null;
    }

    if (!Number.isInteger(n) || n < 1) {
      this.fail(key, `${key} must be a positive integer`);
      return null;
    }
    return n;
  }

  /** Status enum field; defaults to "Active" (mirrors singular create). */
  status(key: string, allowed: readonly string[]): string {
    const value = this.raw[key];
    const fallback = allowed.includes("Active") ? "Active" : allowed[0];
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "string" && allowed.includes(value.trim())) {
      return value.trim();
    }
    this.fail(key, `${key} must be one of: ${allowed.join(", ")}`);
    return fallback;
  }

  /** Date field (nullable). Accepts YYYY-MM-DD or other parseable date strings. */
  date(key: string): string | null {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") {
      this.fail(key, `${key} must be a date string or null`);
      return null;
    }
    const s = value.trim();
    if (s === "") return null;

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) {
      const [, y, m, d] = iso;
      const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      const valid =
        parsed.getUTCFullYear() === Number(y) &&
        parsed.getUTCMonth() === Number(m) - 1 &&
        parsed.getUTCDate() === Number(d);
      if (!valid) {
        this.fail(key, `${key} must be a valid date (YYYY-MM-DD)`);
        return null;
      }
      return s;
    }

    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    this.fail(key, `${key} must be a valid date (YYYY-MM-DD)`);
    return null;
  }

  /**
   * Phone/mobile field (lenient): digits with optional +, spaces, dashes and
   * parentheses; between 5 and 15 digits. Empty is allowed.
   */
  phone(key: string): string {
    const value = this.raw[key];
    if (value === undefined || value === null || value === "") return "";
    const s =
      typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : typeof value === "string"
          ? value.trim()
          : null;
    if (s === null) {
      this.fail(key, `${key} must be a string`);
      return "";
    }
    if (s !== "") {
      const digits = s.replace(/[\s\-().]/g, "");
      if (!/^\+?\d{5,15}$/.test(digits)) {
        this.fail(key, `${key} must be a valid phone number`);
        return s;
      }
    }
    return s;
  }
}

// ---------------------------------------------------------------------------
// Per-kind normalizers
// ---------------------------------------------------------------------------

function normalizeShop(ctx: RowContext): NormalizedShopRow {
  const email = ctx.str("email");
  if (!email) {
    ctx.fail("email", "Email ID is required.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ctx.fail("email", "Please enter a valid email address.");
  }
  return {
    shopNo: ctx.optionalNo("shopNo"),
    shopName: ctx.requiredStr("shopName"),
    ownerName: ctx.str("ownerName"),
    phoneNumber: ctx.phone("phoneNumber"),
    village: ctx.str("village"),
    address: ctx.nullableStr("address"),
    email,
    status: ctx.status("status", ACTIVE_STATUSES) as NormalizedShopRow["status"],
  };
}

function normalizeVehicle(ctx: RowContext): NormalizedVehicleRow {
  return {
    vehicleNo: ctx.optionalNo("vehicleNo"),
    vehicleNumber: ctx.requiredStr("vehicleNumber"),
    vehicleType: ctx.str("vehicleType"),
    noOfBoxes: ctx.num("noOfBoxes", { fallback: 85, min: 0, integer: true }),
    birdCapacity: ctx.num("birdCapacity", { min: 0, integer: true }),
    capacityKg: ctx.num("capacityKg", { min: 0 }),
    trackingId: ctx.str("trackingId"),
    fastagBank: ctx.str("fastagBank"),
    engineNumber: ctx.str("engineNumber"),
    chassisNumber: ctx.str("chassisNumber"),
    insuranceExpiry: ctx.date("insuranceExpiry"),
    permitExpiry: ctx.date("permitExpiry"),
    fitnessExpiry: ctx.date("fitnessExpiry"),
    purchaseDate: ctx.date("purchaseDate"),
    purchaseAmount: ctx.nullableNum("purchaseAmount", { min: 0 }),
    emiStartDate: ctx.date("emiStartDate"),
    rcDate: ctx.date("rcDate"),
    status: ctx.status("status", ACTIVE_STATUSES) as NormalizedVehicleRow["status"],
  };
}

function normalizeEmployee(ctx: RowContext): NormalizedEmployeeRow {
  return {
    employeeNo: ctx.optionalNo("employeeNo"),
    employeeName: ctx.requiredStr("employeeName"),
    department: ctx.str("department"),
    role: ctx.str("role"),
    phoneNumber: ctx.phone("phoneNumber"),
    email: ctx.str("email"),
    address: ctx.str("address"),
    joiningDate: ctx.date("joiningDate"),
    aadharNumber: ctx.nullableStr("aadharNumber"),
    licenseNumber: ctx.nullableStr("licenseNumber"),
    salary: ctx.num("salary", { min: 0 }),
    status: ctx.status("status", EMPLOYEE_STATUSES) as NormalizedEmployeeRow["status"],
    avatar: ctx.nullableStr("avatar"),
  };
}

function normalizeFarm(ctx: RowContext): NormalizedFarmRow {
  return {
    farmNo: ctx.optionalNo("farmNo"),
    farmName: ctx.requiredStr("farmName"),
    ownerName: ctx.str("ownerName"),
    supervisorName: ctx.str("supervisorName"),
    phoneNumber: ctx.phone("phoneNumber"),
    village: ctx.str("village"),
    address: ctx.str("address"),
    capacity: ctx.num("capacity", { min: 0, integer: true }),
    status: ctx.status("status", ACTIVE_STATUSES) as NormalizedFarmRow["status"],
  };
}

function normalizeBirdType(ctx: RowContext): NormalizedBirdTypeRow {
  return {
    birdTypeNo: ctx.optionalNo("birdTypeNo"),
    birdType: ctx.requiredStr("birdType"),
    averageWeight: ctx.num("averageWeight", { min: 0 }),
    description: ctx.str("description"),
    status: ctx.status("status", ACTIVE_STATUSES) as NormalizedBirdTypeRow["status"],
  };
}

const normalizers: Record<BulkEntityKind, (ctx: RowContext) => NormalizedBulkRow> = {
  shops: normalizeShop,
  vehicles: normalizeVehicle,
  employees: normalizeEmployee,
  farms: normalizeFarm,
  "bird-types": normalizeBirdType,
};

// ---------------------------------------------------------------------------
// Duplicate detection (within the uploaded batch)
// ---------------------------------------------------------------------------

interface DuplicateKeyConfig {
  noField: string;
  naturalField: string;
  naturalKey: (row: NormalizedBulkRow) => string;
}

const duplicateConfigs: Record<BulkEntityKind, DuplicateKeyConfig> = {
  shops: {
    noField: "shopNo",
    naturalField: "shopName",
    naturalKey: (row) => (row as NormalizedShopRow).shopName.toLowerCase(),
  },
  vehicles: {
    noField: "vehicleNo",
    naturalField: "vehicleNumber",
    naturalKey: (row) => (row as NormalizedVehicleRow).vehicleNumber.toLowerCase(),
  },
  employees: {
    noField: "employeeNo",
    naturalField: "employeeName",
    naturalKey: (row) => (row as NormalizedEmployeeRow).employeeName.toLowerCase(),
  },
  farms: {
    noField: "farmNo",
    naturalField: "farmName",
    naturalKey: (row) => (row as NormalizedFarmRow).farmName.toLowerCase(),
  },
  "bird-types": {
    noField: "birdTypeNo",
    naturalField: "birdType",
    naturalKey: (row) => (row as NormalizedBirdTypeRow).birdType.toLowerCase(),
  },
};

function detectBatchDuplicates(
  kind: BulkEntityKind,
  rows: NormalizedBulkRow[]
): BulkRowError[] {
  const config = duplicateConfigs[kind];
  const errors: BulkRowError[] = [];
  const seen = new Map<string, number>(); // composite key -> first 0-based index

  rows.forEach((row, index) => {
    const raw = row as unknown as Record<string, unknown>;
    const no = raw[config.noField] as number | null;
    const entries: Array<[string, string, string]> = [];
    if (no !== null) {
      entries.push([`no:${no}`, config.noField, `${config.noField} ${no}`]);
    }
    entries.push([
      `natural:${config.naturalKey(row)}`,
      config.naturalField,
      `${config.naturalField} "${String(raw[config.naturalField])}"`,
    ]);

    for (const [key, field, label] of entries) {
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, index);
        continue;
      }
      errors.push({
        row: index + 1,
        field,
        message: `duplicates row ${first + 1} (${label})`,
      });
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Entry point used by the bulk service
// ---------------------------------------------------------------------------

export interface ValidatedBulkBatch {
  rows: NormalizedBulkRow[];
}

/**
 * Validates the request body for a master bulk import.
 *
 * - body must be a non-empty JSON array of plain objects
 * - every row is validated + normalized with the same field rules/defaults as
 *   the singular create endpoints
 * - duplicate rows within the batch are rejected (409)
 *
 * Throws AppError(400 | 409) with structured `details.errors` on failure.
 */
export function validateBulkRows(kind: BulkEntityKind, body: unknown): ValidatedBulkBatch {
  if (!Array.isArray(body)) {
    throw new AppError(400, "Request body must be an array of rows", {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [{ row: 0, field: "", message: "Request body must be an array of rows" }],
    });
  }
  if (body.length === 0) {
    throw new AppError(400, "Request body must contain at least one row", {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [{ row: 0, field: "", message: "Request body must contain at least one row" }],
    });
  }

  const rows: NormalizedBulkRow[] = [];
  const errors: BulkRowError[] = [];

  body.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push({ row: index + 1, field: "", message: "row must be an object" });
      return;
    }
    const ctx = new RowContext(index + 1, entry);
    rows.push(normalizers[kind](ctx));
    errors.push(...ctx.errors);
  });

  if (errors.length === 0) {
    const duplicateErrors = detectBatchDuplicates(kind, rows);
    if (duplicateErrors.length > 0) {
      throw new AppError(
        409,
        `Bulk import rejected: ${duplicateErrors.length} duplicate row(s) in the uploaded batch`,
        {
          total: rows.length,
          successful: 0,
          failed: duplicateErrors.length,
          errors: duplicateErrors,
        }
      );
    }
    return { rows };
  }

  throw new AppError(400, `Bulk import failed: ${errors.length} row(s) have validation errors`, {
    total: rows.length,
    successful: 0,
    failed: errors.length,
    errors,
  });
}
