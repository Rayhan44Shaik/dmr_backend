import assert from "node:assert/strict";
import { test } from "node:test";
import {
  employeeSchema,
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
  });
  assert.throws(() => resolveMasterLocation("https://example.com/redirect"));
});

test("bulk validation is bounded and reports invalid rows atomically", () => {
  assert.throws(
    () => validateBulkRows("shops", Array.from({ length: 1001 }, () => ({}))),
    (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === 413,
  );
  assert.throws(() => validateBulkRows("shops", [{ shopName: "x" }]));
});
