// src/modules/operations/shop-sales/utils/shopSaleMapping.ts
// Pure mapper between the backend Shop Sale row (camelCase, PostgreSQL) and
// the frontend ShopSale shape. No axios/React imports — unit-testable with
// node:test. The backend response is authoritative: saleNo (the Shop Sales
// number, e.g. TR-20260820-001-S001) and the editability/lock fields are
// mapped verbatim and never re-derived.

import type { ShopSale } from "../types/shopSale";

/** Raw shape returned by GET/PUT /operations/shop-sales (backend ShopSale, camelCase). */
export interface ApiShopSale {
  id: number;
  saleNo: string;
  saleDate: string;
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  tripId: number | null;
  tripNo: string;
  shopNo?: string;
  vehicleNo: string | null;
  farmName: string | null;
  birds: number;
  weight: number;
  rate: number;
  amount: number;
  mortality: number;
  remarks: string;
  status: string;
  deleted: boolean;
  deletedReason: string | null;
  tripDeleted: boolean;
  editable: boolean;
  lockReason?: string | null;
  windowExpiresAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Backend-authoritative Rate Entry lock / 10-day correction state. */
  rateCompleted?: boolean;
  rateLockedAt?: string | null;
  rateLockedBy?: string | null;
  correctionWindowExpired?: boolean;
  correctionWindowClosesAt?: string | null;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Maps one backend ShopSale row onto the existing frontend ShopSale shape —
 * every field the components read (totalBirds, totalWeight, remark, etc.)
 * keeps its exact name and type; the real numeric ids, the Shop Sales
 * number and lock state are carried alongside additively. */
export function mapApiSaleToShopSale(row: ApiShopSale): ShopSale {
  return {
    id: String(row.id),
    saleNo: row.saleNo ?? "",
    tripId: row.tripId == null ? "" : String(row.tripId),
    tripNo: row.tripNo,
    tripDate: row.saleDate,
    shopId: row.shopId == null ? "" : String(row.shopId),
    shopNo: row.shopNo ?? "",
    shopName: row.shopName,
    birdType: row.birdType,
    totalBirds: num(row.birds),
    totalWeight: num(row.weight),
    rate: row.rate,
    amount: num(row.amount),
    remark: row.remarks,
    status: row.status === "Approved" ? "Completed" : "Pending",
    numericId: row.id,
    numericTripId: row.tripId,
    numericShopId: row.shopId,
    mortality: num(row.mortality),
    birdTypeId: row.birdTypeId,
    editable: row.editable,
    windowExpiresAt: row.windowExpiresAt,
    tripDeleted: row.tripDeleted,
    lockReason: row.lockReason ?? null,
    rateCompleted: row.rateCompleted,
    rateLockedAt: row.rateLockedAt,
    rateLockedBy: row.rateLockedBy,
    correctionWindowExpired: row.correctionWindowExpired,
    correctionWindowClosesAt: row.correctionWindowClosesAt,
  };
}