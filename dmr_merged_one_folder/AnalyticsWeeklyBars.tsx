import { memo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsWeeklyPoint } from '../../types/analytics';

interface AnalyticsWeeklyBarsProps {
  data: AnalyticsWeeklyPoint[];
  dataKey: 'fuel' | 'mileage';
  gradientId: string;
}

const MARGIN = { top: 5, right: 5, left: -25, bottom: 0 };
const TICK = { fontSize: 10, fill: '#94a3b8', fontWeight: 600 };
const TOOLTIP_STYLE = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' };

const AnalyticsWeeklyBars = ({ data, dataKey, gradientId }: AnalyticsWeeklyBarsProps) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={MARGIN}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={dataKey === 'fuel' ? '#3b82f6' : '#f59e0b'} stopOpacity={0.9} />
          <stop offset="95%" stopColor={dataKey === 'fuel' ? '#2563eb' : '#d97706'} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
      <XAxis dataKey="week" tick={TICK} axisLine={false} tickLine={false} />
      <YAxis tick={TICK} axisLine={false} tickLine={false} />
      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={TOOLTIP_STYLE} />
      <Bar
        dataKey={dataKey}
        fill={`url(#${gradientId})`}
        radius={[4, 4, 0, 0]}
        maxBarSize={28}
        isAnimationActive={false}
      />
    </BarChart>
  </ResponsiveContainer>
);

export default memo(AnalyticsWeeklyBars);
