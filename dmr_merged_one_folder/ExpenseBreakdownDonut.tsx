// src/modules/fleet-operations/components/analytics/ExpenseBreakdownDonut.tsx
import { memo, useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrencyCompact } from '../../utils/formatters';

interface ExpenseData {
  name: string;
  value: number;
}

interface ExpenseBreakdownDonutProps {
  data: ExpenseData[];
  height?: number;
}

const SUPPORTED_CATEGORIES = ['Fuel', 'Maintenance', 'Other'];

const COLOR_BY_NAME: Record<string, string> = {
  Fuel: '#2563eb',
  Maintenance: '#f59e0b',
  Other: '#64748b',
};

const FALLBACK_COLORS = ['#2563eb', '#f59e0b', '#64748b'];

const ExpenseBreakdownDonut = ({ data, height = 280 }: ExpenseBreakdownDonutProps) => {
  const items = useMemo(
    () => (Array.isArray(data) ? data.filter((item) => Number(item.value) > 0 && SUPPORTED_CATEGORIES.includes(item.name)) : []),
    [data]
  );

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [items]
  );

  if (items.length === 0 || total <= 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-400"
      >
        No expense data for the selected filters.
      </div>
    );
  }

  const chartData = items.map((item) => ({
    ...item,
    percentage: total > 0 ? (item.value / total) * 100 : 0,
  }));

  return (
    <div className="flex h-full w-full flex-col" style={{ minHeight: height }}>
      <div className="relative mx-auto h-40 w-40 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="66%"
              outerRadius="90%"
              paddingAngle={3}
              dataKey="value"
              isAnimationActive={false}
            >
              {chartData.map((item, index) => (
                <Cell
                  key={item.name}
                  fill={COLOR_BY_NAME[item.name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${formatCurrencyCompact(Number(value))} · ${
                  total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0.0'
                }%`,
                name,
              ]}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 20px -6px rgba(15, 23, 42, 0.15)',
                fontSize: '12px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Total Cost
          </span>
          <span className="text-base font-black text-slate-900">{formatCurrencyCompact(total)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {chartData.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{
                backgroundColor:
                  COLOR_BY_NAME[item.name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
              }}
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-600">{item.name}</span>
            <span className="tabular-nums font-medium text-slate-400">{item.percentage.toFixed(1)}%</span>
            <span className="w-20 text-right tabular-nums font-bold text-slate-700">
              {formatCurrencyCompact(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(ExpenseBreakdownDonut);