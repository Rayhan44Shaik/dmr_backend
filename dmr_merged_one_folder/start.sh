#!/usr/bin/env bash
# Per-boot reconciliation: bring the PostgreSQL cluster back online.
# npm dependencies and migrations are handled by the install phase.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bash .cursor/ensure-postgres.sh
