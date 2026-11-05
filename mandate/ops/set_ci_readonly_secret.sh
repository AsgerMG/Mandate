#!/usr/bin/env bash
# Gives GitHub Actions the READ-ONLY capital role, so CI builds the site's data
# from Railway instead of from committed or laptop files. capital_ro can read
# every capital table and write none; the role refuses, not the workflow.
#   bash mandate/ops/set_ci_readonly_secret.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
db_var CAPITAL_RO_DATABASE_PUBLIC_URL | gh secret set CAPITAL_RO_DATABASE_URL --repo AsgerMG/Mandate
echo "done: secret CAPITAL_RO_DATABASE_URL set on AsgerMG/Mandate"
