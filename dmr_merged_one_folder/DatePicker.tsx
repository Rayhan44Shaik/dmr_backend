/**
 * =============================================================================
 * DMR Poultries ERP — Shared DatePicker
 * Path target: src/components/common/DatePicker.tsx
 * =============================================================================
 * Full ERP-style single-date calendar popup.
 *
 * Features:
 *  - Month / year dropdowns (custom CalendarDropdown)
 *  - Previous / next month navigation
 *  - Manual DD/MM/YYYY entry with blur validation
 *  - Today / This Week / Clear footer actions
 *  - Outside-click handling
 *  - Controlled month synchronization
 *  - Styled calendar popup (emerald ERP theme)
 *  - react-day-picker v10
 *  - placement: "top" | "bottom"
 *  - label / error / required / disabled / icon / className
 *  - minDate / maxDate optional bounds
 *  - keyboard Escape to close
 *  - optional showWeekNumbers
 * =============================================================================
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Eraser,
} from "lucide-react";
import {
  format,
  isValid,
  parse,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
  isSameDay,
  addMonths,
  subMonths,
  setMonth as dfSetMonth,
  setYear as dfSetYear,
  getYear,
  getMonth,
  differenceInCalendarDays,
} from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

/* =============================================================================
 * Constants
 * ============================================================================= */

const DISPLAY_FORMAT = "dd/MM/yyyy";
const VALUE_FORMAT = "yyyy-MM-dd";
const WEEK_STARTS_ON = 1 as const; // Monday — Indian ERP convention

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** How many years before / after the viewed year appear in the year dropdown. */
const YEAR_WINDOW_PAST = 50;
const YEAR_WINDOW_FUTURE = 50;

/* =============================================================================
 * Types
 * ============================================================================= */

export interface DatePickerProps {
  /** Controlled value in YYYY-MM-DD (empty string = none). */
  value: string;
  /** Fires with YYYY-MM-DD, or "" when cleared. */
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  required?: boolean;
  icon?: React.ReactNode;
  /** Where the calendar popup appears relative to the input. Default "bottom". */
  placement?: "top" | "bottom";
  /** Optional inclusive lower bound (YYYY-MM-DD). */
  minDate?: string;
  /** Optional inclusive upper bound (YYYY-MM-DD). */
  maxDate?: string;
  /** Close popup automatically after picking a day. Default true. */
  closeOnSelect?: boolean;
  /** Show week numbers column. Default false. */
  showWeekNumbers?: boolean;
  /** id forwarded to the text input (for label htmlFor). */
  id?: string;
  /** name attribute on the text input. */
  name?: string;
  /** Extra class on the popup panel. */
  popupClassName?: string;
  /** Hide the "This Week" footer button. */
  hideThisWeek?: boolean;
  /** Hide the "Today" footer button. */
  hideToday?: boolean;
  /** Hide the clear (X) control on the input. */
  hideClear?: boolean;
  /** Called when the popup opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Auto-focus the text input on mount. */
  autoFocus?: boolean;
  /** Read-only text input (calendar still opens via icon). */
  readOnly?: boolean;
  /** Test id for automation. */
  "data-testid"?: string;
}

interface CalendarDropdownOption {
  value: number | string;
  label: string;
  disabled?: boolean;
}

interface CalendarDropdownInternalProps {
  value: number | string;
  onChange: (e: { target: { value: string | number } }) => void;
  options: CalendarDropdownOption[];
  "aria-label"?: string;
}

/* =============================================================================
 * Date helpers (local calendar — no UTC shift)
 * ============================================================================= */

function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODateLocal(iso: string | undefined | null): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return undefined;
  const [y, m, d] = iso.trim().split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (!isValid(date)) return undefined;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return undefined;
  }
  return date;
}

function parseDisplayDate(text: string): Date | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // Strict DD/MM/YYYY
  const strict = parse(trimmed, DISPLAY_FORMAT, new Date());
  if (isValid(strict) && format(strict, DISPLAY_FORMAT) === trimmed) {
    return strict;
  }

  // Tolerant: D/M/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const normalized = trimmed.replace(/[-.]/g, "/");
  const parts = normalized.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map((p) => p.trim());
    if (dd && mm && yyyy && yyyy.length === 4) {
      const candidate = parse(
        `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`,
        DISPLAY_FORMAT,
        new Date()
      );
      if (isValid(candidate)) return candidate;
    }
  }

  // Also accept YYYY-MM-DD typed manually
  const iso = parseISODateLocal(trimmed);
  if (iso) return iso;

  return undefined;
}

