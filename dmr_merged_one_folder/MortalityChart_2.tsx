import { memo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

interface MortalityChartProps {
  data: Array<{
    week: string;
    mortalityRate: number;
    totalBirds?: number;
    mortality?: number;
  }>;
  emptyText: string;
}

const MortalityChart = ({ data, emptyText }: MortalityChartProps) => {
  const hasData =
    Array.isArray(data) &&
    data.some((point) => Number(point.mortalityRate || 0) > 0);

  return (
    <div className="flex h-full flex-col">
      {!hasData ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm font-medium text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
              <defs>
                <linearGradient id="mortalityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} horizontal={true} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                tickFormatter={formatPercent}
                axisLine={false}
                tickLine={false}
                width={50}
                tickMargin={8}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc', strokeDasharray: '4 4', stroke: '#e2e8f0' }}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 12px 28px -8px rgba(15, 23, 42, 0.18)',
                  fontSize: '12px',
                  padding: '10px 14px',
                  backgroundColor: '#fff',
                }}
                labelStyle={{ fontWeight: 700, color: '#0f172a', fontSize: 12 }}
                labelFormatter={(label) => `Week ${label}`}
              />
              <Area
                type="monotone"
                dataKey="mortalityRate"
                name="Mortality Rate"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#mortalityGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default memo(MortalityChart);