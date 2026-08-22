import { memo, useState } from 'react';
import { format, setDate, addMonths, isPast, isAfter } from 'date-fns';
import { CreditCard, Truck } from 'lucide-react';
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from '../../../../shared/ui/paginationStyles';

interface EmiScheduleTableProps {
  emiRecords: any[];
  vehicles: any[];
  simplified?: boolean;
  pageSize?: number;
  showAllVehicles?: boolean;
}

const EmiScheduleTable = ({
  emiRecords,
  vehicles,
  pageSize = 10,
  showAllVehicles = false,
}: EmiScheduleTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const dataSource = showAllVehicles
    ? vehicles.map((vehicle) => {
        const emi = emiRecords.find((e) => e.vehicleId === vehicle.id) || null;
        return { vehicle, emi };
      })
    : emiRecords.map((emi) => {
        const vehicle = vehicles.find((v) => v.id === emi.vehicleId);
        return { vehicle, emi };
      });

  const totalRecords = dataSource.length;
  const totalPages = Math.ceil(totalRecords / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentRecords = dataSource.slice(startIndex, endIndex);

  if (dataSource.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CreditCard className="w-8 h-8 text-slate-300" />
        </div>
        <p className="text-slate-500 font-medium">No vehicles found</p>
        <p className="text-sm text-slate-400">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);
    if (end - start < maxVisible - 1) {
      if (start === 1) end = Math.min(totalPages, start + maxVisible - 1);
      else if (end === totalPages) start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return '-';
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '-';
    }
  };

  const computeNextEMIDate = (vehicle: any) => {
    if (!vehicle?.purchaseDate || !vehicle?.emiDay) return null;
    try {
      const purchaseDate = new Date(vehicle.purchaseDate);
      const day = vehicle.emiDay;
      let nextDate = setDate(purchaseDate, day);
      const today = new Date();
      if (isPast(nextDate) && !isAfter(nextDate, today)) {
        nextDate = addMonths(nextDate, 1);
      }
      while (isPast(nextDate) && !isAfter(nextDate, today)) {
        nextDate = addMonths(nextDate, 1);
      }
      return nextDate;
    } catch {
      return null;
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      active: 'bg-blue-100 text-blue-700 border-blue-200',
      overdue: 'bg-red-100 text-red-700 border-red-200',
      completed: 'bg-green-100 text-green-700 border-green-200',
      paid: 'bg-green-100 text-green-700 border-green-200',
    };
    const defaultStyle = 'bg-gray-100 text-gray-600 border-gray-200';
    const selected = styles[status] || defaultStyle;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${selected}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          status === 'active' ? 'bg-blue-500' :
          status === 'overdue' ? 'bg-red-500' :
          status === 'completed' || status === 'paid' ? 'bg-green-500' :
          'bg-gray-400'
        }`} />
        {status || 'No EMI'}
      </span>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Vehicle</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Purchase Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Purchase Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Total EMIs</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Pending EMIs</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">EMI Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {currentRecords.map(({ vehicle, emi }, index) => {
              const vehicleNumber = vehicle?.vehicleNumber || 'Unknown';
              const purchaseDate = vehicle?.purchaseDate || emi?.startDate;
              const purchaseAmount = vehicle?.purchaseAmount || emi?.loanAmount;
              const totalEMIs = vehicle?.totalEMIs || emi?.totalEMIs;
              const paidEMIs = emi?.paidEMIs ?? 0; // fallback to 0 if not present
              const pendingEMIs = totalEMIs ? totalEMIs - paidEMIs : null;

              let emiDate = emi?.nextEMIDate;
              if (!emiDate && vehicle) {
                const computed = computeNextEMIDate(vehicle);
                if (computed) emiDate = format(computed, 'yyyy-MM-dd');
              }

              const status = emi?.status || (vehicle?.totalEMIs ? 'active' : 'No EMI');

              return (
                <tr key={vehicle?.id || emi?.id || index} className="hover:bg-blue-50/50 transition-colors duration-150 even:bg-slate-50/50">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Truck className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{vehicleNumber}</p>
                        <p className="text-xs text-slate-400">{vehicle?.vehicleType || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">{formatDate(purchaseDate)}</td>
                  <td className="px-4 py-3.5 text-sm font-medium text-slate-700">{formatCurrency(purchaseAmount)}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-600 text-center">{totalEMIs || '-'}</td>
                  <td className="px-4 py-3.5 text-sm font-medium text-slate-700 text-center">
                    {pendingEMIs !== null ? pendingEMIs : '-'}
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium text-slate-700">
                    {status === 'completed' || status === 'paid' ? (
                      <span className="text-green-600">Completed</span>
                    ) : (
                      formatDate(emiDate)
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shouldShowPagination(totalRecords) && (
        <div className={paginationBarClass}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className={paginationNavBtnClass}
          >
            Previous
          </button>
          {getPageNumbers().map((page) => (
            <button
              key={page}
              onClick={() => goToPage(page)}
              className={paginationPageBtnClass(page === currentPage)}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(EmiScheduleTable);