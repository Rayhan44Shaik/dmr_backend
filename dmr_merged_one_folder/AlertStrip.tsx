import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface AlertItem {
  label: string;
  count: number;
  color: string;
}

interface AlertStripProps {
  alerts: AlertItem[];
}

const AlertStrip: React.FC<AlertStripProps> = ({ alerts }) => {
  const hasAlerts = alerts.some(a => a.count > 0);

  if (!hasAlerts) {
    return (
      <div className="bg-green-50 p-3 rounded-lg text-green-700 text-sm font-medium flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        All clear! No alerts at this time.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
      {alerts.map((alert, idx) => (
        alert.count > 0 && (
          <div
            key={idx}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${alert.color}`}
          >
            <AlertTriangle className="w-4 h-4" />
            {alert.label}: {alert.count}
          </div>
        )
      ))}
    </div>
  );
};

export default React.memo(AlertStrip);