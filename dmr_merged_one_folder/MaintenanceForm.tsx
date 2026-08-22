import React, { memo, useState } from 'react';
import Select from 'react-select';
import { DatePicker } from '../../../../components/common/DatePicker';
import { Car, User, Gauge, Wrench, Cog, Building2, UserCog, FileText, Hash, Paperclip, Upload, Trash2, File as FileIcon, AlertTriangle } from 'lucide-react';
import PartsTable from './PartsTable';
import type { PartItem } from '../../types';
import { maintenanceApi } from '../../services/maintenanceApi';
import { useSafeNotification } from '../../../../hooks/useSafeNotification';

export interface FormDocumentItem {
  key: string;
  existingId?: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  file?: File;
  objectUrl?: string;
  markedForRemoval?: boolean;
}

interface MaintenanceFormProps {
  form: {
    vehicleId: string;
    date: string;
    billNumber: string;
    currentKM: string;
    maintenanceType: string[];   // now an array for multi‑select
    serviceType: string;
    garage: string;
    mechanic: string;
    driverId: string;
    driverName: string;
    nextServiceKM: string;
    remarks: string;
    id?: string;
  };
  parts: PartItem[];
  setParts: (parts: PartItem[]) => void;
  vehicleOptions: { value: string; label: string }[];
  driverOptions: { value: string; label: string }[];
  maintenanceOptions: { value: string; label: string }[];
  onVehicleChange: (selected: any) => void;
  onDriverChange: (selected: any) => void;
  onMaintenanceChange: (selected: any) => void;  // receives array of selected values
  setFormField: (field: string, value: any) => void;
  selectKey: number;
  documents: FormDocumentItem[];
  onAddDocuments: (files: File[]) => void;
  onRemoveDocument: (key: string) => void;
  onMarkDocumentRemoval: (key: string) => void;
  validateKM?: (km: number) => { valid: boolean; message?: string };
}

