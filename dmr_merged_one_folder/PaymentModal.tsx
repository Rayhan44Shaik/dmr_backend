// src/modules/accounts/payment-book/PaymentModal.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import type { Payment } from '../../types/payment.types';
import { PaymentService } from '../../services/PaymentService';
import { FarmPaymentService } from '../../services/FarmPaymentService';
import { tripService } from '../../../operations/vehicle-trips/services/tripService';
import { getBanks } from '../../../masters/banks/services/bankService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payment: Payment) => void;
  editPayment?: Payment | null;
}

interface MappedFarmPayment {
  id: string; // Maps to tripId
  farmName: string;
  tripNo: string;
  vehicleNo: string;
  amountDue: number;
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

const CATEGORIES = ['Farmer', 'Fuel', 'Maintenance', 'Salary', 'Loan', 'Office', 'Tax', 'Other'];

export function PaymentModal({ isOpen, onClose, onSave, editPayment }: PaymentModalProps) {
  // Dynamically fetch "Cash" + Active Banks (Strictly Cash and Bank names only, no sub-categories)
  const paymentModeOptions = useMemo(() => {
    try {
      const activeBanks = getBanks()
        .filter((b) => b.status === 'Active')
        .map((b) => b.bankName);
      
      const modes = new Set(['Cash', ...activeBanks]);
      
      // Keep legacy mode if editing an old payment that had a different mode
      if (editPayment?.paymentMode) {
        modes.add(editPayment.paymentMode);
      }
      
      return Array.from(modes);
    } catch {
      return ['Cash'];
    }
  }, [editPayment]);

  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: PAYMENT_TYPES[0],
    paymentMode: 'Cash', // Default to Cash
    paidTo: '',
    amount: 0,
    referenceNo: '',
    category: CATEGORIES[0],
    remarks: '',
    status: 'Approved' as Payment['status'],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedFarm, setSelectedFarm] = useState<string>('');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

  // Get all completed trips (for farm list) - stable, no re-renders
  const allTrips = useMemo(() => {
    try {
      const all = tripService.getAll();
      return all.filter((t) => t.status === 'Completed' && !t.deleted);
    } catch {
      return [];
    }
  }, []);

  // Get all payments from FarmPaymentService - stable
  const allPayments = useMemo(() => {
    return FarmPaymentService.getAll();
  }, []);

  // Get unique farms from trips - stable
  const farms = useMemo(() => {
    const farmSet = new Set(
      allTrips
        .filter((t) => t.sourceFarm)
        .map((t) => t.sourceFarm)
    );
    return ['', ...Array.from(farmSet)];
  }, [allTrips]);

  // Safely map FarmPayments combined with Trip data
  const unpaidPayments = useMemo<MappedFarmPayment[]>(() => {
    if (!selectedFarm) return [];
    
    const results: MappedFarmPayment[] = [];
    allPayments.forEach((p) => {
      if (p.paymentStatus === 'Unpaid' || p.paymentStatus === 'Partially Paid') {
        const trip = allTrips.find((t) => String(t.id) === p.tripId);
        if (trip && trip.sourceFarm === selectedFarm) {
          results.push({
            id: p.tripId,
            farmName: trip.sourceFarm,
            tripNo: trip.tripNo,
            vehicleNo: trip.vehicleNo,
            amountDue: p.balance || 0,
          });
        }
      }
    });
    return results;
  }, [selectedFarm, allPayments, allTrips]);

  // Calculate total amount of selected payments
  const selectedTotal = useMemo(() => {
    let total = 0;
    unpaidPayments.forEach((payment) => {
      if (selectedPaymentIds.includes(payment.id)) {
        total += payment.amountDue || 0;
      }
    });
    return total;
  }, [unpaidPayments, selectedPaymentIds]);

  // Auto-fill amount when payments are selected (for Farmer Payment)
  useEffect(() => {
    if (form.paymentType === 'Farmer Payment' && selectedPaymentIds.length > 0 && form.amount === 0) {
      setForm(prev => ({ ...prev, amount: selectedTotal }));
    }
  }, [selectedPaymentIds, selectedTotal, form.paymentType, form.amount]);

