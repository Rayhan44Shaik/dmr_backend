import React from 'react';
import { DatePicker } from '../../../../components/common/DatePicker';

interface DateRangePickerProps {
  fromDate: string;
  toDate: string;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
  className?: string;
  disabled?: boolean;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  className = '',
  disabled = false,
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <DatePicker
        value={fromDate}
        onChange={onFromDateChange}
        placeholder="DD/MM/YYYY"
        disabled={disabled}
        className="w-[180px] min-w-[180px] flex-shrink-0"
        hideClear
      />
      <span className="text-sm text-slate-500 whitespace-nowrap">to</span>
      <DatePicker
        value={toDate}
        onChange={onToDateChange}
        placeholder="DD/MM/YYYY"
        disabled={disabled}
        className="w-[180px] min-w-[180px] flex-shrink-0"
        hideClear
      />
    </div>
  );
};

export default React.memo(DateRangePicker);