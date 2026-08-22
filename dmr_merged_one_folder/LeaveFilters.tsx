// src/modules/staff/components/leave/LeaveFilters.tsx

import { memo } from 'react';
import {
  Search,
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  LayoutGrid,
  CalendarDays,
  Users,
  Filter,
} from 'lucide-react';
import type { LeaveFilters as LeaveFilterState } from '../../hooks/useLeaveManagement';
import type { Employee } from '../../../masters/employees/types/employee';

interface LeaveFiltersProps {
  filters: LeaveFilterState;
  employees: Employee[];
  departments: string[];
  onFilterChange: <K extends keyof LeaveFilterState>(key: K, value: LeaveFilterState[K]) => void;
  onReset: () => void;
}

const STATUS_TABS: { label: LeaveFilterState['status']; icon: React.ReactNode }[] = [
  { label: 'All', icon: <LayoutGrid size={14} /> },
  { label: 'Pending', icon: <Clock size={14} /> },
  { label: 'Approved', icon: <CheckCircle2 size={14} /> },
  { label: 'Rejected', icon: <XCircle size={14} /> },
];

function LeaveFilters({ filters, employees, departments, onFilterChange, onReset }: LeaveFiltersProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-4">
      {/* Row 1 — search + status tabs + reset */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by employee, type, or reason..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/50 hover:bg-slate-50 transition text-slate-700 placeholder-slate-400 font-medium"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange('search', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs font-bold text-slate-400 hover:text-slate-600 rounded-md transition bg-slate-200/60"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60">
          {STATUS_TABS.map((tab) => {
            const isActive = filters.status === tab.label;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => onFilterChange('status', tab.label)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shadow-2xs ${
                  isActive
                    ? 'bg-white text-brand-700 shadow-sm border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition shadow-2xs"
        >
          <RotateCcw size={14} className="text-slate-400" />
          Reset Filters
        </button>
      </div>

      {/* Row 2 — month, department, employee, leave type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
            <CalendarDays size={13} className="text-brand-500" /> Month
          </span>
          <input
            type="month"
            value={filters.month}
            onChange={(e) => onFilterChange('month', e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/50 transition text-slate-700 font-medium"
          />
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
            <Users size={13} className="text-brand-500" /> Department
          </span>
          <select
            value={filters.department}
            onChange={(e) => onFilterChange('department', e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/50 transition text-slate-700 font-medium"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
            <Users size={13} className="text-brand-500" /> Employee
          </span>
          <select
            value={filters.employeeId ?? ''}
            onChange={(e) => onFilterChange('employeeId', e.target.value ? Number(e.target.value) : null)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/50 transition text-slate-700 font-medium"
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.employeeName}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
            <Filter size={13} className="text-brand-500" /> Leave Type
          </span>
          <select
            value={filters.leaveType}
            onChange={(e) => onFilterChange('leaveType', e.target.value as LeaveFilterState['leaveType'])}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/50 transition text-slate-700 font-medium"
          >
            <option value="All">All Types</option>
            <option value="Casual">Casual</option>
            <option value="Sick">Sick</option>
            <option value="Emergency">Emergency</option>
            <option value="Annual">Annual</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export default memo(LeaveFilters);
