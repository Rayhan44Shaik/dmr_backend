// src/modules/staff/components/performance/WeeklyActivityChart.tsx

import { memo, useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const axisCompact = (value: number): string => {
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
};

const percentFormat = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

export interface WeeklyBar {
  key: string;
  label: string;
  color: string;
}

interface WeeklyActivityChartProps {
  data: Array<Record<string, string | number>>;
  bars: [WeeklyBar, WeeklyBar] | [WeeklyBar, WeeklyBar, WeeklyBar];
  emptyText: string;
  chartType?: 'bars' | 'mixed';
  /** Supervisor mode: shows Birds + Weight chart with mortality summary in header */
  supervisorMode?: boolean;
  /** Mortality data for supervisor mode header */
  mortalityData?: Array<{ week: string; mortalityRate: number; mortality?: number }>;
  /** Total trips for supervisor mode header */
  totalTrips?: number;
}

const WeeklyActivityChart = ({ 
  data, 
  bars, 
  emptyText, 
  chartType = 'mixed',
  supervisorMode = false,
  mortalityData,
  totalTrips,
}: WeeklyActivityChartProps) => {
  const hasData = useMemo(() =>
    Array.isArray(data) &&
    data.some((point) => bars.some((bar) => Number(point[bar.key] || 0) > 0)),
  [data, bars]);

  // For supervisor mode, compute aggregate mortality stats
  const mortalitySummary = useMemo(() => {
    if (!mortalityData || !mortalityData.length) return null;
    const rates = mortalityData.map(d => d.mortalityRate).filter(r => r > 0);
    const deaths = mortalityData.map(d => d.mortality || 0).filter(m => m > 0);
    if (!rates.length) return null;
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const totalDeaths = deaths.reduce((a, b) => a + b, 0);
    const latestRate = rates[rates.length - 1];
    const prevRate = rates[rates.length - 2];
    const trend = prevRate ? (latestRate < prevRate ? 'down' : latestRate > prevRate ? 'up' : 'neutral') : 'neutral';
    return { avgRate, totalDeaths, latestRate, trend };
  }, [mortalityData]);

  return (
    <div className="flex h-full flex-col">
      {/* Header with legend and supervisor summary */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-500">
          {bars.map((bar, idx) => (
            <span key={idx} className="flex items-center gap-1.5">
              {chartType === 'mixed' && idx === bars.length - 1 && !supervisorMode ? (
                <span className="inline-flex items-center h-2.5 w-5">
                  <span className="w-full h-0.5 bg-dotted border-t-[1.5px] border-dashed" style={{ borderColor: bar.color }} />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: bar.color }} />
              )}
              {bar.label}
            </span>
          ))}
        </div>
        {/* Supervisor mode: mortality summary */}
        {supervisorMode && mortalitySummary && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mortality</span>
            <span className={`text-sm font-bold ${mortalitySummary.trend === 'down' ? 'text-emerald-600' : mortalitySummary.trend === 'up' ? 'text-rose-600' : 'text-slate-600'}`}>
              {mortalitySummary.latestRate.toFixed(2)}%
            </span>
            <span className="text-[10px] text-slate-400">({mortalitySummary.totalDeaths ?? 0} total)</span>
          </div>
        )}
      </div>

      {/* Supervisor mode: inline metrics summary */}
      {supervisorMode && totalTrips !== undefined && (
        <div className="mb-2 flex flex-wrap items-center gap-6 text-[10px] font-medium text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bars[0].color }} />
            <span>Trips: <span className="font-bold text-slate-700">{totalTrips}</span></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bars[1].color }} />
            <span>Birds: <span className="font-bold text-slate-700">{data.reduce((sum, d) => sum + Number(d.birds || 0), 0).toLocaleString('en-IN')}</span></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bars[2]?.color ?? bars[1]?.color ?? '#f59e0b' }} />
            <span>Weight: <span className="font-bold text-slate-700">{data.reduce((sum, d) => sum + Number(d.weight || 0), 0).toLocaleString('en-IN')} kg</span></span>
          </span>
        </div>
      )}

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm font-medium text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} horizontal={true} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                yAxisId="primary"
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                tickFormatter={axisCompact}
                axisLine={false}
                tickLine={false}
                width={45}
                tickMargin={8}
              />
              {supervisorMode && (
                <YAxis
                  yAxisId="secondary"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                  tickFormatter={axisCompact}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  tickMargin={8}
                />
              )}
              {bars.length === 3 && !supervisorMode && (
                <>
                  <YAxis
                    yAxisId="secondary"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                    tickFormatter={axisCompact}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                    tickMargin={8}
                  />
                  <YAxis
                    yAxisId="tertiary"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                    tickFormatter={percentFormat}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                    tickMargin={8}
                  />
                </>
              )}
              {bars.length === 2 && !supervisorMode && (
                <YAxis
                  yAxisId="secondary"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                  tickFormatter={axisCompact}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  tickMargin={8}
                  hide={chartType === 'bars'}
                />
              )}
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => {
                  const val = typeof value === 'number' ? value : 0;
                  const nm = String(name ?? '');
                  const bar = bars.find(b => b.key === nm);
                  if (bar?.label.includes('%') || bar?.label.includes('Rate')) {
                    return [`${val.toFixed(2)}%`, bar?.label || nm];
                  }
                  return [val.toLocaleString('en-IN'), bar?.label || nm];
                }}
                labelStyle={{ fontWeight: 700, color: '#0f172a', fontSize: 12 }}
                labelFormatter={(label) => `Week ${label}`}
              />
              <Bar
                yAxisId="primary"
                dataKey={bars[0].key}
                name={bars[0].key}
                fill={bars[0].color}
                radius={[4, 4, 0, 0]}
                maxBarSize={supervisorMode ? 24 : bars.length === 3 ? 20 : 28}
                isAnimationActive={false}
              />
              {bars.length >= 2 && chartType === 'mixed' && !supervisorMode ? (
                <Line
                  yAxisId="secondary"
                  dataKey={bars[1].key}
                  name={bars[1].key}
                  stroke={bars[1].color}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 2, stroke: bars[1].color, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: bars[1].color, fill: '#fff' }}
                  type="monotone"
                  isAnimationActive={false}
                />
              ) : bars.length >= 2 && !supervisorMode ? (
                <Bar
                  yAxisId="secondary"
                  dataKey={bars[1].key}
                  name={bars[1].key}
                  fill={bars[1].color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={bars.length === 3 ? 20 : 28}
                  isAnimationActive={false}
                />
              ) : null}
              {supervisorMode && bars.length >= 2 && (
                <Line
                  yAxisId="secondary"
                  dataKey={bars[1].key}
                  name={bars[1].key}
                  stroke={bars[1].color}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 2, stroke: bars[1].color, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: bars[1].color, fill: '#fff' }}
                  type="monotone"
                  isAnimationActive={false}
                />
              )}
              {bars.length === 3 && chartType === 'mixed' && !supervisorMode && (
                <Line
                  yAxisId="tertiary"
                  dataKey={bars[2].key}
                  name={bars[2].key}
                  stroke={bars[2].color}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 2, stroke: bars[2].color, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: bars[2].color, fill: '#fff' }}
                  type="monotone"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default memo(WeeklyActivityChart);