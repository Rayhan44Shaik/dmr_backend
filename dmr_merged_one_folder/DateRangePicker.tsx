import React from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  fromDate: string;
  toDate: string;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
  className?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex-1">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => onFromDateChange(e.target.value)}
          className="block w-full rounded-md border border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
      <span className="text-sm text-gray-500">to</span>
      <div className="relative flex-1">
        <input
          type="date"
          value={toDate}
          onChange={(e) => onToDateChange(e.target.value)}
          className="block w-full rounded-md border border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
};

export default React.memo(DateRangePicker);