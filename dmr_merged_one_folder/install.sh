#!/usr/bin/env bash
# Repository bootstrap: install dependencies, prepare the backend env file,
# ensure PostgreSQL is up, apply migrations, and seed once.
# Idempotent: safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing frontend dependencies"
npm install

echo "==> Installing backend dependencies"
npm install --prefix backend

if [ ! -f backend/.env ]; then
  echo "==> Creating backend/.env from example"
  cp backend/.env.example backend/.env
fi

echo "==> Ensuring PostgreSQL is available"
bash .cursor/ensure-postgres.sh

echo "==> Applying database migrations"
npm run backend:migrate

# Seeding inserts a fresh sample trip each run, so only seed an empty database.
TRIP_COUNT="$(PGPASSWORD=dmr_local_dev psql -h localhost -U dmr -d dmr_poultries -tAc \
  "SELECT COUNT(*) FROM trips" 2>/dev/null || echo 0)"
if [ "${TRIP_COUNT:-0}" = "0" ]; then
  echo "==> Seeding sample data"
  npm run backend:seed
else
  echo "==> Skipping seed (trips already present: ${TRIP_COUNT})"
fi

echo "==> Install complete"
