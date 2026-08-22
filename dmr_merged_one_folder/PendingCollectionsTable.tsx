import React from "react";
import { Eye, Trash2, Hash, User, CreditCard, Calendar, ShoppingBag, TrendingUp, Phone, Building2 } from "lucide-react";
import type { PendingReportRow } from "../../types/collection";

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

interface Props {
  data: PendingReportRow[];
  selectedShopName: string | null;
  onSelectShop: (shopName: string | null) => void;
  onView: (shopName: string) => void;
  onDelete: (shopName: string) => void;
  grandTotalPending: number;
  grandTotalWeeklySales: number;
  grandTotalWeeklyCollections: number;
  totalShops: number;
  isLoading?: boolean;
}

function PendingCollectionsTable({
  data,
  selectedShopName,
  onSelectShop,
  onView,
  onDelete,
  grandTotalPending,
  grandTotalWeeklySales,
  grandTotalWeeklyCollections,
  totalShops,
  isLoading = false,
}: Props) {
  const handleRowClick = (shopName: string) => {
    if (selectedShopName === shopName) {
      onSelectShop(null);
    } else {
      onSelectShop(shopName);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
        <div className="inline-flex items-center gap-2 text-slate-400 text-sm font-medium">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Loading pending collections...
        </div>
      </div>
    );
  }

  const selectedShop = data.find((s) => s.shopName === selectedShopName);

  const formattedGrandTotal = formatBalance(grandTotalPending);

  return (
    <>
      <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/80 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-bold text-slate-800 tracking-tight">
          Pending Collections
          <span className="ml-2 text-[11px] font-medium text-slate-500">
            {totalShops} Shops
          </span>
          {selectedShop && (
            <span className="ml-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full align-middle">
              {selectedShop.shopName}
            </span>
          )}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs md:text-sm">
          <thead className="bg-slate-50/80 border-b border-slate-200/70">
            <tr className="text-slate-700 whitespace-nowrap">
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-center gap-1.5">
                  <Hash size={14} className="text-slate-400" />
                  S.No
                </div>
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Shop Name
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Owner
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Mobile
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center justify-center gap-1.5">
                  <Calendar size={14} className="text-blue-600" />
                  Last Collection
                </div>
              </th>
              <th className="px-3.5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Balance
              </th>
              <th className="px-3.5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center justify-center gap-1.5">
                  <ShoppingBag size={14} className="text-blue-600" />
                  Recent Sales
                </div>
              </th>
              <th className="px-3.5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center justify-center gap-1.5">
                  <CreditCard size={14} className="text-green-600" />
                  Recent Collections
                </div>
              </th>
              <th className="px-3.5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center justify-center gap-1.5">
                  <TrendingUp size={14} className="text-purple-600" />
                  Recovery %
                </div>
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Overdue
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400 text-sm font-medium">
                  No shops found.
                </td>
              </tr>
            ) : (
              data.map((shop, index) => {
                const isSelected = selectedShopName === shop.shopName;
                const balance = shop.balance;
                const weeklySales = shop.weeklySales;
                const weeklyCollections = shop.weeklyApprovedCollections;
                const recovery = shop.recoveryPercentage;

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
                    onClick={() => handleRowClick(shop.shopName)}
                    aria-selected={isSelected}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50/70 shadow-[inset_3px_0_0_0_#10b981] hover:bg-emerald-50"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="px-3.5 py-3 text-center text-xs font-semibold text-slate-500">
                      {isSelected && (
                        <span className="mr-1 inline-flex items-center justify-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                      )}
                      {index + 1}
                    </td>
                    <td className="px-3.5 py-3 text-xs font-semibold text-slate-700">{shop.shopName}</td>
                    <td className="px-3.5 py-3 text-xs text-slate-600">{shop.ownerName || "—"}</td>
                    <td className="px-3.5 py-3 text-xs text-slate-600">{shop.phoneNumber || "—"}</td>
                    <td className="px-3.5 py-3 text-center text-xs font-medium text-slate-600">{formatDate(shop.lastCollectionDate)}</td>
                    <td className={`px-3.5 py-3 text-right text-xs font-bold ${balanceColor}`}>{formatBalance(balance)}</td>
                    <td className="px-3.5 py-3 text-right text-xs font-bold text-blue-600">{formatCurrency(weeklySales)}</td>
                    <td className="px-3.5 py-3 text-right text-xs font-bold text-green-600">{formatCurrency(weeklyCollections)}</td>
                    <td className={`px-3.5 py-3 text-right text-xs font-bold ${recoveryColor}`}>{recovery.toFixed(1)}%</td>
                    <td className="px-3.5 py-3 text-center">
                      {shop.overdueDays != null && shop.overdueDays > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                          {shop.overdueDays}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-center">
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
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default React.memo(PendingCollectionsTable);