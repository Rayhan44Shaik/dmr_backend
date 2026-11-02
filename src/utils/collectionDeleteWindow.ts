import { AppError } from "../middleware/errorHandler.js";

/**
 * After a collection is approved it may be deleted for two weeks, counted
 * from `collections.approved_at` — the same shape as Shop Sales' 14-day
 * window from insert, never from the original collection date.
 */
export const COLLECTION_APPROVED_DELETE_WINDOW_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function collectionApprovedDeleteExpiresAt(
  approvedAt: string | Date | null | undefined
): Date | null {
  if (approvedAt == null || approvedAt === "") return null;
  const start = approvedAt instanceof Date ? approvedAt : new Date(String(approvedAt));
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + COLLECTION_APPROVED_DELETE_WINDOW_DAYS * MS_PER_DAY);
}

export function isCollectionApprovedDeleteWindowOpen(
  approvedAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const expires = collectionApprovedDeleteExpiresAt(approvedAt);
  if (!expires) return false;
  return now.getTime() < expires.getTime();
}

export function assertCollectionApprovedDeleteWindowOpen(
  approvedAt: string | Date | null | undefined,
  collectionNo?: string
): void {
  if (isCollectionApprovedDeleteWindowOpen(approvedAt)) return;
  const expires = collectionApprovedDeleteExpiresAt(approvedAt);
  const closed = expires ? ` (closed ${expires.toISOString().slice(0, 10)})` : "";
  throw new AppError(
    409,
    `Collection ${collectionNo ?? ""} is locked — deletion is allowed for 14 days after approval${closed}.`
      .replace(/\s+/g, " ")
      .trim()
  );
}
