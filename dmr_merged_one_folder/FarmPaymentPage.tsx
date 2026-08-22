import { useState, useEffect, useMemo } from 'react';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import { FarmPaymentTable } from '../components/farm-payment/FarmPaymentTable';
import { FarmerPaymentFilters } from '../components/farm-payment/FarmerPaymentFilters';
import { tripService } from '../../operations/vehicle-trips/services/tripService';
import { FarmPaymentService } from '../services/FarmPaymentService';
import type { Trip } from '../../operations/vehicle-trips/types/trip';
import type { FarmPayment } from '../types/farmPayment.types';
import { Save, RotateCcw } from 'lucide-react';
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from '../../../shared/ui/paginationStyles';

type FarmerPaymentPageProps = { embedded?: boolean };

export function FarmerPaymentPage({ embedded = false }: FarmerPaymentPageProps) {
  const { showNotification } = useSafeNotification();

  // ----- state -----
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Payment state management
  const [paymentData, setPaymentData] = useState<Record<string, Partial<FarmPayment>>>({});
  const [savingPayments, setSavingPayments] = useState(false);

  // Filter states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFarm, setSelectedFarm] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ----- load data -----
  const loadCompletedTrips = () => {
    setLoading(true);
    try {
      const all = tripService.getAll();
      
      const completed = all.filter((t) => {
        const isCompleted = t.status === 'Completed';
        const notDeleted = !t.deleted;
        const pickupSubmitted = t.pickupStepSubmitted === true;
        return isCompleted && notDeleted && pickupSubmitted;
      });
      
      setAllTrips(completed);

      const savedPayments: Record<string, Partial<FarmPayment>> = {};
      completed.forEach((trip) => {
        const tripId = String(trip.id);
        const existingPayment = FarmPaymentService.getByTripId(tripId);
        
        if (existingPayment) {
          savedPayments[tripId] = {
            ...existingPayment,
            totalBirds: trip.totalBirds || 0,
            dcWeight: trip.dcWeight || 0,
          };
        } else {
          savedPayments[tripId] = {
            tripId,
            totalBirds: trip.totalBirds || 0,
            dcWeight: trip.dcWeight || 0,
            paymentStatus: 'Unpaid',
          };
        }
      });
      
      setPaymentData(savedPayments);
    } catch (error) {
      console.error('Failed to load trips:', error);
      showNotification('Failed to load trips', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompletedTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, selectedFarm, statusFilter, searchQuery]);

  // ----- compute unique farms -----
  const farms = useMemo(() => {
    const farmSet = new Set(allTrips.map((t) => t.sourceFarm).filter(Boolean));
    return ['All', ...Array.from(farmSet)];
  }, [allTrips]);

  // ----- filter trips -----
  const filteredTrips = useMemo(() => {
    return allTrips.filter((trip) => {
      if (dateFrom && trip.tripDate < dateFrom) return false;
      if (dateTo && trip.tripDate > dateTo) return false;
      if (selectedFarm !== 'All' && trip.sourceFarm !== selectedFarm) return false;

      const tripPayment = paymentData[String(trip.id)];
      const paymentStatus = tripPayment?.paymentStatus || 'Unpaid';
      
      if (statusFilter === 'Paid' && paymentStatus !== 'Paid') return false;
      if (statusFilter === 'Partially Paid' && paymentStatus !== 'Partially Paid') return false;
      if (statusFilter === 'Unpaid' && paymentStatus !== 'Unpaid') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          trip.tripNo.toLowerCase().includes(q) ||
          trip.vehicleNo.toLowerCase().includes(q) ||
          trip.sourceFarm.toLowerCase().includes(q) ||
          trip.driverName.toLowerCase().includes(q) ||
          trip.supervisorName.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [allTrips, dateFrom, dateTo, selectedFarm, statusFilter, searchQuery, paymentData]);

  // ----- compute KPI totals (based on filtered trips) -----
  const totalBirdsKPI = useMemo(() => {
    return filteredTrips.reduce((sum, trip) => sum + (trip.totalBirds || 0), 0);
  }, [filteredTrips]);

  const totalWeightKPI = useMemo(() => {
    return filteredTrips.reduce((sum, trip) => sum + (trip.dcWeight || 0), 0);
  }, [filteredTrips]);

  const totalAmountKPI = useMemo(() => {
    return filteredTrips.reduce((sum, trip) => {
      const payment = paymentData[String(trip.id)];
      return sum + (payment?.totalAmount || 0);
    }, 0);
  }, [filteredTrips, paymentData]);

  const totalPaidKPI = useMemo(() => {
    return filteredTrips.reduce((sum, trip) => {
      const payment = paymentData[String(trip.id)];
      return sum + (payment?.amountPaid || 0);
    }, 0);
  }, [filteredTrips, paymentData]);

  const totalBalanceKPI = useMemo(() => {
    return totalAmountKPI - totalPaidKPI;
  }, [totalAmountKPI, totalPaidKPI]);

  // ----- pagination -----
  const totalPages = Math.ceil(filteredTrips.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrips = filteredTrips.slice(startIndex, startIndex + itemsPerPage);
  const startEntry = filteredTrips.length === 0 ? 0 : startIndex + 1;
  const endEntry = Math.min(startIndex + itemsPerPage, filteredTrips.length);
  void startEntry;
  void endEntry;

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  // ----- payment handlers -----
  const handlePaymentUpdate = (tripId: string, updates: Partial<FarmPayment>) => {
    setPaymentData((prev) => {
      const existing = prev[tripId] || {};
      return {
        ...prev,
        [tripId]: {
          ...existing,
          ...updates,
          tripId,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const handleSaveAll = async () => {
    const paymentsToSave = Object.entries(paymentData).filter(([, payment]) => {
      return payment.ratePerBird !== undefined || 
             payment.ratePerKg !== undefined || 
             payment.totalAmount !== undefined;
    });

    if (paymentsToSave.length === 0) {
      showNotification('No payments to save. Please fill in payment details first.', 'info');
      return;
    }

    setSavingPayments(true);

    try {
      let savedCount = 0;
      let partialCount = 0;

      for (const [tripId, paymentDataItem] of paymentsToSave) {
        const trip = allTrips.find(t => String(t.id) === tripId);
        if (!trip) continue;

        const totalBirdsLoaded = trip.totalBirds || 0;
        const dcWeight = trip.dcWeight || 0;
        const ratePerBird = paymentDataItem.ratePerBird || 0;
        const totalAmount = paymentDataItem.totalAmount || (totalBirdsLoaded * ratePerBird);
        const paidAmount = paymentDataItem.amountPaid || 0;
        const paymentStatus = paidAmount > 0 
          ? (paidAmount >= totalAmount ? 'Paid' : 'Partially Paid')
          : (paymentDataItem.paymentStatus || 'Unpaid');

        const finalPayment: FarmPayment = {
          ...paymentDataItem,
          tripId,
          totalBirds: totalBirdsLoaded,
          dcWeight: dcWeight,
          totalAmount,
          amountPaid: paidAmount,
          balance: totalAmount - paidAmount,
          paymentStatus,
          paidDate: paymentDataItem.paidDate || new Date().toISOString().split('T')[0],
          paymentMode: paymentDataItem.paymentMode || 'Cash',
          createdAt: paymentDataItem.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const existing = FarmPaymentService.getByTripId(tripId);
        if (existing) {
          FarmPaymentService.updatePayment(tripId, finalPayment);
        } else {
          FarmPaymentService.createPayment(finalPayment);
        }

        savedCount++;
        if (paymentStatus === 'Partially Paid') partialCount++;
      }

      setRefreshKey(prev => prev + 1);
      
      const message = partialCount > 0
        ? `Saved ${savedCount} payments (${partialCount} partial payments)`
        : `${savedCount} payments saved successfully`;
      showNotification(message, 'success');

    } catch (error) {
      console.error('Failed to save payments:', error);
      showNotification('Failed to save payments. Please try again.', 'error');
    } finally {
      setSavingPayments(false);
    }
  };

  const handleResetPayments = () => {
    if (Object.keys(paymentData).length === 0) {
      showNotification('No changes to reset', 'info');
      return;
    }

    const savedPayments: Record<string, Partial<FarmPayment>> = {};
    allTrips.forEach((trip) => {
      const tripId = String(trip.id);
      const existingPayment = FarmPaymentService.getByTripId(tripId);
      if (existingPayment) {
        savedPayments[tripId] = {
          ...existingPayment,
          totalBirds: trip.totalBirds || 0,
          dcWeight: trip.dcWeight || 0,
        };
      } else {
        savedPayments[tripId] = {
          tripId,
          totalBirds: trip.totalBirds || 0,
          dcWeight: trip.dcWeight || 0,
          paymentStatus: 'Unpaid',
        };
      }
    });
    setPaymentData(savedPayments);
    showNotification('All changes reset', 'info');
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    showNotification('Refreshed', 'info');
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedFarm('All');
    setStatusFilter('All');
    setSearchQuery('');
    setCurrentPage(1);
    showNotification('Filters cleared', 'info');
  };

  const modifiedCount = useMemo(() => {
    return Object.values(paymentData).filter(payment => {
      return payment.ratePerBird !== undefined || 
             payment.ratePerKg !== undefined || 
             payment.totalAmount !== undefined;
    }).length;
  }, [paymentData]);

  // Format number with L, Cr notation
  const formatNumber = (num: number): string => {
    if (num >= 10000000) {
      return `${(num / 10000000).toFixed(2)} Cr`;
    }
    if (num >= 100000) {
      return `${(num / 100000).toFixed(2)} L`;
    }
    return num.toLocaleString('en-IN');
  };

  // Format currency with L, Cr notation
  const formatCurrency = (amount: number): string => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  // Check if any filter is active
  const isFilterActive = dateFrom || dateTo || selectedFarm !== 'All' || statusFilter !== 'All' || searchQuery;

  // ----- render -----
  const content = (
    <div className={`w-full space-y-5 animate-in fade-in duration-500 ${
      embedded ? '' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
    }`}>
      {/* KPI Cards - Only show when filters are active */}
      {isFilterActive && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Birds</p>
            <p className="text-lg font-bold text-slate-800">{formatNumber(totalBirdsKPI)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Weight</p>
            <p className="text-lg font-bold text-slate-800">{formatNumber(totalWeightKPI)} Kg</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Amount</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totalAmountKPI)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Paid</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalPaidKPI)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Balance Due</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(totalBalanceKPI)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <FarmerPaymentFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        selectedFarm={selectedFarm}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        farms={farms}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onFarmChange={setSelectedFarm}
        onStatusChange={setStatusFilter}
        onSearchChange={setSearchQuery}
        onApply={() => setCurrentPage(1)}
        onClear={handleClearFilters}
      />

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Header with Save button */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-slate-50/80 to-white border-b border-slate-200/60">
          <h2 className="text-sm font-bold text-slate-800">Farm Payments</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetPayments}
              disabled={modifiedCount === 0}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              onClick={handleSaveAll}
              disabled={savingPayments || modifiedCount === 0}
              className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPayments ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} /> Save
                </>
              )}
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-3 text-slate-500 text-sm">Loading trips...</p>
          </div>
        ) : (
          <>
            <FarmPaymentTable
              trips={paginatedTrips}
              paymentData={paymentData}
              onPaymentUpdate={handlePaymentUpdate}
              onPaymentSaved={handleSaveAll}
              onRefresh={handleRefresh}
              showNotification={showNotification}
            />

            {/* Pagination Footer */}
            {shouldShowPagination(filteredTrips.length) && (
            <div className={paginationBarClass}>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={paginationNavBtnClass}
                >
                  Previous
                </button>

                {getPageNumbers().map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-slate-400">…</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={paginationPageBtnClass(currentPage === page)}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={paginationNavBtnClass}
                >
                  Next
                </button>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return content;
}