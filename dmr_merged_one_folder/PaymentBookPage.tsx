// src/modules/accounts/payment-book/PaymentBookPage.tsx

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import { PaymentTable } from '../components/payment-book/PaymentTable';
import { PaymentViewModal } from '../components/payment-book/PaymentViewModal';
import { PaymentEditModal } from '../components/payment-book/PaymentEditModal';
import { NewPaymentModal } from '../components/payment-book/NewPaymentModal';
import { PaymentService } from '../services/PaymentService';
import type { Payment } from '../types/payment.types';
import { DatePicker } from '../../../components/common/DatePicker';
import { canEditItem, canDeleteItem } from '../../../utils/dateUtils';
import { usePendingDelete } from '../../../hooks/usePendingDelete';
import { PendingDeleteNotification } from '../../../components/common/PendingDeleteNotification';
import {
  Download,
  RefreshCw,
  Plus,
  FileText,
  X,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  Tag,
  CreditCard,
  Wallet,
  Banknote,
  TrendingUp,
} from 'lucide-react';

type PaymentBookPageProps = { embedded?: boolean };

const formatCurrency = (amount: number): string => {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)}Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
};

export function PaymentBookPage({ embedded = false }: PaymentBookPageProps) {
  const { showNotification } = useSafeNotification();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const isFilterActive = useMemo(() => {
    return Boolean(dateFrom || dateTo || paymentType || paymentMode || searchQuery.trim());
  }, [dateFrom, dateTo, paymentType, paymentMode, searchQuery]);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [viewingPayment, setViewingPayment] = useState<Payment | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const loadPayments = useCallback(() => {
    const filters: any = { search: searchQuery };
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (paymentType) filters.paymentType = paymentType;
    if (paymentMode) filters.paymentMode = paymentMode;

    const data = PaymentService.getPayments(filters);
    setPayments(data);
    setLoading(false);
  }, [dateFrom, dateTo, paymentType, paymentMode, searchQuery]);

  // Auto-sync interval / listener setup for background entries
  useEffect(() => {
    loadPayments();

    const sync = () => {
      if (!document.hidden) loadPayments();
    };

    const interval = setInterval(sync, 1000); // Polls and auto-syncs entries instantly every second

    const handleVisibility = () => {
      if (!document.hidden) sync();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadPayments]);

  useEffect(() => {
    setSelectedId(null);
  }, [payments]);

  const kpis = useMemo(() => {
    if (!isFilterActive) {
      return { totalPayments: 0, cashPayments: 0, bankPayments: 0, totalTransactions: 0 };
    }
    
    let totalPayments = 0;
    let cashPayments = 0;
    let bankPayments = 0;

    payments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      totalPayments += amt;
      if (p.paymentMode && p.paymentMode.toLowerCase().includes('cash')) {
        cashPayments += amt;
      } else {
        bankPayments += amt;
      }
    });

    return {
      totalPayments,
      cashPayments,
      bankPayments,
      totalTransactions: payments.length,
    };
  }, [isFilterActive, payments]);

  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === selectedId) || null,
    [payments, selectedId]
  );

  const handleNewPayment = () => {
    setIsNewModalOpen(true);
  };

  const handleModalSave = (saved: Payment) => {
    showNotification(
      saved.id ? 'Payment successfully saved' : 'Action completed',
      'success'
    );
    loadPayments();
  };

  const handleView = () => {
    if (selectedPayment) {
      setViewingPayment(selectedPayment);
      setIsViewModalOpen(true);
    }
  };

  const handleEdit = () => {
    if (selectedPayment) {
      if (!canEditItem(selectedPayment.createdAt)) {
        showNotification('This payment is older than 10 days and cannot be edited.', 'error');
        return;
      }
      setEditingPayment(selectedPayment);
      setIsEditModalOpen(true);
    }
  };

  const { requestDelete, cancel, pendingItems } = usePendingDelete<string>((id) => {
    const success = PaymentService.deletePayment(id);
    if (success) {
      showNotification('Payment deleted successfully', 'success');
      setSelectedId(null);
      loadPayments();
    } else {
      showNotification('Failed to delete payment', 'error');
    }
  });

  const handleDelete = () => {
    if (selectedPayment) {
      if (!canDeleteItem(selectedPayment.createdAt)) {
        showNotification('This payment is older than 10 days and cannot be deleted.', 'error');
        return;
      }
      requestDelete(selectedPayment.id, { label: `Deleting payment to ${selectedPayment.paidTo}` });
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tableContainerRef.current && !tableContainerRef.current.contains(e.target as Node)) {
        setSelectedId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const paymentTypes = useMemo(() => {
    const types = new Set(PaymentService.getPayments().map((p) => p.paymentType));
    return Array.from(types);
  }, [payments]);

  const paymentModes = useMemo(() => {
    const modes = new Set(PaymentService.getPayments().map((p) => p.paymentMode));
    return Array.from(modes);
  }, [payments]);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setPaymentType('');
    setPaymentMode('');
    setSearchQuery('');
  };

  return (
    <div className={`w-full space-y-5 animate-in fade-in duration-500 ${
      embedded ? '' : 'px-4 md:px-8 py-6 md:py-8 bg-gradient-to-br from-slate-50 via-white to-slate-50 min-h-screen'
    }`}>
      {/* New Payment Button */}
      <div className="flex justify-end">
        <button
          onClick={handleNewPayment}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition-all shadow-md shadow-blue-200 flex items-center gap-2 hover:shadow-lg hover:scale-[1.02] active:scale-95"
        >
          <Plus size={16} /> New Payment
        </button>
      </div>

      {/* Compact KPI Cards (Only rendered when a filter is active) */}
      {isFilterActive && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FileText size={16} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total</p>
              <p className="text-sm font-bold text-slate-800">{formatCurrency(kpis.totalPayments)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Wallet size={16} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Cash</p>
              <p className="text-sm font-bold text-slate-800">{formatCurrency(kpis.cashPayments)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Banknote size={16} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Bank</p>
              <p className="text-sm font-bold text-slate-800">{formatCurrency(kpis.bankPayments)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Transactions</p>
              <p className="text-sm font-bold text-slate-800">{kpis.totalTransactions}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <Calendar className="inline w-3 h-3 mr-1" /> From
            </label>
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="Start date"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <Calendar className="inline w-3 h-3 mr-1" /> To
            </label>
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="End date"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <Tag className="inline w-3 h-3 mr-1" /> Type
            </label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
            >
              <option value="">All Types</option>
              {paymentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <CreditCard className="inline w-3 h-3 mr-1" /> Mode
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
            >
              <option value="">All Modes</option>
              {paymentModes.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <div className="flex-1 min-w-[180px] relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, paid to, amount..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
            />
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition bg-white flex items-center gap-1.5"
          >
            <X size={14} /> Clear
          </button>
          <button
            onClick={() => { loadPayments(); showNotification('Refreshed', 'info'); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition bg-white flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => showNotification('Export coming soon', 'info')}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition bg-white flex items-center gap-1.5"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div ref={tableContainerRef} className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-50/80 to-white border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">Payments</h2>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {payments.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleView}
              disabled={!selectedPayment}
              className={`p-1.5 rounded-lg transition-all ${
                selectedPayment
                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="View selected payment"
            >
              <Eye size={15} />
            </button>
            <button
              onClick={handleEdit}
              disabled={!selectedPayment}
              className={`p-1.5 rounded-lg transition-all ${
                selectedPayment
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Edit selected payment"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={handleDelete}
              disabled={!selectedPayment}
              className={`p-1.5 rounded-lg transition-all ${
                selectedPayment
                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Delete selected payment"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-slate-500 text-xs">Loading payments...</p>
          </div>
        ) : (
          <PaymentTable
            payments={payments}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
      </div>

      {/* ─── MODALS ─── */}
      <NewPaymentModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSave={handleModalSave}
      />

      <PaymentEditModal
        isOpen={isEditModalOpen}
        payment={editingPayment}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPayment(null);
        }}
        onSave={handleModalSave}
      />

      <PaymentViewModal
        isOpen={isViewModalOpen}
        payment={viewingPayment}
        onClose={() => {
          setIsViewModalOpen(false);
          setViewingPayment(null);
        }}
      />
    </div>
  );
}