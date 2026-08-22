import { memo, useEffect, useState } from 'react';
import { Download, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
import type { MaintenanceDocument } from '../../types';
import { maintenanceApi } from '../../services/maintenanceApi';
import { handleApiError } from '../../../../api/errors';
import { useSafeNotification } from '../../../../hooks/useSafeNotification';
import DocumentViewerModal from './DocumentViewerModal';

interface MaintenanceDocumentsProps {
  maintenanceId: string;
  documents: MaintenanceDocument[];
  allowRemove?: boolean;
  onChanged?: () => void;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const MaintenanceDocuments = ({ maintenanceId, documents, allowRemove = true, onChanged }: MaintenanceDocumentsProps) => {
  const [viewerDoc, setViewerDoc] = useState<MaintenanceDocument | null>(null);
  const [visibleDocs, setVisibleDocs] = useState<MaintenanceDocument[]>(documents || []);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const { showNotification } = useSafeNotification();

  useEffect(() => setVisibleDocs(Array.isArray(documents) ? documents : []), [documents]);

  const remove = async (doc: MaintenanceDocument) => {
    if (!window.confirm(`Remove “${doc.fileName}” from this maintenance record?`)) return;
    setRemovingId(doc.id);
    try {
      await maintenanceApi.removeDocument(maintenanceId, doc.id);
      setVisibleDocs((items) => items.filter((item) => item.id !== doc.id));
      if (viewerDoc?.id === doc.id) setViewerDoc(null);
      showNotification('Document removed.', 'success');
      onChanged?.();
    } catch (cause) {
      showNotification(handleApiError(cause), 'error');
    } finally {
      setRemovingId(null);
    }
  };

  if (visibleDocs.length === 0) return <p className="text-sm italic text-slate-400">No documents attached.</p>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {visibleDocs.map((doc) => {
          const isImage = (doc.mimeType || '').startsWith('image/');
          const url = maintenanceApi.documentUrl(maintenanceId, doc.id);
          return (
            <div key={doc.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:border-blue-300 hover:shadow-sm">
              <button type="button" className="flex h-24 w-full items-center justify-center overflow-hidden bg-slate-100" onClick={() => setViewerDoc(doc)}>
                {isImage ? <img src={url} alt={doc.fileName} className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <div className="flex flex-col items-center text-slate-400"><FileText size={26} /><span className="mt-1 text-[10px] uppercase">PDF</span></div>}
              </button>
              <div className="p-2">
                <p className="flex items-center gap-1 truncate text-xs font-medium text-slate-700" title={doc.fileName}><Paperclip size={11} className="shrink-0 text-slate-400" /><span className="truncate">{doc.fileName}</span></p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{formatFileSize(doc.fileSize)}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => maintenanceApi.downloadDocument(maintenanceId, doc).catch((cause) => showNotification(handleApiError(cause), 'error'))} className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Download"><Download size={13} /></button>
                    {allowRemove && <button type="button" disabled={removingId === doc.id} onClick={() => void remove(doc)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" title="Remove">{removingId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <DocumentViewerModal open={Boolean(viewerDoc)} maintenanceId={maintenanceId} doc={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
};

export default memo(MaintenanceDocuments);
