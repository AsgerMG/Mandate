#!/usr/bin/env bash
# Vercel `wincent` reads the capital brain as capital_app on the shared Mandate
# database, instead of the frozen Capina database. Then redeploys production.
#   bash mandate/ops/point_capital_site_at_shared_db.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
URL=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
SITE=~/Wincent/website/frontend   # the directory linked to the Vercel project today
for env in production preview; do
  vercel env rm DATABASE_URL "$env" --yes --cwd "$SITE" >/dev/null 2>&1 || true
  printf %s "$URL" | vercel env add DATABASE_URL "$env" --sensitive --cwd "$SITE"
done
vercel redeploy https://wincent-ai.eu --target production --cwd "$SITE"
echo "done: wincent reads capital_app on the Mandate database"
