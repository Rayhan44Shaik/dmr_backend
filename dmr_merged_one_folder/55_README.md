# DMR Poultries Backend — Local PostgreSQL (Phase 1)

Backend API + PostgreSQL schema for **Masters**, **Trip Entry Steps 1–5**, and **Staff**.

Designed for local use first; the same schema and API will move to cloud later. Mobile can talk to this API over LAN / tunnel.

## What is included

| Area | Coverage |
|------|----------|
| Masters | employees, vehicles, farms, shops, banks, bird types |
| Trips | Steps 1 Start → 2 Farm → 3 Pickup → 4 Deliveries → 5 Expenses |
| Staff | duty planner, leave, salary, advance/loan, attendance |
| Ops link | `fuel_expenses` table (ready for Step 5 diesel bills) |

## PostgreSQL connection (local)

All runtime, migration, and seed connections use `DATABASE_URL` and must target:

| Setting  | Value          |
|----------|----------------|
| Database | `dmr_poultries` |
| Host     | `localhost`    |
| Port     | `5432`         |
| User     | `dmr`          |

Configured in:

- `.env` / `.env.example` → `DATABASE_URL=postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries`
- `src/config/env.ts` → default `DATABASE_URL` fallback (same value)
- `src/config/db.ts` → PostgreSQL connection pool
- `docker-compose.yml` → `POSTGRES_DB=dmr_poultries`, `POSTGRES_USER=dmr`, port `5432`
- `npm run db:migrate` / `npm run db:seed` / `npm run dev` → all use the shared pool

## Quick start (local PostgreSQL)

```bash
# 1) Start PostgreSQL (system or Docker)
# System:
sudo pg_ctlcluster 16 main start

# Or Docker:
docker compose up -d

# 2) Install & migrate
cp .env.example .env   # if needed
npm install
npm run db:migrate
npm run db:seed        # optional sample data
npm run dev            # http://localhost:4000
```

## Demo / test data (development only)

`npm run seed:demo` generates a realistic, production-quality Trip Entry test
dataset so every step of the Trip workflow can be exercised end-to-end.

> **⚠️ Development-only.** This script is manual and idempotent. It must never
> run automatically and must never run against a production database.

```bash
npm run seed:demo
```

What it creates (reusing any existing Master data — it never duplicates):

| Trip | Date | Status | Resumes at |
|------|------|--------|------------|
| TRIP-20260731-001 | 31-Jul-2026 | Draft | Step 4 — Diesel & Expenses |
| TRIP-20260801-001 | 01-Aug-2026 | Draft | Step 3 — Shop Delivery |
| TRIP-20260802-001 | 02-Aug-2026 | Draft | Step 2 — Farm Loading |
| TRIP-20260803-001 | 03-Aug-2026 | Draft | Step 1 — Trip Header |
| TRIP-20260804-001 | 04-Aug-2026 | Pending | wizard complete |
| TRIP-20260805-001 | 05-Aug-2026 | Completed | approved |
| TRIP-20260806-001 | 06-Aug-2026 | Deleted | soft deleted |

Masters verified/created: Employees (Rahim, Ruhulla, Kareem, Saleem),
Vehicles (AP16AB1234, Tata 407), Farm (Sri Lakshmi Poultry Farm), Shops
(New Hyderabad Chicken Center, Bismillah Chicken Shop, Royal Chicken Center),
Bank (SBI Current Account), Bird Type (Broiler).

Every child record (`trip_crew`, `trip_boxes`, `trip_deliveries`,
`trip_delivery_boxes`, `trip_delivery_per_box`, `trip_diesel_entries`,
`trip_media`, `fuel_expenses`) references the same Trip ID — never orphans.

Idempotent: re-running `npm run seed:demo` reuses existing trips and masters and
never overwrites user-entered data.

Realistic values: 4200 birds, avg weight 2.35 kg, total weight 9870 kg, farm
rate ₹118, 42 L diesel @ ₹97, driver bata ₹500, helper bata ₹400, meals ₹450,
loading charges ₹850, misc ₹250.

Health check: `GET http://localhost:4000/api/health` (response includes `database: "dmr_poultries"`)

## Trip step API map

| Step | UI | Endpoint |
|------|----|----------|
| 1 Start | Vehicle, crew, opening meter, advance | `POST /api/trips/:id/steps/start` |
| 2 Farm | Farm, dest meter, pickup tolls | `POST /api/trips/:id/steps/farm` |
| 3 Pickup | Boxes, DC weight/photo | `POST /api/trips/:id/steps/pickup` |
| 4 Deliveries | Shop deliveries + box allocation | `POST /api/trips/:id/steps/deliveries` |
| 5 Expenses | General expenses + diesel rows | `POST /api/trips/:id/steps/expenses` |

Autosave / partial update: `PUT /api/trips/:id`

## Staff API

- `GET|POST /api/staff/duties`
- `GET|POST /api/staff/leaves` · `PATCH /api/staff/leaves/:id/status`
- `GET|POST|PUT /api/staff/salaries`
- `GET|POST /api/staff/advances`
- `GET|POST /api/staff/attendance`

## Schema files

- `sql/001_init_schema.sql` — tables + enums
- `sql/002_indexes.sql` — query indexes

## Cloud later

