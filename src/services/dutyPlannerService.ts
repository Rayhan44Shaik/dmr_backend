// src/services/dutyPlannerService.ts
// Production Duty Planner — PostgreSQL-backed weekly duty scheduling.

import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import type { DutyAssignment } from "../types/models.js";

export type DutyType = DutyAssignment["dutyType"];
export interface DutyWeek {
  weekStart: string;
  weekEnd: string;
  status: string;
  lockReason?: string;
  days: { date: string; weekday: string }[];
  employees: { id: number; employeeNo: number; name: string; department: string; role: string; status: string; license: string; active: boolean; onApprovedLeave: string[] }[];
  assignments: DutyAssignment[];
  perEmployee: Record<number, { worked: number; delivery: number; repair: number; office: number; collection: number; weeklyOff: number; leave: number; weekOffDay: string | null }>;
  vehicles: { id: number; vehicleNo: string; vehicleNumber: string; active: boolean }[];
  trips: { id: number; tripNo: string; tripDate: string; vehicleId: number | null; driverId: number | null; supervisorId: number | null }[];
  maintenance: { id: number; vehicleId: number | null; vehicleNumber: string; serviceDate: string; serviceType: string; status: string }[];
  saturday: { required: number; assigned: number; shortage: number; status: string; requiredByRole: Record<string, number>; assignedByRole: Record<string, number>; availableByRole: Record<string, number> };
  validation: { ok: boolean; problems: string[] };
}

export interface PlanRow { employeeId: number; employeeName: string; department: string; role: string; date: string; dutyType: DutyType; vehicleId?: number | null; vehicleNo?: string | null; proposed: boolean }
export interface AutoPlan { employeesAffected: number; delivery: number; repair: number; office: number; collection: number; weeklyOff: number; saturdayRequired: number; saturdayAssigned: number; saturdayShortage: number; conflicts: string[]; rows: PlanRow[] }

interface AssignmentInput { employeeId: number; employeeName?: string; department?: string; role?: string; dutyType: DutyType; date: string; vehicleId?: number | null; vehicleNo?: string | null }

interface EmpRow { id: number; employee_no: number; employee_name: string; department: string; role: string; status: string; license_number: string | null }

function weekDays(weekStart: string): { date: string; weekday: string }[] {
  const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return { date: d.toISOString().slice(0, 10), weekday: labels[i] }; });
}
function mondayOf(dateStr: string): string { const d = new Date(dateStr + "T00:00:00Z"); const day = d.getUTCDay(); const diff = day === 0 ? -6 : 1 - day; d.setUTCDate(d.getUTCDate() + diff); return d.toISOString().slice(0, 10); }
function isSat(date: string): boolean { return new Date(date + "T00:00:00Z").getUTCDay() === 6; }

async function getOrCreateWeek(weekStart: string, weekEnd: string) {
  const existing = await query("SELECT * FROM duty_weeks WHERE week_start = $1", [weekStart]);
  if (existing.rows.length) return existing.rows[0];
  const inserted = await query("INSERT INTO duty_weeks (week_start, week_end, status) VALUES ($1,$2,'Open') ON CONFLICT (week_start) DO UPDATE SET week_end = EXCLUDED.week_end RETURNING *", [weekStart, weekEnd]);
  return inserted.rows[0];
}

async function weekIsLocked(weekStart: string, weekEnd: string): Promise<string | null> {
  const week = await getOrCreateWeek(weekStart, weekEnd);
  if (week.status === "Locked") return "This week is locked and cannot be modified.";
  if (week.status === "Submitted") return "This week is submitted and changes are restricted.";
  const today = dateOnly(new Date().toISOString()) ?? "";
  if (weekEnd < today) return "Previous completed weeks are locked and cannot be modified.";
  return null;
}

function mapAssignment(row: Record<string, unknown>): DutyAssignment {
  return { id: str(row.id), employeeId: num(row.employee_id), employeeName: str(row.employee_name), department: str(row.department), role: str(row.role), dutyType: str(row.duty_type) as DutyAssignment["dutyType"], date: dateOnly(row.duty_date) ?? "", vehicleId: row.vehicle_id == null ? null : num(row.vehicle_id), vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no) };
}

