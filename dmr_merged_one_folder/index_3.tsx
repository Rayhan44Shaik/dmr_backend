import React from "react";

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200/80 p-6 shadow-card ${className}`}>
    {children}
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "outline";
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
}> = ({ children, variant = "primary", onClick, className = "", type = "button" }) => {
  const baseStyle = "px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-brand-600 hover:bg-brand-700 text-white shadow-sm",
    secondary: "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700",
    danger: "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-100",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  };

  return (
    <button type={type} onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

export const Input: React.FC<{
  label: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}> = ({ label, value, onChange, type = "text", placeholder, readOnly = false, className = "" }) => (
  <div className="space-y-1.5 w-full">
    <label className="text-xs font-semibold text-slate-600">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#6c5ce7] focus:ring-2 focus:ring-[#6c5ce7]/10 transition-all ${className}`}
    />
  </div>
);

export const Select: React.FC<{
  label: string;
  options: string[];
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
}> = ({ label, options, value, onChange, className = "" }) => (
  <div className="space-y-1.5 w-full">
    <label className="text-xs font-semibold text-slate-600">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className={`w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#6c5ce7] transition-all ${className}`}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);