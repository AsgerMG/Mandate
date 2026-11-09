#!/usr/bin/env bash
# Re-runs ONLY the capital phase of the weekly refresh, once, ~10 minutes from
# now, on main as it is on GitHub. Closes the 9 Nov loop: run 113 stopped at
# populate_funding_instruments (fixed: register_manifest.py) after renew.py hit
# the 2027 SEK rate (fixed: efc0caf3), so the census was never published and
# GitHub's capital checks stay red until it is.
#
#   bash mandate/ops/rerun_capital.sh
#
# Refuses while any run is still running (a deploy replaces the container the
# run is in). Afterwards, when this run has finished:
#   bash mandate/ops/restore_weekly_cron.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
SID=4b6ee9af-6855-4c51-8058-a1d364cbfb12
RUNNING=$(psql "$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)" -XAtc "SELECT string_agg(id::text, ',') FROM mandate.runs WHERE status = 'running'")
[ -z "$RUNNING" ] || { echo "STOP: run(s) $RUNNING still running; a deploy now would kill them. Try again when they finish."; exit 1; }
git -C ../.. fetch -q origin main
SHA=$(git -C ../.. rev-parse origin/main)
read M H D MO <<< "$(date -u -v+10M +'%M %H %d %m')"
CRON="$((10#$M)) $((10#$H)) $((10#$D)) $((10#$MO)) *"
railway_api "mutation{ serviceInstanceUpdate(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", input:{startCommand:\"python3 /app/mandate/refresh/run.py --only capital\", cronSchedule:\"$CRON\"}) }" >/dev/null
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" >/dev/null
echo "capital-etl: capital phase only, one run at $CRON (UTC), on $SHA"
echo "When it has finished: bash ~/Mandate/mandate/ops/restore_weekly_cron.sh"
