import { Check, Box, Users, Scale, Clock, Pencil, FileText, Package, AlertCircle } from "lucide-react";
import type { ShopDelivery } from "../../types/trip";
import type { ShopDeliveryWithExtra } from "./useShopDeliveryForm";

interface Props {
  row: ShopDeliveryWithExtra;
  readOnly: boolean;
  onEdit: (row: ShopDelivery) => void;
  onPDF: (row: ShopDeliveryWithExtra) => void;
  supervisorName?: string;
  supervisorPhone?: string;
  vehicleNo?: string;
  tripDate?: string;
}

export default function ShopDeliveryCard({
  row,
  readOnly,
  onEdit,
  onPDF,
}: Props) {
  const isWeightMode = row.deliveryMode === "weight";
  const selectedBoxes = row.selectedBoxIds || [];
  const perBox = row.perBoxData || [];
  const mortalityCount = row.mortality ?? 0;
  const mortKg = row.mortKg ?? 0;
  const display = (value: string | number | null | undefined) => {
    if (value == null || value === "" || (typeof value === "number" && Number.isNaN(value))) return "Not entered";
    return String(value);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-2.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/50">
            <Check size={16} className="stroke-[2.5]" />
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="font-bold text-slate-800 text-sm truncate" title={row.shopName}>
              {row.shopName || "Not entered"}
            </span>

            <span
              title={`Delivery Mode: ${isWeightMode ? "Weight" : "Box"}`}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 border ${
                isWeightMode
                  ? "bg-purple-50 text-purple-700 border-purple-200/60"
                  : "bg-amber-50 text-amber-700 border-amber-200/60"
              }`}
            >
              {isWeightMode ? "WEIGHT" : "BOX"}
            </span>

            {mortalityCount > 0 && (
              <span
                title={`Mortality: ${mortalityCount} birds`}
                className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200/60 shrink-0 flex items-center gap-1 text-[10px] font-bold"
              >
                <AlertCircle size={13} className="text-rose-500 stroke-[2.5]" />
                <span>{mortalityCount}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!readOnly && (
            <button
              onClick={() => onEdit(row)}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200/60 transition-colors flex items-center justify-center"
              title="Edit Shop Delivery"
            >
              <Pencil size={14} className="stroke-[2]" />
            </button>
          )}

          <button
            onClick={() => onPDF(row)}
            className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 transition-colors flex items-center justify-center"
            title="Download PDF"
          >
            <FileText size={14} className="stroke-[2]" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-slate-50/70 p-2 rounded-xl border border-slate-100">
        <div className="flex flex-col items-center justify-center text-center p-1 bg-white rounded-lg border border-slate-200/50 shadow-2xs">
          <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-0.5">
            <Box size={11} className="text-slate-500 stroke-[2]" /> Boxes
          </span>
          <span className="text-xs font-bold text-slate-800">{display(selectedBoxes.length || row.boxNo)}</span>
        </div>

        <div className="flex flex-col items-center justify-center text-center p-1 bg-white rounded-lg border border-slate-200/50 shadow-2xs">
          <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-0.5">
            <Users size={11} className="text-blue-500 stroke-[2]" /> Birds
          </span>
          <span className="text-xs font-bold text-slate-800">{row.birds ? row.birds : "Not entered"}</span>
        </div>

        <div className="flex flex-col items-center justify-center text-center p-1 bg-white rounded-lg border border-slate-200/50 shadow-2xs">
          <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-0.5">
            <Scale size={11} className="text-emerald-500 stroke-[2]" /> Weight
          </span>
          <span className="text-xs font-bold text-slate-800">
            {row.weight ? `${row.weight.toFixed(2)} kg` : "Not entered"}
          </span>
        </div>
      </div>

      {(mortalityCount > 0 || mortKg > 0) && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-red-50/60 rounded-lg border border-red-100 text-[11px]">
          <span className="text-red-600 font-semibold">Mortality</span>
          <span className="text-red-700 font-bold">
            {mortalityCount} birds · {mortKg ? mortKg.toFixed(2) : "0.00"} kg
          </span>
        </div>
      )}

      {selectedBoxes.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-100/60 rounded-lg border border-slate-200/40 text-[11px] overflow-x-auto no-scrollbar">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-[10px] uppercase">
            <Package size={12} className="text-slate-500" /> Box Nos:
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {selectedBoxes.map((id) => (
              <span
                key={id}
                className="px-1.5 py-0.2 bg-white text-slate-700 font-bold rounded border border-slate-200/80 text-[10px] shadow-2xs shrink-0"
              >
                #{id}
              </span>
            ))}
          </div>
        </div>
      )}

      {perBox.length > 0 && (
        <div className="rounded-lg border border-slate-200/60 bg-white px-2 py-1.5 text-[11px]">
          <span className="text-slate-400 font-semibold uppercase text-[10px]">Per-box allocation</span>
          <div className="mt-1 space-y-0.5">
            {perBox.map((pb) => (
              <div key={pb.boxNo} className="flex justify-between text-slate-700">
                <span className="font-bold">#{pb.boxNo}</span>
                <span>
                  {pb.birds} birds · {Number(pb.weight || 0).toFixed(2)} kg
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {row.remarks ? (
        <p className="text-[11px] text-slate-500 px-1">
          <span className="font-semibold text-slate-400 uppercase text-[10px]">Remarks </span>
          {row.remarks}
        </p>
      ) : null}

      <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-400 font-medium">
        <div className="flex items-center gap-1">
          <Clock size={12} className="text-slate-400 stroke-[2]" />
          <span>Captured {row.autoCaptureTime || "—"}</span>
        </div>
        {row.birdType ? (
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded-md text-[10px] border border-blue-100">
            {row.birdType}
          </span>
        ) : (
          <span className="text-[10px]">Not entered</span>
        )}
      </div>
    </div>
  );
}
