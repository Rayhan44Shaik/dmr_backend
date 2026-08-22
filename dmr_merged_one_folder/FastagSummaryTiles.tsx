import { memo } from 'react';
import { CreditCard, AlertTriangle, DollarSign, Calendar, TrendingUp } from 'lucide-react';

interface FastagSummaryTilesProps {
  totalFastags: number;
  lowBalanceCount: number;
  todayToll: number;
  monthToll: number;
  avgDailyToll: number;
}

const FastagSummaryTiles = ({
  totalFastags,
  lowBalanceCount,
  todayToll,
  monthToll,
  avgDailyToll,
}: FastagSummaryTilesProps) => {
  const tiles = [
    {
      label: 'Total FASTags',
      value: totalFastags,
      icon: CreditCard,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'Low Balance',
      value: lowBalanceCount,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-100',
    },
    {
      label: "Today's Toll",
      value: `₹${todayToll.toLocaleString('en-IN')}`,
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      label: 'This Month Toll',
      value: `₹${monthToll.toLocaleString('en-IN')}`,
      icon: Calendar,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
    {
      label: 'Average Daily Toll',
      value: `₹${avgDailyToll.toFixed(2)}`,
      icon: TrendingUp,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {tiles.map((tile, idx) => (
        <div
          key={idx}
          className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${tile.bg}`}>
              <tile.icon className={`w-4 h-4 ${tile.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 truncate">{tile.label}</p>
              <p className="text-lg font-bold text-gray-900 truncate">{tile.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default memo(FastagSummaryTiles);