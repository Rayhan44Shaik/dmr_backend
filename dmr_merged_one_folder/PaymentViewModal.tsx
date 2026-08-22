// src/modules/accounts/components/payment-book/PaymentViewModal.tsx

import { X, Calendar, User, Hash, Tag, CreditCard, DollarSign, MessageSquare, CheckCircle, Clock, AlertCircle, Truck, FileText } from 'lucide-react';
import type { Payment } from '../../types/payment.types';
import { FarmPaymentService } from '../../services/FarmPaymentService';

interface PaymentViewModalProps {
  isOpen: boolean;
  payment: Payment | null;
  onClose: () => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Approved': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Draft': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Paid': return <CheckCircle className="w-4 h-4" />;
    case 'Approved': return <CheckCircle className="w-4 h-4" />;
    case 'Draft': return <Clock className="w-4 h-4" />;
    case 'Cancelled': return <AlertCircle className="w-4 h-4" />;
    default: return null;
  }
};

const getTripDetails = (payment: Payment): { tripNo: string; amount: number }[] => {
  if (!payment.paymentIds || payment.paymentIds.length === 0) {
    return [];
  }

  const tripDetails: { tripNo: string; amount: number }[] = [];
  for (const paymentId of payment.paymentIds) {
    const farmPayment = FarmPaymentService.getPaymentById(paymentId);
    if (farmPayment) {
      tripDetails.push({
        tripNo: farmPayment.tripId,
        amount: farmPayment.totalAmount ?? farmPayment.balance ?? 0,
      });
    }
  }
  return tripDetails;
};

export function PaymentViewModal({ isOpen, payment, onClose }: PaymentViewModalProps) {
  if (!isOpen || !payment) return null;

  const tripDetails = getTripDetails(payment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50/80 to-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Payment Details</h3>
              <p className="text-xs text-slate-500">#{payment.paymentNo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${getStatusColor(payment.status)}`}>
              {getStatusIcon(payment.status)}
              {payment.status}
            </span>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition">
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</p>
              <p className="text-2xl font-bold text-blue-600">₹{payment.amount.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100/50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid To</p>
              <p className="text-base font-semibold text-slate-800">{payment.paidTo}</p>
            </div>
          </div>

          {/* Trip Details */}
          {tripDetails.length > 0 && (
            <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100/50">
              <div className="flex items-center gap-2 mb-3">
                <Truck size={16} className="text-amber-600" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Trip Details</p>
                <span className="text-xs text-slate-400 ml-auto">{tripDetails.length} trips</span>
              </div>
              <div className="space-y-2">
                {tripDetails.map((trip, index) => (
                  <div key={index} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2 border border-amber-100/50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500">#{index + 1}</span>
                      <span className="text-sm font-mono text-slate-700">{trip.tripNo}</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">₹{trip.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-amber-100/30 rounded-lg px-3 py-2 border border-amber-200/50 mt-1">
                  <span className="text-xs font-semibold text-slate-600">Total Trip Amount</span>
                  <span className="text-sm font-bold text-blue-600">
                    ₹{tripDetails.reduce((sum, t) => sum + t.amount, 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50/50 rounded-xl p-4 border border-slate-200/60">
            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Date</p>
                <p className="text-sm font-medium text-slate-700">{payment.paymentDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Tag size={16} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Type</p>
                <p className="text-sm font-medium text-slate-700">{payment.paymentType}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard size={16} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Mode</p>
                <p className="text-sm font-medium text-slate-700">{payment.paymentMode}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Hash size={16} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Reference</p>
                <p className="text-sm font-medium text-slate-700">{payment.referenceNo}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User size={16} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Category</p>
                <p className="text-sm font-medium text-slate-700">{payment.category}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign size={16} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <p className={`text-sm font-semibold ${payment.status === 'Paid' ? 'text-emerald-600' : payment.status === 'Approved' ? 'text-blue-600' : 'text-amber-600'}`}>
                  {payment.status}
                </p>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/60">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={16} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</p>
            </div>
            <p className="text-sm text-slate-600">{payment.remarks || '—'}</p>
          </div>

          {/* Footer Info */}
          <div className="text-xs text-slate-400 border-t border-slate-200 pt-4 flex justify-between">
            <span>Created: {new Date(payment.createdAt).toLocaleString()}</span>
            <span>Last updated: {new Date(payment.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}