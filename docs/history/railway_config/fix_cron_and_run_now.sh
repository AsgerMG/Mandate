#!/usr/bin/env bash
# The 8 Nov weekly run crashed in its first second: the service's start command
# was `python3 mandate/refresh/run.py`, relative to WORKDIR /app/capital, while
# the package lives at /app/mandate. capital/railway.json already says the
# absolute path, but a start command set on the service overrides the file.
# This sets the absolute path, schedules ONE run ~10 minutes from now, deploys
# main, and prints how to restore the weekly schedule after the run starts.
#   bash mandate/ops/fix_cron_and_run_now.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
SID=4b6ee9af-6855-4c51-8058-a1d364cbfb12
read M H D MO <<< "$(date -u -v+10M +'%M %H %d %m')"
CRON="$((10#$M)) $((10#$H)) $((10#$D)) $((10#$MO)) *"
railway_api "mutation{ serviceInstanceUpdate(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", input:{startCommand:\"python3 /app/mandate/refresh/run.py\", cronSchedule:\"$CRON\"}) }" >/dev/null
SHA=$(git -C "$(dirname "$0")/../.." rev-parse origin/main)
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" >/dev/null
echo "capital-etl: start = python3 /app/mandate/refresh/run.py; one run at $CRON (UTC); deployed $SHA"
echo "After it starts, restore the weekly schedule with: bash mandate/ops/restore_weekly_cron.sh"
