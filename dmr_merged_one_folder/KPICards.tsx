// src/modules/operations/dashboard/components/KPICards.tsx

import { useMemo, memo } from "react";
import {
  Truck,
  ShoppingBag,
  IndianRupee,
  Wallet,
  Hourglass,
  ReceiptIndianRupee,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ---------- Type Definitions ----------
export interface DashboardMetrics {
  totalTrips?: number;
  totalSalesWeight?: number;
  totalSalesAmount?: number;
  totalCollections?: number;
  pendingCollections?: number;
  totalExpenses?: number;
  fuelExpense?: number;
  tripExpense?: number;
}

export interface KPICardsProps {
  current: DashboardMetrics;
  previous?: DashboardMetrics;
  rangeDays?: number;
}

// ---------- Helpers ----------
const safeNumber = (value: unknown): number => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

const formatLargeNumber = (
  value: number
): { main: string; suffix: string } => {
  const abs = Math.abs(value);
  if (abs >= 10000000) {
    return {
      main: (value / 10000000).toFixed(2),
      suffix: "Cr",
    };
  } else if (abs >= 100000) {
    return {
      main: (value / 100000).toFixed(2),
      suffix: "L",
    };
  } else {
    return {
      main: value.toLocaleString(),
      suffix: "",
    };
  }
};

const formatCurrency = (amount: unknown): { main: string; suffix: string } => {
  const num = safeNumber(amount);
  const { main, suffix } = formatLargeNumber(num);
  return {
    main: `₹${main}`,
    suffix,
  };
};

const formatWeightNumber = (value: unknown): { main: string; suffix: string } => {
  const num = safeNumber(value);
  return formatLargeNumber(num);
};

// ---------- Configuration ----------
const cardConfig = {
  "Total Trips": {
    bg: "bg-blue-500",
    text: "text-blue-600",
    icon: Truck,
  },
  "Total Weight (KG)": {
    bg: "bg-green-500",
    text: "text-green-600",
    icon: ShoppingBag,
  },
  "Total Sales Amount": {
    bg: "bg-violet-500",
    text: "text-violet-600",
    icon: IndianRupee,
  },
  "Total Collections": {
    bg: "bg-orange-500",
    text: "text-orange-600",
    icon: Wallet,
  },
  "Pending Collections": {
    bg: "bg-cyan-500",
    text: "text-cyan-600",
    icon: Hourglass,
  },
  "Total Expenses": {
    bg: "bg-pink-500",
    text: "text-pink-600",
    icon: ReceiptIndianRupee,
  },
} as const;

type CardLabel = keyof typeof cardConfig;

// ---------- Individual Card ----------
interface KPICardProps {
  label: CardLabel;
  value: number;
  prevValue: number;
  unit?: "KG" | "₹";
  rangeDays?: number;
  breakdown?: { fuel: number; trip: number };
}

const KPICard = memo(function KPICard({
  label,
  value,
  prevValue,
  unit,
  rangeDays,
  breakdown,
}: KPICardProps) {
  const config = cardConfig[label];
  const Icon = config.icon;

  const change = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : 0;
  const isUp = change > 0;
  const isDown = change < 0;

  let displayMain: string;
  let displaySuffix: string = "";

  if (unit === "₹") {
    const formatted = formatCurrency(value);
    displayMain = formatted.main;
    displaySuffix = formatted.suffix;
  } else if (unit === "KG") {
    const formatted = formatWeightNumber(value);
    displayMain = formatted.main;
    displaySuffix = formatted.suffix;
  } else {
    const formatted = formatLargeNumber(value);
    displayMain = formatted.main;
    displaySuffix = formatted.suffix;
  }

  // Shortened comparison label
  let rangeLabel = "vs 7d";
  if (rangeDays && rangeDays > 0) {
    rangeLabel = `vs ${rangeDays}d`;
  }

  let badgeClasses =
    "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ";
  let iconElement: React.ReactNode = null;

  if (isUp) {
    badgeClasses += "bg-green-50 text-green-600";
    iconElement = <TrendingUp size={10} />;
  } else if (isDown) {
    badgeClasses += "bg-red-50 text-red-500";
    iconElement = <TrendingDown size={10} />;
  } else {
    badgeClasses += "bg-slate-100 text-slate-500";
    iconElement = <span className="w-3" />;
  }

  // ✅ Uniform number size for all cards (no conditional)
  const numberSizeClass = "text-2xl";

  const showBreakdown = label === "Total Expenses" && breakdown;

  // Left content – vertically centered
  const leftContent = (
    <div className="flex flex-col justify-center flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${config.bg}`} />
        <p
          className="text-xs font-medium text-slate-500 truncate whitespace-nowrap"
          title={label}
        >
          {label}
        </p>
      </div>

      <h2
        className={`mt-0.5 ${numberSizeClass} font-bold leading-none tracking-tight ${config.text}`}
      >
        {displayMain}
        {displaySuffix && (
          <span className="ml-0.5 text-xs font-medium text-slate-400">
            {displaySuffix}
          </span>
        )}
      </h2>

      <div className={badgeClasses}>
        {iconElement}
        {Math.abs(change).toFixed(1)}%
        <span className="text-slate-400 font-medium">{rangeLabel}</span>
      </div>
    </div>
  );

  // Card content – smaller icon
  const cardContent = (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-slate-50 opacity-80" />

      <div className="relative flex items-center gap-3">
        {leftContent}

        <div
          className={`
            ${config.bg}
            h-9 w-9 rounded-xl shadow-md
            flex items-center justify-center flex-shrink-0
            transition-transform duration-300 group-hover:scale-110
          `}
        >
          <Icon className="text-white" size={18} />
        </div>
      </div>
    </div>
  );

  // ---- Expense breakdown tooltip (now BELOW the card) ----
  if (showBreakdown) {
    return (
      <div className="relative cursor-help group">
        {cardContent}
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2">
              <span className="font-medium text-slate-600">Breakdown</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Fuel Expense</span>
                <span className="font-medium text-slate-800">₹{breakdown.fuel.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Trip Expense</span>
                <span className="font-medium text-slate-800">₹{breakdown.trip.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45"></div>
        </div>
      </div>
    );
  }

  return cardContent;
});

// ---------- Main Component ----------
export default function KPICards({
  current,
  previous,
  rangeDays,
}: KPICardsProps) {
  const cards = useMemo(() => {
    const prev = previous || {};
    return [
      {
        label: "Total Trips" as CardLabel,
        value: safeNumber(current.totalTrips),
        prevValue: safeNumber(prev.totalTrips),
      },
      {
        label: "Total Weight (KG)" as CardLabel,
        value: safeNumber(current.totalSalesWeight),
        prevValue: safeNumber(prev.totalSalesWeight),
        unit: "KG" as const,
      },
      {
        label: "Total Sales Amount" as CardLabel,
        value: safeNumber(current.totalSalesAmount),
        prevValue: safeNumber(prev.totalSalesAmount),
        unit: "₹" as const,
      },
      {
        label: "Total Collections" as CardLabel,
        value: safeNumber(current.totalCollections),
        prevValue: safeNumber(prev.totalCollections),
        unit: "₹" as const,
      },
      {
        label: "Pending Collections" as CardLabel,
        value: safeNumber(current.pendingCollections),
        prevValue: safeNumber(prev.pendingCollections),
        unit: "₹" as const,
      },
      {
        label: "Total Expenses" as CardLabel,
        value: safeNumber(current.totalExpenses),
        prevValue: safeNumber(prev.totalExpenses),
        unit: "₹" as const,
        breakdown: {
          fuel: safeNumber(current.fuelExpense),
          trip: safeNumber(current.tripExpense),
        },
      },
    ];
  }, [current, previous]);

  const finalCards = useMemo(
    () => cards.map((card) => ({ ...card, rangeDays })),
    [cards, rangeDays]
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {finalCards.map((card) => (
        <KPICard key={card.label} {...card} />
      ))}
    </div>
  );
}