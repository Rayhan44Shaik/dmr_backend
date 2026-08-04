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
| Shop Rates | `GET/POST /shop-rates`, `PUT/PATCH/DELETE /shop-rates/:id` |
| Shop Sales | `GET/POST /shop-sales`, `PUT/PATCH/DELETE /shop-sales/:id` |
| Collections | `GET/POST /collections`, `GET /collections/pending|register|running-balance` |
| Fuel Expenses | `GET/POST /fuel-expenses`, `PUT/PATCH/DELETE /fuel-expenses/:id` |

Swagger UI: `GET /api/docs` · OpenAPI JSON: `GET /api/docs/openapi.json`

Trip statuses (`trip_status`): Draft → Pending → Completed | Deleted (soft delete only).

Other ops modules (rates/sales/collections/fuel) use `ops_record_status`: Draft → Pending Approval → Approved | Rejected | Deleted.

