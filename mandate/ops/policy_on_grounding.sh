#!/usr/bin/env bash
# Puts the policy brain ON the grounding store: from here on policy reads and
# writes its source text, versions, fetches, passages and vectors in schema
# grounding, and policy.document_versions / policy.passages become read-only.
#
#   bash mandate/ops/policy_on_grounding.sh      # then merge policy-on-grounding
#
# PRECONDITION: go_live_grounding.sh has completed (policy_to_grounding --apply:
# every policy version linked). The script checks and stops otherwise.
# WHEN: not during the weekly refresh (Sundays 03:00 UTC). Merge the branch
# straight after: once step 3 has run, the OLD code's writes are refused.
# Writes: two sequence positions in grounding, BUCKET_* on the Regina service
# (no redeploy), Alembic 5c2f9e1a7b30 in schema policy (a new table
# version_refs, two views, two triggers, one FK dropped). Deletes nothing.
# No paid calls.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
ADMIN=$(db_var DATABASE_URL)
POLICY=$(db_var POLICY_DATABASE_PUBLIC_URL)

echo "== 0. precondition: every policy version is in grounding"
UNLINKED=$(psql "$ADMIN" -Atc "SELECT count(*) FROM policy.document_versions v WHERE NOT EXISTS
  (SELECT 1 FROM policy.grounding_version_link l WHERE l.policy_version_id = v.id)")
[ "$UNLINKED" = "0" ] || { echo "STOP: $UNLINKED policy versions unlinked. Re-run go_live_grounding.sh."; exit 1; }

echo "== 1. grounding's id sequences above every policy id (a new passage must never"
echo "      take the id of a folded duplicate that a stored citation still names)"
psql "$ADMIN" -v ON_ERROR_STOP=1 -Atc "
  SELECT setval(pg_get_serial_sequence('grounding.passages', 'id'),
         GREATEST((SELECT max(id) FROM grounding.passages), (SELECT max(id) FROM policy.passages), 1));
  SELECT setval(pg_get_serial_sequence('grounding.document_versions', 'id'),
         GREATEST((SELECT max(id) FROM grounding.document_versions), (SELECT max(id) FROM policy.document_versions), 1));"

echo "== 2. the policy API stores originals: BUCKET_* on the Regina service"
eval "$(npx --yes @railway/cli bucket credentials --bucket mandate-grounding --json | python3 -c '
import json,sys,shlex; d=json.load(sys.stdin); d=d if isinstance(d,dict) else d[0]
for k,v in {"BUCKET_ENDPOINT":d["endpoint"],"BUCKET_NAME":d["bucketName"],"BUCKET_REGION":d["region"],
            "BUCKET_ACCESS_KEY_ID":d["accessKeyId"],"BUCKET_SECRET_ACCESS_KEY":d["secretAccessKey"],
            "BUCKET_ADDRESSING":"virtual" if d.get("urlStyle","virtual-host").startswith("virtual") else "path"}.items():
    print(f"export {k}={shlex.quote(v)}")')"
SID=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ id name } } } } }' 2>/dev/null |
      python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]);print([e['node']['id'] for e in d['data']['project']['services']['edges'] if e['node']['name']=='Regina'][0])")
VARS=$(python3 -c 'import json,os;print(json.dumps({k:os.environ[k] for k in ["BUCKET_ENDPOINT","BUCKET_NAME","BUCKET_REGION","BUCKET_ACCESS_KEY_ID","BUCKET_SECRET_ACCESS_KEY","BUCKET_ADDRESSING"]}))')
railway_api 'mutation($i: VariableCollectionUpsertInput!){ variableCollectionUpsert(input:$i) }' \
  --variables "{\"i\":{\"projectId\":\"$MANDATE_PROJECT\",\"environmentId\":\"$MANDATE_ENV\",\"serviceId\":\"$SID\",\"skipDeploys\":true,\"variables\":$VARS}}" >/dev/null
echo "BUCKET_* set on Regina (takes effect at the deploy the merge triggers)"

echo "== 3. Alembic 5c2f9e1a7b30: version_refs, the grounded views, legacy read-only"
(cd policy && DATABASE_URL="$POLICY" uv run --frozen alembic upgrade head)

echo "== 4. verify (every figure must hold; the last two must be 0)"
psql "$POLICY" -v ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM document_versions)                  AS legacy_versions,
         (SELECT count(*) FROM version_refs)                       AS version_refs,
         (SELECT count(*) FROM passages)                           AS legacy_passages,
         (SELECT count(*) FROM grounded_passages)                  AS grounded_passages,
         (SELECT count(*) FROM grounded_passages WHERE embedding IS NOT NULL) AS embedded,
         (SELECT count(*) FROM document_actor a WHERE a.passage_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM grounding_passage_link l WHERE l.policy_passage_id = a.passage_id)
            AND NOT EXISTS (SELECT 1 FROM grounding.passages g WHERE g.id = a.passage_id)) AS actor_ids_unresolved,
         (SELECT count(*) FROM enrichments e, jsonb_array_elements_text(e.citations->'passage_ids') pid
           WHERE NOT EXISTS (SELECT 1 FROM grounding_passage_link l WHERE l.policy_passage_id = pid::bigint)
             AND NOT EXISTS (SELECT 1 FROM grounding.passages g WHERE g.id = pid::bigint)) AS citation_ids_unresolved;"
echo "done. Now merge policy-on-grounding to main (Railway redeploys Regina), then:"
echo "  curl -s https://regina-production.up.railway.app/api/stats"
