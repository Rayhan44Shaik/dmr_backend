import { memo } from 'react';
import { CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';

interface StatusCounts {
  [type: string]: {
    expired: number;
    expiring: number;
    safe: number;
  };
}

interface DocumentSummaryTilesProps {
  counts: Record<string, number>;         // optional – kept for compatibility
  statusCounts: StatusCounts;
  docLabels: Record<string, string>;
}

const DocumentSummaryTiles = ({ statusCounts, docLabels }: DocumentSummaryTilesProps) => {
  const totalExpiring = Object.values(statusCounts).reduce((sum, s) => sum + s.expiring, 0);
  const totalExpired = Object.values(statusCounts).reduce((sum, s) => sum + s.expired, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Object.entries(docLabels).map(([type, label]) => {
          const status = statusCounts[type] || { expired: 0, expiring: 0, safe: 0 };
          const { expired, expiring, safe } = status;
          const total = expired + expiring + safe;

          // Determine background/border based on most critical status
          let bgColor = 'bg-white';
          let borderColor = 'border-gray-200';
          if (expired > 0) {
            bgColor = 'bg-red-50';
            borderColor = 'border-red-300';
          } else if (expiring > 0) {
            bgColor = 'bg-amber-50';
            borderColor = 'border-amber-300';
          } else if (safe > 0) {
            bgColor = 'bg-green-50';
            borderColor = 'border-green-300';
          }

          return (
            <div
              key={type}
              className={`rounded-lg border ${borderColor} ${bgColor} p-4 shadow-sm transition hover:shadow-md`}
            >
              {/* Header: type label + total count */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {label}
                </span>
                <span className="text-xl font-bold text-gray-800">{total}</span>
              </div>

              {/* Horizontal status indicators: icons + counts only */}
              <div className="flex items-center justify-around gap-1">
                {/* Safe */}
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-semibold text-green-700">{safe}</span>
                </div>
                {/* Expiring */}
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">{expiring}</span>
                </div>
                {/* Expired */}
                <div className="flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-semibold text-red-700">{expired}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Warning banner */}
      {(totalExpiring > 0 || totalExpired > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {totalExpired > 0 && (
            <span className="font-bold text-red-600">{totalExpired} expired</span>
          )}
          {totalExpiring > 0 && (
            <span className="font-bold text-amber-600">
              {totalExpiring} expiring in the next 30 days
            </span>
          )}
          {totalExpired === 0 && totalExpiring === 0 && (
            <span className="text-green-700">All documents up‑to‑date</span>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(DocumentSummaryTiles);