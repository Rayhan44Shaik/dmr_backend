import { memo } from 'react';
import { format, differenceInDays } from 'date-fns';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface UpcomingEmiListProps {
  upcoming: any[];
  vehicles: any[];
  onPayEMI?: (emiId: string) => void;
}

const UpcomingEmiList = ({ upcoming, vehicles, onPayEMI }: UpcomingEmiListProps) => {
  if (!upcoming || upcoming.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
        No upcoming EMIs in the next 30 days.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcoming.map((emi) => {
        const vehicle = vehicles.find((v) => v.id === emi.vehicleId);
        const daysUntil = differenceInDays(new Date(emi.nextEMIDate), new Date());
        const isUrgent = daysUntil <= 7;

        return (
          <div
            key={emi.id}
            className={`border rounded-lg p-3 ${
              isUrgent ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {vehicle?.vehicleNumber || 'Unknown'}
                  </span>
                  {isUrgent ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Due in {daysUntil} days
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                      Due in {daysUntil} days
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  EMI: ₹{emi.emiAmount.toLocaleString('en-IN')} • 
                  Due: {format(new Date(emi.nextEMIDate), 'dd MMM yyyy')}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {emi.financeCompany} • {emi.paidEMIs}/{emi.totalEMIs} paid
                </div>
              </div>
              {onPayEMI && (
                <button
                  onClick={() => onPayEMI(emi.id)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  Pay Now
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default memo(UpcomingEmiList);