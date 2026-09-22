import assert from "node:assert/strict";
import { test } from "node:test";
import {
  employeeSchema,
  birdTypeSchema,
  masterIdSchema,
  resolveMasterLocation,
  shopSchema,
  vehicleSchema,
} from "../src/validation/masters.js";
import { validateBulkRows } from "../src/validation/mastersBulk.js";

test("Masters params reject non-positive and non-numeric ids", () => {
  assert.equal(masterIdSchema.safeParse({ id: "1" }).success, true);
  assert.equal(masterIdSchema.safeParse({ id: "0" }).success, false);
  assert.equal(masterIdSchema.safeParse({ id: "abc" }).success, false);
});

test("Others master validates Bird and Fuel Bunk category-specific fields", () => {
  assert.equal(birdTypeSchema.safeParse({ birdType: "Broiler", category: "Bird", averageWeight: 2.2 }).success, true);
  assert.equal(birdTypeSchema.safeParse({ birdType: "Fuel One", category: "Fuel Bunk", averageWeight: 0 }).success, false);
  assert.equal(birdTypeSchema.safeParse({
    birdType: "Fuel One", category: "Fuel Bunk", averageWeight: 0,
    ownerName: "Owner", mobileNumber: "9876543210", address: "Main Road",
    latitude: 16.5, longitude: 80.6,
  }).success, true);
  assert.equal(birdTypeSchema.safeParse({
    birdType: "Fuel Two", category: "Fuel Bunk", averageWeight: 0,
    ownerName: "Owner", mobileNumber: "919876543210", address: "Main Road",
    latitude: 16.5, longitude: 80.6,
  }).success, false);
});

test("employee validation rejects malformed identity and contact fields", () => {
  const result = employeeSchema.safeParse({
    employeeName: "Driver One",
    department: "Transport",
    phoneNumber: "123",
    salary: -1,
  });
  assert.equal(result.success, false);
});

test("vehicle validation enforces capacities, dates, and EMI bounds", () => {
  const result = vehicleSchema.safeParse({
    vehicleNumber: "AP 01 AB 1234",
    vehicleType: "Truck",
    noOfBoxes: 0,
    birdCapacity: 100,
    capacityKg: 500,
    engineNumber: "ENG-1",
    chassisNumber: "CH-1",
    insuranceExpiry: "not-a-date",
    emiDay: 32,
  });
  assert.equal(result.success, false);
});

test("vehicle validation rejects impossible calendar dates and fractional EMI terms", () => {
  const base = {
    vehicleNumber: "AP 01 AB 1234",
    vehicleType: "Truck",
    noOfBoxes: 50,
    birdCapacity: 2000,
    capacityKg: 5000,
    engineNumber: "ENG-1",
    chassisNumber: "CH-1",
  };
  assert.equal(vehicleSchema.safeParse({ ...base, purchaseDate: "2026-02-30" }).success, false);
  assert.equal(vehicleSchema.safeParse({ ...base, totalEMIs: 12.5 }).success, false);
  assert.equal(vehicleSchema.safeParse({ ...base, totalEMIs: 1201 }).success, false);
});

test("shop validation accepts the complete API contract including WhatsApp", () => {
  const result = shopSchema.safeParse({
    shopNumber: "S-10",
    shopName: "Central Chicken",
    ownerName: "Shop Owner",
    phoneNumber: "9876543210",
    secondaryPhoneNumber: "",
    whatsappNumber: "9876543211",
    email: "owner@example.com",
    city: "Hyderabad",
    address: "Market Road",
    latitude: 17.385,
    longitude: 78.4867,
    paperRate: 2,
    associationType: "Vencob Vij",
    openingBalance: 0,
  });
  assert.equal(result.success, true);
});

test("location resolver accepts coordinates but never resolves arbitrary URLs", () => {
  assert.deepEqual(resolveMasterLocation("17.385,78.4867"), {
    latitude: 17.385,
    longitude: 78.4867,
    address: null,
    placeName: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=17.385,78.4867",
    precision: "pin",
  });
  assert.throws(() => resolveMasterLocation("https://example.com/redirect"));
});

test("location resolver prefers the place pin over the viewport centre", () => {
  const url =
    "https://www.google.com/maps/place/Hindustan+Petroleum+Corporation+Limited/" +
    "@16.6930784,80.3538467,15z/data=!4m10!1m2!2m1!1spetrol+bunk+in+kanchikacherla" +
    "+andhra+pradesh!3m6!1s0x3a35be04442b7027:0xc4eb6e86288ca144" +
    "!8m2!3d16.6930784!4d80.3729011!15sCixwZXRyb2wgYnVuayBpbiBrYW5jaGlrYWNoZXJsYSBhbmRocmEgcHJhZGVzaJIBC2dhc19zdGF0aW9u4AEA!16s%2Fg%2F11bx1z4yln?entry=ttu";
  const resolved = resolveMasterLocation(url);
  // Exact pin (80.3729011), not the viewport middle (80.3538467).
  assert.equal(resolved.latitude, 16.6930784);
  assert.equal(resolved.longitude, 80.3729011);
  assert.equal(resolved.placeName, "Hindustan Petroleum Corporation Limited");
  assert.equal(resolved.precision, "pin");
  assert.ok(resolved.mapsUrl?.includes("16.6930784,80.3729011"));
});

test("bulk validation is bounded and reports invalid rows atomically", () => {
  assert.throws(
    () => validateBulkRows("shops", Array.from({ length: 1001 }, () => ({}))),
    (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === 413,
  );
  assert.throws(() => validateBulkRows("shops", [{ shopName: "x" }]));
});
