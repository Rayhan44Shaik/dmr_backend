import assert from "node:assert/strict";
import test from "node:test";
import * as desktopTripFacade from "../../modules/operations/vehicle-trips/services/tripFormService";
import {
  TRIP_FIELD_DEFINITIONS,
  TRIP_STEP_DEFINITIONS,
  TRIP_STEP_LABELS,
  applyDeliveryMetrics,
  calculatePickupTotals,
  createEmptyTrip,
  getLastSubmittedTripStep,
  getMaxAllowedTripStep,
  getNextIncompleteTripStep,
  getResumeActionLabel,
  getTripWizardCompletedMask,
  isTripEnded,
  isTripStepLocked,
  isTripWizardComplete,
  validateDeliveriesStep,
  validateFarmStep,
  validatePickupStep,
  validateStartStep,
} from "./index";

test("Desktop compatibility facade resolves to the shared validators and calculations", () => {
  assert.equal(desktopTripFacade.validateStartStep, validateStartStep);
  assert.equal(desktopTripFacade.validateFarmStep, validateFarmStep);
  assert.equal(desktopTripFacade.validatePickupStep, validatePickupStep);
  assert.equal(desktopTripFacade.calculatePickupTotals, calculatePickupTotals);
});

test("one shared definition describes the five-step Trip workflow", () => {
  assert.deepEqual(TRIP_STEP_LABELS, ["Start", "Farm", "Pickup", "Deliveries", "End"]);
  assert.equal(TRIP_STEP_DEFINITIONS.length, 5);
  assert.equal(TRIP_STEP_DEFINITIONS[0].fields.includes("vehicleId"), true);
  assert.equal(TRIP_FIELD_DEFINITIONS.vehicleId.required, true);
  assert.equal(TRIP_FIELD_DEFINITIONS.sourceFarmId.optionSource, "farms");
  assert.equal(TRIP_FIELD_DEFINITIONS.dcPhotoKey.required, true);
});

test("shared workflow and validation preserve current Step 1 to Step 5 behavior", () => {
  const trip = createEmptyTrip({ tripDate: "2026-08-16" });
  assert.equal(getNextIncompleteTripStep(trip), 0);
  assert.equal(validateStartStep(trip).valid, false);

  const started = {
    ...trip,
    vehicleId: 1,
    vehicleNo: "AP01AA0001",
    driverId: 2,
    driverName: "Driver",
    supervisorId: 3,
    supervisorName: "Supervisor",
    helpers: ["Helper"],
    loaders: ["Loader"],
    startStepSubmitted: true,
  };
  assert.equal(validateStartStep(started).valid, true);
  assert.equal(getNextIncompleteTripStep(started), 1);
});

test("Step 2 submit validation: address and meter > start; toll 0 valid; GPS not required", () => {
  const farmTrip = {
    ...createEmptyTrip({ tripDate: "2026-08-16" }),
    sourceFarmId: 1,
    sourceFarm: "Farm",
    farmAddress: "Master address",
    destMeter: 50001,
    openingMeter: 50000,
    pickupTolls: 0,
    avgBirdWeight: 2,
  };
  assert.equal(validateFarmStep(farmTrip).valid, true);
  assert.equal(validateFarmStep({ ...farmTrip, destMeter: 49999 }).valid, false);
  assert.equal(validateFarmStep({ ...farmTrip, destMeter: 50000 }).valid, false);
  assert.equal(validateFarmStep({ ...farmTrip, farmAddress: "" }).valid, false);
  assert.equal(validateFarmStep({ ...farmTrip, pickupTolls: 0 }).valid, true);
  assert.equal(getNextIncompleteTripStep({ ...farmTrip, startStepSubmitted: true, farmStepSubmitted: false }), 1);
  assert.equal(getNextIncompleteTripStep({ ...farmTrip, startStepSubmitted: true, farmStepSubmitted: true }), 2);
});

test("Step 1 treats empty KM/Advance as valid and keeps explicit zero", () => {
  const base = createEmptyTrip({
    tripDate: "2026-08-16",
    vehicleId: 1,
    vehicleNo: "AP01AA0001",
    driverId: 2,
    driverName: "Driver",
    supervisorId: 3,
    supervisorName: "Supervisor",
    helpers: ["Helper"],
    loaders: ["Loader"],
    openingMeter: null,
    advanceAmount: null,
  });
  assert.equal(validateStartStep(base).valid, true);

  assert.equal(validateStartStep({ ...base, openingMeter: 0, advanceAmount: 0 }).valid, true);
  assert.equal(validateStartStep({ ...base, openingMeter: -1 }).valid, false);
  assert.equal(validateStartStep({ ...base, advanceAmount: -5 }).valid, false);
});

test("pickup and delivery calculations are shared and deterministic", () => {
  const pickup = calculatePickupTotals([
    { boxNo: 1, birds: 40, weight: 80 },
    { boxNo: 2, birds: 38, weight: 76 },
  ]);
  assert.deepEqual(pickup, { totalBirds: 78, dcWeight: 156, boxes: 2, avgWeight: 2 });

  const trip = createEmptyTrip({ totalBirds: 78, dcWeight: 156, avgWeight: 2 });
  const deliveries = [
    {
      id: 1,
      boxNo: 1,
      shopId: 1,
      shopName: "Shop",
      birdTypeId: 1,
      birdType: "Broiler",
      birds: 77,
      weight: 154,
      mortality: 1,
      rate: null,
      amount: 0,
      remarks: "",
    },
  ];
  assert.equal(validateDeliveriesStep(trip, deliveries).valid, true);
  const calculated = applyDeliveryMetrics(trip, deliveries);
  assert.equal(calculated.totalBirdsDelivered, 77);
  assert.equal(calculated.totalMortalityCount, 1);
  assert.equal(calculated.weightLoss, 0);
});

