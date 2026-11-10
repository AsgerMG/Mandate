#!/usr/bin/env bash
# Batch 1, Italy: ground the deciding texts and load the status layer into production.
#   bash mandate/ops/load_batch_italy.sh            # dry run: everything, then ROLLBACK
#   bash mandate/ops/load_batch_italy.sh --apply    # write
#
# WHAT. capital/ETL/terms/load_batch_italy.py, against the Mandate Postgres as capital_app:
# migration 039 (if it is the only one pending), the 16 pinned documents into grounding
# (bucket objects first, then document/version/fetch), their passages and voyage-4-large
# vectors (about a cent), and capital.status_keys / status_rules / region_priorities /
# source_supersessions. Idempotent: a second --apply changes nothing.
#
# REFUSES (exit 3, nothing written) on drift: a pinned file whose bytes changed, a quote
# no longer in its text, another migration pending, a rule naming an instrument the store
# lacks, or a loaded row whose content differs from the committed YAML.
#
# The pinned bytes are read from $BATCH_ITALY_ORIGINALS (default
# ~/Mandate-backups/batch_italy/originals); a missing file is re-fetched and must match.
# Rehearse first if in doubt: python3 capital/ETL/terms/rehearse_batch_italy.py --embed
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
APPLY=${1:-}
if [ -n "$APPLY" ] && [ "$APPLY" != "--apply" ]; then
  echo "usage: load_batch_italy.sh [--apply]" >&2; exit 2
fi
source mandate/ops/_railway.sh
# Its own venv, with pypdf PINNED: the quotes were located in pypdf 7.0.1's text, and the
# loader refuses if the extracted length differs (another version extracts other text).
VENV="${BATCH_ITALY_VENV:-$HOME/Mandate-backups/batch_italy/venv}"
PY="$VENV/bin/python"
if ! "$PY" -c "import psycopg, httpx, yaml, pypdf; assert pypdf.__version__ == '7.0.1'" 2>/dev/null; then
  uv venv -q "$VENV"
  uv pip install -q --python "$PY" "psycopg[binary]>=3.2" "httpx>=0.27" pyyaml "pypdf==7.0.1"
fi
# Voyage key for the vectors: the repo-root or capital env file, never printed.
if [ -z "${VOYAGE_KEY:-}${VOYAGE_API_KEY:-}" ]; then
  for f in .env.local capital/.env.local web/.env.local; do
    [ -f "$f" ] && k=$(grep -E '^VOYAGE_(API_)?KEY=' "$f" | head -1 | cut -d= -f2- | tr -d '"') && [ -n "$k" ] && export VOYAGE_KEY="$k" && break
  done
fi
DB=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
if [ "$APPLY" = "--apply" ]; then
  bucket_env
  [ -n "${VOYAGE_KEY:-}${VOYAGE_API_KEY:-}" ] || { echo "no VOYAGE_KEY: rerun with it, or add --no-embed by hand" >&2; exit 2; }
fi
PYTHONPATH="$ROOT" "$PY" capital/ETL/terms/load_batch_italy.py --database-url "$DB" $APPLY
