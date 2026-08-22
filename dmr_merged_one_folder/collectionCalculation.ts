import type {
  Collection,
  CollectorSummary,
  PaymentModeSummary
} from "../types/collection";

/* ==========================================================
   TOTAL COLLECTED
========================================================== */
export function calculateCollectedAmount(
  collections: Collection[]
): number {
  return collections.reduce(
    (total, row) => total + Number(row.amount),
    0
  );
}

/* ==========================================================
   PENDING AMOUNT
========================================================== */
export function calculatePendingAmount(
  totalSales: number,
  totalCollections: number
): number {
  // ✅ Return raw difference (can be negative)
  return totalSales - totalCollections;
}

/* ==========================================================
   COLLECTION PERCENTAGE
========================================================== */
export function calculateCollectionPercentage(
  totalSales: number,
  totalCollections: number
): number {
  if (totalSales <= 0) return 0;
  return Number(((totalCollections / totalSales) * 100).toFixed(2));
}

/* ==========================================================
   COLLECTOR SUMMARY
========================================================== */
export function calculateCollectorSummary(
  collections: Collection[]
): CollectorSummary[] {
  const map = new Map<string, CollectorSummary>();
  collections.forEach(row => {
    if (!map.has(row.collectorName)) {
      map.set(row.collectorName, {
        collectorId: "",
        collectorName: row.collectorName,
        totalCollections: 0,
        totalAmount: 0
      });
    }
    const collector = map.get(row.collectorName)!;
    collector.totalCollections++;
    collector.totalAmount += Number(row.amount);
  });
  return Array.from(map.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );
}

/* ==========================================================
   PAYMENT MODE SUMMARY
========================================================== */
export function calculatePaymentModeSummary(
  collections: Collection[]
): PaymentModeSummary[] {
  const map = new Map<string, PaymentModeSummary>();
  collections.forEach(row => {
    if (!map.has(row.paymentModeName)) {
      map.set(row.paymentModeName, {
        paymentModeName: row.paymentModeName,
        totalCollections: 0,
        totalAmount: 0,
        percentage: 0
      });
    }
    const payment = map.get(row.paymentModeName)!;
    payment.totalCollections++;
    payment.totalAmount += Number(row.amount);
  });

  const totalAmount = Array.from(map.values()).reduce(
    (sum, row) => sum + row.totalAmount,
    0
  );

  map.forEach(item => {
    item.percentage = totalAmount === 0
      ? 0
      : Number(((item.totalAmount / totalAmount) * 100).toFixed(2));
  });

  return Array.from(map.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );
}