test("Resume opens the first unsubmitted step; Edit opens the last submitted step", () => {
  const after1 = createEmptyTrip({ startStepSubmitted: true });
  assert.equal(getNextIncompleteTripStep(after1), 1);
  assert.equal(getResumeActionLabel(after1), "Resume — Farm / Step 2");
  assert.equal(getLastSubmittedTripStep(after1), 0);

  const after2 = { ...after1, farmStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(after2), 2);
  assert.equal(getResumeActionLabel(after2), "Resume — Pickup / Step 3");
  assert.equal(getLastSubmittedTripStep(after2), 1);

  const after3 = { ...after2, pickupStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(after3), 3);
  assert.equal(getResumeActionLabel(after3), "Resume — Deliveries / Step 4");
  assert.equal(getLastSubmittedTripStep(after3), 2);

  const after4 = { ...after3, deliveryStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(after4), 4);
  assert.equal(getResumeActionLabel(after4), "Resume — End / Step 5");
  assert.equal(getLastSubmittedTripStep(after4), 3);

  const after5 = { ...after4, endStepSubmitted: true, expensesStepSubmitted: true, status: "Pending" as const };
  assert.equal(getResumeActionLabel(after5), null);
  assert.equal(getLastSubmittedTripStep(after5), 4);
  assert.equal(isTripWizardComplete(after5), true);
  assert.equal(isTripEnded(after5), true);
  assert.equal(isTripEnded(after4), false);
});

test("View stepper mask marks Step 5 submitted only from Step 5 flags", () => {
  const through4 = createEmptyTrip({
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    status: "Pending",
  });
  assert.deepEqual(getTripWizardCompletedMask(through4), {
    start: true,
    farm: true,
    pickup: true,
    delivery: true,
    end: false,
  });

  const complete = { ...through4, endStepSubmitted: true, expensesStepSubmitted: true };
  assert.deepEqual(getTripWizardCompletedMask(complete), {
    start: true,
    farm: true,
    pickup: true,
    delivery: true,
    end: true,
  });
});

test("Sequential step gating: future steps stay locked until the previous step is submitted", () => {
  // New trip: Step 1 available, Steps 2-5 locked.
  const fresh = createEmptyTrip({});
  assert.equal(getMaxAllowedTripStep(fresh), 0);
  assert.equal(isTripStepLocked(fresh, 0), false);
  assert.equal(isTripStepLocked(fresh, 1), true);
  assert.equal(isTripStepLocked(fresh, 2), true);
  assert.equal(isTripStepLocked(fresh, 3), true);
  assert.equal(isTripStepLocked(fresh, 4), true);

  // Step 1 submitted: Step 1 + Step 2 available, Steps 3-5 locked.
  const after1 = { ...fresh, startStepSubmitted: true };
  assert.equal(getMaxAllowedTripStep(after1), 1);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => isTripStepLocked(after1, i)),
    [false, false, true, true, true]
  );

  // Step 2 submitted: Steps 1-3 available, Steps 4-5 locked.
  const after2 = { ...after1, farmStepSubmitted: true };
  assert.equal(getMaxAllowedTripStep(after2), 2);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => isTripStepLocked(after2, i)),
    [false, false, false, true, true]
  );

  // Step 3 submitted: Steps 1-4 available, Step 5 locked.
  const after3 = { ...after2, pickupStepSubmitted: true };
  assert.equal(getMaxAllowedTripStep(after3), 3);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => isTripStepLocked(after3, i)),
    [false, false, false, false, true]
  );

  // Step 4 submitted: Steps 1-5 available.
  const after4 = { ...after3, deliveryStepSubmitted: true };
  assert.equal(getMaxAllowedTripStep(after4), 4);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => isTripStepLocked(after4, i)),
    [false, false, false, false, false]
  );

  // All submitted: all steps viewable.
  const complete = { ...after4, endStepSubmitted: true, expensesStepSubmitted: true };
  assert.equal(getMaxAllowedTripStep(complete), 4);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => isTripStepLocked(complete, i)),
    [false, false, false, false, false]
  );
});

test("Resume always opens the first incomplete step; completed steps stay reopenable", () => {
  const after1 = createEmptyTrip({ startStepSubmitted: true });
  assert.equal(getNextIncompleteTripStep(after1), 1);
  assert.equal(getLastSubmittedTripStep(after1), 0);

  const after2 = { ...after1, farmStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(after2), 2);
  assert.equal(getLastSubmittedTripStep(after2), 1);

  const after3 = { ...after2, pickupStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(after3), 3);
  assert.equal(getLastSubmittedTripStep(after3), 2);

  const after4 = { ...after3, deliveryStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(after4), 4);
  assert.equal(getLastSubmittedTripStep(after4), 3);

  const complete = { ...after4, endStepSubmitted: true, expensesStepSubmitted: true };
  assert.equal(getNextIncompleteTripStep(complete), 4);
  assert.equal(getLastSubmittedTripStep(complete), 4);
});
