// src/modules/operations/shop-sales/components/ShopSalesTable.tsx
//
// Final Shop Sales table — exactly these columns:
//   S.NO | SHOP SALES NO | DAY | SHOP NAME | WEIGHT | RATE | AMOUNT | REMARK
//
// No Trip No / Shop No / Date / Birds / Rate Lock / Action columns and no
// per-row edit buttons. Rows are selected by clicking; the top-right action
// area of the table header then shows [✎ Edit] when the backend says the
// selected sale is editable, or [🔒 Locked] with the backend lock reason
// when it is not. The backend's `editable` flag is the only authority.

import React, { useCallback, useState } from "react";
import {
  Hash,
  FileText,
  Scale,
  IndianRupee,
  Edit2,
  Lock,
  Check,
  X,
  Bird,
} from "lucide-react";
import type { ShopSale } from "../types/shopSale";
import {
  formatSaleAmount,
  formatSaleRate,
  formatSaleRemark,
  formatSaleWeight,
  shopSaleLockState,
  weekdayShort,
} from "../utils/shopSaleFormat";

interface Props {
  sales: ShopSale[];
  isLoading?: boolean;
  onUpdateSale?: (updatedSale: ShopSale) => void | Promise<void>;
}

const RATE_MIN = 50;
const RATE_MAX = 300;

