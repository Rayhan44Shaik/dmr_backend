import { memo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsWeeklyPoint } from '../../types/analytics';

const axisCompact = (value: number): string => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} K`;
  return String(Math.round(value));
};

interface WeeklyTrendChartProps {
  data: AnalyticsWeeklyPoint[];
}

const WeeklyTrendChart = ({ data }: WeeklyTrendChartProps) => {
  const hasData = Array.isArray(data) && data.some((point) => point.distance > 0 || point.fuel > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-3 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-600" />
          <span>Distance</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-500" />
          <span>Fuel</span>
        </span>
      </div>

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm font-medium text-slate-400">
          No weekly activity for the selected filters.
        </div>
      ) : (
        <div className="h-60 w-full">
          <div className="h-full w-full rounded-lg border border-slate-100 bg-white p-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} horizontal={true} />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  tickLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="distance"
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickFormatter={axisCompact}
                  axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  tickLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  tickMargin={8}
                  minTickGap={40}
                />
                <YAxis
                  yAxisId="fuel"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickFormatter={axisCompact}
                  axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  tickLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  tickMargin={8}
                  minTickGap={40}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 8px 20px -6px rgba(15, 23, 42, 0.15)',
                    fontSize: '12px',
                    backgroundColor: '#ffffff',
                  }}
                  formatter={(value, name) => [
                    Number(value).toLocaleString('en-IN'),
                    name === 'distance' ? 'Distance (km)' : name === 'fuel' ? 'Fuel (L)' : String(name),
                  ]}
                  labelStyle={{ fontWeight: 700, color: '#0f172a', fontSize: 12 }}
                />
                <Bar
                  yAxisId="distance"
                  dataKey="distance"
                  name="distance"
                  fill="#2563eb"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
                <Bar
                  yAxisId="fuel"
                  dataKey="fuel"
                  name="fuel"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(WeeklyTrendChart);