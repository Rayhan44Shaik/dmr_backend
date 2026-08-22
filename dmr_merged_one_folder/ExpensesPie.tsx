import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444"];

interface ExpensesPieProps {
  data: { name: string; value: number }[];
}

export default function ExpensesPie({ data }: ExpensesPieProps) {
  const chartData = data || [];
  if (chartData.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-slate-400">No data</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Expenses Summary</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value">
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: any) => `₹ ${value?.toLocaleString() ?? "0"}`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}