function formatDisplay(date: Date | undefined): string {
  if (!date || !isValid(date)) return "";
  return format(date, DISPLAY_FORMAT);
}

function formatValue(date: Date | undefined): string {
  if (!date || !isValid(date)) return "";
  return toLocalISODate(date);
}

function isDateDisabled(
  date: Date,
  minDate?: Date,
  maxDate?: Date
): boolean {
  const day = startOfDay(date);
  if (minDate && isBefore(day, startOfDay(minDate))) return true;
  if (maxDate && isAfter(day, startOfDay(maxDate))) return true;
  return false;
}

function clampToBounds(date: Date, minDate?: Date, maxDate?: Date): Date {
  let result = date;
  if (minDate && isBefore(startOfDay(result), startOfDay(minDate))) {
    result = minDate;
  }
  if (maxDate && isAfter(startOfDay(result), startOfDay(maxDate))) {
    result = maxDate;
  }
  return result;
}

/* =============================================================================
 * CalendarDropdown — month / year select used inside DayPicker caption
 * ============================================================================= */

function CalendarDropdown({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: CalendarDropdownInternalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector<HTMLElement>("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    }
  }, [isOpen]);

  const currentOption = options?.find((o) => String(o.value) === String(value));

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between gap-1.5 bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg py-1.5 px-2.5 outline-none hover:bg-slate-100 transition shadow-sm min-w-[75px] focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        <span className="truncate">{currentOption?.label ?? String(value)}</span>
        <ChevronDown
          size={13}
          className={`text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 z-[60] mt-1 max-h-[155px] w-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg text-slate-700 scrollbar-thin"
        >
          {options?.map((opt) => {
            const isActive = String(opt.value) === String(value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={opt.disabled}
                data-active={isActive ? "true" : "false"}
                onClick={() => {
                  if (onChange) {
                    onChange({ target: { value: opt.value } });
                  }
                  setIsOpen(false);
                }}
                className={`block w-full text-left rounded-md px-3 py-1.5 text-xs transition ${
                  isActive
                    ? "bg-emerald-600 font-bold text-white"
                    : "hover:bg-emerald-50 hover:text-emerald-700 text-slate-700"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =============================================================================
 * Chevron components for DayPicker nav
 * ============================================================================= */

function NavChevron({ orientation }: { orientation?: "left" | "right" | "up" | "down" }) {
  if (orientation === "left") return <ChevronLeft size={16} aria-hidden />;
  if (orientation === "right") return <ChevronRight size={16} aria-hidden />;
  if (orientation === "up") return <ChevronDown size={16} className="rotate-180" aria-hidden />;
  return <ChevronDown size={16} aria-hidden />;
}

/* =============================================================================
 * DayPicker classNames — emerald ERP styling
 * ============================================================================= */

const DAY_PICKER_CLASS_NAMES = {
  root: "rdp-root w-full",
  months: "relative w-full",
  month: "w-full space-y-2",
  // Caption/dropdowns hidden — custom top toolbar is the single month/year UI
  month_caption: "hidden",
  caption_label: "hidden",
  dropdowns: "hidden",
  dropdown: "hidden",
  dropdown_root: "hidden",
  months_dropdown: "hidden",
  years_dropdown: "hidden",
  nav: "hidden",
  button_previous: "hidden",
  button_next: "hidden",
  month_grid: "w-full border-collapse",
  weekdays: "flex justify-between w-full border-b border-slate-50 pb-1",
  weekday:
    "text-slate-400 w-8 font-medium text-[0.7rem] uppercase tracking-wider text-center block",
  week: "flex w-full mt-1 justify-between",
  week_number: "text-[0.65rem] text-slate-400 w-8 flex items-center justify-center font-medium",
  week_number_header: "w-8",
  day: "h-8 w-8 p-0 font-normal text-slate-700 rounded-lg hover:bg-emerald-50 transition flex items-center justify-center text-xs relative",
  day_button:
    "h-8 w-8 p-0 font-normal rounded-lg flex items-center justify-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
  selected:
    "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white focus:bg-emerald-700 focus:text-white shadow-sm font-semibold",
  today: "bg-emerald-50 text-emerald-700 font-bold border border-emerald-200",
  outside: "text-slate-300 opacity-40",
  disabled: "text-slate-300 opacity-30 hover:bg-transparent cursor-not-allowed",
  hidden: "invisible",
  range_start: "bg-emerald-600 text-white rounded-l-lg",
  range_end: "bg-emerald-600 text-white rounded-r-lg",
  range_middle: "bg-emerald-50 text-emerald-900 rounded-none",
} as const;

/* =============================================================================
 * Main DatePicker
 * ============================================================================= */

export function DatePicker({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  disabled = false,
  className = "",
  label,
  error,
  required = false,
  icon,
  placement = "bottom",
  minDate: minDateStr,
  maxDate: maxDateStr,
  closeOnSelect = true,
  showWeekNumbers = false,
  id,
  name,
  popupClassName = "",
  hideThisWeek = false,
  hideToday = false,
  hideClear = false,
  onOpenChange,
  autoFocus = false,
  readOnly = false,
  "data-testid": testId,
}: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const inputId = id ?? `erp-datepicker-${autoId}`;

  const selectedDate = useMemo(() => parseISODateLocal(value), [value]);
  const minDate = useMemo(() => parseISODateLocal(minDateStr), [minDateStr]);
  const maxDate = useMemo(() => parseISODateLocal(maxDateStr), [maxDateStr]);

  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => selectedDate ?? new Date());
  const [inputValue, setInputValue] = useState<string>(() => formatDisplay(selectedDate));
  const [inputError, setInputError] = useState<string>("");

  /* ---------- sync incoming controlled value → input text + month ---------- */
  useEffect(() => {
    setInputValue(formatDisplay(selectedDate));
    setInputError("");
    if (selectedDate) {
      setMonth(selectedDate);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- selectedDate derived from value

  /* ---------- notify open state ---------- */
  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
      if (open && selectedDate) {
        setMonth(selectedDate);
      }
    },
    [onOpenChange, selectedDate]
  );

  /* ---------- outside click + Escape ---------- */
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, setOpen]);

  /* ---------- autofocus ---------- */
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  /* ---------- selection handlers ---------- */
  const commitDate = useCallback(
    (date: Date | undefined, close = closeOnSelect) => {
      if (!date) {
        onChange("");
        setInputValue("");
        setInputError("");
        if (close) setOpen(false);
        return;
      }
      if (isDateDisabled(date, minDate, maxDate)) {
        setInputError("Date is outside the allowed range");
        return;
      }
      const clamped = clampToBounds(date, minDate, maxDate);
      onChange(formatValue(clamped));
      setInputValue(formatDisplay(clamped));
      setMonth(clamped);
      setInputError("");
      if (close) setOpen(false);
    },
    [onChange, minDate, maxDate, closeOnSelect, setOpen]
  );

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      commitDate(date, closeOnSelect);
    },
    [commitDate, closeOnSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    setInputError("");

    // Live-commit when the user finishes a full valid DD/MM/YYYY
    if (raw.trim().length >= 8) {
      const parsed = parseDisplayDate(raw);
      if (parsed && !isDateDisabled(parsed, minDate, maxDate)) {
        // Don't close on every keystroke — only update value
        onChange(formatValue(parsed));
        setMonth(parsed);
      }
    }

    if (raw.trim() === "") {
      onChange("");
    }
  };

  const handleInputBlur = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      onChange("");
      setInputValue("");
      setInputError("");
      return;
    }
    const parsed = parseDisplayDate(trimmed);
    if (!parsed) {
      // Revert to last good controlled value
      setInputValue(formatDisplay(selectedDate));
      setInputError(selectedDate ? "" : "Use DD/MM/YYYY");
      return;
    }
    if (isDateDisabled(parsed, minDate, maxDate)) {
      setInputValue(formatDisplay(selectedDate));
      setInputError("Date is outside the allowed range");
      return;
    }
    commitDate(parsed, false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
      setOpen(false);
    } else if (e.key === "ArrowDown" && !isOpen) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const clearDate = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onChange("");
    setInputValue("");
    setInputError("");
    inputRef.current?.focus();
  };

  const handleToday = () => {
    const today = clampToBounds(new Date(), minDate, maxDate);
    if (isDateDisabled(new Date(), minDate, maxDate) && !isSameDay(today, new Date())) {
      // today itself out of bounds — still jump month, don't commit invalid
      setMonth(new Date());
      setInputError("Today is outside the allowed range");
      return;
    }
    commitDate(today, true);
  };

  const handleThisWeek = () => {
    // ERP convention: selecting "This Week" commits the Monday of the current week
    // (matches previous shared DatePicker behaviour via startOfWeek).
    const base = month && isValid(month) ? month : new Date();
    const monday = startOfWeek(base, { weekStartsOn: WEEK_STARTS_ON });
    const clamped = clampToBounds(monday, minDate, maxDate);
    if (isDateDisabled(monday, minDate, maxDate) && !isSameDay(clamped, monday)) {
      setInputError("This week is outside the allowed range");
      setMonth(monday);
      return;
    }
    commitDate(clamped, true);
  };

  const handlePrevMonth = () => setMonth((m) => subMonths(m, 1));
  const handleNextMonth = () => setMonth((m) => addMonths(m, 1));

  const handleMonthDropdown = (monthIndex: number) => {
    setMonth((m) => dfSetMonth(m, monthIndex));
  };

  const handleYearDropdown = (year: number) => {
    setMonth((m) => dfSetYear(m, year));
  };

  /* ---------- dropdown option lists (also used if DayPicker captionLayout fails) ---------- */
  const viewYear = getYear(month);
  const viewMonth = getMonth(month);

  const monthOptions: CalendarDropdownOption[] = useMemo(
    () =>
      MONTH_LABELS.map((label, index) => ({
        value: index,
        label,
      })),
    []
  );

  const yearOptions: CalendarDropdownOption[] = useMemo(() => {
    const start = viewYear - YEAR_WINDOW_PAST;
    const end = viewYear + YEAR_WINDOW_FUTURE;
    const list: CalendarDropdownOption[] = [];
    for (let y = start; y <= end; y++) {
      list.push({ value: y, label: String(y) });
    }
    return list;
  }, [viewYear]);

  const startMonthBound = useMemo(
    () => (minDate ? startOfMonth(minDate) : new Date(viewYear - YEAR_WINDOW_PAST, 0)),
    [minDate, viewYear]
  );
  const endMonthBound = useMemo(
    () => (maxDate ? endOfMonth(maxDate) : new Date(viewYear + YEAR_WINDOW_FUTURE, 11)),
    [maxDate, viewYear]
  );

  const disabledMatcher = useCallback(
    (date: Date) => isDateDisabled(date, minDate, maxDate),
    [minDate, maxDate]
  );

  const dropdownPositionClass =
    placement === "top"
      ? "bottom-[calc(100%+6px)] mb-1"
      : "top-[calc(100%+6px)] mt-1";

  const showFooter = !hideThisWeek || !hideToday;
  const mergedError = error || inputError;

  /* ---------- render ---------- */
  return (
    <div
      className={`relative ${className}`}
      ref={containerRef}
      data-testid={testId}
    >
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={Boolean(mergedError)}
          aria-required={required}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={`h-10 w-full rounded-lg border bg-white px-3 pr-16 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100 disabled:text-slate-400 ${
            mergedError ? "border-red-500 focus:border-red-500 focus:ring-red-200" : "border-slate-300"
          }`}
        />

        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {!hideClear && value && !disabled && (
            <button
              type="button"
              onClick={clearDate}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 transition"
              title="Clear date"
              aria-label="Clear date"
              tabIndex={-1}
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setOpen(!isOpen);
            }}
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 transition disabled:opacity-40"
            title="Open calendar"
            aria-label="Open calendar"
            tabIndex={-1}
          >
            {icon || <CalendarIcon size={18} className="text-emerald-600" />}
          </button>
        </div>
      </div>

      {mergedError && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {mergedError}
        </p>
      )}

      {isOpen && !disabled && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label="Choose date"
          className={`absolute left-0 z-50 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl select-none text-slate-900 ${dropdownPositionClass} ${popupClassName}
            [&_table]:w-full [&_table]:border-collapse [&_tr]:h-auto [&_td]:p-0 [&_th]:p-0 [&_th]:pb-2`}
        >
          {/* Single month/year toolbar (DayPicker built-in caption is hidden) */}
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="h-7 w-7 rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-100 flex items-center justify-center transition"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-2">
              <CalendarDropdown
                value={viewMonth}
                options={monthOptions}
                aria-label="Month"
                onChange={(e) => handleMonthDropdown(Number(e.target.value))}
              />
              <CalendarDropdown
                value={viewYear}
                options={yearOptions}
                aria-label="Year"
                onChange={(e) => handleYearDropdown(Number(e.target.value))}
              />
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="h-7 w-7 rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-100 flex items-center justify-center transition"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            month={month}
            onMonthChange={setMonth}
            startMonth={startMonthBound}
            endMonth={endMonthBound}
            weekStartsOn={WEEK_STARTS_ON}
            showWeekNumber={showWeekNumbers}
            disabled={disabledMatcher}
            classNames={DAY_PICKER_CLASS_NAMES as any}
            components={{
              Chevron: NavChevron as any,
            }}
            hideNavigation
          />

          {showFooter && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 gap-2">
              {!hideThisWeek && (
                <button
                  type="button"
                  onClick={handleThisWeek}
                  className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                >
                  This Week
                </button>
              )}
              {!hideToday && (
                <button
                  type="button"
                  onClick={handleToday}
                  className="flex-1 rounded-lg bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Today
                </button>
              )}
              {!hideClear && (
                <button
                  type="button"
                  onClick={() => clearDate()}
                  className="flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition"
                  title="Clear"
                >
                  <Eraser size={12} />
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Status strip */}
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 px-0.5">
            <span>
              {selectedDate
                ? `Selected · ${formatDisplay(selectedDate)}`
                : "No date selected"}
            </span>
            {selectedDate && (
              <span>
                {differenceInCalendarDays(startOfDay(new Date()), startOfDay(selectedDate)) === 0
                  ? "Today"
                  : differenceInCalendarDays(startOfDay(new Date()), startOfDay(selectedDate)) > 0
                    ? `${differenceInCalendarDays(startOfDay(new Date()), startOfDay(selectedDate))}d ago`
                    : `in ${Math.abs(differenceInCalendarDays(startOfDay(new Date()), startOfDay(selectedDate)))}d`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================================================================
 * Convenience: uncontrolled wrapper (rare — most ERP screens are controlled)
 * ============================================================================= */

export interface UncontrolledDatePickerProps
  extends Omit<DatePickerProps, "value" | "onChange"> {
  defaultValue?: string;
  onChange?: (date: string) => void;
}

export function UncontrolledDatePicker({
  defaultValue = "",
  onChange,
  ...rest
}: UncontrolledDatePickerProps) {
  const [value, setValue] = useState(defaultValue);
  return (
    <DatePicker
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

/* =============================================================================
 * Re-exports / utilities for consumers
 * ============================================================================= */

export const DatePickerUtils = {
  DISPLAY_FORMAT,
  VALUE_FORMAT,
  WEEK_STARTS_ON,
  MONTH_LABELS,
  MONTH_SHORT,
  toLocalISODate,
  parseISODateLocal,
  parseDisplayDate,
  formatDisplay,
  formatValue,
  isDateDisabled,
  clampToBounds,
  startOfWeekMonday: (d: Date) => startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }),
  endOfWeekSunday: (d: Date) => endOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }),
  startOfDay,
  endOfDay,
};

export default DatePicker;

/* =============================================================================
 * Optional: dual-bound helper used by forms that store Date objects
 * ============================================================================= */

export function dateToPickerValue(date: Date | null | undefined): string {
  if (!date || !isValid(date)) return "";
  return toLocalISODate(date);
}

export function pickerValueToDate(value: string | null | undefined): Date | null {
  const parsed = parseISODateLocal(value ?? "");
  return parsed ?? null;
}

/** True when `value` is a non-empty valid YYYY-MM-DD. */
export function isPickerValue(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseISODateLocal(value));
}

/**
 * Build a short human label for chips / filter pills.
 * Examples: "Today", "12 Aug 2026", "Invalid date"
 */
export function describePickerValue(value: string, locale: string = "en-IN"): string {
  const d = parseISODateLocal(value);
  if (!d) return value ? "Invalid date" : "No date";
  if (isSameDay(d, startOfDay(new Date()))) return "Today";
  const yesterday = startOfDay(new Date());
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}