// src/modules/settings/pages/SettingsPage.tsx
// Settings hub: polished "under construction" placeholder while the
// Settings Centre for DMR Poultries ERP is being developed.

import React from "react";
import {
  BellRing,
  Info,
  KeyRound,
  Lock,
  Palette,
  Settings2,
  UserCog,
  UserRound,
  Wrench,
} from "lucide-react";

const PLANNED_SECTIONS: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { label: "Profile", icon: UserRound },
  { label: "Password & Security", icon: Lock },
  { label: "Appearance", icon: Palette },
  { label: "Users & Roles", icon: UserCog },
  { label: "Permissions", icon: KeyRound },
  { label: "About ERP", icon: Info },
];

const SettingsPage = () => {
  return (
    <div className="w-full px-4 pb-12 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <div className="mx-auto w-full max-w-2xl animate-fade-in-up">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
            {/* Brand accent ribbon */}
            <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-brand-600 to-brand-500" />

            <div className="px-6 py-10 text-center sm:px-10 sm:py-12">
              {/* Icon */}
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.15)] dark:bg-brand-500/10 dark:text-brand-300">
                <Settings2 size={30} className="motion-safe:animate-[spin_12s_linear_infinite]" />
              </div>

              {/* Status pill */}
              <div className="mb-4 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
                  <Wrench size={12} />
                  Under Construction
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-[28px]">
                Settings Centre
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                We&rsquo;re building the Settings centre for DMR Poultries ERP. More
                configuration options are being prepared and will be available in
                upcoming updates.
              </p>

              {/* Planned sections preview */}
              <div className="mx-auto mt-8 max-w-lg">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  On the roadmap
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PLANNED_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    return (
                      <div
                        key={section.label}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-left dark:border-slate-700/80 dark:bg-slate-800/40"
                      >
                        <Icon size={15} className="shrink-0 text-slate-400 dark:text-slate-500" />
                        <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                          {section.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coming soon badge */}
              <div className="mt-8 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm dark:bg-brand-500 dark:text-brand-950">
                  <BellRing size={16} />
                  Coming Soon
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            Need a configuration change in the meantime? Please contact your system
            administrator.
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsPage);
