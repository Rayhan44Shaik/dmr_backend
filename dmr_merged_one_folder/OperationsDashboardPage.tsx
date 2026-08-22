// src/modules/operations/dashboard/pages/OperationsDashboardPage.tsx

import { useState, useRef, useEffect } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import KPICards from "../components/KPICards";
import TrendChart from "../components/TrendChart";
import CollectionsPie from "../components/CollectionsPie";
import RecentTripsTable from "../components/RecentTripsTable";
import ActiveCounts from "../components/ActiveCounts";
import PendingCollectionsByShop from "../components/PendingCollectionsByShop";
import { Calendar, ArrowRightLeft } from "lucide-react";
import { DatePicker } from "../../../../components/common/DatePicker";

// -------- Helper: get previous Monday–Sunday --------
const getPreviousWeekRange = () => {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = (day === 0 ? 6 : day - 1) + 7;
  const prevMonday = new Date(today);
  prevMonday.setDate(today.getDate() - diffToMonday);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);
  return { startDate: prevMonday, endDate: prevSunday };
};

// -------- Helper: Format Date to YYYY-MM-DD safely --------
const toInputDateString = (date: Date | undefined): string => {
  if (!date || isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// -------- Helper: Parse YYYY-MM-DD string to Date object safely --------
const parseInputDateString = (dateStr: string): Date | undefined => {
  if (!dateStr) return undefined;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

// -------- RangeDatePicker Component --------
interface RangeDatePickerProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onRangeChange: (start: Date | undefined, end: Date | undefined) => void;
  placement?: "top" | "bottom";
  className?: string;
}

function RangeDatePicker({
  startDate,
  endDate,
  onRangeChange,
  placement = "bottom",
  className = "",
}: RangeDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const formatDate = (date: Date | undefined) => {
    if (!date) return "";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handleStartChange = (dateStr: string) => {
    const newStart = parseInputDateString(dateStr);
    onRangeChange(newStart, endDate);
  };

  const handleEndChange = (dateStr: string) => {
    const newEnd = parseInputDateString(dateStr);
    onRangeChange(startDate, newEnd);
  };

  const startDateStr = toInputDateString(startDate);
  const endDateStr = toInputDateString(endDate);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCalendar = () => setIsOpen(!isOpen);

  const dropdownPositionClass =
    placement === "top"
      ? "bottom-[calc(100%+8px)] mb-1"
      : "top-[calc(100%+8px)] mt-1";

  const slateCalendarIcon = <Calendar size={14} className="text-slate-400" />;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleCalendar}
          className="h-9 px-3.5 rounded-xl border border-slate-200/80 bg-white shadow-sm flex items-center gap-2 text-xs font-bold text-slate-700 hover:border-blue-500/50 hover:bg-slate-50/80 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all active:scale-[0.98]"
        >
          <Calendar size={14} className="text-blue-600" />
          <span>
            {startDate && endDate
              ? `${formatDate(startDate)} – ${formatDate(endDate)}`
              : "Select Range Window"}
          </span>
        </button>
      </div>

      {isOpen && (
        <div
          className={`absolute right-0 z-50 w-80 rounded-2xl border border-slate-200/70 bg-white/95 backdrop-blur-xl p-4 shadow-xl shadow-slate-900/5 border-t-blue-500 border-t-2 ${dropdownPositionClass}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Start Date
                </label>
                <DatePicker
                  value={startDateStr}
                  onChange={handleStartChange}
                  placeholder="From"
                  className="w-full text-xs"
                  icon={slateCalendarIcon}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  End Date
                </label>
                <DatePicker
                  value={endDateStr}
                  onChange={handleEndChange}
                  placeholder="To"
                  className="w-full text-xs"
                  icon={slateCalendarIcon}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const weekAgo = new Date(today);
                  weekAgo.setDate(today.getDate() - 7);
                  onRangeChange(weekAgo, today);
                  setIsOpen(false);
                }}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const monthAgo = new Date(today);
                  monthAgo.setDate(today.getDate() - 30);
                  onRangeChange(monthAgo, today);
                  setIsOpen(false);
                }}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Last 30 days
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------- Main Dashboard View Page --------
function OperationsDashboardPage() {
  const initialRange = getPreviousWeekRange();
  const [startDate, setStartDate] = useState<Date | undefined>(initialRange.startDate);
  const [endDate, setEndDate] = useState<Date | undefined>(initialRange.endDate);
  const [comparisonPeriod] = useState<"7d" | "15d" | "30d">("7d");

  const { data, previousData, isLoading, error, refetch } = useDashboardData(
    startDate ?? null,
    endDate ?? null,
    comparisonPeriod
  );

  const isRangeSelected = startDate !== undefined && endDate !== undefined;
  const rangeDays = isRangeSelected
    ? Math.ceil((endDate!.getTime() - startDate!.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : undefined;

  const handleRangeChange = (s: Date | undefined, e: Date | undefined) => {
    setStartDate(s);
    setEndDate(e);
  };

  if (!isRangeSelected) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <RangeDatePicker
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="flex items-center justify-center h-96 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 border border-blue-100 shadow-sm animate-bounce">
              📅
            </div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">Select Temporal Pipeline</h3>
            <p className="text-xs font-semibold text-slate-400 mt-2 leading-relaxed">
              Click the date range window located above to load real-time analytics indicators.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-24 space-y-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 animate-pulse">
          Synchronizing Analytics Engine...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <RangeDatePicker
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="flex flex-col items-center justify-center py-24 space-y-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm px-6">
          <p className="text-sm font-semibold text-red-700 text-center">{error}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date Range Selector Bar */}
      <div className="flex justify-end items-center">
        <RangeDatePicker
          startDate={startDate}
          endDate={endDate}
          onRangeChange={handleRangeChange}
        />
      </div>

      <div className="relative z-10">
        <KPICards current={data} previous={previousData} rangeDays={rangeDays} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-start gap-4 w-full min-w-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Time-Series Performance</span>
            <h3 className="text-sm font-black text-slate-800 mt-0.5">Operational Output Trends</h3>
          </div>
          <div className="w-full overflow-hidden">
            <TrendChart data={data?.trendData || []} />
          </div>
        </div>
        
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-start gap-4 w-full min-w-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Credit Allocations</span>
            <h3 className="text-sm font-black text-slate-800 mt-0.5">Outstanding Shop Balances</h3>
          </div>
          <div className="w-full overflow-hidden">
            <PendingCollectionsByShop data={data?.pendingCollectionsByShop || []} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-start gap-4 w-full min-w-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Breakdown</span>
            <h3 className="text-sm font-black text-slate-800 mt-0.5">Collection Streams</h3>
          </div>
          <div className="w-full flex justify-center items-center py-2 overflow-hidden">
            <CollectionsPie data={data?.collectionsByMode || []} />
          </div>
        </div>
        
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-start gap-4 w-full min-w-0">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Infrastructure Matrix</span>
              <h3 className="text-sm font-black text-slate-800 mt-0.5">Recent Transit Manifests</h3>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
              <ArrowRightLeft size={10} className="text-slate-400" /> Auto-updates
            </div>
          </div>
          <div className="w-full overflow-x-auto text-xs rounded-xl border border-slate-100">
            <RecentTripsTable trips={data?.recentTrips || []} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm w-full min-w-0">
        <div className="mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Supply Ecosystem Nodes</span>
          <h3 className="text-sm font-black text-slate-800 mt-0.5">Active Fleet & Asset Infrastructure</h3>
        </div>
        <ActiveCounts
          vehicles={data?.activeVehicles || 0}
          drivers={data?.activeDrivers || 0}
          helpers={data?.activeHelpers || 0}
          shops={data?.totalShops || 0}
          farms={data?.totalFarms || 0}
        />
      </div>
    </div>
  );
}

export default OperationsDashboardPage;