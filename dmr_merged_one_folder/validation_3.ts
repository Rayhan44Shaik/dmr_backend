import { TRIP_FIELD_DEFINITIONS, type TripFieldDefinitionName } from "./definitions";
import type { ShopDelivery, Trip } from "./types";

export interface TripValidationResult {
  valid: boolean;
  errors: string[];
}

function result(errors: string[]): TripValidationResult {
  return { valid: errors.length === 0, errors };
}

function required(field: TripFieldDefinitionName): boolean {
  return TRIP_FIELD_DEFINITIONS[field].required;
}

export function validateStartStep(trip: Trip): TripValidationResult {
  const errors: string[] = [];
  if (required("tripDate") && !trip.tripDate) errors.push("Trip Date is required.");
  if (required("vehicleId") && (!trip.vehicleId || !trip.vehicleNo)) {
    errors.push("Please select a Vehicle.");
  }
  if (required("driverId") && (!trip.driverId || !trip.driverName)) {
    errors.push("Please select a Driver.");
  }
  if (required("supervisorId") && (!trip.supervisorId || !trip.supervisorName)) {
    errors.push("Please select a Supervisor.");
  }
  if (required("helpers") && !trip.helpers?.length) {
    errors.push("Please add at least one Helper.");
  }
  if (required("loaders") && !trip.loaders?.length) {
    errors.push("Please add at least one Loader.");
  }
  if (required("openingMeter") && (trip.openingMeter == null || Number.isNaN(trip.openingMeter))) {
    errors.push("Valid Opening Meter reading is required.");
  } else if (
    trip.openingMeter != null &&
    (Number.isNaN(Number(trip.openingMeter)) || Number(trip.openingMeter) < 0)
  ) {
    errors.push("Opening Meter must be a valid non-negative number.");
  }
  if (
    required("advanceAmount") && (
      trip.advanceAmount == null ||
      Number.isNaN(trip.advanceAmount) ||
      trip.advanceAmount < 0
    )
  ) {
    errors.push("Valid Advance amount is required.");
  } else if (
    trip.advanceAmount != null &&
    (Number.isNaN(Number(trip.advanceAmount)) || Number(trip.advanceAmount) < 0)
  ) {
    errors.push("Advance must be a valid non-negative number.");
  }
  return result(errors);
}

export function validateFarmStep(trip: Trip): TripValidationResult {
  const errors: string[] = [];
  if (required("sourceFarmId") && (!trip.sourceFarmId || !trip.sourceFarm)) {
    errors.push("Please select a Farm.");
  }
  if (required("farmAddress") && !String(trip.farmAddress ?? "").trim()) {
    errors.push("Farm address is required.");
  }
  if (required("destMeter") && (!trip.destMeter || trip.destMeter <= 0)) {
    errors.push("Valid Farm Meter reading is required.");
  }
  const startMeter = trip.openingMeter;
  if (trip.destMeter != null && startMeter != null && trip.destMeter <= startMeter) {
    errors.push(
      `Farm meter (${trip.destMeter} KM) must be strictly greater than the Step 1 starting meter (${startMeter} KM).`
    );
  }
  const tolls = Number(trip.pickupTolls ?? 0);
  if (Number.isNaN(tolls) || tolls < 0) {
    errors.push("Tolls cannot be negative.");
  }
  if (required("avgBirdWeight") && (!trip.avgBirdWeight || trip.avgBirdWeight <= 0)) {
    errors.push("Please enter a valid Average Bird Weight.");
  }
  return result(errors);
}

