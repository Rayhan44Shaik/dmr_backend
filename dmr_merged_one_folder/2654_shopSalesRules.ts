/**
 * Shop Sales conservation, 10-day lock, and Step 4 box-allocation helpers.
 *
 * Trip Entry / Rate Entry code must not import this file. Shop Sales is the
 * only caller. Shared tripDeliverySync helpers used by Trip Entry are left
 * unchanged (those still use a "must not exceed pickup" ceiling).
 *
 * Redistribution rule (deterministic):
 *   When one shop's birds or weight changes, the delta is taken from / given
 *   to other active shop deliveries (shop_id IS NOT NULL, deleted = FALSE),
 *   walking by descending delivery id (last eligible row first). Mortality
 *   rows are never adjusted. No shop may go negative. Pickup totals stay
 *   exact: shop birds + mortality birds == pickup birds; shop weight +
 *   mortality weight + trip weight_loss == pickup weight.
 *
 * Ten-day lock (PostgreSQL calendar dates, not the browser clock):
 *   editable when CURRENT_DATE <= trip_date + 10 days
 *   locked after that (day 10 inclusive, day 11 locked).
 */

import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";

type Client = pg.PoolClient;

export const SHOP_SALES_EDIT_WINDOW_DAYS = 10;

export function formatShopNo(shopNo: number | null | undefined): string {
  if (shopNo == null || !Number.isFinite(Number(shopNo))) return "";
  return `S${String(Math.trunc(Number(shopNo))).padStart(2, "0")}`;
}

export async function shopSalesWindowFromDb(
  client: Client,
  tripDate: string
): Promise<{ editable: boolean; expiresOn: string; serverDate: string }> {
  const result = await client.query<{
    server_date: string;
    expires_on: string;
    editable: boolean;
  }>(
    `SELECT CURRENT_DATE::text AS server_date,
            ($1::date + ($2::int * INTERVAL '1 day'))::date::text AS expires_on,
            (CURRENT_DATE <= ($1::date + ($2::int * INTERVAL '1 day'))::date) AS editable`,
    [tripDate, SHOP_SALES_EDIT_WINDOW_DAYS]
  );
  const row = result.rows[0];
  return {
    editable: Boolean(row.editable),
    expiresOn: String(row.expires_on).slice(0, 10),
    serverDate: String(row.server_date).slice(0, 10),
  };
}

export function assertShopSalesEligible(trip: {
  tripNo?: string;
  status: string;
  deleted: boolean;
  rateCompleted: boolean;
  deliveryStepSubmitted: boolean;
  expensesStepSubmitted: boolean;
}): void {
  if (trip.deleted || trip.status === "Deleted") {
    throw new AppError(409, `Trip ${trip.tripNo ?? ""} is deleted and cannot be used in Shop Sales`.trim());
  }
  if (trip.status === "Draft") {
    throw new AppError(409, `Draft trips cannot create Shop Sales records.`);
  }
  if (trip.status === "Pending") {
    throw new AppError(409, `Pending trips cannot create Shop Sales records.`);
  }
  if (trip.status !== "Completed") {
    throw new AppError(
      409,
      `Trip ${trip.tripNo ?? ""} is not Completed (status: ${trip.status}). Shop Sales requires a completed trip.`
    );
  }
  if (!trip.deliveryStepSubmitted) {
    throw new AppError(409, `Trip ${trip.tripNo ?? ""} has no submitted Step 4 delivery.`.trim());
  }
  if (!trip.expensesStepSubmitted) {
    throw new AppError(409, `Trip ${trip.tripNo ?? ""} has no completed Step 5.`.trim());
  }
  if (!trip.rateCompleted) {
    throw new AppError(
      409,
      `Trip ${trip.tripNo ?? ""} has no locked Rate Entry — Shop Sales requires Rate Entry to be saved & locked first.`.replace(
        /\s+/g,
        " "
      )
    );
  }
}