export async function validateAssignment(input: AssignmentInput, opts: { ignoreId?: string } = {}): Promise<void> {
  const weekStart = mondayOf(input.date);
  const weekEnd = weekDays(weekStart)[6].date;
  const locked = await weekIsLocked(weekStart, weekEnd); if (locked) throw new AppError(409, locked);
  const empRows = await query("SELECT id, employee_no, employee_name, department, role, status FROM employees WHERE id = $1", [input.employeeId]);
  if (!empRows.rows.length) throw new AppError(422, "Employee not found.");
  const emp = empRows.rows[0];
  if (emp.status !== "Active") throw new AppError(422, "Inactive or suspended employees cannot be assigned duty.");
  const leave = await query("SELECT 1 FROM leave_requests WHERE employee_id = $1 AND status = 'Approved' AND from_date <= $2 AND to_date >= $2 LIMIT 1", [input.employeeId, input.date]);
  if (leave.rows.length) throw new AppError(422, "Employee is on approved leave on this date.");
  const existing = await query("SELECT id FROM duty_assignments WHERE employee_id = $1 AND duty_date = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)", [input.employeeId, input.date, opts.ignoreId ?? null]);
  if (existing.rows.length) throw new AppError(422, "Employee already has a duty assignment on this date.");
  if (isSat(input.date) && ["WeeklyOff", "Rest"].includes(input.dutyType)) throw new AppError(422, "Saturday is compulsory duty. Weekly Off and Rest cannot be assigned on Saturday.");
  if (input.vehicleId != null && ["Delivery", "Driver", "Repair"].includes(input.dutyType)) {
    const sameVeh = await query("SELECT id FROM duty_assignments WHERE vehicle_id = $1 AND duty_date = $2 AND duty_type IN ('Delivery','Driver','Repair') AND ($3::uuid IS NULL OR id <> $3::uuid)", [input.vehicleId, input.date, opts.ignoreId ?? null]);
    if (sameVeh.rows.length) throw new AppError(422, "This vehicle already has an assignment on this date.");
    const onOther = await query("SELECT id FROM duty_assignments WHERE employee_id = $1 AND duty_date = $2 AND vehicle_id IS NOT NULL AND vehicle_id <> $3 AND ($4::uuid IS NULL OR id <> $4::uuid)", [input.employeeId, input.date, input.vehicleId, opts.ignoreId ?? null]);
    if (onOther.rows.length) throw new AppError(422, "Employee is already assigned to another vehicle on this date.");
  }
  if (input.vehicleId != null) { const v = await query("SELECT id, vehicle_number FROM vehicles WHERE id = $1", [input.vehicleId]); if (!v.rows.length) throw new AppError(422, "Assigned vehicle does not exist."); }
  if (emp.role === "Supervisor" && ["Delivery", "Driver"].includes(input.dutyType)) {
    const supConflict = await query("SELECT id FROM duty_assignments WHERE employee_id = $1 AND duty_date = $2 AND duty_type IN ('Delivery','Driver') AND ($3::uuid IS NULL OR id <> $3::uuid)", [input.employeeId, input.date, opts.ignoreId ?? null]);
    if (supConflict.rows.length) throw new AppError(422, "Supervisor is already covering another delivery on this date.");
  }
}

