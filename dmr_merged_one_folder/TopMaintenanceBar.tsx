import { memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TopMaintenanceBarProps {
  data: { vehicle: string; cost: number }[];
}

// Simple formatter inline
const formatCurrencyCompact = (value: number): string => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
};

const TopMaintenanceBar = ({ data }: TopMaintenanceBarProps) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 5 Maintenance Cost</h3>
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
          No maintenance data this month
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 5 Maintenance Cost</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(value) => formatCurrencyCompact(value)} />
            <YAxis dataKey="vehicle" type="category" tick={{ fontSize: 10 }} width={60} />
            <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
            <Bar dataKey="cost" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default memo(TopMaintenanceBar);