import { Fuel, IndianRupee, FileText, CheckCircle, TrendingUp } from "lucide-react";

interface Props {
  totalLitres: number;
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  avgMileage: number | null;
  recentTripMileage: number | null;
}

export function FuelKPICards({
  totalLitres,
  totalAmount,
  pendingCount,
  approvedCount,
  avgMileage,
  recentTripMileage,
}: Props) {
  const baseCards = [
    {
      title: "Total Fuel (L)",
      value: totalLitres.toFixed(2),
      icon: <Fuel size={20} />,
      bg: "bg-blue-50",
      text: "text-blue-700",
    },
    {
      title: "Total Cost (₹)",
      value: `₹ ${totalAmount.toFixed(2)}`,
      icon: <IndianRupee size={20} />,
      bg: "bg-green-50",
      text: "text-green-700",
    },
    {
      title: "Pending Bills",
      value: pendingCount,
      icon: <FileText size={20} />,
      bg: "bg-yellow-50",
      text: "text-yellow-700",
    },
    {
      title: "Approved Bills",
      value: approvedCount,
      icon: <CheckCircle size={20} />,
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    {
      title: "Avg Efficiency (KM/L)",
      value: avgMileage !== null ? avgMileage.toFixed(2) : "—",
      icon: <TrendingUp size={20} />,
      bg: "bg-cyan-50",
      text: "text-cyan-700",
    },
  ];

  const extraCards = recentTripMileage !== null ? [
    {
      title: "Recent Trip Mileage (KM/L)",
      value: recentTripMileage.toFixed(2),
      icon: <TrendingUp size={20} />,
      bg: "bg-indigo-50",
      text: "text-indigo-700",
    },
  ] : [];

  const allCards = [...baseCards, ...extraCards];
  const gridCols = allCards.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-6";

  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${gridCols}`}>
      {allCards.map((card) => (
        <div
          key={card.title}
          className={`flex items-center justify-between rounded-lg border border-slate-200 p-4 shadow-sm ${card.bg}`}
        >
          <div>
            <div className="text-xs font-medium text-slate-500">{card.title}</div>
            <div className={`text-xl font-bold ${card.text}`}>{card.value}</div>
          </div>
          <div className={`rounded-full p-2 ${card.bg} ${card.text}`}>{card.icon}</div>
        </div>
      ))}
    </div>
  );
}