const MaintenanceForm: React.FC<MaintenanceFormProps> = ({
  form,
  parts,
  setParts,
  vehicleOptions,
  driverOptions,
  maintenanceOptions,
  onVehicleChange,
  onDriverChange,
  onMaintenanceChange,
  setFormField,
  selectKey,
  documents,
  onAddDocuments,
  onRemoveDocument,
  onMarkDocumentRemoval,
  validateKM,
}) => {
  const { showNotification } = useSafeNotification();
  const [kmError, setKmError] = useState<string | null>(null);

  const inputClass =
    'w-full h-10 pl-10 pr-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition bg-white';

  const handleCurrentKMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // Allow empty value
    if (val === '') {
      setFormField('currentKM', '');
      setKmError(null);
      return;
    }
    
    const num = parseFloat(val);
    if (isNaN(num)) {
      setKmError('Please enter a valid number');
      return;
    }
    
    // Always update the form field with the raw value
    setFormField('currentKM', val);
    
    // Validate the value
    if (validateKM) {
      const { valid, message } = validateKM(num);
      if (!valid) {
        setKmError(message || 'Invalid KM');
      } else {
        setKmError(null);
      }
    } else {
      setKmError(null);
    }
  };

  const handleDocumentInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onAddDocuments(files);
    e.target.value = '';
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '';
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const isImageDoc = (doc: FormDocumentItem): boolean =>
    doc.mimeType?.startsWith('image/') || /\.(png|jpe?g)$/i.test(doc.fileName);

  const documentPreviewUrl = (doc: FormDocumentItem): string | undefined => {
    if (doc.objectUrl) return doc.objectUrl;
    if (doc.existingId != null && form.id) {
      return maintenanceApi.documentUrl(form.id, doc.existingId);
    }
    return undefined;
  };

  return (
    <div className="space-y-5">
      {/* Row 1: Maintenance Number, Vehicle, Date, Driver */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* 1. Maintenance Number (server-generated, globally unique) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Maintenance Number
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Hash size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={form.billNumber}
              readOnly
              disabled
              placeholder="Auto-generated on save"
              className={`${inputClass} bg-slate-50 text-slate-400 cursor-not-allowed`}
            />
          </div>
        </div>

        {/* 2. Vehicle */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Vehicle <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              <Car size={16} className="text-slate-400" />
            </div>
            <Select
              key={`vehicle-${selectKey}`}
              options={vehicleOptions}
              value={vehicleOptions.find(opt => opt.value === form.vehicleId)}
              onChange={onVehicleChange}
              placeholder="Select vehicle"
              isClearable
              className="text-sm"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '40px',
                  paddingLeft: '28px',
                  borderColor: '#cbd5e1',
                  boxShadow: 'none',
                  borderRadius: '0.75rem',
                  '&:hover': { borderColor: '#94a3b8' }
                }),
                placeholder: (base) => ({ ...base, color: '#9ca3af' }),
              }}
            />
          </div>
        </div>

        {/* 3. Date */}
        <div>
          <DatePicker
            label="Date"
            required
            value={form.date}
            onChange={(dateStr) => setFormField('date', dateStr)}
            placeholder="Select date"
          />
        </div>

        {/* 4. Driver */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Driver
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              <User size={16} className="text-slate-400" />
            </div>
            <Select
              key={`driver-${selectKey}`}
              options={driverOptions}
              value={driverOptions.find(opt => opt.value === form.driverId)}
              onChange={onDriverChange}
              placeholder="Select driver"
              isClearable
              className="text-sm"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '40px',
                  paddingLeft: '28px',
                  borderColor: '#cbd5e1',
                  boxShadow: 'none',
                  borderRadius: '0.75rem',
                  '&:hover': { borderColor: '#94a3b8' }
                }),
                placeholder: (base) => ({ ...base, color: '#9ca3af' }),
              }}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Current KM, Next KM, Garage, Mechanic */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* 5. Current KM */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Current KM <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Gauge size={16} className="text-slate-400" />
            </div>
            <input
              type="number"
              value={form.currentKM}
              onChange={handleCurrentKMChange}
              placeholder="e.g. 45000"
              className={`${inputClass} ${kmError ? 'border-red-500' : ''} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            />
          </div>
          {kmError && <p className="mt-1 text-xs text-red-500">{kmError}</p>}
        </div>

        {/* 6. Next Service KM */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Next Service KM
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Gauge size={16} className="text-slate-400" />
            </div>
            <input
              type="number"
              value={form.nextServiceKM}
              onChange={(e) => setFormField('nextServiceKM', e.target.value)}
              placeholder="e.g. 50000"
              className={`${inputClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            />
          </div>
        </div>

        {/* 7. Garage */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Garage
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Building2 size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={form.garage}
              onChange={(e) => setFormField('garage', e.target.value)}
              placeholder="Garage name"
              className={inputClass}
            />
          </div>
        </div>

        {/* 8. Mechanic */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Mechanic
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <UserCog size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={form.mechanic}
              onChange={(e) => setFormField('mechanic', e.target.value)}
              placeholder="Mechanic name"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Row 3: Maintenance Type (multi‑select), Service Type, Remarks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 9. Maintenance Type - big box (multi) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Maintenance Type <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              <Cog size={16} className="text-slate-400" />
            </div>
            <Select
              key={`maintenance-${selectKey}`}
              options={maintenanceOptions}
              value={maintenanceOptions.filter(opt => form.maintenanceType.includes(opt.value))}
              onChange={onMaintenanceChange}
              placeholder="Select types"
              isMulti
              isClearable
              className="text-sm"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '40px',
                  paddingLeft: '28px',
                  borderColor: '#cbd5e1',
                  boxShadow: 'none',
                  borderRadius: '0.75rem',
                  '&:hover': { borderColor: '#94a3b8' }
                }),
                placeholder: (base) => ({ ...base, color: '#9ca3af' }),
              }}
            />
          </div>
        </div>

        {/* 10. Service Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Service Type <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Wrench size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={form.serviceType}
              onChange={(e) => setFormField('serviceType', e.target.value)}
              placeholder="e.g. Oil Change"
              className={inputClass}
            />
          </div>
        </div>

        {/* 11. Remarks */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Remarks
          </label>
          <div className="relative">
            <div className="absolute top-2.5 left-3 pointer-events-none">
              <FileText size={16} className="text-slate-400" />
            </div>
            <textarea
              value={form.remarks}
              onChange={(e) => setFormField('remarks', e.target.value)}
              rows={1}
              placeholder="Any additional notes..."
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition resize-y bg-white"
            />
          </div>
        </div>
      </div>

      {/* Parts Table */}
      <div className="border-t border-slate-200 pt-5">
        <PartsTable parts={parts} setParts={setParts} hideSubline={true} />
      </div>

      {/* Bill / Spare‑part Documents */}
      <div className="border-t border-slate-200 pt-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Paperclip size={16} className="text-slate-500" />
              Bill / Spare‑part Documents <span className="text-red-500">*</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              PNG, JPG/JPEG or PDF. Max 10 MB each, up to 10 files. Adding files always
              appends to the existing ones.
            </p>
          </div>
          <label
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer shrink-0"
          >
            <Upload size={14} />
            Add Document
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              multiple
              hidden
              onChange={handleDocumentInput}
            />
          </label>
        </div>

        {documents.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            No documents added yet — a bill / spare‑part document is required to save.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {documents.map((doc) => {
              const previewUrl = documentPreviewUrl(doc);
              const isImage = isImageDoc(doc);
              return (
                <div
                  key={doc.key}
                  className={`relative group border rounded-xl overflow-hidden bg-slate-50 ${
                    doc.markedForRemoval ? 'border-red-300 opacity-60' : 'border-slate-200'
                  }`}
                >
                  <div className="h-24 w-full bg-slate-100 flex items-center justify-center overflow-hidden">
                    {isImage && previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={doc.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <FileIcon size={26} />
                        <span className="text-[10px] mt-1 uppercase text-slate-400">PDF</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-slate-700 truncate" title={doc.fileName}>
                      {doc.fileName}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-slate-400">
                        {formatFileSize(doc.fileSize)}
                      </span>
                      {doc.markedForRemoval ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-500">
                          <AlertTriangle size={10} /> Will remove
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            doc.existingId != null && !doc.file
                              ? onMarkDocumentRemoval(doc.key)
                              : onRemoveDocument(doc.key)
                          }
                          className="text-slate-400 hover:text-red-500 transition"
                          title="Remove document"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MaintenanceForm);