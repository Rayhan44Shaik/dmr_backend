/* DEFERRED / FUTURE WORK — not part of current Fleet Operations production scope. */
/*import { memo, useState } from 'react';
import { useToast } from '../hooks/useToast';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ReportCard from '../components/reports/ReportCard';
import ReportFilters from '../components/reports/ReportFilters';
import { 
  Fuel, Wrench, DollarSign, FileText, FileSpreadsheet, 
  BarChart3, Calendar, Gauge, AlertTriangle, Package, 
  Truck, ClipboardList 
} from 'lucide-react';

const reports = [
  { id: 'fuel', title: 'Fuel Report', description: 'Fuel consumption and cost per vehicle', icon: Fuel },
  { id: 'maintenance', title: 'Maintenance Report', description: 'Service history and costs', icon: Wrench },
  { id: 'toll', title: 'Toll (FASTag) Report', description: 'Toll transactions and expenses', icon: DollarSign },
  { id: 'emi', title: 'EMI Report', description: 'Loan and repayment schedule', icon: FileText },
  { id: 'expense', title: 'Expense Report', description: 'All vehicle costs consolidated', icon: FileSpreadsheet },
  { id: 'mileage', title: 'Mileage Report', description: 'Fuel efficiency analysis', icon: Gauge },
  { id: 'document', title: 'Document Expiry Report', description: 'Compliance status', icon: Calendar },
  { id: 'service', title: 'Service Due Report', description: 'Upcoming maintenance', icon: Wrench },
  { id: 'breakdown', title: 'Breakdown Report', description: 'Vehicle breakdowns and repairs', icon: AlertTriangle },
  { id: 'tyre', title: 'Tyre Report', description: 'Tyre usage and replacement', icon: Package },
  { id: 'utilization', title: 'Vehicle Utilization Report', description: 'Trip and mileage utilization', icon: Truck },
  { id: 'summary', title: 'Fleet Summary Report', description: 'Overall fleet performance', icon: ClipboardList },
];

interface VehicleReportsPageProps {
  embedded?: boolean;
}

const VehicleReportsPage = ({ embedded = false }: VehicleReportsPageProps) => {
  const { showToast } = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleExport = (reportId: string, format: 'pdf' | 'excel') => {
    showToast(`Exporting ${reportId} as ${format.toUpperCase()}...`, 'info');
    // In real implementation, fetch data for that report and call export utils
  };

  const handleReset = () => {
    setFromDate('');
    setToDate('');
  };

  return (
    <ErrorBoundary>
      {-- Removed max-w constraints to perfectly adapt to embedded contexts }
      <div className={`w-full space-y-6 animate-in fade-in duration-500 ${
        embedded ? '' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
      }`}>
        {--Heading removed }

        {-- Filters }
        <ReportFilters
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onReset={handleReset}
        />

        {-- Report Grid }
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              id={report.id}
              title={report.title}
              description={report.description}
              icon={report.icon}
              onExport={handleExport}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(VehicleReportsPage);*/

import { memo } from 'react';
import ErrorBoundary from '../components/common/ErrorBoundary';

interface VehicleReportsPageProps {
  embedded?: boolean;
}

const VehicleReportsPage = ({ embedded = false }: VehicleReportsPageProps) => {
  return (
    <ErrorBoundary>
      <div className={`w-full flex items-center justify-center animate-in fade-in duration-500 ${
        embedded ? 'min-h-[60vh]' : 'px-4 md:px-8 py-6 md:py-8 bg-slate-50 min-h-screen'
      }`}>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center max-w-md w-full mx-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 border border-blue-100 shadow-sm animate-bounce">
            🚧
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Vehicle Reports - Coming Soon</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            This module is currently being enhanced and will be made fully available after the upcoming updates.
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(VehicleReportsPage);