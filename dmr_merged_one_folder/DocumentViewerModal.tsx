import { memo } from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';
import type { MaintenanceDocument } from '../../types';
import { maintenanceApi } from '../../services/maintenanceApi';

interface DocumentViewerModalProps {
  open: boolean;
  maintenanceId: string;
  doc: MaintenanceDocument | null;
  onClose: () => void;
}

const DocumentViewerModal = ({ open, maintenanceId, doc, onClose }: DocumentViewerModalProps) => {
  if (!open || !doc || !maintenanceId) return null;

  const url = maintenanceApi.documentUrl(maintenanceId, doc.id);
  const isImage = (doc.mimeType || '').startsWith('image/');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-slate-400 shrink-0" />
            <span className="text-sm font-bold text-slate-800 truncate">{doc.fileName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              <ExternalLink size={14} />
              Open
            </a>
            <button
              onClick={() => maintenanceApi.downloadDocument(maintenanceId, doc)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              <Download size={14} />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-auto flex-1 bg-slate-100/60 flex items-center justify-center min-h-[300px]">
          {isImage ? (
            <img
              src={url}
              alt={doc.fileName}
              className="max-w-full max-h-[70vh] rounded-xl shadow-lg object-contain bg-white"
            />
          ) : (
            <iframe
              src={url}
              title={doc.fileName}
              className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(DocumentViewerModal);
