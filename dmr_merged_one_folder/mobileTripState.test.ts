import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextIncompleteTripStep,
  type Trip,
} from "../../../shared/trip";
import { filterDraftTripsForSupervisor } from "./mobileTripApi";
import {
  mergeDraftSnapshots,
  newMobileOperationId,
  type MobileWorkingDraft,
} from "./mobileTripStorage";

function trip(overrides: Partial<Trip>): Trip {
  return {
    id: 1,
    tripNo: "TRP-20260816-001",
    tripDate: "2026-08-16",
    startTime: "",
    vehicleId: 1,
    vehicleNo: "AP01AA0001",
    driverId: 1,
    driverName: "Driver",
    supervisorId: 10,
    supervisorName: "Supervisor A",
    advanceAmount: 0,
    helpers: ["Helper"],
    loaders: ["Loader"],
    openingMeter: 100,
    startStepSubmitted: true,
    sourceFarmId: 0,
    sourceFarm: "",
    reachedTime: "",
    destMeter: 0,
    pickupTolls: 0,
    farmStepSubmitted: false,
    dcWeight: 0,
    totalBirds: 0,
    boxes: 0,
    avgWeight: 0,
    pickupLoadTime: "",
    pickupStepSubmitted: false,
    boxNo: 0,
    birds: 0,
    weight: 0,
    boxDetails: [],
    deliveries: [],
    deliveryStepSubmitted: false,
    closingMeter: 0,
    endTime: "",
    deliveryTolls: 0,
    endStepSubmitted: false,
    expensesStepSubmitted: false,
    totalKm: 0,
    totalShops: 0,
    totalWeight: 0,
    totalDeliveredWeight: 0,
    totalBirdsDelivered: 0,
    totalMortality: 0,
    totalMortalityCount: 0,
    totalMortalityWeight: 0,
    weightLoss: 0,
    survivalRate: 0,
    lastShop: "",
    fuel: 0,
    expense: 0,
    remarks: "",
    status: "Draft",
    rateCompleted: false,
    deleted: false,
    createdAt: "2026-08-16T01:00:00.000Z",
    updatedAt: "2026-08-16T01:00:00.000Z",
    ...overrides,
  };
}

function working(value: Trip): MobileWorkingDraft {
  return {
    version: 2,
    ownerKey: "supervisor-a",
    clientDraftId: "client-a",
    trip: value,
    activeStep: getNextIncompleteTripStep(value),
    serverVersion: 1,
    savedAt: "2026-08-16T01:05:00.000Z",
  };
}

test("Draft list contains only authoritative Draft status", () => {
  const rows = [
    trip({ id: 1, status: "Draft" }),
    trip({ id: 2, tripNo: "TRP-002", status: "Pending" }),
    trip({ id: 3, tripNo: "TRP-003", status: "Completed" }),
  ];
  const filtered = filterDraftTripsForSupervisor(rows, 10, "Supervisor A");
  assert.deepEqual(filtered.map((row) => row.id), [1]);
});

test("resuming a local working copy preserves the same server Trip ID", () => {
  const server = trip({ id: 42, vehicleNo: "SERVER" });
  const local = trip({ id: 42, vehicleNo: "LOCAL EDIT" });
  const merged = mergeDraftSnapshots([server], working(local));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 42);
  assert.equal(merged[0].vehicleNo, "LOCAL EDIT");
});

test("three simultaneous supervisor lists remain isolated", () => {
  const rows = [
    trip({ id: 101, supervisorId: 10, supervisorName: "Supervisor A" }),
    trip({ id: 102, supervisorId: 20, supervisorName: "Supervisor B" }),
    trip({ id: 103, supervisorId: 30, supervisorName: "Supervisor C" }),
  ];
  assert.deepEqual(filterDraftTripsForSupervisor(rows, 10, "Supervisor A").map((row) => row.id), [101]);
  assert.deepEqual(filterDraftTripsForSupervisor(rows, 20, "Supervisor B").map((row) => row.id), [102]);
  assert.deepEqual(filterDraftTripsForSupervisor(rows, 30, "Supervisor C").map((row) => row.id), [103]);
});

test("each legitimate queue action receives a globally unique operation identity", () => {
  const first = newMobileOperationId();
  const second = newMobileOperationId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second);
});
