# Trip List — API Contract (read-only, completed/approved-only)

Trip List is a **read-only historical view** of trips that have reached the
system's completed/approved state. Eligibility is enforced **in the backend
database query** — the client never filters by status and never has to hide
Draft / Pending / Deleted trips.

```text
PostgreSQL (trips.status = 'Completed' AND trips.deleted = FALSE)
        ↓
GET /api/operations/trip-list
        ↓
only eligible trips
        ↓
Frontend Trip List (read-only display)
```

## Eligibility rule (enforced in SQL)

A trip is eligible for Trip List **only** when:

| Column   | Condition   |
|----------|-------------|
| `status` | `= 'Completed'` (the system's completed/approved state) |
| `deleted`| `= FALSE`    |

Therefore the following are **permanently excluded** by the query itself:

- `Draft`
- `Pending`
- `Deleted` (status)
- soft-deleted (`deleted = TRUE`) — including a Completed trip that was later deleted
- `Cancelled` / `Rejected` / `Pending Approval` (not used for trips today; excluded because they are not `Completed`)

## Endpoints

### 1. `GET /api/operations/trip-list`

Read-only list. Always returns a paginated envelope.

#### Query parameters

| Param         | Type    | Default | Meaning |
|---------------|---------|---------|---------|
| `page`        | integer | `1`     | 1-based page number |
| `limit`       | integer | `50`    | Page size (max 200) |
| `search`      | string  | —       | Case-insensitive match on `trip_no`, `vehicle_no`, `driver_name`, `supervisor_name`, `source_farm` |
| `fromDate`    | date    | —       | `trip_date >= fromDate` |
| `toDate`      | date    | —       | `trip_date <= toDate` |
| `vehicleId`   | integer | —       | Exact vehicle match |
| `supervisorId`| integer | —       | Exact supervisor match |
| `driverId`    | integer | —       | Exact driver match |
| `farmId`      | integer | —       | Exact source farm match |

There is **no `status` parameter**: the endpoint is fixed to completed/approved.
Filters can only narrow the eligible set; they can never admit a
Draft/Pending/Deleted trip.

#### Response `200`

```jsonc
{
  "data": [ /* array of TripSummary (see below) */ ],
  "meta": {
    "total": 42,        // count of eligible trips (before paging)
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### 2. `GET /api/operations/trip-list/:id`

Full hydrated trip (crew, boxes, deliveries, diesel, DC photo) **only when
eligible**. Draft / Pending / Deleted / soft-deleted ids return `404`.

## TripSummary fields (subset of `Trip`, see `src/types/models.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | |
| `tripNo` | string | Trip reference (e.g. `TRP-20260805-001`) |
| `tripDate` | string | `YYYY-MM-DD` |
| `status` | string | Always `"Completed"` here |
| `startTime` / `endTime` | string \| null | ISO timestamps |
| `vehicleId` / `vehicleNo` | number \| null / string \| null | |
| `driverId` / `driverName` | number \| null / string \| null | |
| `supervisorId` / `supervisorName` | number \| null / string \| null | |
| `helpers` / `loaders` | string[] | (empty in the list; populated in `/:id` detail) |
| `sourceFarmId` / `sourceFarm` | number \| null / string \| null | |
| `farmBirdTypeId` / `farmBirdType` | number \| null / string \| null | |
| `farmBirdCount` / `farmLoadWeight` | number \| null | loaded birds / weight |
| `farmRate` / `farmAmount` | number \| null | |
| `dcWeight` / `totalBirds` / `boxes` / `avgWeight` | number | pickup totals |
| `boxDetails` | BoxDetail[] | (populated in `/:id` detail) |
| `deliveries` | ShopDelivery[] | delivery rows: shop, birds, weight, rate, amount, mortality |
| `closingMeter` / `endMeter` | number \| null | |
| `fuel` / `expense` / `driverBata` / `helperBata` / `totalTripExpense` | number | expense sheet |
| `totalKm` | number | |
| `totalShops` / `totalWeight` / `totalDeliveredWeight` / `totalBirdsDelivered` | number | KPIs |
| `totalMortality` / `totalMortalityCount` / `totalMortalityWeight` | number | mortality |
| `weightLoss` / `survivalRate` | number | |
| `lastShop` | string \| null | |
| `deleted` | boolean | Always `false` here |
| `approvedBy` / `approvedAt` | string \| null | approval audit |
| `createdAt` / `updatedAt` | string \| null | |
| `resumeStep` / `resumeStepLabel` | string \| null | Always `null` for completed trips |
| `wizardProgress` | object | step flags |

All numeric fields are JSON numbers, all nullable fields are `null` (never
`undefined`), and dates/timestamps are ISO strings. These shapes match
`src/types/models.ts` exactly — no renames, no casing drift, no
string/number mismatch.

## Deletion permanence

Deletion is a **soft delete** stored in PostgreSQL, represented by BOTH:

- `trips.deleted = TRUE`
- `trips.status = 'Deleted'`

The backend keeps the two in lockstep (see `tripsService.save`,
`tripsService.softDelete`, `tripsService.updateStatus`) and the migration
`sql/007_trip_list_integrity.sql` repairs any legacy rows where they were out
of sync. A deleted trip therefore stays deleted across refresh, re-login,
backend restart and any other client — there is no client-side deletion state.

## Not available here (read-only)

Trip List exposes **no** create / update / delete / approve / reject / status
routes. Approval and deletion continue to happen through the existing Trip
workflow (`/api/operations/trips/:id/status`, `DELETE /api/operations/trips/:id`).
