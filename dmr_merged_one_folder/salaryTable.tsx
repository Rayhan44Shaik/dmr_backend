// src/modules/staff/components/salary/salaryTable.tsx

import { useMemo } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import type { SalaryRecord } from "../../types/staffDashboard";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";

type SalaryTableProps = {
  records: SalaryRecord[];
  currentPage: number;
  setCurrentPage?: (page: number) => void;
  itemsPerPage: number;
  formatCurrency?: (amount: number) => string;
  saving?: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (record: SalaryRecord) => void;
};

function StatusBadge({ record }: { record: SalaryRecord }) {
  const windowOpen =
    record.status === "Paid" &&
    record.correctionWindowDaysRemaining != null &&
    record.correctionWindowDaysRemaining > 0;

  if (record.status === "Pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        Pending
      </span>
    );
  }
  if (record.status === "Submitted") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <Lock size={11} /> Submitted
      </span>
    );
  }
  // Paid
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
        record.monthClosed || !windowOpen
          ? "bg-slate-100 text-slate-600 border-slate-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
    >
      <CheckCircle2 size={11} />
      Paid
      {(record.monthClosed || !windowOpen) && <Lock size={10} />}
    </span>
  );
}

export function SalaryTable({
  records,
  currentPage,
  setCurrentPage = () => {},
  itemsPerPage,
  formatCurrency,
  saving = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
}: SalaryTableProps) {
  const formatVal = formatCurrency || ((amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amount || 0));

  const sortedRecords = useMemo(
    () =>
      [...records].sort((a, b) =>
        (a.employeeName || "").localeCompare(b.employeeName || "")
      ),
    [records]
  );

  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentRecords = sortedRecords.slice(startIndex, startIndex + itemsPerPage);

  const pageIds = currentRecords.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
        No salary records for the selected month.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all visible salaries"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected && !allPageSelected;
                  }}
                  disabled={saving}
                  onChange={() => onToggleSelectAll(pageIds)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Department</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Working</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Present</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Leave</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Basic</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Gross</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Deductions</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Net</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Payment Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {currentRecords.map((record) => {
              const windowOpen =
                record.status === "Paid" &&
                record.correctionWindowDaysRemaining != null &&
                record.correctionWindowDaysRemaining > 0;

              return (
                <tr
                  key={record.id}
                  onClick={() => onView(record)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${record.employeeName}`}
                      checked={selectedIds.has(record.id)}
                      disabled={saving}
                      onChange={() => onToggleSelect(record.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap">{record.employeeName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{record.department}</td>
                  <td className="px-3 py-3 text-center text-sm text-slate-700">{record.workingDays ?? "—"}</td>
                  <td className="px-3 py-3 text-center text-sm text-slate-700">{record.presentDays ?? "—"}</td>
                  <td className="px-3 py-3 text-center text-sm text-slate-700">{record.leaveDays ?? "—"}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{formatVal(record.basicSalary)}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{formatVal(record.totalGross)}</td>
                  <td className="px-3 py-3 text-right text-sm text-rose-600">{formatVal(record.totalDeductions)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-slate-800">{formatVal(record.netSalary)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge record={record} />
                    {record.status === "Paid" && windowOpen && (
                      <span className="block text-[10px] text-amber-600 mt-0.5">
                        window {record.correctionWindowDaysRemaining}d
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-600">{record.paymentDate ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shouldShowPagination(sortedRecords.length) && (
        <div className={paginationBarClass}>
          <button
            type="button"
            onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className={paginationNavBtnClass}
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={paginationPageBtnClass(currentPage === page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}