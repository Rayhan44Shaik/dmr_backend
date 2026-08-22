// src/ui/Header/Header.tsx
// Premium top header: breadcrumbs, global search (command palette),
// notifications, quick actions, theme toggle and user profile.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Truck,
  UserRound,
} from "lucide-react";
import { QUICK_ACTIONS, resolveRoute } from "../../routes/navigation";
import { useTheme } from "../../providers/ThemeProvider";
import { useAuth } from "../../providers/AuthProvider";
import { collectionService } from "../../modules/operations/collections/services/collectionService";
import { tripService } from "../../modules/operations/vehicle-trips/services/tripService";
import { getDocuments } from "../../modules/fleet-operations/services/storage";
import { getCurrentUser } from "../../modules/settings/services";
import { formatINR, formatRelativeTime } from "../../utils/format";

interface HeaderProps {
  onMenuClick: () => void;
  onOpenCommand: () => void;
}

interface NotificationItem {
  id: string;
  icon: LucideIcon;
  tone: "danger" | "warning" | "info" | "success";
  title: string;
  description: string;
  time: string;
  path: string;
}

/* ------------------------------------------------------------------ */
/*  Dropdown shell with outside-click + Escape handling                */
/* ------------------------------------------------------------------ */
function Dropdown({
  trigger,
  children,
  align = "right",
  width = "w-80",
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = () => setOpen((prev) => !prev);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger(open, toggle)}
      {open && (
        <div
          className={`absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-800 ${
            align === "right" ? "right-0" : "left-0"
          } ${width}`}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  badge,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  badge?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${className}`}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-800">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */
function Header({ onMenuClick, onOpenCommand }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  const route = useMemo(() => resolveRoute(location.pathname + location.search), [location.pathname, location.search]);

  const user = getCurrentUser();
  const displayName = "Owner";
  const displayRole = "Owner";
  const initials = "O";

  /* ----- Data-driven notifications (existing services only) ----- */
  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    try {
      const pending = collectionService.getPendingCollections();
      const overdue = pending.filter((p) => p.overdueDays > 0);
      const totalPending = pending.reduce((sum, p) => sum + (p.currentPending || 0), 0);
      if (overdue.length > 0) {
        items.push({
          id: "overdue-collections",
          icon: ShieldAlert,
          tone: "danger",
          title: `${overdue.length} ${overdue.length === 1 ? "collection is" : "collections are"} overdue`,
          description: `${formatINR(overdue.reduce((s, p) => s + (p.currentPending || 0), 0))} waiting to be collected`,
          time: formatRelativeTime(new Date()),
          path: "/operations?tab=pending-collections",
        });
      } else if (pending.length > 0) {
        items.push({
          id: "pending-collections",
          icon: Clock3,
          tone: "info",
          title: `${pending.length} shops with pending collections`,
          description: `${formatINR(totalPending)} outstanding across shops`,
          time: formatRelativeTime(new Date()),
          path: "/operations?tab=pending-collections",
        });
      }

      const trips = tripService.getAll();
      const inProgress = trips.filter((t) => t.status === "Pending");
      if (inProgress.length > 0) {
        items.push({
          id: "trips-in-progress",
          icon: Truck,
          tone: "info",
          title: `${inProgress.length} ${inProgress.length === 1 ? "trip is" : "trips are"} in progress`,
          description: inProgress.slice(0, 2).map((t) => t.vehicleNo).join(", ") + (inProgress.length > 2 ? " …" : ""),
          time: formatRelativeTime(new Date()),
          path: "/operations?tab=trip-list",
        });
      }

      const docs = getDocuments();
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      const parseDocDate = (raw: string): Date | null => {
        if (!raw) return null;
        // dd/MM/yyyy (documents store) or ISO
        const ddMm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddMm) return new Date(Number(ddMm[3]), Number(ddMm[2]) - 1, Number(ddMm[1]));
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const expiring = docs.filter((d) => {
        const date = parseDocDate((d as { expiryDate?: string }).expiryDate ?? "");
        return date != null && date <= soon && date >= new Date();
      });
      if (expiring.length > 0) {
        items.push({
          id: "documents-expiring",
          icon: ShieldAlert,
          tone: "warning",
          title: `${expiring.length} document${expiring.length === 1 ? "" : "s"} expiring within 30 days`,
          description: expiring.map((d) => (d as { vehicleNo?: string }).vehicleNo || "Vehicle").join(", "),
          time: formatRelativeTime(new Date()),
          path: "/fleet?tab=permits",
        });
      }
    } catch {
      /* storage unavailable — skip notifications */
    }
    return items;
    // location.key changes on every navigation — recomputes alerts after data entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const title = route.page?.label ?? route.section?.label ?? "";
  const sectionLabel = route.section?.label;

  const handleSignOut = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900/85">
      {/* Mobile menu */}
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        aria-label="Open navigation menu"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb + title */}
      <div className="min-w-0 flex-1">
        {sectionLabel && route.page && (
          <div className="hidden items-center gap-1.5 text-xs font-medium text-slate-400 sm:flex dark:text-slate-500">
            <Link
              to={route.section?.children[0]?.path ?? "/dashboard"}
              className="transition-colors hover:text-slate-600 dark:hover:text-slate-300"
            >
              {sectionLabel}
            </Link>
            <ChevronRight size={12} />
            <span className="truncate text-slate-500 dark:text-slate-400">{title}</span>
          </div>
        )}
        <h1 className="truncate text-[16px] font-semibold tracking-tight text-slate-900 sm:text-[17px] dark:text-white">
          {title || "DMR Poultries"}
        </h1>
      </div>

      {/* Global search — opens the command palette */}
      <button
        type="button"
        onClick={onOpenCommand}
        className="hidden h-9 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 pl-3 pr-2 text-sm text-slate-400 transition-all hover:border-slate-300 hover:bg-white hover:text-slate-500 md:flex md:w-56 lg:w-64 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      >
        <Search size={15} />
        <span className="flex-1 text-left">Search pages…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
          ⌘K
        </kbd>
      </button>
      <IconButton label="Search" onClick={onOpenCommand} className="md:hidden">
        <Search size={18} />
      </IconButton>

      {/* Theme toggle */}
      <IconButton label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </IconButton>

      {/* Notifications */}
      <Dropdown
        width="w-[360px] max-w-[calc(100vw-2rem)]"
        trigger={(_open, toggle) => (
          <IconButton label="Notifications" onClick={toggle} badge={notifications.length}>
            <Bell size={18} />
          </IconButton>
        )}
      >
        {(close) => (
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {notifications.length} new
              </span>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700">
                    <Check size={18} />
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">You're all caught up</p>
                  <p className="text-xs text-slate-400">No alerts right now.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = n.icon;
                  return (
                  <Link
                    key={n.id}
                    to={n.path}
                    onClick={close}
                    className="flex items-start gap-3 border-b border-slate-50 px-4 py-3 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/40"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        n.tone === "danger"
                          ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                          : n.tone === "warning"
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                          : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                      }`}
                    >
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                        {n.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{n.description}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-400 dark:text-slate-500">{n.time}</span>
                    </span>
                  </Link>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Dropdown>

      {/* Quick actions */}
      <Dropdown
        width="w-72"
        trigger={(open, toggle) => (
          <button
            type="button"
            onClick={toggle}
            className="hidden h-9 items-center gap-1.5 rounded-lg bg-brand-600 pl-3 pr-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 sm:flex dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            <Plus size={16} />
            Quick add
            <ChevronDown size={14} className={`text-brand-200 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      >
        {(close) => (
          <div className="p-1.5">
            <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Quick actions
            </p>
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                to={action.path}
                onClick={close}
                className="flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <action.icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{action.label}</span>
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{action.description}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Dropdown>

      {/* Profile */}
      <Dropdown
        width="w-64"
        trigger={(open, toggle) => (
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-xs font-bold text-white ring-2 ring-white dark:ring-slate-800">
              {initials}
            </span>
            <span className="hidden text-left xl:block">
              <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100">
                {displayName}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {displayRole}
              </span>
            </span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      >
        {(close) => (
          <div className="p-1.5">
            <div className="flex items-center gap-3 rounded-lg px-2.5 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-sm font-bold text-white">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{displayName}</span>
                <span className="block truncate text-xs text-slate-400">{user.email}</span>
              </span>
            </div>
            <div className="mx-2.5 my-1.5 flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-700/40">
              <UserRound size={13} className="text-brand-600 dark:text-brand-400" />
              <span className="text-[11.5px] font-medium text-slate-500 dark:text-slate-300">Role</span>
              <span className="ml-auto rounded-full bg-brand-100 px-2 py-px text-[10.5px] font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
                {displayRole}
              </span>
            </div>
            <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-700" />
            <Link
              to="/settings?tab=profile"
              onClick={close}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
            >
              <Settings size={15} /> Account settings
            </Link>
            <button
              type="button"
              onClick={() => {
                close();
                handleSignOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </Dropdown>
    </header>
  );
}

export default Header;
