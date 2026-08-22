// src/modules/accounts/components/payment-book/PaymentTable.tsx

import { useState, useMemo } from 'react';
import type { Payment } from '../../types/payment.types';
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from '../../../../shared/ui/paginationStyles';

interface PaymentTableProps {
  payments: Payment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  itemsPerPage?: number;
}

export function PaymentTable({ payments, selectedId, onSelect, itemsPerPage = 10 }: PaymentTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(payments.length / itemsPerPage) || 1;
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return payments.slice(start, end);
  }, [payments, currentPage, itemsPerPage]);

  useMemo(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [payments, currentPage, totalPages]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Generate clean sequential Payment Number like #PAY-20260803-001
  const formatPaymentNo = (payment: Payment, index: number) => {
    const dateClean = payment.paymentDate ? payment.paymentDate.replace(/-/g, '') : '20260803';
    const sequentialNum = String(index + 1).padStart(3, '0');
    return `#PAY-${dateClean}-${sequentialNum}`;
  };

  const handleRowClick = (id: string) => {
    onSelect(selectedId === id ? null : id);
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

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, payments.length);
  void startItem;
  void endItem;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/80 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Payment No
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Date
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Payment Type
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Paid To
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-right">
                Amount
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Mode
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paginatedPayments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                  No payments found. Click <span className="font-semibold text-blue-600">"New Payment"</span> to add one.
                </td>
              </tr>
            ) : (
              paginatedPayments.map((payment, index) => {
                const isSelected = selectedId === payment.id;
                const absoluteIndex = (currentPage - 1) * itemsPerPage + index;
                return (
                  <tr
                    key={payment.id}
                    onClick={() => handleRowClick(payment.id)}
                    className={`cursor-pointer transition-all duration-150 group ${
                      isSelected
                        ? 'bg-blue-50/40 shadow-[inset_0_0_0_2px_#3b82f6]'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="px-6 py-4.5 text-sm font-mono font-semibold text-blue-600 whitespace-nowrap">
                      {formatPaymentNo(payment, absoluteIndex)}
                    </td>
                    <td className="px-6 py-4.5 text-sm text-slate-600 whitespace-nowrap">
                      {formatDate(payment.paymentDate)}
                    </td>
                    <td className="px-6 py-4.5 text-sm text-slate-700 whitespace-nowrap">
                      {payment.paymentType}
                    </td>
                    <td className="px-6 py-4.5 text-sm text-slate-700 whitespace-nowrap">
                      {payment.paidTo}
                    </td>
                    <td className="px-6 py-4.5 text-sm font-bold text-emerald-600 text-right whitespace-nowrap tracking-wide">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-6 py-4.5 text-sm text-slate-600 whitespace-nowrap">
                      {payment.paymentMode}
                    </td>
                    <td className="px-6 py-4.5 text-sm text-slate-500 truncate max-w-[240px]">
                      {payment.remarks || '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {shouldShowPagination(payments.length) && (
        <div className={paginationBarClass}>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={paginationNavBtnClass}
            >
              Previous
            </button>

            {getPageNumbers().map((page, idx) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400">…</span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={paginationPageBtnClass(currentPage === page)}
                >
                  {page}
                </button>
              )
            )}

            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={paginationNavBtnClass}
            >
              Next
            </button>
        </div>
      )}
    </div>
  );
}