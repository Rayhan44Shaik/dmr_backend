import { memo } from 'react';
import { format } from 'date-fns';

interface FastagTransactionsProps {
  transactions: any[];
  fastags: any[];
  vehicles: any[];
}

const FastagTransactions = ({ transactions, fastags, vehicles }: FastagTransactionsProps) => {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No FASTag transactions found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date & Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Plaza
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Vehicle
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {transactions.slice(0, 10).map((tx) => {
            const fastag = fastags.find((f) => f.id === tx.fastagId);
            const vehicle = fastag ? vehicles.find((v) => v.id === fastag.vehicleId) : null;
            return (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">
                  {format(new Date(tx.date), 'dd MMM yyyy HH:mm')}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{tx.plaza}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {vehicle?.vehicleNumber || 'Unknown'}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-red-600 text-right">
                  -₹{tx.amount.toLocaleString('en-IN')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ✅ Ensure default export
export default memo(FastagTransactions);