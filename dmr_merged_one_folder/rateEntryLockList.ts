/** Rate Entry pending-list helpers after a confirmed backend lock. */

export function dropLockedTripFromList<T extends { id: number }>(
  trips: T[],
  lockedTripId: number
): T[] {
  return trips.filter((trip) => trip.id !== lockedTripId);
}

export function excludeKnownLockedTrips<T extends { id: number }>(
  trips: T[],
  lockedTripIds: ReadonlySet<number>
): T[] {
  if (lockedTripIds.size === 0) return trips;
  return trips.filter((trip) => !lockedTripIds.has(trip.id));
}
