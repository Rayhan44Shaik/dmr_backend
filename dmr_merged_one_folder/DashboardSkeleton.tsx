// src/modules/dashboard/components/DashboardSkeleton.tsx
// Skeleton loading state for the executive dashboard.

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800 ${className}`} />;
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="space-y-2.5">
        <Block className="h-7 w-72" />
        <Block className="h-4 w-96 max-w-full" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <Block className="h-3.5 w-24" />
              <Block className="h-8 w-8 rounded-lg" />
            </div>
            <Block className="mt-3 h-7 w-28" />
            <Block className="mt-2 h-3 w-36" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <Block className="h-3.5 w-40" />
          <Block className="mt-4 h-[240px] w-full" />
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Block className="h-3.5 w-40" />
          <Block className="mt-4 h-[240px] w-full" />
        </div>
      </div>

      {/* Table + lists */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <Block className="h-3.5 w-40" />
          <Block className="mt-4 h-[220px] w-full" />
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Block className="h-3.5 w-40" />
          <Block className="mt-4 h-[220px] w-full" />
        </div>
      </div>
    </div>
  );
}
