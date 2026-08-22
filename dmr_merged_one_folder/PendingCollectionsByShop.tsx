import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

interface PendingItem {
  shopName: string;
  pendingAmount: number;
}

interface Props {
  data: PendingItem[];
}

export default function PendingCollectionsByShop({ data }: Props) {
  const navigate = useNavigate();

  const items = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return [...data]
      .sort((a, b) => b.pendingAmount - a.pendingAmount)
      .slice(0, 10);
  }, [data]);

  const maxAmount = useMemo(
    () => (items.length > 0 ? Math.max(...items.map((d) => d.pendingAmount)) : 0),
    [items]
  );

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-slate-400 h-[338px] w-full flex items-center justify-center">
        No pending collections data available
      </div>
    );
  }

  const handleViewAll = () => {
    navigate("/operations/collections/pending");
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-[338px] w-full overflow-hidden flex flex-col">
      {/* Header with Title + View All link */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-sm font-semibold text-slate-700">
          Pending Collections by Shop (Top 10)
        </h3>
        <button
          onClick={handleViewAll}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition whitespace-nowrap ml-4"
        >
          View All →
        </button>
      </div>

      {/* List of pending shops */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {items.map((item) => {
          const percent = maxAmount > 0 ? (item.pendingAmount / maxAmount) * 100 : 0;
          const barColor =
            percent > 70
              ? "bg-red-500"
              : percent > 40
              ? "bg-amber-500"
              : "bg-blue-500";

          return (
            <div key={item.shopName} className="flex items-center gap-3">
              <div className="w-1/3 text-xs font-medium text-slate-600 truncate">
                {item.shopName}
              </div>
              <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-500 ease-out rounded-full`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="w-1/4 text-right text-xs font-semibold text-slate-700 whitespace-nowrap">
                ₹{item.pendingAmount.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}