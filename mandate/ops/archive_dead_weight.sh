#!/usr/bin/env bash
# The owner's ONE command for the 10 Nov data decisions (mandate/plans/data_audit.md).
# Dry run by default: prints what would change and changes nothing.
#
#   bash mandate/ops/archive_dead_weight.sh            # dry run
#   bash mandate/ops/archive_dead_weight.sh --apply    # asks you to type ARCHIVE
#
# --apply, in order:
#   1. the usage log: mandate/db/tool_calls.sql (mandate.tool_calls + the view
#      mandate.brain_usage_30d). Additive and idempotent.
#   2. archive to the bucket, archive/2026-11/ (CSV.gz + sha256, each verified by
#      read-back): classify_audit, company_sector_llm,
#      _reconcile_20261105_sqlite_gates, brief_records, and the text of the
#      news articles the classifier marked irrelevant;
#   3. drop those four tables as the next forward migration (written, checked by
#      the static schema checks, then applied), and blank the irrelevant texts
#      (their headline rows stay).
# Refuses: inside the Sunday refresh window; if code outside the allowlist still
# names a table; if a table was written in the last 30 days.
# Not touched: request_log, event_log (still written), satr_staging and
# public_funding_events.project_summary (they need a column-reader audit).
#
# Rollback: each archive is a CSV.gz with its DDL in git history; COPY FROM.
# Duration: a few minutes. After --apply: commit what it prints, merge before Sunday.
set -euo pipefail
cd "$(dirname "$0")/../.."
source mandate/ops/_railway.sh
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

dow=$(date -u +%u); hr=$(date -u +%H)
if { [ "$dow" = 6 ] && [ "$hr" -ge 23 ]; } || { [ "$dow" = 7 ] && [ "$hr" -lt 6 ]; }; then
  echo "REFUSED: inside the Sunday refresh window (Sat 23:00 - Sun 06:00 UTC)." >&2; exit 1
fi
CAPITAL=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
ADMIN=$(db_var DATABASE_URL)   # the admin, as apply_platform_sql.sh uses it

echo "== usage log: mandate/db/tool_calls.sql"
have=$(psql "$ADMIN" -XAtc "SELECT to_regclass('mandate.tool_calls') IS NOT NULL")
echo "   mandate.tool_calls: $([ "$have" = t ] && echo present || echo 'to create')"

if [ "$APPLY" = 0 ]; then
  python3 mandate/ops/archive_dead_weight.py --capital-url "$CAPITAL"
  exit $?
fi
read -r -p "Type ARCHIVE to create the usage log, archive and drop: " ok
[ "$ok" = ARCHIVE ] || { echo "not confirmed; nothing done"; exit 1; }
psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 -f mandate/db/tool_calls.sql >/dev/null && echo "   mandate.tool_calls + mandate.brain_usage_30d: ok"
bucket_env
python3 mandate/ops/archive_dead_weight.py --capital-url "$CAPITAL" --apply
