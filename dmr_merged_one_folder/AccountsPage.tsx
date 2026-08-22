// src/modules/accounts/pages/AccountsPage.tsx

import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

import { PaymentBookPage } from './PaymentBookPage';
import { FarmerPaymentPage } from './FarmPaymentPage';
import { NewPaymentPage } from './NewPaymentPage';
import MarketRatePage from './MarketRatePage';
import SummaryPage from './SummaryPage';

// ---- Reusable "Coming Soon" Component ----
const ComingSoonTab = ({ title }: { title: string }) => (
  <div className="w-full flex items-center justify-center animate-fade-in min-h-[50vh]">
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-card p-12 text-center max-w-md w-full mx-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-4 dark:bg-slate-800 dark:text-slate-500">
        <BarChart3 size={24} />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-2 dark:text-slate-100">{title}</h2>
      <p className="text-sm text-slate-500 leading-relaxed dark:text-slate-400">
        This module is being finalised and will be available in an upcoming update.
      </p>
    </div>
  </div>
);

const FuelPaymentPage = () => <ComingSoonTab title="Fuel Payment" />;
const VehiclePaymentPage = () => <ComingSoonTab title="Vehicle Payment" />;

const tabComponents: Record<string, React.ComponentType<{ embedded?: boolean }>> = {
  'paid-payments': PaymentBookPage,
  'market-rate': MarketRatePage,
  'summary': SummaryPage,
  'farm-payment': FarmerPaymentPage,
  'new-payments': NewPaymentPage,
  'fuel-payment': FuelPaymentPage,
  'vehicle-payment': VehiclePaymentPage,
};

function AccountsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const activeTab = searchParams.get('tab') || 'paid-payments';

  useEffect(() => {
    if (!searchParams.get('tab')) {
      navigate('/accounts?tab=paid-payments', { replace: true });
    }
  }, [location.search, navigate, searchParams]);

  const ActiveComponent = useMemo(() => {
    return tabComponents[activeTab] ?? PaymentBookPage;
  }, [activeTab]);

  return (
    <div className="w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <ActiveComponent embedded={true} />
      </div>
    </div>
  );
}

export default React.memo(AccountsPage);
