import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface TopShopsChartProps {
  data: any;
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#06b6d4", "#ef4444"];

const formatIndianNumber = (num: number): string => {
  return num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-sm text-slate-700">{d.name}</p>
      <p className="text-sm text-slate-600">₹{formatIndianNumber(d.amount)}</p>
      <p className="text-xs text-slate-400">{d.percent.toFixed(1)}%</p>
    </div>
  );
};

export default function TopShopsChart({ data }: TopShopsChartProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    let items: any[] = [];

    if (Array.isArray(data)) {
      items = data;
    } else if (typeof data === "object") {
      const nestedKeys = ["shops", "items", "data", "list", "topShops"];
      let found = false;
      for (const key of nestedKeys) {
        if (data[key] && Array.isArray(data[key])) {
          items = data[key];
          found = true;
          break;
        }
      }
      if (!found) {
        const values = Object.values(data);
        const allNumbers = values.every((v) => typeof v === "number" && !isNaN(v));
        if (allNumbers) {
          items = Object.entries(data).map(([name, amount]) => ({
            shopName: name,
            amount: Number(amount),
          }));
        }
      }
    }

    if (!items || items.length === 0) return [];

    const mapped = items
      .map((item: any) => {
        let amount = 0;
        let name = "Unknown";

        if (typeof item === "number") {
          amount = item;
          name = `Shop ${items.indexOf(item) + 1}`;
        } else if (typeof item === "object") {
          const possibleAmountFields = ["amount", "sales", "total", "value", "salesAmount", "totalSales", "amountValue"];
          const possibleNameFields = ["shopName", "name", "label", "title", "shop", "store"];

          for (const field of possibleAmountFields) {
            if (item[field] !== undefined && !isNaN(Number(item[field]))) {
              amount = Number(item[field]);
              break;
            }
          }
          for (const field of possibleNameFields) {
            if (item[field]) {
              name = String(item[field]);
              break;
            }
          }
        }

        return { name, amount };
      })
      .filter((item) => item.amount > 0);

    const total = mapped.reduce((sum, d) => sum + d.amount, 0);
    return mapped.map((d) => ({
      ...d,
      percent: total > 0 ? (d.amount / total) * 100 : 0,
    }));
  }, [data]);

  const totalAmount = useMemo(() => chartData.reduce((sum, d) => sum + d.amount, 0), [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 h-[338px] w-full flex flex-col items-center justify-center overflow-hidden min-w-0">
        <p className="text-sm">No sales data available</p>
        <p className="text-xs text-slate-300 mt-1 break-words">
          (all shops have zero or no positive sales)
        </p>
        <details className="mt-2 text-left w-full">
          <summary className="text-xs cursor-pointer text-blue-500 hover:text-blue-700 truncate">
            🔍 Click to see raw data
          </summary>
          <pre className="text-xs bg-slate-100 p-2 rounded mt-1 overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-[338px] w-full min-w-0 overflow-hidden flex flex-col">
      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex-shrink-0 text-center">
        Sales Amount by Shop (Top 5)
      </h3>

      {/* ✅ Chart centred, legend below */}
      <div className="flex flex-col items-center flex-1 min-h-0">
        {/* Donut Chart – centred, takes most of the space */}
        <div className="w-full flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={82}
                paddingAngle={2}
                cornerRadius={4}
                stroke="none"
              >
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <text
                x="50%"
                y="47%"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-700 font-bold"
                style={{ fontSize: "13px" }}
              >
                ₹{formatIndianNumber(totalAmount)}
              </text>
              <text
                x="50%"
                y="58%"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-400 font-normal"
                style={{ fontSize: "10px" }}
              >
                Total
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ✅ Legend below the chart – centred, wraps nicely */}
        <div className="w-full flex flex-wrap justify-center gap-x-4 gap-y-1.5 flex-shrink-0 pb-1 pt-1">
          {chartData.map((d, index) => (
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