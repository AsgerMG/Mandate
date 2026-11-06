#!/usr/bin/env bash
# Moves regina-ai.eu (and www) from the old Vercel project `regina` onto the one
# Mandate site (project `wincent`). web/vercel.json then 301s every regina-ai.eu
# path to wincent-ai.eu/regina/... Expect a minute of certificate re-issue.
#   bash mandate/ops/move_regina_domain.sh
set -euo pipefail
# The CLI stores a short-lived token and refreshes it when it runs; refresh first.
vercel whoami >/dev/null
T=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
TEAM=team_wcDvoHf2pd11bNbxhabfs5aO; A="Authorization: Bearer $T"
D=$(curl -s -H "$A" "https://api.vercel.com/v9/projects/regina/domains?teamId=$TEAM" |
    python3 -c "import json,sys;print(' '.join(d['name'] for d in json.load(sys.stdin)['domains'] if 'vercel.app' not in d['name']))")
for d in $D; do
  curl -s -X DELETE -H "$A" "https://api.vercel.com/v9/projects/regina/domains/$d?teamId=$TEAM" -o /dev/null -w "removed $d from regina (%{http_code})\n"
  curl -s -X POST -H "$A" -H "Content-Type: application/json" "https://api.vercel.com/v10/projects/wincent/domains?teamId=$TEAM" -d "{\"name\":\"$d\"}" -o /dev/null -w "added $d to the Mandate site (%{http_code})\n"
done
sleep 60; curl -s -o /dev/null -w "regina-ai.eu now answers %{http_code} -> %{redirect_url}\n" https://regina-ai.eu
