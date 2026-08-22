/**
 * API contract regression tests for Collection Entry vs. Pending Collection
 * delete endpoints.
 *
 * Context: Pending Collection was found calling the wrong backend route
 * (DELETE /collection-entry/:id, the unrestricted Collection Entry delete)
 * instead of its own gated route (DELETE /collection-entry/pending/:id).
 * That mistake silently defeated the backend's 7-day deletion window for
 * real users. These tests pin the exact URL each service function calls,
 * using a mock axios adapter (no network/server required), so a future
 * change cannot reintroduce the mix-up without failing CI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { AxiosRequestConfig } from "axios";
import { apiClient } from "../../../../api/client";
import { collectionService } from "./collectionService";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RecordedCall {
  method: string;
  url: string;
}

function installMockAdapter(): { calls: RecordedCall[]; restore: () => void } {
  const calls: RecordedCall[] = [];
  const original = apiClient.defaults.adapter;

  apiClient.defaults.adapter = async (config: AxiosRequestConfig) => {
    const method = (config.method ?? "get").toLowerCase();
    const url = config.url ?? "";
    calls.push({ method, url });

    // GET requests are only hit here because deletePendingCollection() and
    // deleteCollection() both call refreshFromBackend() on success, which
    // fans out to /collection-entry, /shop-sales, and /masters/shops. Return
    // empty collections so the cache rebuild has nothing to choke on.
    if (method === "get") {
      return {
        data: [],
        status: 200,
        statusText: "OK",
        headers: {},
        config: config as any,
      };
    }

    // DELETE (and anything else exercised here) succeeds with an empty body.
    return {
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config: config as any,
    };
  };

  return {
    calls,
    restore: () => {
      apiClient.defaults.adapter = original;
    },
  };
}

test("deletePendingCollection() calls DELETE /operations/collection-entry/pending/:id", async () => {
  const { calls, restore } = installMockAdapter();
  try {
    const result = await collectionService.deletePendingCollection("42");
    assert.equal(result.success, true);
    const deleteCalls = calls.filter((c) => c.method === "delete");
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0].url, "/operations/collection-entry/pending/42");
  } finally {
    restore();
  }
});

test("deleteCollection() (Collection Entry) calls DELETE /operations/collection-entry/:id — no /pending segment", async () => {
  const { calls, restore } = installMockAdapter();
  try {
    const success = await collectionService.deleteCollection("42");
    assert.equal(success, true);
    const deleteCalls = calls.filter((c) => c.method === "delete");
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0].url, "/operations/collection-entry/42");
    assert.equal(deleteCalls[0].url.includes("/pending/"), false);
  } finally {
    restore();
  }
});

test("Collection Entry delete and Pending Collection delete are NOT the same endpoint", async () => {
  const { calls, restore } = installMockAdapter();
  try {
    await collectionService.deleteCollection("7");
    await collectionService.deletePendingCollection("7");
    const deleteUrls = calls.filter((c) => c.method === "delete").map((c) => c.url);
    assert.equal(deleteUrls.length, 2);
    assert.notEqual(deleteUrls[0], deleteUrls[1]);
  } finally {
    restore();
  }
});

test("fetchRecentCollectionsForShop() calls GET /operations/collection-entry/recent (the endpoint that returns canDelete)", async () => {
  const { calls, restore } = installMockAdapter();
  try {
    await collectionService.fetchRecentCollectionsForShop(5, 10);
    const getCalls = calls.filter((c) => c.method === "get");
    assert.equal(getCalls.length, 1);
    assert.equal(getCalls[0].url, "/operations/collection-entry/recent");
  } finally {
    restore();
  }
});

/**
 * Source-level regression guards.
 *
 * Pending Collection has no component-test infrastructure in this repo
 * (no jsdom/React Testing Library dependency), so these assert directly on
 * the page/table source to lock in the P0/P1 fixes at the wiring level:
 * no reachable Edit action, no client-side day-count eligibility calc, and
 * the delete handler is wired to the pending-specific service call.
 */
const pendingPageSrc = readFileSync(
  join(__dirname, "../pages/PendingCollectionsPage.tsx"),
  "utf8"
);
const pendingTableSrc = readFileSync(
  join(__dirname, "../components/pending/PendingTable.tsx"),
  "utf8"
);