export function birdConservationError(opts: {
  pickup: number;
  delivery: number;
  mortality: number;
}): AppError {
  const combined = opts.delivery + opts.mortality;
  const remaining = opts.pickup - combined;
  if (combined > opts.pickup) {
    return new AppError(
      422,
      `Pickup birds: ${opts.pickup}\nDelivery birds + mortality: ${combined}\n\nDelivery birds cannot exceed the trip pickup birds.`,
      { pickup: opts.pickup, delivery: opts.delivery, mortality: opts.mortality, remaining }
    );
  }
  return new AppError(
    422,
    `Pickup birds: ${opts.pickup}\nDelivery birds: ${opts.delivery}\nMortality: ${opts.mortality}\nRemaining: ${remaining}\n\nDelivery birds must equal pickup birds after mortality.`,
    { pickup: opts.pickup, delivery: opts.delivery, mortality: opts.mortality, remaining }
  );
}

export function weightConservationError(opts: {
  pickup: number;
  delivery: number;
  mortality: number;
  weightLoss: number;
}): AppError {
  const combined = Number((opts.delivery + opts.mortality + opts.weightLoss).toFixed(3));
  const balance = Number((opts.pickup - combined).toFixed(3));
  if (combined > opts.pickup) {
    return new AppError(
      422,
      `Pickup weight: ${opts.pickup} KG\nDelivery + mortality + loss: ${combined} KG\n\nDelivery weight cannot exceed the trip pickup weight.`,
      {
        pickupWeight: opts.pickup,
        deliveryWeight: opts.delivery,
        mortalityWeight: opts.mortality,
        weightLoss: opts.weightLoss,
        balance,
      }
    );
  }
  return new AppError(
    422,
    `Pickup Weight: ${opts.pickup} KG\nDelivery Weight: ${opts.delivery} KG\nMortality Weight: ${opts.mortality} KG\nWeight Loss: ${opts.weightLoss} KG\nBalance: ${balance} KG\n\nDelivery weight must match pickup weight after mortality and weight loss.`,
    {
      pickupWeight: opts.pickup,
      deliveryWeight: opts.delivery,
      mortalityWeight: opts.mortality,
      weightLoss: opts.weightLoss,
      balance,
    }
  );
}

export interface ShopDeliveryAlloc {
  id: number;
  shopId: number | null;
  birds: number;
  weight: number;
  mortality: number;
  mortKg: number;
}

/**
 * Apply a birds/weight delta on `editedId` by taking from / giving to other
 * shop rows in descending id order. Returns the full next allocation map.
 */
export function redistributeShopAllocations(
  rows: ShopDeliveryAlloc[],
  editedId: number,
  nextBirds: number,
  nextWeight: number
): ShopDeliveryAlloc[] {
  const next = rows.map((r) => ({ ...r }));
  const edited = next.find((r) => r.id === editedId);
  if (!edited) {
    throw new AppError(404, "Shop sale not found");
  }
  if (nextBirds < 0 || nextWeight < 0) {
    throw new AppError(400, "Birds and weight cannot be negative.");
  }

  const birdDelta = nextBirds - edited.birds;
  const weightDelta = Number((nextWeight - edited.weight).toFixed(3));
  edited.birds = nextBirds;
  edited.weight = nextWeight;

  const others = next
    .filter((r) => r.id !== editedId && r.shopId != null)
    .sort((a, b) => b.id - a.id);

  applyIntegerDelta(others, birdDelta, "birds");
  applyWeightDelta(others, weightDelta);

  return next;
}

