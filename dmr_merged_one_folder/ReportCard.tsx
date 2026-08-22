import { memo } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';

interface ReportCardProps {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  onExport: (id: string, format: 'pdf' | 'excel') => void;
}

const ReportCard = ({ id, title, description, icon: Icon, onExport }: ReportCardProps) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-50 rounded-lg">
          <Icon className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-gray-900">{title}</h4>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onExport(id, 'pdf')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={() => onExport(id, 'excel')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(ReportCard);