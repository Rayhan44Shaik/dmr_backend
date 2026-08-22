// src/modules/accounts/components/payment-book/NewPaymentModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { X, CreditCard } from 'lucide-react';
import type { Payment } from '../../types/payment.types';
import { PaymentService } from '../../services/PaymentService';
import { getBanks } from '../../../masters/banks/services/bankService';
import { DatePicker } from '../../../../components/common/DatePicker';

interface NewPaymentModalProps {
  isOpen: boolean;
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

const TRANSACTION_METHODS = ['UPI', 'Netbanking', 'RTGS', 'NEFT', 'Cheque'];

const formatIndianCurrencyInput = (value: string): string => {
  const cleanNum = value.replace(/[^0-9]/g, '');
  if (!cleanNum) return '';
  const x = cleanNum.toString();
  const lastThree = x.substring(x.length - 3);
  const otherNumbers = x.substring(0, x.length - 3);
  if (otherNumbers !== '') {
    return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }
  return lastThree;
};

export function NewPaymentModal({ isOpen, onClose, onSave }: NewPaymentModalProps) {
  const paymentModeOptions = useMemo(() => {
    try {
      const activeBanks = getBanks()
        .filter((b) => b.status === 'Active')
        .map((b) => b.bankName);
      return ['Cash', ...activeBanks];
    } catch {
      return ['Cash'];
    }
  }, []);

  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: '',
    paymentMode: '',
    transactionMethod: '',
    paidTo: '',
    amount: '',
    referenceNo: '',
    remarks: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setForm({
        paymentDate: new Date().toISOString().split('T')[0],
        paymentType: '',
        paymentMode: '',
        transactionMethod: '',
        paidTo: '',
        amount: '',
        referenceNo: '',
        remarks: '',
      });
      setErrors({});
    }
  }, [isOpen]);

  const handleChange = (field: keyof typeof form, value: any) => {
    if (field === 'amount') {
      value = formatIndianCurrencyInput(value);
    }
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
    if (form.paymentMode && form.paymentMode !== 'Cash' && !form.transactionMethod) {
      newErrors.transactionMethod = 'Transaction Method is required';
    }
    if (!form.paidTo.trim()) newErrors.paidTo = 'Paid To is required';
    
    const rawAmount = Number(form.amount.replace(/,/g, ''));
    if (!form.amount || isNaN(rawAmount) || rawAmount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    
    if (form.referenceNo.trim()) {
      const existing = PaymentService.getPayments().filter(
        (p) => p.referenceNo === form.referenceNo
      );
      if (existing.length > 0) {
        newErrors.referenceNo = 'Reference No must be unique';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    const finalPaymentMode = form.paymentMode === 'Cash' 
      ? 'Cash' 
      : `${form.paymentMode} - ${form.transactionMethod}`;

    const rawAmount = Number(form.amount.replace(/,/g, ''));

    const paymentData = {
      paymentDate: form.paymentDate,
      paymentType: form.paymentType,
      paymentMode: finalPaymentMode,
      paidTo: form.paidTo,
      amount: rawAmount,
      referenceNo: form.referenceNo.trim() || `REF-${Date.now().toString().slice(-6)}`,
      category: form.paymentType, 
      remarks: form.remarks,
      status: 'Approved' as const, // Directly Approved / Paid instead of Draft
      createdBy: 'admin',
    };

    const saved = PaymentService.createPayment(paymentData);
    onSave(saved);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 sm:p-6 overflow-y-auto transition-opacity">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-auto transform transition-all overflow-visible border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 bg-slate-50/50 border-b border-slate-100 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-inner">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">New Payment</h3>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Record a new operational payment</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 hover:bg-slate-200/60 rounded-xl transition-colors text-slate-400 hover:text-slate-700 outline-none"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-8 py-6 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              
              {/* Payment Date */}
              <div className="relative z-20">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Payment Date <span className="text-rose-500">*</span></label>
                <DatePicker
                  value={form.paymentDate}
                  onChange={(val) => handleChange('paymentDate', val)}
                  className="w-full"
                  placement="bottom"
                  error={errors.paymentDate}
                />
              </div>

              {/* Payment Type */}
              <div className="relative z-10">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Payment Type <span className="text-rose-500">*</span></label>
                <select
                  value={form.paymentType}
                  onChange={(e) => handleChange('paymentType', e.target.value)}
                  className={`w-full h-10 px-3.5 rounded-lg border ${
                    errors.paymentType ? 'border-red-500 bg-red-50/50' : 'border-slate-300'
                  } text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all shadow-sm ${!form.paymentType ? 'text-slate-400 font-normal' : 'text-slate-800 font-medium'}`}
                >
                  <option value="" disabled className="text-slate-400">Select payment type...</option>
                  {PAYMENT_TYPES.map((t) => (
                    <option key={t} value={t} className="text-slate-800">{t}</option>
                  ))}
                </select>
                {errors.paymentType && <p className="text-xs text-red-500 mt-1.5">{errors.paymentType}</p>}
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Payment Mode <span className="text-rose-500">*</span></label>
                <select
                  value={form.paymentMode}
                  onChange={(e) => handleChange('paymentMode', e.target.value)}
                  className={`w-full h-10 px-3.5 rounded-lg border ${
                    errors.paymentMode ? 'border-red-500 bg-red-50/50' : 'border-slate-300'
                  } text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all shadow-sm ${!form.paymentMode ? 'text-slate-400 font-normal' : 'text-slate-800 font-medium'}`}
                >
                  <option value="" disabled className="text-slate-400">Select payment mode...</option>
                  {paymentModeOptions.map((m) => (
                    <option key={m} value={m} className="text-slate-800">{m}</option>
                  ))}
                </select>
                {errors.paymentMode && <p className="text-xs text-red-500 mt-1.5">{errors.paymentMode}</p>}
              </div>

              {/* Transaction Method (Conditional) */}
              {form.paymentMode && form.paymentMode !== 'Cash' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Transaction Method <span className="text-rose-500">*</span></label>
                  <select
                    value={form.transactionMethod}
                    onChange={(e) => handleChange('transactionMethod', e.target.value)}
                    className={`w-full h-10 px-3.5 rounded-lg border ${
                      errors.transactionMethod ? 'border-red-500 bg-red-50/50' : 'border-blue-300 bg-blue-50/30'
                    } text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm ${!form.transactionMethod ? 'text-blue-400 font-normal' : 'text-blue-900 font-medium'}`}
                  >
                    <option value="" disabled className="text-slate-400">Select method...</option>
                    {TRANSACTION_METHODS.map((method) => (
                      <option key={method} value={method} className="text-slate-800">{method}</option>
                    ))}
                  </select>
                  {errors.transactionMethod && <p className="text-xs text-red-500 mt-1.5">{errors.transactionMethod}</p>}
                </div>
              )}

              {/* Paid To */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Paid To <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={form.paidTo}
                  onChange={(e) => handleChange('paidTo', e.target.value)}
                  placeholder="Vendor, Farmer, Employee..."
                  className={`w-full h-10 px-3.5 rounded-lg border ${
                    errors.paidTo ? 'border-red-500 bg-red-50/50' : 'border-slate-300'
                  } text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 shadow-sm`}
                />
                {errors.paidTo && <p className="text-xs text-red-500 mt-1.5">{errors.paidTo}</p>}
              </div>

              {/* Amount */}
              <div className="relative">
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (₹) <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => handleChange('amount', e.target.value)}
                  placeholder="0.00"
                  className={`w-full h-10 px-3.5 rounded-lg border ${
                    errors.amount ? 'border-red-500 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/30'
                  } text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all shadow-sm placeholder:font-normal placeholder:text-emerald-300`}
                />
                {errors.amount && <p className="text-xs text-red-500 mt-1.5">{errors.amount}</p>}
              </div>

              {/* Reference */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reference / Bill No <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input
                  type="text"
                  value={form.referenceNo}
                  onChange={(e) => handleChange('referenceNo', e.target.value)}
                  placeholder="Optional reference ID"
                  className={`w-full h-10 px-3.5 rounded-lg border ${
                    errors.referenceNo ? 'border-red-500 bg-red-50/50' : 'border-slate-300'
                  } text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 shadow-sm`}
                />
                {errors.referenceNo && <p className="text-xs text-red-500 mt-1.5">{errors.referenceNo}</p>}
              </div>

              {/* Remarks */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Remarks / Notes</label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none transition-all placeholder:text-slate-400 shadow-sm"
                  placeholder="Add any additional details or context here..."
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 px-8 py-5 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 bg-white rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all focus:ring-2 focus:ring-slate-200 outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-blue-600/20 focus:ring-2 focus:ring-blue-500/50 outline-none active:scale-[0.98]"
            >
              Create Payment
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}