import { memo } from 'react';
import { X, Calendar, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentDetailModalProps {
  vehicle: any;
  docMap: Record<string, any>;
  onClose: () => void;
}

const DocumentDetailModal = ({ vehicle, docMap, onClose }: DocumentDetailModalProps) => {
  const getDocStatus = (expiryDate: string) => {
    if (!expiryDate) return { label: 'Unknown', color: 'text-gray-600 bg-gray-50', icon: FileText };
    const now = new Date();
    const exp = new Date(expiryDate);
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Expired', color: 'text-red-600 bg-red-50', icon: AlertCircle };
    if (diffDays <= 30) return { label: 'Expiring Soon', color: 'text-amber-600 bg-amber-50', icon: AlertCircle };
    return { label: 'Valid', color: 'text-green-600 bg-green-50', icon: CheckCircle };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Document Details</h2>
            <p className="text-sm text-gray-500">{vehicle.vehicleNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          {Object.entries(docMap).map(([type, doc]) => {
            if (!doc || !doc.expiryDate) return null;
            const status = getDocStatus(doc.expiryDate);
            const StatusIcon = status.icon;
            return (
              <div key={type} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-800">{type}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>Expiry: {new Date(doc.expiryDate).toLocaleDateString()}</span>
                  </div>
                  {doc.documentNumber && (
                    <div className="text-gray-600">
                      <span className="font-medium">Doc #:</span> {doc.documentNumber}
                    </div>
                  )}
                  {doc.issuedDate && (
                    <div className="text-gray-600">
                      <span className="font-medium">Issued:</span> {new Date(doc.issuedDate).toLocaleDateString()}
                    </div>
                  )}
                  {doc.remarks && (
                    <div className="col-span-2 text-gray-600">
                      <span className="font-medium">Remarks:</span> {doc.remarks}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(DocumentDetailModal);