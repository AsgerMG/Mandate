#!/usr/bin/env bash
# Puts the advisor live: the Railway service mandate-api, and the three Vercel
# settings the site's mission route needs. Idempotent: re-running reuses the
# service and its secrets.
#   bash mandate/ops/setup_advisor.sh
# Creates (never deletes): Railway service mandate-api (repo AsgerMG/Mandate,
# root /, config /mandate/railway.json, role mandate_app), its public domain,
# and Vercel production env MANDATE_API_URL / MANDATE_SERVICE_TOKEN /
# MANDATE_MISSION_KEY, then redeploys the site so it reads them.
# Secrets are generated here and kept in ~/Mandate-backups/advisor.env (600).
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
J() { python3 -c "import json,sys;r=sys.stdin.read();d=json.loads(r[:r.rfind('}')+1]);print(eval(sys.argv[1]))" "$1"; }
SECRETS=~/Mandate-backups/advisor.env
[ -f "$SECRETS" ] || { umask 077; printf 'MANDATE_SERVICE_TOKEN=%s\nMANDATE_MISSION_KEY=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 24)" > "$SECRETS"; }
set -a; source "$SECRETS"; set +a

echo "== 1. the Railway service"
SID=$(railway_api 'query{ project(id:"'"$MANDATE_PROJECT"'"){ services{ edges{ node{ id name } } } } }' 2>/dev/null |
      J "[e['node']['id'] for e in d['data']['project']['services']['edges'] if e['node']['name']=='mandate-api'][0] if [e for e in d['data']['project']['services']['edges'] if e['node']['name']=='mandate-api'] else ''")
if [ -z "$SID" ]; then
  SID=$(railway_api 'mutation{ serviceCreate(input:{projectId:"'"$MANDATE_PROJECT"'", name:"mandate-api", source:{repo:"AsgerMG/Mandate"}, branch:"main"}){ id } }' 2>/dev/null | J "d['data']['serviceCreate']['id']")
  echo "  created mandate-api ($SID)"
else echo "  exists ($SID)"; fi
# Railway refuses railway.json on NEW services (Config as Code is deprecated;
# existing ones keep it until 2026-12-01), so the settings mandate/railway.json
# states are set on the service itself, and the Dockerfile through
# RAILWAY_DOCKERFILE_PATH, as the other services already do.
railway_api 'mutation{ serviceInstanceUpdate(serviceId:"'"$SID"'", environmentId:"'"$MANDATE_ENV"'", input:{rootDirectory:"/", healthcheckPath:"/health", restartPolicyType:ON_FAILURE, restartPolicyMaxRetries:3}) }' >/dev/null
bucket_env
VARS=$(python3 -c 'import json,os;print(json.dumps({"DATABASE_URL":"${{pgvector.MANDATE_DATABASE_URL}}","RAILWAY_DOCKERFILE_PATH":"mandate/Dockerfile","MANDATE_SERVICE_TOKEN":os.environ["MANDATE_SERVICE_TOKEN"],**{k:os.environ[k] for k in ["BUCKET_ENDPOINT","BUCKET_NAME","BUCKET_REGION","BUCKET_ACCESS_KEY_ID","BUCKET_SECRET_ACCESS_KEY","BUCKET_ADDRESSING"]}}))')
railway_api 'mutation($i: VariableCollectionUpsertInput!){ variableCollectionUpsert(input:$i) }' \
  --variables "{\"i\":{\"projectId\":\"$MANDATE_PROJECT\",\"environmentId\":\"$MANDATE_ENV\",\"serviceId\":\"$SID\",\"skipDeploys\":true,\"variables\":$VARS}}" >/dev/null
echo "  variables set (database as mandate_app, service token, bucket)"
DOMAIN=$(railway_api 'query{ domains(projectId:"'"$MANDATE_PROJECT"'", environmentId:"'"$MANDATE_ENV"'", serviceId:"'"$SID"'"){ serviceDomains{ domain } } }' 2>/dev/null |
         J "(d['data']['domains']['serviceDomains'] or [{'domain':''}])[0]['domain']")
[ -n "$DOMAIN" ] || DOMAIN=$(railway_api 'mutation{ serviceDomainCreate(input:{serviceId:"'"$SID"'", environmentId:"'"$MANDATE_ENV"'"}){ domain } }' 2>/dev/null | J "d['data']['serviceDomainCreate']['domain']")
echo "  domain https://$DOMAIN"

echo "== 2. deploy main and wait for /health"
git fetch -q origin main; SHA=$(git rev-parse origin/main)
DID=$(railway_api "mutation{ serviceInstanceDeployV2(serviceId:\"$SID\", environmentId:\"$MANDATE_ENV\", commitSha:\"$SHA\") }" 2>/dev/null | J "d['data']['serviceInstanceDeployV2']")
for i in $(seq 1 60); do
  ST=$(railway_api "query{ deployment(id:\"$DID\"){ status } }" 2>/dev/null | J "d['data']['deployment']['status']")
  case "$ST" in SUCCESS) break ;; FAILED|CRASHED|REMOVED) echo "STOP: deployment $ST (Railway dashboard -> mandate-api -> logs)"; exit 1 ;; esac
  sleep 15
done
[ "$ST" = SUCCESS ] || { echo "STOP: still $ST after 15 min"; exit 1; }
sleep 10; echo "  /health: $(curl -fsS https://$DOMAIN/health)"

echo "== 3. Vercel: the site's three settings, then a redeploy"
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
for kv in "MANDATE_API_URL=https://$DOMAIN" "MANDATE_SERVICE_TOKEN=$MANDATE_SERVICE_TOKEN" "MANDATE_MISSION_KEY=$MANDATE_MISSION_KEY"; do
  k=${kv%%=*}; v=${kv#*=}
  curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://api.vercel.com/v10/projects/wincent/env?upsert=true" \
    -d "{\"key\":\"$k\",\"value\":\"$v\",\"type\":\"encrypted\",\"target\":[\"production\"]}" >/dev/null && echo "  $k set"
done
cd web
LATEST=$(npx --yes vercel ls wincent --prod 2>/dev/null | /usr/bin/grep -oE 'https://wincent-[a-z0-9]+-asgermgs-projects.vercel.app' | head -1)
npx --yes vercel redeploy "$LATEST" --target production >/dev/null 2>&1 && echo "  site redeploying with the settings (~7 min)"
echo "DONE: advisor API https://$DOMAIN. Your mission key is in $SECRETS (for the x-mandate-key header)."
