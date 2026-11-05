#!/usr/bin/env bash
# Stops the old Capina etl-pipeline cron. Its database is frozen read-only and
# its SQLite volume is retired; its next run (Sundays 03:00 UTC) would only fail.
# The service is NOT deleted: that waits for the 7-day soak.
#   bash mandate/ops/suspend_capina_cron.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
railway_api "mutation{ serviceInstanceUpdate(serviceId:\"$CAPINA_ETL_SERVICE\", environmentId:\"$CAPINA_ENV\", input:{cronSchedule:null, startCommand:\"echo SUSPENDED 2026-11-05: superseded by the Mandate project\"}) }"
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$CAPINA_ETL_SERVICE\", environmentId:\"$CAPINA_ENV\") }"
echo "done: Capina etl-pipeline has no schedule and a no-op start command"
