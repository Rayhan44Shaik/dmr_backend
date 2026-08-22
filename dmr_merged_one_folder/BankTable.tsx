import { Pencil, Trash2 } from "lucide-react";
import type { Bank } from "../types/bank";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";

type BankTableProps = {
  banks: Bank[];
  onEdit: (bank: Bank) => void;
  onDelete: (id: number) => void;
};

function BankTable({ banks, onEdit, onDelete }: BankTableProps) {
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">BANK NO</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">BANK NAME</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">BRANCH</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">ACCOUNT NUMBER</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">IFSC CODE</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">UPI ID</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">STATUS</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {[...banks]
            .sort((a, b) => (a.bankNo > b.bankNo ? 1 : -1))
            .map((bank) => (
            <tr key={bank.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-sm text-slate-600">{bank.bankNo}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{bank.bankName}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{bank.branch}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{bank.accountNumber}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{bank.ifscCode}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{bank.upiId || "-"}</td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                    bank.status === "Active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {bank.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEdit(bank)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => requestDelete(bank.id, { label: `Deleting Bank "${bank.bankName}"` })}
                    className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {banks.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                No banks found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
}

export default BankTable;