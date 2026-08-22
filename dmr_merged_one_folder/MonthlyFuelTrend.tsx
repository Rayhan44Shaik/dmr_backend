import { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MonthlyFuelTrendProps {
  data: { month: string; fuel: number }[];
}

// Simple formatter inline to avoid import issues
const formatCurrencyCompact = (value: number): string => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
};

const MonthlyFuelTrend = ({ data }: MonthlyFuelTrendProps) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Fuel Expense</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(value) => value.substring(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => formatCurrencyCompact(value)} />
            <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
            <Line type="monotone" dataKey="fuel" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default memo(MonthlyFuelTrend);