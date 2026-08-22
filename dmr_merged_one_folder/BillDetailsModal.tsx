import React from 'react';
import { X } from 'lucide-react';
import type { MaintenanceEvent } from '../../types';
import MaintenanceDocuments from './MaintenanceDocuments';

interface BillDetailsModalProps {
  isOpen: boolean;
  bill: MaintenanceEvent | null;
  vehicles: any[];
  onClose: () => void;
}

const BillDetailsModal: React.FC<BillDetailsModalProps> = ({ isOpen, bill, vehicles, onClose }) => {
  if (!isOpen || !bill) return null;

  const vehicle = vehicles.find((v: any) => String(v.id) === String(bill.vehicleId));
  const isApproved = bill.paymentStatus === 'approved';

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50 rounded-t-2xl">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Maintenance Record</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Vehicle & Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vehicle</p>
              <p className="text-sm font-bold text-slate-800">{vehicle?.vehicleNumber || bill.vehicleId}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</p>
              <p className="text-sm font-bold text-slate-800">{formatDate(bill.date)}</p>
            </div>
          </div>

          {/* Bill Number & Current KM Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bill Number</p>
              <p className={`text-sm font-bold ${isApproved ? 'text-green-600' : 'text-orange-500'}`}>
                {bill.billNumber || '-'}
                {isApproved && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Approved
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current KM</p>
              <p className="text-sm font-bold text-slate-800">{bill.currentKM.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Driver</p>
              <p className="text-sm text-slate-700">{bill.driverName || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Service KM</p>
              <p className="text-sm font-bold text-slate-800">{bill.nextServiceKM ? bill.nextServiceKM.toLocaleString() : '-'}</p>
            </div>
          </div>

          {/* Maintenance Type & Service Type Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Maintenance Type</p>
              <p className="text-sm text-slate-700">{bill.maintenanceType}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Service Type</p>
              <p className="text-sm text-slate-700">{bill.serviceType}</p>
            </div>
          </div>

          {/* Garage & Mechanic Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Garage</p>
              <p className="text-sm text-slate-700">{bill.garage || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mechanic</p>
              <p className="text-sm text-slate-700">{bill.mechanic || '-'}</p>
            </div>
          </div>

          {/* Parts Table */}
          {bill.parts && bill.parts.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Parts & Items</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">QTY</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {bill.parts.map((part, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-sm text-slate-700">{part.name}</td>
                        <td className="px-4 py-2 text-sm text-slate-700 text-center">{part.quantity}</td>
                        <td className="px-4 py-2 text-sm font-medium text-slate-700 text-right">
                          ₹{part.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-sm font-bold text-slate-700 text-right">Total</td>
                      <td className="px-4 py-2 text-sm font-bold text-blue-600 text-right">
                        ₹{bill.totalCost.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Total Cost (if no parts) */}
          {(!bill.parts || bill.parts.length === 0) && (
            <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Cost</p>
              <p className="text-xl font-bold text-blue-600">₹{bill.totalCost.toFixed(2)}</p>
            </div>
          )}

          {/* Bill / Spare-part Documents */}
          {bill.documents && bill.documents.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Documents ({bill.documents.length})
              </p>
              <MaintenanceDocuments maintenanceId={bill.id || ''} documents={bill.documents} />
            </div>
          )}

          {/* Remarks */}
          {bill.remarks && (
            <div className="border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Remarks</p>
              <p className="text-sm text-slate-600 italic bg-slate-50 p-2 rounded-lg mt-1">{bill.remarks}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillDetailsModal;