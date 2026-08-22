import React from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  includeList: string[];
  onDownloadPDF: () => void;
  onDownloadExcel: () => void;
  isDataAvailable: boolean;
}

const ReportCard: React.FC<Props> = React.memo(({
  title,
  description,
  includeList,
  onDownloadPDF,
  onDownloadExcel,
  isDataAvailable,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 mt-1">{description}</p>

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Includes:</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {includeList.map((item, idx) => (
            <li key={idx} className="flex items-start">
              <span className="mr-2 text-slate-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={onDownloadPDF}
          disabled={!isDataAvailable}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            isDataAvailable
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          <FileText size={16} /> Download PDF
        </button>
        <button
          onClick={onDownloadExcel}
          disabled={!isDataAvailable}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            isDataAvailable
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          <FileSpreadsheet size={16} /> Download Excel
        </button>
      </div>
    </div>
  );
});

export default ReportCard;