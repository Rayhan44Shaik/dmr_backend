/**
 * Rate Entry data access — backed by PostgreSQL (via rateEntryApiService),
 * not localStorage. PostgreSQL is the single source of truth: a trip is
 * only ever "waiting for rate entry" here because the backend's eligibility
 * query says so, and a trip only ever disappears from this list because the
 * backend recorded an explicit lock.
 */
import type { Trip, ShopDelivery } from "../../vehicle-trips/types/trip";
import {
  listEligibleTrips,
  getRateEntryTrip,
  saveRates,
  lockRates,
} from "./rateEntryApiService";

/** Trips currently eligible for Rate Entry (Completed, not deleted, not
 * rate-locked) — the backend query is the authority. */
async function getCompletedTrips(): Promise<Trip[]> {
  return listEligibleTrips();
}

/** Loads a single trip's Rate Entry detail (shop-wise deliveries + market
 * reference) from GET /operations/rate-entry/:tripId. */
async function getTrip(id: number): Promise<Trip> {
  return getRateEntryTrip(id);
}

/** Saves shop-wise rates via PUT /operations/rate-entry/:tripId. Does NOT
 * lock. Throws on failure — callers should catch and surface the error. */
async function saveOnly(tripId: number, deliveries: Trip["deliveries"]): Promise<void> {
  const lines = deliveries
    .filter((d) => d.rate != null && Number.isFinite(d.rate as number) && (d.rate as number) >= 50 && (d.rate as number) <= 300)
    .map((d) => ({ deliveryId: d.id, rate: d.rate as number }));
  await saveRates(tripId, lines);
}

/** Locks a trip's Rate Entry via POST /operations/rate-entry/:tripId/lock. */
async function lockOnly(tripId: number): Promise<void> {
  await lockRates(tripId);
}

/** Saves and locks in one call (mirrors the existing "Save & Lock Trip"
 * button). Throws on failure. */
async function saveRatesAndLock(tripId: number, deliveries: Trip["deliveries"]): Promise<boolean> {
  const lines = deliveries
    .filter((d) => d.rate != null && Number.isFinite(d.rate as number) && (d.rate as number) >= 50 && (d.rate as number) <= 300)
    .map((d) => ({ deliveryId: d.id, rate: d.rate as number }));
  await lockRates(tripId, "web-user", lines);
  return true;
}

export type { ShopDelivery };

export const completedTripService = {
  getCompletedTrips,
  getTrip,
  saveRates: saveRatesAndLock,
  saveOnly,
  lockOnly,
};