export function validatePickupStep(trip: Trip): TripValidationResult {
  const errors: string[] = [];
  const photos = [trip.dcPhotoData, trip.dcPhotoData2].filter(
    (d) => typeof d === "string" && d.startsWith("data:image/")
  );
  if (photos.length < 1) errors.push("Please upload at least one pickup photo.");
  if (photos.length > 2) errors.push("A maximum of 2 photos is allowed.");
  const boxes = trip.boxDetails || [];
  if (!boxes.length) errors.push("At least one complete box is required.");
  const nos = boxes.map((b) => Number(b.boxNo));
  for (let i = 0; i < nos.length; i++) {
    if (!Number.isInteger(nos[i]) || nos[i] !== i + 1) {
      errors.push("Box numbers must be sequential (1, 2, 3…).");
      break;
    }
  }
  for (const box of boxes) {
    if (!Number.isInteger(Number(box.birds)) || Number(box.birds) <= 0) {
      errors.push(`Box ${box.boxNo} birds must be a valid positive whole number.`);
      break;
    }
    if (!Number.isFinite(Number(box.weight)) || Number(box.weight) <= 0) {
      errors.push(`Box ${box.boxNo} weight must be a valid positive number.`);
      break;
    }
  }
  const cap = Number(trip.vehicleBoxCapacity || 0);
  if (cap > 0 && boxes.length > cap) {
    errors.push(`Vehicle box capacity exceeded. Maximum boxes for this vehicle: ${cap}.`);
  }
  return result(errors);
}

export const DELIVERY_WEIGHT_TOLERANCE_KG = 0.05;

/**
 * Step 4 balance summary. Bird counts are birds-only; mortality weight (kg)
 * never participates in the bird equation. Weight is reconciled independently:
 * farmWeight = deliveredWeight + mortalityWeight + weightLoss (existing
 * project definition of weight loss, checked within the accepted tolerance).
 */
export type DeliveriesBalanceError = {
  birds?: {
    pickup: number;
    delivered: number;
    mortality: number;
  };
  weight?: {
    farm: number;
    delivered: number;
    mortalityWeight: number;
    loss: number;
    expected: number;
  };
} | null;

export function getDeliveriesBalanceError(
  trip: Pick<Trip, "dcWeight" | "totalBirds">,
  rows: ShopDelivery[],
  weightToleranceKg = DELIVERY_WEIGHT_TOLERANCE_KG
): DeliveriesBalanceError {
  const pickupBirds = Number(trip.totalBirds || 0);
  const pickupWeight = Number(trip.dcWeight || 0);
  const totalMortalityCount = rows.reduce((sum, row) => sum + Number(row.mortality || 0), 0);
  const totalBirdsDelivered = rows.reduce((sum, row) => sum + Number(row.birds || 0), 0);
  const totalDeliveredWeight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  const mortalityWeight = rows.reduce((sum, row) => sum + Number(row.mortKg || 0), 0);

  const error: NonNullable<DeliveriesBalanceError> = {};

  if (pickupBirds > 0 && totalBirdsDelivered + totalMortalityCount !== pickupBirds) {
    error.birds = {
      pickup: pickupBirds,
      delivered: totalBirdsDelivered,
      mortality: totalMortalityCount,
    };
  }

  if (pickupWeight > 0) {
    const loss = Number((pickupWeight - totalDeliveredWeight - mortalityWeight).toFixed(2));
    const expected = Number((totalDeliveredWeight + mortalityWeight + Math.max(0, loss)).toFixed(2));
    if (loss < -weightToleranceKg) {
      error.weight = {
        farm: pickupWeight,
        delivered: Number(totalDeliveredWeight.toFixed(2)),
        mortalityWeight: Number(mortalityWeight.toFixed(2)),
        loss: Math.max(0, loss),
        expected,
      };
    }
  }

  return Object.keys(error).length > 0 ? error : null;
}