export async function getDutyWeek(weekStart: string): Promise<DutyWeek> {
  const ms = mondayOf(weekStart); const days = weekDays(ms); const weekEnd = days[6].date;
  const week = await getOrCreateWeek(ms, weekEnd);
  const [empRes, leaves, assignRes, vehRes, tripRes, maintRes] = await Promise.all([
    query("SELECT id, employee_no, employee_name, department, role, status, license_number FROM employees ORDER BY employee_no"),
    query("SELECT employee_id, from_date, to_date FROM leave_requests WHERE status='Approved'"),
    query("SELECT * FROM duty_assignments WHERE duty_date BETWEEN $1 AND $2 ORDER BY duty_date, employee_name", [ms, weekEnd]),
    query("SELECT id, vehicle_no, vehicle_number, status FROM vehicles ORDER BY id"),
    query("SELECT id, trip_no, trip_date, vehicle_id, driver_id, supervisor_id FROM trips WHERE deleted = false AND trip_date BETWEEN $1 AND $2", [ms, weekEnd]),
    query("SELECT id, vehicle_id, maintenance_date, service_type, status FROM fleet_maintenance WHERE deleted = false AND maintenance_date BETWEEN $1 AND $2", [ms, weekEnd])
  ]);
  const employeesRaw = empRes.rows as EmpRow[];
  const leaveDatesByEmp: Record<number, Set<string>> = {};
  for (const l of leaves.rows) { const id = num(l.employee_id); let d = new Date((dateOnly(l.from_date) ?? "") + "T00:00:00Z"); const dend = new Date((dateOnly(l.to_date) ?? "") + "T00:00:00Z"); while (d <= dend) { (leaveDatesByEmp[id] = leaveDatesByEmp[id] || new Set()).add(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } }
  const employees = employeesRaw.map((e) => ({ id: e.id, employeeNo: e.employee_no, name: e.employee_name, department: e.department, role: e.role || e.department, status: e.status, license: e.license_number ?? "", active: e.status === "Active", onApprovedLeave: leaveDatesByEmp[e.id] ? Array.from(leaveDatesByEmp[e.id]) : [] }));
  const assignments = assignRes.rows.map(mapAssignment);
  const perEmployee: DutyWeek["perEmployee"] = {};
  for (const e of employeesRaw) {
    const ea = assignments.filter((a) => a.employeeId === e.id);
    const wo = ea.find((a) => a.dutyType === "WeeklyOff");
    perEmployee[e.id] = { worked: ea.filter((a) => a.dutyType !== "WeeklyOff").length, delivery: ea.filter((a) => a.dutyType === "Delivery").length, repair: ea.filter((a) => a.dutyType === "Repair").length, office: ea.filter((a) => ["Office","OfficeDuty"].includes(a.dutyType)).length, collection: ea.filter((a) => a.dutyType === "Collection").length, weeklyOff: ea.filter((a) => a.dutyType === "WeeklyOff").length, leave: (leaveDatesByEmp[e.id] ? [...leaveDatesByEmp[e.id]].filter((d) => d >= ms && d <= weekEnd).length : 0), weekOffDay: wo ? wo.date : null };
  }
  const saturdayDate = days.find((d) => d.weekday === "Sat")?.date ?? "";
  const activeByRole: Record<string, number> = {}; const availableByRole: Record<string, number> = {};
  for (const e of employees) { if (!e.active) continue; const r = e.role || e.department; activeByRole[r] = (activeByRole[r] || 0) + 1; if (!e.onApprovedLeave.includes(saturdayDate)) availableByRole[r] = (availableByRole[r] || 0) + 1; }
  const requiredByRole = { ...activeByRole };
  const satAssignments = assignments.filter((a) => a.date === saturdayDate);
  const assignedByRole: Record<string, number> = {};
  for (const a of satAssignments) { if (a.dutyType === "WeeklyOff") continue; assignedByRole[a.role || a.department] = (assignedByRole[a.role || a.department] || 0) + 1; }
  const satRequirement = Object.values(requiredByRole).reduce((a, b) => a + b, 0);
  const satAssigned = satAssignments.filter((a) => a.dutyType !== "WeeklyOff").length;
  const satShortage = Math.max(0, satRequirement - satAssigned);
  const saturday = { required: satRequirement, assigned: satAssigned, shortage: satShortage, status: satShortage > 0 ? "Staff Shortage" : "Fully Assigned", requiredByRole, assignedByRole, availableByRole };
  const problems: string[] = [];
  for (const a of assignments) { if ((leaveDatesByEmp[a.employeeId] || new Set()).has(a.date)) problems.push(a.employeeName + " is on approved leave on " + a.date + "."); const em = employees.find((x) => x.id === a.employeeId); if (em && !em.active) problems.push(a.employeeName + " is inactive but has a duty assignment."); }
  const vehKey = new Set<string>(); const empKey = new Set<string>();
  for (const a of assignments) { const ek = a.employeeId + "|" + a.date; if (empKey.has(ek)) problems.push(a.employeeName + " has more than one duty on " + a.date + "."); empKey.add(ek); if (a.vehicleId != null) { const vk = a.vehicleId + "|" + a.date; if (vehKey.has(vk)) problems.push("Vehicle " + a.vehicleNo + " has more than one driver on " + a.date + "."); vehKey.add(vk); } }
  if (satShortage > 0) problems.push("Saturday requires " + satShortage + " more assigned employee(s).");
    return {
    weekStart: ms,
    weekEnd,
    status: week.status,
    days,
    employees,
    assignments,
    perEmployee,
    vehicles: vehRes.rows.map((v) => ({
      id: num(v.id),
      vehicleNo: num(v.vehicle_no).toString(),
      vehicleNumber: str(v.vehicle_number),
      active: v.status === "Active",
    })),
    trips: tripRes.rows.map((t) => ({
      id: num(t.id),
      tripNo: str(t.trip_no),
      tripDate: dateOnly(t.trip_date) ?? "",
      vehicleId: t.vehicle_id == null ? null : num(t.vehicle_id),
      driverId: t.driver_id == null ? null : num(t.driver_id),
      supervisorId: t.supervisor_id == null ? null : num(t.supervisor_id),
    })),
    maintenance: maintRes.rows.map((m) => ({
      id: num(m.id),
      vehicleId: m.vehicle_id == null ? null : num(m.vehicle_id),
      vehicleNumber: str(m.vehicle_number || ""),
      serviceDate: dateOnly(m.maintenance_date) ?? "",
      serviceType: str(m.service_type),
      status: str(m.status),
    })),
    saturday,
    validation: {
      ok: problems.length === 0,
      problems,
    },
  };
}
function buildPlan(week: DutyWeek): AutoPlan {
  const rows: PlanRow[] = []; const conflicts: string[] = [];
  const active = week.employees.filter((e) => e.active);
  const onLeave = (eId: number, date: string) => week.employees.find((e) => e.id === eId)?.onApprovedLeave.includes(date) ?? false;
  const workedDays: Record<number, number> = {};
  for (const e of week.employees) workedDays[e.id] = 0;
  for (const a of week.assignments) workedDays[a.employeeId] = (workedDays[a.employeeId] || 0) + 1;
  const pick = (pool: typeof active, date: string, duty: DutyType, vehicleId?: number, vehicleNo?: string): PlanRow | null => {
    const sorted = [...pool].filter((e) => !onLeave(e.id, date)).sort((a, b) => workedDays[a.id] - workedDays[b.id]);
    for (const e of sorted) {
      if (rows.some((r) => r.date === date && r.employeeId === e.id && r.dutyType !== "WeeklyOff")) continue;
      if (isSat(date) && ["WeeklyOff", "Rest"].includes(duty)) continue;
      rows.push({ employeeId: e.id, employeeName: e.name, department: e.department, role: e.role, date, dutyType: duty, vehicleId, vehicleNo, proposed: true });
      workedDays[e.id] = (workedDays[e.id] || 0) + 1;
      return rows[rows.length - 1];
    }
    return null;
  };
  const activeVehicles = week.vehicles.filter((v) => v.active);
  const drivers = active.filter((e) => e.role === "Driver");
  const helpers = active.filter((e) => e.role === "Helper");
  const loaders = active.filter((e) => e.role === "Loader");
  const supervisors = active.filter((e) => e.role === "Supervisor");
  const officePool = active.filter((e) => e.role === "Office Staff" || e.role === "Accountant" || e.department === "Office Staff" || e.department === "Accountant");
  const repairVehicles = week.maintenance.filter((m) => m.status === "Open" || m.status === "In Progress");
  const repairByDate: Record<string, number> = {}; for (const m of repairVehicles) repairByDate[m.serviceDate] = (repairByDate[m.serviceDate] || 0) + 1;
  for (const day of week.days) {
    const usedDriversThisDay = new Set<number>();
    // Delivery: one DRIVER per vehicle/day (never double-booked).
    for (const veh of activeVehicles) {
      const sorted = [...drivers.filter((e) => !onLeave(e.id, day.date) && !usedDriversThisDay.has(e.id))].sort((a, b) => workedDays[a.id] - workedDays[b.id]);
      const d = sorted[0];
      if (d) { rows.push({ employeeId: d.id, employeeName: d.name, department: d.department, role: d.role, date: day.date, dutyType: "Delivery", vehicleId: veh.id, vehicleNo: veh.vehicleNumber, proposed: true }); workedDays[d.id] = (workedDays[d.id] || 0) + 1; usedDriversThisDay.add(d.id); }
    }
    // Helpers for delivery support (no vehicle -> no unique-vehicle conflict).
    for (const veh of activeVehicles) { pick(helpers, day.date, "Delivery"); }
    // Supervisors: one supervisor covers deliveries (no vehicle -> no conflict).
    for (const veh of activeVehicles) { pick(supervisors, day.date, "Delivery"); }
    pick(loaders, day.date, "Collection");
    const repairsToday = repairByDate[day.date] || 0; for (let i = 0; i < repairsToday; i++) pick(helpers, day.date, "Repair");
    if (day.weekday !== "Sat") pick(officePool, day.date, "OfficeDuty");
  }
  const satDate = week.days.find((d) => d.weekday === "Sat")?.date ?? "";
  for (const role of Object.keys(week.saturday.requiredByRole)) {
    const pool = active.filter((e) => (e.role === role || e.department === role));
    let need = week.saturday.requiredByRole[role];
    for (const r of rows) if (r.date === satDate && (r.role === role || r.department === role) && r.dutyType !== "WeeklyOff") need--;
    while (need > 0) { const got = pick(pool, satDate, "Delivery"); if (!got) { conflicts.push("Saturday requires more " + role + "(s) — shortage."); break; } need--; }
  }
  const grouped = new Set<number>(); for (const r of rows) grouped.add(r.employeeId);
  const satAssigned = rows.filter((r) => r.date === satDate && r.dutyType !== "WeeklyOff").length;
  return { employeesAffected: grouped.size, delivery: rows.filter((r) => r.dutyType === "Delivery").length, repair: rows.filter((r) => r.dutyType === "Repair").length, office: rows.filter((r) => ["Office","OfficeDuty"].includes(r.dutyType)).length, collection: rows.filter((r) => r.dutyType === "Collection").length, weeklyOff: rows.filter((r) => r.dutyType === "WeeklyOff").length, saturdayRequired: week.saturday.required, saturdayAssigned: satAssigned, saturdayShortage: Math.max(0, week.saturday.required - satAssigned), conflicts, rows };
}

export async function autoAssignPreview(weekStart: string): Promise<AutoPlan> { const week = await getDutyWeek(weekStart); return buildPlan(week); }

export async function autoAssignApply(weekStart: string, plan?: AutoPlan, changedBy = "user"): Promise<DutyWeek> {
  const week = await getDutyWeek(weekStart);
  const locked = await weekIsLocked(week.weekStart, week.weekEnd); if (locked) throw new AppError(409, locked);
  const effectivePlan = plan && plan.rows && plan.rows.length ? plan : buildPlan(week);
  if (effectivePlan.conflicts.length) throw new AppError(422, "Auto assignment has " + effectivePlan.conflicts.length + " unresolved conflict(s): " + effectivePlan.conflicts.join("; "));
  await withTransaction(async (client) => {
    await client.query("SELECT id FROM duty_weeks WHERE week_start = $1 FOR UPDATE", [week.weekStart]);
    await client.query("DELETE FROM duty_assignments WHERE duty_date BETWEEN $1 AND $2", [week.weekStart, week.weekEnd]);
    for (const r of effectivePlan.rows) {
      if (r.dutyType === "WeeklyOff") {
        await client.query("INSERT INTO duty_assignments (employee_id, employee_name, department, role, duty_type, duty_date) VALUES ($1,$2,$3,$4,'WeeklyOff',$5) ON CONFLICT (employee_id, duty_date) DO UPDATE SET duty_type = 'WeeklyOff'", [r.employeeId, r.employeeName, r.department, r.role, r.date]);
      } else {
        const res = await client.query("INSERT INTO duty_assignments (employee_id, employee_name, department, role, duty_type, duty_date, vehicle_id, vehicle_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [r.employeeId, r.employeeName, r.department, r.role, r.dutyType, r.date, r.vehicleId ?? null, r.vehicleNo ?? null]);
        await client.query("INSERT INTO duty_assignment_changes (assignment_id, employee_id, employee_name, duty_date, new_duty_type, new_vehicle_id, changed_by, action) VALUES ($1,$2,$3,$4,$5,$6,$7,'insert')", [res.rows[0].id, r.employeeId, r.employeeName, r.date, r.dutyType, r.vehicleId ?? null, changedBy]);
      }
    }
  });
  return getDutyWeek(week.weekStart);
}
export async function upsertDuty(body: AssignmentInput & { id?: string }, changedBy = "user"): Promise<DutyWeek> {
  const weekStart = mondayOf(body.date);
  await validateAssignment(body, { ignoreId: body.id });
  const emp = (await query("SELECT employee_name, department, role FROM employees WHERE id = $1", [body.employeeId])).rows[0];
  await withTransaction(async (client) => {
    if (body.id) {
      const old = (await client.query("SELECT * FROM duty_assignments WHERE id = $1", [body.id])).rows[0];
      if (!old) throw new AppError(404, "Duty assignment not found");
      await client.query("INSERT INTO duty_assignment_changes (assignment_id, employee_id, employee_name, duty_date, old_duty_type, new_duty_type, old_vehicle_id, new_vehicle_id, changed_by, action) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'update')", [body.id, body.employeeId, emp.employee_name, body.date, old.duty_type, body.dutyType, old.vehicle_id, body.vehicleId ?? null, changedBy]);
      await client.query("UPDATE duty_assignments SET employee_id=$2, employee_name=$3, department=$4, role=$5, duty_type=$6, duty_date=$7, vehicle_id=$8, vehicle_no=$9 WHERE id=$1", [body.id, body.employeeId, emp.employee_name, emp.department, emp.role || emp.department, body.dutyType, body.date, body.vehicleId ?? null, body.vehicleNo ?? null]);
    } else {
      const res = await client.query("INSERT INTO duty_assignments (employee_id, employee_name, department, role, duty_type, duty_date, vehicle_id, vehicle_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [body.employeeId, emp.employee_name, emp.department, emp.role || emp.department, body.dutyType, body.date, body.vehicleId ?? null, body.vehicleNo ?? null]);
      await client.query("INSERT INTO duty_assignment_changes (assignment_id, employee_id, employee_name, duty_date, new_duty_type, new_vehicle_id, changed_by, action) VALUES ($1,$2,$3,$4,$5,$6,$7,'insert')", [res.rows[0].id, body.employeeId, emp.employee_name, body.date, body.dutyType, body.vehicleId ?? null, changedBy]);
    }
  });
  return getDutyWeek(weekStart);
}

export async function deleteDuty(id: string, changedBy = "user"): Promise<DutyWeek> {
  const found = (await query("SELECT * FROM duty_assignments WHERE id = $1", [id])).rows[0];
  if (!found) throw new AppError(404, "Duty assignment not found");
  const weekStart = mondayOf(dateOnly(found.duty_date) ?? "");
  const weekEnd = weekDays(weekStart)[6].date;
  const locked = await weekIsLocked(weekStart, weekEnd); if (locked) throw new AppError(409, locked);
  await withTransaction(async (client) => {
    await client.query("INSERT INTO duty_assignment_changes (assignment_id, employee_id, employee_name, duty_date, old_duty_type, old_vehicle_id, changed_by, action) VALUES ($1,$2,$3,$4,$5,$6,$7,'delete')", [id, found.employee_id, found.employee_name, found.duty_date, found.duty_type, found.vehicle_id, changedBy]);
    await client.query("DELETE FROM duty_assignments WHERE id = $1", [id]);
  });
  return getDutyWeek(weekStart);
}

export async function submitWeek(weekStart: string, submittedBy = "user") {
  const ms = mondayOf(weekStart); const week = await getDutyWeek(ms);
  if (week.status === "Locked") throw new AppError(409, "This week is locked.");
  if (!week.validation.ok && week.validation.problems.length) throw new AppError(422, "Cannot submit: " + week.validation.problems.length + " critical issue(s) found. " + week.validation.problems.join("; "));
  await query("UPDATE duty_weeks SET status='Submitted', submitted_at=NOW(), submitted_by=$2 WHERE week_start=$1", [ms, submittedBy]);
  return getDutyWeek(ms);
}

export async function getWeekStatus(weekStart: string) { const ms = mondayOf(weekStart); const week = await getOrCreateWeek(ms, weekDays(ms)[6].date); return { weekStart: ms, weekEnd: weekDays(ms)[6].date, status: week.status }; }

export async function getAttendanceSummary(month: string) {
  const empRes = await query("SELECT id, employee_name, department FROM employees");
  const duties = await query("SELECT e.id employee_id, d.duty_date, d.duty_type FROM employees e LEFT JOIN duty_assignments d ON d.employee_id = e.id AND to_char(d.duty_date, 'YYYY-MM') = $1", [month]);
  const leaves = await query("SELECT employee_id, from_date, to_date FROM leave_requests WHERE status='Approved'");
  const byEmp: Record<number, { name: string; dept: string; marks: Record<string, string> }> = {};
  for (const e of empRes.rows) { const id = num(e.id); byEmp[id] = byEmp[id] || { name: str(e.employee_name), dept: str(e.department), marks: {} }; }
  for (const d of duties.rows) { const id = num(d.employee_id); if (d.duty_date) { const ds = dateOnly(d.duty_date) ?? ""; if (ds.startsWith(month)) byEmp[id] = byEmp[id] || { name: "", dept: "", marks: {} }, byEmp[id].marks[ds] = str(d.duty_type) === "WeeklyOff" ? "WO" : "P"; } }
  for (const l of leaves.rows) { const id = num(l.employee_id); let d = new Date((dateOnly(l.from_date) ?? "") + "T00:00:00Z"); const dend = new Date((dateOnly(l.to_date) ?? "") + "T00:00:00Z"); while (d <= dend) { const ds = d.toISOString().slice(0, 10); if (ds.startsWith(month)) (byEmp[id] = byEmp[id] || { name: "", dept: "", marks: {} }).marks[ds] = "L"; d.setUTCDate(d.getUTCDate() + 1); } }
  const rows = Object.entries(byEmp).map(([idStr, v]) => { const arr = Object.values(v.marks); const delivery = Object.entries(v.marks).filter(([, m]) => m === "DEL").length; return { employeeId: Number(idStr), employeeName: v.name, department: v.dept, dayMarks: v.marks, presentCount: arr.filter((m) => m === "P").length, absentCount: 0, leaveCount: arr.filter((m) => m === "L").length, halfDayCount: 0, weeklyOffCount: arr.filter((m) => m === "WO").length, workingDays: arr.filter((m) => m === "P").length + arr.filter((m) => m === "L").length + arr.filter((m) => m === "WO").length }; });
  return { month, rows };
}

export async function getEmployeeHistory(employeeId: number) {
  const [duties, leaves, trips, repairs, advances] = await Promise.all([
    query("SELECT duty_date, duty_type, vehicle_id, vehicle_no, department, role FROM duty_assignments WHERE employee_id = $1 ORDER BY duty_date", [employeeId]),
    query("SELECT from_date, to_date, status FROM leave_requests WHERE employee_id = $1 ORDER BY from_date", [employeeId]),
    query("SELECT trip_no, trip_date, vehicle_id, vehicle_no, status FROM trips WHERE (driver_id = $1 OR supervisor_id = $1) AND deleted = false ORDER BY trip_date", [employeeId]),
    query("SELECT maintenance_date, service_type, vehicle_id, vehicle_no, status FROM fleet_maintenance WHERE driver_id = $1 AND deleted = false ORDER BY maintenance_date", [employeeId]),
    query("SELECT loan_type, principal, issued_date, status FROM advance_loans WHERE employee_id = $1 ORDER BY issued_date", [employeeId])
  ]);
  return { employeeId, duties: duties.rows.map((r) => ({ date: dateOnly(r.duty_date), dutyType: str(r.duty_type), vehicleNo: r.vehicle_no, department: str(r.department), role: str(r.role) })), leaves: leaves.rows.map((r) => ({ from: dateOnly(r.from_date), to: dateOnly(r.to_date), status: str(r.status) })), trips: trips.rows.map((r) => ({ tripNo: str(r.trip_no), tripDate: dateOnly(r.trip_date), vehicleNo: r.vehicle_no, status: str(r.status) })), repairs: repairs.rows.map((r) => ({ date: dateOnly(r.maintenance_date), serviceType: str(r.service_type), vehicleNo: r.vehicle_number, status: str(r.status) })), advances: advances.rows.map((r) => ({ type: str(r.loan_type), principal: num(r.principal), issuedDate: dateOnly(r.issued_date), status: str(r.status) })) };
}

export const dutyPlannerService = {
  getDutyWeek, getWeekStatus, validateAssignment, autoAssignPreview, autoAssignApply, upsertDuty, deleteDuty, submitWeek, getAttendanceSummary, getEmployeeHistory,
};
