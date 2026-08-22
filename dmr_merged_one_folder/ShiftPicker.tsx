// src/modules/staff/components/duty-planner/ShiftPicker.tsx

import { memo } from 'react';
import { Trash2, X } from 'lucide-react';
import { getShiftConfigs } from '../../services/staffService';

interface ShiftPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (dutyType: string) => void;
  onRemove?: () => void;
  currentDuty?: string;
  date: string;
  employeeName?: string;
  employeeRole?: string;
}

function ShiftPicker({ isOpen, onClose, onSelect, onRemove, currentDuty, date, employeeName, employeeRole }: ShiftPickerProps) {
  if (!isOpen) return null;

  const shifts = getShiftConfigs();
  const dateObj = new Date(date);
  const isSaturday = dateObj.getDay() === 6;

  const formattedDate = !isNaN(dateObj.getTime()) 
    ? dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) 
    : date;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-fadeIn border border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-slate-800">
            Select Duty for <span className="text-green-600 font-normal">{employeeName || 'Employee'}{employeeRole ? ` (${employeeRole})` : ''}</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition shrink-0 ml-2">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <p className="text-xs font-medium text-slate-400 mb-4">{formattedDate}</p>

        <div className="grid grid-cols-2 gap-2">
          {shifts.map((shift) => {
            const disabled = isSaturday && (shift.type === 'Rest' || shift.type === 'WeeklyOff');
            return (
              <button
                key={shift.type}
                onClick={() => {
                  if (disabled) return;
                  onSelect(shift.type);
                }}
                disabled={disabled}
                className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition hover:shadow-md active:scale-95 ${
                  currentDuty === shift.type ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                } ${shift.bgColor} ${shift.textColor} ${shift.borderColor} ${
                  disabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                {shift.label}
                {disabled && <span className="block text-[10px] text-rose-500 font-normal">(Saturday)</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-slate-400 text-center">
          {isSaturday && <span className="text-rose-500 font-medium">Saturday: Compulsory duty (cannot be Rest or Weekly Off)</span>}
        </div>

        {currentDuty && onRemove && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={onRemove}
              className="w-full py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-sm font-semibold transition hover:bg-rose-100 flex items-center justify-center gap-2"
            >
              <Trash2 size={15} />
              Remove Duty
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ShiftPicker);