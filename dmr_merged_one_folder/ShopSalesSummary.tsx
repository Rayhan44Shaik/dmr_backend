import React from "react";
import { Store, Bird, Scale, IndianRupee, TrendingUp, Activity } from "lucide-react";
import type { ShopSaleSummary } from "../types/shopSale";

interface Props {
  summary: ShopSaleSummary;
  fromDate: string;
  toDate: string;
  shopName: string;
  isLoading?: boolean;
}

function ShopSalesSummary({ summary, fromDate, toDate, shopName, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center text-slate-400">
        Loading summary...
      </div>
    );
  }

  const hasData =
    summary.totalShops > 0 ||
    summary.totalBirds > 0 ||
    summary.totalWeight > 0 ||
    summary.totalAmount > 0;

  if (!hasData) {
    return null;
  }

  const cards = [
    {
      title: "Total Shops",
      value: summary.totalShops,
      icon: <Store size={20} />,
      bg: "bg-blue-50",
      text: "text-blue-700",
    },
    {
      title: "Total Birds",
      value: summary.totalBirds.toLocaleString(),
      icon: <Bird size={20} />,
      bg: "bg-green-50",
      text: "text-green-700",
    },
    {
      title: "Total Weight",
      value: `${summary.totalWeight.toFixed(2)} KG`,
      icon: <Scale size={20} />,
      bg: "bg-orange-50",
      text: "text-orange-600",
    },
    {
      title: "Total Amount",
      value: `₹ ${summary.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      icon: <IndianRupee size={20} />,
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    {
      title: "Avg Rate",
      value: `₹ ${summary.averageRate.toFixed(2)}`,
      icon: <TrendingUp size={20} />,
      bg: "bg-purple-50",
      text: "text-purple-700",
    },
    {
      title: "Avg Weight / Bird",
      value: `${summary.averageWeightPerBird.toFixed(2)} KG`,
      icon: <Activity size={20} />,
      bg: "bg-cyan-50",
      text: "text-cyan-700",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="text-sm text-slate-500">
        <span className="font-medium">Applied Filter:</span>{" "}
        {fromDate || toDate
          ? `${fromDate || "—"} → ${toDate || "—"}`
          : "No date filter"}
        {shopName.trim() && ` | Shop: ${shopName}`}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`${card.bg} rounded-lg border border-slate-200 px-3 py-3 flex items-center justify-between hover:shadow-sm transition-all`}
          >
            <div>
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{card.title}</div>
              <div className={`text-base font-bold mt-0.5 ${card.text}`}>{card.value}</div>
            </div>
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${card.bg} ${card.text}`}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(ShopSalesSummary);