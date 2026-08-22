import { Truck, Users, UserCog, Store, Warehouse } from "lucide-react";

interface ActiveCountsProps {
  vehicles: number;       // total active vehicles
  drivers: number;        // total active drivers
  helpers: number;        // total active helpers
  shops: number;          // total active shops
  farms: number;          // total active farms
  usedVehicles?: number;  // used in selected period
  usedDrivers?: number;   // used in selected period
  usedHelpers?: number;   // used in selected period
  usedShops?: number;     // used in selected period
  usedFarms?: number;     // used in selected period
}

export default function ActiveCounts({
  vehicles,
  drivers,
  helpers,
  shops,
  farms,
  usedVehicles = 0,
  usedDrivers = 0,
  usedHelpers = 0,
  usedShops = 0,
  usedFarms = 0,
}: ActiveCountsProps) {
  const items = [
    {
      label: "Active Vehicles",
      used: usedVehicles,
      total: vehicles,
      icon: Truck,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      label: "Active Drivers",
      used: usedDrivers,
      total: drivers,
      icon: Users,
      color: "text-green-500",
      bg: "bg-green-50",
    },
    {
      label: "Active Helpers",
      used: usedHelpers,
      total: helpers,
      icon: UserCog,
      color: "text-purple-500",
      bg: "bg-purple-50",
    },
    {
      label: "Active Shops",
      used: usedShops,
      total: shops,
      icon: Store,
      color: "text-orange-500",
      bg: "bg-orange-50",
    },
    {
      label: "Active Farms",
      used: usedFarms,
      total: farms,
      icon: Warehouse,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 mb-4 text-center">
        Active Counts
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          const percent = item.total > 0 ? (item.used / item.total) * 100 : 0;

          return (
            <div
              key={item.label}
              className="flex flex-col items-center p-3 rounded-xl border border-slate-100 hover:shadow-md transition-shadow"
            >
              <div className={`p-2 rounded-full ${item.bg} mb-2`}>
                <Icon size={18} className={item.color} />
              </div>
              <div className="text-lg font-bold text-slate-800">
                {item.used} / {item.total}
              </div>
              <div className="text-xs text-slate-500 truncate w-full text-center">
                {item.label}
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    percent > 70
                      ? "bg-green-500"
                      : percent > 40
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}