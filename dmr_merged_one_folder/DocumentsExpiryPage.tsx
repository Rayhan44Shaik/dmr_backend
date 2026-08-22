import { memo, useState, useCallback, useMemo } from 'react';
import { useDocumentsData } from '../hooks/useDocumentsData';
import { DOCUMENT_LABELS, DOCUMENT_TYPE_ORDER } from '../utils/constants';
import ErrorBoundary from '../../../components/common/ErrorBoundary';
import DocumentSummaryTiles from '../components/documents/DocumentSummaryTiles';
import DocumentMatrix from '../components/documents/DocumentMatrix';
import DocumentEditModal from '../components/documents/DocumentEditModal';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import { RefreshCw, Search, X, FileText, AlertCircle } from 'lucide-react';
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from '../../../shared/ui/paginationStyles';

const PAGE_SIZE = 10;

const getNearestExpiry = (row: any): number => {
  const docMap = row.docMap || {};
  const dates = Object.values(docMap)
    .map((doc: any) => {
      if (doc && typeof doc === 'object') {
        return doc.expiryDate;
      }
      return undefined;
    })
    .filter((date): date is string => !!date)
    .map((date) => new Date(date).getTime());
  if (dates.length === 0) return Infinity;
  return Math.min(...dates);
};

interface DocumentsExpiryPageProps {
  embedded?: boolean;
}

const DocumentsExpiryPage = ({ embedded = false }: DocumentsExpiryPageProps) => {
  const {
    totalCounts,
    statusCounts,
    matrix,
    getStatusColor,
    formatExpiryDate,
    refetch,
    updateDocument,
    loading,
    error,
    hasData,
  } = useDocumentsData();
  const { showNotification } = useSafeNotification();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editData, setEditData] = useState<{ vehicle: any; docMap: any } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMatrix = useMemo(() => {
    if (!searchTerm.trim()) return matrix;
    return matrix.filter((row: any) =>
      row.vehicle.vehicleNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [matrix, searchTerm]);

  const sortedMatrix = useMemo(() => {
    return [...filteredMatrix].sort((a, b) => getNearestExpiry(a) - getNearestExpiry(b));
  }, [filteredMatrix]);

  const totalPages = Math.ceil(sortedMatrix.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedMatrix = sortedMatrix.slice(startIndex, startIndex + PAGE_SIZE);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refetch?.();
      showNotification('Data refreshed successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh data', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, isRefreshing, showNotification]);

  const handleEdit = useCallback((vehicle: any, docMap: any) => {
    const normalizedVehicle = {
      ...vehicle,
      id: String(vehicle.id),
    };
    setEditData({ vehicle: normalizedVehicle, docMap });
  }, []);

  const handleCloseEdit = useCallback(() => setEditData(null), []);

  const handleSaveEdit = useCallback(
    async (
      vehicleId: string | number,
      updates: Record<
        string,
        { expiryDate?: string; documentNumber?: string; validFrom?: string; remarks?: string }
      >,
      files?: Record<string, File>,
      removes?: Record<string, boolean>
    ) => {
      try {
        await updateDocument(vehicleId, updates, files, removes);
        showNotification('Document dates updated successfully', 'success');
        setEditData(null);
      } catch (error: any) {
        showNotification(error?.message || 'Failed to update documents', 'error');
      }
    },
    [updateDocument, showNotification]
  );

  const renderPagination = () => {
    if (!shouldShowPagination(sortedMatrix.length)) return null;
    const pageNumbers = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

    return (
      <div className={paginationBarClass}>
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={paginationNavBtnClass}
        >
          Previous
        </button>
        {pageNumbers.map((num) => (
          <button
            key={num}
            onClick={() => handlePageChange(num)}
            className={paginationPageBtnClass(num === currentPage)}
          >
            {num}
          </button>
        ))}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={paginationNavBtnClass}
        >
          Next
        </button>
      </div>
    );
  };

  const editableDocTypes = DOCUMENT_TYPE_ORDER as unknown as string[];

  return (
    <ErrorBoundary>
      <div className={`w-full space-y-6 animate-in fade-in duration-500 ${
        embedded ? '' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50/50 min-h-screen'
      }`}>
        {loading && !hasData && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center text-sm font-semibold text-slate-500 flex items-center justify-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" /> Loading permit documents...
          </div>
        )}

        {!loading && error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-sm text-rose-700 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <button onClick={handleRefresh} className="px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors shadow-sm">
              Retry
            </button>
          </div>
        )}

        <DocumentSummaryTiles
          counts={totalCounts}
          statusCounts={statusCounts}
          docLabels={DOCUMENT_LABELS}
        />

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-100 overflow-hidden">

          {/* Header Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight">Vehicle Document Status</h3>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Search Bar */}
              <div className="relative group flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by vehicle..."
                  className="w-full sm:w-72 pl-9 pr-8 py-2 text-sm border border-slate-200/80 rounded-xl bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm text-slate-700 placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-md transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-[38px] px-3.5 inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 text-slate-600 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
                <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Table Area */}
          <div className="w-full overflow-x-auto">
            {paginatedMatrix.length > 0 ? (
              <DocumentMatrix
                matrix={paginatedMatrix}
                docTypes={DOCUMENT_TYPE_ORDER as unknown as string[]}
                docLabels={DOCUMENT_LABELS}
                getStatusColor={getStatusColor}
                formatExpiryDate={formatExpiryDate}
                onEdit={handleEdit}
              />
            ) : (
              <div className="py-16 text-center text-slate-400 text-sm font-medium">
                No vehicles found matching your criteria.
              </div>
            )}
          </div>

          {renderPagination()}
        </div>

        {editData && (
          <DocumentEditModal
            vehicle={editData.vehicle}
            docMap={editData.docMap}
            docTypes={editableDocTypes}
            onClose={handleCloseEdit}
            onSave={handleSaveEdit}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default memo(DocumentsExpiryPage);