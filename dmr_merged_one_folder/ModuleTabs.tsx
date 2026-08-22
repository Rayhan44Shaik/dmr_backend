// src/ui/ModuleTabs.tsx
// Shared sticky tab bar used by every module shell page.
// Brand-styled: active tab gets an emerald tint; the bar scrolls on small screens.

import { useRef, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface ModuleTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Optional icon colour class for the inactive state. */
  color?: string;
  /** Small badge shown next to the label. */
  badge?: ReactNode;
}

interface ModuleTabsProps {
  tabs: ModuleTab[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Optional content rendered on the right side of the bar. */
  right?: ReactNode;
  className?: string;
}

export default function ModuleTabs({ tabs, activeKey, onChange, right, className = "" }: ModuleTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view on small screens.
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-tab-key="${activeKey}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeKey]);

  return (
    <div className={`sticky top-0 z-30 w-full bg-slate-100/80 py-2 backdrop-blur-md dark:bg-slate-950/80 ${className}`}>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div
          ref={containerRef}
          className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-none [scroll-behavior:smooth]"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeKey === tab.key;
            return (
              <button
                key={tab.key}
                data-tab-key={tab.key}
                type="button"
                onClick={() => onChange(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                  isActive
                    ? "bg-brand-50 font-semibold text-brand-800 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.18)] dark:bg-brand-500/10 dark:text-brand-300"
                    : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                }`}
              >
                {Icon && <Icon size={16} className={isActive ? "text-brand-700 dark:text-brand-300" : tab.color ?? "text-slate-400"} />}
                <span>{tab.label}</span>
                {tab.badge}
              </button>
            );
          })}
        </div>
        {right && <div className="flex shrink-0 items-center">{right}</div>}
      </div>
    </div>
  );
}
