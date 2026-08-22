import { useState, useEffect } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import {
  getCashBook,
  getBankBook,
  getFarmerPurchases,
  getEMIPayments,
  getOtherExpenses,
} from '../services/storage';
import type { DashboardSummary } from '../types';

// Helper to get data from other modules
const getShopSales = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem('shopSales') || '[]');
  } catch { return []; }
};

const getCollections = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem('dmr-collections') || '[]');
  } catch { return []; }
};

const getFuelExpenses = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem('dmr-fuel-expenses') || '[]');
  } catch { return []; }
};

export function useAccountsData(selectedDate: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      const dateObj = parseISO(selectedDate);
      const prevDate = subDays(dateObj, 1);
      const prevDateStr = format(prevDate, 'yyyy-MM-dd');

      const cashEntries = getCashBook();
      const bankEntries = getBankBook();
      const purchases = getFarmerPurchases();
      const emis = getEMIPayments();
      const expenses = getOtherExpenses();
      const fuelExpenses = getFuelExpenses().filter((e: any) => e.status === 'Approved');
      const sales = getShopSales();
      const collections = getCollections();

      const todaySales = sales.filter((s: any) => s.tripDate === selectedDate || s.date === selectedDate);
      const todayCollections = collections.filter((c: any) => c.collectionDate === selectedDate);
      const todayExpenses = expenses.filter(e => e.date === selectedDate);
      const todayFuel = fuelExpenses.filter((e: any) => e.date === selectedDate);

      const yestSales = sales.filter((s: any) => s.tripDate === prevDateStr || s.date === prevDateStr);
      const yestCollections = collections.filter((c: any) => c.collectionDate === prevDateStr);

      const allCashUpTo = cashEntries.filter(e => e.date <= selectedDate);
      const cashInHand = allCashUpTo.reduce((acc, e) => acc + e.receipt - e.payment, 0);

      const allBankUpTo = bankEntries.filter(e => e.date <= selectedDate);
      const bankBalance = allBankUpTo.reduce((acc, e) => acc + e.deposit - e.withdrawal, 0);

      const pendingPurchases = purchases.filter(p => p.status !== 'Paid');
      const farmerPayables = pendingPurchases.reduce((acc, p) => acc + (p.amount - p.paidAmount), 0);

      const currentMonth = format(dateObj, 'yyyy-MM');
      const pendingEMIs = emis.filter(e => e.status !== 'Paid' && e.dueDate.startsWith(currentMonth));
      const emiDue = pendingEMIs.reduce((acc, e) => acc + e.amount, 0);

      const totalSales = todaySales.reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
      const totalCollections = todayCollections.reduce((acc: number, c: any) => acc + (c.amount || 0), 0);
      const todayExpenseTotal = todayExpenses.reduce((acc, e) => acc + e.amount, 0) +
        todayFuel.reduce((acc: number, e: any) => acc + (e.amount || 0), 0);

      const yesterdaySalesTotal = yestSales.reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
      const yesterdayCollectionsTotal = yestCollections.reduce((acc: number, c: any) => acc + (c.amount || 0), 0);

      setData({
        totalSales,
        totalCollections,
        cashInHand,
        bankBalance,
        farmerPayables,
        emiDue,
        todayExpenses: todayExpenseTotal,
        yesterdaySales: yesterdaySalesTotal,
        yesterdayCollections: yesterdayCollectionsTotal,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  return { data, loading, error };
}