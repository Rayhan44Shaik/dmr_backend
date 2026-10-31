import { AppError } from "../middleware/errorHandler.js";

/** Shop Sales table: a delivery may be edited for two weeks from INSERT
 *  (`trip_deliveries.created_at`), never from the trip date. */
export const SHOP_SALE_EDIT_WINDOW_DAYS = 14;

export function shopSaleEditExpiresAt(
  createdAt: string | Date | null | undefined
): Date | null {
  if (createdAt == null || createdAt === "") return null;
  const start = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  if (Number.isNaN(start.getTime())) return null;
  return new Date(
    start.getTime() + SHOP_SALE_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isShopSaleWindowOpen(
  createdAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const expires = shopSaleEditExpiresAt(createdAt);
  if (!expires) return false;
  return now.getTime() < expires.getTime();
}

export function assertShopSaleWindowOpen(
  createdAt: string | Date | null | undefined,
  saleNo?: string
): void {
  if (isShopSaleWindowOpen(createdAt)) return;
  const expires = shopSaleEditExpiresAt(createdAt);
  const closed = expires ? ` (closed ${expires.toISOString().slice(0, 10)})` : "";
  throw new AppError(
    409,
    `Shop sale ${saleNo ?? ""} is locked — editing is allowed for 2 weeks from the insert date${closed}.`
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function assertShopSaleTripNotDeleted(trip: {
  tripNo?: string;
  deleted?: boolean;
}): void {
  if (trip.deleted) {
    throw new AppError(
      409,
      `Trip ${trip.tripNo ?? ""} is deleted and cannot be edited`.trim()
    );
  }
}
