#!/usr/bin/env bash
# Step 5 of the one-model move, and the only one that DELETES: archive, then
# drop capital's legacy vector columns (voyage-3.5 and the 384-d MiniLM).
# BRIEF THE OWNER FIRST. Written 7 Nov 2026; not run.
#
#   bash mandate/ops/one_model_drop_old.sh            # dry run: preconditions + what would go
#   bash mandate/ops/one_model_drop_old.sh --apply    # archive, drop, reclaim (asks to type DROP)
#
# WHAT GOES: the column `embedding` of eligibility_embeddings (9,103 x 1024-d
# vector, plus its HNSW index), of instrument_profiles (1,088 x 1024-d, plus
# its HNSW index) and of signals_chunk_embeddings (11,184 x 384-d). ~150 MB on
# a 5 GB volume. No reader has read them since the flip; nothing else is lost:
# every row keeps its text and its voyage-4-large vector (embedding_v4).
#
# PRECONDITIONS (checked; it refuses otherwise):
#   1. the flip is on origin/main: spaces.json stores all three in MODEL, so no
#      deployed reader or writer touches the legacy column any more;
#   2. verify passes: every row has its MODEL vector;
#   3. not Sat 23:00 - Sun 06:00 UTC (the weekly refresh);
#   4. a pg_dump archive of the three tables, made by this script, restores
#      its table list (pg_restore --list) before anything is dropped.
#
# THE DROP IS A MIGRATION, so the committed DDL still describes the store: the
# script writes capital/ETL/schema/migrations/NNN_drop_legacy_vectors.sql (next
# free id), applies it with apply.py, and cleans the legacy spaces out of
# spaces.json. COMMIT AND MERGE THAT before the next Sunday 03:00 UTC: the
# weekly run's first step verifies the store against the committed DDL and
# stops the run if a declared column is missing.
#
# Rollback: pg_restore the archive into a scratch schema and copy the column
# back (the archive path is printed). Duration: ~2 minutes.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
TABLES="eligibility_embeddings instrument_profiles signals_chunk_embeddings"
MIGDIR=capital/ETL/schema/migrations

echo "== 1. the flip is on origin/main"
git fetch -q origin main
git show origin/main:mandate/embedding/spaces.json | python3 -c '
import json, sys
d = json.load(sys.stdin)
bad = [t for t in ("capital.eligibility_embeddings", "capital.instrument_profiles",
                   "capital.signals_chunk_embeddings") if d["stored"][t] != d["model"]]
if bad:
    sys.exit("REFUSED: origin/main still stores " + ", ".join(bad) + " in a legacy space: "
             "readers would lose their vectors. Merge the flip (one_model.sh --flip) first.")
print("  ok: origin/main reads all three in", d["model"])'

echo "== 2. every row has its new vector"
RO=$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)
python3 mandate/ops/one_model.py verify --db-url "$RO"

dow=$(date -u +%u); hr=$(date -u +%H)
if { [ "$dow" = 6 ] && [ "$hr" -ge 23 ]; } || { [ "$dow" = 7 ] && [ "$hr" -lt 6 ]; }; then
  echo "REFUSED: inside the Sunday refresh window (Sat 23:00 - Sun 06:00 UTC)." >&2; exit 1
fi

