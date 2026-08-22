// src/modules/accounts/components/payment-book/PaymentDeleteModal.tsx

import { useMemo } from 'react';
import { X, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import type { Payment } from '../../types/payment.types';
import { canDeleteItem } from '../../../../utils/dateUtils';

interface PaymentDeleteModalProps {
  isOpen: boolean;
  payment: Payment | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function PaymentDeleteModal({ isOpen, payment, onClose, onConfirm }: PaymentDeleteModalProps) {
  // Check if payment is deletable using global utility
  const isDeletable = useMemo(() => {
    if (!payment?.createdAt) return true;
    return canDeleteItem(payment.createdAt);
  }, [payment]);

  if (!isOpen || !payment) return null;

  // If not deletable, show warning
  if (!isDeletable) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center gap-3 text-amber-600 mb-4">
            <Clock size={24} />
            <h3 className="text-lg font-bold text-slate-800">Delete Not Allowed</h3>
          </div>
          <p className="text-sm text-slate-600">
            This payment is older than 10 days and cannot be deleted.
          </p>
          <div className="flex justify-end mt-6">
            <button onClick={onClose} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm font-medium transition">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3 text-red-500">
            <AlertTriangle size={22} />
            <h3 className="text-lg font-bold text-slate-800">Confirm Delete</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="py-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete payment <span className="font-semibold text-slate-800">#{payment.paymentNo}</span>?
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Amount: <span className="font-semibold text-slate-600">₹{payment.amount.toLocaleString('en-IN')}</span>
            <br />
            Paid To: <span className="font-semibold text-slate-600">{payment.paidTo}</span>
          </p>
          <p className="text-xs text-red-500 mt-3">This action cannot be undone.</p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
            <Trash2 size={16} /> Delete Payment
          </button>
        </div>
      </div>
    </div>
  );
}