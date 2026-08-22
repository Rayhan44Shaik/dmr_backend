import React, {
  useMemo,
  useState,
} from "react";

import DashboardLayout from "../../../../layouts/DashboardLayout/DashboardLayout";
import PageLayout from "../../../../components/common/PageLayout";
import BankTable from "../components/BankTable";
import BankDialog from "../dialogs/BankDialog";
import { useBanks } from "../hooks/useBanks";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { exportToExcel } from "../../../../utils/exportUtils";

// BanksPage.tsx is inside banks/pages, while exportBankPdf is inside banks/utils.
import { exportBanksToPDF } from "../utils/exportBankPdf";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import { logAuditEvent } from "../../../../utils/securityUtils";
import { handleApiError } from "../services/bankService";
import type { Bank } from "../types/bank";

type BanksPageProps = {
  embedded?: boolean;
};

const ITEMS_PER_PAGE = 10;

function BanksPage({
  embedded = false,
}: BanksPageProps) {
  const [showDialog, setShowDialog] =
    useState(false);

  const [editingBank, setEditingBank] =
    useState<Bank | null>(null);

  const [search, setSearch] =
    useState("");

  const [currentPage, setCurrentPage] =
    useState(1);

  const [deletingId, setDeletingId] =
    useState<number | null>(null);

  const { showNotification } =
    useSafeNotification();

  // This matches the API returned by your current useBanks hook.
  const {
    banks,
    loading,
    saving,
    error,
    reload,
    addBank,
    editBank,
    removeBank,
  } = useBanks();

  const handleSearchChange = (
    value: string,
  ) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const filteredBanks = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    if (!keyword) {
      return banks;
    }

    return banks.filter((bank) => {
      return (
        bank.bankName
          .toLowerCase()
          .includes(keyword) ||
        bank.branch
          .toLowerCase()
          .includes(keyword) ||
        bank.accountNumber
          .toLowerCase()
          .includes(keyword) ||
        bank.ifscCode
          .toLowerCase()
          .includes(keyword) ||
        (bank.upiId ?? "")
          .toLowerCase()
          .includes(keyword) ||
        bank.status
          .toLowerCase()
          .includes(keyword) ||
        String(bank.bankNo).includes(keyword)
      );
    });
  }, [banks, search]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredBanks.length /
          ITEMS_PER_PAGE,
      ),
    );

  const paginatedBanks = useMemo(() => {
    const safePage = Math.min(
      currentPage,
      totalPages,
    );

    const startIndex =
      (safePage - 1) *
      ITEMS_PER_PAGE;

    return filteredBanks.slice(
      startIndex,
      startIndex +
        ITEMS_PER_PAGE,
    );
  }, [
    filteredBanks,
    currentPage,
    totalPages,
  ]);

  const handleExportPDF = () => {
    if (filteredBanks.length === 0) {
      showNotification(
        "No data to export.",
        "error",
      );

      return;
    }

    const date =
      new Date()
        .toISOString()
        .split("T")[0];

    const filename = `Banks_${date}`;

    try {
      exportBanksToPDF(
        filteredBanks,
        filename,
      );

      logAuditEvent(
        "EXPORT_PDF",
        "Banks",
        undefined,
        {
          count:
            filteredBanks.length,
        },
      );

      showNotification(
        "PDF exported successfully!",
        "success",
      );
    } catch (exportError) {
      console.error(
        "Unable to export Bank PDF:",
        exportError,
      );

      showNotification(
        "Unable to export PDF. Please try again.",
        "error",
      );
    }
  };

  const handleExportExcel = () => {
    if (filteredBanks.length === 0) {
      showNotification(
        "No data to export.",
        "error",
      );

      return;
    }

    const headers = [
      "Bank No",
      "Bank Name",
      "Branch",
      "Account Number",
      "IFSC Code",
      "UPI ID",
      "Status",
    ];

    const rows =
      filteredBanks.map(
        (bank) => [
          String(bank.bankNo),
          bank.bankName,
          bank.branch,
          bank.accountNumber,
          bank.ifscCode,
          bank.upiId?.trim() ||
            "-",
          bank.status,
        ],
      );

    const date =
      new Date()
        .toISOString()
        .split("T")[0];

    const filename = `Banks_${date}`;

    try {
      exportToExcel(
        "Banks - Master List",
        headers,
        rows,
        filename,
      );

      logAuditEvent(
        "EXPORT_EXCEL",
        "Banks",
        undefined,
        {
          count:
            filteredBanks.length,
        },
      );

      showNotification(
        "Excel exported successfully!",
        "success",
      );
    } catch (exportError) {
      console.error(
        "Unable to export Bank Excel:",
        exportError,
      );

      showNotification(
        "Unable to export Excel. Please try again.",
        "error",
      );
    }
  };

  const validateBank = (
    bank: Partial<Bank>,
  ): string | null => {
    const bankName =
      bank.bankName?.trim() ?? "";

    const branch =
      bank.branch?.trim() ?? "";

    const accountNumber =
      bank.accountNumber?.trim() ??
      "";

    const ifscCode =
      bank.ifscCode
        ?.trim()
        .toUpperCase() ?? "";

    const upiId =
      bank.upiId?.trim() ?? "";

    if (
      !bankName ||
      !branch ||
      !accountNumber ||
      !ifscCode
    ) {
      return "Please fill all required fields.";
    }

    if (
      !/^[A-Za-z0-9]{6,20}$/.test(
        accountNumber,
      )
    ) {
      return "Account Number must be 6-20 alphanumeric characters.";
    }

    if (
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
        ifscCode,
      )
    ) {
      return "IFSC must be 11 characters (e.g., SBIN0012345).";
    }

    if (
      upiId &&
      !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(
        upiId,
      )
    ) {
      return "UPI ID must be in format username@bank (e.g., user@hdfc).";
    }

    const duplicateName =
      banks.some(
        (existingBank) =>
          existingBank.bankName
            .trim()
            .toLowerCase() ===
            bankName.toLowerCase() &&
          existingBank.id !==
            editingBank?.id,
      );

    if (duplicateName) {
      return "Bank Name already exists.";
    }

    const duplicateAccount =
      banks.some(
        (existingBank) =>
          existingBank.accountNumber
            .trim()
            .toLowerCase() ===
            accountNumber.toLowerCase() &&
          existingBank.id !==
            editingBank?.id,
      );

    if (duplicateAccount) {
      return "Account Number already exists.";
    }

    return null;
  };

  const handleSaveBank = async (
    bank: Partial<Bank>,
  ): Promise<boolean> => {
    const validationError =
      validateBank(bank);

    if (validationError) {
      showNotification(
        validationError,
        "error",
      );

      return false;
    }

    const payload = {
      bankName:
        bank.bankName!.trim(),

      branch:
        bank.branch!.trim(),

      accountNumber:
        bank.accountNumber!.trim(),

      ifscCode:
        bank.ifscCode!
          .trim()
          .toUpperCase(),

      upiId:
        bank.upiId?.trim() ?? "",

      status:
        bank.status ?? "Active",
    };

    try {
      if (editingBank) {
        await editBank(
          editingBank.id,
          {
            ...payload,
            bankNo:
              editingBank.bankNo,
          },
        );

        logAuditEvent(
          "UPDATE_BANK",
          "Banks",
          editingBank.id,
        );

        showNotification(
          "Bank updated successfully!",
          "success",
        );
      } else {
        const updatedBanks =
          await addBank(payload);

        const createdBank =
          updatedBanks.find(
            (created) =>
              created.bankName ===
                payload.bankName &&
              created.accountNumber ===
                payload.accountNumber,
          );

        logAuditEvent(
          "CREATE_BANK",
          "Banks",
          createdBank?.id,
        );

        showNotification(
          "Bank added successfully!",
          "success",
        );
      }

      setEditingBank(null);
      setShowDialog(false);

      return true;
    } catch (saveError) {
      showNotification(
        handleApiError(saveError),
        "error",
      );

      return false;
    }
  };

  const handleEditBank = (
    bank: Bank,
  ) => {
    setEditingBank(bank);
    setShowDialog(true);
  };

  const handleDeleteBank = async (
    id: number,
  ) => {
    const bankToDelete =
      banks.find(
        (bank) => bank.id === id,
      );

    if (!bankToDelete) {
      showNotification(
        "Bank record was not found.",
        "error",
      );

      return;
    }

    setDeletingId(id);

    try {
      await removeBank(id);

      logAuditEvent(
        "DELETE_BANK",
        "Banks",
        id,
      );

      showNotification(
        "Bank deleted successfully!",
        "success",
      );
    } catch (deleteError) {
      showNotification(
        handleApiError(deleteError),
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenAddDialog = () => {
    setEditingBank(null);
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setEditingBank(null);
    setShowDialog(false);
  };

  const content = (
    <div className="w-full space-y-2 bank-page-container">
      <style>{`
        .bank-page-container button,
        [role="dialog"] button {
          transition: all 0.15s ease-in-out;
        }

        .bank-page-container button:hover,
        [role="dialog"] button:hover {
          transform: translateY(-1px);
        }
      `}</style>

      <div className="w-full rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <div className="rounded-t-xl border-b border-slate-100 bg-slate-50/40 px-4 py-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="max-w-md flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search Bank..."
                  value={search}
                  onChange={(event) =>
                    handleSearchChange(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  disabled={loading}
                />

                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
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

            <div className="flex flex-shrink-0 items-center gap-3">
              <div className="group relative z-50">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-100"
                >
                  Export
                </button>

                <div className="invisible absolute right-0 mt-2 w-32 translate-y-2 overflow-hidden rounded-lg border border-slate-200 bg-white opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={
                      handleExportPDF
                    }
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    PDF
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleExportExcel
                    }
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50"
                  >
                    Excel
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={
                  handleOpenAddDialog
                }
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-transparent bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                Add Bank
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-slate-600">
              Banks Directory
            </span>

            <span className="rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
              {filteredBanks.length} records
            </span>

            {(loading ||
              saving ||
              deletingId !== null) && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {loading
                  ? "Loading..."
                  : saving
                    ? "Saving..."
                    : "Deleting..."}
              </span>
            )}
          </div>

          <p className="font-medium text-slate-500">
            Showing{" "}
            {paginatedBanks.length} of{" "}
            {filteredBanks.length} Banks
            (Page {currentPage} of{" "}
            {totalPages})
          </p>
        </div>

        {error && !loading && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => {
                void reload().catch(
                  () => undefined,
                );
              }}
              className="shrink-0 text-xs font-semibold text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="relative min-h-[120px] p-0">
          {loading &&
          banks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
              <p className="text-sm font-medium">
                Loading banks...
              </p>
            </div>
          ) : !loading &&
            banks.length === 0 &&
            !error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
              <p className="text-sm font-medium text-slate-700">
                No banks found.
              </p>

              <p className="text-xs">
                Add a bank to get
                started.
              </p>
            </div>
          ) : (
            <BankTable
              banks={paginatedBanks}
              onEdit={
                handleEditBank
              }
              onDelete={handleDeleteBank}
            />
          )}
        </div>

        {shouldShowPagination(filteredBanks.length) && (
        <div className={paginationBarClass}>
          <button
            type="button"
            onClick={() =>
              setCurrentPage(
                (previous) =>
                  Math.max(
                    previous - 1,
                    1,
                  ),
              )
            }
            disabled={
              currentPage === 1 ||
              loading
            }
            className={paginationNavBtnClass}
          >
            Previous
          </button>

          {Array.from(
            { length: totalPages },
            (_, index) => index + 1,
          ).map((pageNumber) => (
            <button
              type="button"
              key={pageNumber}
              onClick={() =>
                setCurrentPage(
                  pageNumber,
                )
              }
              disabled={loading}
              className={paginationPageBtnClass(
                currentPage === pageNumber,
              )}
            >
              {pageNumber}
            </button>
          ))}

          <button
            type="button"
            onClick={() =>
              setCurrentPage(
                (previous) =>
                  Math.min(
                    previous + 1,
                    totalPages,
                  ),
              )
            }
            disabled={
              currentPage ===
                totalPages ||
              loading
            }
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
        )}
      </div>

      <BankDialog
        open={showDialog}
        onClose={handleCloseDialog}
        onSave={handleSaveBank}
        bank={editingBank}
      />
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <DashboardLayout>
      <PageLayout className="mx-auto max-w-6xl px-8 !py-2 sm:px-12 lg:px-16">
        {content}
      </PageLayout>
    </DashboardLayout>
  );
}

export default React.memo(BanksPage);