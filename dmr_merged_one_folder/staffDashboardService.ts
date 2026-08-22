// src/modules/staff/services/staffService.ts

import type {
  Employee,
  Trip,
  LeaveRequest,
  SalaryRecord,
  StaffDashboardData,
  LeaveBalance, // ✅ added
} from '../types/staffDashboard';

// -------- Cache Helpers --------
const CACHE_KEY = 'staff-dashboard-cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCache<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  localStorage.setItem(key, JSON.stringify(entry));
}

// -------- Data Loaders --------
function loadEmployees(): Employee[] {
  const raw = localStorage.getItem('dmr-employees');
  return raw ? JSON.parse(raw) : [];
}

function loadTrips(): Trip[] {
  const raw = localStorage.getItem('vehicleTrips');
  return raw ? JSON.parse(raw) : [];
}

function loadLeaveRequests(): LeaveRequest[] {
  const raw = localStorage.getItem('dmr-leave-requests');
  return raw ? JSON.parse(raw) : [];
}

function loadSalaryRecords(): SalaryRecord[] {
  const raw = localStorage.getItem('dmr-salary-records');
  return raw ? JSON.parse(raw) : [];
}

// -------- Aggregation Logic (Dashboard) --------
export function getStaffDashboardData(
  fromDate: string,
  toDate: string,
  department: string
): StaffDashboardData {
  const cacheKey = `${CACHE_KEY}_${fromDate}_${toDate}_${department}`;
  const cached = getCache<StaffDashboardData>(cacheKey);
  if (cached) return cached;

  const employees = loadEmployees();
  const trips = loadTrips();
  const leaves = loadLeaveRequests();
  const salaries = loadSalaryRecords();

  const filteredEmployees = department
    ? employees.filter((e) => e.department === department)
    : employees;

  const today = new Date().toISOString().split('T')[0];

  const totalEmployees = filteredEmployees.length;

  const presentToday = filteredEmployees.filter((emp) =>
    trips.some(
      (trip) =>
        trip.tripDate === today &&
        (trip.driverName === emp.employeeName ||
          trip.supervisorName === emp.employeeName)
    )
  ).length;

  const onDutyToday = filteredEmployees.filter((emp) =>
    trips.some(
      (trip) =>
        trip.tripDate === today &&
        (trip.driverName === emp.employeeName ||
          trip.supervisorName === emp.employeeName)
    )
  ).length;

  const onLeave = filteredEmployees.filter((emp) =>
    leaves.some(
      (leave) =>
        leave.employeeId === emp.id &&
        leave.status === 'Approved' &&
        leave.fromDate <= today &&
        leave.toDate >= today
    )
  ).length;

  const salaryPending = salaries.filter(
    (s) => s.status === 'Pending'
  ).length;

  const dutyAllocation = [
    { label: 'Delivery', value: 0, color: '#8B5CF6' },
    { label: 'Repair', value: 0, color: '#60A5FA' },
    { label: 'Office Duty', value: 0, color: '#FCD34D' },
    { label: 'Collection', value: 0, color: '#34D399' },
  ];

  const completedTrips = trips.filter((t) => t.status === 'Completed');
  const totalCompleted = completedTrips.length || 1;

  dutyAllocation[0].value = Math.round(
    (completedTrips.filter((t) => t.driverName).length / totalCompleted) * 100
  );
  dutyAllocation[1].value = Math.round(
    (completedTrips.filter((t) => t.vehicleNo.includes('R')).length / totalCompleted) * 100
  );
  dutyAllocation[2].value = Math.round(
    (completedTrips.filter((t) => t.supervisorName.includes('Office')).length / totalCompleted) * 100
  );
  dutyAllocation[3].value =
    100 -
    dutyAllocation[0].value -
    dutyAllocation[1].value -
    dutyAllocation[2].value;

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyAttendance = daysOfWeek.map((day, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dateStr = date.toISOString().split('T')[0];

    const present = filteredEmployees.filter((emp) =>
      trips.some(
        (trip) =>
          trip.tripDate === dateStr &&
          (trip.driverName === emp.employeeName ||
            trip.supervisorName === emp.employeeName)
      )
    ).length;

    const leave = filteredEmployees.filter((emp) =>
      leaves.some(
        (leave) =>
          leave.employeeId === emp.id &&
          leave.status === 'Approved' &&
          leave.fromDate <= dateStr &&
          leave.toDate >= dateStr
      )
    ).length;

    const absent = totalEmployees - present - leave;
    return { day, present, absent, leave };
  });

  const onDutyEmployees = filteredEmployees
    .filter((emp) =>
      trips.some(
        (trip) =>
          trip.tripDate === today &&
          (trip.driverName === emp.employeeName ||
            trip.supervisorName === emp.employeeName)
      )
    )
    .map((emp) => {
      const trip = trips.find(
        (t) =>
          t.tripDate === today &&
          (t.driverName === emp.employeeName ||
            t.supervisorName === emp.employeeName)
      );
      const dutyType = emp.department === 'Driver' ? 'Delivery' : 'Repair';
      const vehicle = trip?.vehicleNo || 'N/A';
      const status: 'Active' | 'Delayed' = Math.random() > 0.2 ? 'Active' : 'Delayed';
      return {
        id: emp.id,
        name: emp.employeeName,
        role: emp.role,
        dutyType,
        vehicle,
        status,
        avatar: emp.avatar,
      };
    });

  const result: StaffDashboardData = {
    totalEmployees,
    presentToday,
    onDutyToday,
    onLeave,
    salaryPending,
    dutyAllocation,
    weeklyAttendance,
    onDutyEmployees,
  };

  setCache(cacheKey, result);
  return result;
}

