// =============================================================================
// Trip resource availability validation (server-side, DB-backed)
//
// Business rule: a resource (vehicle / driver / supervisor / helper / loader)
// may belong to ONLY ONE active/in-progress trip at a time. A trip OCCUPIES its
// resources from Step 1 submission through Step 5. Resources are RELEASED once
// the trip reaches its release point — i.e. Step 5 is successfully submitted,
// which flips the trip status to 'Pending' (and later Completed/Deleted).
//
// Therefore a resource is considered OCCUPIED when it is assigned to another
// trip whose status is still 'Draft' (still progressing through Steps 1–5).
// This validation reads ONLY the database — never frontend/localStorage state.
//
// The current trip being edited is always excluded so a trip never conflicts
// with itself.
// =============================================================================

import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";

type Client = pg.PoolClient;

export interface TripResourceInput {
  /** The trip being created/edited (0/undefined/null => brand-new trip). */
  tripId?: number | null;
  vehicleId?: number | null;
  driverId?: number | null;
  supervisorId?: number | null;
  helpers?: string[];
  loaders?: string[];
}

/** Trips that still occupy their resources = Draft (Steps 1–5 in progress). */
const OCCUPIED_STATUS = "Draft";
const SOFT_DELETED_EXCLUSION = "t.deleted = FALSE";
// A trip only OCCUPIES its resources after Step 1 is actually submitted. A bare
// Draft row created by an autosave/draft endpoint (start_step_submitted = FALSE)
// must NOT lock a vehicle/driver/supervisor/helper/loader.
const STEP1_SUBMITTED = "t.start_step_submitted = TRUE";

/**
 * Placeholder indexes are computed from the ACTUAL params array so every
 * $n reference lines up with the param passed at position n. Previously the
 * status placeholder reused the resource-id placeholder ($1/$2) which broke
 * every query with PG error 42846 ("cannot cast type integer to trip_status").
 */
function buildStatusPlaceholder(
  params: unknown[],
  selfTripId: number | null
): { statusParam: string; selfExclude: string } {
  if (selfTripId) params.push(selfTripId);
  const statusParam = `$${params.length + 1}`;
  params.push(OCCUPIED_STATUS);
  const selfExclude = selfTripId ? " AND t.id <> $2" : "";
  return { statusParam, selfExclude };
}

function pushConflicts(conflicts: string[], row: { label?: string; trip_no?: string }, kind: string) {
  if (row && row.trip_no) {
    conflicts.push(`${kind} ${row.label ?? ""} is already assigned to trip ${row.trip_no}.`.trim());
  }
}

/**
 * Throw an HTTP 409 with a clear message if any of the supplied resources is
 * already assigned to another active (Draft) trip. Returns normally otherwise.
 */
export async function assertTripResourcesAvailable(
  input: TripResourceInput | null | undefined,
  client: Client
): Promise<void> {
  if (!input) return;

  const selfTripId = input.tripId && input.tripId > 0 ? input.tripId : null;
  const conflicts: string[] = [];

  // ---- Vehicle ----
  if (input.vehicleId) {
    const params: unknown[] = [input.vehicleId];
    const { statusParam, selfExclude } = buildStatusPlaceholder(params, selfTripId);
    const r = await client.query(
      `SELECT t.trip_no, v.vehicle_number AS label
         FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.vehicle_id = $1
          AND ${SOFT_DELETED_EXCLUSION}
          AND ${STEP1_SUBMITTED}
          AND t.status = ${statusParam}::trip_status
          ${selfExclude}
        LIMIT 1`,
      params
    );
    pushConflicts(conflicts, r.rows[0], "Vehicle");
  }

  // ---- Driver ----
  if (input.driverId) {
    const params: unknown[] = [input.driverId];
    const { statusParam, selfExclude } = buildStatusPlaceholder(params, selfTripId);
    const r = await client.query(
      `SELECT t.trip_no, e.employee_name AS label
         FROM trips t JOIN employees e ON e.id = t.driver_id
        WHERE t.driver_id = $1
          AND ${SOFT_DELETED_EXCLUSION}
          AND ${STEP1_SUBMITTED}
          AND t.status = ${statusParam}::trip_status
          ${selfExclude}
        LIMIT 1`,
      params
    );
    pushConflicts(conflicts, r.rows[0], "Driver");
  }

  // ---- Supervisor ----
  if (input.supervisorId) {
    const params: unknown[] = [input.supervisorId];
    const { statusParam, selfExclude } = buildStatusPlaceholder(params, selfTripId);
    const r = await client.query(
      `SELECT t.trip_no, e.employee_name AS label
         FROM trips t JOIN employees e ON e.id = t.supervisor_id
        WHERE t.supervisor_id = $1
          AND ${SOFT_DELETED_EXCLUSION}
          AND ${STEP1_SUBMITTED}
          AND t.status = ${statusParam}::trip_status
          ${selfExclude}
        LIMIT 1`,
      params
    );
    pushConflicts(conflicts, r.rows[0], "Supervisor");
  }

  // ---- Helpers / Loaders (trip_crew) ----
  const unique = (names: string[] | undefined) =>
    [...new Set((names ?? []).map((n) => n?.trim()).filter(Boolean))];
  const crewChecks: Array<{ role: string; names: string[]; label: string }> = [
    { role: "helper", names: unique(input.helpers), label: "Helper" },
    { role: "loader", names: unique(input.loaders), label: "Loader" },
  ];
  for (const { role, names, label } of crewChecks) {
    if (!names.length) continue;
    const params: unknown[] = [names];
    if (selfTripId) params.push(selfTripId);
    const roleParam = `$${params.length + 1}`;
    params.push(role);
    const statusParam = `$${params.length + 1}`;
    params.push(OCCUPIED_STATUS);
    const selfExclude = selfTripId ? " AND t.id <> $2" : "";
    const r = await client.query(
      `SELECT t.trip_no, tc.employee_name AS label
         FROM trip_crew tc JOIN trips t ON t.id = tc.trip_id
        WHERE tc.role = ${roleParam}::crew_role
          AND tc.employee_name = ANY($1)
          AND ${SOFT_DELETED_EXCLUSION}
          AND ${STEP1_SUBMITTED}
          AND t.status = ${statusParam}::trip_status
          ${selfExclude}
        LIMIT 1`,
      params
    );
    pushConflicts(conflicts, r.rows[0], label);
  }

  if (conflicts.length) {
    throw new AppError(409, conflicts.join(" "), { conflicts });
  }
}