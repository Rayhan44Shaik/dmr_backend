// src/modules/dashboard/components/ChartCard.tsx
// Card shell for the analytics section.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: { label: string; path: string };
  children: ReactNode;
  className?: string;
}

export default function ChartCard({ title, subtitle, action, children, className = "" }: ChartCardProps) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
        {action && (
          <Link
            to={action.path}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {action.label}
            <ArrowUpRight size={13} />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
