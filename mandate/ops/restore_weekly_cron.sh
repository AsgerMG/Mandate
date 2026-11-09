#!/usr/bin/env bash
# Puts capital-etl back on its weekly schedule (Sundays 03:00 UTC) running the
# FULL refresh (undoes rerun_capital.sh's --only capital), and redeploys main
# as it is on GitHub. Refuses while a run is still running.
#   bash mandate/ops/restore_weekly_cron.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
SID=4b6ee9af-6855-4c51-8058-a1d364cbfb12
RUNNING=$(psql "$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)" -XAtc "SELECT string_agg(id::text, ',') FROM mandate.runs WHERE status = 'running'")
[ -z "$RUNNING" ] || { echo "STOP: run(s) $RUNNING still running; a deploy now would kill them. Try again when they finish."; exit 1; }
git -C ../.. fetch -q origin main
SHA=$(git -C ../.. rev-parse origin/main)
railway_api "mutation{ serviceInstanceUpdate(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", input:{startCommand:\"python3 /app/mandate/refresh/run.py\", cronSchedule:\"0 3 * * 0\"}) }" >/dev/null
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" >/dev/null
echo "capital-etl: full refresh, back on 0 3 * * 0 (Sundays 03:00 UTC), on $SHA"