  useEffect(() => {
    if (editPayment) {
      setForm({
        paymentDate: editPayment.paymentDate,
        paymentType: editPayment.paymentType,
        paymentMode: editPayment.paymentMode || 'Cash',
        paidTo: editPayment.paidTo,
        amount: editPayment.amount,
        referenceNo: editPayment.referenceNo,
        category: editPayment.category,
        remarks: editPayment.remarks || '',
        status: editPayment.status,
      });
      
      if (editPayment.paymentIds) {
        const validIds = editPayment.paymentIds.filter((id): id is string => Boolean(id));
        setSelectedPaymentIds(validIds);
        
        if (validIds.length > 0) {
          const firstPayment = allPayments.find(p => p.tripId === validIds[0]);
          if (firstPayment) {
            const trip = allTrips.find(t => String(t.id) === firstPayment.tripId);
            if (trip && trip.sourceFarm) {
              setSelectedFarm(trip.sourceFarm);
            }
          }
        }
      }
    } else {
      setForm({
        paymentDate: new Date().toISOString().split('T')[0],
        paymentType: PAYMENT_TYPES[0],
        paymentMode: paymentModeOptions.includes('Cash') ? 'Cash' : paymentModeOptions[0],
        paidTo: '',
        amount: 0,
        referenceNo: '',
        category: CATEGORIES[0],
        remarks: '',
        status: 'Approved',
      });
      setSelectedFarm('');
      setSelectedPaymentIds([]);
    }
    setErrors({});
  }, [editPayment, isOpen, allPayments, allTrips, paymentModeOptions]);

