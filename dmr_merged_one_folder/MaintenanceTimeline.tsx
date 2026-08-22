import { memo, useMemo, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Wrench, Battery, Disc, Settings, Droplets, Wind, CircleDot, Milestone, Activity, Hash, Paperclip, Calendar, FilterX, Route, Fuel } from 'lucide-react';
import type { MaintenanceEvent } from '../../types';
import { safeDate } from '../../utils/maintenanceHelpers';
import BillDetailsModal from './BillDetailsModal';

/** One row from GET /fleet/vehicles/:vehicleId/meter-history (backend/src/utils/vehicleMeterLedger.ts) — the
 * same universal ledger used for write-time validation, reused here read-only for the timeline. */
export interface VehicleMeterEvent {
  vehicleId: number;
  sourceType: 'TRIP_START' | 'TRIP_END' | 'FUEL' | 'MAINTENANCE';
  recordId: string;
  ref: string;
  meter: number;
  eventDate: string;
  eventInstant: string;
  diffFromPrevious: number | null;
}

interface MaintenanceTimelineProps {
  events: MaintenanceEvent[];
  /** Trip/Fuel meter events for the currently-selected vehicle, merged in
   * alongside the maintenance cards below — MAINTENANCE-sourced rows are
   * expected to already be excluded (they're covered by `events` above). */
  meterEvents?: VehicleMeterEvent[];
  vehicles: any[];
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

const METER_SOURCE_LABEL: Record<VehicleMeterEvent['sourceType'], string> = {
  TRIP_START: 'Trip Start',
  TRIP_END: 'Trip End',
  FUEL: 'Fuel Bill',
  MAINTENANCE: 'Maintenance',
};

interface TimelineNode {
  icon: ReactNode;
  classes: string;
}

const getTimelineNode = (event: MaintenanceEvent): TimelineNode => {
  const check = `${event.serviceType || ''} ${event.maintenanceType || ''}`.toLowerCase();

  if (check.includes('battery')) {
    return { icon: <Battery className="w-3.5 h-3.5" />, classes: 'border-amber-200 bg-amber-50 text-amber-600' };
  }
  if (check.includes('tyre') || check.includes('tire') || check.includes('wheel') || check.includes('alignment') || check.includes('balancing')) {
    return { icon: <Disc className="w-3.5 h-3.5" />, classes: 'border-indigo-200 bg-indigo-50 text-indigo-600' };
  }
  if (check.includes('brake')) {
    return { icon: <CircleDot className="w-3.5 h-3.5" />, classes: 'border-red-200 bg-red-50 text-red-600' };
  }
  if (check.includes('coolant')) {
    return { icon: <Droplets className="w-3.5 h-3.5" />, classes: 'border-cyan-200 bg-cyan-50 text-cyan-600' };
  }
  if (check.includes('filter')) {
    return { icon: <Wind className="w-3.5 h-3.5" />, classes: 'border-teal-200 bg-teal-50 text-teal-600' };
  }
  if (check.includes('clutch')) {
    return { icon: <Settings className="w-3.5 h-3.5" />, classes: 'border-violet-200 bg-violet-50 text-violet-600' };
  }
  if (check.includes('breakdown') || check.includes('repair')) {
    return { icon: <Wrench className="w-3.5 h-3.5" />, classes: 'border-red-200 bg-red-50 text-red-600' };
  }
  return { icon: <Wrench className="w-3.5 h-3.5" />, classes: 'border-blue-200 bg-blue-50 text-blue-600' };
};

type TimelineRow =
  | { kind: 'maintenance'; time: number; data: MaintenanceEvent }
  | { kind: 'meter'; time: number; data: VehicleMeterEvent };

const MaintenanceTimeline = ({ events, meterEvents = [], vehicles, hasActiveFilters = false, onClearFilters }: MaintenanceTimelineProps) => {
  const [selectedBill, setSelectedBill] = useState<MaintenanceEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

// Sort by the actual maintenance date, newest first (never by the MNT number).
  const timelineEvents = useMemo(() => {
    return (events || [])
      .filter((event) => event.paymentStatus === 'approved')
      .slice()
      .sort((a, b) => safeDate(b.date).getTime() - safeDate(a.date).getTime());
  }, [events]);

  // Merge Trip/Fuel meter events (when a single vehicle is selected — see
  // MaintenanceHistoryPage.tsx) into the same chronological timeline, most
  // recent first. Maintenance-sourced rows are excluded from `meterEvents`
  // by the caller since they're already covered by `timelineEvents` above.
  const mergedTimeline = useMemo<TimelineRow[]>(() => {
    const maintRows: TimelineRow[] = timelineEvents.map((data) => ({
      kind: 'maintenance',
      time: safeDate(data.date).getTime(),
      data,
    }));
    const meterRows: TimelineRow[] = (meterEvents || [])
      .filter((m) => m.sourceType !== 'MAINTENANCE')
      .map((data) => ({ kind: 'meter', time: safeDate(data.eventDate).getTime(), data }));
    return [...maintRows, ...meterRows].sort((a, b) => b.time - a.time);
  }, [timelineEvents, meterEvents]);

  const handleBillClick = (event: MaintenanceEvent) => {
    setSelectedBill(event);
    setIsModalOpen(true);
  };

  if (!mergedTimeline || mergedTimeline.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-full mb-3 text-slate-400 shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <p className="font-bold text-gray-700 text-base">No maintenance records found</p>
          <p className="text-xs text-gray-400 mt-1">
            Try changing the maintenance type, vehicle, or search criteria.
          </p>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition-colors"
            >
              <FilterX size={14} />
              Clear Filters
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="text-center py-10 text-gray-400 text-sm flex flex-col items-center justify-center">
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-full mb-3 text-slate-400 shadow-sm">
          <Activity className="w-6 h-6" />
        </div>
        <p className="font-medium text-gray-600">No Approved Maintenance History</p>
        <p className="text-xs text-gray-400 mt-0.5">No maintenance records have been approved yet.</p>
      </div>
    );
  }

