// src/modules/staff/components/salary/SalaryRegisterFilters.tsx

import React from 'react';
import { FileDown, Eye, Pencil, Trash2, Calendar, ChevronLeft, ChevronRight, LayoutGrid, Clock, CheckCircle } from 'lucide-react';

interface SalaryRegisterFiltersProps {
  month: string;
  setMonth: (month: string) => void;
  department: string;
  setDepartment: (dept: string) => void;
  filter: string;
  setFilter: (filter: 'All' | 'Pending' | 'Paid') => void;
  masterEmployeesCount: number;
  departments: string[];
  isMonthPickerOpen: boolean;
  setIsMonthPickerOpen: (open: boolean) => void;
  pickerYear: number;
  setPickerYear: React.Dispatch<React.SetStateAction<number>>;
  monthPickerRef: React.RefObject<HTMLDivElement | null>;
  selectedIds: string[];
  records: any[];
  hasPaidSelected: boolean;
  onEditSelected: () => void;
  onDeleteSelected: () => void;
  onViewSelected: () => void;
  onExportPDF: () => void;
  formatMonthName: (monthStr: string) => string;
  getCurrentYearMonth: () => string;
}

const monthsList = [
  { name: 'Jan', value: '01' },
  { name: 'Feb', value: '02' },
  { name: 'Mar', value: '03' },
  { name: 'Apr', value: '04' },
  { name: 'May', value: '05' },
  { name: 'Jun', value: '06' },
  { name: 'Jul', value: '07' },
  { name: 'Aug', value: '08' },
  { name: 'Sep', value: '09' },
  { name: 'Oct', value: '10' },
  { name: 'Nov', value: '11' },
  { name: 'Dec', value: '12' },
];

export const SalaryRegisterFilters: React.FC<SalaryRegisterFiltersProps> = ({
  month,
  setMonth,
  department,
  setDepartment,
  filter,
  setFilter,
  masterEmployeesCount,
  departments,
  isMonthPickerOpen,
  setIsMonthPickerOpen,
  pickerYear,
  setPickerYear,
  monthPickerRef,
  selectedIds,
  hasPaidSelected,
  onEditSelected,
  onDeleteSelected,
  onViewSelected,
  onExportPDF,
  formatMonthName,
  getCurrentYearMonth,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 py-3 px-5 shadow-2xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Custom Modern Month & Year Picker */}
          <div className="relative" ref={monthPickerRef}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Select Month</label>
            <button
              type="button"
              onClick={() => {
                const [y] = month.split('-');
                if (y) setPickerYear(Number(y));
                setIsMonthPickerOpen(!isMonthPickerOpen);
              }}
              className="h-9 px-3 w-44 sm:w-48 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white text-slate-700 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-all font-medium cursor-pointer"
            >
              <span>{formatMonthName(month)}</span>
              <Calendar size={14} className="text-blue-500" />
            </button>

            {isMonthPickerOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-4 z-50 space-y-4">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setPickerYear(prev => prev - 1)}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition shadow-2xs cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-bold text-slate-800">{pickerYear}</span>
                  <button
                    type="button"
                    onClick={() => setPickerYear(prev => prev + 1)}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition shadow-2xs cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {monthsList.map((mObj) => {
                    const isSelected = month === `${pickerYear}-${mObj.value}`;
                    return (
                      <button
                        key={mObj.value}
                        type="button"
                        onClick={() => {
                          setMonth(`${pickerYear}-${mObj.value}`);
                          setIsMonthPickerOpen(false);
                        }}
                        className={`py-2.5 rounded-xl text-xs font-semibold transition-all transform active:scale-95 duration-100 flex items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600/20'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
                        }`}
                      >
                        {mObj.name}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = getCurrentYearMonth();
                      setMonth(cur);
                      const [y] = cur.split('-');
                      setPickerYear(Number(y));
                      setIsMonthPickerOpen(false);
                    }}
                    className="text-blue-600 font-semibold hover:underline cursor-pointer"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMonthPickerOpen(false)}
                    className="text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Department Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white text-slate-700 shadow-2xs hover:border-slate-300 transition-all font-medium cursor-pointer"
            >
              <option value="">All Departments ({masterEmployeesCount} Total Employees)</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
            <div className="inline-flex bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/80 shadow-2xs h-9 items-center">
              <button
                type="button"
                onClick={() => setFilter('All')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all transform active:scale-95 duration-150 cursor-pointer ${
                  filter === 'All' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={12} className={filter === 'All' ? 'text-blue-600' : 'text-slate-400'} />
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('Pending')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all transform active:scale-95 duration-150 cursor-pointer ${
                  filter === 'Pending' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock size={12} className={filter === 'Pending' ? 'text-blue-600' : 'text-slate-400'} />
                Pending
              </button>
              <button
                type="button"
                onClick={() => setFilter('Paid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all transform active:scale-95 duration-150 cursor-pointer ${
                  filter === 'Paid' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle size={12} className={filter === 'Paid' ? 'text-blue-600' : 'text-slate-400'} />
                Paid
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div>
          <div className="block text-xs font-semibold text-transparent uppercase tracking-wider mb-1 select-none pointer-events-none" aria-hidden="true">Action</div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5 mr-1 animate-in fade-in duration-150">
                {selectedIds.length === 1 && !hasPaidSelected && (
                  <button
                    type="button"
                    onClick={onEditSelected}
                    className="h-9 px-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                )}

                {!hasPaidSelected && (
                  <button
                    type="button"
                    onClick={onDeleteSelected}
                    className="h-9 px-3 rounded-xl border border-rose-200/80 bg-rose-50/80 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}

                {selectedIds.length === 1 && (
                  <button
                    type="button"
                    onClick={onViewSelected}
                    className="h-9 px-3 rounded-xl bg-blue-50/80 border border-blue-200/80 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Eye size={13} /> View
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onExportPDF}
              className="h-9 px-3.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition flex items-center gap-1.5 shadow-2xs group cursor-pointer"
            >
              <FileDown size={14} className="group-hover:translate-y-0.5 transition-transform" /> Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};