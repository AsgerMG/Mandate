#!/usr/bin/env bash
# THE model-budget switch, everywhere at once: LLM_BUDGET on every service that
# can make a paid Claude call. See PLATFORM.md, "Running without a model budget".
#   bash mandate/ops/set_llm_budget.sh off    # no budget: paid steps skip, the advisor answers 503
#   bash mandate/ops/set_llm_budget.sh on     # budget back: everything pays again
#
# Sets LLM_BUDGET on the Railway services capital-etl (the weekly run: classify,
# news labelling, naming), Regina (policy enrichment and answers) and
# mandate-api, and on Vercel production (the mission route), then redeploys
# each so the value is read. Railway services read variables at deploy time.
# Refuses while a weekly run or a Regina refresh is live: a redeploy would kill
# it. Deletes nothing; re-running with the same value is harmless.
# No paid calls. The health check needs no setting: it reads the pause from
# mandate.run_steps ("paid steps paused: budget off since ...").
set -euo pipefail
V=${1:-}
case "$V" in on|off) ;; *) echo "usage: $0 on|off"; exit 2 ;; esac
cd "$(dirname "$0")/../.."
source mandate/ops/_railway.sh
J() { python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]);print(eval(sys.argv[1]))" "$1"; }
REGINA_SID=9432356c-ecc3-41d8-a498-acdf13d318b5      # as deploy_regina.sh
REGINA_URL=https://regina-production.up.railway.app

echo "== 0. nothing live that a redeploy would kill"
no_live_run_or_stop "mandate capital policy"   # it redeploys every service, Regina's too
[ "$(curl -fsS $REGINA_URL/api/refresh | python3 -c 'import json,sys;print(json.load(sys.stdin)["running"])')" = False ] ||
  { echo "NOT YET: Regina is refreshing right now; a redeploy would kill it. Try again later."; exit 1; }

echo "== 1. Railway: LLM_BUDGET=$V"
SERVICES=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ id name } } } } }' 2>/dev/null |
  J "' '.join(f\"{e['node']['name']}={e['node']['id']}\" for e in d['data']['project']['services']['edges'] if e['node']['name'] in ('capital-etl','mandate-api'))")
for pair in $SERVICES "Regina=$REGINA_SID"; do
  name=${pair%%=*}; sid=${pair#*=}
  # skipDeploys:false -> Railway redeploys the service with the new value. For
  # capital-etl (a cron service) that rebuilds the image the next scheduled run
  # uses; it does not start a run.
  railway_api 'mutation{ variableUpsert(input:{projectId:"'"$MANDATE_PROJECT"'", environmentId:"'"$MANDATE_ENV"'", serviceId:"'"$sid"'", name:"LLM_BUDGET", value:"'"$V"'", skipDeploys:false}) }' >/dev/null
  echo "  $name: LLM_BUDGET=$V (redeploying)"
done
for want in capital-etl mandate-api; do
  case " $SERVICES " in *" $want="*) ;; *) echo "  WARNING: no Railway service named $want in the Mandate project: set LLM_BUDGET=$V on it by hand" ;; esac
done

echo "== 2. Vercel production: LLM_BUDGET=$V, then a redeploy"
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.vercel.com/v10/projects/wincent/env?upsert=true" \
  -d "{\"key\":\"LLM_BUDGET\",\"value\":\"$V\",\"type\":\"plain\",\"target\":[\"production\"]}" >/dev/null && echo "  LLM_BUDGET set"
cd web
LATEST=$(npx --yes vercel ls wincent --prod 2>/dev/null | /usr/bin/grep -oE 'https://wincent-[a-z0-9]+-asgermgs-projects.vercel.app' | head -1)
npx --yes vercel redeploy "$LATEST" --target production >/dev/null 2>&1 && echo "  site redeploying with it (~7 min)"

if [ "$V" = off ]; then
  echo "DONE: paid steps now skip with 'LLM budget off: <step> skipped, data unchanged'; the advisor answers 503 'paused'."
else
  echo "DONE: paid steps run again from the next weekly run; batches left recorded are collected then. The advisor is open."
fi
