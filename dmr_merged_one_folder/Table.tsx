import React, { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Button } from "./index"; // Import the button we already have

interface Props {
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  data: any[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  onExport?: () => void;
}

export const Table: React.FC<Props> = ({ 
  columns, 
  data, 
  isLoading: _isLoading, 
  searchPlaceholder = "Search...", 
  onExport 
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder] = useState<'asc' | 'desc'>('asc');

  const filteredData = useMemo(() => {
    let result = data;
    if (searchTerm) {
      result = data.filter((row: any) => 
        Object.values(row).some((val) => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        if (a[sortKey] < b[sortKey]) return sortOrder === 'asc' ? -1 : 1;
        if (a[sortKey] > b[sortKey]) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [data, searchTerm, sortKey, sortOrder]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            placeholder={searchPlaceholder} 
            className="w-full pl-9 pr-4 py-2 h-[42px] rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-[#6c5ce7] focus:ring-4 focus:ring-[#6c5ce7]/10 transition-all" 
          />
        </div>
        {onExport && <Button variant="outline" onClick={onExport} className="text-xs">Export Excel</Button>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th 
                  key={col.key} 
                  className="px-4 py-3 cursor-pointer hover:text-slate-800 transition-colors" 
                  onClick={() => setSortKey(col.key)}
                >
                  <div className="flex items-center gap-1">{col.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-8 text-center text-sm text-slate-500">No records found.</td></tr>
            ) : (
              filteredData.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-slate-700">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};