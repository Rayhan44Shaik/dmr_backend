// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\vehicles\components\VehicleTable.tsx

import { Pencil, Trash2 } from "lucide-react";
import type { Vehicle } from "../types/vehicle";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";

type VehicleTableProps = {
  vehicles: Vehicle[];
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (id: number) => void;
};

function VehicleTable({ vehicles, onEdit, onDelete }: VehicleTableProps) {
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">S.No</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Vehicle Number</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Type</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Boxes</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Bird Capacity</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {vehicles.map((vehicle, index) => (
            <tr key={vehicle.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-sm text-slate-600">{index + 1}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{vehicle.vehicleNumber}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{vehicle.vehicleType}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-600">{vehicle.noOfBoxes}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-600">{vehicle.birdCapacity}</td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                    vehicle.status === "Active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {vehicle.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEdit(vehicle)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit Vehicle"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => requestDelete(vehicle.id, { label: `Deleting Vehicle "${vehicle.vehicleNumber}"` })}
                    className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete Vehicle"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {vehicles.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                No vehicles found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
}

export default VehicleTable;