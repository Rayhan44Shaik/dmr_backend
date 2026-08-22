// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\farms\pages\FarmsPage.tsx

import React, { useState, useMemo } from "react";
import DashboardLayout from "../../../../layouts/DashboardLayout/DashboardLayout";
import PageLayout from "../../../../components/common/PageLayout";
import FarmTable from "../components/FarmTable";
import FarmDialog from "../dialogs/FarmDialog";
import { useFarms } from "../hooks/useFarms";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { exportToExcel } from "../../../../utils/exportUtils";
import { logAuditEvent } from "../../../../utils/securityUtils";
import { handleApiError } from "../services/farmService";
import type { Farm } from "../types/farm";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import BulkImportDialog from "../../components/bulk-import/BulkImportDialog";
import { buildFarmBulkImportConfig } from "../bulkImportConfig";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type FarmsPageProps = { embedded?: boolean };

const ITEMS_PER_PAGE = 10;

function FarmsPage({ embedded = false }: FarmsPageProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { showNotification } = useSafeNotification();
  const {
    farms,
    loading,
    saving,
    error,
    reload,
    addFarm,
    addFarmsBulk,
    editFarm,
    removeFarm,
  } = useFarms();

  const farmBulkImportConfig = useMemo(
    () => buildFarmBulkImportConfig({ addFarmsBulk, reload }),
    [addFarmsBulk, reload]
  );

  // Reset to page 1 whenever search keyword changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const filteredFarms = useMemo(() => {
    const keyword = search.toLowerCase();
    return farms.filter(
      (farm) =>
        farm.farmName.toLowerCase().includes(keyword) ||
        farm.ownerName.toLowerCase().includes(keyword) ||
        farm.supervisorName.toLowerCase().includes(keyword) ||
        farm.village.toLowerCase().includes(keyword) ||
        farm.phoneNumber.includes(keyword)
    );
  }, [farms, search]);

  // Pagination Calculations
  const totalPages = Math.ceil(filteredFarms.length / ITEMS_PER_PAGE) || 1;
  const paginatedFarms = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredFarms.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredFarms, currentPage]);

  const handleExportPDF = () => {
    if (filteredFarms.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }

    // Initialize jsPDF in Landscape ('l') orientation with exact dimensions
    const doc = new jsPDF("l", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm for A4 Landscape
    const margin = 14;
    const usableWidth = pageWidth - (margin * 2);

    // Adjusted weights to ensure total sum maps precisely to usableWidth without clipping right borders
    // [Farm No, Farm Name, Owner, Supervisor, Village, Phone, Status]
    const relativeWeights = [0.09, 0.23, 0.18, 0.18, 0.16, 0.08, 0.08];
    const columnStylesConfig: { [key: number]: { cellWidth: number; halign?: "center" | "left" | "right" } } = {};

    const headers = ["Farm No", "Farm Name", "Owner", "Supervisor", "Village", "Phone", "Status"];
    headers.forEach((_, index) => {
      const computedWidth = usableWidth * relativeWeights[index];
      const isCentered = index === 0 || index === headers.length - 1;
      columnStylesConfig[index] = {
        cellWidth: computedWidth,
        halign: isCentered ? "center" : "left",
      };
    });

    // Document Header Block
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("Farms - Master List", margin, 15);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated On: ${new Date().toLocaleDateString()}`, margin, 21);

    const rows = filteredFarms.map((farm) => [
      farm.farmNo.toString(),
      farm.farmName,
      farm.ownerName,
      farm.supervisorName,
      farm.village,
      farm.phoneNumber,
      farm.status,
    ]);

    // Render AutoTable with precise explicit table width bounds to prevent right-side clipping
    autoTable(doc, {
      startY: 26,
      head: [headers],
      body: rows,
      theme: "grid",
      tableWidth: usableWidth,
      margin: { left: margin, right: margin, bottom: 18 },
      styles: {
        fontSize: 8.5,
        cellPadding: 3.5,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      bodyStyles: {
        textColor: [51, 65, 85],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: columnStylesConfig,
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Confidential Business Report • Page ${data.pageNumber} of ${pageCount}`,
          margin,
          doc.internal.pageSize.height - 10
        );
      },
    });

    const filename = `Farms_${new Date().toISOString().split("T")[0]}`;
    doc.save(`${filename}.pdf`);
    logAuditEvent("EXPORT_PDF", "Farms", undefined, { count: filteredFarms.length });
    showNotification("PDF exported successfully!", "success");
  };

  const handleExportExcel = () => {
    if (filteredFarms.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = ["Farm No", "Farm Name", "Owner", "Supervisor", "Village", "Phone", "Status"];
    const rows = filteredFarms.map((farm) => [
      farm.farmNo.toString(),
      farm.farmName,
      farm.ownerName,
      farm.supervisorName,
      farm.village,
      farm.phoneNumber,
      farm.status,
    ]);
    const filename = `Farms_${new Date().toISOString().split("T")[0]}`;

    exportToExcel("Farms - Master List", headers, rows, filename);
    logAuditEvent("EXPORT_EXCEL", "Farms", undefined, { count: filteredFarms.length });
    showNotification("Excel exported successfully!", "success");
  };

  const validateFarm = (farm: Partial<Farm>): string | null => {
    const farmName = farm.farmName?.trim() ?? "";
    const ownerName = farm.ownerName?.trim() ?? "";
    const supervisorName = farm.supervisorName?.trim() ?? "";
    const phoneNumber = farm.phoneNumber?.trim() ?? "";
    const village = farm.village?.trim() ?? "";
    const capacity = Number(farm.capacity);

    if (!farmName || !ownerName || !supervisorName || !phoneNumber || !village) {
      return "Please fill all required fields (marked with *).";
    }
    if (ownerName.length < 3) {
      return "Owner Name must contain at least 3 characters.";
    }
    if (!/^[0-9]{10}$/.test(phoneNumber)) {
      return "Mobile Number must be exactly 10 digits.";
    }
    if (Number.isNaN(capacity) || capacity <= 0) {
      return "Bird Capacity must be a positive number.";
    }

    const duplicateFarm = farms.some(
      (f) =>
        f.farmName.trim().toLowerCase() === farmName.toLowerCase() &&
        f.id !== editingFarm?.id
    );
    if (duplicateFarm) {
      return "Farm Name already exists.";
    }

    const duplicatePhone = farms.some(
      (f) => f.phoneNumber === phoneNumber && f.id !== editingFarm?.id
    );
    if (duplicatePhone) {
      return "Phone Number already exists.";
    }

    return null;
  };

  const handleSaveFarm = async (farm: Partial<Farm>): Promise<boolean> => {
    const validationError = validateFarm(farm);
    if (validationError) {
      showNotification(validationError, "error");
      return false;
    }

    const payload = {
      farmName: farm.farmName!.trim(),
      ownerName: farm.ownerName!.trim(),
      supervisorName: farm.supervisorName!.trim(),
      phoneNumber: farm.phoneNumber!.trim(),
      village: farm.village!.trim(),
      address: farm.address?.trim() ?? "",
      capacity: Number(farm.capacity),
      status: farm.status ?? "Active",
    };

    try {
      if (editingFarm) {
        await editFarm(editingFarm.id, { ...payload, farmNo: editingFarm.farmNo });
        logAuditEvent("UPDATE_FARM", "Farms", editingFarm.id);
        showNotification("Farm updated successfully!", "success");
      } else {
        const list = await addFarm(payload);
        const created = list.find(
          (f) =>
            f.farmName === payload.farmName &&
            f.phoneNumber === payload.phoneNumber
        );
        logAuditEvent("CREATE_FARM", "Farms", created?.id);
        showNotification("Farm added successfully!", "success");
      }
      setEditingFarm(null);
      setShowDialog(false);
      return true;
    } catch (err) {
      showNotification(handleApiError(err), "error");
      return false;
    }
  };

  const handleEditFarm = (farm: Farm) => {
    setEditingFarm(farm);
    setShowDialog(true);
  };

  const handleDeleteFarm = async (id: number) => {
    setDeletingId(id);
    try {
      await removeFarm(id);
      logAuditEvent("DELETE_FARM", "Farms", id);
      showNotification("Farm deleted successfully!", "success");
    } catch (err) {
      showNotification(handleApiError(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const content = (
    <div className="w-full space-y-2 farm-page-container">
      <style>{`
        .farm-page-container button,
        [role="dialog"] button {
          transition: all 0.15s ease-in-out;
        }
        .farm-page-container button:hover,
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
                  placeholder="Search Farm..."
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

              {/* 3. Add Farm Button (Solid Blue Fill) */}
              <button
                onClick={() => {
                  setEditingFarm(null);
                  setShowDialog(true);
                }}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 z-10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Farm
              </button>
            </div>
          </div>
        </div>

        {/* Status Counter Bar */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 uppercase tracking-wider">
              Farms Directory
            </span>
            <span className="px-2 py-0.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 rounded-full">
              {filteredFarms.length} records
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
            Showing {paginatedFarms.length} of {filteredFarms.length} Farms (Page {currentPage} of {totalPages})
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
          {loading && farms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium">Loading farms...</p>
            </div>
          ) : !loading && farms.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <p className="text-sm font-medium text-slate-700">No farms found.</p>
              <p className="text-xs text-slate-500">Add a farm to get started.</p>
            </div>
          ) : (
            <FarmTable
              farms={paginatedFarms}
              onEdit={handleEditFarm}
              onDelete={handleDeleteFarm}
            />
          )}
        </div>

        {shouldShowPagination(filteredFarms.length) && (
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
      <FarmDialog
        open={showDialog}
        onClose={() => {
          setEditingFarm(null);
          setShowDialog(false);
        }}
        onSave={handleSaveFarm}
        farm={editingFarm}
      />
      <BulkImportDialog
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        config={farmBulkImportConfig}
        existing={farms}
        onImported={(result) => {
          logAuditEvent("BULK_IMPORT", "Farms", undefined, {
            count: result.imported,
          });
          showNotification(
            `Imported ${result.imported} of ${result.total} farms.`,
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

export default React.memo(FarmsPage);