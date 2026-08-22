import { memo } from 'react';
import { Edit } from 'lucide-react';

interface MatrixRow {
  vehicle: { id: string | number; vehicleNumber: string };
  docMap: Record<string, { expiryDate?: string } | undefined>;
}

interface DocumentMatrixProps {
  matrix: MatrixRow[];
  docTypes: string[];
  docLabels: Record<string, string>;
  getStatusColor: (expiryDate?: string) => string;
  formatExpiryDate: (dateStr?: string) => string;
  onEdit: (vehicle: MatrixRow['vehicle'], docMap: MatrixRow['docMap']) => void;
}

const getExpiry = (doc: { expiryDate?: string } | undefined): string | undefined => doc?.expiryDate;

const expiryLabel = (value?: string): string => {
  if (!value) return 'Not added';
  const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const date = parts ? new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const days = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Expiring soon';
  return 'Active';
};

const DocumentMatrix = ({
  matrix,
  docTypes,
  docLabels,
  getStatusColor,
  formatExpiryDate,
  onEdit,
}: DocumentMatrixProps) => {
  if (!matrix || matrix.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No vehicles found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Vehicle
            </th>
            {docTypes.map((type) => (
              <th
                key={type}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {docLabels[type] || type}
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {matrix.map((row) => {
            const docMap = row.docMap || {};
            return (
              <tr key={`${row.vehicle.id}-${row.vehicle.vehicleNumber}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">
                  {row.vehicle.vehicleNumber}
                </td>
                {docTypes.map((type) => {
                  const expiry = getExpiry(docMap[type]);
                  const formatted = expiry ? formatExpiryDate(expiry) : '—';
                  return (
                    <td key={type} className="px-4 py-3">
                      {expiry ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(expiry)}`}>{formatted}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{expiryLabel(expiry)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3">
                  <button
                    onClick={() => onEdit(row.vehicle, docMap)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit Documents"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default memo(DocumentMatrix);