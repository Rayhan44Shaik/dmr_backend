import { memo } from 'react';
import StatusBadge from '../common/StatusBadge';

interface FastagBalanceTableProps {
  fastags: any[];
  vehicles: any[];
}

const FastagBalanceTable = ({ fastags, vehicles }: FastagBalanceTableProps) => {
  if (!fastags || fastags.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No FASTags linked to vehicles.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Vehicle
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tag No.
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Provider
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Balance
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {fastags.map((fastag) => {
            const vehicle = vehicles.find((v) => v.id === fastag.vehicleId);
            return (
              <tr key={fastag.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {vehicle?.vehicleNumber || 'Unknown'}
                </td>
                <td className="px-4 py-3 text-gray-600 text-sm">{fastag.tagNumber}</td>
                <td className="px-4 py-3 text-gray-600 text-sm">{fastag.provider}</td>
                <td className="px-4 py-3 text-right font-medium">
                  ₹{fastag.balance.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={fastag.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default memo(FastagBalanceTable);