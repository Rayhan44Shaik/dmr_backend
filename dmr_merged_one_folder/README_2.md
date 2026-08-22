# DMR Poultries Backend — Local PostgreSQL (Phase 1)

Location in monorepo: `DMR-Poultries-ERP/backend/`

Backend API + PostgreSQL schema for **Masters**, **Trip Entry Steps 1–5**, and **Staff**.

Designed for local use first; the same schema and API will move to cloud later. Mobile can talk to this API over LAN / tunnel.

## What is included

| Area | Coverage |
|------|----------|
| Masters | employees, vehicles, farms, shops, banks, bird types |
| Trips | Steps 1 Start → 2 Farm → 3 Pickup → 4 Deliveries → 5 Expenses |
| Staff | duty planner, leave, salary, advance/loan, attendance |
| Ops link | `fuel_expenses` table (ready for Step 5 diesel bills) |

## Quick start (from repo root)

```bash
# From DMR-Poultries-ERP/
npm run db:up              # Docker Postgres (or use local PG 16)
npm run backend:install
cp backend/.env.example backend/.env   # if needed
npm run backend:migrate
npm run backend:seed       # optional sample data
npm run backend:dev        # http://localhost:4000
```

## Quick start (from this folder)

```bash
cd backend
cp .env.example .env       # if needed
npm install
docker compose up -d       # optional — starts Postgres
npm run db:migrate
npm run db:seed            # optional
npm run dev                # http://localhost:4000
```

Health check: `GET http://localhost:4000/api/health`

## Environment

`backend/.env` (see `.env.example`):

```
PORT=4000
DATABASE_URL=postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries
CORS_ORIGIN=http://localhost:5173,http://localhost:4173
```

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
