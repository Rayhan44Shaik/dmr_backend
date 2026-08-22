import { forwardRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Calendar } from "lucide-react";

interface Props {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  id?: string;
}

const CustomInput = forwardRef<HTMLInputElement, any>(({ value, onClick, placeholder, className, id }, ref) => (
  <div className="relative">
    <input
      ref={ref}
      id={id}
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      readOnly
      className={`h-10 w-full rounded-lg border border-slate-200 pl-3 pr-10 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none cursor-pointer ${className || ""}`}
    />
    <Calendar size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
));

export function ModernDatePicker({ selected, onChange, placeholder, label, className, id }: Props) {
  return (
    <div className={className}>
      {label && <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>}
      <DatePicker
        key={id}
        selected={selected}
        onChange={onChange}
        placeholderText={placeholder}
        dateFormat="dd-MM-yyyy"
        customInput={<CustomInput id={id} />}
        popperClassName="!z-50"
        popperPlacement="bottom-start"
        className="w-full"
        showYearDropdown
        showMonthDropdown
        dropdownMode="select"
        yearDropdownItemNumber={5}
        scrollableYearDropdown
      />
    </div>
  );
}