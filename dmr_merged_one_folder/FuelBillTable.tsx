// src/modules/operations/fuel-expenses/components/FuelBillTable.tsx

import { FileImage } from "lucide-react";
import type { FuelExpense } from "../types/fuelExpense";

interface Props {
  bills: FuelExpense[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function FuelBillTable({ bills, selectedId, onSelect }: Props) {
  if (bills.length === 0) {
    return <div className="text-center py-8 text-slate-400 text-sm">No fuel bills found.</div>;
  }

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const handleRowClick = (bill: FuelExpense) => {
    onSelect(selectedId === bill.id ? null : bill.id);
  };

  // ✅ Filename: just the bill number with .png extension
  const getImageFilename = (bill: FuelExpense): string => {
    return `${bill.billNo}.png`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50/80 border-b border-slate-200">
          <tr className="text-slate-600">
            <th className="w-8 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">#</th>
            <th className="w-36 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Bill No</th>
            <th className="w-24 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Source</th>
            <th className="w-32 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Trip</th>
            <th className="w-28 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Date</th>
            <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Vehicle</th>
            <th className="w-20 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Litres</th>
            <th className="w-24 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Rate (₹/L)</th>
            <th className="w-32 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Amount (₹)</th>
            <th className="w-32 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">GPS</th>
            <th className="w-32 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Bill Image</th>
            <th className="w-28 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((bill, idx) => {
            const isSelected = selectedId === bill.id;
            const isStatusPending = bill.status === "Pending";
            const gpsLabel =
              bill.gpsLat != null && bill.gpsLon != null
                ? `${bill.gpsLat.toFixed(4)}, ${bill.gpsLon.toFixed(4)}`
                : "—";

            return (
              <tr
                key={bill.id}
                className={`border-b border-slate-200 hover:bg-slate-50/70 transition-colors duration-150 cursor-pointer ${
                  isSelected ? "bg-slate-100/80" : ""
                } ${isStatusPending ? "border-l-4 border-l-orange-400" : ""}`}
                onClick={() => handleRowClick(bill)}
              >
                {/* Serial number with status dot */}
                <td className="px-2 py-2.5 text-center text-xs text-slate-500">
                  <div className="flex items-center justify-center gap-1">
                    <span>{idx + 1}</span>
                    {isStatusPending && (
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-400" title="Pending" />
                    )}
                    {!isStatusPending && (
                      <span className="inline-block h-2 w-2 rounded-full bg-green-400" title="Approved" />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-medium text-blue-700 truncate">{bill.billNo}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-bold uppercase ${bill.sourceType === "TRIP" ? "text-indigo-700" : "text-slate-600"}`}>
                    {bill.sourceType === "TRIP" ? "TRIP" : "MANUAL"}
                  </span>
                </td>
                <td className="px-3 py-2.5 truncate">{bill.tripNo || "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(bill.date)}</td>
                <td className="px-3 py-2.5 truncate">{bill.vehicleNo}</td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  {bill.litres.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  {bill.rate.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">
                  ₹ {bill.amount.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-xs truncate">{gpsLabel}</td>
                {/* Image column – show filename as clickable link */}
                <td className="px-3 py-2.5">
                  {bill.image ? (
                    <a
                      href={bill.image}
                      download={getImageFilename(bill)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium truncate block max-w-[120px]"
                      onClick={(e) => e.stopPropagation()} // prevent row click
                      title="Download image"
                    >
                      {getImageFilename(bill)}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <FileImage size={14} className="text-slate-300" />
                      No image
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs font-semibold">
                  {bill.sourceType === "TRIP" && bill.status === "Approved"
                    ? "AUTO APPROVED"
                    : bill.status}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}