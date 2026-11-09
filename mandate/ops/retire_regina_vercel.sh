#!/usr/bin/env bash
# Stops the failed-deployment emails: the old `regina` Vercel project is still
# git-connected to AsgerMG/Mandate with root directory policy/website, which no
# longer exists (the site moved into web/ at /regina; regina-ai.eu redirects
# there). So every push builds it and fails in ~3 s, and Vercel emails each one.
#
#   bash mandate/ops/retire_regina_vercel.sh
#
# Disconnects the project from GitHub. Deletes NOTHING: the project, its old
# deployments and regina-intel.vercel.app stay; reconnect any time with
# `vercel git connect`. Refuses if the project still holds a custom domain.
set -euo pipefail
D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
cd "$D"
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
DOMAINS=$(curl -fsS -H "Authorization: Bearer $TOKEN" https://api.vercel.com/v9/projects/regina/domains |
  python3 -c "import json,sys;print(' '.join(x['name'] for x in json.load(sys.stdin)['domains'] if not x['name'].endswith('.vercel.app')))")
[ -z "$DOMAINS" ] || { echo "STOP: regina still serves $DOMAINS"; exit 1; }
npx --yes vercel link --yes --project regina >/dev/null
printf 'y\n' | npx --yes vercel git disconnect
curl -fsS -H "Authorization: Bearer $TOKEN" https://api.vercel.com/v9/projects/regina |
  python3 -c "import json,sys;l=json.load(sys.stdin).get('link');print('done: regina is no longer connected to git' if not l else f'STILL LINKED: {l}')"
