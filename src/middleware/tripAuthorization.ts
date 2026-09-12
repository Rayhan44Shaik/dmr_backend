import type { Response } from "express";
import { query } from "../config/db.js";
import { AppError } from "./errorHandler.js";
import { authUser } from "./auth.js";
import type { AuthUser } from "../services/authService.js";

export type TripPermission = "trip.view"|"trip.create"|"trip.edit"|"trip.submit"|"trip.approve"|"trip.status_change"|"trip.delete";
const permissions: Record<AuthUser["role"], ReadonlySet<TripPermission>> = {
  OWNER: new Set(["trip.view","trip.create","trip.edit","trip.submit","trip.approve","trip.status_change","trip.delete"]),
  SENIOR_ACCOUNT: new Set(["trip.view","trip.create","trip.edit","trip.submit","trip.approve","trip.status_change"]),
  SUPERVISOR: new Set(["trip.view","trip.create","trip.edit","trip.submit"]),
};
export function requireTripPermission(res: Response, permission: TripPermission): AuthUser {
  const user = authUser(res);
  if (!permissions[user.role].has(permission)) throw new AppError(403, "Forbidden");
  return user;
}
export async function requireTripAccess(res: Response, tripId: number, permission: TripPermission): Promise<AuthUser> {
  const user = requireTripPermission(res, permission);
  if (user.role !== "SUPERVISOR") return user;
  const found = await query(`SELECT 1 FROM trips WHERE id=$1 AND supervisor_id=$2`, [tripId, user.employeeId]);
  if (!found.rowCount) throw new AppError(404, "Trip not found");
  return user;
}
export function enforceSupervisorAssignment(user: AuthUser, supervisorId: unknown): void {
  if (user.role === "SUPERVISOR" && (user.employeeId == null || Number(supervisorId) !== user.employeeId)) {
    throw new AppError(403, "Supervisors may only assign trips to themselves");
  }
}
