#!/usr/bin/env bash
# Read access to the graph core (capital migration 042) for the app's read-only role, which the
# brains' tools use (institution_tree, stakeholders). The tables were created by the loader as the
# admin user, so the default privileges for capital_app's tables did not cover them.
# Grants only: SELECT to capital_ro, SELECT+INSERT to capital_app. Changes no data.
#   bash ~/Mandate/mandate/ops/grant_graph_core.sh
set -euo pipefail
cd "$(dirname "$0")"; source _railway.sh
URL=$(db_var DATABASE_PUBLIC_URL 2>/dev/null || db_var DATABASE_URL)
psql "$URL" -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT SELECT ON capital.institutions, capital.institution_offers, capital.processes,
                capital.process_steps, capital.stakeholders, capital.org_charts TO capital_ro;
GRANT SELECT, INSERT ON capital.institutions, capital.institution_offers, capital.processes,
                        capital.process_steps, capital.stakeholders, capital.org_charts TO capital_app;
SQL
psql "$URL" -At -c "select count(*) from information_schema.role_table_grants where grantee='capital_ro' and table_schema='capital' and table_name in ('institutions','institution_offers','processes','process_steps','stakeholders','org_charts')" \
  | xargs -I{} echo "capital_ro can now read {} of the 6 graph-core tables (expect 6)."
