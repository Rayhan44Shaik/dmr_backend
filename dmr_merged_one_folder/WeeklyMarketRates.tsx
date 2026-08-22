import React, { useState, useEffect } from "react";
import { Tag, ChevronLeft, ChevronRight, CheckCircle2, RefreshCw, Save, AlertCircle } from "lucide-react";
import { handleApiError } from "../../../../api";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import {
  listMarketRates,
  saveMarketRates,
  marketRateNum,
  type MarketRateInput,
} from "../../services/marketRateService";

const SUMMARY_FIELDS = ["vij", "gun", "rp"] as const;
const TABLE_ONE_FIELDS = ["sneha", "vencobRate", "vencobVii", "vencobGun", "associationVii"] as const;
const TABLE_TWO_FIELDS = ["c17", "c15", "c13", "c12", "c10"] as const;
const ALL_FIELDS = [...SUMMARY_FIELDS, ...TABLE_ONE_FIELDS, ...TABLE_TWO_FIELDS] as const;

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

export default function WeeklyMarketRates() {
  const { showNotification } = useSafeNotification();
  const [autoSaveStatus, setAutoSaveStatus] = useState<"Saved" | "Saving..." | "Error">("Saved");

  // Helper to get current Monday to Sunday dates (local, date-safe)
  const getCurrentWeekRange = (dateObj: Date = new Date()) => {
    const curr = new Date(dateObj);
    const day = curr.getDay();
    const diffToMonday = curr.getDate() - day + (day === 0 ? -6 : 1);

    const monday = new Date(curr.setDate(diffToMonday));
    const sunday = new Date(curr.setDate(monday.getDate() + 6));

    return { from: formatLocalDate(monday), to: formatLocalDate(sunday) };
  };

  const [currentDateObj, setCurrentDateObj] = useState(new Date());
  const [fromDate, setFromDate] = useState(getCurrentWeekRange().from);
  const [toDate, setToDate] = useState(getCurrentWeekRange().to);
  const [matrixDays, setMatrixDays] = useState<Array<{ label: string; dateStr: string }>>([]);

  // Persistent storage structure
  const [tableOneData, setTableOneData] = useState<Record<string, Record<string, string>>>({});
  const [tableTwoData, setTableTwoData] = useState<Record<string, Record<string, string>>>({});
  const [summaryData, setSummaryData] = useState<Record<string, Record<string, string>>>({});

  // Handle Weekly Shift
  const handleShiftTime = (direction: "prev" | "next") => {
    const newDate = new Date(currentDateObj);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
    setCurrentDateObj(newDate);
    const newRange = getCurrentWeekRange(newDate);
    setFromDate(newRange.from);
    setToDate(newRange.to);
  };

  useEffect(() => {
    const days = [];
    let current = parseLocalDate(fromDate);
    const end = parseLocalDate(toDate);

    while (current <= end) {
      const dayNum = current.getDate().toString();
      const dateStr = formatLocalDate(current);
      days.push({ label: dayNum, dateStr });
      current.setDate(current.getDate() + 1);
    }
    setMatrixDays(days);
  }, [fromDate, toDate]);

  // Load Market Rates from the PostgreSQL backend (never localStorage).
  useEffect(() => {
    let cancelled = false;
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
        showNotification(`Unable to load market rates: ${handleApiError(err)}`, "error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const handleSave = async () => {
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
        if (String(merged[field] ?? "").trim() !== "") {
          payload[field] = marketRateNum(merged[field]);
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
  };

  const handleDataChange = (
    setter: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>,
    dateStr: string,
    field: string,
    value: string
  ) => {
    setter(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || {}),
        [field]: value,
      }
    }));
  };

  const renderTableTimeHeader = () => (
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 shadow-2xs">
      <button onClick={() => handleShiftTime("prev")} className="flex items-center gap-0.5 px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900 rounded font-medium text-xs transition-all border-r border-slate-200">
        <ChevronLeft size={13} /> <span>Prev Week</span>
      </button>
      <button onClick={() => handleShiftTime("next")} className="flex items-center gap-0.5 px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900 rounded font-medium text-xs transition-all">
        <span>Next Week</span> <ChevronRight size={13} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-slate-800">Weekly Market Rates</h2>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium ${
            autoSaveStatus === "Error"
              ? "text-red-700 bg-red-50 border-red-200"
              : "text-slate-600 bg-white border-slate-200"
          }`}>
            {autoSaveStatus === "Saving..." ? (
              <RefreshCw size={13} className="text-amber-500 animate-spin" />
            ) : autoSaveStatus === "Error" ? (
              <AlertCircle size={13} className="text-red-600" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-600" />
            )}
            <span>{autoSaveStatus === "Saving..." ? "Syncing..." : autoSaveStatus === "Error" ? "Failed to sync" : "Synced"}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={autoSaveStatus === "Saving..."}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save size={13} /> Save
          </button>
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700">
            <span>{fromDate}</span> <span className="text-slate-400">to</span> <span>{toDate}</span>
          </div>
        </div>
      </div>

      {/* 1. Additional Metrics Entry */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Additional Metrics Entry (Vij, Gun, R.P)</h3>
          </div>
          {renderTableTimeHeader()}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center border border-slate-200 text-xs">
            <thead className="bg-slate-100">
              <tr className="text-slate-700 font-bold border-b border-slate-200">
                <th className="px-4 py-2 border-r border-slate-200 text-left">Date</th>
                <th className="px-4 py-2 border-r border-slate-200">Vij</th>
                <th className="px-4 py-2 border-r border-slate-200">Gun</th>
                <th className="px-4 py-2">R.P</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {matrixDays.map((dayObj) => {
                const rowData = summaryData[dayObj.dateStr] || {};
                return (
                  <tr key={dayObj.dateStr} className="hover:bg-slate-50">
                    <td className="px-4 py-2 border-r border-slate-100 text-left font-bold text-slate-900 bg-slate-50/50">{dayObj.dateStr}</td>
                    <td className="px-4 py-2 border-r border-slate-100">
                      <input type="text" inputMode="numeric" placeholder="0" value={rowData["vij"] || ""} onChange={(e) => handleDataChange(setSummaryData, dayObj.dateStr, "vij", e.target.value)} className="w-20 text-center px-2 py-1 border border-slate-200 rounded text-xs" />
                    </td>
                    <td className="px-4 py-2 border-r border-slate-100">
                      <input type="text" inputMode="numeric" placeholder="0" value={rowData["gun"] || ""} onChange={(e) => handleDataChange(setSummaryData, dayObj.dateStr, "gun", e.target.value)} className="w-20 text-center px-2 py-1 border border-slate-200 rounded text-xs" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="text" inputMode="numeric" placeholder="0" value={rowData["rp"] || ""} onChange={(e) => handleDataChange(setSummaryData, dayObj.dateStr, "rp", e.target.value)} className="w-20 text-center px-2 py-1 border border-slate-200 rounded text-xs text-blue-600 font-medium" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* 2. Company Rates Matrix Entry */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Company Rates Matrix Entry</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse text-xs">
              <thead className="bg-slate-100">
                <tr className="text-slate-700 font-bold border-b border-slate-200">
                  <th className="px-2 py-2 text-left border-r border-slate-200">Date</th>
                  <th className="px-1 py-2 border-r border-slate-200">Sneha</th>
                  <th className="px-1 py-2 border-r border-slate-200">VenCob Rate</th>
                  <th className="px-1 py-2 border-r border-slate-200">VenCob Vii</th>
                  <th className="px-1 py-2 border-r border-slate-200">VenCob Gun</th>
                  <th className="px-1 py-2">Assoc Vii</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {matrixDays.map((dayObj) => {
                  const rowData = tableOneData[dayObj.dateStr] || {};
                  return (
                    <tr key={dayObj.dateStr} className="hover:bg-slate-50">
                      <td className="px-2 py-2 border-r border-slate-100 text-left font-bold text-slate-900 bg-slate-50/50">{dayObj.dateStr}</td>
                      {["sneha", "vencobRate", "vencobVii", "vencobGun", "associationVii"].map((colKey) => (
                        <td key={colKey} className="px-1 py-1 border-r border-slate-100">
                          <input type="text" inputMode="numeric" placeholder="0" value={rowData[colKey] || ""} onChange={(e) => handleDataChange(setTableOneData, dayObj.dateStr, colKey, e.target.value)} className="w-12 text-center px-1 py-1 border border-slate-200 rounded text-xs" />
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
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm">Size & Category Breakdown Entry</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse text-xs">
              <thead className="bg-slate-100">
                <tr className="text-slate-700 font-bold border-b border-slate-200">
                  <th className="px-2 py-2 text-left border-r border-slate-200">Date</th>
                  <th className="px-1 py-2 border-r border-slate-200">17</th>
                  <th className="px-1 py-2 border-r border-slate-200">15</th>
                  <th className="px-1 py-2 border-r border-slate-200">13</th>
                  <th className="px-1 py-2 border-r border-slate-200">12</th>
                  <th className="px-1 py-2">10</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {matrixDays.map((dayObj) => {
                  const rowData = tableTwoData[dayObj.dateStr] || {};
                  return (
                    <tr key={dayObj.dateStr} className="hover:bg-slate-50">
                      <td className="px-2 py-2 border-r border-slate-100 text-left font-bold text-slate-900 bg-slate-50/50">{dayObj.dateStr}</td>
                      {["c17", "c15", "c13", "c12", "c10"].map((colKey) => (
                        <td key={colKey} className="px-1 py-1 border-r border-slate-100">
                          <input type="text" inputMode="numeric" placeholder="0" value={rowData[colKey] || ""} onChange={(e) => handleDataChange(setTableTwoData, dayObj.dateStr, colKey, e.target.value)} className="w-12 text-center px-1 py-1 border border-slate-200 rounded text-xs" />
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
    </div>
  );
}
