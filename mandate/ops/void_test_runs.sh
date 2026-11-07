#!/usr/bin/env bash
# Marks the run records that policy's TEST SUITE wrote into production as
# 'abandoned' (not deleted), so the health check stops reading them as real
# refreshes. 112 rows, 2026-11-06/07, all from a developer laptop via the
# refresh API code path; the leak itself is fixed (policy/tests/conftest.py
# forces DATABASE_URL=local). Dry run by default.
#   bash mandate/ops/void_test_runs.sh            # show what would change
#   bash mandate/ops/void_test_runs.sh --apply    # mark them
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
ADMIN=$(db_var DATABASE_URL); PSQL=/opt/homebrew/opt/postgresql@18/bin/psql
WHERE="host = 'macbook-pro-tilhrende-asger1.home' AND trigger = 'api' AND started_at < '2026-11-07 13:00+00' AND status <> 'abandoned'"
$PSQL "$ADMIN" -X -At -c "SELECT status, count(*) FROM mandate.runs WHERE $WHERE GROUP BY 1"
if [ "${1:-}" = "--apply" ]; then
  $PSQL "$ADMIN" -X -At -c "UPDATE mandate.runs SET status = 'abandoned', finished_at = coalesce(finished_at, now()), summary = 'TEST POLLUTION: written by policy test runs on a developer laptop (2026-11-06/07) before tests were isolated from production. Not a real refresh.' WHERE $WHERE" 
  echo "marked; re-run without --apply to confirm 0 remain"
else
  echo "DRY RUN: nothing changed. Re-run with --apply."
fi