// -------- Force Refresh (clear cache) --------
export function clearStaffDashboardCache(): void {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith(CACHE_KEY)) {
      localStorage.removeItem(key);
    }
  });
}

// ============================================================
// 🆕 LEAVE MANAGEMENT – BALANCE HELPERS
// ============================================================

export function getLeaveBalance(employeeId: number): LeaveBalance | null {
  const employees = loadEmployees();
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return null;

  const leaves = loadLeaveRequests().filter(
    (l) => l.employeeId === employeeId && l.status === 'Approved'
  );
  const usedDays = leaves.reduce((sum, l) => sum + l.days, 0);

  // Default leave quotas (in a real app, these come from employee settings)
  const quotas = {
    casual: 12,
    sick: 10,
    emergency: 5,
    annual: 15,
  };

  // Calculate remaining per type (simplified deduction order)
  let remaining = usedDays;
  const casualRemaining = Math.max(0, quotas.casual - Math.min(remaining, quotas.casual));
  remaining -= quotas.casual - casualRemaining;
  const sickRemaining = Math.max(0, quotas.sick - Math.min(remaining, quotas.sick));
  remaining -= quotas.sick - sickRemaining;
  const emergencyRemaining = Math.max(0, quotas.emergency - Math.min(remaining, quotas.emergency));
  remaining -= quotas.emergency - emergencyRemaining;
  const annualRemaining = Math.max(0, quotas.annual - Math.min(remaining, quotas.annual));

  const total = quotas.casual + quotas.sick + quotas.emergency + quotas.annual;

  return {
    employeeId,
    employeeName: employee.employeeName,
    casual: casualRemaining,
    sick: sickRemaining,
    emergency: emergencyRemaining,
    annual: annualRemaining,
    total,
    used: usedDays,
    remaining: Math.max(0, total - usedDays),
  };
}

export function getAllLeaveBalances(): LeaveBalance[] {
  const employees = loadEmployees();
  return employees
    .map((e) => getLeaveBalance(e.id))
    .filter((b): b is LeaveBalance => b !== null);
}