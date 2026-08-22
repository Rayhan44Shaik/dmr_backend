// src/modules/fleet-operations/components/analytics/HighestExpenseTable.tsx
import { memo } from 'react';

interface ExpenseRow {
  id: string | number;
  vehicleNumber: string;
  totalExpense: number;
  maintenance: number;
  fuel: number;
  fuelCost?: number;
}

interface HighestExpenseTableProps {
  expenses: ExpenseRow[];
}

const HighestExpenseTable = ({ expenses }: HighestExpenseTableProps) => {
  if (!expenses || expenses.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm font-medium">
        No recorded asset transactions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/70 backdrop-blur-md">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vehicle</th>
            <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Cost</th>
            <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Maint (₹)</th>
            <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fuel (₹)</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {expenses.map((expense) => {
            const grandTotal = expense.totalExpense || ((expense.maintenance || 0) + (expense.fuelCost || expense.fuel || 0)) || 1;
            const maintPercent = Math.min(((expense.maintenance || 0) / grandTotal) * 100, 100);

            return (
              <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors duration-150 group">
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-6 rounded-r bg-rose-500 -ml-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="font-bold text-slate-800 tracking-wide text-sm">{expense.vehicleNumber}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-black text-rose-600 text-sm">
                      ₹{Number(grandTotal).toLocaleString('en-IN')}
                    </span>
                    {/* Visual Resource Allocation Micro Bar */}
                    <div className="w-24 h-1 bg-amber-500 rounded-full overflow-hidden flex">
                      <div style={{ width: `${maintPercent}%` }} className="h-full bg-blue-500" title="Maintenance portion" />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap font-medium text-slate-600 text-sm">
                  {Number(expense.maintenance || 0).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap font-medium text-slate-600 text-sm">
                  {Number(expense.fuelCost ?? expense.fuel ?? 0).toLocaleString('en-IN')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default memo(HighestExpenseTable);