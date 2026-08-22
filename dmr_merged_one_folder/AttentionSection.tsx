import { memo, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Fuel, Gauge, Wrench, Truck } from 'lucide-react';
import type { AnalyticsVehicleStat } from '../../types/analytics';
import { formatCurrencyCompact } from '../../utils/formatters';

interface AttentionItem {
  id: string;
  kind: 'low-utilization' | 'low-mileage' | 'high-fuel' | 'high-maintenance';
  icon: typeof Truck;
  tone: string;
  title: string;
  detail: string;
  value: string;
}

interface AttentionSectionProps {
  stats: AnalyticsVehicleStat[];
}

const AttentionSection = ({ stats }: AttentionSectionProps) => {
  const items = useMemo<AttentionItem[]>(() => {
    const list: AttentionItem[] = [];

    const withActivity = stats.filter((row) => row.trips > 0 || row.distance > 0);

    const idle = stats
      .filter((row) => row.trips === 0 && row.distance === 0)
      .sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber))
      .slice(0, 4);
    if (idle.length > 0) {
      list.push({
        id: 'low-utilization',
        kind: 'low-utilization',
        icon: Truck,
        tone: 'border-slate-200 bg-slate-50',
        title: `${idle.length} vehicle${idle.length === 1 ? '' : 's'} with no trips`,
        detail: idle.map((row) => row.vehicleNumber).join(', '),
        value: 'No activity',
      });
    }

    const active = withActivity.filter((row) => row.distance > 0 && row.fuelLitres > 0);
    const fleetAvg =
      active.length > 0
        ? active.reduce((sum, row) => sum + row.mileage, 0) / active.length
        : 0;
    if (fleetAvg > 0) {
      const low = active
        .filter((row) => row.mileage > 0 && row.mileage < fleetAvg)
        .sort((a, b) => a.mileage - b.mileage)
        .slice(0, 4);
      if (low.length > 0) {
        list.push({
          id: 'low-mileage',
          kind: 'low-mileage',
          icon: Gauge,
          tone: 'border-amber-200 bg-amber-50',
          title: `${low.length} vehicle${low.length === 1 ? '' : 's'} below fleet-average mileage`,
          detail: `${low.map((row) => row.vehicleNumber).join(', ')} (fleet avg ${fleetAvg.toFixed(2)} km/l)`,
          value: 'Efficiency',
        });
      }
    }

    const highFuel = [...stats]
      .filter((row) => row.fuelCost > 0)
      .sort((a, b) => b.fuelCost - a.fuelCost)
      .slice(0, 3);
    if (highFuel.length > 0) {
      list.push({
        id: 'high-fuel',
        kind: 'high-fuel',
        icon: Fuel,
        tone: 'border-sky-200 bg-sky-50',
        title: 'Highest fuel spend',
        detail: highFuel.map((row) => `${row.vehicleNumber} (${formatCurrencyCompact(row.fuelCost)})`).join(', '),
        value: formatCurrencyCompact(highFuel[0].fuelCost),
      });
    }

    const highMaint = [...stats]
      .filter((row) => row.maintenanceCost > 0)
      .sort((a, b) => b.maintenanceCost - a.maintenanceCost)
      .slice(0, 3);
    if (highMaint.length > 0) {
      list.push({
        id: 'high-maintenance',
        kind: 'high-maintenance',
        icon: Wrench,
        tone: 'border-violet-200 bg-violet-50',
        title: 'Highest maintenance cost',
        detail: highMaint.map((row) => `${row.vehicleNumber} (${formatCurrencyCompact(row.maintenanceCost)})`).join(', '),
        value: formatCurrencyCompact(highMaint[0].maintenanceCost),
      });
    }

    return list;
  }, [stats]);

  if (stats.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm font-medium text-slate-400">
        No fleet data to review.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800">All clear</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${item.tone}`}
        >
          <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/70">
            <item.icon className="h-3 w-3 text-slate-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-bold text-slate-800">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {item.title}
            </p>
            <p className="mt-0 truncate text-[11px] font-medium text-slate-600" title={item.detail}>
              {item.detail}
            </p>
          </div>
          <span className="flex-shrink-0 text-[11px] font-black text-slate-500">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(AttentionSection);