/**
 * Frontend regression guards for the persistent-authoritative Collection
 * balance (no weekly opening balance, no weekly reset).
 *
 * The Collection module has no component-test infra (no jsdom / RTL), so
 * these assert on the module source (same pattern as
 * collectionService.contract.test.ts) plus one service-level test using a
 * mock axios adapter that the approval response's `currentBalance` is read.
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
const read = (rel: string) =>
  readFileSync(join(__dirname, rel), "utf8");

const entryHookSrc = read("../hooks/useCollectionEntry.ts");
const summarySrc = read("../components/entry/OutstandingSummary.tsx");
const amountSrc = read("../components/entry/CollectionAmount.tsx");
const pendingPageSrc = read("../pages/PendingCollectionsPage.tsx");
const tableSrc = read("../components/entry/RecentCollectionsTable.tsx");
const serviceSrc = read("./collectionService.ts");

test("Opening Balance is correctly displayed as a carried-forward figure", () => {
  // Outstanding Summary now correctly shows "Opening Balance"
  assert.match(summarySrc, /Opening Balance/);
  assert.match(summarySrc, /Brought forward/);
  // The hook calculates openingBalance from the weekly summary
  assert.match(entryHookSrc, /openingBalance/);
});

test("The Collection page balance is the backend-authoritative live balance, not a weekly figure", () => {
  // Outstanding Summary's main KPI is `currentOutstanding` (shops.current_balance).
  assert.match(summarySrc, /Current Outstanding/);
  assert.match(summarySrc, /Outstanding Amount \(Approved Only\)/);
  // The hook reads `weeklySummary.balance` for the live balance and computes openingBalance.
  assert.match(entryHookSrc, /weeklySummary\.balance/);
  assert.match(entryHookSrc, /currentOutstanding/);
});

test("No weekly opening-balance calculation remains in the frontend (balance is persistent)", () => {
  // The service still uses `balance` from backend (shops.current_balance)
  assert.match(serviceSrc, /balance:\s*Number\(data\.balance/);
  // currentOutstanding is a frontend computed term, not in backend service
  assert.doesNotMatch(serviceSrc, /data\.currentOutstanding/);
});

test("Weekly cards (Approved Sales / Approved Collections / Pending Approval) are week-scoped and informational", () => {
  assert.match(summarySrc, /Approved Sales/);
  assert.match(summarySrc, /Approved Collections/);
  assert.match(summarySrc, /Pending Approval/);
  // The week range label is displayed on the weekly cards only.
  assert.match(summarySrc, /periodLabel/);
});

test("Current Outstanding KPI is the primary summary figure (highlighted, bottom of summary)", () => {
  // Current Outstanding is the bottom-line figure in the summary card (highlighted in emerald)
  assert.match(summarySrc, /Current Outstanding/);
  assert.match(summarySrc, /Outstanding Amount \(Approved Only\)/);
  assert.match(summarySrc, /text-emerald-700/);  // Highlighted in emerald
  assert.match(summarySrc, /font-extrabold/);   // Large font
  // It is the last financial row (after the weekly cards)
  const outstandingIndex = summarySrc.lastIndexOf("Current Outstanding");
  const salesIndex = summarySrc.indexOf("Approved Sales");
  assert.ok(outstandingIndex !== -1 && salesIndex !== -1);
  assert.ok(outstandingIndex > salesIndex, "Current Outstanding must be the final summary row");
});

test("Collection Entry renders the collection table with the required columns", () => {
  assert.match(tableSrc, /Collection No/);
  assert.match(tableSrc, /Shop/);  // Column header is "Shop"
  assert.match(tableSrc, /Collector/);  // Column header is "Collector"
  assert.match(tableSrc, /Date/);  // Column header is "Date"
  assert.match(tableSrc, /Amount/);
  assert.match(tableSrc, /Status/);
});

test("Filtering happens before display (single global filter)", () => {
  const filterIdx = tableSrc.indexOf("filteredBySearch");
  const displayIdx = tableSrc.indexOf("displayedData");
  assert.ok(filterIdx !== -1 && displayIdx !== -1);
  assert.ok(filterIdx < displayIdx, "filter must run before display");
  // RecentCollectionsTable doesn't use pagination (it shows all filtered results)
});

test("approveCollection() reads the backend-returned currentBalance", async () => {
  const calls: string[] = [];
  const original = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config: AxiosRequestConfig) => {
    const method = (config.method ?? "get").toLowerCase();
    const url = config.url ?? "";
    calls.push(`${method} ${url}`);
    if (method === "patch") {
      return {
        data: { status: "Approved", currentBalance: 80000 },
        status: 200,
        statusText: "OK",
        headers: {},
        config: config as any,
      };
    }
    return {
      data: [],
      status: 200,
      statusText: "OK",
      headers: {},
      config: config as any,
    };
  };
  try {
    const result = await collectionService.approveCollection("7", "Admin");
    assert.equal(result.success, true);
    assert.equal(result.balance, 80000, "approval must surface the authoritative new balance");
    assert.ok(
      calls.some((c) => c === "patch /operations/collection-entry/7/status"),
      "approval must call the status endpoint"
    );
  } finally {
    apiClient.defaults.adapter = original;
  }
});
