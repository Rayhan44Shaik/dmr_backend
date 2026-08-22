// src/routes/navigation.ts
// -----------------------------------------------------------------------------
// Single source of truth for application navigation.
// Consumed by the Sidebar, the Header (breadcrumbs / titles) and the
// command palette. Every path maps to an existing, working route.
// -----------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingBag,
  CreditCard,
  Clock3,
  PackageOpen,
  PackageCheck,
  History,
  ClipboardList,
  BarChart3,
  ReceiptIndianRupee,
  BookOpen,
  Sprout,
  Fuel,
  Landmark,
  Banknote,
  TrendingUp,
  FileText,
  Truck,
  Wrench,
  Contact,
  FileSpreadsheet,
  Users,
  CalendarClock,
  CalendarDays,
  Wallet,
  Store,
  Tractor,
  Car,
  Bird,
  UserCheck,
  Settings,
  Database,
  DollarSign
} from "lucide-react";

export interface NavChild {
  label: string;
  path: string;
  icon?: LucideIcon;
  /** Marks a planned module — rendered with a subtle "Soon" pill. */
  soon?: boolean;
  keywords?: string;
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Optional direct path for single-item sections. */
  path?: string;
  children: NavChild[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    children: [{ label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, keywords: "home kpi charts today overview" }],
  },
  {
    id: "masters",
    label: "Masters",
    icon: Database,
    children: [
      { label: "Shops", path: "/masters?tab=shops", icon: Store, keywords: "shops master stores" },
      { label: "Farms / Poultry Farms", path: "/masters?tab=farms", icon: Tractor, keywords: "farms poultry farms" },
      { label: "Vehicles", path: "/masters?tab=vehicles", icon: Car, keywords: "vehicles master trucks" },
      { label: "Employees", path: "/masters?tab=employees", icon: Users, keywords: "employees master staff" },
      { label: "Banks", path: "/masters?tab=banks", icon: Landmark, keywords: "banks master accounts" },
      { label: "Bird Types", path: "/masters?tab=birdTypes", icon: Bird, keywords: "bird types breed master" },
      { label: "Market Rates", path: "/accounts?tab=market-rate", icon: TrendingUp, keywords: "market rate weight price" },

      //{ label: "Routes", path: "/masters?tab=shops", icon: Package, soon: true, keywords: "routes master" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: PackageOpen,
    children: [
      { label: "Daily Operation Report", path: "/operations?tab=overview", icon: ClipboardList, keywords: "daily report operations overview" },

      { label: "Vehicle Delivery Entry", path: "/operations?tab=trip-entry", icon: PackageCheck, keywords: "delivery trip shop weight" },
      { label: "Vehicle Trip History", path: "/operations?tab=trip-list", icon: History, keywords: "trips history list completed" },
      
      { label: "Rate Entry", path: "/operations?tab=rate-entry", icon: DollarSign, keywords: "sales shop invoice rate" },
      { label: "Shop Sales Entry", path: "/operations?tab=shop-sales", icon: ShoppingBag, keywords: "sales shop invoice rate" },
      
      { label: "Collection Entry", path: "/operations?tab=collection", icon: CreditCard, keywords: "collection payment cash" },
      { label: "Pending Collections", path: "/operations?tab=pending-collections", icon: Clock3, keywords: "pending overdue outstanding collection" },
      
      { label: "Mortality Entry", path: "/operations?tab=mortality", icon: Bird, keywords: "mortality death birds" },
      { label: "Fuel Expenses", path: "/operations?tab=fuel-expenses", icon: Fuel, keywords: "fuel diesel expenses bills" },
    ],
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: Truck,
    children: [
      // DEFERRED / FUTURE: Fleet Overview (Dashboard) — files preserved, not in active nav
      //{ label: "Fleet Overview", path: "/fleet?tab=dashboard", icon: Gauge, keywords: "fleet vehicles overview status" },
      { label: "Maintenance Entry", path: "/fleet?tab=entry", icon: Wrench, keywords: "maintenance service garage" },
      { label: "Maintenance History", path: "/fleet?tab=history", icon: History, keywords: "maintenance history records" },

      { label: "Permits & Documents", path: "/fleet?tab=permits", icon: FileSpreadsheet, keywords: "permits insurance fitness documents" },
      
      { label: "EMI", path: "/fleet?tab=emi", icon: Banknote, keywords: "emi loan installment" },
      { label: "Analytics", path: "/fleet?tab=analytics", icon: BarChart3, keywords: "analytics vehicle performance" },
      
      { label: "FASTag", path: "/fleet?tab=fastag", icon: Contact, keywords: "fastag toll balance" },
      
      //{ label: "Fuel", path: "/operations?tab=fuel-expenses", icon: Fuel, keywords: "fuel diesel expenses" },
      // DEFERRED / FUTURE: Expense Reports + Vehicle Reports — files preserved, not in active nav
      //{ label: "Expense Reports", path: "/fleet?tab=expenses", icon: FileText, keywords: "expense report vehicle wise" },
      //{ label: "Reports", path: "/fleet?tab=reports", icon: FileText, keywords: "reports vehicle reports" },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    icon: Users,
    children: [
      //{ label: "Employees", path: "/masters?tab=employees", icon: UserRound, keywords: "employees staff master" },
      { label: "Duty Planner", path: "/staff?tab=duty-planner", icon: CalendarClock, keywords: "duty planner roster schedule" },
      { label: "Salary Register", path: "/staff?tab=salary-sheet", icon: Wallet, keywords: "salary register sheet" },
      { label: "Leaves", path: "/staff?tab=leaves", icon: CalendarDays, keywords: "leave management approval" },
      { label: "Driver Performance", path: "/staff?tab=driver-performance", icon: Truck, keywords: "driver performance trips cost mileage" },
      { label: "Supervisor Performance", path: "/staff?tab=supervisor-performance", icon: UserCheck, keywords: "supervisor performance shops birds mortality" },
      //{ label: "Attendance", path: "/staff?tab=duty-planner", icon: CalendarCheck, soon: true, keywords: "attendance biometric" },
      //{ label: "Deductions", path: "/staff?tab=salary-sheet", icon: Scale, soon: true, keywords: "deductions advance loan" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: ReceiptIndianRupee,
    children: [
      { label: "Accounts Dashboard", path: "/accounts?tab=summary", icon: BarChart3, keywords: "accounts summary totals" },
      { label: "Collection Register", path: "/accounts?tab=paid-payments", icon: BookOpen, keywords: "payments register ledger" },
      { label: "Farmer Payments", path: "/accounts?tab=farm-payment", icon: Sprout, keywords: "farmer farm payment poultry" },
      { label: "New Payment Entry", path: "/accounts?tab=new-payments", icon: CreditCard, keywords: "payment entry new" },
    ],
  },
  

  
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
    children: [
      //{ label: "Reports Hub", path: "/reports", icon: BarChart3, keywords: "reports hub" },
      { label: "Shop Ledger", path: "/reports?tab=shopLedger", icon: BookOpen, keywords: "shop ledger statement" },
      { label: "Daily / Weekly Reports", path: "/reports?tab=weekly", icon: CalendarDays, keywords: "daily weekly reports" },
      { label: 'shopSales', path: "/reports?tab=shopSales", icon: ShoppingBag, keywords: "shop sales report" },
      { label: "Collection Report", path: "/reports?tab=collection", icon: CreditCard, keywords: "collection report register" },
      { label: "Vehicle Reports", path: "/reports?tab=vehicle", icon: Truck, keywords: "vehicle reports fleet" },
      { label: "expenses", path: "/reports?tab=expenses", icon: FileText, keywords: "Expenses" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    children: [
      // Hidden from frontend navigation — underlying modules/routes remain intact.
       { label: "System Settings", path: "/settings?tab=appearance", icon: Settings, keywords: "settings appearance theme language" },
      // { label: "Users & Roles", path: "/settings?tab=users", icon: UserCog, keywords: "users roles management" },
      // { label: "Permissions", path: "/settings?tab=permissions", icon: KeyRound, keywords: "permissions roles access" },
      // { label: "Profile & Security", path: "/settings?tab=profile", icon: ShieldCheck, keywords: "profile password security" },
    ],
  },
];

/** Flat list of all navigable entries — used by the command palette. */
export interface FlatNavEntry {
  section: string;
  label: string;
  path: string;
  icon: LucideIcon;
  soon?: boolean;
  keywords?: string;
}

export const FLAT_NAV: FlatNavEntry[] = NAV_SECTIONS.flatMap((section) =>
  section.children.map((child) => ({
    section: section.label,
    label: child.label,
    path: child.path,
    icon: child.icon ?? section.icon,
    soon: child.soon,
    keywords: child.keywords,
  }))
);

/** Quick actions surfaced in the header and command palette. */
export interface QuickAction {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Trip Entry", description: "Dispatch a vehicle on a new trip", path: "/operations?tab=trip-entry", icon: PackageOpen },
  { label: "Record Collection", description: "Enter a shop collection received", path: "/operations?tab=collection", icon: CreditCard },
  { label: "Enter Shop Sale", description: "Record a delivery against a shop", path: "/operations?tab=shop-sales", icon: ShoppingBag },
  { label: "Add Fuel Expense", description: "Log diesel / fuel for a vehicle", path: "/operations?tab=fuel-expenses", icon: Fuel },
];

/** Resolve the section + page labels for the current pathname (breadcrumbs). */
export function resolveRoute(pathname: string): { section?: NavSection; page?: NavChild } {
  // Normalize: drop query string
  const path = pathname.split("?")[0];
  const query = pathname.includes("?") ? pathname.slice(pathname.indexOf("?")) : "";

  // Pass 1 — exact path + query match.
  for (const section of NAV_SECTIONS) {
    for (const child of section.children) {
      const childPath = child.path.split("?")[0];
      const childQuery = child.path.includes("?") ? child.path.slice(child.path.indexOf("?")) : "";
      if (path === childPath && childQuery && query === childQuery) {
        return { section, page: child };
      }
    }
  }

  // Pass 2 — path match for children without a query (section hubs).
  for (const section of NAV_SECTIONS) {
    for (const child of section.children) {
      const childPath = child.path.split("?")[0];
      const childQuery = child.path.includes("?") ? child.path.slice(child.path.indexOf("?")) : "";
      if (path === childPath && !childQuery) {
        return { section, page: child };
      }
    }
  }

  // Fall back to section-level match (e.g. "/masters", "/operations").
  for (const section of NAV_SECTIONS) {
    const paths = section.children.map((c) => c.path.split("?")[0]);
    if (paths.includes(path) || (path.length > 1 && paths.some((p) => path.startsWith(p + "/")))) {
      return { section };
    }
    // Also match section hubs by prefix conventions (e.g. /staff, /fleet).
    const hubs: Record<string, string[]> = {
      operations: ["/operations"],
      accounts: ["/accounts"],
      vehicles: ["/fleet"],
      staff: ["/staff"],
      masters: ["/masters"],
      reports: ["/reports"],
      settings: ["/settings"],
    };
    if (hubs[section.id]?.includes(path)) return { section };
  }

  return {};
}
