// DEFERRED / FUTURE — historical localStorage prototype. Not used by the live FASTAG placeholder.
import { useMemo } from 'react';
import { startOfToday, startOfMonth, endOfMonth } from 'date-fns';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import { getFastags, getFastagTransactions } from '../services/storage';

export function useFastagData() {
  const { vehicles } = useVehicles();
  const fastags = useMemo(() => getFastags(), []);
  const transactions = useMemo(() => getFastagTransactions(), []);

  const today = new Date();
  const todayStart = startOfToday();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  // Summary stats
  const stats = useMemo(() => {
    const totalFastags = fastags.length;
    const lowBalanceCount = fastags.filter((f: any) => f.status === 'low' || f.status === 'critical').length;
    const todayToll = transactions
      .filter((t: any) => new Date(t.date) >= todayStart)
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const monthToll = transactions
      .filter((t: any) => new Date(t.date) >= monthStart && new Date(t.date) <= monthEnd)
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const avgDailyToll = monthToll / (new Date().getDate() || 1);
    return { totalFastags, lowBalanceCount, todayToll, monthToll, avgDailyToll };
  }, [fastags, transactions, todayStart, monthStart, monthEnd]);

  // Sort by lowest balance first
  const sortedFastags = useMemo(() => {
    return [...fastags].sort((a: any, b: any) => a.balance - b.balance);
  }, [fastags]);

  // Recent transactions (last 10)
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [transactions]);

  return {
    fastags,
    transactions,
    vehicles,
    stats,
    sortedFastags,
    recentTransactions,
  };
}