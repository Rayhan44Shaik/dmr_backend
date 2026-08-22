// src/modules/staff/pages/LeaveManagementPage.tsx

import { useState, useCallback } from 'react';
import { Plus, CheckCircle2, Clock, XCircle, CalendarCheck2 } from 'lucide-react';
import { useLeaveManagement } from '../hooks/useLeaveManagement';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import LeaveFilters from '../components/leave/LeaveFilters';
import LeaveRequestForm from '../components/leave/LeaveRequestForm';
import LeaveTable from '../components/leave/LeaveTable';

function LeaveManagementPage() {
  const { showNotification } = useSafeNotification();
  const [showForm, setShowForm] = useState(false);

  const {
    leaves,
    report,
    reportLoading,
    reportError,
    stats,
    loading,
    error,
    filters,
    setFilter,
    resetFilters,
    employees,
    departments,
    addLeave,
    approveLeave,
    rejectLeave,
    deleteLeave,
    refresh,
  } = useLeaveManagement(showNotification);

  const handleAddLeave = useCallback(
    async (data: { employeeId: number; type: string; fromDate: string; toDate: string; days?: number; reason?: string }) => {
      const success = await addLeave({
        employeeId: data.employeeId,
        type: data.type as 'Casual' | 'Sick' | 'Emergency' | 'Annual',
        fromDate: data.fromDate,
        toDate: data.toDate,
        days: data.days,
        reason: data.reason,
      });
      if (success) setShowForm(false);
    },
    [addLeave]
  );

  const handleApprove = useCallback(
    (id: string) => {
      void approveLeave(id);
    },
    [approveLeave]
  );

  const handleReject = useCallback(
    (id: string, reason: string) => {
      void rejectLeave(id, reason);
    },
    [rejectLeave]
  );

  const handleDelete = useCallback(
    (id: string) => deleteLeave(id),
    [deleteLeave]
  );

  const cards = [
    { label: 'Approved Requests', value: stats.approved, icon: <CheckCircle2 size={18} />, cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pending Requests', value: stats.pending, icon: <Clock size={18} />, cls: 'text-amber-600 bg-amber-50' },
    { label: 'Rejected', value: stats.rejected, icon: <XCircle size={18} />, cls: 'text-rose-600 bg-rose-50' },
    { label: 'Approved Leave Days', value: stats.approvedDays, icon: <CalendarCheck2 size={18} />, cls: 'text-brand-600 bg-brand-50' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Leave Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Employee leave planning, approval and history — synchronised with Duty Planner and Salary.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition active:scale-95"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-sm transition active:scale-95"
          >
            <Plus size={16} />
            {showForm ? 'Hide Form' : 'New Request'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${c.cls}`}>{c.icon}</div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{c.value}</p>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <LeaveFilters
        filters={filters}
        employees={employees}
        departments={departments}
        onFilterChange={setFilter}
        onReset={resetFilters}
      />

      {/* New request form */}
      {showForm && (
        <LeaveRequestForm
          employees={employees}
          onSubmit={handleAddLeave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Leave requests table */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
          <button onClick={() => void refresh()} className="ml-2 font-semibold underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : leaves.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No leave requests match the current filters.
        </div>
      ) : (
        <LeaveTable
          leaves={leaves}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
        />
      )}

      {/* Leave Report */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Leave Report — {filters.month}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Approved leave days are the authoritative calendar days reflected in Duty and Salary.
            </p>
          </div>
        </div>

        {reportError && (
          <div className="p-4 text-sm text-rose-700 bg-rose-50">
            {reportError}
            <button onClick={() => void refresh()} className="ml-2 font-semibold underline">Retry</button>
          </div>
        )}

        {reportLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : report.items.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No employees found for this month.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Approved Days</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Pending Days</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Rejected Days</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Leave Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Leave Types</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {report.items.map((r) => (
                  <tr key={r.employeeId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.employeeName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.department}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        {r.approvedLeaveDays}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                        {r.pendingLeaveDays}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                        {r.rejectedLeaveDays}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.leaveDates.length ? r.leaveDates.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.leaveTypes.length ? r.leaveTypes.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaveManagementPage;
