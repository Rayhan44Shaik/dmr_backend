import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
}

export const Input: React.FC<InputProps> = ({ label, helper, error, required, className = "", ...props }) => {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-xs font-semibold text-slate-600">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      <input
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/20 ${
          error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15" : "border-slate-300 focus:border-brand-500"
        } ${className}`}
        {...props}
      />
      {helper && !error && <p className="mt-1 text-xs text-slate-400">{helper}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
};
