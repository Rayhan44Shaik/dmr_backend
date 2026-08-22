import React from 'react';

/** Immediate Fleet content placeholder — shown before a lazy tab chunk paints. */
export default function FleetTabSkeleton() {
  return (
    <div className="w-full space-y-4" aria-busy="true" aria-label="Loading Fleet">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
          <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-3 p-6">
          <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
