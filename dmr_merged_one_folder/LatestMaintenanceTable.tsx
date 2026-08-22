import { memo, useState, useMemo, useEffect, useRef } from 'react';
import {
  Eye, Edit, Trash2, CheckCircle2,
  Search, Paperclip, Hash, Calendar, Wrench, Store, User, Gauge, Clock, Wallet, History, X
} from 'lucide-react';
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from '../../../../shared/ui/paginationStyles';
import { usePendingDelete } from '../../../../hooks/usePendingDelete';
import { PendingDeleteNotification } from '../../../../components/common/PendingDeleteNotification';
import type { MaintenanceEvent } from '../../types';

export type ViewMode = 'pending' | 'approved' | 'deleted';

interface LatestMaintenanceTableProps {
  records: MaintenanceEvent[];
  vehicles: any[];
  viewMode: ViewMode;
  onView: (record: MaintenanceEvent) => void;
  onEdit: (record: MaintenanceEvent) => void;
  onDelete: (record: MaintenanceEvent) => void;
  onApprove: (record: MaintenanceEvent) => void;
  isEditable: (createdAt?: string) => boolean;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onToggleView: (mode: ViewMode) => void;
}

// Helper to safely format dates
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  // Try to grab just the YYYY-MM-DD part if it's an ISO string
  const rawDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const LatestMaintenanceTable = ({
  records,
  vehicles,
  viewMode,
  onView,
  onEdit,
  onDelete,
  onApprove,
  isEditable,
  currentPage,
  onPageChange,
  pageSize = 5,
  onToggleView,
}: LatestMaintenanceTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { requestDelete, cancel, isPending, pendingItems } = usePendingDelete<string>(async (id) => {
    const record = records.find((item) => item.id === id);
    if (record) await Promise.resolve(onDelete(record));
  });

  const validRecords = records.filter((r): r is MaintenanceEvent & { id: string } => !!r.id);

  /** Resolve the registered vehicle number from the Vehicle Master first; fall
   * back to the snapshot stored on the record. NEVER show "Unknown" when a
   * valid vehicle exists. */
  const resolveVehicleNumber = (rec: MaintenanceEvent): string => {
    const vehicle = vehicles.find((v: any) => String(v.id) === String(rec.vehicleId));
    if (vehicle?.vehicleNumber) return String(vehicle.vehicleNumber);
    if (rec.vehicleNo) return String(rec.vehicleNo);
    return '—';
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return validRecords;
    const term = searchTerm.trim().toLowerCase();
    return validRecords.filter(rec => {
      const vehicleNumber = resolveVehicleNumber(rec);
      const searchable = [
        rec.billNumber,
        vehicleNumber,
        rec.vehicleNo,
        rec.maintenanceType,
        rec.serviceType,
        rec.garage,
        rec.mechanic,
        rec.driverName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(term);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validRecords, searchTerm, vehicles]);

  const totalRecords = filteredRecords.length;
  const startIndex = (currentPage - 1) * pageSize + 1;
  void startIndex;

  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const actualTotalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    if (totalRecords > 0 && currentPage > actualTotalPages) {
      onPageChange(1);
    }
  }, [actualTotalPages, currentPage, onPageChange, totalRecords]);

  const handleRowClick = (id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  };

  const selectedRecord = filteredRecords.find(r => r.id === selectedId) || null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setSelectedId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFirstMaintenanceType = (types: string): string => {
    if (!types) return '-';
    const parts = types.split(',').map(s => s.trim());
    return parts[0] || '-';
  };

  const getAllMaintenanceTypes = (types: string): string => {
    return types || '-';
  };

  const getEmptyText = () => {
    if (searchTerm) return 'No matching records found.';
    if (viewMode === 'pending') return 'No pending maintenance records.';
    if (viewMode === 'approved') return 'No approved maintenance records.';
    return 'No deleted records.';
  };

  const isSelectedRecordApproved = selectedRecord?.paymentStatus === 'approved';
  const canApprove = viewMode !== 'deleted' && selectedRecord && !isSelectedRecordApproved;

  return (
    <div ref={tableRef} className="bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-100 overflow-hidden">
      {/* Header with toggle buttons & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center gap-4">
          <h4 className="text-sm font-bold text-slate-800 tracking-wide">
            Recent Vehicle Maintenance
          </h4>
          <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200/80 rounded-full shadow-sm">
            {totalRecords}
          </span>
          <div className="flex items-center p-0.5 ml-2 border border-slate-200/80 rounded-lg overflow-hidden bg-slate-50 shadow-sm">
            <button
              onClick={() => onToggleView('pending')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'pending'
                  ? 'bg-orange-100 text-orange-700 shadow-sm'
                  : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => onToggleView('approved')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'approved'
                  ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                  : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => onToggleView('deleted')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'deleted'
                  ? 'bg-rose-100 text-rose-700 shadow-sm'
                  : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              Deleted
            </button>
          </div>
        </div>

        {/* Action buttons & Enhanced Search */}
        <div className="flex items-center gap-2">
          {selectedRecord && (
            <div className="flex items-center gap-1.5 mr-2">
              <button
                onClick={(e) => { e.stopPropagation(); onView(selectedRecord); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all shadow-sm"
              >
                <Eye size={14} /> View
              </button>
              {viewMode !== 'deleted' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(selectedRecord); }}
                    disabled={!isEditable(selectedRecord.date)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border ${
                      isEditable(selectedRecord.date)
                        ? 'text-slate-700 bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                        : 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-70'
                    }`}
                  >
                    <Edit size={14} /> Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (selectedRecord.id) requestDelete(selectedRecord.id, { label: `Deleting maintenance "${resolveVehicleNumber(selectedRecord)}"` }); setSelectedId(null); }}
                    disabled={!isEditable(selectedRecord.date) || isPending(selectedRecord.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border ${
                      isEditable(selectedRecord.date)
                        ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 shadow-sm'
                        : 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-70'
                    }`}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  {canApprove && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onApprove(selectedRecord); setSelectedId(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm border border-emerald-700 transition-all"
                    >
                      <CheckCircle2 size={14} /> Approve
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedId(null);
                onPageChange(1);
              }}
              placeholder="Search MNT no, vehicle, details..."
              className="w-full sm:w-72 pl-9 pr-8 py-1.5 text-sm border border-slate-200/80 rounded-xl bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-slate-700 placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedId(null);
                  onPageChange(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-md transition-colors"
                title="Clear Search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {totalRecords === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <History size={24} className="mx-auto mb-2 opacity-50" />
          {getEmptyText()}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left border-collapse">
              <thead className="bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Hash size={13} className="text-slate-400 shrink-0" />
                      <span>MNT. NO</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-blue-500 shrink-0" />
                      <span>Date</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Wrench size={13} className="text-purple-500 shrink-0" />
                      <span>Maintenance Details</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Store size={13} className="text-amber-500 shrink-0" />
                      <span>Garage</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <User size={13} className="text-indigo-500 shrink-0" />
                      <span>Mechanic</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <Gauge size={13} className="text-orange-500 shrink-0" />
                      <span>Current KM</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <Clock size={13} className="text-cyan-500 shrink-0" />
                      <span>Next Service</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <Wallet size={13} className="text-emerald-600 shrink-0" />
                      <span>Total Cost</span>
                    </div>
                  </th>
                  {viewMode === 'deleted' && (
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <History size={13} className="text-rose-500 shrink-0" />
                        <span>Deleted At</span>
                      </div>
                    </th>
                  )}
                  <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <Paperclip size={13} className="text-slate-500 shrink-0" />
                      <span>Docs</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedRecords.map((rec) => {
                  const isSelected = selectedId === rec.id;
                  const firstType = getFirstMaintenanceType(rec.maintenanceType);
                  const allTypes = getAllMaintenanceTypes(rec.maintenanceType);
                  const isApproved = rec.paymentStatus === 'approved';
                  const isDeleted = viewMode === 'deleted';
                  const typeCount = rec.maintenanceType
                    ? rec.maintenanceType.split(',').filter(s => s.trim()).length
                    : 0;

                  return (
                    <tr
                      key={rec.id}
                      className={`group hover:bg-slate-50/80 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/80 shadow-inner border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                      }`}
                      onClick={() => handleRowClick(rec.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-start gap-1.5">
                          <div className="w-[13px] shrink-0 mt-0.5" />
                          <div className="flex flex-col items-start gap-1">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-md px-2 py-0.5 border ${
                              isDeleted
                                ? 'bg-rose-50 text-rose-700 border-rose-100/80'
                                : isApproved
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100/80'
                                  : 'bg-orange-50 text-orange-700 border-orange-100/80'
                            }`}>
                              {rec.billNumber || '-'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[13px] shrink-0" />
                          <span className="text-xs font-medium text-slate-600">
                            {formatDate((rec as any).date || rec.createdAt)}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[13px] shrink-0" />
                          <span title={allTypes} className="text-xs text-slate-600 cursor-help">
                            {firstType}
                            {typeCount > 1 && (
                              <span className="text-xs text-slate-400 ml-1">
                                +{typeCount - 1} more
                              </span>
                            )}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[13px] shrink-0" />
                          <span className="text-xs text-slate-600">{rec.garage || '-'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[13px] shrink-0" />
                          <span className="text-xs text-slate-600">{rec.mechanic || '-'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                        {rec.currentKM.toLocaleString()}
                      </td>

                      <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap tabular-nums">
                        {rec.nextServiceKM?.toLocaleString() || '-'}
                      </td>

                      <td className="px-4 py-3 text-right text-xs font-bold text-blue-700 whitespace-nowrap tabular-nums">
                        ₹{rec.totalCost?.toFixed(2) || '0.00'}
                      </td>

                      {isDeleted && (
                        <td className="px-4 py-3 text-left whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-[13px] shrink-0" />
                            <span className="text-xs text-slate-500">
                              {rec.deletedAt ? new Date(rec.deletedAt).toLocaleString() : '-'}
                            </span>
                          </div>
                        </td>
                      )}

                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {Array.isArray(rec.documents) && rec.documents.length > 0 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onView(rec); }}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200/80 rounded-lg hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
                            title={`${rec.documents.length} document${rec.documents.length > 1 ? 's' : ''} attached`}
                          >
                            <Paperclip size={12} />
                            {rec.documents.length}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {shouldShowPagination(totalRecords) && (
            <div className={paginationBarClass}>
              <button
                onClick={() => { setSelectedId(null); onPageChange(currentPage - 1); }}
                disabled={currentPage === 1}
                className={paginationNavBtnClass}
              >
                Previous
              </button>
              <span className={paginationPageBtnClass(true)}>
                {currentPage}
              </span>
              <button
                onClick={() => { setSelectedId(null); onPageChange(currentPage + 1); }}
                disabled={currentPage === actualTotalPages}
                className={paginationNavBtnClass}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
};

export default memo(LatestMaintenanceTable);