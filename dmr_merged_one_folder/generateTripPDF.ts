// src/modules/operations/vehicle-trips/utils/generateTripPDF.ts
//
// DMR POULTRIES — Professional A4 (portrait) Trip Report PDF.
// Follows the same 5-step structure as the Trip View wizard and reuses the
// existing persisted values (no recalculation). Shop deliveries flow onto
// additional A4 pages automatically without cutting rows.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Trip, ShopDelivery } from "../types/trip";
import henImage from "../../../../assets/dmr-hen.jpg";
import {
  drawPreparedDmrPoultryHeader,
  prepareDmrPoultryHeaderAssets,
  type DmrPoultryHeaderAssets,
} from "../../../../utils/drawDmrPoultryHeader";
import {
  calculateDeliveryDisplayTotals,
  calculateTripDistances,
  sumFlattenedDieselLitres,
} from "../../../../shared/trip/calculations";

type RGB = [number, number, number];

const NAVY: RGB = [15, 35, 79];
const EMERALD: RGB = [5, 150, 105];
const MUTED: RGB = [90, 100, 115];
const GRID_LINE: RGB = [203, 213, 225];
const TEXT_DARK: RGB = [30, 41, 59];

export type TripReportEmailStatus = "sent" | "failed" | "pending" | "sending";

export type TripReportEmailInfo = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  byShop: Array<{ shopName: string; status: TripReportEmailStatus }>;
};

const toNum = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const fmt = (value: unknown): string =>
  value == null || value === "" ? "—" : String(value);

const money = (value: unknown): string => {
  const n = toNum(value);
  return n == null ? "—" : `₹ ${n.toFixed(2)}`;
};

const km = (value: unknown): string => {
  const n = toNum(value);
  return n == null ? "—" : `${n} KM`;
};

const gpsCaptured = (trip: Trip): boolean =>
  trip.farmGpsLat != null &&
  trip.farmGpsLon != null &&
  Number.isFinite(Number(trip.farmGpsLat)) &&
  Number.isFinite(Number(trip.farmGpsLon)) &&
  !(Number(trip.farmGpsLat) === 0 && Number(trip.farmGpsLon) === 0);

const expensePairs = (trip: Trip): Array<[string, number]> => [
  ["Meals", Number(trip.meals || 0)],
  ["Loading", Number(trip.loading || 0)],
  ["Meals / Tiffin", Number(trip.mealsTiffin || 0)],
  ["Vehicle Maintenance", Number(trip.vehicleMaintenance || 0)],
  ["Tea", Number(trip.othersRC || 0)],
  ["Driver", Number(trip.others1Amt || 0)],
  ["Supervisor", Number(trip.others2Amt || 0)],
  ["Helper & loader", Number(trip.others3Amt || 0)],
  ["Others", Number(trip.others4Amt || 0)],
  ["Others", Number(trip.others5Amt || 0)],
];

const submittedDiesel = (trip: Trip) =>
  Array.isArray(trip.dieselEntries) ? trip.dieselEntries.filter((e) => e.submitted !== false) : [];

