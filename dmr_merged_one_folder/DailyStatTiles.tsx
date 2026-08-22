import { memo } from 'react';
import { MapPin, Fuel, DollarSign, FileText, Gauge } from 'lucide-react';

interface DailyStatTilesProps {
  kmToday: number;
  fuelToday: number;
  tollToday: number;
  documentsExpiring: number;
  avgFuelEfficiency: number;
}

const DailyStatTiles = ({
  kmToday,
  fuelToday,
  tollToday,
  documentsExpiring,
  avgFuelEfficiency,
}: DailyStatTilesProps) => {
  const stats = [
    { 
      label: 'KM Today', 
      value: typeof kmToday === 'number' ? kmToday : 0, 
      icon: MapPin,
      format: 'number' as const
    },
    { 
      label: 'Fuel Today', 
      value: typeof fuelToday === 'number' ? fuelToday : 0, 
      icon: Fuel, 
      format: 'liters' as const 
    },
    { 
      label: 'Toll Today', 
      value: typeof tollToday === 'number' ? tollToday : 0, 
      icon: DollarSign, 
      format: 'currency' as const 
    },
    { 
      label: 'Documents Expiring', 
      value: typeof documentsExpiring === 'number' ? documentsExpiring : 0, 
      icon: FileText,
      format: 'number' as const
    },
    { 
      label: 'Avg Fuel Efficiency', 
      value: typeof avgFuelEfficiency === 'number' ? avgFuelEfficiency : 0, 
      icon: Gauge, 
      format: 'kmpl' as const 
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat, idx) => {
        let displayValue: string | number = stat.value;
        let suffix = '';
        
        if (stat.format === 'currency') {
          displayValue = `₹${Number(stat.value).toLocaleString('en-IN')}`;
        } else if (stat.format === 'liters') {
          displayValue = Number(stat.value).toFixed(1);
          suffix = ' L';
        } else if (stat.format === 'kmpl') {
          displayValue = Number(stat.value).toFixed(2);
          suffix = ' km/l';
        } else if (stat.format === 'number' && typeof stat.value === 'number') {
          displayValue = stat.value.toLocaleString('en-IN');
        }
        
        return (
          <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <stat.icon className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-lg font-semibold text-gray-900">{displayValue}{suffix}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default memo(DailyStatTiles);