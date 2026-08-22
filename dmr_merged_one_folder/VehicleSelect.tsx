// src/modules/reports/vehicle/components/VehicleSelect.tsx
// Searchable vehicle combobox. Partial-number search ("AP", "1234"),
// keyboard navigation, and an "All Vehicles" option. Internal database ids
// are never shown — only business vehicle numbers.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { Vehicle } from "../../../masters/vehicles/types/vehicle";

interface VehicleSelectProps {
  vehicles: Vehicle[];
  value: number | "all";
  onChange: (value: number | "all") => void;
  disabled?: boolean;
}

export default function VehicleSelect({ vehicles, value, onChange, disabled = false }: VehicleSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [
      { id: "all" as const, label: "All Vehicles" },
      ...vehicles.map((v) => ({ id: v.id as number, label: v.vehicleNumber })),
    ];
    if (!q) return list;
    return list.filter((o) => o.label.toLowerCase().includes(q));
  }, [vehicles, query]);

  const selectedLabel = value === "all" ? "All Vehicles" : vehicles.find((v) => v.id === value)?.vehicleNumber ?? "All Vehicles";

  const openDropdown = () => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 10);
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = (id: number | "all") => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[activeIndex];
      if (option) select(option.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        disabled={disabled}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronsUpDown size={15} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Search vehicle number…"
              className="w-full bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
              aria-label="Search vehicle number"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {options.length === 0 ? (
              <li className="px-3 py-2.5 text-center text-xs text-slate-400">No matching vehicles</li>
            ) : (
              options.map((option, index) => (
                <li key={String(option.id)}>
                  <button
                    type="button"
                    onClick={() => select(option.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
                      value === option.id
                        ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-500/10 dark:text-brand-300"
                        : index === activeIndex
                        ? "bg-slate-50 text-slate-800 dark:bg-slate-700/50 dark:text-slate-100"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/40"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {value === option.id && <Check size={14} className="shrink-0 text-brand-600 dark:text-brand-300" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}