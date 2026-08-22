import React from 'react';
import { Hash, Truck, Calendar, IndianRupee, Gauge, Milestone, Building2, UserCog, User, FileText, CheckCircle2, X } from 'lucide-react';
import type { MaintenanceEvent } from '../../types';
import MaintenanceDocuments from './MaintenanceDocuments';

interface ViewModalProps {
  record: MaintenanceEvent;
  vehicles: any[];
  onClose: () => void;
}

const ViewModal: React.FC<ViewModalProps> = ({ record, vehicles, onClose }) => {
  const vehicle = vehicles.find((v: any) => String(v.id) === String(record.vehicleId));
  const vehicleNumber = vehicle?.vehicleNumber || record.vehicleNo || '—';
  const isApproved = record.paymentStatus === 'approved';

  const statusLabel = isApproved ? 'Approved' : record.deletedAt ? 'Deleted' : 'Pending';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-sm uppercase tracking-wider font-bold text-slate-800">Maintenance Record</h3>
          <button onClick={onClose} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 text-sm font-semibold">
            <X size={16} /> Close
          </button>
        </div>
        <div className="p-6 space-y-6">
          {/* Header summary: MNT number + vehicle + status */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 text-sm font-bold rounded-lg px-3 py-1.5 border ${
                isApproved
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : record.deletedAt
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                <Hash size={14} />
                {record.billNumber || '-'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <Truck size={15} className="text-slate-400" />
                {vehicleNumber}
              </span>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-3 py-1 border ${
              isApproved
                ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                : record.deletedAt
                  ? 'text-amber-700 bg-amber-50 border-amber-100'
                  : 'text-blue-700 bg-blue-50 border-blue-100'
            }`}>
              <CheckCircle2 size={12} />
              {statusLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500">Vehicle Number</span>
              <span className="text-sm font-medium text-slate-800">{vehicleNumber}</span>
            </div>
            {vehicle && (
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-sm text-slate-500">Vehicle Type</span>
                <span className="text-sm font-medium text-slate-800">
                  {vehicle.vehicleType || '-'}
                </span>
              </div>
            )}
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" /> Date
              </span>
              <span className="text-sm font-medium text-slate-800">
                {new Date(record.date).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500">Maintenance Number</span>
              <span className="text-sm font-medium text-slate-800">
                {record.billNumber || '-'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <Gauge size={13} className="text-slate-400" /> Current KM
              </span>
              <span className="text-sm font-medium text-slate-800">
                {record.currentKM.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <Milestone size={13} className="text-slate-400" /> Next Service KM
              </span>
              <span className="text-sm font-medium text-slate-800">
                {record.nextServiceKM?.toLocaleString() || '-'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500">Maintenance Type</span>
              <span className="text-sm font-medium text-slate-800">
                {record.maintenanceType}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500">Service Type</span>
              <span className="text-sm font-medium text-slate-800">
                {record.serviceType}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" /> Garage
              </span>
              <span className="text-sm font-medium text-slate-800">
                {record.garage || '-'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <UserCog size={13} className="text-slate-400" /> Mechanic
              </span>
              <span className="text-sm font-medium text-slate-800">
                {record.mechanic || '-'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <User size={13} className="text-slate-400" /> Driver
              </span>
              <span className="text-sm font-medium text-slate-800">
                {record.driverName || '-'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <IndianRupee size={13} className="text-slate-400" /> Total Cost
              </span>
              <span className="text-sm font-bold text-blue-600">
                ₹{record.totalCost?.toFixed(2) || '0.00'}
              </span>
            </div>
            {isApproved && (
              <>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-sm text-slate-500">Approved By</span>
                  <span className="text-sm font-medium text-slate-800">
                    {record.approvedBy || 'system'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-sm text-slate-500">Approved At</span>
                  <span className="text-sm font-medium text-slate-800">
                    {record.approvedAt ? new Date(record.approvedAt).toLocaleString() : '-'}
                  </span>
                </div>
              </>
            )}
            {record.createdAt && (
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-sm text-slate-500">Created At</span>
                <span className="text-sm font-medium text-slate-800">
                  {new Date(record.createdAt).toLocaleString()}
                </span>
              </div>
            )}
            {record.remarks && (
              <div className="flex justify-between border-b border-slate-200/60 pb-2 md:col-span-2">
                <span className="text-sm text-slate-500 flex items-center gap-1.5">
                  <FileText size={13} className="text-slate-400" /> Remarks
                </span>
                <span className="text-sm font-medium text-slate-800 max-w-[60%] text-right">
                  {record.remarks}
                </span>
              </div>
            )}
          </div>

          {record.parts && record.parts.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Parts / Spare Parts</h4>
              </div>
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Specification</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {record.parts.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-sm text-slate-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{p.specification || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-800 text-center">{p.quantity}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-800 text-right">₹{Number(p.rate || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-800 text-right">₹{Number(p.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bill / Spare-part Documents */}
          {record.documents && record.documents.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Documents ({record.documents.length})
              </p>
              <MaintenanceDocuments maintenanceId={record.id || ''} documents={record.documents} />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewModal;
