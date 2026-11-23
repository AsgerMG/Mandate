#!/usr/bin/env bash
# Deploys the three Railway services that run Mandate's own code at main as it is on GitHub:
# capital-etl (the weekly refresh: capital, graph, policy, site, publish), Regina (the policy API
# whose /api/refresh the weekly run calls) and mandate-api. They do NOT deploy on push: on 22 Nov
# Regina still ran the 11 Nov commit, so the Politico fix and the EUR-Lex retirement pushed on
# 19 Nov never ran. Refuses while a weekly run is live. Keeps capital-etl's schedule as it is.
#   bash mandate/ops/deploy_services.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
no_live_run_or_stop
git -C ../.. fetch -q origin main
SHA=$(git -C ../.. rev-parse origin/main)
for svc in "capital-etl 4b6ee9af-6855-4c51-8058-a1d364cbfb12" "Regina 9432356c-ecc3-41d8-a498-acdf13d318b5" "mandate-api 2f6846e5-305a-434b-a75e-c2271dd81bdd"; do
  set -- $svc
  railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$2\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" >/dev/null
  echo "$1: deploying $SHA"
done
echo "Check in ~5 minutes: the Railway dashboard shows each deployment SUCCESS on ${SHA:0:8}."
