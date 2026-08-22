import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMobileOperation,
  compactSyncedOperations,
  loadMobileOperations,
  newMobileOperationId,
  updateMobileOperation,
} from "./mobileTripStorage";

function operation(ownerKey: string) {
  return {
    operationId: newMobileOperationId(),
    clientDraftId: newMobileOperationId(),
    tripId: null,
    step: "start" as const,
    mode: "submit" as const,
    expectedVersion: null,
    payload: { status: "Draft" as const, vehicleId: 1 },
    ownerKey,
  };
}

test("duplicate button delivery of one operation ID creates one durable queue row", async () => {
  const input = operation(`duplicate-${newMobileOperationId()}`);
  await Promise.all([
    appendMobileOperation(input.ownerKey, input),
    appendMobileOperation(input.ownerKey, input),
  ]);
  const queue = await loadMobileOperations(input.ownerKey);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].operationId, input.operationId);
  assert.equal(queue[0].status, "PENDING");
});

test("an app kill during SYNCING recovers the operation as retryable PENDING", async () => {
  const input = operation(`crash-${newMobileOperationId()}`);
  await appendMobileOperation(input.ownerKey, input);
  await updateMobileOperation(input.ownerKey, input.operationId, {
    status: "SYNCING",
    attempts: 1,
  });
  const recovered = await loadMobileOperations(input.ownerKey);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].status, "PENDING");
  assert.equal(recovered[0].attempts, 1);
  assert.equal(recovered[0].errorCode, "INTERRUPTED");
});

test("queue compaction happens only after a durable SYNCED acknowledgement", async () => {
  const input = operation(`ack-${newMobileOperationId()}`);
  await appendMobileOperation(input.ownerKey, input);
  await compactSyncedOperations(input.ownerKey);
  assert.equal((await loadMobileOperations(input.ownerKey)).length, 1);

  await updateMobileOperation(input.ownerKey, input.operationId, {
    status: "SYNCED",
    acknowledgement: {
      tripId: 100,
      tripNo: "TRP-20260816-001",
      status: "Draft",
      version: 1,
      updatedAt: "2026-08-16T01:00:00.000Z",
      serverTime: "2026-08-16T01:00:00.000Z",
    },
  });
  await compactSyncedOperations(input.ownerKey);
  assert.equal((await loadMobileOperations(input.ownerKey)).length, 0);
});
