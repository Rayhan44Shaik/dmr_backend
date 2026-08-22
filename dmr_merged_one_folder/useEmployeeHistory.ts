// src/modules/staff/hooks/useEmployeeHistory.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { loadEmployees, loadTrips, loadLeaveRequests, loadSalaryRecords } from '../services/staffService';
import type { HistoryEvent } from '../types/staffDashboard';

export function useEmployeeHistory(employeeId: number | null) {
  const [employee, setEmployee] = useState<any>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const employees = loadEmployees();
      const emp = employees.find((e) => e.id === employeeId);
      setEmployee(emp || null);

      const trips = loadTrips();
      const leaves = loadLeaveRequests();
      const salaries = loadSalaryRecords();

      const historyEvents: HistoryEvent[] = [];

      // Trip events
      trips
        .filter((t) => t.driverName === emp?.employeeName || t.supervisorName === emp?.employeeName)
        .forEach((t) => {
          historyEvents.push({
            id: `trip-${t.id}`,
            date: t.tripDate,
            module: 'Trips',
            event: `Trip ${t.tripNo} Completed`,
            details: `${t.totalBirds} birds, ${t.totalWeight} KG, ${t.totalShops} shops`,
            icon: 'truck',
          });
        });

      // Leave events
      leaves
        .filter((l) => l.employeeId === employeeId)
        .forEach((l) => {
          historyEvents.push({
            id: `leave-${l.id}`,
            date: l.createdAt,
            module: 'Leave',
            event: `${l.type} Leave ${l.status}`,
            details: `${l.fromDate} to ${l.toDate} (${l.days} days)`,
            icon: 'calendar',
          });
        });

      // Salary events
      salaries
        .filter((s) => s.employeeId === employeeId)
        .forEach((s) => {
          historyEvents.push({
            id: `salary-${s.id}`,
            date: s.createdAt,
            module: 'Salary',
            event: `Salary ${s.status}`,
            details: `₹${s.netSalary.toLocaleString()}`,
            icon: 'rupee',
          });
        });

      // Sort by date descending
      historyEvents.sort((a, b) => b.date.localeCompare(a.date));

      setEvents(historyEvents);
    } catch (error) {
      console.error('Failed to load employee history:', error);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    if (!employee) return null;
    const trips = loadTrips().filter(
      (t) => t.driverName === employee.employeeName || t.supervisorName === employee.employeeName
    );
    return {
      totalTrips: trips.length,
      totalDistance: 0, // would come from trip data
      totalBirds: trips.reduce((sum, t) => sum + t.totalBirds, 0),
      totalWeight: trips.reduce((sum, t) => sum + t.totalWeight, 0),
    };
  }, [employee]);

  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  return {
    employee,
    events,
    stats,
    loading,
    refresh,
  };
}