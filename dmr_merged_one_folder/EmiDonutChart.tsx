import { memo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface EmiDonutChartProps {
  data: { name: string; value: number }[];
}

const COLORS = ['#22c55e', '#f59e0b'];

const EmiDonutChart = ({ data }: EmiDonutChartProps) => {
  const hasData = data.some(item => item.value > 0);

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No EMI data available
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
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
          <Tooltip formatter={(value) => `${value} EMIs`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default memo(EmiDonutChart);