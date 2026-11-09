#!/usr/bin/env bash
# Deploys Regina (the policy API) at GitHub's main, waits until it is live,
# then starts ONE policy refresh so the run log proves it records again.
#   bash mandate/ops/deploy_regina.sh
# The refresh is the normal weekly one (~30 min, a few cents of embeddings).
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
SID=9432356c-ecc3-41d8-a498-acdf13d318b5
URL=https://regina-production.up.railway.app
[ "$(curl -fsS $URL/api/refresh | python3 -c 'import json,sys;print(json.load(sys.stdin)["running"])')" = False ] ||
  { echo "NOT YET: Regina is refreshing right now; a deploy would kill it. Try again later."; exit 1; }
git -C ../.. fetch -q origin main; SHA=$(git -C ../.. rev-parse origin/main)
DID=$(railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" 2>/dev/null |
      python3 -c "import json,sys;r=sys.stdin.read();print(json.loads(r[:r.rfind('}')+1])['data']['serviceInstanceDeployV2'])")
echo "deploying Regina at $SHA (deployment $DID); building takes ~3-5 min..."
for i in $(seq 1 60); do
  ST=$(railway_api "query{ deployment(id:\"$DID\"){ status } }" 2>/dev/null | python3 -c "import json,sys;r=sys.stdin.read();print(json.loads(r[:r.rfind('}')+1])['data']['deployment']['status'])")
  case "$ST" in SUCCESS) break ;; FAILED|CRASHED|REMOVED) echo "STOP: deployment $ST"; exit 1 ;; esac
  sleep 15
done
[ "$ST" = SUCCESS ] || { echo "STOP: still $ST after 15 min"; exit 1; }
SECRET=$(railway_api "query{ variables(projectId:\"$MANDATE_PROJECT\", environmentId:\"$MANDATE_ENV\", serviceId:\"$SID\") }" 2>/dev/null |
         python3 -c "import json,sys;r=sys.stdin.read();print(json.loads(r[:r.rfind('}')+1])['data']['variables']['REFRESH_SECRET'])")
sleep 20
echo "Regina live on $SHA. Starting one refresh: $(curl -fsS -X POST -H "X-Refresh-Secret: $SECRET" $URL/api/refresh)"
