// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\vehicles\pages\MasterVehiclesPage.tsx

import React, { useState, useMemo } from "react";
import DashboardLayout from "../../../../layouts/DashboardLayout/DashboardLayout";
import PageLayout from "../../../../components/common/PageLayout";
import VehicleTable from "../components/VehicleTable";
import VehicleDialog from "../dialogs/VehicleDialog";
import { useVehicles } from "../hooks/useVehicles";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { exportToPDF, exportToExcel } from "../../../../utils/exportUtils";
import { logAuditEvent } from "../../../../utils/securityUtils";
import { handleApiError } from "../services/vehicleService";
import type { Vehicle } from "../types/vehicle";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import BulkImportDialog from "../../components/bulk-import/BulkImportDialog";
import { buildVehicleBulkImportConfig } from "../bulkImportConfig";

type MasterVehiclesPageProps = {
  embedded?: boolean;
};

const ITEMS_PER_PAGE = 10;

function MasterVehiclesPage({ embedded = false }: MasterVehiclesPageProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { showNotification } = useSafeNotification();
  const {
    vehicles,
    loading,
    saving,
    error,
    reload,
    addVehicle,
    addVehiclesBulk,
    editVehicle,
    removeVehicle,
  } = useVehicles();

  const vehicleBulkImportConfig = useMemo(
    () => buildVehicleBulkImportConfig({ addVehiclesBulk, reload }),
    [addVehiclesBulk, reload]
  );

  // Reset to page 1 whenever search keyword changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const filteredVehicles = useMemo(() => {
    const keyword = search.toLowerCase();
    return vehicles.filter(
      (vehicle) =>
        vehicle.vehicleNumber?.toLowerCase().includes(keyword) ||
        vehicle.vehicleType?.toLowerCase().includes(keyword) ||
        vehicle.trackingId?.toLowerCase().includes(keyword) ||
        vehicle.fastagBank?.toLowerCase().includes(keyword) ||
        vehicle.engineNumber?.toLowerCase().includes(keyword) ||
        vehicle.chassisNumber?.toLowerCase().includes(keyword)
    );
  }, [vehicles, search]);

  // Pagination Calculations
  const totalPages = Math.ceil(filteredVehicles.length / ITEMS_PER_PAGE) || 1;
  const paginatedVehicles = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVehicles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredVehicles, currentPage]);

  const handleExportPDF = () => {
    if (filteredVehicles.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = ["Vehicle No", "Vehicle Number", "Type", "Boxes", "Bird Capacity", "Status"];
    const rows = filteredVehicles.map((v) => [
      v.vehicleNo?.toString() || "",
      v.vehicleNumber || "",
      v.vehicleType || "",
      v.noOfBoxes?.toString() || "0",
      v.birdCapacity?.toString() || "0",
      v.status || "",
    ]);
    const filename = `Vehicles_${new Date().toISOString().split("T")[0]}`;
    exportToPDF("Vehicles - Master List", headers, rows, filename);
    logAuditEvent("EXPORT_PDF", "Vehicles", undefined, { count: filteredVehicles.length });
    showNotification("PDF exported successfully!", "success");
  };

  const handleExportExcel = () => {
    if (filteredVehicles.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = ["Vehicle No", "Vehicle Number", "Type", "Boxes", "Bird Capacity", "Status"];
    const rows = filteredVehicles.map((v) => [
      v.vehicleNo?.toString() || "",
      v.vehicleNumber || "",
      v.vehicleType || "",
      v.noOfBoxes?.toString() || "0",
      v.birdCapacity?.toString() || "0",
      v.status || "",
    ]);
    const filename = `Vehicles_${new Date().toISOString().split("T")[0]}`;
    exportToExcel("Vehicles - Master List", headers, rows, filename);
    logAuditEvent("EXPORT_EXCEL", "Vehicles", undefined, { count: filteredVehicles.length });
    showNotification("Excel exported successfully!", "success");
  };

  const validateVehicle = (vehicle: Partial<Vehicle> & { emiDay?: number; totalEMIs?: number }): string | null => {
    const vehicleNumber = vehicle.vehicleNumber?.trim() ?? "";
    const vehicleType = vehicle.vehicleType?.trim() ?? "";
    const engineNumber = vehicle.engineNumber?.trim() ?? "";
    const chassisNumber = vehicle.chassisNumber?.trim() ?? "";
    const noOfBoxes = Number(vehicle.noOfBoxes);
    const birdCapacity = Number(vehicle.birdCapacity);
    const capacityKg = Number(vehicle.capacityKg);

    if (!vehicleNumber || !vehicleType || Number.isNaN(noOfBoxes) || Number.isNaN(birdCapacity) || Number.isNaN(capacityKg)) {
      return "Please fill all required fields.";
    }
    if (!engineNumber) {
      return "Engine Number is required.";
    }
    if (!chassisNumber) {
      return "Chassis Number is required.";
    }
    if (noOfBoxes <= 0 || birdCapacity <= 0 || capacityKg <= 0) {
      return "Boxes, bird capacity, and capacity (kg) must be positive numbers.";
    }

    const duplicate = vehicles.some(
      (v) =>
        v.vehicleNumber?.trim().toLowerCase() === vehicleNumber.toLowerCase() &&
        v.id !== editingVehicle?.id
    );
    if (duplicate) {
      return "Vehicle Number already exists.";
    }

    return null;
  };

  const handleSaveVehicle = async (
    vehicle: Partial<Vehicle> & { emiDay?: number; totalEMIs?: number }
  ): Promise<boolean> => {
    const validationError = validateVehicle(vehicle);
    if (validationError) {
      showNotification(validationError, "error");
      return false;
    }

    const payload = {
      vehicleNumber: vehicle.vehicleNumber!.trim(),
      vehicleType: vehicle.vehicleType!.trim(),
      trackingId: vehicle.trackingId?.trim() ?? "",
      noOfBoxes: Number(vehicle.noOfBoxes),
      birdCapacity: Number(vehicle.birdCapacity),
      capacityKg: Number(vehicle.capacityKg),
      fastagBank: vehicle.fastagBank?.trim() ?? "",
      engineNumber: vehicle.engineNumber!.trim(),
      chassisNumber: vehicle.chassisNumber!.trim(),
      insuranceExpiry: editingVehicle?.insuranceExpiry ?? "",
      permitExpiry: editingVehicle?.permitExpiry ?? "",
      fitnessExpiry: editingVehicle?.fitnessExpiry ?? "",
      purchaseDate: vehicle.purchaseDate ?? "",
      purchaseAmount: vehicle.purchaseAmount,
      emiStartDate: editingVehicle?.emiStartDate,
      emiDay: vehicle.emiDay,
      totalEMIs: vehicle.totalEMIs,
      rcDate: vehicle.rcDate ?? "",
      status: vehicle.status ?? "Active",
    };

    try {
      if (editingVehicle) {
        await editVehicle(editingVehicle.id, {
          ...payload,
          vehicleNo: editingVehicle.vehicleNo,
        });
        logAuditEvent("UPDATE_VEHICLE", "Vehicles", editingVehicle.id);
        showNotification("Vehicle updated successfully!", "success");
      } else {
        const list = await addVehicle(payload);
        const created = list.find(
          (v) =>
            v.vehicleNumber === payload.vehicleNumber &&
            v.engineNumber === payload.engineNumber
        );
        logAuditEvent("CREATE_VEHICLE", "Vehicles", created?.id);
        showNotification("Vehicle added successfully!", "success");
      }
      setEditingVehicle(null);
      setShowDialog(false);
      return true;
    } catch (err) {
      showNotification(handleApiError(err), "error");
      return false;
    }
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setShowDialog(true);
  };

  const handleDeleteVehicle = async (id: number) => {
    setDeletingId(id);
    try {
      await removeVehicle(id);
      logAuditEvent("DELETE_VEHICLE", "Vehicles", id);
      showNotification("Vehicle deleted successfully!", "success");
    } catch (err) {
      showNotification(handleApiError(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const content = (
    <div className="w-full space-y-2 vehicle-page-container">
      <style>{`
        .vehicle-page-container button,
        [role="dialog"] button {
          transition: all 0.15s ease-in-out;
        }
        .vehicle-page-container button:hover,
        [role="dialog"] button:hover {
          transform: translateY(-1px);
        }
      `}</style>

      {/* Main Container - Removed overflow-hidden so dropdowns overlay properly */}
      <div className="w-full bg-white rounded-xl border border-slate-200/90 shadow-sm">
        {/* Toolbar - Search on LEFT, Buttons on RIGHT in same line */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/40 rounded-t-xl">
          <div className="flex items-center justify-between gap-4">
            {/* Search Bar - Left Side */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search Vehicle..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  disabled={loading}
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Action Buttons - Right Side */}
            <div className="flex items-center gap-3 flex-shrink-0">
              
              {/* 1. Export Dropdown (Soft Light Emerald Fill) */}
              <div className="relative group z-50">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-all shadow-sm">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Export
                  <svg className="w-4 h-4 text-emerald-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-32 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 overflow-hidden">
                  <button
                    onClick={handleExportPDF}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M8 11a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    PDF
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors border-t border-slate-100"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1H9a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                    Excel
                  </button>
                </div>
              </div>

              {/* 2. Import Button (Soft Light Indigo Fill) */}
              <button
                onClick={() => setShowBulkImport(true)}
                disabled={loading || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all shadow-sm disabled:opacity-50 z-40"
              >
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import
              </button>

              {/* 3. Add Vehicle Button (Solid Blue Fill) */}
              <button
                onClick={() => {
                  setEditingVehicle(null);
                  setShowDialog(true);
                }}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 z-10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Vehicle
              </button>
            </div>
          </div>
        </div>

        {/* Status Counter Bar */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 uppercase tracking-wider">
              Vehicles Directory
            </span>
            <span className="px-2 py-0.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 rounded-full">
              {filteredVehicles.length} records
            </span>
            {(loading || saving || deletingId !== null) && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full">
                <svg className="animate-spin h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {loading ? "Loading..." : "Saving..."}
              </span>
            )}
          </div>
          <p className="text-slate-500 font-medium">
            Showing {paginatedVehicles.length} of {filteredVehicles.length} Vehicles (Page {currentPage} of {totalPages})
          </p>
        </div>

        {error && !loading && (
          <div className="mx-4 mt-3 px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                void reload().catch(() => undefined);
              }}
              className="shrink-0 text-xs font-semibold text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="p-0 relative min-h-[120px]">
          {loading && vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium">Loading vehicles...</p>
            </div>
          ) : !loading && vehicles.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <p className="text-sm font-medium text-slate-700">No vehicles found.</p>
              <p className="text-xs text-slate-500">Add a vehicle to get started.</p>
            </div>
          ) : (
            <VehicleTable
              vehicles={paginatedVehicles}
              onEdit={handleEditVehicle}
              onDelete={handleDeleteVehicle}
            />
          )}
        </div>

        {shouldShowPagination(filteredVehicles.length) && (
        <div className={paginationBarClass}>
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || loading}
            className={paginationNavBtnClass}
          >
            Previous
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                disabled={loading}
                className={paginationPageBtnClass(currentPage === pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || loading}
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
        )}
      </div>

      {/* Modal Dialog */}
      <VehicleDialog
        open={showDialog}
        onClose={() => {
          setEditingVehicle(null);
          setShowDialog(false);
        }}
        onSave={handleSaveVehicle}
        vehicle={editingVehicle}
      />
      <BulkImportDialog
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        config={vehicleBulkImportConfig}
        existing={vehicles}
        onImported={(result) => {
          logAuditEvent("BULK_IMPORT", "Vehicles", undefined, {
            count: result.imported,
          });
          showNotification(
            `Imported ${result.imported} of ${result.total} vehicles.`,
            result.failed === 0 ? "success" : "error"
          );
        }}
      />
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <DashboardLayout>
      <PageLayout className="!py-2 px-8 sm:px-12 lg:px-16 max-w-6xl mx-auto">
        {content}
      </PageLayout>
    </DashboardLayout>
  );
}

export default React.memo(MasterVehiclesPage);