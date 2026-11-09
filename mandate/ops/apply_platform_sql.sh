#!/usr/bin/env bash
# Applies the platform's schema files to production, as the admin. Each file is
# idempotent (CREATE ... IF NOT EXISTS, guarded ALTERs), so re-running is safe.
#   bash mandate/ops/apply_platform_sql.sh
# Adds, never drops: mandate.llm_batches (Batches API), the profile source
# 'mandate', the workspace record, the actors register, the eval log.
set -euo pipefail
cd "$(dirname "$0")/../.."
source mandate/ops/_railway.sh
ADMIN=$(db_var DATABASE_URL)
for f in llm_batches profile_sources workspace actors eval_runs; do
  printf '  %-16s ' "$f"; psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 -f "mandate/db/$f.sql" >/dev/null && echo ok
done
psql "$ADMIN" -XAtc "SELECT 'tables now: ' || string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'mandate' AND c.relkind IN ('r','p')"
