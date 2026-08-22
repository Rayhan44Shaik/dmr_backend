import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface MortalityChartProps {
  data: { date: string; mortality: number }[];
}

export default function MortalityChart({ data }: MortalityChartProps) {
  const chartData = data || [];
  if (chartData.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-slate-400">No data</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Mortality Trend</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="mortality" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}