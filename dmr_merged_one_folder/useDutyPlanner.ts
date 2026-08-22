// src/modules/staff/hooks/useDutyPlanner.ts
// PostgreSQL-backed duty planner hook. All persistent data flows through
// the existing staff duty API; localStorage is not used.

import { useState, useEffect, useCallback } from 'react';
import {
  autoAssignApply,
  autoAssignPreview,
  deleteDutyAssignment,
  getDutyPlannerWeek,
  handleApiError,
  submitDutyPlannerWeek,
  upsertDutyAssignment,
  type AutoPlan,
  type DutyPlannerSaturday,
  type DutyPlannerValidation,
  type DutyPlannerWeek,
} from '../services/dutyPlannerService';
import type { Employee, DutyAssignment, DutyPlannerFilters } from '../types/staffDashboard';

const DEFAULT_ROLES = ['Supervisor', 'Driver', 'Helper'];

export function isDateLocked(dateStr: string): boolean {
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);

  const day = targetDate.getDay();
  const diff = targetDate.getDate() - day + (day === 0 ? -6 : 1);
  const targetWeekMonday = new Date(targetDate);
  targetWeekMonday.setDate(diff);
  targetWeekMonday.setHours(0, 0, 0, 0);

  const now = new Date();
  const currDay = now.getDay();
  const currDiff = now.getDate() - currDay + (currDay === 0 ? -6 : 1);
  const currentWeekMonday = new Date(now);
  currentWeekMonday.setDate(currDiff);
  currentWeekMonday.setHours(0, 0, 0, 0);

  return targetWeekMonday.getTime() < currentWeekMonday.getTime();
}

