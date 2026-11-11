#!/usr/bin/env bash
# Fill the text of grounding versions stored without it (598 PDFs from the 5 Nov archive load).
#   bash mandate/ops/fill_missing_text.sh            # applies the trigger change, then a DRY RUN
#   bash mandate/ops/fill_missing_text.sh --apply    # ... then fills
#
# 1. mandate/db/grounding.sql, as the admin: idempotent (CREATE OR REPLACE). It lets
#    grounding allow exactly one UPDATE, NULL text -> text with its extractor, every other
#    column unchanged, and grants the brain roles UPDATE on (text, extractor) only.
#    Everything else stays refused. This step runs even in the dry run: it changes what is
#    PERMITTED, not any row.
# 2. mandate/grounding/migrations/fill_missing_text.py, as capital_app: reads each original
#    from the bucket (sha256-verified), extracts it (pypdf 7.0.1 pinned; the HTML parser),
#    fills it. Skips and lists scans and failures. Nothing is overwritten or deleted.
# Then bash mandate/ops/load_batch_italy.sh works on versions that were textless.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
APPLY=${1:-}
if [ -n "$APPLY" ] && [ "$APPLY" != "--apply" ]; then
  echo "usage: fill_missing_text.sh [--apply]" >&2; exit 2
fi
source mandate/ops/_railway.sh
VENV="${BATCH_ITALY_VENV:-$HOME/Mandate-backups/batch_italy/venv}"
PY="$VENV/bin/python"
if ! "$PY" -c "import psycopg, httpx, pypdf; assert pypdf.__version__ == '7.0.1'" 2>/dev/null; then
  uv venv -q "$VENV"
  uv pip install -q --python "$PY" "psycopg[binary]>=3.2" "httpx>=0.27" pyyaml "pypdf==7.0.1"
fi
echo "== grounding.sql (admin; idempotent) =="
psql "$(db_var DATABASE_URL)" -X -v ON_ERROR_STOP=1 -q -f mandate/db/grounding.sql
echo "== fill missing text ${APPLY:-(dry run)} =="
bucket_env
PYTHONPATH="$ROOT" "$PY" mandate/grounding/migrations/fill_missing_text.py \
  --database-url "$(db_var CAPITAL_DATABASE_PUBLIC_URL)" $APPLY
