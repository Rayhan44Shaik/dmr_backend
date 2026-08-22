import { memo } from 'react';
import { Trash2, Plus, ShoppingBag } from 'lucide-react';
import type { PartItem } from '../../types';

interface PartsTableProps {
  parts: PartItem[];
  setParts: (parts: PartItem[]) => void;
  hideSubline?: boolean; // Added optional property
}

const PartsTable = ({ parts, setParts, hideSubline = false }: PartsTableProps) => {
  const updatePart = (index: number, field: keyof PartItem, value: any) => {
    const newParts = [...parts];
    newParts[index] = { ...newParts[index], [field]: value };
    
    if (field === 'quantity' || field === 'rate') {
      const quantity = field === 'quantity' ? value : newParts[index].quantity;
      const rate = field === 'rate' ? value : newParts[index].rate;
      newParts[index].amount = (Number(quantity) || 0) * (Number(rate) || 0);
    }
    
    setParts(newParts);
  };

  const sanitizeQuantity = (value: string): string => {
    let cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length > 1 && cleaned.startsWith('0')) {
      cleaned = cleaned.replace(/^0+/, '');
      if (cleaned === '') cleaned = '0';
    }
    return cleaned;
  };

  const sanitizeRate = (value: string): string => {
    let cleaned = value.replace(/[^0-9.]/g, '');
    const components = cleaned.split('.');
    if (components.length > 2) {
      cleaned = components[0] + '.' + components.slice(1).join('');
    }
    if (cleaned.startsWith('.')) {
      cleaned = '0' + cleaned;
    }
    return cleaned;
  };

  const handleQuantityChange = (index: number, value: string) => {
    const sanitized = sanitizeQuantity(value);
    const numValue = sanitized === '' ? 0 : parseInt(sanitized, 10);
    updatePart(index, 'quantity', numValue);
  };

  const handleRateChange = (index: number, value: string) => {
    const sanitized = sanitizeRate(value);
    const numValue = sanitized === '' || sanitized === '.' ? 0 : parseFloat(sanitized);
    updatePart(index, 'rate', numValue);
  };

  const addRow = () => {
    setParts([
      ...parts,
      { name: '', specification: '', quantity: 1, rate: 0, amount: 0 }
    ]);
  };

  const removeRow = (index: number) => {
    if (parts.length > 1) {
      setParts(parts.filter((_, i) => i !== index));
    }
  };

  const totalCost = parts.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex flex-row justify-between items-center bg-gray-50/80 border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-600">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-800 tracking-wide">
              Parts / Items Used <span className="text-red-500">*</span>
            </h4>
            {!hideSubline && (
              <p className="text-[10px] text-gray-400 font-medium -mt-0.5">Track inventory and repair costs</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] font-bold uppercase tracking-wider bg-green-600 text-white border border-green-700 rounded-lg hover:bg-green-700 transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Row
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="w-[28%] px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Item Name <span className="text-red-500">*</span>
              </th>
              <th className="w-[22%] px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Specification
              </th>
              <th className="w-[12%] px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                QTY
              </th>
              <th className="w-[16%] px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                RATE (₹)
              </th>
              <th className="w-[16%] px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                AMOUNT (₹)
              </th>
              <th className="w-[6%] px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                ACTION
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {parts.map((part, index) => {
              const amount = part.amount || 0;
              return (
                <tr key={index} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={part.name}
                      onChange={(e) => updatePart(index, 'name', e.target.value)}
                      placeholder="e.g., Engine Oil Filter"
                      className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={part.specification || ''}
                      onChange={(e) => updatePart(index, 'specification', e.target.value)}
                      placeholder="e.g., OEM - 15W40"
                      className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={part.quantity || ''}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      placeholder="0"
                      className="w-full h-9 px-2 text-center border border-gray-300 rounded-lg text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={part.rate || ''}
                      onChange={(e) => handleRateChange(index, e.target.value)}
                      placeholder="0.00"
                      className="w-full h-9 px-2.5 text-right border border-gray-300 rounded-lg text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-sm text-gray-700">
                    {amount > 0 ? (
                      <span className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 inline-block min-w-[80px] text-sm font-semibold">
                        ₹{amount.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-300 font-normal pr-2">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={parts.length === 1}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      title={parts.length === 1 ? "Cannot delete the only row" : "Remove item"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50/80 border-t border-gray-200">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                Total Cost
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm font-bold text-blue-700 shadow-sm">
                  ₹{totalCost.toFixed(2)}
                </span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default memo(PartsTable);