export async function generateTripReportPDF(
  trip: Trip,
  emailInfo?: TripReportEmailInfo | null
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `${trip.tripNo || "Trip"} — Trip Report`,
    subject: "DMR POULTRIES trip report",
    author: "DMR POULTRIES",
    creator: "DMR POULTRIES",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const footerTop = pageHeight - 11;

  const generatedStr = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const assets: DmrPoultryHeaderAssets = await prepareDmrPoultryHeaderAssets({ henUrl: henImage });

  /** Reads the final Y of the most recent autoTable without `any` casts. */
  const lastTableY = (fallback: number): number => {
    const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    return table?.finalY ?? fallback;
  };

  let y = 0;
  const newPage = () => {
    doc.addPage();
    y = margin;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > footerTop - 4) newPage();
  };

  const drawSectionBand = (label: string, sub?: string) => {
    ensureSpace(14);
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.roundedRect(margin, y, contentWidth, 7.5, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(label, margin + 3, y + 5.1);
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(215, 222, 230);
      doc.text(sub, pageWidth - margin - 3, y + 5.1, { align: "right" });
    }
    y += 10.5;
  };

  /** Two-column label/value grid rendered as 4-column autoTable rows. */
  const kvGrid = (rows: Array<[string, string]>) => {
    const pairs: string[][] = [];
    for (let i = 0; i < rows.length; i += 2) {
      const a = rows[i];
      const b = rows[i + 1];
      pairs.push([a[0], a[1], b ? b[0] : "", b ? b[1] : ""]);
    }
    const labelCol = contentWidth * 0.24;
    const valueCol = (contentWidth - labelCol * 2) / 2;
    autoTable(doc, {
      body: pairs,
      startY: y,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.3, textColor: TEXT_DARK, lineColor: GRID_LINE, lineWidth: 0.15 },
      columnStyles: {
        0: { cellWidth: labelCol, fontStyle: "bold", textColor: MUTED },
        1: { cellWidth: valueCol },
        2: { cellWidth: labelCol, fontStyle: "bold", textColor: MUTED },
        3: { cellWidth: valueCol },
      },
      margin: { left: margin, right: margin },
    });
    y = lastTableY(y) + 5;
  };

  const simpleTable = (
    head: string[],
    body: (string | number)[][],
    opts: { fontSize?: number; widths?: Array<number | null>; showHead?: "everyPage" | "firstPage" | "never" } = {}
  ) => {
    const widths = opts.widths ?? [];
    const columnStyles: Record<
      string,
      { cellWidth?: number; halign?: "left" | "center" | "right"; fontStyle?: "normal" | "bold" | "italic" | "bolditalic" }
    > = {};
    const totalWidth = widths.reduce<number>((acc, w) => acc + (w ?? 0), 0);
    let used = 0;
    widths.forEach((w, i) => {
      if (w != null) {
        columnStyles[String(i)] = { cellWidth: w };
        used += w;
      }
    });
    const remainingCols = (head.length - widths.filter((w) => w != null).length || 0) > 0;
    if (remainingCols && totalWidth > 0 && used < contentWidth) {
      // distribute leftover width across unspecified columns
      const freeCols = head.map((_, i) => (widths[i] == null ? i : -1)).filter((i) => i >= 0);
      const share = (contentWidth - used) / freeCols.length;
      freeCols.forEach((i) => {
        columnStyles[String(i)] = { cellWidth: share };
      });
    }
    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      theme: "grid",
      showHead: opts.showHead ?? "everyPage",
      rowPageBreak: "avoid",
      headStyles: {
        fillColor: EMERALD,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        valign: "middle",
        cellPadding: { top: 2.6, bottom: 2.6 },
        lineColor: EMERALD,
        lineWidth: 0.1,
      },
      styles: {
        font: "helvetica",
        fontSize: opts.fontSize ?? 8,
        cellPadding: { top: 2, bottom: 2 },
        valign: "middle",
        textColor: TEXT_DARK,
        lineColor: GRID_LINE,
        lineWidth: 0.15,
      },
      columnStyles,
      margin: { left: margin, right: margin },
    });
    y = lastTableY(y) + 5;
  };

  // ─── PAGE 1: branded letterhead + report title ─────────────────────
  y = drawPreparedDmrPoultryHeader(doc, { margin, top: 8 }, assets) + 3;

  ensureSpace(16);
  doc.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2]);
  doc.roundedRect(margin, y, contentWidth, 11, 1.6, 1.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("TRIP REPORT", margin + 4, y + 7.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(trip.tripNo || "—", pageWidth - margin - 4, y + 7.2, { align: "right" });
  y += 14;

  // ─── TRIP IDENTITY ──────────────────────────────────────────────────
  drawSectionBand("TRIP DETAILS");
  const identityRows: Array<[string, string]> = [
    ["Trip No", fmt(trip.tripNo)],
    ["Trip Date", fmt(trip.tripDate)],
    ["Vehicle", fmt(trip.vehicleNo)],
    ["Driver", fmt(trip.driverName)],
    ["Supervisor", fmt(trip.supervisorName)],
    ["Status", fmt(trip.status)],
    ["Opening Meter", km(trip.openingMeter)],
    ["Closing Meter", km(trip.closingMeter)],
  ];
  if (trip.approvedBy) identityRows.push(["Approved By", trip.approvedBy]);
  kvGrid(identityRows);

  // ─── STEP 1 — START ─────────────────────────────────────────────────
  drawSectionBand("STEP 1 — TRIP START");
  kvGrid([
    ["Start Time", fmt(trip.startTime)],
    ["Opening Meter", km(trip.openingMeter)],
    ["Advance / Expenses", money(trip.advanceAmount)],
    ["Helpers", fmt(trip.helpers?.join(", "))],
    ["Loaders", fmt(trip.loaders?.join(", "))],
    ["Status", fmt(trip.startStepSubmitted ? "Submitted" : "Not submitted")],
  ]);

  // ─── STEP 2 — FARM / DESTINATION ────────────────────────────────────
  drawSectionBand("STEP 2 — FARM / DESTINATION");
  const farmRows: Array<[string, string]> = [
    ["Farm Name", fmt(trip.sourceFarm)],
    ["Farm Address", fmt(trip.farmAddress?.trim() || "Not entered")],
    ["Farm / Destination Meter", km(trip.destMeter)],
    ["Reached / Farm Time", fmt(trip.reachedTime)],
    ["Tolls", fmt(trip.pickupTolls == null ? "Not entered" : String(trip.pickupTolls))],
    ["Avg Bird Weight", toNum(trip.avgBirdWeight) != null ? `${trip.avgBirdWeight} kg` : "Not entered"],
  ];
  if (gpsCaptured(trip)) {
    farmRows.push(["GPS Latitude", String(trip.farmGpsLat)]);
    farmRows.push(["GPS Longitude", String(trip.farmGpsLon)]);
    farmRows.push(["GPS Accuracy", trip.farmGpsAccuracy != null ? String(trip.farmGpsAccuracy) : "—"]);
    farmRows.push(["GPS Captured Time", fmt(trip.farmGpsTime)]);
  } else {
    farmRows.push(["GPS", "Not captured"]);
  }
  farmRows.push(["Remarks", fmt(trip.remarks?.trim() || "—")]);
  kvGrid(farmRows);

  // ─── STEP 3 — PICKUP ────────────────────────────────────────────────
  drawSectionBand("STEP 3 — PICKUP");
  kvGrid([
    ["DC Weight", toNum(trip.dcWeight) != null ? `${trip.dcWeight} KG` : "Not entered"],
    ["Total Birds", fmt(trip.totalBirds)],
    ["Loaded Boxes", fmt(trip.boxes)],
    ["Average Weight", toNum(trip.avgWeight) != null ? `${trip.avgWeight} kg` : "Not entered"],
    ["Pickup Load Time", fmt(trip.pickupLoadTime)],
    ["Status", fmt(trip.pickupStepSubmitted ? "Submitted" : "Not submitted")],
  ]);

  const pickupBoxes = Array.isArray(trip.boxDetails) ? trip.boxDetails : [];
  if (pickupBoxes.length) {
    const boxBody = pickupBoxes.map((b, index) => {
      const birds = Number(b.birds || 0);
      const weight = Number(b.weight || 0);
      const avg =
        b.avgWeight != null && Number.isFinite(Number(b.avgWeight))
          ? Number(b.avgWeight)
          : birds > 0 && weight > 0
            ? Number((weight / birds).toFixed(3))
            : null;
      return [
        String(index + 1),
        `#${b.boxNo}`,
        String(birds),
        weight.toFixed(2),
        avg == null ? "--" : avg.toFixed(3),
      ];
    });
    simpleTable(
      ["S.No", "Box", "Birds", "Weight (KG)", "Avg WT"],
      boxBody,
      { widths: [14, 30, 30, 36, 36] }
    );
  }

  // ─── STEP 4 — SHOP DELIVERIES ───────────────────────────────────────
  const deliveries: ShopDelivery[] = Array.isArray(trip.deliveries) ? trip.deliveries : [];
  drawSectionBand("STEP 4 — SHOP DELIVERIES", `${deliveries.length} Shop(s)`);
  if (deliveries.length) {
    const deliveryBody = deliveries.map((row, index) => {
      const boxNos = Array.isArray(row.selectedBoxIds) && row.selectedBoxIds.length
        ? row.selectedBoxIds.join(", ")
        : row.boxNo != null && row.boxNo > 0
          ? String(row.boxNo)
          : "--";
      const mortality = `${row.mortality ?? 0}${row.mortKg ? ` / ${Number(row.mortKg).toFixed(2)} kg` : ""}`;
      return [
        String(index + 1),
        row.shopName || "--",
        row.birdType || "--",
        String(
          Array.isArray(row.selectedBoxIds) && row.selectedBoxIds.length
            ? row.selectedBoxIds.length
            : row.boxNo != null && row.boxNo > 0
              ? 1
              : 0
        ),
        String(row.birds ?? 0),
        Number(row.weight || 0).toFixed(2),
        mortality,
        row.autoCaptureTime || "--",
        boxNos,
      ];
    });
    simpleTable(
      ["S.No", "Shop", "Bird Type", "Boxes", "Birds", "Weight (KG)", "Mortality", "Captured Time", "Box Numbers"],
      deliveryBody,
      {
        fontSize: 7.5,
        widths: [10, 42, 26, 12, 14, 18, 22, 24, 26],
      }
    );
  } else {
    ensureSpace(10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text("No shop deliveries recorded for this trip.", margin, y);
    y += 7;
  }

  // ─── STEP 5 — END & EXPENSES ────────────────────────────────────────
  drawSectionBand("STEP 5 — END, EXPENSES & DIESEL");
  const totalKm =
    trip.totalKm != null && Number.isFinite(Number(trip.totalKm))
      ? Number(trip.totalKm)
      : Number(trip.closingMeter || 0) - Number(trip.openingMeter || 0);
  const diesel = submittedDiesel(trip);
  const dieselLitres = diesel.reduce((acc, e) => acc + Number(e.litres || 0), 0);
  const dieselAmount = diesel.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const positiveExpenses = expensePairs(trip).filter(([, amt]) => amt > 0);
  const expensesTotal = positiveExpenses.reduce((acc, [, amt]) => acc + amt, 0);
  const mileage = trip.mileageKmL;

  kvGrid([
    ["End Meter Reading", km(trip.closingMeter)],
    ["Delivery Tolls", fmt(trip.deliveryTolls)],
    ["Total Distance", `${Math.max(0, totalKm)} KM`],
    ["Mileage", mileage != null && Number.isFinite(Number(mileage)) ? `${Number(mileage).toFixed(2)} km/L` : "Not available"],
    ["Total Expenses", money(expensesTotal || trip.expense)],
    ["Total Diesel", `${dieselLitres} Ltrs / ${money(dieselAmount)}`],
  ]);

  if (positiveExpenses.length) {
    simpleTable(
      ["General Expense", "Amount"],
      positiveExpenses.map(([label, amt]) => [label, money(amt)]),
      { widths: [80, 60] }
    );
  }

  if (diesel.length) {
    const dieselBody = diesel.map((e, idx) => [
      String(idx + 1),
      String(e.litres ?? ""),
      String(e.rate ?? ""),
      money(e.amount ?? 0),
      String(e.meter ?? "--"),
      String(e.bunkName || "--"),
      e.submittedAt || "--",
    ]);
    simpleTable(
      ["S.No", "Litres", "Rate", "Amount", "Meter", "Bunk", "Submitted At"],
      dieselBody,
      { fontSize: 7.5, widths: [12, 18, 18, 24, 22, 26, 32] }
    );
  }

  // ─── KPI SUMMARY (same values as the application) ───────────────────
  drawSectionBand("TRIP FINAL KPI SUMMARY");
  const t = trip as Trip & { endMeter?: number | null; totalExpenses?: number };
  const deliverySubmitted = Boolean(trip.deliveryStepSubmitted);
  const farmSubmitted = Boolean(trip.farmStepSubmitted);
  const expensesSubmitted = Boolean(t.endStepSubmitted || t.expensesStepSubmitted);
  const pickupSubmitted = Boolean(trip.pickupStepSubmitted);

  const deliveryTotals = deliverySubmitted
    ? calculateDeliveryDisplayTotals(trip, deliveries)
    : { totalBirds: 0, totalWeight: 0, totalMortality: 0, totalMortalityKg: 0 };
  const weightLoss = Math.max(0, Number(trip.dcWeight || 0) - (deliveryTotals.totalWeight + deliveryTotals.totalMortalityKg));
  const { pickupDistance, deliveryDistance, totalDistance } = calculateTripDistances(trip);

  const startMeter = Number(trip.openingMeter || 0);
  const endMeter = Number(t.endMeter ?? t.closingMeter ?? 0);
  const odometerDistance = startMeter > 0 && endMeter > startMeter ? endMeter - startMeter : 0;
  const dieselLitersFlat = sumFlattenedDieselLitres(t as unknown as Record<string, unknown>);
  const mileageKpi =
    t.mileageKmL != null && Number.isFinite(Number(t.mileageKmL)) && Number(t.mileageKmL) > 0
      ? Number(t.mileageKmL)
      : odometerDistance > 0 && dieselLitersFlat > 0
        ? odometerDistance / dieselLitersFlat
        : null;

  const computedExpenses =
    Number(t.meals || 0) +
    Number(t.loading || 0) +
    Number(t.mealsTiffin || 0) +
    Number(t.vehicleMaintenance || 0) +
    Number(t.othersRC || 0) +
    Number(t.others1Amt || 0) +
    Number(t.others2Amt || 0) +
    Number(t.others3Amt || 0) +
    Number(t.others4Amt || 0) +
    Number(t.others5Amt || 0);
  const totalExpensesKpi = computedExpenses > 0 ? computedExpenses : Number(t.totalExpenses || 0);

  const pickupTollsValue = farmSubmitted ? toNum(trip.pickupTolls) ?? 0 : null;
  const deliveryTollsValue = expensesSubmitted ? toNum(trip.deliveryTolls) ?? 0 : null;
  const tollsValue =
    pickupTollsValue == null && deliveryTollsValue == null
      ? null
      : (pickupTollsValue ?? 0) + (deliveryTollsValue ?? 0);

  const kpiRows: Array<[string, string]> = [
    ["DC Weight", pickupSubmitted ? `${Number(trip.dcWeight || 0).toFixed(2)} Kg` : "—"],
    ["Total Birds", pickupSubmitted ? String(trip.totalBirds ?? 0) : "—"],
    ["Delivery Weight", deliverySubmitted ? `${deliveryTotals.totalWeight.toFixed(2)} Kg` : "—"],
    ["Delivery Birds", deliverySubmitted ? String(deliveryTotals.totalBirds) : "—"],
    ["Mortality", deliverySubmitted ? `${deliveryTotals.totalMortality} Birds / ${deliveryTotals.totalMortalityKg.toFixed(2)} Kg` : "—"],
    ["Weight Loss", pickupSubmitted && deliverySubmitted ? `${weightLoss.toFixed(2)} Kg` : "—"],
    ["Pickup Distance", farmSubmitted && trip.startStepSubmitted ? `${pickupDistance.toFixed(2)} KM` : "—"],
    ["Delivery Distance", expensesSubmitted ? `${deliveryDistance.toFixed(2)} KM` : "—"],
    ["Total Distance", expensesSubmitted ? `${totalDistance.toFixed(2)} KM` : "—"],
    ["Toll Gates", tollsValue == null ? "—" : String(tollsValue)],
    ["Mileage", mileageKpi != null ? `${mileageKpi.toFixed(2)} km/L` : "—"],
    ["Expenses", expensesSubmitted ? `₹ ${totalExpensesKpi.toFixed(0)}` : "—"],
  ];
  kvGrid(kpiRows);

  // ─── EMAIL STATUS SUMMARY (optional, from live Trip View state) ─────
  if (emailInfo && emailInfo.total > 0) {
    drawSectionBand("EMAIL STATUS");
    kvGrid([
      ["Total Shops", String(emailInfo.total)],
      ["Sent", String(emailInfo.sent)],
      ["Failed", String(emailInfo.failed)],
      ["Pending", String(emailInfo.pending)],
    ]);
    const emailBody = emailInfo.byShop
      .filter((s) => s.shopName)
      .map((s, index) => [
        String(index + 1),
        s.shopName,
        s.status === "sent" ? "✓ Sent" : s.status === "failed" ? "✕ Failed" : "Pending",
      ]);
    if (emailBody.length) {
      simpleTable(["S.No", "Shop", "Status"], emailBody, { widths: [14, 90, 30] });
    }
  }

  // ─── FOOTER / PAGE CHROME ───────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    if (p > 1) {
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, w, 7.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("DMR POULTRIES — TRIP REPORT", margin, 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(trip.tripNo || "", w - margin, 5, { align: "right" });
    }
    doc.setDrawColor(GRID_LINE[0], GRID_LINE[1], GRID_LINE[2]);
    doc.setLineWidth(0.2);
    doc.line(margin, h - 9, w - margin, h - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(`Page ${p} of ${pageCount}`, margin, h - 5.5);
    doc.text(`Generated on ${generatedStr}`, w - margin, h - 5.5, { align: "right" });
  }

  const safeTripNo = String(trip.tripNo || "Trip").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const safeVehicle = String(trip.vehicleNo || "Vehicle").replace(/[^a-zA-Z0-9_-]+/g, "_");
  doc.save(`${safeTripNo}_${safeVehicle}_TripReport.pdf`);
}