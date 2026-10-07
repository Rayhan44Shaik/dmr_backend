// Pending-collection delete for the collection-entry service module.
import { withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { CollectionEntry } from "../types/operations.js";
import { num, str } from "../utils/coerce.js";

/**
 * Soft-delete a pending (never approved) collection entry.
 *
 * - Only records that are currently `Pending Approval` and not yet financial may
 *   be deleted. Approved/financial collections are not reachable through this
 *   path (they must be rejected or handled by the existing softDelete flow).
 * - The 7-day window is enforced server-side so a pending collection cannot be
 *   silently removed after the business expected it to be approved/rejected.
 * - The collection number is permanent and is NOT cleared, so it is never reused.
 */
export async function deletePendingCollection(id: number): Promise<CollectionEntry> {
  return withTransaction(async (client) => {
    const lockRow = await client.query(
      `SELECT id, collection_no, collection_date, shop_id, status, deleted, is_financial, deleted_at
         FROM collections WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!lockRow.rowCount) {
      throw new AppError(404, "Collection not found");
    }
    const row = lockRow.rows[0];
    if (Boolean(row.deleted)) {
      throw new AppError(409, "Collection is already deleted");
    }
    if (row.status !== "Pending Approval") {
      throw new AppError(
        409,
        "Only pending (never-approved) collections can be deleted from the pending register"
      );
    }
    if (Boolean(row.is_financial)) {
      throw new AppError(409, "A financial collection cannot be deleted from the pending register");
    }

    const windowResult = await client.query<{ ok: boolean }>(
      `SELECT (CURRENT_DATE <= ($1::date + INTERVAL '7 days')) AS ok`,
      [row.collection_date]
    );
    if (!windowResult.rows[0]?.ok) {
      throw new AppError(
        409,
        "Pending collection is outside the 7-day deletion window and cannot be removed"
      );
    }

    await client.query(
      `UPDATE collections SET
         deleted = TRUE,
         deleted_at = NOW(),
         status = 'Deleted',
         is_financial = FALSE
       WHERE id = $1`,
      [id]
    );

    const refreshed = await client.query(
      `SELECT id, collection_no, collection_date, shop_id, status, deleted, is_financial, deleted_at
         FROM collections WHERE id = $1`,
      [id]
    );
    const r = refreshed.rows[0];

    return {
      id: num(r.id),
      collectionNo: str(r.collection_no),
      collectionDate: str(r.collection_date) ?? "",
      shopId: r.shop_id == null ? null : num(r.shop_id),
      shopName: "",
      tripId: null,
      amountDue: 0,
      amount: 0,
      amountCollected: 0,
      collector: "",
      paymentMode: "Cash",
      referenceNo: "",
      remarks: "",
      status: "Deleted" as const,
      deleted: true,
      deletedBy: null,
      deletedAt: str(r.deleted_at),
      isFinancial: false,
      approvedBy: null,
      approvedAt: null,
      createdBy: "",
      createdAt: null,
      updatedAt: null,
      openingBalance: null,
      closingBalance: null,
    };
  });
}

// Re-export alias used by the pending-delete router when it imports through
// the service barrel. The router itself keeps its own inline implementation,
// so this export is defensive and does not add a second implementation.
export { deletePendingCollection as deletePendingCollectionForRouter };