  const visibleTimeline = mergedTimeline.slice(0, 80);

  return (
    <>
      <div className="relative max-h-[520px] overflow-y-auto pl-2 pr-3 scrollbar-thin">
        {/* Continuous vertical connector running through the centre of every node */}
        <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" aria-hidden="true" />

        {visibleTimeline.map((row, index) => {
          const isLast = index === visibleTimeline.length - 1;

          if (row.kind === 'meter') {
            const m = row.data;
            const isFuel = m.sourceType === 'FUEL';
            const icon = isFuel ? <Fuel className="w-3.5 h-3.5" /> : <Route className="w-3.5 h-3.5" />;
            const classes = isFuel
              ? 'border-orange-200 bg-orange-50 text-orange-600'
              : 'border-sky-200 bg-sky-50 text-sky-600';
            return (
              <div key={`meter-${m.sourceType}-${m.recordId}`} className={`relative pl-14 ${isLast ? 'pb-1' : 'pb-6'}`}>
                <div className={`absolute left-5 -translate-x-1/2 top-1 z-10 w-8 h-8 rounded-full border flex items-center justify-center shadow-sm ${classes}`}>
                  {icon}
                </div>
                <div className="bg-white hover:bg-slate-50/50 border border-slate-200/70 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 text-sm tracking-wide">{METER_SOURCE_LABEL[m.sourceType]}</h4>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                        {m.ref}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-0.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm">
                        {m.meter.toLocaleString('en-IN')} KM
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {format(safeDate(m.eventDate), 'dd MMM yyyy')}
                    {m.diffFromPrevious != null && (
                      <span className={`ml-2 text-[11px] font-semibold ${m.diffFromPrevious < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {m.diffFromPrevious >= 0 ? '+' : ''}
                        {m.diffFromPrevious.toLocaleString('en-IN')} KM
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          const event = row.data;
          const matchedVehicle = vehicles.find(v => String(v.id) === String(event.vehicleId));
          const vehicleNo = matchedVehicle?.vehicleNumber || event.vehicleNo || '';
          const node = getTimelineNode(event);
          const title = String(event.serviceType || '').trim() || String(event.maintenanceType || '').trim() || 'Maintenance';
          const typeBadge = String(event.maintenanceType || '').trim();
          const showTypeBadge = typeBadge && typeBadge.toLowerCase() !== title.toLowerCase();
          const docCount = Array.isArray(event.documents) ? event.documents.length : 0;

          return (
            <div key={event.id} className={`relative pl-14 ${isLast ? 'pb-1' : 'pb-6'}`}>
              {/* Timeline node centred exactly on the connector line */}
              <div className={`absolute left-5 -translate-x-1/2 top-1 z-10 w-8 h-8 rounded-full border flex items-center justify-center shadow-sm ${node.classes}`}>
                {node.icon}
              </div>

              {/* Maintenance card */}
              <div className="bg-white hover:bg-slate-50/50 border border-slate-200/70 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
                {/* Top row: title, badges, documents, amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 text-sm tracking-wide">{title}</h4>

                      {showTypeBadge && (
                        <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-md">
                          {typeBadge}
                        </span>
                      )}

                      {vehicleNo && (
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          {vehicleNo}
                        </span>
                      )}

                      {event.billNumber && (
                        <button
                          onClick={() => handleBillClick(event)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded hover:bg-green-100 hover:border-green-300 transition-colors cursor-pointer"
                          title="Click to view bill details"
                        >
                          <Hash className="w-3 h-3" />
                          {event.billNumber}
                        </button>
                      )}

                      {docCount > 0 && (
                        <button
                          onClick={() => handleBillClick(event)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors cursor-pointer"
                          title={`${docCount} document${docCount > 1 ? 's' : ''} attached`}
                        >
                          <Paperclip className="w-3 h-3" />
                          {docCount}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-0.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-sm font-bold text-blue-600 shadow-sm">
                      ₹{event.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Second row: actual maintenance date */}
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {format(safeDate(event.date), 'dd MMM yyyy')}
                </div>

                {/* Third row: operational information */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1 font-semibold text-gray-600">
                    <Milestone className="w-3.5 h-3.5 text-gray-400" />
                    Log Profile: {event.currentKM.toLocaleString('en-IN')} KM
                  </span>
                  {event.nextServiceKM > 0 && (
                    <span className="font-medium text-gray-500">
                      Next Target: {event.nextServiceKM.toLocaleString('en-IN')} KM
                    </span>
                  )}
                  {event.garage && (
                    <span className="truncate max-w-[180px]">
                      Garage: <span className="font-semibold text-gray-600">{event.garage}</span>
                    </span>
                  )}
                  {event.mechanic && (
                    <span>
                      Mechanic: <span className="font-semibold text-gray-600">{event.mechanic}</span>
                    </span>
                  )}
                  {event.driverName && (
                    <span>
                      Driver: <span className="font-semibold text-gray-600">{event.driverName}</span>
                    </span>
                  )}
                </div>

                {event.remarks && (
                  <div className="text-xs italic text-gray-600 mt-2 bg-slate-50 border border-slate-200/70 px-3 py-2 rounded-lg leading-relaxed">
                    &quot;{event.remarks}&quot;
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {mergedTimeline.length > visibleTimeline.length && (
        <p className="px-5 pt-3 text-center text-[11px] font-semibold text-slate-400">
          Showing latest {visibleTimeline.length} of {mergedTimeline.length} events. Narrow the date or vehicle filter to see more.
        </p>
      )}

      {/* Bill Details Modal */}
      <BillDetailsModal
        isOpen={isModalOpen}
        bill={selectedBill}
        vehicles={vehicles}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedBill(null);
        }}
      />
    </>
  );
};

export default memo(MaintenanceTimeline);
