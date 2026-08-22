import { Search, Plus, FileText, FileSpreadsheet } from "lucide-react";

type FarmToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onAddFarm: () => void;
  onExportPDF: () => void;
  onExportExcel: () => void;
};

function FarmToolbar({
  search,
  onSearchChange,
  onAddFarm,
  onExportPDF,
  onExportExcel,
}: FarmToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="relative w-full sm:w-96">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search Farm..."
          className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onExportPDF}
          className="inline-flex items-center gap-2 rounded-lg border border-red-600 px-4 py-2.5 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition-colors"
        >
          <FileText size={18} />
          PDF
        </button>
        <button
          onClick={onExportExcel}
          className="inline-flex items-center gap-2 rounded-lg border border-green-600 px-4 py-2.5 text-sm font-medium text-green-600 shadow-sm hover:bg-green-50 transition-colors"
        >
          <FileSpreadsheet size={18} />
          Excel
        </button>
        <button
          onClick={onAddFarm}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Add Farm
        </button>
      </div>
    </div>
  );
}

export default FarmToolbar;