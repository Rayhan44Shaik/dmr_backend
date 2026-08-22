import { Pencil, Trash2 } from "lucide-react";
import type { Shop } from "../types/shop";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";

type ShopTableProps = {
  shops: Shop[];
  onEdit: (shop: Shop) => void;
  onDelete: (id: number) => void;
};

function ShopTable({ shops, onEdit, onDelete }: ShopTableProps) {
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Shop No</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Shop Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Owner</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Village</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Phone</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">WhatsApp</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Email ID</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Opening Balance</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {[...shops]
            .sort((a, b) => (a.shopNo > b.shopNo ? 1 : -1))
            .map((shop) => (
            <tr key={shop.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-sm text-slate-600">{shop.shopNo}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{shop.shopName}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{shop.ownerName}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{shop.village}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{shop.phoneNumber}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{shop.whatsappNumber || "—"}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{shop.email}</td>
              <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                ₹{Number(shop.openingBalance || 0).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                    shop.status === "Active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {shop.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEdit(shop)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit Shop"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => requestDelete(shop.id, { label: `Deleting Shop "${shop.shopName}"` })}
                    className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete Shop"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {shops.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                No shops found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
}

export default ShopTable;