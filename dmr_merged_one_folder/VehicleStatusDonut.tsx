import { memo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface VehicleStatusDonutProps {
  data: { name: string; value: number }[];
}

const COLORS = ['#059669', '#0ea5e9', '#94a3b8'];

const VehicleStatusDonut = ({ data }: VehicleStatusDonutProps) => {
  const hasData = data.some(item => item.value > 0);
  
  if (!hasData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Vehicle Status Overview</h3>
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
          No vehicle data available
        </div>
      </div>
    );
  }

  // Calculate total for percentages
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Vehicle Status Overview</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={60}
              dataKey="value"
              label={({ name, value }) => {
                const percent = total > 0 ? (value / total) * 100 : 0;
                return `${name}: ${percent.toFixed(0)}%`;
              }}
              labelLine={false}
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default memo(VehicleStatusDonut);