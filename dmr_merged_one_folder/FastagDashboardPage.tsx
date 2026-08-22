/*
 * HISTORICAL / FUTURE FASTAG PROTOTYPE — do not mount, do not execute.
 * The live export below is a static Under Construction placeholder.
 * Restore this implementation after the client visit; do not use localStorage
 * as a production source of truth.
 *
import { memo } from 'react';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import { useFleetData } from '../hooks/useFleetData';
import { useFastagData } from '../hooks/useFastagData';
import ErrorBoundary from '../components/common/ErrorBoundary';
import FastagSummaryTiles from '../components/fastag/FastagSummaryTiles';
import FastagBalanceTable from '../components/fastag/FastagBalanceTable';
import FastagTransactions from '../components/fastag/FastagTransactions';
import { Plus } from 'lucide-react';

const FastagDashboardPage = () => {
  const { vehicles } = useVehicles();
  const { fastags } = useFleetData();
  const { stats, sortedFastags, recentTransactions } = useFastagData();

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">FASTag Dashboard</h1>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            Recharge FASTag
          </button>
        </div>
        <FastagSummaryTiles
          totalFastags={stats.totalFastags}
          lowBalanceCount={stats.lowBalanceCount}
          todayToll={stats.todayToll}
          monthToll={stats.monthToll}
          avgDailyToll={stats.avgDailyToll}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">FASTag Balance Overview</h3>
            <FastagBalanceTable fastags={sortedFastags} vehicles={vehicles} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Toll Transactions</h3>
            <FastagTransactions
              transactions={recentTransactions}
              fastags={fastags}
              vehicles={vehicles}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(FastagDashboardPage);
*/

import { memo } from 'react';
import { Construction } from 'lucide-react';
import ErrorBoundary from '../components/common/ErrorBoundary';

interface FastagDashboardPageProps {
  embedded?: boolean;
}

/** UNDER CONSTRUCTION — static placeholder. Zero API, cache, storage, or polling. */
const FastagDashboardPage = ({ embedded = false }: FastagDashboardPageProps) => {
  return (
    <ErrorBoundary>
      <div
        className={`w-full flex items-center justify-center ${
          embedded ? 'min-h-[60vh]' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
        }`}
      >
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center max-w-lg w-full mx-4">
          <div className="w-14 h-14 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <Construction className="w-7 h-7" aria-hidden />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">FASTAG</p>
          <h2 className="text-xl font-bold text-slate-800 mb-1">FASTAG Management</h2>
          <p className="text-sm font-semibold text-amber-700 mb-3">Under Construction</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            FASTAG tracking and management will be available in a future release.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Coming Soon</p>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(FastagDashboardPage);