  const handleChange = (field: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const togglePaymentSelection = useCallback((paymentId: string) => {
    setSelectedPaymentIds((prev) =>
      prev.includes(paymentId)
        ? prev.filter((id) => id !== paymentId)
        : [...prev, paymentId]
    );
  }, []);

  const toggleAllPayments = useCallback(() => {
    if (selectedPaymentIds.length === unpaidPayments.length && unpaidPayments.length > 0) {
      setSelectedPaymentIds([]);
    } else {
      setSelectedPaymentIds(unpaidPayments.map((p) => p.id));
    }
  }, [selectedPaymentIds, unpaidPayments]);

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
        (p) => p.referenceNo === form.referenceNo && p.id !== editPayment?.id
      );
      if (existing.length > 0) {
        newErrors.referenceNo = 'Reference No must be unique';
      }
    }

    if (form.paymentType === 'Farmer Payment' && selectedPaymentIds.length === 0) {
      newErrors.payments = 'Please select at least one unpaid payment to process';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    let finalAmount = Number(form.amount);
    let paymentIds: string[] | undefined = undefined;

    if (form.paymentType === 'Farmer Payment' && selectedPaymentIds.length > 0) {
      finalAmount = Number(form.amount);
      paymentIds = selectedPaymentIds;
      
      if (!form.paidTo.trim() && selectedFarm) {
        form.paidTo = selectedFarm;
      }
    }

    const paymentData = {
      ...form,
      amount: finalAmount,
      createdBy: 'admin',
      paymentIds: paymentIds,
    };

    let saved: Payment;
    if (editPayment) {
      const updated = PaymentService.updatePayment(editPayment.id, paymentData);
      if (updated) saved = updated;
      else return;
    } else {
      saved = PaymentService.createPayment(paymentData);
    }

    // Safely update farm payments to paid
    if (paymentIds && paymentIds.length > 0) {
      paymentIds.forEach(tripId => {
        const fp = FarmPaymentService.getByTripId(tripId);
        if (fp) {
          FarmPaymentService.updatePayment(tripId, {
            paymentStatus: 'Paid',
            amountPaid: fp.totalAmount,
            balance: 0
          });
        }
      });
    }

    onSave(saved);
    onClose();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleFarmChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFarm(e.target.value);
    setSelectedPaymentIds([]);
  }, []);

  if (!isOpen) return null;

  const isFarmerPayment = form.paymentType === 'Farmer Payment';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[95vh] overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">
            {editPayment ? 'Edit Payment' : 'New Payment'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Form - First Row: Payment Date & Payment Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => handleChange('paymentDate', e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border ${
                errors.paymentDate ? 'border-red-500' : 'border-slate-300'
              } text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
            />
            {errors.paymentDate && <p className="text-xs text-red-500 mt-1">{errors.paymentDate}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type *</label>
            <select
              value={form.paymentType}
              onChange={(e) => handleChange('paymentType', e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border ${
                errors.paymentType ? 'border-red-500' : 'border-slate-300'
              } text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white`}
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.paymentType && <p className="text-xs text-red-500 mt-1">{errors.paymentType}</p>}
          </div>
        </div>

        {/* Farmer Payment - Trip Selection */}
        {isFarmerPayment && (
          <div className="border-t border-slate-200 pt-4 mt-2">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Select Unpaid Payments
            </label>

            <div className="mb-3 max-w-md">
              <select
                value={selectedFarm}
                onChange={handleFarmChange}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
              >
                <option value="">Select Farm</option>
                {farms.map((farm) => (
                  <option key={farm} value={farm}>{farm}</option>
                ))}
              </select>
              {farms.length <= 1 && (
                <p className="text-xs text-amber-600 mt-1">
                  No farms found. Please add trips first.
                </p>
              )}
            </div>

            {selectedFarm && (
              <div className="border rounded-lg overflow-hidden">
                {unpaidPayments.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">
                    <p>No unpaid payments found for {selectedFarm}.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Please go to <strong>Farm Payment</strong> page, enter rates, and click <strong>Save All</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left w-10">
                            <input
                              type="checkbox"
                              checked={selectedPaymentIds.length === unpaidPayments.length && unpaidPayments.length > 0}
                              onChange={toggleAllPayments}
                              className="rounded border-slate-300"
                            />
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-12">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Trip No</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Vehicle</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Farm</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {unpaidPayments.map((payment, index) => {
                          const isSelected = selectedPaymentIds.includes(payment.id);
                          return (
                            <tr
                              key={payment.id}
                              className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                                isSelected ? 'bg-blue-50' : ''
                              }`}
                              onClick={() => togglePaymentSelection(payment.id)}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePaymentSelection(payment.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-slate-300"
                                />
                              </td>
                              <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                              <td className="px-3 py-2 font-mono text-slate-700">{payment.tripNo}</td>
                              <td className="px-3 py-2 text-slate-700">{payment.vehicleNo || '-'}</td>
                              <td className="px-3 py-2 text-slate-700">{payment.farmName}</td>
                              <td className="px-3 py-2 text-right font-bold text-emerald-600">
                                {payment.amountDue > 0 ? formatCurrency(payment.amountDue) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right font-bold text-slate-700">
                            Total:
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600">
                            {selectedTotal > 0 ? formatCurrency(selectedTotal) : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {errors.payments && (
                  <p className="text-xs text-red-500 mt-1 px-3 py-1">{errors.payments}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rest of the form fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode *</label>
            <select
              value={form.paymentMode}
              onChange={(e) => handleChange('paymentMode', e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border ${
                errors.paymentMode ? 'border-red-500' : 'border-slate-300'
              } text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white`}
            >
              {paymentModeOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
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
              className={`w-full h-10 px-3 rounded-lg border ${
                errors.paidTo ? 'border-red-500' : 'border-slate-300'
              } text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
            />
            {errors.paidTo && <p className="text-xs text-red-500 mt-1">{errors.paidTo}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) *</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.amount || ''}
              onChange={(e) => handleChange('amount', e.target.valueAsNumber || 0)}
              className={`w-full h-10 px-3 rounded-lg border ${
                errors.amount ? 'border-red-500' : 'border-slate-300'
              } text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
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
              className={`w-full h-10 px-3 rounded-lg border ${
                errors.referenceNo ? 'border-red-500' : 'border-slate-300'
              } text-sm focus:ring-2 focus:ring-blue-400 outline-none`}
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
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {editPayment && (
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

          <div className="md:col-span-2">
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
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            {editPayment ? 'Update Payment' : 'Create Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}