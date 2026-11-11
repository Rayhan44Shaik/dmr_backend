import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { withTransaction } from "../config/db.js";
import { authUser } from "../middleware/auth.js";
import type { CollectionEntry } from "../types/operations.js";
import { num, str } from "../utils/coerce.js";

export const operationsPendingDeleteRouter = Router();

function mapPendingDeleteResult(row: Record<string, unknown>): CollectionEntry {
  return {
    id: num(row.id),
    collectionNo: str(row.collection_no),
    collectionDate: str(row.collection_date) ?? "",
    shopId: row.shop_id == null ? null : num(row.shop_id),
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
    deletedAt: str(row.deleted_at),
    isFinancial: false,
    approvedBy: null,
    approvedAt: null,
    createdBy: "",
    createdAt: null,
    updatedAt: null,
    openingBalance: null,
    closingBalance: null,
  };
}

/**
 * DELETE /operations/collection-entry/pending/:id
 *
 * Removes a pending (never-approved) Collection Entry record. A pending
 * collection has no financial effect yet (no Shop Ledger credit was applied),
 * so deletion is a plain soft delete: the row is marked deleted and the
 * collection number is retired forever (numbers are never recycled).
 *
 * The 14-day deletion window is enforced server-side: a pending collection may
 * only be deleted for 14 days after its database entry timestamp. Outside the
 * window the request is rejected with 409 so the number and record remain
 * auditable rather than silently disappearing.
 *
 * Audit identity: deletedBy is recorded from the authenticated session, never
 * from the client payload.
 */
operationsPendingDeleteRouter.delete(
  "/pending/:id",
  asyncHandler(async (req, res) => {
    const rawId = req.params.id;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, "A valid collection id is required");
    }

    await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, collection_no, collection_date, created_at, shop_id, status, deleted, is_financial, deleted_at
           FROM collections WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!existing.rowCount) {
        throw new AppError(404, "Collection not found");
      }
      const row = existing.rows[0];
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
        throw new AppError(
          409,
          "A financial collection cannot be deleted from the pending register"
        );
      }

      const windowOk = await client.query<{ ok: boolean }>(
        `SELECT (NOW() < ($1::timestamptz + INTERVAL '14 days')) AS ok`,
        [row.created_at]
      );
      if (!windowOk.rows[0]?.ok) {
        throw new AppError(
          409,
          "Pending collection is outside the 14-day deletion window and cannot be removed"
        );
      }

      const deletedBy = authUser(res).displayName;
      await client.query(
        `UPDATE collections SET
           deleted = TRUE,
           deleted_at = NOW(),
           status = 'Deleted',
           is_financial = FALSE,
           deleted_by = $2
         WHERE id = $1`,
        [id, deletedBy]
      );

      const refreshed = await client.query(
        `SELECT id, collection_no, collection_date, shop_id, status, deleted, is_financial, deleted_at, deleted_by
           FROM collections WHERE id = $1`,
        [id]
      );
      void mapPendingDeleteResult(refreshed.rows[0]);
    });

    res.status(204).end();
  })
);
