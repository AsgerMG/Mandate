#!/usr/bin/env bash
# Deletes Vercel projects that serve nothing any more (owner, 2026-11-09):
#   regina                  the old Regina site; regina-ai.eu now redirects into wincent /regina
#   the-memory-studio-web   an old, unrelated project, idle since May
#
#   bash mandate/ops/delete_vercel_projects.sh            # dry run: what each holds
#   bash mandate/ops/delete_vercel_projects.sh --apply    # archive env vars, then delete (type each name)
#
# Refuses a project that still has a custom domain. Before deleting, its
# environment variables (they may hold API keys) are saved to
# ~/Mandate-backups/vercel/<project>.env, chmod 600. Source code is in git and
# unaffected; only the Vercel project and its old deployments go.
set -euo pipefail
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
api() { curl -fsS -H "Authorization: Bearer $TOKEN" "$@"; }
OUT=~/Mandate-backups/vercel; mkdir -p "$OUT"; chmod 700 "$OUT"
for P in regina the-memory-studio-web; do
  echo "== $P"
  if ! api "https://api.vercel.com/v9/projects/$P" >/dev/null 2>&1; then echo "  already gone"; continue; fi
  CUSTOM=$(api "https://api.vercel.com/v9/projects/$P/domains" | python3 -c "import json,sys;print(' '.join(x['name'] for x in json.load(sys.stdin)['domains'] if not x['name'].endswith('.vercel.app')))")
  [ -z "$CUSTOM" ] || { echo "  STOP: $P still serves $CUSTOM; skipped"; continue; }
  api "https://api.vercel.com/v9/projects/$P/env?decrypt=true" | python3 -c "
import json,sys; e=json.load(sys.stdin).get('envs',[])
print('  env vars:', ', '.join(sorted({x['key'] for x in e})) or 'none')"
  [ "$APPLY" = 1 ] || continue
  api "https://api.vercel.com/v9/projects/$P/env?decrypt=true" | python3 -c "
import json,sys
for x in json.load(sys.stdin).get('envs',[]):
    print(f\"# targets: {','.join(x.get('target') or [])}\"); print(f\"{x['key']}={json.dumps(x.get('value',''))}\")" > "$OUT/$P.env"
  chmod 600 "$OUT/$P.env"; echo "  saved env vars -> $OUT/$P.env"
  read -r -p "  Type $P to delete the Vercel project: " ok
  [ "$ok" = "$P" ] || { echo "  not confirmed; kept"; continue; }
  api -X DELETE "https://api.vercel.com/v9/projects/$P" >/dev/null && echo "  DELETED: $P"
done
[ "$APPLY" = 1 ] || echo "DRY RUN: nothing saved, nothing deleted. Next: bash $0 --apply"
