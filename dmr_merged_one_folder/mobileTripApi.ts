import type { Trip } from "../../../shared/trip";

/** Pure defense-in-depth filter; the Phase 2 backend performs the authoritative ownership check. */
export function filterDraftTripsForSupervisor(
  trips: Trip[],
  supervisorId: number,
  supervisorName: string
): Trip[] {
  const normalizedName = supervisorName.trim().toLowerCase();
  return trips.filter(
    (trip) =>
      trip.status === "Draft" &&
      !trip.deleted &&
      trip.supervisorId === supervisorId &&
      trip.supervisorName.trim().toLowerCase() === normalizedName
  );
}
