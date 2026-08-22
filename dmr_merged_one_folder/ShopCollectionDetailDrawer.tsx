import { useState, useEffect } from "react";
import { X, Eye, IndianRupee, Calendar, User, CreditCard, Hash, FileText, Trash2, Loader2, AlertCircle } from "lucide-react";
import type { Collection, CollectionApiEntry } from "../../types/collection";
import { collectionService } from "../../services/collectionService";
import { useSafeNotification } from "../../../../../hooks/useSafeNotification";
import { opsSecondaryButtonClass, opsPrimaryButtonClass } from "../../../../../shared/ui/operationsStyles";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

interface ShopCollectionDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
  allCollections: Collection[];
  latestCollection: Collection | null;
  onRefresh: () => void;
}

export function ShopCollectionDetailDrawer({
  isOpen,
  onClose,
  shopName,
  allCollections,
  latestCollection,
  onRefresh,
}: ShopCollectionDetailDrawerProps) {
  const { showNotification } = useSafeNotification();

  const shopCollections = allCollections
    .filter((c) => c.shopName === shopName)
    .sort((a, b) => b.collectionDate.localeCompare(a.collectionDate));

  const selected = latestCollection ?? shopCollections[0] ?? null;

  const [recentList, setRecentList] = useState<CollectionApiEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const shopId = collectionService.getShopIdForName(shopName);
    if (!isOpen || !shopId) {
      if (!isOpen) setRecentList([]);
      return;
    }
    setRecentLoading(true);
    collectionService
      .fetchRecentCollectionsForShop(shopId, 10)
      .then((rows) => {
        if (!cancelled) setRecentList(rows);
      })
      .catch(() => {
        if (!cancelled) setRecentList([]);
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, shopName]);

  const handleDeleteCollection = async (collection: CollectionApiEntry) => {
    if (!collection.canDelete) {
      showNotification("Cannot delete – collection is outside the 7-day deletion window.", "error");
      return;
    }
    if (!window.confirm(`Delete collection ${collection.collectionNo} dated ${formatDate(collection.collectionDate)} for ₹${formatCurrency(Number(collection.amount))}?`)) {
      return;
    }
    setDeletingId(collection.id);
    try {
      const result = await collectionService.deletePendingCollection(String(collection.id));
      if (result.success) {
        showNotification("Collection deleted successfully.", "success");
        onRefresh();
        onClose();
      } else {
        showNotification(result.message ?? "Delete failed.", "error");
      }
    } catch {
      showNotification("Delete failed.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  const totalCollections = shopCollections.reduce((sum, c) => sum + c.amount, 0);
  const currentOutstanding = collectionService.getShopBalance(shopName);
  const lastCollectionDate = shopCollections.length > 0 ? shopCollections[0].collectionDate : "-";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-3xl h-full max-h-full bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Eye size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Shop Collection Details</h3>
              <p className="text-sm text-slate-600 font-medium">{shopName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[calc(100vh-120px)] overflow-y-auto space-y-5">
          {/* Shop Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-red-600 mb-1">
                <IndianRupee size={14} />
                Current Outstanding
              </div>
              <div className="text-lg font-bold text-red-700">{formatCurrency(currentOutstanding)}</div>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-green-600 mb-1">
                <CreditCard size={14} />
                Total Collections
              </div>
              <div className="text-lg font-bold text-green-700">{formatCurrency(totalCollections)}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-blue-600 mb-1">
                <Calendar size={14} />
                Last Collection
              </div>
              <div className="text-lg font-bold text-blue-700">{formatDate(lastCollectionDate)}</div>
            </div>
          </div>

          {/* Selected Collection Details */}
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Hash size={14} className="text-slate-500" />
                Latest Collection Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                    <Hash size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Collection No.</p>
                    <p className="text-sm font-medium text-slate-800">{selected.collectionNo || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                    <Calendar size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Collection Date</p>
                    <p className="text-sm font-medium text-slate-800">{formatDate(selected.collectionDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                    <User size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Collector</p>
                    <p className="text-sm font-medium text-slate-800">{selected.collectorName || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                    <CreditCard size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Payment Mode</p>
                    <p className="text-sm font-medium text-slate-800">{selected.paymentModeName || "Cash"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                    <Hash size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Reference No.</p>
                    <p className="text-sm font-medium text-slate-800">{selected.referenceNo || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                    <IndianRupee size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Amount Received</p>
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(selected.amount)}</p>
                  </div>
                </div>
                {selected.remarks && (
                  <div className="sm:col-span-2 flex items-start gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0 mt-0.5">
                      <FileText size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Remarks</p>
                      <p className="text-sm text-slate-700">{selected.remarks}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Collection Transactions */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={14} className="text-slate-500" />
                Recent Collection Transactions (Latest 10)
              </h4>
              {recentLoading && recentList.length === 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" />
                  Loading...
                </span>
              )}
            </div>
            {recentLoading && recentList.length === 0 ? (
              <div className="p-8 text-center text-slate-500">Loading recent collections...</div>
            ) : recentList.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No collections found for this shop.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Collection ID</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Amount</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Mode</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Collector</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {recentList.slice(0, 10).map((col) => (
                      <tr key={col.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-700">{col.collectionNo || "-"}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(col.collectionDate)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{formatCurrency(Number(col.amount) || 0)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                            {col.paymentMode || "Cash"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{col.collector || "-"}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            col.status === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            col.status === "Pending Approval" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            col.status === "Rejected" ? "bg-red-50 text-red-700 border-red-200" :
                            "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                            {col.status || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {col.canDelete && col.status === "Approved" && !col.deleted ? (
                            <button
                              onClick={() => handleDeleteCollection(col)}
                              disabled={deletingId === col.id}
                              title="Delete Collection"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingId === col.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentList.length >= 10 && (
                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                    <p className="text-xs text-slate-400 text-center">
                      Showing latest 10 of {recentList.length}+ collections — full history is available in Shop Ledger.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 bg-slate-50/50 flex-shrink-0">
          <button
            onClick={onClose}
            className={opsSecondaryButtonClass}
          >
            <X size={16} className="mr-1" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}