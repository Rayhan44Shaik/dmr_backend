import { Wallet, ShoppingCart, Download, Calculator, Clock, ArrowRight, AlertTriangle } from "lucide-react";

interface OutstandingSummaryProps {
  openingBalance: number;
  approvedSales: number;
  approvedCollections: number;
  pendingApproval: number;
  currentOutstanding: number;
  showSummary: boolean;
  ledgerLoaded: boolean;
  shopName?: string;
  periodLabel: string;
  periodType: "daily" | "weekly";
}

const inr = (n: number) =>
  "₹ " + Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface RowProps {
  title: string;
  value: number;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  subtitle?: string;
  isPositive?: boolean;
  isNegative?: boolean;
  isInfo?: boolean;
}

function Row({ title, value, iconBg, iconColor, icon, subtitle, isPositive, isNegative, isInfo }: RowProps) {
  const valueColor = isNegative
    ? "text-red-700"
    : isPositive
    ? "text-green-700"
    : isInfo
    ? "text-yellow-700"
    : "text-slate-800";

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700">{title}</span>
          {subtitle && (
            <div className="text-[10px] text-slate-400 mt-0.5">{subtitle}</div>
          )}
        </div>
      </div>
      <span className={`text-base font-bold tabular-nums ${valueColor}`}>
        {inr(value)}
      </span>
    </div>
  );
}

export default function OutstandingSummary({
  openingBalance,
  approvedSales,
  approvedCollections,
  pendingApproval,
  currentOutstanding,
  showSummary,
  ledgerLoaded,
  shopName,
  periodLabel,
  periodType,
}: OutstandingSummaryProps) {

  const displayOpeningBalance = ledgerLoaded ? openingBalance : 0;
  const displayApprovedSales = ledgerLoaded ? approvedSales : 0;
  const displayApprovedCollections = ledgerLoaded ? approvedCollections : 0;
  const displayPendingApproval = ledgerLoaded ? pendingApproval : 0;
  const displayCurrentOutstanding = ledgerLoaded ? currentOutstanding : 0;

  const periodSubtitle = periodLabel || (periodType === "weekly" ? "Mon–Sun Business Week" : "Daily Business Period");

  return (
    <div className="h-full w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header section */}
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Calculator size={18} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Outstanding Summary</h2>
        </div>
        {shopName && showSummary && (
          <span className="rounded-full bg-blue-100/80 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
            {shopName}
          </span>
        )}
      </div>

      {/* Period label */}
      <div className="mb-3 px-1 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
        {periodSubtitle}
      </div>

      {/* Financial rows */}
      <div className="space-y-3 animate-in fade-in duration-500">
        <Row
          title="Opening Balance"
          value={displayOpeningBalance}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          icon={<Wallet size={18} />}
          subtitle={periodType === "weekly" ? "Brought forward from previous week" : "Brought forward from previous day"}
        />
        <Row
          title="Approved Sales"
          value={displayApprovedSales}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          icon={<ShoppingCart size={18} />}
          subtitle={periodSubtitle}
          isPositive
        />
        <Row
          title="Approved Collections"
          value={displayApprovedCollections}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          icon={<Download size={18} />}
          subtitle={periodSubtitle}
          isNegative
        />

        <div className="my-2 border-t border-dashed border-slate-200" />

        <Row
          title="Pending Approval"
          value={displayPendingApproval}
          iconBg="bg-amber-100"
          iconColor="text-amber-700"
          icon={<AlertTriangle size={18} />}
          subtitle="Informational only — does not reduce outstanding"
          isInfo
        />

        <div className="my-3 border-t border-dashed border-slate-200" />

        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Calculator size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">
                Current Outstanding
              </span>
              <span className="text-[11px] font-medium text-emerald-700">
                Outstanding Amount (Approved Only)
              </span>
            </div>
          </div>
          <span className="text-xl font-extrabold tabular-nums text-emerald-700">
            {inr(displayCurrentOutstanding)}
          </span>
        </div>

        {/* Calculation hint */}
        {ledgerLoaded && showSummary && (
          <div className="mt-3 pt-3 border-t border-dashed border-slate-200 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 text-violet-600">
              <ArrowRight size={12} />
              <span>Calculation: Opening Balance + Approved Sales - Approved Collections = Current Outstanding</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-600 mt-1">
              <AlertTriangle size={12} />
              <span>Pending Approval ({inr(displayPendingApproval)}) is NOT deducted until approved</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}