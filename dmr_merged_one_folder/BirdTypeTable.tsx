import { Pencil, Trash2 } from "lucide-react";
import type { BirdType } from "../types/birdType";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";

type BirdTypeTableProps = {
  birdTypes: BirdType[];
  onEdit: (birdType: BirdType) => void;
  onDelete: (id: number) => void;
};

function BirdTypeTable({ birdTypes, onEdit, onDelete }: BirdTypeTableProps) {
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">BIRD TYPE NO</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">BIRD TYPE</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">AVG WEIGHT (kg)</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">DESCRIPTION</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">STATUS</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {[...birdTypes]
            .sort((a, b) => (a.birdTypeNo > b.birdTypeNo ? 1 : -1))
            .map((bt) => (
            <tr key={bt.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-sm text-slate-600">{bt.birdTypeNo}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{bt.birdType}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-600">{bt.averageWeight}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{bt.description || "-"}</td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                    bt.status === "Active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {bt.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEdit(bt)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => requestDelete(bt.id, { label: `Deleting Bird Type "${bt.birdType}"` })}
                    className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {birdTypes.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                No bird types found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
}

export default BirdTypeTable;