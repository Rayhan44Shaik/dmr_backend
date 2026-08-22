#!/usr/bin/env bash
# Ensure a local PostgreSQL 16 cluster is installed, running, and has the
# `dmr` role + `dmr_poultries` database the backend expects.
# Idempotent: safe to run on every boot and repeatedly.
set -euo pipefail

PG_VERSION=16
DB_USER=dmr
DB_PASSWORD=dmr_local_dev
DB_NAME=dmr_poultries

if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "Installing PostgreSQL ${PG_VERSION}..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client
fi

if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $1, $2}' | grep -qx "${PG_VERSION} main"; then
  sudo pg_createcluster "${PG_VERSION}" main
fi

if ! sudo pg_lsclusters -h | awk '{print $1, $2, $4}' | grep -qx "${PG_VERSION} main online"; then
  sudo pg_ctlcluster "${PG_VERSION}" main start
fi

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    break
  fi
  sleep 1
done

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB;"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo "PostgreSQL ready: database '${DB_NAME}' (role '${DB_USER}') on localhost:5432"
