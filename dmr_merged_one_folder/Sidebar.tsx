// src/ui/Sidebar/Sidebar.tsx
// Premium application sidebar: permanently expanded, active states,
// mobile drawer, planned-module pills.

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { NAV_SECTIONS, type NavChild } from "../../routes/navigation";
import BrandMark from "../BrandMark";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function isChildActive(child: NavChild, pathname: string, search: string): boolean {
  const childUrl = child.path;
  const current = pathname + search;
  return current === childUrl;
}

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search;

  // Close the mobile drawer on route change.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCloseMobile]);

  const navContent = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-none">
      {NAV_SECTIONS.map((section) => {
        const SectionIcon = section.icon;
        return (
          <div key={section.id} className="mb-5">
            {/* Section label */}
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
              {section.label}
            </p>

            <ul className="space-y-0.5">
              {section.children.map((child) => {
                const Icon = child.icon ?? SectionIcon;
                const active = isChildActive(child, pathname, search);

                return child.soon ? (
                  <li key={child.label}>
                    <span
                      className="group relative flex w-full cursor-default items-center gap-2.5 rounded-lg px-3 py-2 pr-2 text-sm text-slate-400 dark:text-slate-600"
                      title={child.soon ? `${child.label} — coming soon` : child.label}
                    >
                      <Icon size={17} className="shrink-0" />
                      <span className="flex-1 truncate text-left">{child.label}</span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        Soon
                      </span>
                    </span>
                  </li>
                ) : (
                  <li key={child.label}>
                    <Link
                      to={child.path}
                      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors duration-150 ${
                        active
                          ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-500/10 dark:text-brand-300"
                          : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200"
                      }`}
                    >
                      {/* Active accent bar */}
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600 dark:bg-brand-400" />
                      )}
                      <Icon
                        size={17}
                        className={`shrink-0 ${
                          active
                            ? "text-brand-700 dark:text-brand-300"
                            : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                        }`}
                      />
                      <span className="flex-1 truncate text-left">{child.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const brandHeader = (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/80 px-5 dark:border-slate-800">
      <BrandMark />
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          DMR Poultries
        </h1>
        <p className="truncate text-[11px] font-medium text-slate-400 dark:text-slate-500">
          ERP Management System
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="relative z-30 hidden h-screen w-[264px] shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        {brandHeader}
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in"
            onClick={onCloseMobile}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-slate-200 bg-white shadow-pop animate-scale-in dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <BrandMark />
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                    DMR Poultries
                  </h1>
                  <p className="truncate text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    ERP Management System
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}