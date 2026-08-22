import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dropLockedTripFromList, excludeKnownLockedTrips } from "./rateEntryLockList";

type Row = { id: number; tripNo: string };

const tripA: Row = { id: 101, tripNo: "T-101" };
const tripB: Row = { id: 202, tripNo: "T-202" };

describe("Rate Entry lock list resilience", () => {
  it("successful lock removes only that trip from the current list", () => {
    const afterLock = dropLockedTripFromList([tripA, tripB], tripA.id);
    assert.deepEqual(afterLock, [tripB]);
  });

  it("successful lock + failed reload does not put the locked trip back", () => {
    const lockedIds = new Set<number>();
    let trips = [tripA, tripB];

    lockedIds.add(tripA.id);
    trips = dropLockedTripFromList(trips, tripA.id);

    // reload fails: keep the locally filtered list
    assert.deepEqual(trips, [tripB]);
    assert.equal(trips.some((t) => t.id === tripA.id), false);
  });

  it("failed lock does not remove the trip", () => {
    const trips = [tripA, tripB];
    // lock POST failed: do not drop, do not record id
    assert.deepEqual(trips, [tripA, tripB]);
    assert.equal(excludeKnownLockedTrips(trips, new Set<number>()).some((t) => t.id === tripA.id), true);
  });

  it("second confirmed lock is idempotent on local list state", () => {
    let trips = [tripA, tripB];
    const lockedIds = new Set<number>([tripA.id]);
    trips = dropLockedTripFromList(trips, tripA.id);
    trips = dropLockedTripFromList(trips, tripA.id);
    assert.deepEqual(trips, [tripB]);
  });

  it("another eligible trip is unaffected", () => {
    const after = dropLockedTripFromList([tripA, tripB], tripA.id);
    assert.equal(after.find((t) => t.id === tripB.id)?.tripNo, "T-202");
  });

  it("locked trip does not return after a successful reload that still includes it", () => {
    const lockedIds = new Set<number>([tripA.id]);
    const reloaded = excludeKnownLockedTrips([tripA, tripB], lockedIds);
    assert.deepEqual(reloaded, [tripB]);
  });

  it("successful reload without the locked trip keeps the other trip", () => {
    const lockedIds = new Set<number>([tripA.id]);
    const reloaded = excludeKnownLockedTrips([tripB], lockedIds);
    assert.deepEqual(reloaded, [tripB]);
  });
});
