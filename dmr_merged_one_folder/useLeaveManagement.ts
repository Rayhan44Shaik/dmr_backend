// src/modules/staff/hooks/useLeaveManagement.ts
// Leave Management + Leave Report — fully PostgreSQL/API backed. No localStorage.
// Authoritative sources:
//   - Leave requests: leaveService -> GET/POST/PATCH/DELETE /api/staff/leaves
//   - Leave report:   leaveService -> GET /api/staff/leaves/report
//   - Employees:      masters employeeService -> GET /api/masters/employees

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listLeaves,
  createLeave,
  updateLeaveStatus,
  deleteLeave as deleteLeaveApi,
  getLeaveReport,
} from '../services/leaveService';
import { loadEmployees } from '../../masters/employees/services/employeeService';
import type { Employee } from '../../masters/employees/types/employee';
import type {
  LeaveRequest,
  LeaveListResult,
  LeaveReport,
  LeaveReportItem,
} from '../types/staffDashboard';

type NotificationFn = (message: string, type?: 'success' | 'error' | 'info') => void;

export interface LeaveFilters {
  status: 'All' | 'Pending' | 'Approved' | 'Rejected';
  month: string;
  department: string;
  employeeId: number | null;
  leaveType: 'All' | 'Casual' | 'Sick' | 'Emergency' | 'Annual';
  search: string;
}

const DEFAULT_FILTERS: LeaveFilters = {
  status: 'Pending',
  month: new Date().toISOString().slice(0, 7),
  department: '',
  employeeId: null,
  leaveType: 'All',
  search: '',
};

export function useLeaveManagement(showNotification?: NotificationFn) {
  const notify = useMemo(
    () => showNotification || ((msg: string) => console.log(msg)),
    [showNotification]
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState<LeaveFilters>(DEFAULT_FILTERS);
  const [list, setList] = useState<LeaveListResult>({ items: [], total: 0, page: 1, limit: 100, totalPages: 0 });
  const [report, setReport] = useState<LeaveReport>({ month: DEFAULT_FILTERS.month, items: [] });
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // Authoritative Employee Master from the backend.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadEmployees();
        if (active) setEmployees(Array.isArray(data) ? data : []);
      } catch {
        if (active) setEmployees([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const fetchList = useCallback(async () => {
    return listLeaves({
      status: filters.status,
      month: filters.month || undefined,
      department: filters.department || undefined,
      employeeId: filters.employeeId ?? undefined,
      leaveType: filters.leaveType === 'All' ? undefined : filters.leaveType,
      search: filters.search || undefined,
      page: 1,
      limit: 200,
    });
  }, [filters.status, filters.month, filters.department, filters.employeeId, filters.leaveType, filters.search]);

  const fetchReport = useCallback(async () => {
    return getLeaveReport({
      month: filters.month,
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    });
  }, [filters.month, filters.department, filters.employeeId]);

  // Initial + filter-change loads. The async IIFE only touches state after an
  // await, so it never triggers a synchronous setState cascade inside an effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchList();
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load leave requests.');
          setList({ items: [], total: 0, page: 1, limit: 200, totalPages: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchReport();
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) {
          setReportError(e instanceof Error ? e.message : 'Failed to load leave report.');
          setReport({ month: filters.month, items: [] });
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchReport, filters.month]);

  const stats = useMemo(() => {
    const requests = list.items;
    return {
      approved: requests.filter((l) => l.status === 'Approved').length,
      pending: requests.filter((l) => l.status === 'Pending').length,
      rejected: requests.filter((l) => l.status === 'Rejected').length,
      onLeaveToday: report.items.filter((r) => r.approvedLeaveDays > 0).length,
      approvedDays: report.items.reduce((s, r) => s + r.approvedLeaveDays, 0),
    };
  }, [list.items, report.items]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e?.department) set.add(String(e.department));
    });
    return Array.from(set).sort();
  }, [employees]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setReportLoading(true);
    setReportError(null);
    fetchList()
      .then((data) => setList(data))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load leave requests.');
        setList({ items: [], total: 0, page: 1, limit: 200, totalPages: 0 });
      })
      .finally(() => setLoading(false));
    fetchReport()
      .then((data) => setReport(data))
      .catch((e) => {
        setReportError(e instanceof Error ? e.message : 'Failed to load leave report.');
        setReport({ month: filters.month, items: [] });
      })
      .finally(() => setReportLoading(false));
  }, [fetchList, fetchReport, filters.month]);

  const setFilter = useCallback(<K extends keyof LeaveFilters>(key: K, value: LeaveFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const addLeave = useCallback(
    async (input: {
      employeeId: number;
      type: LeaveRequest['type'];
      fromDate: string;
      toDate: string;
      days?: number;
      reason?: string;
    }) => {
      try {
        await createLeave(input);
        notify('Leave request submitted successfully!', 'success');
        refresh();
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not submit leave request.', 'error');
        return false;
      }
    },
    [notify, refresh]
  );

  const approveLeave = useCallback(
    async (id: string, approvedBy?: string) => {
      try {
        await updateLeaveStatus(id, 'Approved', { approvedBy: approvedBy || 'Admin' });
        notify('Leave approved!', 'success');
        refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not approve leave.', 'error');
      }
    },
    [notify, refresh]
  );

  const rejectLeave = useCallback(
    async (id: string, rejectionReason: string) => {
      if (!rejectionReason.trim()) {
        notify('Please provide a rejection reason.', 'error');
        return;
      }
      try {
        await updateLeaveStatus(id, 'Rejected', { rejectionReason });
        notify('Leave rejected.', 'info');
        refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not reject leave.', 'error');
      }
    },
    [notify, refresh]
  );

  const deleteLeave = useCallback(
    async (id: string) => {
      try {
        await deleteLeaveApi(id);
        notify('Leave request deleted.', 'info');
        refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not delete leave.', 'error');
      }
    },
    [notify, refresh]
  );

  return {
    leaves: list.items,
    allLeaves: list.items,
    report,
    reportLoading,
    reportError,
    stats,
    loading,
    error,
    filters,
    setFilter,
    resetFilters,
    employees,
    departments,
    addLeave,
    approveLeave,
    rejectLeave,
    deleteLeave,
    refresh,
  };
}

export type { LeaveReportItem };