NEXT=$(ls $MIGDIR | sed -n 's/^\([0-9][0-9][0-9]\)_.*/\1/p' | sort | tail -1)
NEXT=$(printf "%03d" $((10#$NEXT + 1)))
existing=$(ls $MIGDIR | /usr/bin/grep '_drop_legacy_vectors.sql' || true)
[ -n "$existing" ] && NEXT=${existing%%_*}
MIG="$MIGDIR/${NEXT}_drop_legacy_vectors.sql"

echo "== 3. what would go"
python3 - "$RO" <<'EOF'
import sys, psycopg
c = psycopg.connect(sys.argv[1])
for t in ("eligibility_embeddings", "instrument_profiles", "signals_chunk_embeddings"):
    has = c.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='capital' "
                    "AND table_name=%s AND column_name='embedding'", (t,)).fetchone()
    n = c.execute(f"SELECT count(*) FROM capital.{t}").fetchone()[0]
    print(f"  capital.{t}.embedding: {'present' if has else 'ALREADY GONE'}, {n:,} rows")
EOF
echo "  migration to write: $MIG"
if [ "$APPLY" = 0 ]; then echo; echo "DRY RUN. Brief the owner, then: bash $0 --apply"; exit 0; fi

read -r -p "Type DROP to archive and drop the legacy vector columns: " ok
[ "$ok" = DROP ] || { echo "not confirmed; nothing done"; exit 1; }

CAPITAL=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
TS=$(date -u +%Y%m%dT%H%M%SZ); B=~/Mandate-backups/one_model/$TS; mkdir -p "$B"
echo "== 4. archive: pg_dump of the three tables -> $B"
args=(); for t in $TABLES; do args+=(-t "capital.$t"); done
pg_dump "$RO" -Fc --no-owner "${args[@]}" -f "$B/legacy_vectors.dump"
listed=$(pg_restore --list "$B/legacy_vectors.dump" | /usr/bin/grep -c "TABLE DATA capital" || true)
[ "$listed" = 3 ] || { echo "REFUSED: the archive lists $listed of 3 tables" >&2; exit 1; }
shasum -a 256 "$B/legacy_vectors.dump" > "$B/legacy_vectors.dump.sha256"
echo "  archived and listed: 3 tables ($(du -h "$B/legacy_vectors.dump" | cut -f1))"

echo "== 5. the drop, as migration $NEXT"
cat > "$MIG" <<'SQL'
-- The legacy vectors' exit (mandate/ops/one_model_drop_old.sh, step 5 of the
-- one-model move). Every row's vector in the one Mandate model is in
-- embedding_v4 (036) and every reader has read it since the flip; the legacy
-- columns were archived with pg_dump before this ran (~/Mandate-backups/one_model/).
-- Dropping a column drops its HNSW index with it.
ALTER TABLE eligibility_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE instrument_profiles DROP COLUMN IF EXISTS embedding;
ALTER TABLE signals_chunk_embeddings DROP COLUMN IF EXISTS embedding;
SQL
(cd capital && DATABASE_URL="$CAPITAL" python3 ETL/events/load/migrations/apply.py "$NEXT")
MODEL=$(python3 -c 'import sys;sys.path.insert(0,".");from mandate.embedding import MODEL;print(MODEL)')
python3 - "$CAPITAL" "$MODEL" <<'EOF'
import sys, psycopg
url, model = sys.argv[1], sys.argv[2]
with psycopg.connect(url, autocommit=True) as c:
    c.execute("SET search_path = capital, public")
    # `model` says which space a row's vector is in; after the drop it is MODEL for every row.
    for t in ("eligibility_embeddings", "instrument_profiles"):
        n = c.execute(f"UPDATE {t} SET model = %s WHERE model IS DISTINCT FROM %s", (model, model)).rowcount
        print(f"  {t}.model -> {model}: {n:,} rows")
    # The space a dropped column held is only reclaimed by a rewrite. Seconds on
    # tables this size; each briefly blocks reads of that one table.
    for t in ("eligibility_embeddings", "instrument_profiles", "signals_chunk_embeddings"):
        c.execute(f"VACUUM (FULL, ANALYZE) {t}")
        print(f"  {t}: rewritten, {c.execute('SELECT pg_size_pretty(pg_total_relation_size(%s::regclass))', (t,)).fetchone()[0]}")
EOF

echo "== 6. spaces.json: the legacy spaces and their columns are gone"
python3 - <<'EOF'
import json
from pathlib import Path
p = Path("mandate/embedding/spaces.json"); d = json.loads(p.read_text())
held = set(d["stored"].values())
for t, by in d["vector_columns"].items():
    d["vector_columns"][t] = {s: c for s, c in by.items() if s in held}
d["spaces"] = {s: v for s, v in d["spaces"].items() if s in held}
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
print("  spaces left:", ", ".join(d["spaces"]))
EOF
python3 mandate/embedding/check_boundary.py --write
cat <<EOF

DROPPED. Archive: $B/legacy_vectors.dump (sha256 beside it).
Commit and merge BEFORE the next Sunday 03:00 UTC (the weekly run verifies the
store against the committed DDL):

  git switch -c one-model-drop-old
  git add $MIG mandate/embedding/spaces.json web/lib/embedding.ts
  git commit -m "One model: the legacy vector columns are archived and dropped"
  git push -u origin HEAD
EOF
