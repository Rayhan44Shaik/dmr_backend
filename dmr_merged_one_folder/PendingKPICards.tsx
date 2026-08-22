import { IndianRupee, TrendingUp, ShoppingBag, CreditCard } from "lucide-react";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

interface PendingKPICardsProps {
  totalPending: number;
  weeklySales: number;
  weeklyCollections: number;
  weeklyRecovery: number;
}

export function PendingKPICards({
  totalPending,
  weeklySales,
  weeklyCollections,
  weeklyRecovery,
}: PendingKPICardsProps) {
  const cards = [
    {
      label: "Total Outstanding",
      value: formatCurrency(totalPending),
      icon: IndianRupee,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      valueColor: "text-red-700",
      labelColor: "text-red-600",
      borderColor: "border-red-200",
      bgColor: "bg-red-50",
    },
    {
      label: "This Week Sales",
      value: formatCurrency(weeklySales),
      icon: ShoppingBag,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      valueColor: "text-blue-700",
      labelColor: "text-blue-600",
      borderColor: "border-blue-200",
      bgColor: "bg-blue-50",
    },
    {
      label: "This Week Collections",
      value: formatCurrency(weeklyCollections),
      icon: CreditCard,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      valueColor: "text-green-700",
      labelColor: "text-green-600",
      borderColor: "border-green-200",
      bgColor: "bg-green-50",
    },
    {
      label: "Recovery %",
      value: `${weeklyRecovery.toFixed(2)}%`,
      icon: TrendingUp,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      valueColor: "text-purple-700",
      labelColor: "text-purple-600",
      borderColor: "border-purple-200",
      bgColor: "bg-purple-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-2.5 rounded-lg border ${card.borderColor} ${card.bgColor} px-3 py-2.5 shadow-sm hover:shadow-md transition-shadow min-w-0`}
        >
          <div className={`rounded-full p-1.5 ${card.iconBg} shrink-0`}>
            <card.icon size={16} className={card.iconColor} />
          </div>
          <div className="min-w-0">
            <div className={`text-[11px] font-medium ${card.labelColor} truncate`}>{card.label}</div>
            <div className={`text-sm font-bold ${card.valueColor} truncate`}>{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}