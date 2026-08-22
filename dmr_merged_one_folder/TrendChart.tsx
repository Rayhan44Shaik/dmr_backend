import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label,
} from "recharts";

interface TrendChartProps {
  data: { date: string; trips: number; weight: number; mortality?: number }[];
}

type Granularity = "daily" | "weekly" | "monthly";

const formatDate = (dateStr: string): string => {
  if (!dateStr) return "";
  if (dateStr.includes("W")) {
    const weekNum = dateStr.split("W")[1];
    return `Week ${weekNum}`;
  }
  if (/^\d{4}-\d{1,2}$/.test(dateStr)) {
    const [year, month] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).replace(",", "");
};

const aggregateData = (
  data: { date: string; trips: number; weight: number; mortality?: number }[],
  granularity: Granularity
): { date: string; trips: number; weight: number; mortality: number }[] => {
  if (granularity === "daily") {
    return data.map((d) => ({ ...d, mortality: d.mortality || 0 }));
  }

  const groups: Record<string, { trips: number; weight: number; mortality: number }> = {};

  data.forEach((item) => {
    const date = new Date(item.date);
    let key: string;

    if (granularity === "weekly") {
      const weekNum = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 0).getDate()) / 7);
      key = `${date.getFullYear()}-W${weekNum}`;
    } else {
      key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    }

    if (!groups[key]) {
      groups[key] = { trips: 0, weight: 0, mortality: 0 };
    }
    groups[key].trips += item.trips || 0;
    groups[key].weight += item.weight || 0;
    groups[key].mortality += item.mortality || 0;
  });

  return Object.entries(groups).map(([key, value]) => ({
    date: key,
    trips: value.trips,
    weight: value.weight,
    mortality: value.mortality,
  }));
};

const CustomTooltip = ({ active, payload, _label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
      <p className="text-xs font-medium text-slate-600 mb-1">{formatDate(_label)}</p>
      {payload.map((item: any, idx: number) => (
        <p key={idx} className="text-sm" style={{ color: item.color }}>
          {item.name}: {item.name === "Trips" ? item.value : `${item.value.toLocaleString()} ${item.name === "Sales (KG)" ? "KG" : "Birds"}`}
        </p>
      ))}
    </div>
  );
};

const CustomLegend = ({ payload }: any) => (
  <div className="flex items-center gap-8 mb-3 ml-2">
    {payload.map((entry: any) => (
      <div key={entry.value} className="flex items-center gap-2 text-sm text-slate-700">
        {entry.type === "line" ? (
          <div className="flex items-center">
            <div className="w-5 h-[3px] rounded-full" style={{ background: entry.color }} />
            <div className="w-2 h-2 rounded-full -ml-3" style={{ background: entry.color }} />
          </div>
        ) : (
          <div className="w-3 h-3 rounded-sm" style={{ background: entry.color }} />
        )}
        <span>{entry.value}</span>
      </div>
    ))}
  </div>
);

export default function TrendChart({ data }: TrendChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const chartData = data || [];

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        <p className="text-sm">No data available</p>
      </div>
    );
  }

  const aggregatedData = aggregateData(chartData, granularity);

  const maxTrips = Math.max(...aggregatedData.map((d) => d.trips), 1);
  const maxWeight = Math.max(...aggregatedData.map((d) => d.weight), 1);
  const maxMortality = Math.max(...aggregatedData.map((d) => d.mortality), 1);

  const tripsMax = Math.ceil(maxTrips / 10) * 10 + 5;
  const weightMax = Math.ceil(maxWeight / 1000) * 1000 + 1000;
  const mortalityMax = Math.ceil(maxMortality / 5) * 5 + 5;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Trips & Sales Trend</h3>

        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart
          data={aggregatedData}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          barCategoryGap={0}
          barGap={0}
        >
          <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="" />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            tickFormatter={formatDate}
            interval="preserveStartEnd"
          />

          {/* ── Left Y-axis: Trips ── */}
          <YAxis
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 9, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            domain={[0, tripsMax]}
            tickCount={6}
          >
            <Label value="Trips" angle={-90} position="insideLeft" style={{ textAnchor: "middle", fill: "#64748b", fontSize: 11 }} offset={-10} />
          </YAxis>

          {/* ── Right Y-axis 1: Sales (KG) ── */}
          <YAxis
            yAxisId="sales"
            orientation="right"
            tick={{ fontSize: 10, fill: "#22c55e" }}
            tickLine={false}
            axisLine={false}
            domain={[0, weightMax]}
            tickCount={6}
            tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toString())}
          >
            <Label value="Sales (KG)" angle={90} position="insideRight" style={{ textAnchor: "middle", fill: "#22c55e", fontSize: 11 }} offset={-5} />
          </YAxis>

          {/* ── Right Y-axis 2: Mortality (Birds) ── */}
          <YAxis
            yAxisId="mortality"
            orientation="right"
            tick={{ fontSize: 10, fill: "#ef4444" }}
            tickLine={false}
            axisLine={false}
            domain={[0, mortalityMax]}
            tickCount={5}
            // position on the far right by adding an offset
            // We can place it by using a larger margin and shifting the axis
            // but we can also just let it overlap slightly – we'll adjust the margin
          />

          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />

          {/* Blue bar: Trips */}
          <Bar yAxisId="left" dataKey="trips" fill="#3b82f6" name="Trips" barSize={20} radius={[4, 4, 0, 0]} />

          {/* Green line: Sales (KG) */}
          <Line
            yAxisId="sales"
            type="natural"
            dataKey="weight"
            stroke="#22c55e"
            strokeWidth={3}
            dot={{ r: 3, fill: "#22c55e", stroke: "#22c55e", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            name="Sales (KG)"
          />

          {/* Red line: Mortality (Birds) */}
          <Line
            yAxisId="mortality"
            type="natural"
            dataKey="mortality"
            stroke="#ef4444"
            strokeWidth={3}
            dot={{ r: 3, fill: "#ef4444", stroke: "#ef4444", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            name="Mortality (Birds)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}