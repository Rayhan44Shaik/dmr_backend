import { isWithinInterval } from 'date-fns';
import type { ReportFilters, ReportType, ReportData } from '../types/reportTypes';

// ========== HELPERS ==========
const filterByDateRange = <T extends Record<string, any>>(
  items: T[],
  dateField: string,
  from: string,
  to: string
): T[] => {
  if (!from || !to || !Array.isArray(items)) return items || [];
  return items.filter((item) => {
    try {
      const d = new Date(item[dateField]);
      return isWithinInterval(d, { start: new Date(from), end: new Date(to) });
    } catch {
      return false;
    }
  });
};

const groupAndSum = <T extends Record<string, any>>(
  items: T[],
  groupKey: string,
  sumKeys: string[]
): Record<string, any>[] => {
  if (!Array.isArray(items)) return [];
  const map = new Map<string, any>();
  items.forEach((item) => {
    const key = item[groupKey] || 'Unknown';
    if (!map.has(key)) {
      map.set(key, { [groupKey]: key });
      sumKeys.forEach((sk) => (map.get(key)[sk] = 0));
    }
    const entry = map.get(key);
    sumKeys.forEach((sk) => {
      entry[sk] += Number(item[sk] || 0);
    });
  });
  return Array.from(map.values());
};

const safeNumber = (val: any): number => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

// ========== REPORT COMPUTATIONS ==========

const computeWeeklyReport = (trips: any[], sales: any[], collections: any[], fuel: any[], filters: ReportFilters): ReportData => {
  const filteredTrips = filterByDateRange(trips, 'tripDate', filters.dateFrom, filters.dateTo);
  const filteredSales = filterByDateRange(sales, 'tripDate', filters.dateFrom, filters.dateTo);
  const filteredCollections = filterByDateRange(collections, 'collectionDate', filters.dateFrom, filters.dateTo);
  const filteredFuel = filterByDateRange(fuel, 'date', filters.dateFrom, filters.dateTo);

  const totalTrips = filteredTrips.length;
  const totalBirds = filteredTrips.reduce((sum, t) => sum + safeNumber(t.totalBirds), 0);
  const totalWeight = filteredTrips.reduce((sum, t) => sum + safeNumber(t.totalWeight), 0);
  const totalMortality = filteredTrips.reduce((sum, t) => sum + safeNumber(t.totalMortality), 0);
  const totalSales = filteredSales.reduce((sum, s) => sum + safeNumber(s.amount), 0);
  const totalCollections = filteredCollections.filter(c => c.status === 'Approved').reduce((sum, c) => sum + safeNumber(c.amount), 0);
  const totalFuelExpense = filteredFuel.reduce((sum, f) => sum + safeNumber(f.amount), 0);
  const totalTripExpense = filteredTrips.reduce((sum, t) => sum + safeNumber(t.expense), 0);
  const totalExpenses = totalFuelExpense + totalTripExpense;
  const profit = totalSales - totalCollections - totalExpenses;

  return {
    title: 'Weekly Report',
    summary: {
      'Total Trips': totalTrips,
      'Total Birds': totalBirds,
      'Total Weight (KG)': totalWeight,
      'Total Mortality': totalMortality,
      'Total Sales': totalSales,
      'Total Collections': totalCollections,
      'Total Expenses': totalExpenses,
      'Profit / Loss': profit,
    },
    details: filteredTrips.map(t => ({
      tripNo: t.tripNo || 'N/A',
      date: t.tripDate || 'N/A',
      vehicle: t.vehicleNo || 'N/A',
      shops: safeNumber(t.totalShops),
      birds: safeNumber(t.totalBirds),
      weight: safeNumber(t.totalWeight),
      mortality: safeNumber(t.totalMortality),
      expense: safeNumber(t.expense),
    })),
    total: {
      trips: totalTrips,
      birds: totalBirds,
      weight: totalWeight,
      mortality: totalMortality,
      sales: totalSales,
      collections: totalCollections,
      expenses: totalExpenses,
      profit: profit,
    },
    isEmpty: filteredTrips.length === 0,
  };
};

