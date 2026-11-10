#!/usr/bin/env bash
# ONE embedding model: capital's eligibility_embeddings, instrument_profiles
# and signals_chunk_embeddings onto voyage-4-large (1024-d halfvec), with no
# moment at which a query and the vectors it reads are in different spaces.
#
#   bash mandate/ops/one_model.sh            # 1. dry run: counts, cost, size. No call, no write.
#   bash mandate/ops/one_model.sh --apply    # 2. migration 036 + backfill (paid, ~$0.23) + verify
#   bash mandate/ops/one_model.sh --flip     # 3. on a BRANCH: spaces.json + TS mirror + caches
#   (merge the flip branch)                  # 4. THE deploy: Vercel and capital-etl, one commit
#   bash mandate/ops/one_model_drop_old.sh   # 5. later, briefed: archive + drop the old vectors
#
# HOW THERE IS NO WINDOW (mandate/ops/one_model.py has the detail):
#   * --apply writes the new vectors in a NEW column (embedding_v4) beside the
#     old. Readers are untouched; they keep reading the old column with the old
#     model. From the moment migration 036 exists the writers fill the new
#     column for every new row too, so the table cannot fall behind again.
#   * --flip changes ONE thing, spaces.json `stored`, and regenerates
#     web/lib/embedding.ts from it. The query model and the column every reader
#     reads (vector_columns) both come from that file, in Python and in
#     TypeScript, so they flip in the SAME commit. While Vercel rolls the deploy
#     out, the old build reads old vectors with the old model and the new build
#     reads new vectors with the new model: both columns are complete, so every
#     live version is consistent. capital-etl rebuilds from the same commit.
#   * --flip refuses unless verify passes (every row has a 1024-d vector).
#   * Nothing is deleted until step 5, separately, archived first.
#
# Idempotent: every step skips what is done (migration by stamp, backfill by
# `embedding_v4 IS NULL`, per-batch commit; kill it and re-run). Cost ~$0.23 of
# Voyage tokens (inside the account's free voyage-4 tokens, if unspent); the run
# prints the billed usage. Duration: ~10-20 minutes (175 requests of 128 texts).
# Not between Sat 23:00 and Sun 06:00 UTC: the weekly refresh runs Sun 03:00.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
MODE=${1:-}
case "$MODE" in ""|--apply|--flip|--measure) ;; *) echo "usage: $0 [--apply|--flip|--measure]" >&2; exit 2 ;; esac

python3 -c "import psycopg, httpx" 2>/dev/null || { echo "needs: pip install 'psycopg[binary]' httpx" >&2; exit 1; }
RO=$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)
OM="python3 mandate/ops/one_model.py"

if [ -z "${VOYAGE_KEY:-}${VOYAGE_API_KEY:-}" ] && [ -f capital/.env.local ]; then
  VOYAGE_KEY=$(/usr/bin/grep -E '^VOYAGE_KEY=' capital/.env.local | cut -d= -f2- | tr -d "\"'" || true)
  export VOYAGE_KEY
fi

measure_cmd() {
  cat <<EOF
  The end-to-end funnel (npm run stages, web/scripts/measure_funnel.ts) was the
  brief ranker's acceptance measurement. It is archived with the one-pager
  product at the tag archive/2026-11-pre-pivot; restore it from there to
  compare the legacy space against one model.
EOF
}

if [ "$MODE" = "" ]; then
  echo "== migrations pending in capital (036 is this step's; the others belong to the grounding go-live)"
  (cd capital && CAPITAL_RO_DATABASE_URL="$RO" env -u DATABASE_URL python3 ETL/events/load/migrations/apply.py --check) || true
  echo
  $OM plan --db-url "$RO" || { rc=$?; [ $rc = 3 ] && echo "REFUSED: projected size past 4.5 GB" >&2; exit $rc; }
  echo
  echo "Next: bash mandate/ops/one_model.sh --apply"
  exit 0
fi

if [ "$MODE" = "--measure" ]; then measure_cmd; exit 0; fi

if [ "$MODE" = "--apply" ]; then
  dow=$(date -u +%u); hr=$(date -u +%H)
  if { [ "$dow" = 6 ] && [ "$hr" -ge 23 ]; } || { [ "$dow" = 7 ] && [ "$hr" -lt 6 ]; }; then
    echo "REFUSED: the weekly refresh runs Sunday 03:00 UTC; run this outside Sat 23:00-Sun 06:00 UTC." >&2; exit 1
  fi
  [ -n "${VOYAGE_KEY:-}${VOYAGE_API_KEY:-}" ] || { echo "no VOYAGE_KEY (env or capital/.env.local)" >&2; exit 1; }
  CAPITAL=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
  echo "== 1. migration 036: embedding_v4 beside each legacy vector (no row rewritten)"
  (cd capital && DATABASE_URL="$CAPITAL" python3 ETL/events/load/migrations/apply.py 036)
  echo "== 2. backfill embedding_v4 (resumable; stops past \$1)"
  $OM backfill --db-url "$CAPITAL" --apply --max-usd 1.0
  echo "== 3. verify (read-only)"
  $OM verify --db-url "$RO"
  cat <<EOF

DONE: every row has its $(
  python3 -c 'import sys;sys.path.insert(0,".");from mandate.embedding import MODEL;print(MODEL)') vector beside the old one. Readers still read the old.
Next, on a branch (not main): bash mandate/ops/one_model.sh --flip
EOF
  measure_cmd
  exit 0
fi

# --flip: the repo change that IS the switch. One commit, one deploy.
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" != main ] || { echo "REFUSED on main: git switch -c one-model-flip first" >&2; exit 1; }
[ -n "${VOYAGE_KEY:-}" ] || { echo "no VOYAGE_KEY: the semantic cache is regenerated in the new space" >&2; exit 1; }
echo "== verify, then flip spaces.json stored -> MODEL for the three tables"
$OM flip --db-url "$RO"
python3 mandate/embedding/check_boundary.py --write
python3 mandate/embedding/check_boundary.py
echo "== the committed caches the offline checks rank on, regenerated in the new space (read-only, cents)"
(cd web && DATABASE_URL="$RO" npx tsx scripts/emit_semantic_cache.ts)
echo "== tests"
PYTHONPATH=. policy/.venv/bin/python -m pytest mandate/tests -q
(cd web && env -u DATABASE_URL -u VOYAGE_KEY npx vitest run)
cat <<EOF

FLIPPED in this checkout. Commit and merge it as ONE change; the merge deploys
Vercel (web/) and capital-etl from the same commit:

  git add mandate/embedding/spaces.json web/lib/embedding.ts web/lib/intelligence/semanticCache.generated.json
  git commit -m "One model: capital's vector tables read voyage-4-large"
  git push -u origin HEAD     # open the PR

Rollback before step 5 is a revert of that commit: the old vectors are still there.
EOF
measure_cmd
