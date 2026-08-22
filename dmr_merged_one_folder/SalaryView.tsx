// src/modules/staff/components/salary/SalaryView.tsx

import { X, FileText, Lock, Info } from "lucide-react";
import type { SalaryRecord } from "../../types/staffDashboard";

export type SalaryViewProps = {
  record: SalaryRecord;
  onClose: () => void;
  formatCurrency?: (amount: number) => string;
};

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm ${strong ? "font-bold text-slate-800" : "font-medium text-slate-700"}`}>
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  tone = "text-slate-500",
}: {
  title: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h4 className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${tone}`}>{title}</h4>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

export function SalaryView({ record, onClose, formatCurrency = (amt) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amt || 0)
}: SalaryViewProps) {
  if (!record) return null;

  const monthLabel = (() => {
    if (!record.month) return "";
    const [y, m] = record.month.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString("default", { month: "long", year: "numeric" });
  })();

  const correctionOpen =
    record.status === "Paid" &&
    record.correctionWindowDaysRemaining != null &&
    record.correctionWindowDaysRemaining > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">{record.employeeName}</h3>
              <p className="text-xs text-slate-500">
                {record.department} · {monthLabel || record.month}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block mb-1">Employee ID</span>
            <span className="font-bold text-slate-800">#{record.employeeId}</span>
          </div>
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block mb-1">Salary Month</span>
            <span className="font-bold text-slate-800">{record.month}</span>
          </div>
        </div>

        <Section title="Day Summary" tone="text-indigo-600">
          <Row label="Working Days" value={record.workingDays ?? "—"} strong />
          <Row label="Present Days" value={record.presentDays ?? "—"} />
          <Row label="Leave Days" value={record.leaveDays ?? "—"} />
          <Row label="Weekly Off" value={record.weeklyOffDays ?? "—"} />
        </Section>

        <Section title="Earnings" tone="text-emerald-600">
          <Row label="Basic" value={formatCurrency(record.basicSalary)} />
          <Row label="Overtime" value={formatCurrency(record.overtime)} />
          <Row label="Incentives" value={formatCurrency(record.incentives)} />
          <Row label="Fuel Allowance" value={formatCurrency(record.fuelAllowance)} />
          <Row label="Night Allowance" value={formatCurrency(record.nightAllowance)} />
          <Row label="Gross" value={formatCurrency(record.totalGross)} strong />
        </Section>

        <Section title="Deductions" tone="text-rose-600">
          <Row label="Leave" value={formatCurrency(record.leaveDeduction)} />
          <Row label="Advance" value={formatCurrency(record.advanceRecovery)} />
          <Row label="Loan EMI" value={formatCurrency(record.loanEMI)} />
          <Row label="Late Penalty" value={formatCurrency(record.latePenalty)} />
          <Row label="Other" value={formatCurrency(record.otherDeductions)} />
          <Row label="Total Deductions" value={formatCurrency(record.totalDeductions)} strong />
        </Section>

        <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-xl flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-700">Net Salary</span>
          <span className="text-xl font-extrabold text-emerald-800">{formatCurrency(record.netSalary)}</span>
        </div>

        <Section title="Payment" tone="text-slate-500">
          <Row label="Status" value={record.status} strong />
          <Row label="Payment Date" value={record.paymentDate ?? "—"} />
          <Row label="Payment Reference" value={record.paymentRef ?? "—"} />
          {record.submittedBy && <Row label="Submitted By" value={record.submittedBy} />}
          {record.submittedAt && <Row label="Submitted At" value={new Date(record.submittedAt).toLocaleString()} />}
        </Section>

        {record.monthClosed && (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center gap-2">
            <Lock size={14} className="shrink-0" />
            <span>This payroll month is closed. All records are permanently locked.</span>
          </div>
        )}
        {record.status === "Paid" && !record.monthClosed && (
          <div
            className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
              correctionOpen
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : "bg-slate-100 border border-slate-200 text-slate-600"
            }`}
          >
            {correctionOpen ? <Info size={14} className="shrink-0" /> : <Lock size={14} className="shrink-0" />}
            <span>
              {correctionOpen
                ? `Correction window open — ${record.correctionWindowDaysRemaining} day(s) remaining to mark unpaid.`
                : "Correction window expired — paid salary is permanently locked."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
