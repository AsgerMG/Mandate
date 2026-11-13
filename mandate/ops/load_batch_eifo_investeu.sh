#!/usr/bin/env bash
# Batch eifo_investeu: ground the EIFO / InvestEU deciding texts and load EIFO's products, their
# cited gates, the DK/EU status rules and the intermediaries table into production.
#   bash mandate/ops/load_batch_eifo_investeu.sh            # dry run: everything, then ROLLBACK
#   bash mandate/ops/load_batch_eifo_investeu.sh --apply    # write
#
# WHAT. capital/ETL/terms/load_batch_eifo_investeu.py, against the Mandate Postgres as
# capital_app: migration 041 (if it is the only one pending; 039 must be applied), the 13
# pinned documents into grounding (bucket objects first), their passages and voyage-4-large
# vectors (about 1.5 cents), 12 status keys + 20 status rules, 6 EIFO instruments + 42
# hand-cited gates (each linked to its grounding span), and 60 capital.intermediaries rows.
# Idempotent: a second --apply changes nothing.
#
# REFUSES (exit 3, nothing written) on drift: a pinned file whose bytes changed, a quote no
# longer in its text, another migration pending, eifo_coinvest missing, or a loaded row whose
# content differs from the committed YAML.
#
# The pinned bytes are read from $BATCH_EIFO_INVESTEU_ORIGINALS (default
# ~/Mandate-backups/batch_eifo_investeu/originals); a missing file is re-fetched and must
# match (the EIF/EIFO HTML pages will not: keep the pin store).
# Rehearse first if in doubt: python3 capital/ETL/terms/rehearse_batch_eifo_investeu.py --embed
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
APPLY=${1:-}
if [ -n "$APPLY" ] && [ "$APPLY" != "--apply" ]; then
  echo "usage: load_batch_eifo_investeu.sh [--apply]" >&2; exit 2
fi
source mandate/ops/_railway.sh
# The batch venv, pypdf PINNED: the quotes were located in pypdf 7.0.1's text, and the loader
# refuses if the extracted length differs. Shared with batch Italy (same pins).
VENV="${BATCH_ITALY_VENV:-$HOME/Mandate-backups/batch_italy/venv}"
PY="$VENV/bin/python"
if ! "$PY" -c "import psycopg, httpx, yaml, pypdf; assert pypdf.__version__ == '7.0.1'" 2>/dev/null; then
  uv venv -q "$VENV"
  uv pip install -q --python "$PY" "psycopg[binary]>=3.2" "httpx>=0.27" pyyaml "pypdf==7.0.1"
fi
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
PYTHONPATH="$ROOT" "$PY" capital/ETL/terms/load_batch_eifo_investeu.py --database-url "$DB" $APPLY