const computeVehicleReport = (trips: any[], fuel: any[], filters: ReportFilters): ReportData => {
  const filteredTrips = filterByDateRange(trips, 'tripDate', filters.dateFrom, filters.dateTo);
  const filteredFuel = filterByDateRange(fuel, 'date', filters.dateFrom, filters.dateTo);

  const vehicleGroups = groupAndSum(filteredTrips, 'vehicleNo', ['totalBirds', 'totalWeight', 'totalMortality', 'expense']);
  const vehicleDetails = vehicleGroups.map((vg) => {
    const vehicleTrips = filteredTrips.filter(t => t.vehicleNo === vg.vehicleNo);
    const totalKm = vehicleTrips.reduce((sum, t) => sum + safeNumber(t.totalKm), 0);
    const fuelForVehicle = filteredFuel.filter(f => f.vehicleNo === vg.vehicleNo);
    const totalFuelLitres = fuelForVehicle.reduce((sum, f) => sum + safeNumber(f.litres), 0);
    const totalFuelAmount = fuelForVehicle.reduce((sum, f) => sum + safeNumber(f.amount), 0);
    return {
      vehicle: vg.vehicleNo || 'Unknown',
      trips: vehicleTrips.length,
      totalKm,
      birds: safeNumber(vg.totalBirds),
      weight: safeNumber(vg.totalWeight),
      mortality: safeNumber(vg.totalMortality),
      fuelLitres: totalFuelLitres,
      fuelAmount: totalFuelAmount,
      expense: safeNumber(vg.expense),
    };
  });

  const isEmpty = vehicleDetails.length === 0;

  return {
    title: 'Vehicle Report',
    summary: isEmpty ? {} : {
      'Total Vehicles': vehicleDetails.length,
      'Total Trips': filteredTrips.length,
      'Total KM': vehicleDetails.reduce((s, v) => s + v.totalKm, 0),
      'Total Fuel (Ltrs)': vehicleDetails.reduce((s, v) => s + v.fuelLitres, 0),
      'Total Fuel Expense': vehicleDetails.reduce((s, v) => s + v.fuelAmount, 0),
    },
    details: vehicleDetails,
    total: {
      trips: filteredTrips.length,
      km: vehicleDetails.reduce((s, v) => s + v.totalKm, 0),
      fuelLitres: vehicleDetails.reduce((s, v) => s + v.fuelLitres, 0),
      fuelAmount: vehicleDetails.reduce((s, v) => s + v.fuelAmount, 0),
    },
    isEmpty,
  };
};

const computeShopSalesReport = (sales: any[], _trips: any[], filters: ReportFilters): ReportData => {
  const filteredSales = filterByDateRange(sales, 'tripDate', filters.dateFrom, filters.dateTo);
  const shopGroups = groupAndSum(filteredSales, 'shopName', ['amount', 'birds', 'weight', 'boxes']);
  const topShops = [...shopGroups].sort((a, b) => safeNumber(b.amount) - safeNumber(a.amount)).slice(0, 5);
  const isEmpty = shopGroups.length === 0;

  return {
    title: 'Shop Sales Report',
    summary: isEmpty ? {} : {
      'Total Shops': shopGroups.length,
      'Total Sales': shopGroups.reduce((s, g) => s + safeNumber(g.amount), 0),
      'Total Birds': shopGroups.reduce((s, g) => s + safeNumber(g.birds), 0),
      'Total Weight (KG)': shopGroups.reduce((s, g) => s + safeNumber(g.weight), 0),
    },
    details: shopGroups,
    total: {
      shops: shopGroups.length,
      amount: shopGroups.reduce((s, g) => s + safeNumber(g.amount), 0),
      birds: shopGroups.reduce((s, g) => s + safeNumber(g.birds), 0),
      weight: shopGroups.reduce((s, g) => s + safeNumber(g.weight), 0),
      boxes: shopGroups.reduce((s, g) => s + safeNumber(g.boxes), 0),
    },
    charts: topShops.map(s => ({ name: s.shopName || 'Unknown', value: safeNumber(s.amount) })),
    isEmpty,
  };
};

const computeCollectionReport = (collections: any[], _sales: any[], filters: ReportFilters): ReportData => {
  const filteredCollections = filterByDateRange(collections, 'collectionDate', filters.dateFrom, filters.dateTo);
  const approved = filteredCollections.filter(c => c.status === 'Approved');

  const shopGroups = groupAndSum(approved, 'shopName', ['amount']);
  const collectorGroups = groupAndSum(approved, 'collectorName', ['amount']);
  const modeGroups = groupAndSum(approved, 'paymentModeName', ['amount']);

  const isEmpty = approved.length === 0;

  return {
    title: 'Collection Report',
    summary: isEmpty ? {} : {
      'Total Collections': approved.reduce((s, c) => s + safeNumber(c.amount), 0),
      'Total Shops': shopGroups.length,
      'Total Collectors': collectorGroups.length,
      'Payment Modes': modeGroups.length,
    },
    details: {
      shopWise: shopGroups,
      collectorWise: collectorGroups,
      paymentModeWise: modeGroups,
    },
    total: {
      amount: approved.reduce((s, c) => s + safeNumber(c.amount), 0),
    },
    isEmpty,
  };
};