export function validateDeliveriesStep(
  trip: Pick<Trip, "dcWeight" | "totalBirds">,
  rows: ShopDelivery[],
  weightToleranceKg = DELIVERY_WEIGHT_TOLERANCE_KG
): TripValidationResult {
  if (required("deliveries") && !rows.length) {
    return result(["Please add at least one shop delivery."]);
  }
  const balanceError = getDeliveriesBalanceError(trip, rows, weightToleranceKg);
  if (balanceError?.birds) {
    const { pickup, delivered, mortality } = balanceError.birds;
    return result([
      `Bird count mismatch: Pickup (${pickup}) must equal Delivered (${delivered}) + Mortality (${mortality}) = ${delivered + mortality}.`,
    ]);
  }
  if (balanceError?.weight) {
    const { farm, delivered, mortalityWeight, loss, expected } = balanceError.weight;
    return result([
      `Weight mismatch: Delivered (${delivered.toFixed(2)} Kg) + Mortality (${mortalityWeight.toFixed(2)} Kg) + Loss (${loss.toFixed(2)} Kg) = ${expected.toFixed(2)} Kg but Farm weight is ${farm.toFixed(2)} Kg.`,
    ]);
  }
  return result([]);
}

export function validateEndStep(trip: Trip): TripValidationResult {
  const errors: string[] = [];
  if (required("closingMeter") && (!trip.closingMeter || trip.closingMeter <= 0)) {
    errors.push("Valid End Meter reading is required.");
  }
  if (trip.closingMeter <= trip.destMeter && trip.destMeter > 0) {
    errors.push("Closing Meter cannot be less than the Destination Meter.");
  }
  if (required("deliveryTolls")) {
    const tolls = Number(trip.deliveryTolls ?? trip.destinationTolls);
    if (!Number.isFinite(tolls) || tolls < 0) {
      errors.push("Please enter the number of tolls crossed on the delivery route (0 or greater).");
    }
  }
  return result(errors);
}

export function validateFinalTrip(trip: Trip): TripValidationResult {
  const errors: string[] = [];
  const expectedBirds = trip.totalBirdsDelivered + trip.totalMortality;
  if (trip.totalBirds !== expectedBirds) {
    errors.push(
      `Bird Count Mismatch: Trip Birds (${trip.totalBirds}) must equal Delivered (${trip.totalBirdsDelivered}) + Mortality (${trip.totalMortality}) = ${expectedBirds}.`
    );
  }
  const mortalityWeight = trip.totalMortality * trip.avgWeight;
  const loss = trip.dcWeight - trip.totalDeliveredWeight - mortalityWeight;
  if (loss < 0) {
    errors.push(
      `Weight Mismatch: Delivered Weight + Mortality Weight exceeds DC Weight by ${Math.abs(loss).toFixed(2)} Kg.`
    );
  }
  if (trip.closingMeter <= trip.destMeter && trip.destMeter > 0) {
    errors.push("KM Logic Error: Closing Meter must be greater than Destination Meter.");
  }
  return result(errors);
}

export function validateTrip(trip: Trip): TripValidationResult {
  const errors: string[] = [];
  if (!trip.tripDate) errors.push("Trip Date is required.");
  if (!trip.vehicleId) errors.push("Please select Vehicle.");
  if (!trip.driverId) errors.push("Please select Driver.");
  if (!trip.supervisorId) errors.push("Please select Supervisor.");
  if (!trip.sourceFarmId) errors.push("Please select Source Farm.");
  if (!trip.deliveries.length) errors.push("Please add at least one Shop.");
  trip.deliveries.forEach((row, index) => {
    const prefix = `Row ${index + 1}:`;
    if (!row.boxNo || row.boxNo <= 0) errors.push(`${prefix} Box No is required.`);
    if (!row.shopId) errors.push(`${prefix} Select Shop.`);
    if (!row.birdTypeId) errors.push(`${prefix} Select Bird Type.`);
    if (!row.birds || row.birds <= 0) errors.push(`${prefix} Enter No. of Birds.`);
    if (!row.weight || row.weight <= 0) errors.push(`${prefix} Enter Weight.`);
    if (row.mortality < 0) errors.push(`${prefix} Invalid Mortality.`);
  });
  return result(errors);
}
