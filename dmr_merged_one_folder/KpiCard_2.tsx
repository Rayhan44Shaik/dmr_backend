import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  format?: 'currency' | 'number' | 'string';
  className?: string;
}

const formatValue = (val: string | number, format?: string) => {
  if (format === 'currency') return `₹${Number(val).toLocaleString('en-IN')}`;
  if (format === 'number') return Number(val).toLocaleString('en-IN');
  return val;
};

const KpiCard: React.FC<KpiCardProps> = ({ 
  label, value, icon, trend, trendLabel = 'vs last month', format, className 
}) => {
  const trendColor = trend === undefined ? 'text-gray-400' 
    : trend > 0 ? 'text-green-600' 
    : trend < 0 ? 'text-red-600' 
    : 'text-gray-400';
  const TrendIcon = trend === undefined ? Minus : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow ${className || ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 truncate">{label}</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{formatValue(value, format)}</p>
          {trend !== undefined && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              {Math.abs(trend)}% {trendLabel}
            </p>
          )}
        </div>
        {icon && <div className="text-blue-500 flex-shrink-0 ml-2">{icon}</div>}
      </div>
    </div>
  );
};

export default React.memo(KpiCard);