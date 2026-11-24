#!/usr/bin/env bash
# Railway stops reading railway.json on 2026-12-01 (Config as Code deprecated).
# capital-etl and mandate-api already hold every setting on the service itself
# (start command, cron, restart policy, healthcheck; the Dockerfile through
# RAILWAY_DOCKERFILE_PATH). Regina is the last one still pointing at
# /policy/railway.json: this moves its two settings onto the service and
# unlinks the file, then prints all three services so the result is visible.
# No redeploy, no restart; changes nothing else. railwayConfigFile must be "":
# Railway reads null as 'leave unchanged' (16 Nov: the first run printed Done
# while Regina still pointed at the file).
#   bash mandate/ops/finish_railway_config.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
railway_api 'mutation{ serviceInstanceUpdate(serviceId:"9432356c-ecc3-41d8-a498-acdf13d318b5", environmentId:"'"$MANDATE_ENV"'", input:{restartPolicyType:ON_FAILURE, restartPolicyMaxRetries:3, rootDirectory:"/", railwayConfigFile:""}) }' >/dev/null
for s in 4b6ee9af-6855-4c51-8058-a1d364cbfb12:capital-etl 9432356c-ecc3-41d8-a498-acdf13d318b5:Regina 2f6846e5-305a-434b-a75e-c2271dd81bdd:mandate-api; do
  id=${s%%:*}
  railway_api 'query{ serviceInstance(serviceId:"'"$id"'", environmentId:"'"$MANDATE_ENV"'"){ railwayConfigFile startCommand cronSchedule healthcheckPath restartPolicyType restartPolicyMaxRetries } }' 2>/dev/null |
    python3 -c "import json,sys;r=sys.stdin.read();s=json.loads(r[:r.rfind('}')+1])['data']['serviceInstance'];print('${s#*:}:', 'config file' if s['railwayConfigFile'] else 'no config file (good)', s)"
done | tee /dev/stderr | grep -q ': config file ' && { echo "NOT DONE: a service still reads a config file (above)." >&2; exit 1; }
echo "Done: no service reads railway.json any more; the 1 Dec deprecation changes nothing."
