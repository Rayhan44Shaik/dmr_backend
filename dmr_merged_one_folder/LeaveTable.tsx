// src/modules/staff/components/leave/LeaveTable.tsx

import { memo, useState } from 'react';
import { CheckCircle, XCircle, Trash2, Eye, X, Calendar } from 'lucide-react';
import type { LeaveRequest } from '../../types/staffDashboard';
import { usePendingDelete } from '../../../../hooks/usePendingDelete';
import { PendingDeleteNotification } from '../../../../components/common/PendingDeleteNotification';

interface LeaveTableProps {
  leaves: LeaveRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onDelete: (id: string) => void;
}

function LeaveTable({ leaves, onApprove, onReject, onDelete }: LeaveTableProps) {
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);
  const [viewEmployeeModal, setViewEmployeeModal] = useState<{
    employeeName: string;
    employeeId: number | string;
  } | null>(null);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or '0' to '11'

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Pending: 'bg-amber-100 text-amber-700 border-amber-200',
      Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      Rejected: 'bg-rose-100 text-rose-700 border-rose-200',
    };
    return styles[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      Casual: 'text-blue-600 bg-blue-50',
      Sick: 'text-rose-600 bg-rose-50',
      Emergency: 'text-orange-600 bg-orange-50',
      Annual: 'text-purple-600 bg-purple-50',
    };
    return colors[type] || '';
  };

  // Filter leaves for the modal view based on employee, year, and month
  const employeeLeaveHistory = viewEmployeeModal
    ? leaves.filter((leave) => {
        const matchesEmployee =
          leave.employeeId === viewEmployeeModal.employeeId ||
          leave.employeeName === viewEmployeeModal.employeeName;

        if (!matchesEmployee) return false;

        if (!leave.fromDate) return false;
        const leaveDate = new Date(leave.fromDate + 'T00:00:00');
        const leaveYear = leaveDate.getFullYear();
        const leaveMonth = leaveDate.getMonth();

        if (leaveYear !== selectedYear) return false;

        if (selectedMonth !== 'all' && leaveMonth !== Number(selectedMonth)) {
          return false;
        }

        return true;
      })
    : [];

  const totalDaysTaken = employeeLeaveHistory.reduce((sum, l) => {
    return l.status === 'Approved' ? sum + (l.days || 0) : sum;
  }, 0);

  if (leaves.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
        No leave requests found.
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">From → To</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Days</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {leaves.map((leave) => (
                <tr key={leave.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{leave.employeeName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{leave.department || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getTypeColor(leave.type)}`}>
                      {leave.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {leave.fromDate} → {leave.toDate}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-center">{leave.days}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(leave.status)}`}>
                      {leave.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 max-w-[180px] truncate" title={leave.reason}>
                    {leave.reason || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View button - Opens Year/Month filter modal */}
                      <button
                        onClick={() => {
                          setSelectedYear(new Date().getFullYear());
                          setSelectedMonth('all');
                          setViewEmployeeModal({
                            employeeName: leave.employeeName,
                            employeeId: leave.employeeId,
                          });
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        title="View Employee Leave History"
                      >
                        <Eye size={16} />
                      </button>

                      {/* Approve (only for Pending) */}
                      {leave.status === 'Pending' && (
                        <button onClick={() => onApprove(leave.id)} className="p-1 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition" title="Approve">
                          <CheckCircle size={16} />
                        </button>
                      )}

                      {/* Reject (only for Pending) */}
                      {leave.status === 'Pending' && (
                        <button
                          onClick={() => {
                            const reason = prompt('Rejection reason:');
                            if (reason !== null) onReject(leave.id, reason);
                          }}
                          className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                          title="Reject"
                        >
                          <XCircle size={16} />
                        </button>
                      )}

                      {/* Delete (only for Pending) */}
                      {leave.status === 'Pending' && (
                        <button onClick={() => requestDelete(leave.id, { label: `Deleting leave for ${leave.employeeName}` })} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Leave History Modal */}
      {viewEmployeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Leave History: {viewEmployeeModal.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Approved leaves taken for selected year & month
                </p>
              </div>
              <button
                onClick={() => setViewEmployeeModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Controls */}
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-xs font-medium text-slate-600">Filter By:</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Year Select */}
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                {/* Month Select */}
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="all">All Months</option>
                  <option value="0">January</option>
                  <option value="1">February</option>
                  <option value="2">March</option>
                  <option value="3">April</option>
                  <option value="4">May</option>
                  <option value="5">June</option>
                  <option value="6">July</option>
                  <option value="7">August</option>
                  <option value="8">September</option>
                  <option value="9">October</option>
                  <option value="10">November</option>
                  <option value="11">December</option>
                </select>
              </div>
            </div>

            {/* Modal Body / Table */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-3">
                <span className="text-xs font-semibold text-blue-800">Total Approved Leave Days:</span>
                <span className="text-sm font-bold text-blue-900 bg-white px-2.5 py-1 rounded-md shadow-xs">
                  {totalDaysTaken} Days
                </span>
              </div>

              {employeeLeaveHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No leave requests found for the selected year and month.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">From → To</th>
                        <th className="px-3 py-2 font-medium text-center">Days</th>
                        <th className="px-3 py-2 font-medium text-center">Status</th>
                        <th className="px-3 py-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {employeeLeaveHistory.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-medium ${getTypeColor(item.type)}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {item.fromDate} → {item.toDate}
                          </td>
                          <td className="px-3 py-2.5 text-center font-semibold">{item.days}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-medium border ${getStatusBadge(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 italic max-w-[150px] truncate">
                            {item.reason || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewEmployeeModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </>
  );
}

export default memo(LeaveTable);