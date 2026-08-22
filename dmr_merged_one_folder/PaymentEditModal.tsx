// src/modules/accounts/components/payment-book/PaymentEditModal.tsx

import { useState, useEffect, useMemo } from 'react';
import { X, Clock } from 'lucide-react';
import type { Payment } from '../../types/payment.types';
import { PaymentService } from '../../services/PaymentService';
import { canEditItem } from '../../../../utils/dateUtils';

interface PaymentEditModalProps {
  isOpen: boolean;
  payment: Payment | null;
  onClose: () => void;
  onSave: (payment: Payment) => void;
}

const PAYMENT_TYPES = [
  'Farmer Payment',
  'Fuel Payment',
  'Vehicle Maintenance',
  'Salary Payment',
  'EMI Payment',
  'FASTag Recharge',
  'Office Expense',
  'Tax Payment',
  'Other Expense',
];

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'NEFT', 'RTGS', 'IMPS', 'Cheque'];

const CATEGORIES = ['Farmer', 'Fuel', 'Maintenance', 'Salary', 'Loan', 'Office', 'Tax', 'Other'];

export function PaymentEditModal({ isOpen, payment, onClose, onSave }: PaymentEditModalProps) {
  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: PAYMENT_TYPES[0],
    paymentMode: PAYMENT_MODES[0],
    paidTo: '',
    amount: 0,
    referenceNo: '',
    category: CATEGORIES[0],
    remarks: '',
    status: 'Draft' as Payment['status'],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const isEditMode = !!payment?.id;

  // Check if payment is editable (within 10 days) using global utility
  const isEditable = useMemo(() => {
    if (!payment?.createdAt) return true;
    return canEditItem(payment.createdAt);
  }, [payment]);

  useEffect(() => {
    if (payment && isOpen) {
      setForm({
        paymentDate: payment.paymentDate,
        paymentType: payment.paymentType,
        paymentMode: payment.paymentMode,
        paidTo: payment.paidTo,
        amount: payment.amount,
        referenceNo: payment.referenceNo,
        category: payment.category,
        remarks: payment.remarks || '',
        status: payment.status,
      });
    } else if (isOpen) {
      setForm({
        paymentDate: new Date().toISOString().split('T')[0],
        paymentType: PAYMENT_TYPES[0],
        paymentMode: PAYMENT_MODES[0],
        paidTo: '',
        amount: 0,
        referenceNo: '',
        category: CATEGORIES[0],
        remarks: '',
        status: 'Draft',
      });
    }
    setErrors({});
  }, [payment, isOpen]);

  const handleChange = (field: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.paymentDate) newErrors.paymentDate = 'Payment Date is required';
    if (!form.paymentType) newErrors.paymentType = 'Payment Type is required';
    if (!form.paymentMode) newErrors.paymentMode = 'Payment Mode is required';
    if (!form.paidTo.trim()) newErrors.paidTo = 'Paid To is required';
    if (form.amount <= 0) newErrors.amount = 'Amount must be greater than 0';
    if (!form.referenceNo.trim()) newErrors.referenceNo = 'Reference No is required';
    else {
      const existing = PaymentService.getPayments().filter(
        (p) => p.referenceNo === form.referenceNo && p.id !== payment?.id
      );
      if (existing.length > 0) {
        newErrors.referenceNo = 'Reference No must be unique';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const paymentData = {
      ...form,
      amount: Number(form.amount),
      createdBy: 'admin',
    };

    let saved: Payment;
    if (isEditMode && payment) {
      const updated = PaymentService.updatePayment(payment.id, paymentData);
      if (updated) saved = updated;
      else return;
    } else {
      saved = PaymentService.createPayment(paymentData);
    }
    onSave(saved);
    onClose();
  };

  if (!isOpen) return null;

  // If editing and not editable, show warning
  if (isEditMode && !isEditable) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center gap-3 text-amber-600 mb-4">
            <Clock size={24} />
            <h3 className="text-lg font-bold text-slate-800">Edit Not Allowed</h3>
          </div>
          <p className="text-sm text-slate-600">
            This payment is older than 10 days and cannot be edited.
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">
            {isEditMode ? 'Edit Payment' : 'New Payment'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => handleChange('paymentDate', e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border ${errors.paymentDate ? 'border-red-500' : 'border-slate-300'} text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
            />
            {errors.paymentDate && <p className="text-xs text-red-500 mt-1">{errors.paymentDate}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type *</label>
            <select
              value={form.paymentType}
              onChange={(e) => handleChange('paymentType', e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border ${errors.paymentType ? 'border-red-500' : 'border-slate-300'} text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white`}
            >
              {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.paymentType && <p className="text-xs text-red-500 mt-1">{errors.paymentType}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode *</label>
            <select
              value={form.paymentMode}
              onChange={(e) => handleChange('paymentMode', e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border ${errors.paymentMode ? 'border-red-500' : 'border-slate-300'} text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white`}
            >
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {errors.paymentMode && <p className="text-xs text-red-500 mt-1">{errors.paymentMode}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Paid To *</label>
            <input
              type="text"
              value={form.paidTo}
              onChange={(e) => handleChange('paidTo', e.target.value)}
              placeholder="Vendor, Farmer, Employee..."
              className={`w-full h-10 px-3 rounded-lg border ${errors.paidTo ? 'border-red-500' : 'border-slate-300'} text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
            />
            {errors.paidTo && <p className="text-xs text-red-500 mt-1">{errors.paidTo}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) *</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.amount || ''}
              onChange={(e) => handleChange('amount', e.target.valueAsNumber || 0)}
              className={`w-full h-10 px-3 rounded-lg border ${errors.amount ? 'border-red-500' : 'border-slate-300'} text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
            />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reference / Bill No *</label>
            <input
              type="text"
              value={form.referenceNo}
              onChange={(e) => handleChange('referenceNo', e.target.value)}
              placeholder="Unique reference"
              className={`w-full h-10 px-3 rounded-lg border ${errors.referenceNo ? 'border-red-500' : 'border-slate-300'} text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
            />
            {errors.referenceNo && <p className="text-xs text-red-500 mt-1">{errors.referenceNo}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {isEditMode && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value as Payment['status'])}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Paid">Paid</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => handleChange('remarks', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
              placeholder="Optional remarks"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm">
            {isEditMode ? 'Update Payment' : 'Create Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}