import { Eye, Trash2 } from "lucide-react";
import type { CollectionPendingSummaryRow } from "../../types/collection";
import { opsTableHeaderBarClass, opsTableThClass, opsTableTdClass, opsTableRowClass, opsTableDivideClass, opsTableCardClass } from "../../../../../shared/ui/operationsStyles";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr || dateStr === "-") return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatBalance = (amount: number) => {
  const abs = Math.abs(amount);
  const formatted = formatCurrency(abs);
  if (amount > 0) return `+ ${formatted}`;
  if (amount < 0) return `- ${formatted}`;
  return formatted;
};

interface PendingTableProps {
  data: CollectionPendingSummaryRow[];
  selectedShopName: string | null;
  onSelectShop: (shopName: string | null) => void;
  onView: (shopName: string) => void;
  onDelete: (shopName: string) => void;
  grandTotalPending: number;
  grandTotalWeeklySales: number;
  grandTotalWeeklyCollections: number;
}

export function PendingTable({
  data,
  selectedShopName,
  onSelectShop,
  onView,
  onDelete,
  grandTotalPending,
  grandTotalWeeklySales,
  grandTotalWeeklyCollections,
}: PendingTableProps) {
  const handleRowClick = (shopName: string) => {
    if (selectedShopName === shopName) {
      onSelectShop(null);
    } else {
      onSelectShop(shopName);
    }
  };

  const selectedShop = data.find((s) => s.shopName === selectedShopName);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        No pending collections found.
      </div>
    );
  }

  const formattedGrandTotal = formatBalance(grandTotalPending);

  return (
    <div className={opsTableCardClass}>
      <div className="overflow-x-auto bg-white">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/80">
            <tr>
              <th className={opsTableThClass}>#</th>
              <th className={opsTableThClass}>Shop Name</th>
              <th className={opsTableThClass}>Last Collection</th>
              <th className={`${opsTableThClass} text-right`}>Balance</th>
              <th className={`${opsTableThClass} text-right`}>Recent Sales</th>
              <th className={`${opsTableThClass} text-right`}>Recent Collections</th>
              <th className={`${opsTableThClass} text-right`}>Recovery %</th>
              <th className={`${opsTableThClass} text-center`}>Overdue (Days)</th>
              <th className={`${opsTableThClass} text-center`}>Actions</th>
            </tr>
          </thead>
          <tbody className={`${opsTableDivideClass} bg-white`}>
            {data.map((shop, idx) => {
              const weeklySales = shop.weeklySales;
              const weeklyCollections = shop.weeklyApprovedCollections;
              const recovery = shop.recoveryPercentage;
              const balance = shop.balance;
              const balanceColor =
                balance > 0 ? "text-red-600" :
                balance < 0 ? "text-blue-600" :
                "text-slate-600";

              const recoveryColor =
                recovery >= 80 ? "text-green-600" :
                recovery >= 50 ? "text-amber-600" :
                "text-red-600";

              return (
                <tr
                  key={shop.shopId}
                  className={`${opsTableRowClass} ${selectedShopName === shop.shopName ? "bg-emerald-50/50" : ""}`}
                  onClick={() => handleRowClick(shop.shopName)}
                >
                  <td className={opsTableTdClass}>{idx + 1}</td>
                  <td className={`${opsTableTdClass} font-medium text-slate-800`}>{shop.shopName}</td>
                  <td className={opsTableTdClass}>{formatDate(shop.lastCollectionDate)}</td>
                  <td className={`${opsTableTdClass} text-right font-semibold ${balanceColor}`}>{formatBalance(balance)}</td>
                  <td className={`${opsTableTdClass} text-right text-blue-600`}>{formatCurrency(weeklySales)}</td>
                  <td className={`${opsTableTdClass} text-right text-green-600`}>{formatCurrency(weeklyCollections)}</td>
                  <td className={`${opsTableTdClass} text-right font-medium ${recoveryColor}`}>{recovery.toFixed(1)}%</td>
                  <td className={`${opsTableTdClass} text-center`}>
                    {shop.overdueDays != null && shop.overdueDays > 0 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                        {shop.overdueDays}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`${opsTableTdClass} text-center`}>
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onView(shop.shopName); }}
                        title="View Details"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(shop.shopName); }}
                        title="Delete Latest Collection"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={3} className={`${opsTableTdClass} font-bold text-slate-700`}>Total (All Pages)</td>
              <td className={`${opsTableTdClass} text-right font-bold text-slate-800`}>{formattedGrandTotal}</td>
              <td className={`${opsTableTdClass} text-right font-bold text-blue-600`}>{formatCurrency(grandTotalWeeklySales)}</td>
              <td className={`${opsTableTdClass} text-right font-bold text-green-600`}>{formatCurrency(grandTotalWeeklyCollections)}</td>
              <td colSpan={2} className={opsTableTdClass}></td>
              <td className={opsTableTdClass}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
