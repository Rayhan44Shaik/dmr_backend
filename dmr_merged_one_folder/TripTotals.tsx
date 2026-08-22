import React, { useMemo } from "react";
import { Store, Bird, Scale, HeartPulse } from "lucide-react";
import type { ShopDelivery } from "../types/trip";

interface Props {
  rows: ShopDelivery[];
}

function TripTotals({ rows }: Props) {
  const safeRows = rows ?? [];

  const totals = useMemo(() => {
    const totalShops = safeRows.length;
    const totalBirds = safeRows.reduce((sum, row) => sum + Number(row.birds || 0), 0);
    const totalWeight = safeRows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
    const totalMortality = safeRows.reduce((sum, row) => sum + Number(row.mortality || 0), 0);
    return { totalShops, totalBirds, totalWeight, totalMortality };
  }, [safeRows]);

  const cards = [
    {
      label: "Total Shops",
      value: totals.totalShops,
      icon: <Store size={18} />,
      bg: "bg-blue-50",
      textColor: "text-blue-700",
      border: "border-blue-200"
    },
    {
      label: "Total Birds",
      value: totals.totalBirds.toLocaleString(),
      icon: <Bird size={18} />,
      bg: "bg-green-50",
      textColor: "text-green-700",
      border: "border-green-200"
    },
    {
      label: "Total Weight",
      value: `${totals.totalWeight.toFixed(2)} Kg`,
      icon: <Scale size={18} />,
      bg: "bg-orange-50",
      textColor: "text-orange-700",
      border: "border-orange-200"
    },
    {
      label: "Total Mortality",
      value: totals.totalMortality,
      icon: <HeartPulse size={18} />,
      bg: "bg-red-50",
      textColor: "text-red-600",
      border: "border-red-200"
    },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} border ${card.border} rounded-xl px-4 py-4 flex flex-col justify-between hover:shadow-sm transition-all`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {card.label}
            </p>
            <div className={`p-1.5 rounded-full bg-white/70 shadow-sm text-slate-500 ${card.textColor}`}>
              {card.icon}
            </div>
          </div>
          <p className={`text-xl font-bold ${card.textColor}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

export default React.memo(TripTotals);