function applyIntegerDelta(others: ShopDeliveryAlloc[], delta: number, field: "birds"): void {
  if (delta === 0) return;
  let remaining = delta;
  for (const row of others) {
    if (remaining === 0) break;
    if (remaining > 0) {
      const take = Math.min(row[field], remaining);
      row[field] -= take;
      remaining -= take;
    } else {
      row[field] += -remaining;
      remaining = 0;
    }
  }
  if (remaining !== 0) {
    throw new AppError(
      422,
      remaining > 0
        ? "No other shop has enough birds to cover this increase. Delivery birds cannot exceed the trip pickup birds."
        : "No other shop is available to receive the released birds while keeping pickup conservation."
    );
  }
}

function applyWeightDelta(others: ShopDeliveryAlloc[], delta: number): void {
  if (Math.abs(delta) < 0.0005) return;
  let remaining = delta;
  for (const row of others) {
    if (Math.abs(remaining) < 0.0005) break;
    if (remaining > 0) {
      const take = Math.min(row.weight, remaining);
      row.weight = Number((row.weight - take).toFixed(3));
      remaining = Number((remaining - take).toFixed(3));
    } else {
      row.weight = Number((row.weight - remaining).toFixed(3));
      remaining = 0;
    }
  }
  if (Math.abs(remaining) >= 0.0005) {
    throw new AppError(
      422,
      remaining > 0
        ? "No other shop has enough weight to cover this increase. Delivery weight cannot exceed the trip pickup weight."
        : "No other shop is available to receive the released weight while keeping pickup conservation."
    );
  }
}

export function assertExactBirdConservation(pickup: number, rows: ShopDeliveryAlloc[]): void {
  const delivery = rows.reduce((s, r) => s + r.birds, 0);
  const mortality = rows.reduce((s, r) => s + r.mortality, 0);
  if (delivery + mortality !== pickup) {
    throw birdConservationError({ pickup, delivery, mortality });
  }
}

export function assertExactWeightConservation(
  pickup: number,
  weightLoss: number,
  rows: ShopDeliveryAlloc[]
): void {
  const delivery = Number(rows.reduce((s, r) => s + r.weight, 0).toFixed(3));
  const mortality = Number(rows.reduce((s, r) => s + r.mortKg, 0).toFixed(3));
  const combined = Number((delivery + mortality + weightLoss).toFixed(3));
  if (Math.abs(combined - pickup) >= 0.001) {
    throw weightConservationError({ pickup, delivery, mortality, weightLoss });
  }
}

/** Scale a delivery's per-box rows to a new birds/weight total. Pickup boxes are not written. */
export async function rescaleDeliveryPerBox(
  client: Client,
  deliveryId: number,
  newBirds: number,
  newWeight: number
): Promise<void> {
  const boxes = await client.query<{ id: number; box_no: number; birds: number; weight: string }>(
    `SELECT id, box_no, birds, weight FROM trip_delivery_per_box WHERE delivery_id = $1 ORDER BY box_no, id`,
    [deliveryId]
  );
  if (!boxes.rowCount) return;

  const oldBirds = boxes.rows.reduce((s, r) => s + Number(r.birds), 0);
  const oldWeight = boxes.rows.reduce((s, r) => s + Number(r.weight), 0);

  let birdsLeft = newBirds;
  let weightLeft = Number(newWeight.toFixed(3));
  for (let i = 0; i < boxes.rows.length; i++) {
    const isLast = i === boxes.rows.length - 1;
    const row = boxes.rows[i];
    const nextBirds = isLast
      ? birdsLeft
      : oldBirds > 0
        ? Math.floor((Number(row.birds) / oldBirds) * newBirds)
        : 0;
    const nextWeight = isLast
      ? weightLeft
      : oldWeight > 0
        ? Number(((Number(row.weight) / oldWeight) * newWeight).toFixed(3))
        : 0;
    birdsLeft -= nextBirds;
    weightLeft = Number((weightLeft - nextWeight).toFixed(3));
    await client.query(`UPDATE trip_delivery_per_box SET birds = $2, weight = $3 WHERE id = $1`, [
      row.id,
      Math.max(0, nextBirds),
      Math.max(0, nextWeight),
    ]);
  }
}
