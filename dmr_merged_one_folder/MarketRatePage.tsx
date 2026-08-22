// src/modules/accounts/pages/MarketRatePage.tsx

import React, { useState, useEffect, useCallback } from "react";
import { Save, Search, Tag, ChevronLeft, ChevronRight, CheckCircle2, X, RefreshCw, AlertCircle } from "lucide-react";
import { DatePicker } from "../../../components/common/DatePicker";
import { useSafeNotification } from "../../../hooks/useSafeNotification";
import { handleApiError } from "../../../api";
import {
  listMarketRates,
  saveMarketRates,
  marketRateNum,
  type MarketRateInput,
} from "../services/marketRateService";

interface MarketRatePageProps {
  embedded?: boolean;
}

/** Local-timezone date formatter (business dates must never use toISOString,
 * which shifts dates by a day for non-UTC timezones). */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD business date as LOCAL midnight (never UTC). */
function parseLocalDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) return new Date(dateStr);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// Numeric field keys per backend column, grouped by the UI table.
const SUMMARY_FIELDS = ["vij", "gun", "rp"] as const;
const TABLE_ONE_FIELDS = ["sneha", "vencobRate", "vencobVii", "vencobGun", "associationVii"] as const;
const TABLE_TWO_FIELDS = ["c17", "c15", "c13", "c12", "c10"] as const;
const ALL_FIELDS = [...SUMMARY_FIELDS, ...TABLE_ONE_FIELDS, ...TABLE_TWO_FIELDS] as const;

