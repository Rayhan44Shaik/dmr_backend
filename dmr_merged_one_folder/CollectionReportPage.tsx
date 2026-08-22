// src/modules/collections/pages/CollectionReportPage.tsx

import { useState, useEffect, useMemo, useCallback } from "react";
import { collectionService } from "../services/collectionService";
import type { CollectionReportSummary } from "../types/collection";
import { useShops } from "../../../masters/shops/hooks/useShops";
import { useEmployees } from "../../../masters/employees/hooks/useEmployees";
import { useShopSearch } from "../../../../core/hooks/useShopSearch";
import {
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Wallet,
  Users,
  X,
  ChevronDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { DatePicker } from "../../../../components/common/DatePicker";
import {
  opsFilterCardClass,
  opsFilterLabelClass,
  opsInputClass,
  opsSecondaryButtonClass,
  opsPdfButtonClass,
  opsExcelButtonClass,
} from "../../../../shared/ui/operationsStyles";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

const getBarColor = (percentage: number) => {
  if (percentage >= 80) return "bg-green-500";
  if (percentage >= 50) return "bg-blue-500";
  if (percentage >= 30) return "bg-yellow-500";
  return "bg-red-500";
};

const KNOWN_MODES = ["Cash", "Union Bank", "HDFC Bank"];

type Props = {
  embedded?: boolean;
};

export default function CollectionReportPage({ embedded: _embedded = false }: Props) {
  const { showNotification } = useSafeNotification();

  const [loading, setLoading] = useState(true);
  const { shops } = useShops();
  const allShopNames = shops.map((s) => s.shopName).sort();

  const { employees } = useEmployees();
  const collectors = useMemo(
    () =>
      employees
        .filter((emp) => emp.department === "Collection")
        .map((emp) => emp.employeeName)
        .sort(),
    [employees]
  );

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [weekBounds, setWeekBounds] = useState({ from: "", to: "" });
  const [shopName, setShopName] = useState("");
  const [collector, setCollector] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  const shopSearch = useShopSearch(allShopNames, shopName, setShopName);

  // Backend-authoritative report: totals/percentages/breakdowns come from
  // GET /collection-entry/report. This page only formats and displays them —
  // it must never recompute totals from raw collection rows.
  const [report, setReport] = useState<CollectionReportSummary | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    void collectionService.fetchWeekBounds().then((bounds) => {
      setWeekBounds({ from: bounds.weekStart, to: bounds.weekEnd });
      setFromDate((prev) => prev || bounds.weekStart);
      setToDate((prev) => prev || bounds.weekEnd);
    }).catch(() => undefined);
  }, []);

  const loadReport = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setReportError(null);
    try {
      const shopId = shopName ? collectionService.getShopIdForName(shopName) ?? undefined : undefined;
      const data = await collectionService.fetchCollectionReport({
        fromDate,
        toDate,
        shopId,
        collector: collector || undefined,
        paymentMode: paymentMode || undefined,
      });
      setReport(data);
    } catch (error) {
      console.error("Failed to load collection report:", error);
      setReportError("Failed to load the report from the server.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, shopName, collector, paymentMode]);

  const totalCollections = report?.totalAmount ?? 0;
  const totalCollectorsCount = report?.totalCollectors ?? 0;

  // Presentation-only: bucket the backend's already-aggregated per-mode
  // distinct-collector counts into Known modes + "Others", in a fixed
  // display order. No amounts/sums are recomputed here.
  const collectorCountsByMode = useMemo(() => {
    const rows = report?.collectorsByPaymentMode ?? [];
    const knownSet = new Set(KNOWN_MODES);
    const result: { mode: string; count: number }[] = [];
    KNOWN_MODES.forEach((mode) => {
      const found = rows.find((r) => r.paymentMode === mode);
      result.push({ mode, count: found?.collectorCount ?? 0 });
    });
    const othersCount = rows
      .filter((r) => !knownSet.has(r.paymentMode))
      .reduce((sum, r) => sum + r.collectorCount, 0);
    if (othersCount > 0 || paymentMode === "Others") {
      result.push({ mode: "Others", count: othersCount });
    }
    return result;
  }, [report, paymentMode]);

  // Backend-authoritative payment-mode totals, with a display-only "Total" row appended.
  const paymentModeSummary = useMemo(() => {
    const rows = (report?.paymentModeSummary ?? []).map((r) => ({
      mode: r.paymentMode,
      count: r.count,
      amount: r.amount,
      percentage: r.percentage,
    }));
    rows.push({
      mode: "Total",
      count: report?.totalCount ?? 0,
      amount: report?.totalAmount ?? 0,
      percentage: 100,
    });
    return rows;
  }, [report]);

  // Backend-authoritative collector totals; only the "top 4 + Others (N)"
  // grouping for display is done here, summing already-authoritative
  // per-collector totals rather than raw transaction rows.
  const collectorSummary = useMemo(() => {
    const source = report?.collectorSummary ?? [];
    const paymentModes = Array.from(
      new Set(source.flatMap((r) => Object.keys(r.amounts)))
    ).sort();

    const sorted = [...source].sort((a, b) => b.total - a.total);
    const top4 = sorted.slice(0, 4);
    const rest = sorted.slice(4);

    const rows: any[] = top4.map((r) => {
      const row: any = { collector: r.collector, total: r.total };
      paymentModes.forEach((mode) => {
        row[mode] = r.amounts[mode] || 0;
      });
      return row;
    });

    if (rest.length > 0) {
      const othersRow: any = { collector: `Others (${rest.length})`, total: 0 };
      paymentModes.forEach((mode) => {
        othersRow[mode] = 0;
      });
      rest.forEach((r) => {
        paymentModes.forEach((mode) => {
          othersRow[mode] += r.amounts[mode] || 0;
        });
        othersRow.total += r.total;
      });
      rows.push(othersRow);
    }

    const totalRow: any = { collector: "Total", total: 0 };
    paymentModes.forEach((mode) => {
      totalRow[mode] = 0;
    });
    rows.forEach((row) => {
      paymentModes.forEach((mode) => {
        totalRow[mode] += row[mode] || 0;
      });
      totalRow.total += row.total;
    });
    rows.push(totalRow);

    return { rows, paymentModes };
  }, [report]);

  const getExportFileName = (ext: "xlsx" | "pdf") => {
    const dateStr = fromDate && toDate ? `${fromDate}_to_${toDate}` : "report";
    return `Collection_Report_${dateStr}.${ext}`;
  };

  const exportExcel = useCallback(() => {
    if (!report || report.totalCount === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    try {
      const wb = XLSX.utils.book_new();

      const pmData = paymentModeSummary.map((row) => ({
        "Payment Mode": row.mode,
        "No. of Collections": row.count,
        "Amount Received": row.amount,
        "Percentage (%)": row.percentage.toFixed(2),
      }));
      const ws1 = XLSX.utils.json_to_sheet(pmData);
      XLSX.utils.book_append_sheet(wb, ws1, "Payment Mode Summary");

      const collectorRows = collectorSummary.rows.map((row: any) => {
        const obj: any = { Collector: row.collector };
        collectorSummary.paymentModes.forEach((mode: string) => {
          obj[mode] = row[mode] || 0;
        });
        obj["Total"] = row.total;
        return obj;
      });
      const ws2 = XLSX.utils.json_to_sheet(collectorRows);
      XLSX.utils.book_append_sheet(wb, ws2, "Collector Summary");

      XLSX.writeFile(wb, getExportFileName("xlsx"));
      showNotification("Excel exported successfully!", "success");
    } catch (error) {
      showNotification("Failed to export Excel.", "error");
    }
  }, [report, paymentModeSummary, collectorSummary, showNotification, fromDate, toDate]);

  const exportPDF = useCallback(() => {
    if (!report || report.totalCount === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const margin = 14;
      let y = 20;

      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138);
      doc.text("Collection Report", margin, y);
      y += 10;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Period: ${fromDate || "N/A"} to ${toDate || "N/A"}`, margin, y);
      y += 10;

      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      doc.text("Collection Summary by Payment Mode", margin, y);
      y += 5;
      const pmData = paymentModeSummary.map((row) => [
        row.mode,
        row.count.toString(),
        row.amount.toFixed(2),
        row.percentage.toFixed(2) + "%",
      ]);
      autoTable(doc, {
        head: [["Payment Mode", "No. of Collections", "Amount Received", "Percentage (%)"]],
        body: pmData,
        startY: y,
        theme: "striped",
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      doc.text("Collection Summary by Collector", margin, y);
      y += 5;
      const header = ["Collector", ...collectorSummary.paymentModes, "Total"];
      const body = collectorSummary.rows.map((row: any) => {
        const rowData: any[] = [row.collector];
        collectorSummary.paymentModes.forEach((mode: string) => {
          rowData.push(row[mode] ? row[mode].toFixed(2) : "0.00");
        });
        rowData.push(row.total.toFixed(2));
        return rowData;
      });
      autoTable(doc, {
        head: [header],
        body: body,
        startY: y,
        theme: "striped",
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8 },
      });

      doc.save(getExportFileName("pdf"));
      showNotification("PDF exported successfully!", "success");
    } catch (error) {
      showNotification("Failed to export PDF.", "error");
    }
  }, [report, paymentModeSummary, collectorSummary, showNotification, fromDate, toDate]);

  const resetFilters = useCallback(() => {
    setFromDate(weekBounds.from);
    setToDate(weekBounds.to);
    setShopName("");
    setCollector("");
    setPaymentMode("");
    shopSearch.setQuery("");
    showNotification("Filters reset to default (current week).", "info");
  }, [weekBounds, shopSearch, showNotification]);

  if (loading && !report) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (reportError && !report) {
    return (
      <div className="p-8 text-center text-red-600">
        {reportError}{" "}
        <button onClick={() => void loadReport()} className="underline">
          Retry
        </button>
      </div>
    );
  }

  // Content matching the precise structural layout and spacing of RatesEntryPage
  const content = (
    <div className="w-full space-y-5">
      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button onClick={exportExcel} className={opsExcelButtonClass}>
          <FileSpreadsheet size={15} /> Excel
        </button>
        <button onClick={exportPDF} className={opsPdfButtonClass}>
          <FileText size={15} /> PDF
        </button>
        <button onClick={resetFilters} className={opsSecondaryButtonClass}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {/* Filter Bar Card */}
      <div className={opsFilterCardClass}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DatePicker
            value={fromDate}
            onChange={setFromDate}
            label="From Date *"
            className="w-full"
            placeholder="Select date"
            required
          />
          <DatePicker
            value={toDate}
            onChange={setToDate}
            label="To Date *"
            className="w-full"
            placeholder="Select date"
            required
          />
          <div>
            <label className={opsFilterLabelClass}>Shop Name</label>
            <div className="relative">
              <input
                type="text"
                value={shopSearch.query}
                onChange={(e) => shopSearch.handleInputChange(e.target.value)}
                onFocus={() => shopSearch.setIsOpen(true)}
                onBlur={() => setTimeout(() => shopSearch.setIsOpen(false), 200)}
                placeholder="All Shops"
                className={`${opsInputClass} pr-8`}
              />
              {shopSearch.query && (
                <button
                  type="button"
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  onClick={() => {
                    shopSearch.setQuery("");
                    setShopName("");
                    shopSearch.setIsOpen(false);
                  }}
                >
                  <X size={16} />
                </button>
              )}
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              {shopSearch.isOpen && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <li
                    className="cursor-pointer px-3 py-2 hover:bg-slate-50 text-emerald-600 font-medium"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      shopSearch.setQuery("");
                      setShopName("");
                      shopSearch.setIsOpen(false);
                    }}
                  >
                    All Shops
                  </li>
                  {shopSearch.filteredShops.length > 0 ? (
                    shopSearch.filteredShops.slice(0, 5).map((shop) => (
                      <li
                        key={shop}
                        className="cursor-pointer px-3 py-2 hover:bg-slate-50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          shopSearch.handleSelect(shop);
                        }}
                      >
                        {shop}
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-slate-500">No shops found</li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <div>
            <label className={opsFilterLabelClass}>Collector</label>
            <select
              value={collector}
              onChange={(e) => setCollector(e.target.value)}
              className={opsInputClass}
            >
              <option value="">All Collectors</option>
              {collectors.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={opsFilterLabelClass}>Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className={opsInputClass}
            >
              <option value="">All Modes</option>
              <option value="Cash">Cash</option>
              <option value="Union Bank">Union Bank</option>
              <option value="HDFC Bank">HDFC Bank</option>
              <option value="Others">Others</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-6 flex items-center gap-4">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
            <Wallet size={24} />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-500">Total Collections</div>
            <div className="text-2xl font-bold text-slate-800">{formatCurrency(totalCollections)}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-6">
          <div className="flex items-center gap-4 mb-3">
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
              <Users size={24} />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Total Collectors</div>
              <div className="text-2xl font-bold text-slate-800">{totalCollectorsCount}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t border-slate-100">
            {collectorCountsByMode.map(({ mode, count }) => (
              <div key={mode} className="flex justify-between py-1">
                <span className="text-slate-600">{mode}</span>
                <span className="font-medium text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tables Grid Card Containers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-800">Payment Mode Summary</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Payment Mode</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">No.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paymentModeSummary.map((row) => (
                  <tr
                    key={row.mode}
                    className={row.mode === "Total" ? "bg-amber-50/60 font-semibold" : "hover:bg-slate-50/50"}
                  >
                    <td className="px-4 py-3 text-xs text-slate-800">{row.mode}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{row.count}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{formatCurrency(row.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs font-medium text-slate-700 w-10 text-right">
                          {row.percentage.toFixed(1)}%
                        </span>
                        <div className="w-12 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${getBarColor(row.percentage)} transition-all duration-500`}
                            style={{ width: `${row.percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-800">Collector Summary</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Collector</th>
                  {collectorSummary.paymentModes.map((mode: string) => (
                    <th key={mode} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {mode}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {collectorSummary.rows.map((row: any, idx: number) => {
                  const isTotal = row.collector === "Total";
                  return (
                    <tr
                      key={idx}
                      className={isTotal ? "bg-amber-50/60 font-semibold" : "hover:bg-slate-50/50"}
                    >
                      <td className="px-4 py-3 text-xs text-slate-800">{row.collector}</td>
                      {collectorSummary.paymentModes.map((mode: string) => (
                        <td key={mode} className="px-4 py-3 text-right text-xs text-slate-600">
                          {formatCurrency(row[mode] || 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-800">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  return content;
}