function ShopSalesTable({ sales, isLoading = false, onUpdateSale }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ShopSale>>({});
  const [saving, setSaving] = useState(false);

  const selectedSale = sales.find((s) => s.id === selectedId) ?? null;
  const selectedLock = selectedSale
    ? shopSaleLockState(selectedSale)
    : null;

  const startEditing = useCallback(() => {
    // Only the backend's `editable` flag can open the edit flow — never
    // re-derived from a frontend date check.
    if (!selectedSale || !selectedSale.editable || saving) return;
    setEditingId(selectedSale.id);
    setEditData({
      totalBirds: selectedSale.totalBirds,
      totalWeight: selectedSale.totalWeight,
      rate: selectedSale.rate ?? 0,
    });
  }, [selectedSale, saving]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditData({});
  }, []);

  const handleInputChange = useCallback((field: keyof ShopSale, value: number) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const saveEditing = useCallback(async () => {
    if (!onUpdateSale || !editingId || saving) return;
    const originalSale = sales.find((s) => s.id === editingId);
    if (!originalSale) return;

    const newBirds = editData.totalBirds ?? originalSale.totalBirds ?? 0;
    const newWeight = editData.totalWeight ?? originalSale.totalWeight ?? 0;
    const newRate = editData.rate ?? originalSale.rate ?? 0;
    if (newRate < RATE_MIN || newRate > RATE_MAX) {
      window.alert(`Rate must be between ₹${RATE_MIN} and ₹${RATE_MAX}.`);
      return;
    }
    if (newBirds < 0 || newWeight < 0) {
      window.alert("Birds and Weight cannot be negative.");
      return;
    }

    // Amount is intentionally NOT included — the backend recomputes it from
    // weight × rate and returns it as authoritative. The updated row below
    // (after save) uses whatever the backend returned.
    const updatedSale: ShopSale = {
      ...originalSale,
      totalBirds: newBirds,
      totalWeight: newWeight,
      rate: newRate,
    };

    setSaving(true);
    try {
      await onUpdateSale(updatedSale);
      setEditingId(null);
      setEditData({});
    } catch {
      // The page surfaces the backend's rejection via notification and the
      // hook refreshes the authoritative record — exit the edit panel so the
      // reverted values are visible.
      setEditingId(null);
      setEditData({});
    } finally {
      setSaving(false);
    }
  }, [onUpdateSale, editingId, saving, sales, editData]);

  const handleRowSelect = useCallback(
    (sale: ShopSale) => {
      // While a row is being edited, clicking other rows just moves the
      // selection focus (edit state is discarded — the header panel
      // mirrors whichever row is selected/edited).
      if (saving) return;
      setSelectedId(sale.id);
      if (editingId && editingId !== sale.id) {
        setEditingId(null);
        setEditData({});
      }
    },
    [editingId, saving]
  );

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
        <div className="inline-flex items-center gap-2 text-slate-400 text-sm font-medium">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Loading shop sales...
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header / action area */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/80 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-bold text-slate-800 tracking-tight">
          Shop Sales
          {selectedSale && (
            <span className="ml-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full align-middle">
              {selectedSale.saleNo || "Selected"}
            </span>
          )}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {editingId ? (
            <>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Bird size={13} className="text-cyan-600" />
                <input
                  type="number"
                  aria-label="Birds"
                  value={editData.totalBirds ?? 0}
                  onChange={(e) => handleInputChange("totalBirds", parseFloat(e.target.value) || 0)}
                  className="w-20 h-9 text-center border border-blue-300 rounded-lg px-2 text-xs font-bold text-blue-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-2xs outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min={0}
                  step={1}
                  title="Birds"
                />
                <Scale size={13} className="text-orange-600" />
                <input
                  type="number"
                  aria-label="Weight"
                  value={editData.totalWeight ?? 0}
                  onChange={(e) => handleInputChange("totalWeight", parseFloat(e.target.value) || 0)}
                  className="w-20 h-9 text-center border border-blue-300 rounded-lg px-2 text-xs font-bold text-orange-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-2xs outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min={0}
                  step={0.01}
                  title="Weight (kg)"
                />
                <IndianRupee size={13} className="text-violet-600" />
                <input
                  type="number"
                  aria-label="Rate"
                  value={editData.rate ?? 0}
                  onChange={(e) => handleInputChange("rate", parseFloat(e.target.value) || 0)}
                  className="w-20 h-9 text-center border border-blue-300 rounded-lg px-2 text-xs font-bold text-violet-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-2xs outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min={0}
                  step={0.01}
                  title="Rate (₹)"
                />
              </div>
              <span className="text-xs text-blue-700 font-semibold bg-blue-50/80 px-2.5 py-1 rounded-full border border-blue-200/60">
                Editing {selectedSale?.saleNo || "row"}
              </span>
              <button
                type="button"
                onClick={saveEditing}
                disabled={saving}
                className="p-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all inline-flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-50"
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-all inline-flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-50"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </>
          ) : selectedSale && selectedLock ? (
            selectedLock.editable ? (
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
                title={`Edit ${selectedSale.saleNo || "selected sale"}`}
              >
                <Edit2 size={14} />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 px-3 py-2 text-xs font-semibold"
                  title={selectedLock.message}
                >
                  <Lock size={14} />
                  {selectedLock.label}
                </span>
                <span className="hidden md:inline text-xs text-slate-500 font-medium max-w-xs">
                  {selectedLock.message}
                </span>
              </div>
            )
          ) : (
            <span className="text-xs text-slate-400 font-medium">
              Select a row to view Edit / Locked status
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs md:text-sm">
          <thead className="bg-slate-50/80 border-b border-slate-200/70">
            <tr className="text-slate-700 whitespace-nowrap">
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-center gap-1.5">
                  <Hash size={14} className="text-slate-400" />
                  S.No
                </div>
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Shop Sales No
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Day
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Shop Name
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center justify-center gap-1.5">
                  <Scale size={14} className="text-orange-600" />
                  Weight
                </div>
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center justify-center gap-1.5">
                  <IndianRupee size={14} className="text-violet-600" />
                  Rate
                </div>
              </th>
              <th className="px-3.5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Amount
              </th>
              <th className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <div className="flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-400" />
                  Remark
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sales.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-sm font-medium">
                  No Shop Sales available until Rate Entry is locked.
                </td>
              </tr>
            ) : (
              sales.map((sale, index) => {
                const isSelected = selectedId === sale.id;
                const isEditing = editingId === sale.id;
                const lock = shopSaleLockState(sale);

                return (
                  <tr
                    key={sale.id}
                    onClick={() => handleRowSelect(sale)}
                    aria-selected={isSelected}
                    className={`transition-colors cursor-pointer group ${
                      isEditing
                        ? "bg-emerald-50/50 shadow-[inset_3px_0_0_0_#10b981]"
                        : isSelected
                          ? "bg-emerald-50/70 shadow-[inset_3px_0_0_0_#10b981] hover:bg-emerald-50"
                          : "hover:bg-slate-50/80"
                    } ${!lock.editable && !isSelected ? "opacity-80" : ""}`}
                  >
                    <td className="px-3.5 py-3 text-center text-xs font-semibold text-slate-500">
                      {isSelected && (
                        <span className="mr-1 inline-flex items-center justify-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                      )}
                      {index + 1}
                    </td>
                    <td className="px-3.5 py-3 font-semibold text-slate-800 text-xs whitespace-nowrap">
                      {sale.saleNo || "—"}
                    </td>
                    <td className="px-3.5 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">
                      {weekdayShort(sale.tripDate)}
                    </td>
                    <td className="px-3.5 py-3 text-xs font-semibold text-slate-700">
                      {sale.shopName}
                    </td>
                    <td className="px-3.5 py-3 text-center text-xs font-bold text-orange-600">
                      {formatSaleWeight(sale.totalWeight)}
                    </td>
                    <td className="px-3.5 py-3 text-center text-xs font-bold text-violet-600">
                      {formatSaleRate(sale.rate)}
                    </td>
                    <td className="px-3.5 py-3 text-center text-xs font-bold text-slate-700">
                      {formatSaleAmount(sale.amount)}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-slate-600">
                      <span className="text-slate-700 font-medium">
                        {formatSaleRemark(sale.remark)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default React.memo(ShopSalesTable);