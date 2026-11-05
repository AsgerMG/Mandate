#!/usr/bin/env bash
# The capital site's build generates its data files (companies_index.json,
# instrument_terms.json, ...) from Postgres as capital_ro. Vercel needs that URL
# at BUILD time. Read-only: the role can write nothing.
#   bash mandate/ops/give_capital_site_readonly_db.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
URL=$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)
SITE=~/Wincent/website/frontend   # linked to the Vercel project `wincent`
for env in production preview; do
  vercel env rm CAPITAL_RO_DATABASE_URL "$env" --yes --cwd "$SITE" >/dev/null 2>&1 || true
  printf %s "$URL" | vercel env add CAPITAL_RO_DATABASE_URL "$env" --sensitive --cwd "$SITE"
done
echo "done: wincent builds its data from capital_ro"