const computeShopLedger = (sales: any[], collections: any[], filters: ReportFilters): ReportData => {
  const filteredSales = filterByDateRange(sales, 'tripDate', filters.dateFrom, filters.dateTo);
  const filteredCollections = filterByDateRange(collections, 'collectionDate', filters.dateFrom, filters.dateTo);

  const shopSet = new Set<string>();
  filteredSales.forEach(s => shopSet.add(s.shopName));
  filteredCollections.forEach(c => shopSet.add(c.shopName));
  const shops = Array.from(shopSet);

  const ledgerEntries = shops.map(shop => {
    const salesForShop = filteredSales.filter(s => s.shopName === shop);
    const collectionsForShop = filteredCollections.filter(c => c.shopName === shop && c.status === 'Approved');
    const totalSales = salesForShop.reduce((sum, s) => sum + safeNumber(s.amount), 0);
    const totalCollections = collectionsForShop.reduce((sum, c) => sum + safeNumber(c.amount), 0);
    const outstanding = totalSales - totalCollections;
    return {
      shop,
      totalSales,
      totalCollections,
      outstanding,
      salesCount: salesForShop.length,
      collectionCount: collectionsForShop.length,
    };
  });

  const isEmpty = ledgerEntries.length === 0;

  return {
    title: 'Shop Ledger',
    summary: isEmpty ? {} : {
      'Total Shops': shops.length,
      'Total Sales': ledgerEntries.reduce((s, l) => s + l.totalSales, 0),
      'Total Collections': ledgerEntries.reduce((s, l) => s + l.totalCollections, 0),
      'Total Outstanding': ledgerEntries.reduce((s, l) => s + l.outstanding, 0),
    },
    details: ledgerEntries,
    total: {
      sales: ledgerEntries.reduce((s, l) => s + l.totalSales, 0),
      collections: ledgerEntries.reduce((s, l) => s + l.totalCollections, 0),
      outstanding: ledgerEntries.reduce((s, l) => s + l.outstanding, 0),
    },
    isEmpty,
  };
};

const computeExpensesReport = (fuel: any[], filters: ReportFilters): ReportData => {
  const filteredFuel = filterByDateRange(fuel, 'date', filters.dateFrom, filters.dateTo);
  const categories = ['Fuel', 'Maintenance', 'Fastag', 'Office', 'Insurance & Permit'];
  const expenseGroups = categories.map(cat => ({
    category: cat,
    amount: filteredFuel.filter(f => f.category === cat).reduce((s, f) => s + safeNumber(f.amount), 0),
  }));
  const total = expenseGroups.reduce((s, g) => s + g.amount, 0);
  const isEmpty = total === 0;

  return {
    title: 'Expenses Report',
    summary: isEmpty ? {} : {
      'Total Expense': total,
      'Categories': expenseGroups.filter(g => g.amount > 0).length,
    },
    details: expenseGroups,
    total: { total },
    isEmpty,
  };
};

// ========== MAIN EXPORT ==========
export function getReportData(type: ReportType, filters: ReportFilters): ReportData | null {
  try {
    const trips = JSON.parse(localStorage.getItem('vehicleTrips') || '[]');
    const sales = JSON.parse(localStorage.getItem('shopSales') || '[]');
    const collections = JSON.parse(localStorage.getItem('dmr-collections') || '[]');
    const fuelExpenses = JSON.parse(localStorage.getItem('dmr-fuel-expenses') || '[]');

    switch (type) {
      case 'weekly':
        return computeWeeklyReport(trips, sales, collections, fuelExpenses, filters);
      case 'vehicle':
        return computeVehicleReport(trips, fuelExpenses, filters);
      case 'shopSales':
        return computeShopSalesReport(sales, trips, filters);
      case 'collection':
        return computeCollectionReport(collections, sales, filters);
      case 'shopLedger':
        return computeShopLedger(sales, collections, filters);
      case 'expenses':
        return computeExpensesReport(fuelExpenses, filters);
      default:
        return null;
    }
  } catch (error) {
    console.error('Report data error:', error);
    return null;
  }
}