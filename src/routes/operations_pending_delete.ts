import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
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
 * The 7-day deletion window is enforced server-side: a pending collection may
 * only be deleted while CURRENT_DATE <= collection_date + 7 days. Outside the
 * window the request is rejected with 409 so the number and record remain
 * auditable rather than silently disappearing.
 */
operationsPendingDeleteRouter.delete(
  "/collection-entry/pending/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: "A valid collection id is required" });
      return;
    }

    await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, collection_no, collection_date, shop_id, status, deleted, is_financial, deleted_at
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
        throw new AppError(409, "A financial collection cannot be deleted from the pending register");
      }

      const windowOk = await client.query<{ ok: boolean }>(
        `SELECT (CURRENT_DATE <= ($1::date + INTERVAL '7 days')) AS ok`,
        [row.collection_date]
      );
      if (!windowOk.rows[0]?.ok) {
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
      void mapPendingDeleteResult(refreshed.rows[0]);
    });

    res.status(204).end();
  })
);