When moving to cloud, only change `DATABASE_URL` in `.env` (e.g. RDS / Neon / Supabase). No schema redesign required.

## Operations APIs

Base path: `/api/operations`

| Area | Endpoints |
|------|-----------|
| Dashboard | `GET /dashboard` (Completed trips; Approved sales/collections/fuel) |
| Trips | `GET/POST /trips`, `PUT /trips/:id`, `POST /trips/:id/steps/:step`, `PATCH /trips/:id/status`, `DELETE /trips/:id` |
| Trip List | `GET /trip-list`, `GET /trip-list/:id` — read-only, completed/approved trips only |
| Rate Entry | `GET /rate-entry`, `GET /rate-entry/trip/:tripId`, `GET/POST/PUT /rate-entry/:id`, `POST /rate-entry/trip/:tripId/lock` |
| Shop Rates | `GET/POST /shop-rates`, `PUT/PATCH/DELETE /shop-rates/:id` |
| Shop Sales | `GET/POST /shop-sales`, `PUT/PATCH/DELETE /shop-sales/:id` |
| Collections | `GET/POST /collections`, `GET /collections/pending|register|running-balance` |
| Fuel Expenses | `GET/POST /fuel-expenses`, `PUT/PATCH/DELETE /fuel-expenses/:id` |

Swagger UI: `GET /api/docs` · OpenAPI JSON: `GET /api/docs/openapi.json`

Trip statuses (`trip_status`): Draft → Pending → Completed | Deleted (soft delete only).

### Rate Entry (operational work queue)

Rate Entry finalizes shop-wise rates on trips that are **Approved or
Completed**. The authoritative lock record is a dedicated `rate_entry` table
(one row per trip, FK to `trips.id`), with a legacy `trips.rate_completed`
cache column kept in sync for any other consumer:

```
rate_entry.locked (authoritative)  ──sync──>  trips.rate_completed (cache)
   └─ trip_deliveries.rate      ← actual rate entered per shop
      trip_deliveries.amount    ← ROUND(weight * rate, 2), computed server-side
```

Eligibility is enforced in the SQL WHERE clause, never in the client:

- `trips.status IN ('Approved', 'Completed')`
- `trips.deleted = FALSE`
- `rate_entry.locked = FALSE` (or no rate_entry row yet)

| Method & path | Purpose |
|---|---|
| `GET /api/operations/rate-entry` | List eligible trips (server-side filters + pagination) |
| `GET /api/operations/rate-entry/trip/:tripId` | The saved rate entry for a trip, if any |
| `POST /api/operations/rate-entry` | Save (upsert) `{ tripId, rate, deliveries? }` — does not lock; rate must be ₹50–₹300 |
| `PUT /api/operations/rate-entry/:id` | Edit a saved, unlocked rate entry — rejected once locked |
| `POST /api/operations/rate-entry/trip/:tripId/lock` | Save & Lock — every delivery must have a rate; sets `rate_entry.locked=TRUE` and `trips.rate_completed=TRUE` |

Once a trip is locked:

- `rate_entry.locked = TRUE`, `locked_by` / `locked_at` are stamped, and
  `trips.rate_completed = TRUE` / `rate_locked_at` / `rate_locked_by` are kept
  in sync in the same transaction for any consumer that reads the trip row
  directly.
- **Locking is NOT rate immutability.** It only means the trip has moved from
  Rate Entry into Shop Sales. A **10-day Shop Sales correction window** starts
  at the lock timestamp.
- **During the 10-day window**, Shop Sales may correct Birds, Weight, and Rate
  (rate still constrained to ₹50–₹300). Amount is ALWAYS recomputed
  server-side (`ROUND(weight * rate, 2)`); the client value is never trusted.
- **After exactly 10 days**, Birds, Weight, Rate, Amount and delete become
  PERMANENTLY blocked — enforced at the application layer
  (`assertTripEditable`, `src/utils/tripDeliverySync.ts`) AND, as a
  defense-in-depth backstop, by a PostgreSQL trigger
  (`trg_trip_deliveries_rate_lock`, `sql/008_rate_entry_lock.sql`) that
  rejects UPDATEs of those columns and DELETEs of locked delivery rows using
  SERVER time — no client, service, or direct SQL bypass is possible.
- A locked trip disappears from the Rate Entry work queue but remains
  reachable read-only via `GET /rate-entry/:id` and in Trip List.

### Trip List (read-only historical view)

`GET /api/operations/trip-list` (list) and `GET /api/operations/trip-list/:id`
(detail) return **only completed/approved trips** — the rule is enforced in the
database query, never in the client:

- `trips.status = 'Completed'` (the system's completed/approved state), AND
- `trips.deleted = FALSE`

Draft, Pending and Deleted trips are excluded by the backend itself. Deletion
is stored permanently in PostgreSQL (`deleted = TRUE` + `status = 'Deleted'`),
so a deleted trip never reappears — across refresh, re-login or backend
restart. The endpoints are read-only: no approve/delete/edit actions exist.

Search, date range, vehicle, supervisor, driver and farm filters plus
pagination are supported server-side (see `docs/trip-list-api.md`).

Shop sales/rates/collections are derived from `trip_deliveries` + `trips` (no separate tables). Fuel uses `fuel_expenses` (`Pending`/`Approved`).

