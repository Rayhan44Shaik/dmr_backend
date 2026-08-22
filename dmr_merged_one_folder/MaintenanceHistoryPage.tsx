import { memo, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FilterX,
  IndianRupee,
  Paperclip,
  Search,
  Truck,
  Wrench,
} from 'lucide-react';
import { DatePicker } from '../../../components/common/DatePicker';
import { apiGet } from '../../../api';
import ErrorBoundary from '../components/common/ErrorBoundary';
import MaintenanceTimeline, { type VehicleMeterEvent } from '../components/maintenance/MaintenanceTimeline';
import UpcomingServices from '../components/maintenance/UpcomingServices';
import { useMaintenanceData } from '../hooks/useMaintenanceData';
import { safeDate } from '../utils/maintenanceHelpers';

interface MaintenanceHistoryPageProps { embedded?: boolean }
const selectClass = 'h-10 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';

const MaintenanceHistoryPage = ({ embedded = false }: MaintenanceHistoryPageProps) => {
  const data = useMaintenanceData('history');
  const [meterEvents, setMeterEvents] = useState<VehicleMeterEvent[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setFiltersReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!data.selectedVehicle || data.selectedVehicle === 'all') { setMeterEvents([]); return; }
    apiGet<VehicleMeterEvent[]>(`/fleet/vehicles/${data.selectedVehicle}/meter-history`)
      .then((response) => { if (!cancelled) setMeterEvents((response.data || []).filter((event) => event.sourceType !== 'MAINTENANCE')); })
      .catch(() => { if (!cancelled) setMeterEvents([]); });
    return () => { cancelled = true; };
  }, [data.selectedVehicle]);

  const sorted = useMemo(() => [...data.filtered].sort((a, b) => safeDate(b.date).getTime() - safeDate(a.date).getTime()), [data.filtered]);
  const timelineEvents = sorted.filter((record) => record.paymentStatus === 'approved' && !record.deletedAt);

  const cards = [
    { label: 'Total Maintenance', value: data.historyStats.total, icon: Wrench, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Total Cost', value: `₹${data.historyStats.totalCost.toLocaleString('en-IN')}`, icon: IndianRupee, tone: 'bg-violet-50 text-violet-600' },
    { label: 'Approved', value: data.historyStats.approved, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pending', value: data.historyStats.pending, icon: AlertCircle, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Vehicles Serviced', value: data.historyStats.vehiclesServiced, icon: Truck, tone: 'bg-cyan-50 text-cyan-600' },
    { label: 'Documents', value: data.historyStats.documents, icon: Paperclip, tone: 'bg-slate-100 text-slate-600' },
  ];

  return (
    <ErrorBoundary>
      <div className={`w-full space-y-5 ${embedded ? '' : 'min-h-screen bg-slate-50 px-4 py-6 md:px-8'}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-bold text-slate-900">Maintenance History</h2><p className="text-sm text-slate-500">Approved, pending and deleted Fleet maintenance records.</p></div>
          <button onClick={data.refresh} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Refresh</button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate text-lg font-black text-slate-800">{value}</p></div>)}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <select value={data.selectedVehicle} onChange={(e) => data.setSelectedVehicle(e.target.value)} className={selectClass}><option value="all">All Vehicles</option>{data.vehicles.map((vehicle: any) => <option key={vehicle.id} value={String(vehicle.id)}>{vehicle.vehicleNumber}</option>)}</select>
            <select value={data.selectedDriver} onChange={(e) => data.setSelectedDriver(e.target.value)} className={selectClass}><option value="all">All Drivers</option>{data.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select>
            <select value={data.selectedMaintenanceType} onChange={(e) => data.setSelectedMaintenanceType(e.target.value)} className={selectClass}><option value="all">All Maintenance Types</option>{data.maintenanceTypes.map((type) => <option key={type}>{type}</option>)}</select>
            <select value={data.selectedServiceType} onChange={(e) => data.setSelectedServiceType(e.target.value)} className={selectClass}><option value="all">All Service Types</option>{data.serviceTypes.map((type) => <option key={type}>{type}</option>)}</select>
            <select value={data.selectedStatus} onChange={(e) => data.setSelectedStatus(e.target.value)} className={`${selectClass} min-w-[140px]`}><option value="all">All Statuses</option><option value="Approved">Approved</option><option value="Pending">Pending</option><option value="Deleted">Deleted</option></select>
            <div className="w-40">{filtersReady ? <DatePicker value={data.fromDate} onChange={data.setFromDate} placeholder="From date" /> : <div className="h-10 rounded-xl border border-slate-200 bg-slate-50" />}</div>
            <div className="w-40">{filtersReady ? <DatePicker value={data.toDate} onChange={data.setToDate} placeholder="To date" /> : <div className="h-10 rounded-xl border border-slate-200 bg-slate-50" />}</div>
            <div className="relative min-w-[220px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={data.searchQuery} onChange={(e) => data.setSearchQuery(e.target.value)} placeholder="Search bill, vehicle, garage…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white" /></div>
            {data.hasActiveFilters && <button onClick={data.resetFilters} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><FilterX size={14} /> Clear</button>}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><CalendarDays size={12} /> Date range, vehicle, driver, status and search are sent through the Fleet maintenance query contract.</p>
        </div>

        {(data.historyError || data.error) && <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span className="flex items-center gap-2"><AlertCircle size={17} />{data.historyError || data.error}</span><button onClick={data.refresh} className="font-bold underline">Retry</button></div>}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2"><div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-bold text-slate-800">Approved Maintenance Timeline</h3></div><div className="p-5"><MaintenanceTimeline events={timelineEvents} meterEvents={meterEvents} vehicles={data.vehicles} hasActiveFilters={data.hasActiveFilters} onClearFilters={data.resetFilters} /></div></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-bold text-slate-800">Upcoming Service</h3></div><div className="p-5"><UpcomingServices services={data.upcomingServices} /></div></div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(MaintenanceHistoryPage);
