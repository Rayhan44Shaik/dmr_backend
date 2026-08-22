import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

interface CollectionsPieProps {
  data: { name: string; value: number }[];
}

export default function CollectionsPie({ data }: CollectionsPieProps) {
  const chartData = data || [];

  const enrichedData = useMemo(() => {
    const total = chartData.reduce((sum, d) => sum + d.value, 0);
    return chartData.map((d) => ({
      ...d,
      percent: total > 0 ? (d.value / total) * 100 : 0,
    }));
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-slate-400 h-[338px] w-full flex items-center justify-center">
        No data
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-[338px] w-full min-w-0 overflow-hidden flex flex-col mr-2">
      {/* ✅ Heading changed to "Collections Summary", kept centered & semi-bold */}
      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex-shrink-0 text-center">
        Collections Summary
      </h3>

      <div className="flex flex-col items-center flex-1 min-h-0">
        <div className="w-full flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enrichedData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={82}
                paddingAngle={2}
                cornerRadius={4}
                stroke="none"
              >
                {enrichedData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => `₹ ${value?.toLocaleString() ?? "0"}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full flex flex-wrap justify-center gap-x-4 gap-y-1.5 flex-shrink-0 pb-1 pt-1">
          {enrichedData.map((d, index) => (
            <div key={d.name} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: COLORS[index % COLORS.length] }}
              />
              <span className="font-medium text-slate-600 truncate max-w-[140px]">{d.name}</span>
              <span className="text-slate-400 flex-shrink-0 whitespace-nowrap">
                {d.percent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}