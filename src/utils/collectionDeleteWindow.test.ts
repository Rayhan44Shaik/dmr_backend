import test from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_APPROVED_DELETE_WINDOW_DAYS,
  collectionApprovedDeleteExpiresAt,
  isCollectionApprovedDeleteWindowOpen,
} from "./collectionDeleteWindow.js";

test("approved collections stay deletable for 14 days from approval", () => {
  assert.equal(COLLECTION_APPROVED_DELETE_WINDOW_DAYS, 14);
});

test("the window is counted from approval time, not the collection date", () => {
  const approvedAt = new Date("2026-09-01T12:00:00.000Z");
  const expires = collectionApprovedDeleteExpiresAt(approvedAt);
  assert.equal(expires?.toISOString(), "2026-09-15T12:00:00.000Z");
});

test("exactly 14 days after approval the window is closed", () => {
  const approvedAt = "2026-09-01T12:00:00.000Z";
  const now = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(isCollectionApprovedDeleteWindowOpen(approvedAt, now), false);
});

test("one second under 14 days the window is still open", () => {
  const approvedAt = "2026-09-01T12:00:00.000Z";
  const now = new Date("2026-09-15T11:59:59.000Z");
  assert.equal(isCollectionApprovedDeleteWindowOpen(approvedAt, now), true);
});

test("a missing approval stamp is not deletable", () => {
  assert.equal(isCollectionApprovedDeleteWindowOpen(null), false);
  assert.equal(isCollectionApprovedDeleteWindowOpen(""), false);
});
