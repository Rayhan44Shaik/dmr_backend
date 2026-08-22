// src/modules/staff/components/salary/BulkPayModal.tsx

import { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";

export type BulkPayModalProps = {
  count: number;
  totalNet: number;
  month: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (input: { paymentDate: string; paymentMode: string }) => void;
  formatCurrency?: (amount: number) => string;
};

const PAYMENT_MODES = [
  "Cash",
  "Bank Transfer",
  "UPI",
  "Cheque",
  "Card",
];

export function BulkPayModal({
  count,
  totalNet,
  month,
  saving,
  onCancel,
  onConfirm,
  formatCurrency = (amt) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amt || 0),
}: BulkPayModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMode, setPaymentMode] = useState("Cash");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Pay Salaries</h3>
              <p className="text-xs text-slate-500">
                {count} record{count === 1 ? "" : "s"} · {month}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-700">Total Net Payable</span>
          <span className="text-xl font-extrabold text-emerald-800">{formatCurrency(totalNet)}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Payment Mode
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60"
            >
              {PAYMENT_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400">
          The Accounts payments are created atomically with the salary transitions in one
          transaction — a record that cannot be paid rejects the whole batch.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ paymentDate, paymentMode })}
            disabled={saving || !paymentDate}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? "Processing..." : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}