export function useDutyPlanner(showNotification?: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const getCurrentWeekMonday = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    const year = startOfWeek.getFullYear();
    const month = String(startOfWeek.getMonth() + 1).padStart(2, '0');
    const date = String(startOfWeek.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const [filters, setFilters] = useState<DutyPlannerFilters>({
    department: '',
    role: DEFAULT_ROLES, // Pre-selected by default
    weekStart: getCurrentWeekMonday(),
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [allRoles, setAllRoles] = useState<string[]>(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Backend-authoritative week state
  const [weekStart, setWeekStart] = useState(filters.weekStart);
  const [weekEnd, setWeekEnd] = useState('');
  const [weekStatus, setWeekStatus] = useState('Open');
  const [saturday, setSaturday] = useState<DutyPlannerSaturday>({
    required: 0,
    assigned: 0,
    shortage: 0,
    status: '',
    requiredByRole: {},
    assignedByRole: {},
    availableByRole: {},
  });
  const [validation, setValidation] = useState<DutyPlannerValidation>({ ok: true, problems: [] });
  const [error, setError] = useState<string | null>(null);

  const [selectedCell, setSelectedCell] = useState<{ employeeId: number; date: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  /** Week cannot be edited when the backend locks or submits it. */
  const canEditWeek =
    weekStatus === 'Open' || weekStatus === 'Draft' || weekStatus === '';

  const applyWeek = useCallback((week: DutyPlannerWeek) => {
    setWeekStart(week.weekStart);
    setWeekEnd(week.weekEnd);
    setWeekStatus(week.status);
    setSaturday(week.saturday);
    setValidation(week.validation);
    setEmployees(week.employees);
    setAssignments(week.assignments);
    setWeekDays(week.days.map((d) => d.date));
    const mergedRoles = Array.from(new Set([...DEFAULT_ROLES, ...week.allRoles]));
    setAllRoles(mergedRoles);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const week = await getDutyPlannerWeek(filters.weekStart);
        if (cancelled) return;
        applyWeek(week);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const message = handleApiError(err);
        setError(message);
        showNotification?.(message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.weekStart, applyWeek, showNotification]);

  const moveWeek = useCallback((direction: -1 | 1) => {
    setFilters((prev) => {
      const d = new Date(prev.weekStart);
      d.setDate(d.getDate() + direction * 7);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      return { ...prev, weekStart: `${year}-${month}-${date}` };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      department: '',
      role: DEFAULT_ROLES, // Resets back to default selected roles
      weekStart: getCurrentWeekMonday(),
    });
  }, []);

  const getAssignment = useCallback(
    (employeeId: number, date: string): DutyAssignment | undefined => {
      return assignments.find((a) => a.employeeId === employeeId && a.date === date);
    },
    [assignments]
  );

  const updateAssignment = useCallback(
    async (employeeId: number, date: string, dutyType: DutyAssignment['dutyType']): Promise<boolean> => {
      if (isDateLocked(date)) {
        showNotification?.('Cannot edit duties for previous completed weeks.', 'error');
        return false;
      }
      if (!canEditWeek) {
        showNotification?.(`This week is ${weekStatus.toLowerCase()} and cannot be modified.`, 'error');
        return false;
      }

      const isSaturday = new Date(date).getDay() === 6;
      if (isSaturday && (dutyType === 'Rest' || dutyType === 'WeeklyOff')) {
        showNotification?.('Saturday is compulsory duty. Rest and Weekly Off cannot be assigned.', 'error');
        return false;
      }

      setSaving(true);
      setError(null);
      try {
        const existing = getAssignment(employeeId, date);
        const week = await upsertDutyAssignment({
          id: existing?.id,
          employeeId,
          dutyType,
          date,
        });
        applyWeek(week);
        showNotification?.('Duty assignment updated successfully', 'success');
        return true;
      } catch (err) {
        const message = handleApiError(err);
        setError(message);
        showNotification?.(message, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [getAssignment, applyWeek, showNotification, canEditWeek, weekStatus]
  );

  const deleteAssignment = useCallback(
    async (employeeId: number, date: string): Promise<boolean> => {
      if (isDateLocked(date)) {
        showNotification?.('Cannot edit duties for previous completed weeks.', 'error');
        return false;
      }
      if (!canEditWeek) {
        showNotification?.(`This week is ${weekStatus.toLowerCase()} and cannot be modified.`, 'error');
        return false;
      }

      const existing = getAssignment(employeeId, date);
      if (!existing?.id) {
        showNotification?.('No duty assignment to remove.', 'info');
        return false;
      }

      setSaving(true);
      setError(null);
      try {
        const week = await deleteDutyAssignment(existing.id);
        applyWeek(week);
        showNotification?.('Duty assignment removed successfully', 'success');
        return true;
      } catch (err) {
        const message = handleApiError(err);
        setError(message);
        showNotification?.(message, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [getAssignment, applyWeek, showNotification, canEditWeek, weekStatus]
  );

  const autoAssignAll = useCallback(async (): Promise<{ ok: boolean; plan?: AutoPlan; message?: string }> => {
    if (!canEditWeek) {
      showNotification?.(`This week is ${weekStatus.toLowerCase()} and cannot be modified.`, 'error');
      return { ok: false, message: `This week is ${weekStatus.toLowerCase()}.` };
    }

    setSaving(true);
    setError(null);
    try {
      // Preview from backend (no local algorithm)
      const preview = await autoAssignPreview(weekStart);
      if (preview.conflicts.length > 0) {
        const conflictMsg = preview.conflicts.join(' ');
        showNotification?.(`Auto assign has unresolved conflicts: ${conflictMsg}`, 'error');
        return { ok: false, plan: preview, message: conflictMsg };
      }
      // Apply backend plan and reload week from the returned payload
      const week = await autoAssignApply(weekStart, preview);
      applyWeek(week);
      showNotification?.(
        `Auto assign applied: ${preview.employeesAffected} employee(s), Delivery ${preview.delivery}, Repair ${preview.repair}, Office ${preview.office}, Collection ${preview.collection}.`,
        'success'
      );
      return { ok: true, plan: preview };
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      showNotification?.(message, 'error');
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }, [canEditWeek, weekStatus, weekStart, applyWeek, showNotification]);

  const submitCurrentWeek = useCallback(async (): Promise<boolean> => {
    if (weekStatus === 'Locked') {
      showNotification?.('This week is locked.', 'error');
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const week = await submitDutyPlannerWeek(weekStart);
      applyWeek(week);
      showNotification?.('Week submitted successfully.', 'success');
      return true;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      showNotification?.(message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [weekStatus, weekStart, applyWeek, showNotification]);

  return {
    employees,
    assignments,
    weekDays,
    loading,
    saving,
    error,
    filters,
    setFilters,
    getAssignment,
    updateAssignment,
    deleteAssignment,
    moveWeek,
    resetFilters,
    selectedCell,
    setSelectedCell,
    showPicker,
    setShowPicker,
    allRoles,
    weekStart,
    weekEnd,
    weekStatus,
    canEditWeek,
    saturday,
    validation,
    autoAssignAll,
    submitCurrentWeek,
  };
}