export const MarketRatePage: React.FC<MarketRatePageProps> = ({ embedded = false }) => {
  const { showNotification } = useSafeNotification();

  // Filter tab state ("This Week" selected by default)
  const [activeTab, setActiveTab] = useState<'This Week' | 'Month' | 'Quarter' | 'Custom Range'>('This Week');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'Saved' | 'Saving...' | 'Error'>('Saved');
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to get current Monday to Sunday dates (local, date-safe)
  const getCurrentWeekRange = (dateObj: Date = new Date()) => {
    const curr = new Date(dateObj);
    const day = curr.getDay();
    const diffToMonday = curr.getDate() - day + (day === 0 ? -6 : 1);

    const monday = new Date(curr.setDate(diffToMonday));
    const sunday = new Date(curr.setDate(monday.getDate() + 6));

    return { from: formatLocalDate(monday), to: formatLocalDate(sunday) };
  };

  const weekRange = getCurrentWeekRange();
  const [fromDate, setFromDate] = useState(weekRange.from);
  const [toDate, setToDate] = useState(weekRange.to);

  // Function to navigate weeks or months back or forward using the table headers
  const handleShiftTime = (direction: 'prev' | 'next') => {
    if (activeTab === 'Month') {
      const currentFrom = parseLocalDate(fromDate);
      currentFrom.setMonth(currentFrom.getMonth() + (direction === 'next' ? 1 : -1));
      const firstDay = formatLocalDate(new Date(currentFrom.getFullYear(), currentFrom.getMonth(), 1));
      const lastDay = formatLocalDate(new Date(currentFrom.getFullYear(), currentFrom.getMonth() + 1, 0));
      setFromDate(firstDay);
      setToDate(lastDay);
    } else {
      const currentMonday = parseLocalDate(fromDate);
      currentMonday.setDate(currentMonday.getDate() + (direction === 'next' ? 7 : -7));
      const newRange = getCurrentWeekRange(currentMonday);
      setFromDate(newRange.from);
      setToDate(newRange.to);
    }
  };

  // Generate date labels dynamically based on date range (Week or Month)
  const [matrixDays, setMatrixDays] = useState<Array<{ label: string; dateStr: string }>>([]);

  useEffect(() => {
    if (!fromDate || !toDate) {
      setMatrixDays([]);
      return;
    }
    const days = [];
    let currentDate = parseLocalDate(fromDate);
    const endDate = parseLocalDate(toDate);

    while (currentDate <= endDate) {
      const dayNum = currentDate.getDate().toString();
      const dateStr = formatLocalDate(currentDate);
      days.push({ label: dayNum, dateStr });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    setMatrixDays(days);
  }, [fromDate, toDate]);

  // Persistent storage structure for yearly data date-wise (typed records)
  const [tableOneData, setTableOneData] = useState<Record<string, Record<string, string>>>({});
  const [tableTwoData, setTableTwoData] = useState<Record<string, Record<string, string>>>({});
  const [summaryData, setSummaryData] = useState<Record<string, Record<string, string>>>({});

  // Load Market Rates from the PostgreSQL backend whenever the range changes.
  useEffect(() => {
    let cancelled = false;
    if (!fromDate || !toDate) {
      setTableOneData({});
      setTableTwoData({});
      setSummaryData({});
      return;
    }
    setAutoSaveStatus("Saving...");
    void listMarketRates(fromDate, toDate)
      .then((rows) => {
        if (cancelled) return;
        const summary: Record<string, Record<string, string>> = {};
        const tableOne: Record<string, Record<string, string>> = {};
        const tableTwo: Record<string, Record<string, string>> = {};
        for (const row of rows) {
          const date = row.businessDate;
          summary[date] = {};
          for (const key of SUMMARY_FIELDS) summary[date][key] = String(row[key] ?? "");
          tableOne[date] = {};
          for (const key of TABLE_ONE_FIELDS) tableOne[date][key] = String(row[key] ?? "");
          tableTwo[date] = {};
          for (const key of TABLE_TWO_FIELDS) tableTwo[date][key] = String(row[key] ?? "");
        }
        setSummaryData(summary);
        setTableOneData(tableOne);
        setTableTwoData(tableTwo);
        setAutoSaveStatus("Saved");
      })
      .catch((err) => {
        if (cancelled) return;
        setAutoSaveStatus("Error");
        showNotification(
          `Unable to load market rates: ${handleApiError(err)}`,
          "error"
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  // Handlers for updating specific date values dynamically
  const handleTableOneChange = (dateStr: string, field: string, value: string) => {
    setTableOneData(prev => ({
      ...prev,
      [dateStr]: { ...(prev[dateStr] || {}), [field]: value }
    }));
  };

  const handleTableTwoChange = (dateStr: string, field: string, value: string) => {
    setTableTwoData(prev => ({
      ...prev,
      [dateStr]: { ...(prev[dateStr] || {}), [field]: value }
    }));
  };

  const handleSummaryChange = (dateStr: string, field: string, value: string) => {
    setSummaryData(prev => ({
      ...prev,
      [dateStr]: { ...(prev[dateStr] || {}), [field]: value }
    }));
  };

  // Manual explicit save — upserts every non-empty date row into the backend
  const handleManualSave = useCallback(async () => {
    const rows: MarketRateInput[] = [];
    for (const dayObj of matrixDays) {
      const date = dayObj.dateStr;
      const merged = {
        ...(summaryData[date] || {}),
        ...(tableOneData[date] || {}),
        ...(tableTwoData[date] || {}),
      };
      const hasAny = ALL_FIELDS.some((field) => String(merged[field] ?? "").trim() !== "");
      if (!hasAny) continue;
      
      const payload: MarketRateInput = { businessDate: date };
      for (const field of ALL_FIELDS) {
        const raw = merged[field];
        if (String(raw ?? "").trim() !== "") {
          payload[field] = marketRateNum(raw);
        }
      }
      rows.push(payload);
    }
    
    if (rows.length === 0) {
      showNotification("Nothing to save. Enter at least one rate first.", "info");
      return;
    }

    setAutoSaveStatus("Saving...");
    try {
      const saved = await saveMarketRates(rows);
      const summary: Record<string, Record<string, string>> = {};
      const tableOne: Record<string, Record<string, string>> = {};
      const tableTwo: Record<string, Record<string, string>> = {};
      for (const row of saved) {
        const date = row.businessDate;
        summary[date] = {};
        for (const key of SUMMARY_FIELDS) summary[date][key] = String(row[key] ?? "");
        tableOne[date] = {};
        for (const key of TABLE_ONE_FIELDS) tableOne[date][key] = String(row[key] ?? "");
        tableTwo[date] = {};
        for (const key of TABLE_TWO_FIELDS) tableTwo[date][key] = String(row[key] ?? "");
      }
      setSummaryData(summary);
      setTableOneData(tableOne);
      setTableTwoData(tableTwo);
      setAutoSaveStatus("Saved");
      showNotification("Market rates saved successfully.", "success");
    } catch (err) {
      setAutoSaveStatus("Error");
      showNotification(`Unable to save market rates: ${handleApiError(err)}`, "error");
    }
  }, [matrixDays, summaryData, tableOneData, tableTwoData, showNotification]);

  // Handle Tab Switching behavior
  const handleTabClick = (tab: 'This Week' | 'Month' | 'Quarter' | 'Custom Range') => {
    setActiveTab(tab);
    if (tab === 'This Week') {
      const range = getCurrentWeekRange();
      setFromDate(range.from);
      setToDate(range.to);
    } else if (tab === 'Month') {
      const date = new Date();
      const firstDay = formatLocalDate(new Date(date.getFullYear(), date.getMonth(), 1));
      const lastDay = formatLocalDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
      setFromDate(firstDay);
      setToDate(lastDay);
    }
  };

  const handleClearCustomRange = () => {
    setFromDate('');
    setToDate('');
  };

  // Reusable compact navigation header component for tables
  const renderTableTimeHeader = () => (
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 shadow-2xs">
      <button
        onClick={() => handleShiftTime('prev')}
        className="flex items-center gap-0.5 px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900 rounded font-medium text-xs transition-all border-r border-slate-200"
        title={activeTab === 'Month' ? 'Previous Month' : 'Previous Week'}
      >
        <ChevronLeft size={13} />
        <span>{activeTab === 'Month' ? 'Prev Month' : 'Prev'}</span>
      </button>
      <button
        onClick={() => handleShiftTime('next')}
        className="flex items-center gap-0.5 px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900 rounded font-medium text-xs transition-all"
        title={activeTab === 'Month' ? 'Next Month' : 'Next Week'}
      >
        <span>{activeTab === 'Month' ? 'Next Month' : 'Next'}</span>
        <ChevronRight size={13} />
      </button>
    </div>
  );

  return (
    <div className={`w-full space-y-6 animate-in fade-in duration-500 ${embedded ? '' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'}`}>
      
      {/* Top Toolbar: title, refresh, add, search, filters, date range, tabs */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 shadow-sm rounded-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 w-full max-w-[1480px] mx-auto">
          <div className="flex flex-col sm:items-start gap-2">
            <h1 className="font-semibold text-slate-800 text-lg sm:text-xl">Market Rate</h1>
            <div className="flex items-center gap-2">
              <p className="text-slate-500 text-sm sm:text-base">Manage and monitor current market rates</p>
              {autoSaveStatus === 'Saved' && <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={12}/> Saved</span>}
              {autoSaveStatus === 'Saving...' && <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><RefreshCw size={12} className="animate-spin"/> Saving</span>}
              {autoSaveStatus === 'Error' && <span className="flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full"><AlertCircle size={12}/> Error</span>}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-2">
            {/* Refresh button */}
            <button
              onClick={() => {
                if (fromDate && toDate) {
                  void listMarketRates(fromDate, toDate).then(() => {
                    setAutoSaveStatus("Saved");
                    showNotification("Market rates refreshed.", "success");
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <RefreshCw size={14} className="hidden sm:inline" />
              <span className="hidden sm:text-sm">Refresh</span>
            </button>

            {/* Save Market Rate button */}
            <button
              onClick={handleManualSave}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Save size={14} />
              <span>Save Rates</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-2">
            {/* Search input */}
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search market rate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 py-1.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            {/* Date range selector */}
            {activeTab !== 'Custom Range' ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700">
                <span>{fromDate}</span>
                <span className="text-slate-400">to</span>
                <span>{toDate}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <DatePicker value={fromDate} onChange={(d) => setFromDate(d)} placeholder="From date" className="min-w-[140px]" />
                <DatePicker value={toDate} onChange={(d) => setToDate(d)} placeholder="To date" className="min-w-[140px]" />
                {(fromDate || toDate) && (
                  <button
                    onClick={handleClearCustomRange}
                    className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium px-2.5 py-2 rounded-lg text-xs transition-colors"
                    title="Clear Range"
                  >
                    <X size={14} /> Clear
                  </button>
                )}
              </div>
            )}

            {/* Tab navigator */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto scrollbar-none">
              {(['This Week', 'Month', 'Quarter', 'Custom Range'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabClick(tab)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeTab === tab
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state when no date range is selected */}
      {(!fromDate || !toDate || matrixDays.length === 0) && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-8 text-center animate-fade-in">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Tag size={24} className="text-slate-500" />
          </div>
          <h3 className="font-semibold text-slate-800 text-base mb-2">No market rates found</h3>
          <p className="text-slate-500 text-sm mb-6">Set a date range to view and manage market rates.</p>
          <button
            onClick={() => {
              setFromDate(weekRange.from);
              setToDate(weekRange.to);
            }}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Save size={14} />
            <span>Select This Week</span>
          </button>
        </div>
      )}

      {/* Tables rendering only when we have dates */}
      {matrixDays.length > 0 && (
        <>
          {/* 1. Summary Metrics Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col mb-6">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Additional Metrics Entry (Vij, Gun, R.P)</h3>
              </div>
              {renderTableTimeHeader()}
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-center border-collapse sm:text-sm">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 border-r border-slate-200 text-left font-medium text-slate-700">Date</th>
                    <th className="px-4 py-3 border-r border-slate-200 text-right font-medium text-slate-700">Vij</th>
                    <th className="px-4 py-3 border-r border-slate-200 text-right font-medium text-slate-700">Gun</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-700">R.P</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrixDays.map((dayObj) => {
                    const rowData = summaryData[dayObj.dateStr] || {};
                    return (
                      <tr key={dayObj.dateStr} className="border-b border-slate-100/65">
                        <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-900 bg-slate-50/50 text-left">
                          {dayObj.dateStr}
                        </td>
                        <td className="px-4 py-3 border-r border-slate-100 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={rowData['vij'] || ''}
                            onChange={(e) => handleSummaryChange(dayObj.dateStr, 'vij', e.target.value)}
                            className="w-28 text-right px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 text-xs"
                          />
                        </td>
                        <td className="px-4 py-3 border-r border-slate-100 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={rowData['gun'] || ''}
                            onChange={(e) => handleSummaryChange(dayObj.dateStr, 'gun', e.target.value)}
                            className="w-28 text-right px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 text-xs"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={rowData['rp'] || ''}
                            onChange={(e) => handleSummaryChange(dayObj.dateStr, 'rp', e.target.value)}
                            className="w-28 text-right px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 text-xs font-medium text-emerald-600"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grid Container for Company Rates & Category Breakdown Matrices */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* 2. Company Rates Matrix Entry */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Tag size={16} className="text-slate-500" />
                  Company Rates Matrix Entry
                </h3>
                {renderTableTimeHeader()}
              </div>
              <div className="overflow-x-auto max-h-[500px] flex-1">
                <table className="w-full text-center border-collapse sm:text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-3 border-r border-slate-200 text-left font-medium text-slate-700">Date</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">Sneha</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">VenCob Rate</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">VenCob Vii</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">VenCob Gun</th>
                      <th className="px-1 py-3 text-right font-medium text-slate-700">Assoc. Vii</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matrixDays.map((dayObj) => {
                      const rowData = tableOneData[dayObj.dateStr] || {};
                      return (
                        <tr key={dayObj.dateStr} className="border-b border-slate-100/65 transition-colors">
                          <td className="px-3 py-3 border-r border-slate-100 font-medium text-slate-900 bg-slate-50/50 text-left">
                            {dayObj.dateStr}
                          </td>
                          {(['sneha', 'vencobRate', 'vencobVii', 'vencobGun', 'associationVii']).map((colKey) => (
                            <td key={colKey} className="px-1 py-3 border-r border-slate-100 text-right">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={rowData[colKey] || ''}
                                onChange={(e) => handleTableOneChange(dayObj.dateStr, colKey, e.target.value)}
                                className="w-16 text-right px-1 py-1 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 text-xs"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Size & Category Breakdown Entry */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Tag size={16} className="text-slate-500" />
                  Size & Category Breakdown Entry
                </h3>
                {renderTableTimeHeader()}
              </div>
              <div className="overflow-x-auto max-h-[500px] flex-1">
                <table className="w-full text-center border-collapse sm:text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-3 border-r border-slate-200 text-left font-medium text-slate-700">Date</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">17</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">15</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">13</th>
                      <th className="px-1 py-3 border-r border-slate-200 text-right font-medium text-slate-700">12</th>
                      <th className="px-1 py-3 text-right font-medium text-slate-700">10</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matrixDays.map((dayObj) => {
                      const rowData = tableTwoData[dayObj.dateStr] || {};
                      return (
                        <tr key={dayObj.dateStr} className="border-b border-slate-100/65 transition-colors">
                          <td className="px-3 py-3 border-r border-slate-100 font-medium text-slate-900 bg-slate-50/50 text-left">
                            {dayObj.dateStr}
                          </td>
                          {(['c17', 'c15', 'c13', 'c12', 'c10']).map((colKey) => (
                            <td key={colKey} className="px-1 py-3 border-r border-slate-100 text-right">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={rowData[colKey] || ''}
                                onChange={(e) => handleTableTwoChange(dayObj.dateStr, colKey, e.target.value)}
                                className="w-16 text-right px-1 py-1 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 text-xs"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MarketRatePage;