// src/modules/accounts/pages/NewPaymentPage.tsx

interface NewPaymentPageProps {
  embedded?: boolean;
}

export function NewPaymentPage({ embedded = false }: NewPaymentPageProps) {
  return (
    <div className={`w-full flex items-center justify-center animate-in fade-in duration-500 ${
      embedded ? 'min-h-[60vh]' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
    }`}>
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center max-w-md w-full mx-4">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 border border-blue-100 shadow-sm animate-bounce">
          🚧
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">New Payment - Coming Soon</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          This payment configuration module is currently being enhanced and will be made fully available after the upcoming updates.
        </p>
      </div>
    </div>
  );
}

/* ====================================================================================================
   ====================================================================================================
   COMMENTED OUT FOR CLIENT PRESENTATION - TO BE ENHANCED AND RESTORED LATER
   ====================================================================================================
   ====================================================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import { PaymentService } from '../services/PaymentService';
import { FarmPaymentService } from '../services/FarmPaymentService';
import { tripService } from '../../operations/vehicle-trips/services/tripService';
import type { FarmPayment } from '../types/farmPayment.types';
import type { Trip } from '../../operations/vehicle-trips/types/trip';
import { DatePicker } from '../../../components/common/DatePicker';
import { getBanks } from '../../masters/banks/services/bankService';
import type { Bank } from '../../masters/banks/types/bank';

// ---- Category List ----
const CATEGORY_OPTIONS = [
  'Farm Payment',
  'Fuel Payment',
  'Salary',
  'Fastag',
  'Vehicle Expenses',
  'Office Expenses',
  'Insurance',
  'Other',
];

// Format date to YYYY-MM-DD for input default
const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface NewPaymentPageProps {
  embedded?: boolean;
}

export function NewPaymentPage({ embedded = false }: NewPaymentPageProps) {
  const { showNotification } = useSafeNotification();
  const navigate = useNavigate();

  // ---- Form state ----
  const today = new Date();
  const [paymentDate, setPaymentDate] = useState(formatDate(today));
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Cash');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState(''); // Default to empty string
  const [subCategory, setSubCategory] = useState('');
  const [remarks, setRemarks] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);

  // ---- Data stores ----
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [allFarmPayments, setAllFarmPayments] = useState<FarmPayment[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // ---- Trip selection state ----
  const [selectedTripNos, setSelectedTripNos] = useState<Set<string>>(new Set());

  // Load banks, trips, and farm payments
  useEffect(() => {
    const bankList = getBanks();
    setBanks(bankList);

    const trips = tripService.getAll();
    setAllTrips(trips);

    const farmPayments = FarmPaymentService.getAll();
    setAllFarmPayments(farmPayments);
  }, [refreshKey]);

  // ---- Memoized sub‑category options ----
  const subCategoryOptions = useMemo(() => {
    if (category !== 'Farm Payment') return [];

    const farmSet = new Set<string>();
    allFarmPayments.forEach((fp) => {
      if (fp.paymentStatus === 'Unpaid' || fp.paymentStatus === 'Partially Paid') {
        const trip = allTrips.find((t) => String(t.id) === fp.tripId);
        if (trip && trip.sourceFarm) {
          farmSet.add(trip.sourceFarm);
        }
      }
    });
    return Array.from(farmSet);
  }, [category, allFarmPayments, allTrips]);

  // ---- Farm Payment Details Table Data ----
  const farmPaymentDetails = useMemo(() => {
    if (!subCategory) return [];

    const farmTrips = allTrips.filter((t) => t.sourceFarm === subCategory);
    const details = farmTrips
      .map((trip) => {
        const payment = allFarmPayments.find((fp) => fp.tripId === String(trip.id));
        if (!payment) return null;
        if (payment.paymentStatus !== 'Unpaid' && payment.paymentStatus !== 'Partially Paid')
          return null;
        return {
          tripNo: trip.tripNo,
          tripDate: trip.tripDate,
          birds: trip.totalBirds || 0,
          weight: trip.dcWeight || 0,
          rate: payment.ratePerBird || 0,
          totalAmount: payment.totalAmount || 0,
          paid: payment.amountPaid || 0,
          balance: (payment.totalAmount || 0) - (payment.amountPaid || 0),
          status: payment.paymentStatus,
          tripId: trip.id,
        };
      })
      .filter((item) => item !== null) as {
        tripNo: string;
        tripDate: string;
        birds: number;
        weight: number;
        rate: number;
        totalAmount: number;
        paid: number;
        balance: number;
        status: 'Unpaid' | 'Partially Paid';
        tripId: string | number;
      }[];

    return details;
  }, [subCategory, allTrips, allFarmPayments]);

  const totalBalance = useMemo(() => {
    return farmPaymentDetails.reduce((sum, item) => sum + item.balance, 0);
  }, [farmPaymentDetails]);

  // ---- Selected trips (sorted by date, oldest first) ----
  const selectedTrips = useMemo(() => {
    return farmPaymentDetails
      .filter((item) => selectedTripNos.has(item.tripNo))
      .sort((a, b) => new Date(a.tripDate).getTime() - new Date(b.tripDate).getTime());
  }, [farmPaymentDetails, selectedTripNos]);

  const selectedTotalBalance = useMemo(() => {
    return selectedTrips.reduce((sum, item) => sum + item.balance, 0);
  }, [selectedTrips]);

  // ---- Payment allocation (FIFO: oldest first) ----
  const allocation = useMemo(() => {
    const paying = Number(amount) || 0;
    let remaining = paying;
    const result: { tripNo: string; date: string; balance: number; allocated: number; status: 'full' | 'partial' | 'none' }[] = [];

    for (const trip of selectedTrips) {
      if (remaining <= 0) {
        result.push({ tripNo: trip.tripNo, date: trip.tripDate, balance: trip.balance, allocated: 0, status: 'none' });
        continue;
      }
      if (remaining >= trip.balance) {
        result.push({ tripNo: trip.tripNo, date: trip.tripDate, balance: trip.balance, allocated: trip.balance, status: 'full' });
        remaining -= trip.balance;
      } else {
        result.push({ tripNo: trip.tripNo, date: trip.tripDate, balance: trip.balance, allocated: remaining, status: 'partial' });
        remaining = 0;
      }
    }
    return result;
  }, [selectedTrips, amount]);

  // ---- Payment Summary ----
  const paymentSummary = useMemo(() => {
    const selectedCount = selectedTripNos.size;
    const totalDue = selectedTotalBalance;
    const paying = Number(amount) || 0;
    const balanceAfter = totalDue - paying;
    const isFull = paying > 0 && paying >= totalDue;
    const isPartial = paying > 0 && paying < totalDue;
    const isOver = paying > totalDue;

    const fullCount = allocation.filter(a => a.status === 'full').length;
    const partialCount = allocation.filter(a => a.status === 'partial').length;

    let statusText = '';
    let statusColor = '';
    if (selectedCount === 0) {
      statusText = 'No trips selected';
      statusColor = 'text-slate-400';
    } else if (isOver) {
      statusText = '⚠️ Overpayment';
      statusColor = 'text-rose-600';
    } else if (isFull) {
      statusText = '✅ Full Payment';
      statusColor = 'text-emerald-600';
    } else if (isPartial) {
      statusText = '🟡 Partial Payment';
      statusColor = 'text-orange-600';
    } else {
      statusText = 'Enter amount to pay';
      statusColor = 'text-slate-400';
    }

    return {
      selectedCount,
      totalDue,
      paying,
      balanceAfter,
      isFull,
      isPartial,
      isOver,
      statusText,
      statusColor,
      fullCount,
      partialCount,
      allocation,
    };
  }, [selectedTripNos, selectedTotalBalance, amount, allocation]);

  // ---- Auto‑fill paidTo and amount when sub‑category changes ----
  useEffect(() => {
    if (category === 'Farm Payment' && subCategory) {
      setPaidTo(subCategory);
      setSelectedTripNos(new Set());
      if (totalBalance > 0) {
        setAmount(totalBalance);
      } else {
        setAmount('');
      }
    }
  }, [subCategory, category, totalBalance]);

  // ---- Update amount when selected trips change ----
  useEffect(() => {
    if (selectedTripNos.size > 0) {
      setAmount(selectedTotalBalance);
    } else if (totalBalance > 0) {
      setAmount(totalBalance);
    } else {
      setAmount('');
    }
  }, [selectedTripNos, selectedTotalBalance, totalBalance]);

  // ---- Toggle trip selection ----
  const handleToggleTrip = (tripNo: string) => {
    setSelectedTripNos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tripNo)) {
        newSet.delete(tripNo);
      } else {
        newSet.add(tripNo);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedTripNos.size === farmPaymentDetails.length) {
      setSelectedTripNos(new Set());
    } else {
      setSelectedTripNos(new Set(farmPaymentDetails.map((item) => item.tripNo)));
    }
  };

  // ---- Handle form submit ----
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentDate || !amount || !paidTo || !referenceNo || !category) {
      showNotification('Please fill all required fields.', 'error');
      return;
    }

    if (paymentSummary.isOver) {
      showNotification('Payment amount exceeds the total balance due. Please adjust.', 'error');
      return;
    }

    setSubmitting(true);

    try {
      // ---- Step 1: Create the general Payment record ----
      const paymentData = {
        paymentDate,
        paymentMode,
        amount: Number(amount),
        category,
        remarks,
        paidTo,
        referenceNo,
        paymentType: 'Manual',
        status: 'Draft' as const,
        createdBy: 'system',
      };
      PaymentService.createPayment(paymentData);

      // ---- Step 2: Update FarmPayment records for allocated trips ----
      const allocationItems = allocation.filter(a => a.status !== 'none');
      for (const alloc of allocationItems) {
        const trip = allTrips.find(t => t.tripNo === alloc.tripNo);
        if (!trip) continue;
        const tripId = String(trip.id);

        const existing = FarmPaymentService.getByTripId(tripId);
        const existingPaid = existing?.amountPaid || 0;
        const newPaid = existingPaid + alloc.allocated;
        const totalAmount = existing?.totalAmount || (trip.totalBirds || 0) * (existing?.ratePerBird || 0);
        const balance = totalAmount - newPaid;
        const status: 'Paid' | 'Partially Paid' | 'Unpaid' =
          newPaid >= totalAmount ? 'Paid' : (newPaid > 0 ? 'Partially Paid' : 'Unpaid');

        const farmPaymentData: Partial<FarmPayment> = {
          tripId,
          totalBirds: trip.totalBirds || 0,
          dcWeight: trip.dcWeight || 0,
          ratePerBird: existing?.ratePerBird || 0,
          totalAmount,
          amountPaid: newPaid,
          balance,
          paymentStatus: status,
          paidDate: paymentDate,
          paymentMode: paymentMode,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (existing) {
          FarmPaymentService.updatePayment(tripId, farmPaymentData);
        } else {
          FarmPaymentService.createPayment(farmPaymentData as FarmPayment);
        }
      }

      showNotification('Payment created successfully', 'success');

      // ---- Reset form and reload data ----
      setPaymentDate(formatDate(new Date()));
      setAmount('');
      setPaidTo('');
      setReferenceNo('');
      setRemarks('');
      setCategory('');
      setSubCategory('');
      setSelectedTripNos(new Set());

      // Refresh farm data
      setRefreshKey(prev => prev + 1);

    } catch (err) {
      console.error(err);
      showNotification('Failed to create payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Payment mode options ----
  const paymentModeOptions = useMemo(() => {
    const baseOptions: { value: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'; label: string }[] = [
      { value: 'Cash', label: 'Cash' },
      { value: 'Bank Transfer', label: 'Bank Transfer' },
      { value: 'UPI', label: 'UPI' },
      { value: 'Cheque', label: 'Cheque' },
    ];
    const bankOptions = banks.map((bank) => ({
      value: bank.bankName as 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque',
      label: bank.bankName,
    }));
    return [...baseOptions, ...bankOptions];
  }, [banks]);

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const showSelectFarm = category === 'Farm Payment' && subCategoryOptions.length > 0;

  return (
    <div className={`w-full space-y-6 animate-in fade-in duration-500 ${
      embedded ? '' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
    }`}>
      <style>{`
        .hide-spinner::-webkit-inner-spin-button,
        .hide-spinner::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .hide-spinner {
          -moz-appearance: textfield;
          appearance: textfield;
        }
      `}</style>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 w-full">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Payment Date <span className="text-rose-500">*</span>
              </label>
              <DatePicker
                value={paymentDate}
                onChange={setPaymentDate}
                placeholder="Select date"
                className="w-full mt-1"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Payment Mode <span className="text-rose-500">*</span>
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque')}
                className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                required
              >
                {paymentModeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                required
              >
                <option value="" disabled>Select category...</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {category === 'Farm Payment' && subCategoryOptions.length === 0 && (
            <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
              No unpaid farm payments found. All farm payments are settled.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {showSelectFarm ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Select Farm <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                    required
                  >
                    <option value="">Select a farm...</option>
                    {subCategoryOptions.map((farm) => (
                      <option key={farm} value={farm}>
                        {farm}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="Enter amount"
                      className="hide-spinner w-32 sm:w-40 flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                      required
                    />
                    {subCategory && totalBalance > 0 && (
                      <div className="text-xs text-slate-500 whitespace-nowrap">
                        <span className="font-medium">Total:</span> {formatCurrency(totalBalance)}
                        {selectedTripNos.size > 0 && (
                          <span className="ml-2">
                            <span className="font-medium">Remaining:</span>{' '}
                            <span className={selectedTotalBalance - Number(amount) > 0 ? 'text-orange-600' : 'text-emerald-600'}>
                              {formatCurrency(selectedTotalBalance - Number(amount))}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div></div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="Enter amount"
                    className="hide-spinner w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Paid To <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={paidTo}
                    onChange={(e) => setPaidTo(e.target.value)}
                    placeholder="Vendor, Farmer, Employee..."
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Reference / Bill No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Unique reference"
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                    required
                  />
                </div>
              </>
            )}
          </div>

          {showSelectFarm && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Paid To <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  placeholder="Vendor, Farmer, Employee..."
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Reference / Bill No <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Unique reference"
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                  required
                />
              </div>
              <div></div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional remarks"
                rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none"
              />
            </div>
          </div>

          {subCategory && farmPaymentDetails.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  Unpaid Farm Payments – {subCategory}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Total Balance: {formatCurrency(totalBalance)}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  {selectedTripNos.size === farmPaymentDetails.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/70 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-center w-8">
                        <input
                          type="checkbox"
                          checked={selectedTripNos.size === farmPaymentDetails.length && farmPaymentDetails.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Trip No</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Birds</th>
                      <th className="px-3 py-2 text-right">Weight (Kg)</th>
                      <th className="px-3 py-2 text-right">Rate/Bird (₹)</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {farmPaymentDetails.map((item) => (
                      <tr key={item.tripNo} className="hover:bg-slate-50/50 transition">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedTripNos.has(item.tripNo)}
                            onChange={() => handleToggleTrip(item.tripNo)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">{item.tripNo}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {new Date(item.tripDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {item.birds.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {item.weight > 0 ? item.weight.toFixed(2) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          ₹{item.rate.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800">
                          {formatCurrency(item.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">
                          {formatCurrency(item.paid)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-orange-600">
                          {formatCurrency(item.balance)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium
                              ${
                                item.status === 'Unpaid'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
            {subCategory && selectedTripNos.size > 0 && (
              <div className="flex-1 min-w-0 w-full sm:w-auto">
                <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-sm flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-slate-500 text-xs">Trips: <strong className="text-slate-800">{paymentSummary.selectedCount}</strong></span>
                    <span className="text-slate-500 text-xs">Due: <strong className="text-slate-800">{formatCurrency(paymentSummary.totalDue)}</strong></span>
                    <span className="text-slate-500 text-xs">Paying: <strong className="text-blue-600">{formatCurrency(paymentSummary.paying)}</strong></span>
                    <span className="text-slate-500 text-xs">Balance: <strong className={paymentSummary.balanceAfter > 0 ? 'text-orange-600' : 'text-emerald-600'}>{formatCurrency(paymentSummary.balanceAfter)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${paymentSummary.statusColor}`}>
                      {paymentSummary.statusText}
                    </span>
                    {paymentSummary.selectedCount > 0 && (
                      <span className="text-xs text-slate-500">
                        (✅ {paymentSummary.fullCount} full, 🟡 {paymentSummary.partialCount} partial)
                      </span>
                    )}
                  </div>
                  {paymentSummary.allocation.filter(a => a.status === 'partial').length > 0 && (
                    <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                      {paymentSummary.allocation
                        .filter(a => a.status === 'partial')
                        .map((a) => (
                          <span key={a.tripNo} className="whitespace-nowrap">
                            🟡 {a.tripNo}: {formatCurrency(a.allocated)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto sm:ml-auto">
              <button
                type="button"
                onClick={() => {
                  setPaymentDate(formatDate(new Date()));
                  setAmount('');
                  setPaidTo('');
                  setReferenceNo('');
                  setRemarks('');
                  setCategory('');
                  setSubCategory('');
                  setSelectedTripNos(new Set());
                }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition w-full sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || paymentSummary.isOver}
                className={`px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition shadow-md shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto`}
              >
                {submitting ? 'Creating...' : 'Create Payment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

==================================================================================================== */