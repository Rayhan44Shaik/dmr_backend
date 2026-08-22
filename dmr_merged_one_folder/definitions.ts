import type { Trip } from "./types";

export type TripStepKey = "start" | "farm" | "pickup" | "deliveries" | "expenses";
export type TripFieldKind =
  | "computed"
  | "select"
  | "multi-select"
  | "number"
  | "text"
  | "location"
  | "image"
  | "collection";
export type TripOptionSource =
  | "vehicles"
  | "drivers"
  | "supervisors"
  | "helpers"
  | "loaders"
  | "farms"
  | "shops"
  | "birdTypes";

export type TripFieldKey = keyof Trip | "dieselEntries" | "generalExpenses";

export interface TripFieldDefinition {
  key: TripFieldKey;
  step: TripStepKey;
  label: string;
  kind: TripFieldKind;
  required: boolean;
  optionSource?: TripOptionSource;
  unit?: "KM" | "KG" | "INR" | "count";
  readOnly?: boolean;
}

export const TRIP_FIELD_DEFINITIONS = {
  tripDate: { key: "tripDate", step: "start", label: "Trip Date", kind: "computed", required: true, readOnly: true },
  startTime: { key: "startTime", step: "start", label: "Start Time", kind: "computed", required: false, readOnly: true },
  vehicleId: { key: "vehicleId", step: "start", label: "Vehicle No.", kind: "select", required: true, optionSource: "vehicles" },
  supervisorId: { key: "supervisorId", step: "start", label: "Supervisor", kind: "select", required: true, optionSource: "supervisors" },
  driverId: { key: "driverId", step: "start", label: "Driver", kind: "select", required: true, optionSource: "drivers" },
  openingMeter: { key: "openingMeter", step: "start", label: "Starting Meter (KM)", kind: "number", required: false, unit: "KM" },
  advanceAmount: { key: "advanceAmount", step: "start", label: "Advance / Expenses", kind: "number", required: false, unit: "INR" },
  helpers: { key: "helpers", step: "start", label: "Helpers", kind: "multi-select", required: true, optionSource: "helpers" },
  loaders: { key: "loaders", step: "start", label: "Loaders", kind: "multi-select", required: true, optionSource: "loaders" },

  reachedTime: { key: "reachedTime", step: "farm", label: "Reached Time", kind: "computed", required: true, readOnly: true },
  sourceFarmId: { key: "sourceFarmId", step: "farm", label: "Farm", kind: "select", required: true, optionSource: "farms" },
  farmAddress: { key: "farmAddress", step: "farm", label: "Farm Address", kind: "location", required: true },
  destMeter: { key: "destMeter", step: "farm", label: "Farm / Destination Meter (KM)", kind: "number", required: true, unit: "KM" },
  pickupTolls: { key: "pickupTolls", step: "farm", label: "Tolls", kind: "number", required: false, unit: "count" },
  avgBirdWeight: { key: "avgBirdWeight", step: "farm", label: "Avg Bird Weight (kg)", kind: "number", required: true, unit: "KG" },
  remarks: { key: "remarks", step: "farm", label: "Remarks", kind: "text", required: false },

  dcPhotoKey: { key: "dcPhotoKey", step: "pickup", label: "DC Photo", kind: "image", required: true },
  boxDetails: { key: "boxDetails", step: "pickup", label: "Box Details", kind: "collection", required: true },
  totalBirds: { key: "totalBirds", step: "pickup", label: "Total Birds", kind: "computed", required: true, unit: "count", readOnly: true },
  dcWeight: { key: "dcWeight", step: "pickup", label: "Total DC Weight", kind: "computed", required: true, unit: "KG", readOnly: true },
  boxes: { key: "boxes", step: "pickup", label: "Loaded Boxes", kind: "computed", required: true, unit: "count", readOnly: true },
  avgWeight: { key: "avgWeight", step: "pickup", label: "Average Weight", kind: "computed", required: true, unit: "KG", readOnly: true },

  deliveries: { key: "deliveries", step: "deliveries", label: "Shop Deliveries", kind: "collection", required: true },

  closingMeter: { key: "closingMeter", step: "expenses", label: "End Meter Reading", kind: "number", required: true, unit: "KM" },
  deliveryTolls: { key: "deliveryTolls", step: "expenses", label: "Total Toll Gates (Destination)", kind: "number", required: true, unit: "count" },
  generalExpenses: { key: "generalExpenses", step: "expenses", label: "General Expenses", kind: "collection", required: false },
  dieselEntries: { key: "dieselEntries", step: "expenses", label: "Diesel Expenses", kind: "collection", required: false },
} as const satisfies Record<string, TripFieldDefinition>;

export type TripFieldDefinitionName = keyof typeof TRIP_FIELD_DEFINITIONS;

export interface TripStepDefinition {
  key: TripStepKey;
  index: number;
  label: string;
  title: string;
  submittedFlag:
    | "startStepSubmitted"
    | "farmStepSubmitted"
    | "pickupStepSubmitted"
    | "deliveryStepSubmitted"
    | "endStepSubmitted";
  fields: readonly TripFieldDefinitionName[];
}

export const TRIP_STEP_DEFINITIONS = [
  {
    key: "start",
    index: 0,
    label: "Start",
    title: "Trip Start (At Office)",
    submittedFlag: "startStepSubmitted",
    fields: ["tripDate", "startTime", "vehicleId", "supervisorId", "driverId", "openingMeter", "advanceAmount", "helpers", "loaders"],
  },
  {
    key: "farm",
    index: 1,
    label: "Farm",
    title: "Reached Farm / Destination",
    submittedFlag: "farmStepSubmitted",
    fields: ["reachedTime", "sourceFarmId", "farmAddress", "destMeter", "pickupTolls", "avgBirdWeight", "remarks"],
  },
  {
    key: "pickup",
    index: 2,
    label: "Pickup",
    title: "Pickup KPI",
    submittedFlag: "pickupStepSubmitted",
    fields: ["dcPhotoKey", "boxDetails", "totalBirds", "dcWeight", "boxes", "avgWeight"],
  },
  {
    key: "deliveries",
    index: 3,
    label: "Deliveries",
    title: "Shop Deliveries",
    submittedFlag: "deliveryStepSubmitted",
    fields: ["deliveries"],
  },
  {
    key: "expenses",
    index: 4,
    label: "End",
    title: "Expenses Sheet",
    submittedFlag: "endStepSubmitted",
    fields: ["closingMeter", "deliveryTolls", "generalExpenses", "dieselEntries", "remarks"],
  },
] as const satisfies readonly TripStepDefinition[];

export function getTripFieldDefinition(name: TripFieldDefinitionName): TripFieldDefinition {
  return TRIP_FIELD_DEFINITIONS[name];
}
