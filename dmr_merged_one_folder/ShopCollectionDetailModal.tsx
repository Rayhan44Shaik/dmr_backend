import { useState, useEffect } from "react";
import { X, Eye, IndianRupee, Calendar, User, CreditCard, Hash, FileText, Trash2, Loader2, RotateCcw, Save } from "lucide-react";
import type { Collection, CollectionApiEntry } from "../../types/collection";
import type { Shop } from "../../../../masters/shops/types/shop";
import { collectionService } from "../../services/collectionService";
import { useSafeNotification } from "../../../../../hooks/useSafeNotification";
import { opsSecondaryButtonClass, opsPrimaryButtonClass } from "../../../../../shared/ui/operationsStyles";

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

interface ShopCollectionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
  allCollections: Collection[];
  shops: Shop[];
  latestCollection: Collection | null;
  onRefresh: () => void;
}

export function ShopCollectionDetailModal({
  isOpen,
  onClose,
  shopName,
  allCollections,
  shops,
  latestCollection,
  onRefresh,
}: ShopCollectionDetailModalProps) {
  const { showNotification } = useSafeNotification();

  const shopCollections = allCollections
    .filter((c) => c.shopName === shopName)
    .sort((a, b) => b.collectionDate.localeCompare(a.collectionDate));

  const selected = latestCollection ?? shopCollections[0] ?? null;

  const [recentList, setRecentList] = useState<CollectionApiEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

  // Find shop info for owner/mobile
  const shopInfo = shops.find((s) => s.shopName === shopName);

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

  // Reset deletion state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDeletingIds(new Set());
      setDeleting(new Set());
    }
  }, [isOpen]);

  const handleStageDelete = (collection: CollectionApiEntry) => {
    if (!collection.canDelete) {
      showNotification("Cannot delete – collection is outside the 7-day deletion window.", "error");
      return;
    }
    setDeletingIds((prev) => {
      const next = new Set(prev);
      if (next.has(collection.id)) {
        next.delete(collection.id);
      } else {
        next.add(collection.id);
      }
      return next;
    });
  };

  const handleSaveAndClose = async () => {
    if (deletingIds.size === 0) {
      onClose();
      return;
    }

    setDeleting(new Set(deletingIds));
    let hasError = false;

    for (const id of deletingIds) {
      try {
        const result = await collectionService.deletePendingCollection(String(id));
        if (!result.success) {
          showNotification(result.message ?? `Failed to delete collection ${id}.`, "error");
          hasError = true;
        }
      } catch {
        showNotification(`Failed to delete collection ${id}.`, "error");
        hasError = true;
      }
    }

    if (!hasError && deletingIds.size > 0) {
      showNotification(`${deletingIds.size} collection(s) deleted successfully.`, "success");
      await onRefresh();
    }

    setDeletingIds(new Set());
    setDeleting(new Set());
    onClose();
  };

  if (!isOpen) return null;

  const totalCollections = shopCollections.reduce((sum, c) => sum + c.amount, 0);
  const currentOutstanding = collectionService.getShopBalance(shopName);
  const lastCollectionDate = shopCollections.length > 0 ? shopCollections[0].collectionDate : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0 mt-0.5">
              <Eye size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Shop Collection Details</h3>
              <p className="text-sm text-slate-600 font-medium mt-0.5">{shopName}</p>
              {shopInfo && (
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <User size={14} className="text-slate-400" />
                    <span>Owner: <span className="font-medium text-slate-800">{shopInfo.ownerName || "—"}</span></span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </span>
                    <span>Mobile: <span className="font-medium text-slate-800">{shopInfo.phoneNumber || "—"}</span></span>
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 shrink-0"
            aria-label="Close"
            disabled={deleting.size > 0}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[calc(90vh-140px)] overflow-y-auto space-y-5">
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

          {/* Recent Collection Transactions */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={14} className="text-slate-500" />
                Recent Collection Transactions
              </h4>
              <span className="text-xs text-slate-500">Latest 10 transactions</span>
            </div>
            {recentLoading && recentList.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-slate-400" />
                Loading recent collections...
              </div>
            ) : recentList.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No collections found for this shop.</div>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Collection ID</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Amount</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Mode</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {recentList.slice(0, 10).map((col) => {
                      const isStaged = deletingIds.has(col.id);
                      const isDeleting = deleting.has(col.id);
                      return (
                        <tr
                          key={col.id}
                          className={`${isStaged ? "bg-red-50/50 line-through text-slate-400" : "hover:bg-slate-50/50"} transition-colors`}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-700">{col.collectionNo || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{formatDate(col.collectionDate)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{formatCurrency(Number(col.amount) || 0)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                              {col.paymentMode || "Cash"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isStaged ? (
                              <button
                                onClick={() => handleStageDelete(col)}
                                disabled={isDeleting}
                                title="Undo delete"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-green-600 hover:bg-green-50 transition disabled:opacity-50"
                              >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStageDelete(col)}
                                disabled={isDeleting || !col.canDelete || col.status !== "Approved" || col.deleted}
                                title={!col.canDelete || col.status !== "Approved" || col.deleted ? "Cannot delete – outside 7-day window or not approved" : "Stage for deletion"}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isDeleting ? (
                                  <Loader2 size={16} className="animate-spin text-slate-400" />
                                ) : (
                                  <Trash2 size={16} className="text-red-500" />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
            disabled={deleting.size > 0}
            className={opsSecondaryButtonClass}
          >
            <X size={16} className="mr-1" />
            Cancel
          </button>
          <button
            onClick={handleSaveAndClose}
            disabled={deleting.size > 0}
            className={`${opsPrimaryButtonClass} ${deletingIds.size > 0 ? "" : "opacity-60 cursor-not-allowed"}`}
          >
            {deleting.size > 0 ? (
              <>
                <Loader2 size={16} className="animate-spin mr-1" />
                Saving...
              </>
            ) : deletingIds.size > 0 ? (
              <>
                <Save size={16} className="mr-1" />
                Save & Close ({deletingIds.size})
              </>
            ) : (
              <>
                <X size={16} className="mr-1" />
                Close
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}