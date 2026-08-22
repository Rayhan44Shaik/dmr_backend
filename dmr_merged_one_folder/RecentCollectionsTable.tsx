import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { RecentCollection } from "../../types/collection";

interface Props {
  collections: RecentCollection[];
  statusFilter: "Pending" | "Approved" | "Deleted";
  pendingApprovalCount: number;
  onStatusChange: (status: "Pending" | "Approved" | "Deleted") => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (collection: RecentCollection) => void;
  onDelete: (id: string) => void;
  onViewShop: (shopName: string) => void;
}

const inr = (n: number) =>
  "₹ " + Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "Approved":
      return "bg-green-100 text-green-700 border-green-200";
    case "Pending Approval":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "Rejected":
      return "bg-red-100 text-red-700 border-red-200";
    case "Deleted":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function getRowStyle(rawStatus: string): string {
  switch (rawStatus) {
    case "Pending Approval":
      return "bg-orange-50/50";
    case "Approved":
      return "bg-green-50/50";
    case "Deleted":
      return "bg-red-50/50 opacity-60";
    default:
      return "";
  }
}

export default function RecentCollectionsTable({
  collections,
  statusFilter,
  pendingApprovalCount,
  onStatusChange,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onViewShop,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter collections by search query (collection no, shop name, collector name)
  const filteredBySearch = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase().trim();
    return collections.filter(
      (col) =>
        col.collectionNo.toLowerCase().includes(q) ||
        col.shopName.toLowerCase().includes(q) ||
        col.collectorName.toLowerCase().includes(q)
    );
  }, [collections, searchQuery]);

  // Compute displayed data based on status filter
  const displayedData = useMemo(() => {
    let filtered: RecentCollection[] = [];

    if (statusFilter === "Pending") {
      // Pending tab: show all pending approval collections
      filtered = filteredBySearch.filter((col) => col.rawStatus === "Pending Approval");
    } else if (statusFilter === "Approved") {
      // Approved tab: show ONLY the latest approved collection per shop
      const approvedCollections = filteredBySearch.filter((col) => col.rawStatus === "Approved");
      const shopMap = new Map<string, RecentCollection>();

      approvedCollections.forEach((col) => {
        const existing = shopMap.get(col.shopName);
        if (!existing) {
          shopMap.set(col.shopName, col);
        } else {
          // Compare by approvedDate first, then by collectionDate, then by numericId as tiebreaker
          const existingDate = existing.approvedDate || existing.collectionDate;
          const currentDate = col.approvedDate || col.collectionDate;

          if (currentDate > existingDate) {
            shopMap.set(col.shopName, col);
          } else if (currentDate === existingDate) {
            // Tiebreaker: use numericId (higher = newer)
            const existingId = existing.numericId ?? 0;
            const currentId = col.numericId ?? 0;
            if (currentId > existingId) {
              shopMap.set(col.shopName, col);
            }
          }
        }
      });

      filtered = Array.from(shopMap.values());
    } else if (statusFilter === "Deleted") {
      // Deleted tab: show all deleted collections
      filtered = filteredBySearch.filter((col) => col.rawStatus === "Deleted");
    }

    // Sort by collection date descending (newest first)
    return filtered.sort((a, b) => b.collectionDate.localeCompare(a.collectionDate));
  }, [filteredBySearch, statusFilter]);

  const clearSearch = () => setSearchQuery("");

  const getEmptyStateMessage = (): string => {
    switch (statusFilter) {
      case "Pending":
        return "No pending collections found.";
      case "Approved":
        return "No approved collections found.";
      case "Deleted":
        return "No deleted collections found.";
      default:
        return "No collections found.";
    }
  };

  // Status tab classes - soft/light backgrounds with proper spacing
  const getTabClass = (status: "Pending" | "Approved" | "Deleted", isActive: boolean): string => {
    const base = "px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap rounded-lg border";
    if (isActive) {
      switch (status) {
        case "Pending":
          return `${base} bg-orange-100 text-orange-700 border-orange-200 shadow-sm`;
        case "Approved":
          return `${base} bg-green-100 text-green-700 border-green-200 shadow-sm`;
        case "Deleted":
          return `${base} bg-red-100 text-red-700 border-red-200 shadow-sm`;
      }
    }
    return `${base} bg-white text-slate-600 hover:bg-slate-50 border-slate-200`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Table Header - Title + Search + Status Tabs on top row, week range below title */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/80">
        {/* Top row: Title area | Search | Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Left: Title + Pending Count */}
          <div className="flex flex-col gap-1 flex-shrink-0 min-w-[220px]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">Recent Collections</h3>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
                Pending: {pendingApprovalCount}
              </span>
            </div>
          </div>

          {/* Middle: Search - expands to fill available space */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collection no, shop, collector..."
              className="h-8 w-full rounded-lg border border-slate-300 pl-8 pr-8 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Right: Status Tabs - soft/light backgrounds with gap between */}
          <div className="flex gap-2 flex-shrink-0">
            {(["Pending", "Approved", "Deleted"] as const).map((status) => (
              <button
                key={status}
                onClick={() => onStatusChange(status)}
                className={getTabClass(status, statusFilter === status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs md:text-sm">
          <thead className="bg-slate-50/80 border-b border-slate-200/70">
            <tr className="text-slate-700 whitespace-nowrap">
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-center gap-1.5">
                  S.No
                </div>
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Collection No
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Date
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Shop
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Collector
              </th>
              <th className="px-3.5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Amount
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Status
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">📋</span>
                    <span>{getEmptyStateMessage()}</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayedData.map((col, index) => {
                const isPending = col.rawStatus === "Pending Approval";
                const isDeleted = col.rawStatus === "Deleted";
                const rowStyle = getRowStyle(col.rawStatus || col.status);

                return (
                  <tr
                    key={`${col.id}-${index}`}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    } ${rowStyle}`}
                  >
                    <td className="px-3.5 py-3 text-center text-xs font-semibold text-slate-500">
                      {index + 1}
                    </td>
                    <td className="px-3.5 py-3 font-semibold text-slate-800 text-xs whitespace-nowrap">
                      {col.collectionNo}
                    </td>
                    <td className="px-3.5 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">
                      {col.collectionDate}
                    </td>
                    <td className="px-3.5 py-3 text-xs font-semibold text-slate-700">
                      {col.shopName}
                    </td>
                    <td className="px-3.5 py-3 text-xs font-medium text-slate-700">
                      {col.collectorName}
                    </td>
                    <td className="px-3.5 py-3 text-right text-xs font-bold text-slate-700">
                      {inr(col.amount)}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-[10px] font-medium border ${getStatusBadgeClass(col.rawStatus || col.status)}`}
                      >
                        {col.rawStatus || col.status}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {isPending ? (
                          <>
                            <button
                              onClick={() => onApprove(col.id)}
                              className="rounded-lg bg-green-100 px-3 py-1 text-[10px] font-medium text-green-700 transition hover:bg-green-200"
                              title="Approve"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => onEdit(col)}
                              className="rounded-lg bg-blue-100 px-3 py-1 text-[10px] font-medium text-blue-700 transition hover:bg-blue-200"
                              title="Edit"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => onDelete(col.id)}
                              className="rounded-lg bg-red-100 px-3 py-1 text-[10px] font-medium text-red-700 transition hover:bg-red-200"
                              title="Delete"
                            >
                              Delete
                            </button>
                          </>
                        ) : isDeleted ? (
                          <span className="text-xs text-slate-400 font-medium">Deleted</span>
                        ) : (
                          <button
                            onClick={() => onViewShop(col.shopName)}
                            className="rounded-lg bg-blue-100 px-4 py-1 text-[10px] font-medium text-blue-700 transition hover:bg-blue-200"
                            title="View"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}