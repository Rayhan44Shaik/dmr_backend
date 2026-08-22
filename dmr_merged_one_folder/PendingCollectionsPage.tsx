// src/modules/operations/collections/pages/PendingCollectionsPage.tsx

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collectionService } from "../services/collectionService";
import { useShops } from "../../../masters/shops/hooks/useShops";
import type { Collection, CollectionPendingSummaryRow, CollectionPendingSummaryTotals } from "../types/collection";
import type { Shop } from "../../../masters/shops/types/shop";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { useToast } from "../../../../components/common/ToastProvider";
import { ShopCollectionDetailModal } from "../components/pending/ShopCollectionDetailModal";
import PendingCollectionsFilters from "../components/pending/PendingCollectionsFilters";
import PendingCollectionsSummary from "../components/pending/PendingCollectionsSummary";
import PendingCollectionsTable from "../components/pending/PendingCollectionsTable";
import ShopSalesPagination from "../components/pending/ShopSalesPagination";
import { shouldShowPagination } from "../../../../shared/ui/paginationStyles";

const getCurrentWeekRange = (): { fromDate: string; toDate: string } => {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    fromDate: monday.toISOString().split("T")[0],
    toDate: sunday.toISOString().split("T")[0],
  };
};

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

const DEFAULT_PAGE_SIZE = 15;

interface PendingReportRow {
  shopId: number;
  shopName: string;
  ownerName: string;
  phoneNumber: string;
  weekStart: string;
  weekEnd: string;
  balance: number;
  weeklySales: number;
  weeklyApprovedCollections: number;
  weeklyPendingCollections: number;
  recoveryPercentage: number;
  overdueDays: number | null;
  lastCollectionDate: string | null | undefined;
  hasPendingCollections: boolean;
}

