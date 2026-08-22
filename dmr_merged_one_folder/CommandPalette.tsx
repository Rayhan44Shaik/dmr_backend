// src/ui/CommandPalette/CommandPalette.tsx
// ⌘K command palette — fuzzy navigation across every working route.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { FLAT_NAV, QUICK_ACTIONS, type FlatNavEntry } from "../../routes/navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

function fuzzyMatch(entry: FlatNavEntry, query: string): number {
  const haystack = `${entry.label} ${entry.section} ${entry.keywords ?? ""}`.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 0;
  if (haystack.startsWith(needle)) return 0;
  if (haystack.includes(needle)) return 1;
  return -1;
}

export default function CommandPalette({ open, onOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Top hits: quick actions first, then navigation.
      return [
        ...QUICK_ACTIONS.map((a) => ({
          section: "Quick actions",
          label: a.label,
          path: a.path,
          icon: a.icon,
          keywords: a.description,
        })),
        ...FLAT_NAV.filter((e) => !e.soon),
      ];
    }
    return FLAT_NAV.filter((e) => !e.soon)
      .map((e) => ({ entry: e, score: fuzzyMatch(e, q) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.entry);
  }, [query]);

  // Reset the input whenever the palette is closed, and focus when it opens.
  const close = useCallback(() => {
    onClose();
    setQuery("");
    setActiveIndex(0);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      // Focus after the overlay paints.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Global shortcut: ⌘K / Ctrl+K toggles the palette; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else onOpen();
      }
      if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen, close]);

  const safeIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  if (!open) return null;

  const handleSelect = (path: string) => {
    close();
    navigate(path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[safeIndex];
      if (selected) handleSelect(selected.path);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in" onClick={close} />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-800">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-700">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, actions, modules…"
            className="h-13 w-full bg-transparent py-3.5 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
            aria-label="Search the application"
          />
          <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No results for “{query}”</p>
              <p className="mt-1 text-xs text-slate-400">Try “collections”, “trips”, “reports”…</p>
            </div>
          ) : (
            results.map((entry, index) => (
              <button
                key={`${entry.section}-${entry.label}`}
                type="button"
                data-index={index}
                onClick={() => handleSelect(entry.path)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  index === safeIndex ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-700/40"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    index === safeIndex
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  }`}
                >
                  <entry.icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13.5px] font-medium ${
                      index === safeIndex ? "text-brand-900 dark:text-brand-200" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {entry.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">{entry.section}</span>
                </span>
                {index === safeIndex && (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
                    <span className="hidden items-center gap-1 sm:flex">
                      Open <CornerDownLeft size={11} />
                    </span>
                    <ArrowRight size={13} />
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-slate-200 bg-white px-1 py-px font-sans dark:border-slate-600 dark:bg-slate-700">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-slate-200 bg-white px-1 py-px font-sans dark:border-slate-600 dark:bg-slate-700">↵</kbd>
            open
          </span>
          <span className="ml-auto hidden sm:block">DMR Poultries ERP</span>
        </div>
      </div>
    </div>
  );
}