test("PendingCollectionsPage wires delete to deletePendingCollection(), not deleteCollection()", () => {
  assert.match(pendingPageSrc, /collectionService\.deletePendingCollection\(/);
});

test("PendingCollectionsPage has no client-side 10-day (or any hardcoded day-count) eligibility calculation", () => {
  assert.doesNotMatch(pendingPageSrc, /isCollectionEditable/);
  assert.doesNotMatch(pendingPageSrc, /diffDays\s*>\s*10/);
  assert.doesNotMatch(pendingPageSrc, /canEditCollection/);
});

test("PendingCollectionsPage reads backend-authoritative canDelete instead", () => {
  assert.match(pendingPageSrc, /canDelete/);
});

test("PendingCollectionsPage no longer opens the modal in edit mode", () => {
  assert.doesNotMatch(pendingPageSrc, /mode=\{editMode\}/);
  assert.doesNotMatch(pendingPageSrc, /handleEdit/);
});

test("PendingTable has no reachable Edit/Pencil action", () => {
  assert.doesNotMatch(pendingTableSrc, /onEdit/);
  assert.doesNotMatch(pendingTableSrc, /Pencil/);
});

/**
 * P1-3 financial-authority regression tests.
 *
 * Context: the Pending Collection main table/view and the Collection Report
 * page independently recomputed weekly sales, approved collections, and
 * recovery % from raw/lifetime data instead of reading the backend's
 * GET .../pending-summary and GET .../report responses. These tests pin
 * the actual endpoint URLs called and forbid the specific duplicate-formula
 * patterns (`x / y * 100`) from reappearing in the financial-authority path.
 */

test("fetchPendingSummary() calls GET /operations/collection-entry/pending-summary", async () => {
  const { calls, restore } = installMockAdapter();
  try {
    await collectionService.fetchPendingSummary("2026-08-18");
    const getCalls = calls.filter((c) => c.method === "get");
    assert.equal(getCalls.length, 1);
    assert.equal(getCalls[0].url, "/operations/collection-entry/pending-summary");
  } finally {
    restore();
  }
});

test("fetchCollectionReport() calls GET /operations/collection-entry/report", async () => {
  const { calls, restore } = installMockAdapter();
  try {
    await collectionService.fetchCollectionReport({ fromDate: "2026-08-10", toDate: "2026-08-16" });
    const getCalls = calls.filter((c) => c.method === "get");
    assert.equal(getCalls.length, 1);
    assert.equal(getCalls[0].url, "/operations/collection-entry/report");
  } finally {
    restore();
  }
});

const collectionReportPageSrc = readFileSync(
  join(__dirname, "../pages/CollectionReportPage.tsx"),
  "utf8"
);

test("PendingCollectionsPage main table sources balance/sales/approved/recovery from pending-summary, not weekly-summaries", () => {
  assert.match(pendingPageSrc, /collectionService\.fetchPendingSummary\(/);
  assert.doesNotMatch(pendingPageSrc, /fetchWeeklySummaries\(/);
});

test("PendingCollectionsPage's primary figures use backend recoveryPercentage (not recomputed from raw collections)", () => {
  // The page uses per-shop recoveryPercentage from pending-summary (backend-authoritative)
  assert.match(pendingPageSrc, /shop\.recoveryPercentage/);
  // It does NOT compute recovery from raw collection rows (collections / sales * 100)
  assert.doesNotMatch(pendingPageSrc, /collections \/ sales\) \* 100/);
  assert.doesNotMatch(pendingPageSrc, /weeklyCollections \/ weeklyStats\.weeklySales/);
  // The totals use backend-aggregated figures
  assert.match(pendingPageSrc, /totalWeeklySales/);
  assert.match(pendingPageSrc, /totalWeeklyCollections/);
  assert.match(pendingPageSrc, /totalOutstanding/);
});

test("PendingTable renders recovery/balance from the pending-summary row, not a local ratio calculation", () => {
  assert.match(pendingTableSrc, /shop\.recoveryPercentage/);
  assert.match(pendingTableSrc, /shop\.balance/);
  assert.match(pendingTableSrc, /shop\.weeklySales/);
  assert.match(pendingTableSrc, /shop\.weeklyApprovedCollections/);
  assert.doesNotMatch(pendingTableSrc, /periodCollections/);
  assert.doesNotMatch(pendingTableSrc, /periodSales/);
  assert.doesNotMatch(pendingTableSrc, /\/ sales\) \* 100/);
});

test("Pending table is sourced from pending-summary shops, not lifetime buildPending totals", () => {
  assert.match(pendingPageSrc, /payload\.shops/);
  assert.doesNotMatch(pendingPageSrc, /getPendingCollections\(\)/);
  assert.doesNotMatch(pendingPageSrc, /shop\.totalSales/);
  assert.doesNotMatch(pendingPageSrc, /shop\.totalCollections/);
});

test("CollectionReportPage sources totals from fetchCollectionReport(), not a client-side reduce over raw collections", () => {
  assert.match(collectionReportPageSrc, /collectionService\.fetchCollectionReport\(/);
  // The old violation: summing raw collection rows for the "official" total.
  assert.doesNotMatch(collectionReportPageSrc, /filteredData\.reduce\(\(sum, c\) => sum \+ c\.amount/);
});

test("CollectionReportPage payment-mode/collector percentages are not independently recomputed from raw rows", () => {
  // The old violation: (data.amount / total) * 100 computed from a client-built map of raw rows.
  assert.doesNotMatch(collectionReportPageSrc, /data\.amount\s*\/\s*total\)\s*\*\s*100/);
});
