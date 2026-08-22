import { memo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  X,
  Save,
  Shield,
  Dumbbell,
  FileCheck,
  Car,
  FileText,
  Calendar,
  Upload,
  Eye,
  Trash2,
  Undo2,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { DatePicker } from '../../../../components/common/DatePicker';
import { useSafeNotification } from '../../../../hooks/useSafeNotification';
import permitApi from '../../services/permitApi';

/** Minimal view of a permit document as rendered by the matrix / modal. */
interface PermitDocView {
  expiryDate?: string;
  documentNumber?: string;
  hasDocument?: boolean;
  fileName?: string | null;
  mimeType?: string | null;
  validFrom?: string | null;
  remarks?: string | null;
}

interface DocumentEditModalProps {
  vehicle: { id: string | number; vehicleNumber: string };
  docMap: Record<string, PermitDocView | undefined>;
  docTypes?: string[];
  onClose: () => void;
  onSave: (
    vehicleId: string | number,
    updates: Record<string, { expiryDate?: string; documentNumber?: string; validFrom?: string; remarks?: string }>,
    files?: Record<string, File>,
    removes?: Record<string, boolean>
  ) => Promise<void>;
}

interface DocStyleConfig {
  icon: LucideIcon;
  bg: string;
  border: string;
  text: string;
}

const docConfig: Record<string, DocStyleConfig> = {
  rc: { icon: FileText, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
  insurance: { icon: Shield, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  fitness: { icon: Dumbbell, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  permit: { icon: FileCheck, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  puc: { icon: Car, bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
};

const fallbackConfig = { icon: FileText, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' };

const getExpiry = (doc: PermitDocView | undefined): string | undefined => {
  if (doc && typeof doc === 'object') {
    return doc.expiryDate;
  }
  return undefined;
};

const normalizeDate = (input: string | Date | null | undefined): string => {
  if (!input) return '';
  if (typeof input === 'string') {
    const date = new Date(input);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    const parts = input.split('/');
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return '';
  }
  if (input instanceof Date) {
    if (!isNaN(input.getTime())) return input.toISOString().split('T')[0];
  }
  return '';
};

const DocumentEditModal = ({ vehicle, docMap, docTypes, onClose, onSave }: DocumentEditModalProps) => {
  const { showNotification } = useSafeNotification();

  const documentTypes = (docTypes && docTypes.length > 0)
    ? docTypes
    : Object.keys(docMap);

  const initialDates: Record<string, string> = {};
  const initialValidFrom: Record<string, string> = {};
  const initialNumbers: Record<string, string> = {};
  const initialRemarks: Record<string, string> = {};
  documentTypes.forEach((type) => {
    const doc = docMap[type];
    const expiry = getExpiry(doc);
    if (expiry) {
      const normalized = normalizeDate(expiry);
      if (normalized) initialDates[type] = normalized;
    }
    if (doc?.validFrom) initialValidFrom[type] = normalizeDate(doc.validFrom);
    if (doc?.documentNumber) initialNumbers[type] = String(doc.documentNumber);
    if (doc?.remarks) initialRemarks[type] = String(doc.remarks);
  });

  const [editedDates, setEditedDates] = useState<Record<string, string>>(() => ({ ...initialDates }));
  const [editedValidFrom, setEditedValidFrom] = useState<Record<string, string>>(() => ({ ...initialValidFrom }));
  const [editedNumbers, setEditedNumbers] = useState<Record<string, string>>(() => ({ ...initialNumbers }));
  const [editedRemarks, setEditedRemarks] = useState<Record<string, string>>(() => ({ ...initialRemarks }));
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [removeFlags, setRemoveFlags] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleDateChange = (type: string, value: string | Date | null) => {
    const normalized = normalizeDate(value);
    setEditedDates((prev) => ({ ...prev, [type]: normalized }));
    setErrors((prev) => ({ ...prev, [type]: '' }));
  };

  const handleNumberChange = (type: string, value: string) => {
    setEditedNumbers((prev) => ({ ...prev, [type]: value }));
    setErrors((prev) => ({ ...prev, [type]: '' }));
  };

  const handleFileChange = (type: string, file: File | null) => {
    if (file) {
      const supported = ['image/png', 'image/jpeg', 'application/pdf'].includes(file.type) || /\.(png|jpe?g|pdf)$/i.test(file.name);
      if (!supported) {
        setErrors((prev) => ({ ...prev, [type]: 'Only JPG, JPEG, PNG and PDF files are supported.' }));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, [type]: 'File size cannot exceed 10 MB.' }));
        return;
      }
    }
    setSelectedFiles((prev) => ({ ...prev, [type]: file }));
    if (file) setRemoveFlags((prev) => ({ ...prev, [type]: false }));
    setErrors((prev) => ({ ...prev, [type]: '' }));
  };

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    const todayStr = new Date().toISOString().split('T')[0];

    const updates: Record<string, { expiryDate?: string; documentNumber?: string; validFrom?: string; remarks?: string }> = {};
    const files: Record<string, File> = {};
    const removes: Record<string, boolean> = {};

    documentTypes.forEach((type) => {
      const doc = docMap[type];
      const newDate = editedDates[type];
      const newNumber = editedNumbers[type];
      const newValidFrom = editedValidFrom[type] || '';
      const newRemarks = editedRemarks[type] || '';
      const oldDate = initialDates[type];
      const oldValidFrom = initialValidFrom[type] || '';
      const oldRemarks = initialRemarks[type] || '';
      const oldNumber = doc?.documentNumber ?? '';
      const hasFile = Boolean(selectedFiles[type]);
      const removing = Boolean(removeFlags[type]);

      if (newDate && newDate !== oldDate && newDate < todayStr) {
        newErrors[type] = 'Date cannot be in the past';
        return;
      }

      const dateChanged = Boolean(newDate && newDate !== oldDate);
      const numberChanged = newNumber != null && String(newNumber).trim() !== String(oldNumber ?? '');
      const validFromChanged = newValidFrom !== oldValidFrom;
      const remarksChanged = newRemarks.trim() !== oldRemarks.trim();

      if (newValidFrom && newDate && newValidFrom > newDate) {
        newErrors[type] = 'Valid from date must be before the expiry date.';
        return;
      }

      if (!dateChanged && !numberChanged && !validFromChanged && !remarksChanged && !hasFile && !removing) return;

      if (!newDate && !oldDate) {
        newErrors[type] = 'Please provide an expiry date before saving this document.';
        return;
      }

      const entry: { expiryDate?: string; documentNumber?: string; validFrom?: string; remarks?: string } = {};
      if (newDate || oldDate) entry.expiryDate = newDate || oldDate;
      if (newNumber != null) entry.documentNumber = String(newNumber).trim();
      if (validFromChanged) entry.validFrom = newValidFrom;
      if (remarksChanged) entry.remarks = newRemarks.trim();
      updates[type] = entry;
      if (hasFile) files[type] = selectedFiles[type] as File;
      if (removing && !hasFile) removes[type] = true;
    });

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      showNotification('Please fix the errors before saving.', 'error');
      return;
    }
    if (Object.keys(updates).length === 0) {
      showNotification('No changes to save', 'info');
      return;
    }

    try {
      await onSave(vehicle.id, updates, files, removes);
    } catch {
      showNotification('Failed to update documents', 'error');
    }
  };

  const getConfig = (type: string) => {
    const key = type.toLowerCase();
    return docConfig[key] || fallbackConfig;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 sm:p-6">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden animate-fade-in">

        {/* Fixed Header */}
        <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Edit Documents
            </h2>
            <p className="text-sm font-semibold text-slate-500 mt-0.5">
              Vehicle: <span className="text-blue-600">{vehicle.vehicleNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body: 2-Column Grid */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {documentTypes.map((type) => {
              const doc = docMap[type];
              const expiry = getExpiry(doc);
              const currentDate = editedDates[type] || '';
              const currentNumber = editedNumbers[type] || '';
              const error = errors[type];
              const hasExisting = !!expiry;
              const hasScan = Boolean(doc?.hasDocument && doc?.fileName);
              const config = getConfig(type);
              const Icon = config.icon;
              const isRemoving = Boolean(removeFlags[type]);
              const selectedFileName = selectedFiles[type]?.name;

              return (
                <div
                  key={type}
                  // FIX: Removed overflow-hidden, added relative and focus-within:z-50
                  className="relative bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col group hover:shadow-md transition-shadow focus-within:z-50"
                >
                  {/* Colored Header specific to document type */}
                  {/* FIX: Added rounded-t-xl to keep corners clean without overflow-hidden */}
                  <div className={`flex items-center gap-3 px-4 py-3 border-b rounded-t-xl ${config.bg} ${config.border}`}>
                    <div className={`p-1.5 rounded-lg bg-white shadow-sm border ${config.border}`}>
                      <Icon className={`w-4 h-4 ${config.text}`} />
                    </div>
                    <h3 className={`font-bold uppercase tracking-wide text-[13px] ${config.text}`}>
                      {type}
                    </h3>
                  </div>

                  {/* Body of Card */}
                  <div className="p-4 flex flex-col flex-1 gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Document Number */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Document No.
                        </label>
                        <input
                          type="text"
                          value={currentNumber}
                          onChange={(e) => handleNumberChange(type, e.target.value)}
                          placeholder="e.g. 123456789"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-800"
                        />
                      </div>

                      {/* Expiry Date */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry Date</label>
                        <div className="relative w-full z-10">
                          <DatePicker value={currentDate} onChange={(val) => handleDateChange(type, val)} placeholder={hasExisting ? 'Update date' : 'Select date'} error={error} className="w-full text-sm" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valid From</label>
                        <DatePicker value={editedValidFrom[type] || ''} onChange={(val) => setEditedValidFrom((prev) => ({ ...prev, [type]: normalizeDate(val) }))} placeholder="Valid from" className="w-full text-sm" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remarks</label>
                        <input type="text" value={editedRemarks[type] || ''} onChange={(e) => setEditedRemarks((prev) => ({ ...prev, [type]: e.target.value }))} placeholder="Optional remarks" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                      </div>
                    </div>

                    {/* Warning Messages */}
                    {!hasExisting && !currentDate && !error && (
                      <div className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200/60 flex items-center gap-2 mt-auto">
                        <Car className="w-3.5 h-3.5 shrink-0" />
                        No document on file – pick an expiry date to add one.
                      </div>
                    )}
                    {error && (
                      <div className="text-xs font-medium text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200/60 mt-auto">
                        {error}
                      </div>
                    )}

                    {/* File Upload / Scan Actions */}
                    <div className="mt-auto pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 w-full sm:w-auto">

                        {/* New File Selected State */}
                        {selectedFileName ? (
                          <div className="flex items-center justify-between w-full sm:w-auto gap-3 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
                            <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span className="text-xs font-semibold truncate" title={selectedFileName}>
                                {selectedFileName}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleFileChange(type, null)}
                              className="text-emerald-600 hover:text-emerald-800 p-1"
                              title="Undo upload"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          /* Standard Upload Button */
                          <label className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors shadow-sm">
                            <Upload className="w-3.5 h-3.5 text-slate-400" />
                            {hasScan ? 'Replace Scan' : 'Attach Scan (Optional)'}
                            <input
                              type="file"
                              accept=".png,.jpg,.jpeg,.pdf"
                              className="hidden"
                              onChange={(e) => handleFileChange(type, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        )}
                      </div>

                      {/* Existing Scan Actions */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {hasScan && !selectedFileName && (
                          <a
                            href={permitApi.documentUrl(vehicle.id, type)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                            title={doc?.fileName ?? undefined}
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </a>
                        )}

                        {hasScan && !selectedFileName && (
                          <button
                            type="button"
                            onClick={() => permitApi.downloadDocument(vehicle.id, type, doc?.fileName)}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                            title="Download scan"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>
                        )}

                        {hasScan && !isRemoving && !selectedFileName && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemoveFlags((prev) => ({ ...prev, [type]: true }));
                              setSelectedFiles((prev) => ({ ...prev, [type]: null }));
                            }}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}

                        {isRemoving && !selectedFileName && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex-1 sm:flex-none justify-between">
                            <span className="text-[11px] font-semibold">Scan will be removed</span>
                            <button
                              type="button"
                              className="text-xs font-bold underline hover:text-rose-900"
                              onClick={() => setRemoveFlags((prev) => ({ ...prev, [type]: false }))}
                            >
                              Undo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-all font-semibold text-sm shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-semibold text-sm flex items-center gap-2 shadow-sm active:scale-95"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(DocumentEditModal);