// src/modules/operations/fuel-expenses/pages/FuelExpensesPage.tsx

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Select from "react-select";
import { useFuelExpenses } from "../hooks/useFuelExpenses";
import { FuelKPICards } from "../components/FuelKPICards";
import { FuelEntryForm } from "../components/FuelEntryForm";
import { FuelBillTable } from "../components/FuelBillTable";
import { FuelViewModal } from "../components/FuelViewModal";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import { useVehicles } from "../../../masters/vehicles/hooks/useVehicles";
import { useEmployees } from "../../../masters/employees/hooks/useEmployees";
import { exportToPDF, exportToExcel } from "../../../../utils/exportUtils";
import {
  Eye,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Plus,
  FileText,
  FileSpreadsheet,
  RotateCcw,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { FuelExpense } from "../types/fuelExpense";
import { DatePicker } from "../../../../components/common/DatePicker";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";
import {
  opsPageClass,
  opsFilterCardClass,
  opsFilterLabelClass,
  opsInputClass,
  opsPrimaryButtonClass,
  opsSecondaryButtonClass,
  opsPdfButtonClass,
  opsExcelButtonClass,
  opsTableCardClass,
  opsTableHeaderBarClass,
  opsReactSelectStyles,
} from "../../../../shared/ui/operationsStyles";

function FuelExpensesPage() {
  const { showNotification } = useSafeNotification();
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();

  const activeVehicles = useMemo(
    () =>
      vehicles
        .filter((v) => v.status?.toLowerCase() === "active")
        .map((v) => v.vehicleNumber)
        .sort(),
    [vehicles]
  );

  const vehicleOptions = useMemo(
    () => activeVehicles.map((v) => ({ value: v, label: v })),
    [activeVehicles]
  );

  const drivers = useMemo(
    () => employees.filter((e) => e.department === "Driver"),
    [employees]
  );
  const supervisors = useMemo(
    () => employees.filter((e) => e.department === "Supervisor"),
    [employees]
  );

  const {
    filteredData,
    paginatedData,
    currentPage,
    setCurrentPage,
    totalPages,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedVehicles,
    setSelectedVehicles,
    resetFilters,
    filteredSummary,
    saveExpense,
    updateExpense,
    deleteExpense,
    approveExpense,
    rejectExpense,
    refresh,
    loading,
    isSaving,
    error,
    totalCount,
    sourceType,
    setSourceType,
    statusFilter,
    setStatusFilter,
    tripNo,
    setTripNo,
    billNo,
    setBillNo,
  } = useFuelExpenses(showNotification);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedBill = useMemo(
    () => filteredData.find((b) => b.id === selectedId) || null,
    [filteredData, selectedId]
  );

  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tableContainerRef.current &&
        !tableContainerRef.current.contains(event.target as Node)
      ) {
        setSelectedId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<FuelExpense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingBill, setViewingBill] = useState<FuelExpense | null>(null);

  const hasFilters = fromDate !== "" || toDate !== "" || selectedVehicles.length > 0;

  const canEditDelete = useCallback(
    (bill: FuelExpense): boolean => {
      const created = new Date(bill.createdDate);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 10;
    },
    []
  );

  const handleView = useCallback(() => {
    if (selectedBill) {
      setViewingBill(selectedBill);
      setViewModalOpen(true);
    }
  }, [selectedBill]);

  const handleEdit = useCallback(() => {
    if (!selectedBill) return;
    if (selectedBill.sourceType === "TRIP") {
      showNotification("Trip diesel bills cannot be edited in Fuel Expenses.", "error");
      return;
    }
    if (!canEditDelete(selectedBill)) {
      showNotification("Edit not allowed – bill is older than 10 days.", "error");
      return;
    }
    setEditingId(selectedBill.id);
    setEditingData(selectedBill);
    setShowForm(true);
  }, [selectedBill, canEditDelete, showNotification]);

  const { requestDelete, cancel, pendingItems } = usePendingDelete<string>(async (id) => {
    await deleteExpense(id);
    setSelectedId((current) => (current === id ? null : current));
  });

  const handleDelete = useCallback(() => {
    if (!selectedBill) return;
    if (!canEditDelete(selectedBill)) {
      showNotification("Delete not allowed – bill is older than 10 days.", "error");
      return;
    }
    requestDelete(selectedBill.id, { label: `Deleting fuel bill ${selectedBill.billNo}` });
  }, [selectedBill, canEditDelete, requestDelete, showNotification]);

  const handleApprove = useCallback(() => {
    if (!selectedBill) return;
    if (selectedBill.status === "Approved") {
      showNotification("Bill already approved.", "info");
      return;
    }
    if (selectedBill.sourceType === "TRIP") {
      showNotification("Trip diesel bills are automatically approved when the trip is completed.", "info");
      return;
    }
    approveExpense(selectedBill.id);
    setSelectedId(null);
  }, [selectedBill, approveExpense, showNotification]);

  const handleReject = useCallback(() => {
    if (!selectedBill) return;
    if (selectedBill.sourceType === "TRIP") {
      showNotification("Trip diesel bills cannot be rejected from Fuel Expenses.", "info");
      return;
    }
    const reason = window.prompt("Rejection reason?");
    if (!reason?.trim()) return;
    rejectExpense(selectedBill.id, reason.trim());
    setSelectedId(null);
  }, [selectedBill, rejectExpense, showNotification]);

  const handleFormCancel = useCallback(() => {
    setEditingId(null);
    setEditingData(null);
    setShowForm(false);
  }, []);

  const closeViewModal = useCallback(() => {
    setViewModalOpen(false);
    setViewingBill(null);
  }, []);

  const handleExportPDF = useCallback(() => {
    if (filteredData.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = [
      "Bill No",
      "Date",
      "Vehicle",
      "Driver",
      "Supervisor",
      "Meter (KM)",
      "Amount (₹)",
      "Rate (₹/L)",
      "Litres",
      "Bunk",
      "Status",
    ];
    const rows = filteredData.map((b) => [
      b.billNo,
      b.date,
      b.vehicleNo,
      b.driverName,
      b.supervisorName,
      b.meterReading.toString(),
      b.amount.toFixed(2),
      b.rate.toFixed(2),
      b.litres.toFixed(2),
      b.petrolBunk,
      b.status,
    ]);
    const filename = `Fuel_Bills_${new Date().toISOString().split("T")[0]}`;
    exportToPDF("Fuel Bills Report", headers, rows, filename);
  }, [filteredData, showNotification]);

  const handleExportExcel = useCallback(() => {
    if (filteredData.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = [
      "Bill No",
      "Date",
      "Vehicle",
      "Driver",
      "Supervisor",
      "Meter (KM)",
      "Amount (₹)",
      "Rate (₹/L)",
      "Litres",
      "Bunk",
      "Status",
    ];
    const rows = filteredData.map((b) => [
      b.billNo,
      b.date,
      b.vehicleNo,
      b.driverName,
      b.supervisorName,
      b.meterReading,
      b.amount,
      b.rate,
      b.litres,
      b.petrolBunk,
      b.status,
    ]);
    const filename = `Fuel_Bills_${new Date().toISOString().split("T")[0]}`;
    exportToExcel("Fuel Bills Report", headers, rows, filename);
  }, [filteredData, showNotification]);

  const handleResetFilters = () => {
    resetFilters();
    setCurrentPage(1);
    showNotification("Filters reset.", "info");
  };

  const handleRefresh = () => {
    refresh();
    showNotification("Data refreshed.", "info");
  };

  const KpiCards = useMemo(
    () =>
      hasFilters ? (
        <FuelKPICards
          totalLitres={filteredSummary.totalLitres}
          totalAmount={filteredSummary.totalAmount}
          pendingCount={filteredSummary.pendingCount}
          approvedCount={filteredSummary.approvedCount}
          avgMileage={filteredSummary.avgMileage}
          recentTripMileage={filteredSummary.recentTripMileage}
        />
      ) : null,
    [hasFilters, filteredSummary]
  );

  const selectStyles = opsReactSelectStyles();

  return (
    <div className={opsPageClass}>
      {/* ─── Action Buttons ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className={opsPrimaryButtonClass}
          >
            <Plus size={15} />
            {showForm ? "Hide Form" : "Add Fuel Bill"}
          </button>
          {/* ─── Refresh Button ──────────────────────────────────────── */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={opsSecondaryButtonClass}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>Refresh</span>
          </button>
          {error && (
            <button
              onClick={() => refresh()}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-all"
            >
              Retry
            </button>
          )}
          {/* ─── Auto‑Save Indicator ────────────────────────────────── */}
          {isSaving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin text-emerald-500" />
              Saving...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            disabled={!hasFilters || filteredData.length === 0}
            className={`${opsPdfButtonClass} ${
              !hasFilters || filteredData.length === 0 ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <FileText size={15} /> PDF
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!hasFilters || filteredData.length === 0}
            className={`${opsExcelButtonClass} ${
              !hasFilters || filteredData.length === 0 ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
      </div>

      {KpiCards}

      {/* ─── Filters ──────────────────────────────────────────────────── */}
      <div className={opsFilterCardClass}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          <div className="md:col-span-1">
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              label="From Date"
              className="w-full"
              placeholder="Select start"
            />
          </div>
          <div className="md:col-span-1">
            <DatePicker
              value={toDate}
              onChange={setToDate}
              label="To Date"
              className="w-full"
              placeholder="Select end"
            />
          </div>
          <div className="md:col-span-2">
            <label className={opsFilterLabelClass}>Vehicles</label>
            <Select
              isMulti
              isSearchable
              options={vehicleOptions}
              value={vehicleOptions.filter((opt) => selectedVehicles.includes(opt.value))}
              onChange={(selected) => {
                setSelectedVehicles(selected ? selected.map((s: any) => s.value) : []);
                setCurrentPage(1);
              }}
              placeholder="Search & select vehicles..."
              styles={selectStyles}
              maxMenuHeight={190}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className={opsFilterLabelClass}>Source</label>
            <select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setCurrentPage(1); }} className={opsInputClass}>
              <option value="">All</option>
              <option value="TRIP">TRIP</option>
              <option value="MANUAL">MANUAL</option>
            </select>
          </div>
          <div>
            <label className={opsFilterLabelClass}>Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className={opsInputClass}>
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className={opsFilterLabelClass}>Trip No</label>
            <input value={tripNo} onChange={(e) => { setTripNo(e.target.value); setCurrentPage(1); }} className={opsInputClass} />
          </div>
          <div>
            <label className={opsFilterLabelClass}>Bill No</label>
            <input value={billNo} onChange={(e) => { setBillNo(e.target.value); setCurrentPage(1); }} className={opsInputClass} />
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            onClick={handleResetFilters}
            className={opsSecondaryButtonClass}
          >
            <RotateCcw size={14} /> Reset Filters
          </button>
        </div>
      </div>

      {showForm && (
        <FuelEntryForm
          onSave={saveExpense}
          onUpdate={updateExpense}
          editingId={editingId}
          initialData={editingData}
          vehicles={vehicles}
          drivers={drivers}
          supervisors={supervisors}
          onCancel={handleFormCancel}
        />
      )}

      {/* ─── Table Card ──────────────────────────────────────────────── */}
      <div className={opsTableCardClass} ref={tableContainerRef}>
        <div className={opsTableHeaderBarClass}>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-700">Fuel Bill Table</h3>
            <span className="text-xs text-slate-500">{totalCount} bills</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedBill ? (
              <>
                <span className="text-sm font-medium text-slate-700 mr-1">
                  Selected: {selectedBill.billNo}
                </span>
                <button
                  onClick={handleView}
                  className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition"
                  title="View"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={handleEdit}
                  disabled={!canEditDelete(selectedBill)}
                  className={`p-1.5 rounded-md transition ${
                    canEditDelete(selectedBill)
                      ? "text-green-600 hover:bg-green-50 hover:text-green-700 cursor-pointer"
                      : "text-slate-300 cursor-not-allowed"
                  }`}
                  title={canEditDelete(selectedBill) ? "Edit" : "Edit disabled (older than 10 days)"}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!canEditDelete(selectedBill)}
                  className={`p-1.5 rounded-md transition ${
                    canEditDelete(selectedBill)
                      ? "text-red-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      : "text-slate-300 cursor-not-allowed"
                  }`}
                  title={canEditDelete(selectedBill) ? "Delete" : "Delete disabled (older than 10 days)"}
                >
                  <Trash2 size={16} />
                </button>
                {selectedBill.status === "Pending" && selectedBill.sourceType !== "TRIP" && (
                  <>
                    <button
                      onClick={handleApprove}
                      className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition"
                      title="Approve"
                    >
                      <CheckCircle size={16} />
                    </button>
                    <button
                      onClick={handleReject}
                      className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition"
                      title="Reject"
                    >
                      <XCircle size={16} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-400">Select a row to view actions</span>
            )}
          </div>
        </div>

        <FuelBillTable
          bills={paginatedData}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <PendingDeleteNotification items={pendingItems} onCancel={cancel} />

        {shouldShowPagination(totalCount) && (
          <div className={paginationBarClass}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={paginationNavBtnClass}
            >
              Previous
            </button>
            <span className={paginationPageBtnClass(true)}>
              {currentPage}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={paginationNavBtnClass}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <FuelViewModal
        isOpen={viewModalOpen}
        bill={viewingBill}
        onClose={closeViewModal}
      />
    </div>
  );
}

export default React.memo(FuelExpensesPage);