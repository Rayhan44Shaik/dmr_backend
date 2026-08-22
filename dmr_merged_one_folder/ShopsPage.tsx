// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\shops\pages\ShopsPage.tsx

import React, { useState, useMemo } from "react";
import DashboardLayout from "../../../../layouts/DashboardLayout/DashboardLayout";
import PageLayout from "../../../../components/common/PageLayout";
import ShopTable from "../components/ShopTable";
import ShopDialog from "../dialogs/ShopDialog";
import { useShops } from "../hooks/useShops";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { exportToExcel } from "../../../../utils/exportUtils";
import { logAuditEvent } from "../../../../utils/securityUtils";
import { handleApiError } from "../services/shopService";
import type { Shop } from "../types/shop";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import BulkImportDialog from "../../components/bulk-import/BulkImportDialog";
import { buildShopBulkImportConfig } from "../bulkImportConfig";

type ShopsPageProps = { embedded?: boolean };

const ITEMS_PER_PAGE = 10;

function ShopsPage({ embedded = false }: ShopsPageProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { showNotification } = useSafeNotification();
  const {
    shops,
    loading,
    saving,
    error,
    reload,
    addShop,
    addShopsBulk,
    editShop,
    removeShop,
  } = useShops();

  const shopBulkImportConfig = useMemo(
    () => buildShopBulkImportConfig({ addShopsBulk, reload }),
    [addShopsBulk, reload]
  );

  // Reset to page 1 whenever search keyword changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const filteredShops = useMemo(() => {
    const keyword = search.toLowerCase();
    return shops.filter(
      (shop) =>
        shop.shopName.toLowerCase().includes(keyword) ||
        shop.ownerName.toLowerCase().includes(keyword) ||
        shop.village.toLowerCase().includes(keyword) ||
        shop.phoneNumber.includes(keyword) ||
        (shop.whatsappNumber ?? "").includes(keyword)
    );
  }, [shops, search]);

  // Pagination Calculations
  const totalPages = Math.ceil(filteredShops.length / ITEMS_PER_PAGE) || 1;
  const paginatedShops = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredShops.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredShops, currentPage]);

  const handleExportPDF = () => {
    if (filteredShops.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }

    // Initialize jsPDF in Landscape ('l') orientation with exact dimensions
    const doc = new jsPDF("l", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm for A4 Landscape
    const margin = 14;
    const usableWidth = pageWidth - (margin * 2);

    // Adjusted weights to ensure total sum maps precisely to usableWidth without clipping right borders
    const relativeWeights = [0.10, 0.26, 0.20, 0.22, 0.12, 0.10];
    const columnStylesConfig: { [key: number]: { cellWidth: number; halign?: "center" | "left" | "right" } } = {};

    const headers = ["Shop No", "Shop Name", "Owner", "Village", "Phone", "Status"];
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
    doc.text("Shops - Master List", margin, 15);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated On: ${new Date().toLocaleDateString()}`, margin, 21);

    const rows = filteredShops.map((shop) => [
      shop.shopNo.toString(),
      shop.shopName,
      shop.ownerName,
      shop.village,
      shop.phoneNumber,
      shop.status,
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

    const filename = `Shops_${new Date().toISOString().split("T")[0]}`;
    doc.save(`${filename}.pdf`);
    logAuditEvent("EXPORT_PDF", "Shops", undefined, { count: filteredShops.length });
    showNotification("PDF exported successfully!", "success");
  };

  const handleExportExcel = () => {
    if (filteredShops.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = ["Shop No", "Shop Name", "Owner", "Village", "Phone", "Status"];
    const rows = filteredShops.map((shop) => [
      shop.shopNo.toString(),
      shop.shopName,
      shop.ownerName,
      shop.village,
      shop.phoneNumber,
      shop.status,
    ]);
    const filename = `Shops_${new Date().toISOString().split("T")[0]}`;

    exportToExcel("Shops - Master List", headers, rows, filename);
    logAuditEvent("EXPORT_EXCEL", "Shops", undefined, { count: filteredShops.length });
    showNotification("Excel exported successfully!", "success");
  };

  const validateShop = (shop: Partial<Shop>): string | null => {
    const shopName = shop.shopName?.trim() ?? "";
    const ownerName = shop.ownerName?.trim() ?? "";
    const phoneNumber = shop.phoneNumber?.trim() ?? "";
    const whatsappNumber = shop.whatsappNumber?.trim() ?? "";
    const email = shop.email?.trim() ?? "";
    const village = shop.village?.trim() ?? "";

    if (!shopName || !ownerName || !phoneNumber || !email || !village) {
      return "Please fill all required fields (marked with *).";
    }
    if (shopName.length < 3) {
      return "Shop Name must contain at least 3 characters.";
    }
    if (ownerName.length < 3) {
      return "Owner Name must contain at least 3 characters.";
    }
    if (!/^[0-9]{10}$/.test(phoneNumber)) {
      return "Mobile Number must be exactly 10 digits.";
    }
    if (whatsappNumber !== "" && !/^[0-9]{10}$/.test(whatsappNumber)) {
      return "WhatsApp Number must be exactly 10 digits.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Please enter a valid email address.";
    }

    const duplicateShop = shops.some(
      (s) =>
        s.shopName.trim().toLowerCase() === shopName.toLowerCase() &&
        s.id !== editingShop?.id
    );
    if (duplicateShop) {
      return "Shop Name already exists.";
    }

    const duplicatePhone = shops.some(
      (s) => s.phoneNumber === phoneNumber && s.id !== editingShop?.id
    );
    if (duplicatePhone) {
      return "Phone Number already exists.";
    }

    return null;
  };

  const handleSaveShop = async (shop: Partial<Shop>): Promise<boolean> => {
    const validationError = validateShop(shop);
    if (validationError) {
      showNotification(validationError, "error");
      return false;
    }

    const payload = {
      shopName: shop.shopName!.trim(),
      ownerName: shop.ownerName!.trim(),
      phoneNumber: shop.phoneNumber!.trim(),
      whatsappNumber: shop.whatsappNumber?.trim() ?? "",
      email: shop.email!.trim(),
      village: shop.village!.trim(),
      address: shop.address?.trim() ?? "",
      status: shop.status ?? "Active",
      openingBalance: shop.openingBalance ?? 0,
    };

    try {
      if (editingShop) {
        await editShop(editingShop.id, { ...payload, shopNo: editingShop.shopNo });
        logAuditEvent("UPDATE_SHOP", "Shops", editingShop.id);
        showNotification("Shop updated successfully!", "success");
      } else {
        const list = await addShop(payload);
        const created = list.find(
          (s) =>
            s.shopName === payload.shopName &&
            s.phoneNumber === payload.phoneNumber
        );
        logAuditEvent("CREATE_SHOP", "Shops", created?.id);
        showNotification("Shop added successfully!", "success");
      }
      setEditingShop(null);
      setShowDialog(false);
      return true;
    } catch (err) {
      showNotification(handleApiError(err), "error");
      return false;
    }
  };

  const handleEditShop = (shop: Shop) => {
    setEditingShop(shop);
    setShowDialog(true);
  };

  const handleDeleteShop = async (id: number) => {
    setDeletingId(id);
    try {
      await removeShop(id);
      logAuditEvent("DELETE_SHOP", "Shops", id);
      showNotification("Shop deleted successfully!", "success");
    } catch (err) {
      showNotification(handleApiError(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const content = (
    <div className="w-full space-y-2 shop-page-container">
      <style>{`
        .shop-page-container button,
        [role="dialog"] button {
          transition: all 0.15s ease-in-out;
        }
        .shop-page-container button:hover,
        [role="dialog"] button:hover {
          transform: translateY(-1px);
        }
      `}</style>

      {/* Main Container */}
      <div className="w-full bg-white rounded-xl border border-slate-200/90 shadow-sm">
        {/* Toolbar - Search on LEFT, Buttons on RIGHT in same line */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/40 rounded-t-xl">
          <div className="flex items-center justify-between gap-4">
            {/* Search Bar - Left Side */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search Shop..."
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

              {/* 3. Add Shop Button (Solid Blue Fill) */}
              <button
                onClick={() => {
                  setEditingShop(null);
                  setShowDialog(true);
                }}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 z-10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Shop
              </button>
            </div>
          </div>
        </div>

        {/* Status Counter Bar */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 uppercase tracking-wider">
              Outlets Directory
            </span>
            <span className="px-2 py-0.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 rounded-full">
              {filteredShops.length} records
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
            Showing {paginatedShops.length} of {filteredShops.length} Shops (Page {currentPage} of {totalPages})
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
          {loading && shops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium">Loading shops...</p>
            </div>
          ) : !loading && shops.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <p className="text-sm font-medium text-slate-700">No shops found.</p>
              <p className="text-xs text-slate-500">Add a shop to get started.</p>
            </div>
          ) : (
            <ShopTable
              shops={paginatedShops}
              onEdit={handleEditShop}
              onDelete={handleDeleteShop}
            />
          )}
        </div>

        {shouldShowPagination(filteredShops.length) && (
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
      <ShopDialog
        open={showDialog}
        onClose={() => {
          setEditingShop(null);
          setShowDialog(false);
        }}
        onSave={handleSaveShop}
        shop={editingShop}
      />
      <BulkImportDialog
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        config={shopBulkImportConfig}
        existing={shops}
        onImported={(result) => {
          logAuditEvent("BULK_IMPORT", "Shops", undefined, {
            count: result.imported,
          });
          showNotification(
            `Imported ${result.imported} of ${result.total} shops.`,
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

export default React.memo(ShopsPage);