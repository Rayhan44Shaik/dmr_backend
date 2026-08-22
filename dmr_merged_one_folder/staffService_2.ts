import type {
  Employee,
  Trip,
  LeaveRequest,
  SalaryRecord,
  AdvanceLoan,
  AttendanceRecord,
  StaffDashboardData,
  LeaveBalance,
  ShiftConfig,
} from '../types/staffDashboard';

// ============================================================
// CACHE HELPERS
// ============================================================
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

function clearCache(prefix: string): void {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith(prefix)) {
      localStorage.removeItem(key);
    }
  });
}

// ============================================================
// DATA LOADERS
// ============================================================
export function loadEmployees(): Employee[] {
  const raw = localStorage.getItem('dmr-employees');
  return raw ? JSON.parse(raw) : [];
}

export function loadTrips(): Trip[] {
  const raw = localStorage.getItem('vehicleTrips');
  return raw ? JSON.parse(raw) : [];
}

export function loadLeaveRequests(): LeaveRequest[] {
  const raw = localStorage.getItem('dmr-leave-requests');
  return raw ? JSON.parse(raw) : [];
}

export function loadSalaryRecords(): SalaryRecord[] {
  const raw = localStorage.getItem('dmr-salary-records');
  return raw ? JSON.parse(raw) : [];
}

export function loadAdvanceLoans(): AdvanceLoan[] {
  const raw = localStorage.getItem('dmr-advance-loans');
  return raw ? JSON.parse(raw) : [];
}

export function loadAttendanceRecords(): AttendanceRecord[] {
  const raw = localStorage.getItem('dmr-attendance-records');
  return raw ? JSON.parse(raw) : [];
}

// ============================================================
// SAVE HELPERS
// ============================================================
export function saveLeaveRequests(leaves: LeaveRequest[]): void {
  localStorage.setItem('dmr-leave-requests', JSON.stringify(leaves));
}

export function saveSalaryRecords(salaries: SalaryRecord[]): void {
  localStorage.setItem('dmr-salary-records', JSON.stringify(salaries));
}

export function saveAdvanceLoans(records: AdvanceLoan[]): void {
  localStorage.setItem('dmr-advance-loans', JSON.stringify(records));
}

export function saveAttendanceRecords(records: AttendanceRecord[]): void {
  localStorage.setItem('dmr-attendance-records', JSON.stringify(records));
}

// ============================================================
// DASHBOARD AGGREGATION
// ============================================================
const DASHBOARD_CACHE_KEY = 'staff-dashboard-cache';

export function getStaffDashboardData(
  fromDate: string,
  toDate: string,
  department: string
): StaffDashboardData {
  const cacheKey = `${DASHBOARD_CACHE_KEY}_${fromDate}_${toDate}_${department}`;
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

export function clearStaffDashboardCache(): void {
  clearCache(DASHBOARD_CACHE_KEY);
}

// ============================================================
// LEAVE MANAGEMENT – BALANCE HELPERS
// ============================================================

export function getLeaveBalance(employeeId: number): LeaveBalance | null {
  const employees = loadEmployees();
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return null;

  const leaves = loadLeaveRequests().filter(
    (l) => l.employeeId === employeeId && l.status === 'Approved'
  );
  const usedDays = leaves.reduce((sum, l) => sum + l.days, 0);

  const quotas = {
    casual: 12,
    sick: 10,
    emergency: 5,
    annual: 15,
  };

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

// ============================================================
// DUTY PLANNER HELPERS
// ============================================================

export function getShiftConfigs(): ShiftConfig[] {
  return [
    { type: 'Driver', label: 'Driver', bgColor: 'bg-blue-100', textColor: 'text-blue-700', borderColor: 'border-blue-300' },
    { type: 'Delivery', label: 'Delivery', bgColor: 'bg-green-100', textColor: 'text-green-700', borderColor: 'border-green-300' },
    { type: 'Rest', label: 'Rest', bgColor: 'bg-slate-100', textColor: 'text-slate-600', borderColor: 'border-slate-300' },
    { type: 'Repair', label: 'Repair', bgColor: 'bg-amber-100', textColor: 'text-amber-700', borderColor: 'border-amber-300' },
    { type: 'Office', label: 'Office', bgColor: 'bg-indigo-100', textColor: 'text-indigo-700', borderColor: 'border-indigo-300' },
    { type: 'OfficeDuty', label: 'Office Duty', bgColor: 'bg-indigo-50', textColor: 'text-indigo-600', borderColor: 'border-indigo-200' },
    { type: 'Collection', label: 'Collection', bgColor: 'bg-teal-100', textColor: 'text-teal-700', borderColor: 'border-teal-300' },
    { type: 'WeeklyOff', label: 'Weekly Off', bgColor: 'bg-rose-100', textColor: 'text-rose-700', borderColor: 'border-rose-300' },
  ];
}

// ============================================================
// ATTENDANCE REGISTER HELPERS
// ============================================================

export function getAttendanceMonthMatrix(_month: string, department: string): AttendanceRecord[] {
  const employees = loadEmployees();
  let filtered = employees;
  if (department) filtered = filtered.filter(e => e.department === department);

  const allRecords = loadAttendanceRecords();
  // TODO: Filter by _month when data model includes a month field.
  const monthRecords = allRecords;

  if (monthRecords.length === 0) {
    return filtered.map(emp => ({
      employeeId: emp.id,
      employeeName: emp.employeeName,
      department: emp.department,
      presentCount: 0,
      absentCount: 0,
      leaveCount: 0,
      halfDayCount: 0,
    }));
  }

  return monthRecords;
}

export function saveAttendanceRecord(record: AttendanceRecord): void {
  const records = loadAttendanceRecords();
  const index = records.findIndex(r => r.employeeId === record.employeeId);
  if (index !== -1) {
    records[index] = record;
  } else {
    records.push(record);
  }
  saveAttendanceRecords(records);
}

// ============================================================
// CLEAR ALL STAFF CACHE
// ============================================================
const CACHE_KEYS = {
  DASHBOARD: 'staff-dashboard-cache',
  DUTY_PLANNER: 'staff-duty-planner-cache',
  ATTENDANCE: 'staff-attendance-cache',
  LEAVE: 'staff-leave-cache',
  SALARY_SHEET: 'staff-salary-sheet-cache',
  SALARY_REGISTER: 'staff-salary-register-cache',
  ADVANCE_LOAN: 'staff-advance-loan-cache',
  EMPLOYEE_HISTORY: 'staff-employee-history-cache',
  DRIVER_PERFORMANCE: 'staff-driver-performance-cache',
  SUPERVISOR_PERFORMANCE: 'staff-supervisor-performance-cache',
};

export const STAFF_CACHE_KEYS = CACHE_KEYS;

export function clearAllStaffCache(): void {
  Object.values(CACHE_KEYS).forEach((key) => {
    clearCache(key);
  });
}