// src/modules/staff/components/duty-planner/DutyPlannerGrid.tsx

import { memo } from 'react';
import { getShiftConfigs } from '../../services/staffService';
import { isDateLocked } from '../../hooks/useDutyPlanner';
import type { DutyAssignment, Employee } from '../../types/staffDashboard';

interface DutyPlannerGridProps {
  employees: Employee[];
  weekDays: string[];
  getAssignment: (employeeId: number, date: string) => DutyAssignment | undefined;
  onCellClick: (employeeId: number, date: string) => void;
  loading: boolean;
  /** True when the backend locks the whole week (Submitted/Locked). */
  weekLocked?: boolean;
}

function DutyPlannerGrid({ employees, weekDays, getAssignment, onCellClick, loading, weekLocked = false }: DutyPlannerGridProps) {
  const shiftConfigs = getShiftConfigs();

  const getShiftStyle = (dutyType: string) => {
    const config = shiftConfigs.find(s => s.type === dutyType);
    if (!config) return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' };
    return { bg: config.bgColor, text: config.textColor, border: config.borderColor };
  };

  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });
    const dayNum = date.toLocaleDateString('en-IN', { day: '2-digit' });
    const isSaturday = date.getDay() === 6;
    return { dayName, dayNum, isSaturday };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        <div className="animate-pulse space-y-3 max-w-2xl mx-auto">
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-8 bg-slate-100 rounded" />
          <div className="h-8 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  if (employees.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">No employees match filters.</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200" style={{ minWidth: '100%' }}>
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 w-48 min-w-[180px] border-r border-slate-200">
                Employee
              </th>
              {weekDays.map((day, idx) => {
                const { dayName, dayNum, isSaturday } = getDayLabel(day);
                return (
                  <th key={idx} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[100px] max-w-[140px] relative">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-medium">{dayName}</span>
                      <span className="text-sm font-semibold text-slate-700">{dayNum}</span>
                      {isSaturday && (
                        <span className="text-[10px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                          COMPULSORY
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10 w-48 min-w-[180px] border-r border-slate-200">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-slate-900 truncate">{emp.employeeName}</span>
                    <span className="text-xs text-slate-400 font-medium">{emp.role}</span>
                  </div>
                </td>
                {weekDays.map((day, idx) => {
                  const assignment = getAssignment(emp.id, day);
                  const dutyType = assignment?.dutyType || '';
                  const { bg, text, border } = getShiftStyle(dutyType);
                  const isSaturday = new Date(day).getDay() === 6;
                  const locked = weekLocked || isDateLocked(day);
                  const isRestOrWeeklyOff = dutyType === 'Rest' || dutyType === 'WeeklyOff';

                  return (
                    <td key={idx} className="px-1.5 py-1.5 text-center min-w-[100px] max-w-[140px]">
                      <button
                        onClick={() => onCellClick(emp.id, day)}
                        disabled={locked}
                        className={`w-full h-10 min-h-[40px] rounded-lg text-xs font-medium border transition-all duration-150 ${
                          locked
                            ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-75 cursor-not-allowed'
                            : isSaturday && isRestOrWeeklyOff
                              ? 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-50 cursor-not-allowed'
                              : `${bg} ${text} ${border} hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`
                        }`}
                        title={
                          locked
                            ? 'Past week locked (cannot edit)'
                            : isSaturday
                              ? 'Saturday – compulsory duty (Rest/Weekly Off not allowed)'
                              : ''
                        }
                        style={{ minWidth: '90px' }}
                      >
                        {dutyType || (
                          <span className="text-slate-300">—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(DutyPlannerGrid);