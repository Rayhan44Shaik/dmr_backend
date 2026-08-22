import React, { useState, useMemo } from "react";
import {
  Lock,
  LayoutGrid,
  BarChart3,
  Pencil,
  X,
} from "lucide-react";
import UnLoadingTable from "./Step_4";
import BoxWeightAnalysis from "./Step_4/BoxWeightAnalysis";
import type { ShopDelivery, Trip, BoxDetail } from "../types/trip";
import { getDeliveriesBalanceError } from "../../../../shared/trip/validation";
import { TRIP_STEP_DEFINITIONS } from "../../../../shared/trip/definitions";

interface Props {
  rows: ShopDelivery[];
  setRows: React.Dispatch<React.SetStateAction<ShopDelivery[]>>;
  shops: any[];
  birdTypes: any[];
  trip: Trip;
  updateDeliveries: (rows: ShopDelivery[], persistToStorage?: boolean, silent?: boolean) => void;
  submitDeliveriesStep: () => boolean | Promise<boolean>;
  saveDeliveriesProgress?: (rows: ShopDelivery[]) => Promise<boolean>;
  clearForm: () => void;
  readOnly?: boolean;
  editable?: boolean;
  canEdit?: boolean;
  onCancel?: () => void;
  boxDetails?: BoxDetail[];
  persistedDeliveries?: ShopDelivery[];
}

export default function StepDeliveries({
  rows,
  setRows,
  shops,
  birdTypes,
  trip,
  updateDeliveries,
  submitDeliveriesStep,
  saveDeliveriesProgress,
  clearForm,
  readOnly: _readOnly = false,
  editable = false,
  canEdit = true,
  onCancel: _onCancel,
  boxDetails = [],
  persistedDeliveries,
}: Props) {
  // Toggle view mode: 'shops' | 'analysis'
  const [viewMode, setViewMode] = useState<"shops" | "analysis">("shops");

  // Step-level edit mode
  const [isStepEditing, setIsStepEditing] = useState(false);

  // Shop-level edit mode
  const [editingShopId, setEditingShopId] = useState<string | number | null>(null);

  // Locked state: step submitted AND user hasn't enabled step-level edit mode
  const isLocked = trip.deliveryStepSubmitted && !editable && !isStepEditing;

  // Save individual shop row & trigger persist sync
  const handleSaveRow = (updatedRow: ShopDelivery) => {
    const rowIndex = rows.findIndex((r) => r.id === updatedRow.id);
    let updatedRows: ShopDelivery[] = [];
    if (rowIndex === -1) {
      updatedRows = [updatedRow, ...rows];
    } else {
      updatedRows = [...rows];
      updatedRows[rowIndex] = updatedRow;
    }
    setRows(updatedRows);
    updateDeliveries(updatedRows, true, false);
    setEditingShopId(null);
  };

  const handleStartEditShop = (shopId: string | number) => {
    if (isLocked) return;
    setEditingShopId(shopId);
  };

  const handleCancelStepEdit = () => {
    setIsStepEditing(false);
    setEditingShopId(null);
  };

  const handleCancelWizard = () => {
    clearForm();
  };

  // Shared Desktop + Mobile delivery balance rules.
  const validationResult = useMemo(() => {
    const balanceError = getDeliveriesBalanceError(trip, rows);
    return {
      valid: balanceError == null,
      reason: balanceError ? "Delivery balance mismatch." : "",
      balanceError,
    };
  }, [rows, trip]);

  const canLock = validationResult.valid;

  const handleLockDeliveries = async (): Promise<boolean> => {
    if (!canLock) {
      return false;
    }
    setIsStepEditing(false);
    setEditingShopId(null);
    updateDeliveries(rows);
    return await submitDeliveriesStep();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
            4
          </span>
          <h2 className="text-base font-bold text-slate-800 tracking-tight">
            {TRIP_STEP_DEFINITIONS[3].title.toUpperCase()}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleCancelWizard}
            className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-all active:scale-95"
            title="Close Trip"
            aria-label="Close Trip"
          >
            <X size={14} />
          </button>
          {/* VIEW MODE TOGGLE BUTTONS */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60">
            <button
              type="button"
              onClick={() => setViewMode("shops")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "shops"
                  ? "bg-white text-blue-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid size={13} /> Shop View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("analysis")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "analysis"
                  ? "bg-white text-blue-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 size={13} /> Box Analysis
            </button>
          </div>

          {isLocked ? (
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsStepEditing(true)}
                  className="bg-white hover:bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700 transition-all active:scale-95"
                  title="Edit Step"
                >
                  <Pencil size={14} />
                </button>
              )}
              <span className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5">
                <Lock size={12} className="text-slate-500" /> Submitted & Locked
              </span>
            </div>
          ) : (
            <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-3 py-1 rounded-full border border-blue-200 whitespace-nowrap">
              {editingShopId ? "Editing Shop Details" : isStepEditing ? "Editing Trip " + trip.tripNo : "Step Unlocked"}
            </span>
          )}
        </div>
      </div>

      {/* Main Content View */}
      {viewMode === "shops" ? (
        <UnLoadingTable
          rows={rows}
          setRows={setRows}
          shops={shops}
          birdTypes={birdTypes}
          boxDetails={boxDetails}
          readOnly={isLocked}
          isSubmitted={trip.deliveryStepSubmitted}
          editingShopId={editingShopId}
          onEditShop={handleStartEditShop}
          onCancelEdit={handleCancelStepEdit}
          onSaveRow={handleSaveRow}
          tripNo={trip.tripNo}
          vehicleNo={trip.vehicleNo}
          supervisorName={trip.supervisorName}
          supervisorPhone=""
          tripDate={trip.tripDate}
          updateDeliveries={updateDeliveries}
          saveDeliveries={saveDeliveriesProgress ? async () => saveDeliveriesProgress(rows) : undefined}
          submitDeliveries={handleLockDeliveries}
          onClose={handleCancelWizard}
          persistedRows={persistedDeliveries ?? []}
          balanceError={validationResult.balanceError}
        />
      ) : (
        <BoxWeightAnalysis
          boxDetails={boxDetails}
          deliveries={rows}
          dcWeight={trip.dcWeight}
          totalFarmBirds={trip.totalBirds}
          tripNo={trip.tripNo}
          vehicleNo={trip.vehicleNo}
          supervisorName={trip.supervisorName}
          tripDate={trip.tripDate}
        />
      )}
    </div>
  );
}