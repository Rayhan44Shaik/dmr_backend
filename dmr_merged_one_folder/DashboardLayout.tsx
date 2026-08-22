// src/layouts/DashboardLayout/DashboardLayout.tsx
// Application shell: collapsible sidebar + header + command palette.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../../ui/Sidebar/Sidebar";
import Header from "../../ui/Header/Header";
import CommandPalette from "../../ui/CommandPalette/CommandPalette";

type DashboardLayoutProps = {
  children: ReactNode;
};

const COLLAPSED_KEY = "dmr_sidebar_collapsed";

function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
      } catch {
        /* ignore storage errors */
      }
      return !prev;
    });
  };

  // Scroll the content area back to the top on navigation.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.search]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100/80 dark:bg-slate-950">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} onOpenCommand={() => setCommandOpen(true)} />

        <main ref={mainRef} className="flex-1 overflow-y-auto" id="app-scroll">
          {children}
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpen={() => setCommandOpen(true)}
        onClose={() => setCommandOpen(false)}
      />
    </div>
  );
}

export default DashboardLayout;
