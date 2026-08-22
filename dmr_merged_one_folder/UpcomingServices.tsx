import { memo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';

interface UpcomingService {
  vehicle: any;
  lastMaint: any;
  nextKM: number;
  dueKM: number;
  isDue: boolean;
  liveCurrentKM: number;
}

interface UpcomingServicesProps {
  services: UpcomingService[];
}

const VISIBLE_LIMIT = 20;

const UpcomingServices = ({ services }: UpcomingServicesProps) => {
  if (!services || services.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm flex flex-col items-center justify-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-full mb-3 text-emerald-500 shadow-sm animate-pulse">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <p className="font-bold text-slate-700 text-base">Perfect Condition</p>
        <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">
          All commercial fleet lines active and updated.
        </p>
      </div>
    );
  }

  const visible = services.slice(0, VISIBLE_LIMIT);
  const remaining = services.length - visible.length;

  return (
    <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      {visible.map((item) => {
        const hasPassed = item.dueKM <= 0;
        
        return (
          <div
            key={item.vehicle.id}
            className={`border rounded-2xl p-4 transition-all duration-300 hover:shadow-md ${
              item.isDue 
                ? 'border-rose-100 bg-gradient-to-br from-rose-50/30 to-rose-50/70 hover:border-rose-200' 
                : 'border-slate-100 bg-white hover:border-slate-200'
            }`}
          >
            <div className="space-y-3">
              {/* Top Row Header Metadata */}
              <div className="flex justify-between items-center gap-3">
                <span className="font-bold text-slate-800 tracking-wide text-sm bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200/40">
                  {item.vehicle.vehicleNumber}
                </span>
                
                {hasPassed ? (
                  <span className="px-2 py-1 bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider rounded-md flex items-center gap-1 shadow-sm shadow-rose-600/20">
                    <AlertTriangle className="w-3 h-3" /> Overdue
                  </span>
                ) : item.isDue ? (
                  <span className="px-2 py-1 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-md flex items-center gap-1 shadow-sm shadow-amber-500/20">
                    <Clock className="w-3 h-3" /> Due Soon
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider rounded-md flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Safe
                  </span>
                )}
              </div>
              
              {/* Odometer Tracking Comparison */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 bg-slate-50/60 p-2 rounded-xl border border-slate-100">
                <div>
                  <span className="block text-slate-400 font-medium">Odometer Reading</span>
                  <span className="font-bold text-slate-700 text-xs">
                    {item.liveCurrentKM.toLocaleString()} KM
                  </span>
                </div>
                <div className="border-l border-slate-200/80 pl-3">
                  <span className="block text-slate-400 font-medium">Target Service</span>
                  <span className="font-bold text-slate-700 text-xs">
                    {item.nextKM.toLocaleString()} KM
                  </span>
                </div>
              </div>

              {/* Dynamic Status String Footer */}
              <div className="text-xs pt-0.5 flex justify-between items-center border-t border-slate-100/60">
                <span className="text-slate-400 text-[11px]">
                  {item.lastMaint 
                    ? `Last: ${new Date(item.lastMaint.date).toLocaleDateString('en-GB')}` 
                    : 'No previous service records'}
                </span>
                
                <span className={`font-bold ${
                  hasPassed 
                    ? 'text-rose-600 animate-pulse' 
                    : item.isDue 
                      ? 'text-amber-600' 
                      : 'text-emerald-600'
                }`}>
                  {hasPassed 
                    ? `${Math.abs(item.dueKM).toLocaleString()} KM Overdue` 
                    : `${item.dueKM.toLocaleString()} KM left`}
                </span>
              </div>
              
            </div>
          </div>
        );
      })}
      {remaining > 0 && (
        <p className="pt-1 text-center text-[11px] font-semibold text-slate-400">
          +{remaining} more vehicle{remaining === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
};

export default memo(UpcomingServices);