#!/usr/bin/env bash
# Puts capital-etl back on its weekly schedule (Sundays 03:00 UTC) and redeploys.
#   bash mandate/ops/restore_weekly_cron.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
SID=4b6ee9af-6855-4c51-8058-a1d364cbfb12
railway_api "mutation{ serviceInstanceUpdate(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", input:{cronSchedule:\"0 3 * * 0\"}) }" >/dev/null
SHA=$(git -C "$(dirname "$0")/../.." rev-parse origin/main)
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" >/dev/null
echo "capital-etl back on 0 3 * * 0 (Sundays 03:00 UTC)"