export default function PendingCollectionsPage() {
  const toast = useToast();

  // Load ALL shops from Master → Shops (Active + Inactive)
  const { shops, loading: shopsLoading, reload: reloadShops } = useShops();
  const allShops = shops; // Show ALL shops (Active + Inactive)

  // Collection data (all collections for lookup)
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);

  // Filter state (unapplied)
  const [shopName, setShopName] = useState("");
  const [sortBy, setSortBy] = useState("alphabeticalAZ");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [recoveryThreshold, setRecoveryThreshold] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Debounced search
  const debouncedSearchRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    if (debouncedSearchRef.current) {
      clearTimeout(debouncedSearchRef.current);
    }
    debouncedSearchRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => {
      if (debouncedSearchRef.current) {
        clearTimeout(debouncedSearchRef.current);
      }
    };
  }, [searchQuery]);

  // Applied filters
  const [appliedShopName, setAppliedShopName] = useState("");
  const [appliedSortBy, setAppliedSortBy] = useState("alphabeticalAZ");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");
  const [appliedRecoveryThreshold, setAppliedRecoveryThreshold] = useState(0);
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state for table
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);

  // Modal state
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Pending summary from backend (for shops that have collections)
  const [pendingSummaryRows, setPendingSummaryRows] = useState<CollectionPendingSummaryRow[]>([]);
  const [pendingTotals, setPendingTotals] = useState<CollectionPendingSummaryTotals>({
    weeklySales: 0,
    weeklyApprovedCollections: 0,
    weeklyPendingCollections: 0,
    balance: 0,
    recoveryPercentage: 0,
  });

  const loadData = useCallback(async () => {
    try {
      await collectionService.refreshFromBackend();
      const all = collectionService.getCollections();
      setAllCollections(all);
      setCollectionsLoading(false);
    } catch (error) {
      console.error("Failed to load collections:", error);
      setCollectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Initialize default date range (current week Mon-Sun)
  useEffect(() => {
    const { fromDate: mon, toDate: sun } = getCurrentWeekRange();
    setFromDate(mon);
    setToDate(sun);
    setAppliedFromDate(mon);
    setAppliedToDate(sun);
  }, []);

  // Fetch pending summary when applied date range changes
  useEffect(() => {
    if (!appliedFromDate || !appliedToDate) return;
    void collectionService.fetchPendingSummary(appliedToDate).then((payload) => {
      setPendingSummaryRows(payload.shops);
      setPendingTotals(payload.totals);
    }).catch(() => {
      setPendingSummaryRows([]);
    });
  }, [appliedFromDate, appliedToDate]);

// Build the complete report from ALL shops + backend data
  const reportData = useMemo((): PendingReportRow[] => {
    const summaryMap = new Map<string, CollectionPendingSummaryRow>();
    pendingSummaryRows.forEach((row) => summaryMap.set(row.shopName, row));

    return allShops.map((shop) => {
      const backendData = summaryMap.get(shop.shopName);
      if (backendData) {
        return {
          shopId: backendData.shopId,
          shopName: backendData.shopName,
          ownerName: shop.ownerName,
          phoneNumber: shop.phoneNumber,
          weekStart: backendData.weekStart,
          weekEnd: backendData.weekEnd,
          balance: backendData.balance,
          weeklySales: backendData.weeklySales,
          weeklyApprovedCollections: backendData.weeklyApprovedCollections,
          weeklyPendingCollections: backendData.weeklyPendingCollections,
          recoveryPercentage: backendData.recoveryPercentage,
          overdueDays: backendData.overdueDays,
          lastCollectionDate: backendData.lastCollectionDate,
          hasPendingCollections: backendData.hasPendingCollections,
        };
      }
      // Shop exists in Master but has no backend summary - show zeros
      return {
        shopId: shop.id,
        shopName: shop.shopName,
        ownerName: shop.ownerName,
        phoneNumber: shop.phoneNumber,
        weekStart: appliedFromDate,
        weekEnd: appliedToDate,
        balance: shop.currentBalance ?? 0,
        weeklySales: 0,
        weeklyApprovedCollections: 0,
        weeklyPendingCollections: 0,
        recoveryPercentage: 0,
        overdueDays: null,
        lastCollectionDate: null,
        hasPendingCollections: false,
      };
    });
  }, [allShops, pendingSummaryRows, appliedFromDate, appliedToDate]);

  // Apply filters (debounced search)
  const filteredData = useMemo(() => {
    let data = [...reportData];

    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      data = data.filter((s) => s.shopName.toLowerCase().includes(query));
    }

    if (appliedShopName) {
      data = data.filter((s) =>
        s.shopName.toLowerCase().startsWith(appliedShopName.toLowerCase())
      );
    }

    if (appliedFromDate) {
      data = data.filter((s) => (s.lastCollectionDate ?? "") >= appliedFromDate);
    }
    if (appliedToDate) {
      data = data.filter((s) => (s.lastCollectionDate ?? "") <= appliedToDate);
    }

    if (appliedRecoveryThreshold > 0) {
      data = data.filter((shop) => shop.recoveryPercentage >= appliedRecoveryThreshold);
    }

    switch (appliedSortBy) {
      case "highestBalance":
        data.sort((a, b) => b.balance - a.balance);
        break;
      case "lowestBalance":
        data.sort((a, b) => a.balance - a.balance);
        break;
      case "alphabeticalAZ":
        data.sort((a, b) => a.shopName.localeCompare(b.shopName));
        break;
      case "alphabeticalZA":
        data.sort((a, b) => b.shopName.localeCompare(a.shopName));
        break;
      case "latestCollection":
        data.sort((a, b) => (b.lastCollectionDate ?? "").localeCompare(a.lastCollectionDate ?? ""));
        break;
      case "oldestCollection":
        data.sort((a, b) => (a.lastCollectionDate ?? "").localeCompare(a.lastCollectionDate ?? ""));
        break;
      default:
        break;
    }
    return data;
  }, [
    reportData,
    debouncedSearchQuery,
    appliedShopName,
    appliedFromDate,
    appliedToDate,
    appliedSortBy,
    appliedRecoveryThreshold,
  ]);

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / DEFAULT_PAGE_SIZE) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * DEFAULT_PAGE_SIZE;
    return filteredData.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredData, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [appliedSearchQuery, appliedShopName, appliedFromDate, appliedToDate, appliedSortBy, appliedRecoveryThreshold]);

  // Totals for KPI
  const totalOutstanding = filteredData.reduce((sum, s) => sum + s.balance, 0);
  const totalWeeklySales = filteredData.reduce((sum, s) => sum + s.weeklySales, 0);
  const totalWeeklyCollections = filteredData.reduce((sum, s) => sum + s.weeklyApprovedCollections, 0);
  const avgRecovery = filteredData.length > 0
    ? filteredData.reduce((sum, s) => sum + s.recoveryPercentage, 0) / filteredData.length
    : 0;

  const getLatestCollection = (shopName: string): Collection | null => {
    const shopCollections = allCollections
      .filter((c) => c.shopName === shopName)
      .sort((a, b) => {
        const dateA = a.collectionDate || a.createdDate || "";
        const dateB = b.collectionDate || b.createdDate || "";
        return dateB.localeCompare(dateA);
      });
    return shopCollections.length > 0 ? shopCollections[0] : null;
  };

  const handleView = (shopName: string) => {
    setSelectedShop(shopName);
    setIsModalOpen(true);
  };

  const handleDelete = async (shopName: string) => {
    const latest = getLatestCollection(shopName);
    if (!latest || latest.numericId == null) {
      toast.error("No collection to delete.");
      return;
    }
    const shopId = collectionService.getShopIdForName(shopName);
    if (shopId != null) {
      try {
        const recent = await collectionService.fetchRecentCollectionsForShop(shopId, 1);
        if (recent[0]?.canDelete === false) {
          toast.error("Cannot delete – collection is outside the 7-day deletion window.");
          return;
        }
      } catch {
        // Eligibility pre-check failed; let backend be authoritative
      }
    }
    const result = await collectionService.deletePendingCollection(String(latest.numericId));
    if (result.success) {
      await refreshData();
      toast.success("Collection deleted successfully.");
    } else {
      toast.error(result.message ?? "Delete failed.");
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedShop(null);
  };

  const refreshData = async () => {
    try {
      await Promise.all([
        reloadShops(),
        collectionService.refreshFromBackend(),
      ]);
      const all = collectionService.getCollections();
      setAllCollections(all);
      if (appliedFromDate && appliedToDate) {
        try {
          const payload = await collectionService.fetchPendingSummary(appliedToDate);
          setPendingSummaryRows(payload.shops);
          setPendingTotals(payload.totals);
        } catch {
          // Keep prior summaries if refetch fails
        }
      }
      toast.success("Collection refreshed");
    } catch (error) {
      toast.error("Failed to refresh data.");
    }
  };

  const resetFilters = () => {
    const { fromDate: mon, toDate: sun } = getCurrentWeekRange();
    setFromDate(mon);
    setToDate(sun);
    setShopName("");
    setSortBy("alphabeticalAZ");
    setRecoveryThreshold(0);
    setSearchQuery("");
    setAppliedFromDate(mon);
    setAppliedToDate(sun);
    setAppliedShopName("");
    setAppliedSortBy("alphabeticalAZ");
    setAppliedRecoveryThreshold(0);
    setAppliedSearchQuery("");
    setCurrentPage(1);
    toast.info("Filters reset successfully.");
  };

  const hasPendingFilters =
    fromDate !== "" ||
    toDate !== "" ||
    shopName.trim() !== "" ||
    recoveryThreshold > 0 ||
    sortBy !== "alphabeticalAZ" ||
    searchQuery.trim() !== "";

  const hasActiveFilters =
    appliedFromDate !== "" ||
    appliedToDate !== "" ||
    appliedShopName.trim() !== "" ||
    appliedRecoveryThreshold > 0 ||
    appliedSortBy !== "alphabeticalAZ" ||
    appliedSearchQuery.trim() !== "";

  if (shopsLoading || collectionsLoading) {
    return (
      <div className="w-full space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
          <div className="inline-flex items-center gap-2 text-slate-400 text-sm font-medium">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            Loading pending collections...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-500">
      {/* Filter Bar */}
      <PendingCollectionsFilters
        fromDate={fromDate}
        toDate={toDate}
        shopName={shopName}
        sortBy={sortBy}
        shopNames={allShops.map((s) => s.shopName).sort()}
        recoveryThreshold={recoveryThreshold}
        searchQuery={searchQuery}
        setFromDate={setFromDate}
        setToDate={setToDate}
        setShopName={setShopName}
        setSortBy={setSortBy}
        setRecoveryThreshold={setRecoveryThreshold}
        setSearchQuery={setSearchQuery}
        onReset={resetFilters}
        onRefresh={refreshData}
        hasFilters={hasPendingFilters}
      />

      {/* KPI Summary Strip */}
      <PendingCollectionsSummary
        totalOutstanding={totalOutstanding}
        weeklySales={totalWeeklySales}
        weeklyCollections={totalWeeklyCollections}
        weeklyRecovery={avgRecovery}
        fromDate={appliedFromDate}
        toDate={appliedToDate}
        shopName={appliedShopName}
      />

      {/* Table Section */}
      <div className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-sm text-xs md:text-sm">
        <PendingCollectionsTable
          data={paginatedData}
          selectedShopName={selectedShopName}
          onSelectShop={setSelectedShopName}
          onView={handleView}
          onDelete={handleDelete}
          grandTotalPending={totalOutstanding}
          grandTotalWeeklySales={totalWeeklySales}
          grandTotalWeeklyCollections={totalWeeklyCollections}
          totalShops={allShops.length}
        />
        {shouldShowPagination(totalItems) && (
          <ShopSalesPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {selectedShop && (
        <ShopCollectionDetailModal
          isOpen={isModalOpen}
          onClose={closeModal}
          shopName={selectedShop}
          allCollections={allCollections}
          shops={allShops}
          latestCollection={getLatestCollection(selectedShop)}
          onRefresh={refreshData}
        />
      )}
    </div>
  );
}