// src/modules/staff/components/leave/LeaveRequestForm.tsx

import { memo, useState, useEffect, useRef } from 'react';
import { Plus, X, ChevronDown, User, Briefcase, FileText, Layers, Hash } from 'lucide-react';
import { useSafeNotification } from '../../../../hooks/useSafeNotification';
import { DatePicker } from '../../../../components/common/DatePicker';
import { getEmployees } from '../../../masters/employees/services/employeeService';
import type { Employee } from '../../../masters/employees/types/employee';

interface LeaveRequestFormProps {
  employees?: Employee[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

function LeaveRequestForm({ employees: propEmployees, onSubmit, onCancel }: LeaveRequestFormProps) {
  const { showNotification } = useSafeNotification();

  // Fallback to service if props are empty
  const employees: any[] = propEmployees && propEmployees.length > 0 ? propEmployees : getEmployees();

  const getEmpDepartment = (emp: any): string => {
    return emp?.department || emp?.dept || emp?.departmentName || 'General';
  };

  const getEmpName = (emp: any): string => {
    return emp?.employeeName || emp?.name || emp?.fullName || emp?.firstName || 'Unnamed Employee';
  };

  const getEmpId = (emp: any): number | string => {
    // Backend leave_requests.employee_id references employees.id (PK), so the
    // DB id must be sent, not the employee number.
    return emp?.id ?? emp?.employeeId ?? emp?.employeeNo ?? 0;
  };

  const uniqueDepartments = Array.from(
    new Set(employees.map((emp) => getEmpDepartment(emp)))
  ).filter(Boolean) as string[];

  const initialDept = uniqueDepartments[0] || 'General';
  
  const initialDepartmentEmployees = employees.filter(
    (emp) => getEmpDepartment(emp) === initialDept
  );
  const initialEmp = initialDepartmentEmployees.length > 0 ? initialDepartmentEmployees[0] : (employees[0] || null);

  const [selectedDepartment, setSelectedDepartment] = useState<string>(initialDept);
  
  const [form, setForm] = useState({
    employeeId: initialEmp ? getEmpId(initialEmp) : 0,
    employeeName: initialEmp ? getEmpName(initialEmp) : '',
    department: initialDept,
    type: 'Casual' as const,
    fromDate: '',
    toDate: '',
    days: 0,
    reason: '',
  });

  const [employeeSearch, setEmployeeSearch] = useState(initialEmp ? getEmpName(initialEmp) : '');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

  // Filter employees strictly by selected department first
  const departmentFilteredEmployees = employees.filter(
    (emp) => getEmpDepartment(emp) === selectedDepartment
  );

  const filteredEmployees = departmentFilteredEmployees.filter((emp) =>
    getEmpName(emp).toLowerCase().includes(employeeSearch.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (form.fromDate && form.toDate) {
      const from = new Date(form.fromDate + 'T00:00:00');
      const to = new Date(form.toDate + 'T00:00:00');
      const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setForm((prev) => ({ ...prev, days: diff > 0 ? diff : 0 }));
    } else {
      setForm((prev) => ({ ...prev, days: 0 }));
    }
  }, [form.fromDate, form.toDate]);

  const handleDepartmentChange = (dept: string) => {
    setSelectedDepartment(dept);
    
    const matchingEmployees = employees.filter((emp) => getEmpDepartment(emp) === dept);
    const firstMatch = matchingEmployees.length > 0 ? matchingEmployees[0] : null;
    
    const newEmpId = firstMatch ? getEmpId(firstMatch) : 0;
    const newEmpName = firstMatch ? getEmpName(firstMatch) : '';

    setForm((prev) => ({
      ...prev,
      department: dept,
      employeeId: newEmpId,
      employeeName: newEmpName,
    }));
    setEmployeeSearch(newEmpName);
    setIsEmployeeDropdownOpen(false);
  };

  const handleFromDateChange = (date: string) => {
    setForm((prev) => {
      let updatedTo = prev.toDate;
      if (date && prev.toDate && date > prev.toDate) {
        updatedTo = '';
      }
      return { ...prev, fromDate: date, toDate: updatedTo };
    });
  };

  const handleToDateChange = (date: string) => {
    if (form.fromDate && date && date < form.fromDate) {
      showNotification('To date cannot be earlier than from date.', 'error');
      return;
    }
    setForm((prev) => ({ ...prev, toDate: date }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromDate || !form.toDate) {
      showNotification('Please select both from and to dates.', 'error');
      return;
    }
    if (form.days <= 0 || form.toDate < form.fromDate) {
      showNotification('Invalid date range. To date cannot be earlier than from date.', 'error');
      return;
    }
    if (!form.employeeId) {
      showNotification('Please select a valid employee.', 'error');
      return;
    }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-5 transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/60 shadow-2xs">
            <Plus size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">New Leave Request</h3>
            <p className="text-xs text-slate-500">Select department first to load respective staff members</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Line 1 - Item 1: Department Field First */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Briefcase size={13} className="text-blue-500" /> Department First
          </label>
          <select
            value={selectedDepartment}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50/50 hover:bg-slate-50 transition text-slate-700 font-medium"
          >
            {uniqueDepartments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        {/* Line 1 - Item 2: Respective Employee Field */}
        <div className="relative" ref={employeeDropdownRef}>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <User size={13} className="text-blue-500" /> Respective Employee
          </label>
          <div className="relative">
            <input
              type="text"
              value={employeeSearch}
              onChange={(e) => {
                setEmployeeSearch(e.target.value);
                setIsEmployeeDropdownOpen(true);
              }}
              onFocus={() => {
                setEmployeeSearch('');
                setIsEmployeeDropdownOpen(true);
              }}
              onBlur={() => {
                if (!employeeSearch) {
                  setEmployeeSearch(form.employeeName);
                }
              }}
              placeholder={`Search in ${selectedDepartment}...`}
              className="w-full h-11 px-3.5 pr-10 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50/50 hover:bg-slate-50 transition text-slate-700 font-medium"
            />
            <button
              type="button"
              onClick={() => {
                setEmployeeSearch('');
                setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {isEmployeeDropdownOpen && (
            <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl text-slate-700">
              {(employeeSearch === '' ? departmentFilteredEmployees : filteredEmployees).length > 0 ? (
                (employeeSearch === '' ? departmentFilteredEmployees : filteredEmployees).map((emp) => {
                  const empName = getEmpName(emp);
                  const empId = getEmpId(emp);
                  return (
                    <button
                      key={empId}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setForm((prev) => ({ ...prev, employeeId: empId, employeeName: empName }));
                        setEmployeeSearch(empName);
                        setIsEmployeeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg hover:bg-blue-50 hover:text-blue-700 transition flex items-center justify-between ${
                        form.employeeId === empId ? 'bg-blue-50 font-bold text-blue-700' : ''
                      }`}
                    >
                      <span>{empName}</span>
                      <span className="text-[10px] text-slate-400 font-normal bg-slate-100 px-2 py-0.5 rounded-md">
                        ID: {empId}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-xs text-slate-400 text-center">
                  No employees found in "{selectedDepartment}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Line 2 - Item 1: From Date */}
        <div>
          <DatePicker
            label="From Date"
            value={form.fromDate}
            onChange={handleFromDateChange}
            required
            className="[&_input]:h-11 [&_input]:rounded-xl [&_input]:border-slate-200 [&_input]:bg-slate-50/50"
          />
        </div>

        {/* Line 2 - Item 2: To Date */}
        <div>
          <DatePicker
            label="To Date"
            value={form.toDate}
            onChange={handleToDateChange}
            required
            className="[&_input]:h-11 [&_input]:rounded-xl [&_input]:border-slate-200 [&_input]:bg-slate-50/50"
          />
        </div>

        {/* Line 3 - Item 1: Leave Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Layers size={13} className="text-blue-500" /> Leave Type
          </label>
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as any }))}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50/50 hover:bg-slate-50 transition text-slate-700 font-medium"
          >
            <option value="Casual">Casual Leave</option>
            <option value="Sick">Sick Leave</option>
            <option value="Emergency">Emergency Leave</option>
            <option value="Annual">Annual Leave</option>
          </select>
        </div>

        {/* Line 3 - Item 2: Days Counter Box */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Hash size={13} className="text-blue-500" /> Calculated Days
          </label>
          <div className="relative">
            <input
              type="number"
              value={form.days}
              readOnly
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm bg-blue-50/40 text-blue-900 font-bold cursor-not-allowed"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600">
              Days
            </span>
          </div>
        </div>

        {/* Line 4: Reason */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <FileText size={13} className="text-blue-500" /> Reason (Optional)
          </label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            rows={2.5}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-slate-50/50 hover:bg-slate-50 transition text-slate-700 placeholder-slate-400 font-medium resize-none"
            placeholder="Provide a brief explanation for your leave request..."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-5 py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5"
        >
          <Plus size={15} />
          Submit Request
        </button>
      </div>
    </form>
  );
}

export default memo(LeaveRequestForm);