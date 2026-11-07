#!/usr/bin/env bash
# Everything Sunday's first combined run (8 Nov, 03:00 UTC) needs that only the
# owner may do. Idempotent: re-run safely.
#   bash mandate/ops/go_live_sunday.sh
#
# Already done by Claude on 2026-11-06: E1 merged; mandate.runs / run_steps /
# artefact_releases created; capital-etl's start command set to
# `python3 mandate/refresh/run.py`; POLICY_API_URL, REFRESH_SECRET and
# VOYAGE_KEY set on it as references to the policy service.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh

echo "######## 1. grounding go-live (batched: the single-transaction attempts filled the 5 GB volume)"
# Drops policy.ix_passages_embedding_hnsw (an index) by default; see that script.
# If it stops, fix what it says and re-run THIS script: every step is idempotent
# and the migration resumes from its last committed batch.
bash mandate/ops/go_live_grounding.sh

echo "######## 2. the state-aid case register, a pinned input of the instrument rebuild"
eval "$(npx --yes @railway/cli bucket credentials --bucket mandate-grounding --json | python3 -c '
import json,sys,shlex; d=json.load(sys.stdin); d=d if isinstance(d,dict) else d[0]
for k,v in {"BUCKET_ENDPOINT":d["endpoint"],"BUCKET_NAME":d["bucketName"],"BUCKET_REGION":d["region"],
            "BUCKET_ACCESS_KEY_ID":d["accessKeyId"],"BUCKET_SECRET_ACCESS_KEY":d["secretAccessKey"],
            "BUCKET_ADDRESSING":"virtual" if d.get("urlStyle","virtual-host").startswith("virtual") else "path"}.items():
    print(f"export {k}={shlex.quote(v)}")')"
G=~/Mandate-backups/2026-11-05/work/grounding
"$ROOT/policy/.venv/bin/python" mandate/grounding/migrations/upload_manifest.py \
  "$G/grounding_manifest_cron_inputs_state_aid_cases.jsonl" --archive "$G/archive/raw" --apply

echo "######## 3. retire refresh-cron: the one weekly run now refreshes policy itself"
RC=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ id name } } } } }' 2>/dev/null |
     python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]);print([e['node']['id'] for e in d['data']['project']['services']['edges'] if e['node']['name']=='refresh-cron'][0])")
railway_api "mutation{ serviceInstanceUpdate(serviceId:\"$RC\", environmentId:\"$MANDATE_ENV\", input:{cronSchedule:null, startCommand:\"echo RETIRED 2026-11-06: policy is refreshed by the one weekly run (mandate/refresh/run.py)\"}) }" >/dev/null
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$RC\", environmentId:\"$MANDATE_ENV\") }" >/dev/null
echo "refresh-cron has no schedule"

echo "######## 4. the site downloads its data from the bucket (fast deploys)"
SITE=~/Wincent/website/frontend   # the directory linked to the Vercel project (wincent)
for k in BUCKET_ENDPOINT BUCKET_NAME BUCKET_REGION BUCKET_ACCESS_KEY_ID BUCKET_SECRET_ACCESS_KEY BUCKET_ADDRESSING; do
  for env in production preview; do
    vercel env rm "$k" "$env" --yes --cwd "$SITE" >/dev/null 2>&1 || true
    printf %s "${!k}" | vercel env add "$k" "$env" --sensitive --cwd "$SITE" >/dev/null
  done
done
echo "bucket access set on the Vercel project"

echo "######## 5. redeploy capital-etl so Sunday's cron runs the new start command"
SID=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ id name } } } } }' 2>/dev/null |
      python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]);print([e['node']['id'] for e in d['data']['project']['services']['edges'] if e['node']['name']=='capital-etl'][0])")
railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\") }" >/dev/null
echo "done: Sunday's run is set. Check afterwards with: python3 mandate/health/check.py"
