#!/usr/bin/env bash
# Puts the shared grounding store live in production, in the order the
# rehearsals proved. Each step is idempotent: a re-run skips what is done.
# Steps 1 (schema + grants) were applied on 2026-11-06 and verified.
#
#   bash mandate/ops/go_live_grounding.sh
#
# Writes: grounding.* rows, policy link tables (Alembic e41c0a7b9d10), capital
# migration 034 + eligibility_grounding, ~700 MB of originals to the bucket
# `mandate-grounding`, and BUCKET_* variables on the capital-etl service.
# Does NOT re-embed (that is a separate, paid step) and does NOT rotate any
# password.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
G=~/Mandate-backups/2026-11-05/work/grounding
PY="$ROOT/policy/.venv/bin/python"          # has the mandate package + psycopg
M="$ROOT/mandate/grounding/migrations"

ADMIN=$(db_var DATABASE_URL)
POLICY=$(db_var POLICY_DATABASE_PUBLIC_URL)
CAPITAL=$(db_var CAPITAL_DATABASE_PUBLIC_URL)

# Bucket credentials, from Railway, into this shell only.
eval "$(npx --yes @railway/cli bucket credentials --bucket mandate-grounding --json | python3 -c '
import json,sys,shlex; d=json.load(sys.stdin); d=d if isinstance(d,dict) else d[0]
for k,v in {"BUCKET_ENDPOINT":d["endpoint"],"BUCKET_NAME":d["bucketName"],"BUCKET_REGION":d["region"],
            "BUCKET_ACCESS_KEY_ID":d["accessKeyId"],"BUCKET_SECRET_ACCESS_KEY":d["secretAccessKey"],
            "BUCKET_ADDRESSING":"virtual" if d.get("urlStyle","virtual-host").startswith("virtual") else "path"}.items():
    print(f"export {k}={shlex.quote(v)}")')"

echo "== 0. the archive the originals come from"
if [ ! -d "$G/archive/raw" ]; then
  mkdir -p "$G/archive"
  tar -xzf ~/Mandate-backups/2026-11-05/laptop_data_raw_processed.tar.gz -C "$G/archive"
fi

echo "== 2. policy: link tables (Alembic)"
# pinned: head is now 5c2f9e1a7b30 (the cutover), which must run AFTER step 4;
# mandate/ops/policy_on_grounding.sh runs it.
(cd policy && DATABASE_URL="$POLICY" uv run --frozen alembic upgrade e41c0a7b9d10)

echo "== 3. policy documents/versions/passages into grounding, then their originals"
$PY "$M/policy_to_grounding.py" --admin-url "$ADMIN" --apply --manifest "$G/grounding_manifest_policy.jsonl"
$PY "$M/upload_manifest.py" "$G/grounding_manifest_policy.jsonl" --db-url "$POLICY" --apply

echo "== 4. the seven cron sources' inputs"
$PY "$M/upload_manifest.py" "$G/grounding_manifest_cron_inputs.jsonl" --archive "$G/archive/raw" --apply

echo "== 5. capital: migration 034, then gate -> document links, then originals"
(cd capital && DATABASE_URL="$CAPITAL" python3 ETL/events/load/migrations/apply.py all)
$PY "$M/capital_sources_to_grounding.py" --archive "$G/archive/raw" --out "$G/capital" \
    --apply --database-url "$CAPITAL"
$PY "$M/upload_manifest.py" "$G/capital/grounding_manifest_capital.jsonl" --archive "$G/archive/raw" --apply

echo "== 6. the cron reads its inputs from the bucket: BUCKET_* on capital-etl"
SID=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ id name } } } } }' 2>/dev/null |
      python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]);print([e['node']['id'] for e in d['data']['project']['services']['edges'] if e['node']['name']=='capital-etl'][0])")
VARS=$(python3 -c 'import json,os;print(json.dumps({k:os.environ[k] for k in ["BUCKET_ENDPOINT","BUCKET_NAME","BUCKET_REGION","BUCKET_ACCESS_KEY_ID","BUCKET_SECRET_ACCESS_KEY","BUCKET_ADDRESSING"]}))')
railway_api 'mutation($i: VariableCollectionUpsertInput!){ variableCollectionUpsert(input:$i) }' \
  --variables "{\"i\":{\"projectId\":\"$MANDATE_PROJECT\",\"environmentId\":\"$MANDATE_ENV\",\"serviceId\":\"$SID\",\"skipDeploys\":true,\"variables\":$VARS}}" >/dev/null
echo "done: grounding is live. Next (separate, paid ~\$0.25): re-embed on one model."
