#!/usr/bin/env bash
# A DELETION. Brief the owner before --apply.
#
# After the cutover (policy_on_grounding.sh, policy-on-grounding merged and
# Regina redeployed), policy.passages and policy.document_versions are
# read-only copies of what schema grounding now holds: the same texts, the same
# passages, and the passages' vectors in float32 where grounding keeps halfvec.
# This drops the two tables, after archiving them with pg_dump.
#
#   bash mandate/ops/drop_policy_duplicates.sh            # dry run (default): checks + sizes, writes nothing
#   bash mandate/ops/drop_policy_duplicates.sh --apply    # archive, verify the archive, drop
#
# What it KEEPS: everything policy derives (documents, enrichments, actors,
# version_refs), the three link tables (they map every old id, so a stored
# citation still resolves), and every byte of the dropped tables in the
# archive, restorable with
#   pg_restore --dbname "$ADMIN" --schema policy <archive>.dump
#
# Refuses unless: the cutover ran (version_refs + grounded views exist); every
# legacy version and passage is linked to grounding with identical text; every
# legacy vector has its grounding copy; grounding's HNSW index exists; and
# nothing has read the legacy tables for --quiet-seconds (default 300), i.e.
# the deployed Regina is the new code. No paid calls. Not on Sundays 03:00 UTC.
#
# In the same change as --apply: remove LegacyPassage / LegacyDocumentVersion
# (and the Index ix_passages_embedding_hnsw they declare) from
# policy/data/models.py, or `alembic revision --autogenerate` will propose
# re-creating both tables and the ~1 GB float32 index.
set -euo pipefail
cd "$(dirname "$0")/../.."
source mandate/ops/_railway.sh
APPLY=0; QUIET=300
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --quiet-seconds=*) QUIET=${a#*=} ;;
    *) echo "unknown argument $a"; exit 2 ;;
  esac
done
ADMIN=$(db_var DATABASE_URL)
PSQL=(psql "$ADMIN" -X -v ON_ERROR_STOP=1 -At)
TABLES="policy.passages policy.document_versions"
ARCHIVE_DIR=~/Mandate-backups/$(date -u +%F)
ARCHIVE="$ARCHIVE_DIR/policy_legacy_sources.dump"

echo "== 0. preconditions"
CUT=$("${PSQL[@]}" -c "SELECT to_regclass('policy.version_refs') IS NOT NULL AND to_regclass('policy.grounded_passages') IS NOT NULL")
[ "$CUT" = "t" ] || { echo "STOP: the cutover has not run (no version_refs / grounded_passages): policy_on_grounding.sh first"; exit 1; }
FAIL=$("${PSQL[@]}" -c "
  SELECT concat_ws('; ',
    (SELECT CASE WHEN count(*) > 0 THEN count(*) || ' legacy versions without a version_ref' END
       FROM policy.document_versions v WHERE NOT EXISTS (SELECT 1 FROM policy.version_refs r WHERE r.id = v.id)),
    (SELECT CASE WHEN count(*) > 0 THEN count(*) || ' legacy passages unlinked or with different text in grounding' END
       FROM policy.passages p LEFT JOIN policy.grounding_passage_link l ON l.policy_passage_id = p.id
       LEFT JOIN grounding.passages g ON g.id = l.grounding_passage_id
      WHERE g.id IS NULL OR g.text <> p.text),
    (SELECT CASE WHEN count(*) > 0 THEN count(*) || ' legacy vectors with no grounding copy' END
       FROM policy.passages p JOIN policy.grounding_passage_link l ON l.policy_passage_id = p.id
      WHERE p.embedding IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM grounding.passage_embeddings e WHERE e.passage_id = l.grounding_passage_id)),
    CASE WHEN to_regclass('grounding.ix_gpe_hnsw_voyage_4_large') IS NULL
         THEN 'grounding has no HNSW index: Regina would have no index at all' END,
    (SELECT string_agg(format('%s depends on %s (%s)', conrelid::regclass, confrelid::regclass, conname), ', ')
       FROM pg_constraint WHERE contype = 'f'
        AND confrelid IN ('policy.passages'::regclass, 'policy.document_versions'::regclass)
        AND conrelid NOT IN ('policy.passages'::regclass, 'policy.document_versions'::regclass)),
    (SELECT string_agg(DISTINCT format('view %s reads them', ev.ev_class::regclass), ', ')
       FROM pg_depend d JOIN pg_rewrite ev ON ev.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      WHERE d.refobjid IN ('policy.passages'::regclass, 'policy.document_versions'::regclass)
        AND ev.ev_class NOT IN ('policy.passages'::regclass, 'policy.document_versions'::regclass)))")
[ -z "$FAIL" ] || { echo "STOP: $FAIL"; exit 1; }
echo "ok: cutover done, every row and vector has its grounding copy, nothing else depends on the tables"

READS="SELECT sum(coalesce(seq_scan,0) + coalesce(idx_scan,0)) FROM pg_stat_user_tables
        WHERE relid IN ('policy.passages'::regclass, 'policy.document_versions'::regclass)"
R0=$("${PSQL[@]}" -c "$READS")
echo "   watching for reads of the legacy tables for ${QUIET}s (the old Regina code would read them)..."
sleep "$QUIET"
R1=$("${PSQL[@]}" -c "$READS")
[ "$R0" = "$R1" ] || { echo "STOP: the legacy tables were read $((R1 - R0)) times in ${QUIET}s: something still uses them (is Regina on the new code?)"; exit 1; }
echo "ok: not read in ${QUIET}s"

echo "== 1. what would be freed"
"${PSQL[@]}" -F $'\t' -c "
  SELECT c.oid::regclass, count_rows, pg_size_pretty(pg_total_relation_size(c.oid))
    FROM (VALUES ('policy.passages'::regclass, (SELECT count(*) FROM policy.passages)),
                 ('policy.document_versions'::regclass, (SELECT count(*) FROM policy.document_versions))) v(c_oid, count_rows)
    JOIN pg_class c ON c.oid = v.c_oid
  UNION ALL
  SELECT NULL, NULL, 'total ' || pg_size_pretty(pg_total_relation_size('policy.passages') + pg_total_relation_size('policy.document_versions'))
  UNION ALL
  SELECT NULL, NULL, 'database now ' || pg_size_pretty(pg_database_size(current_database()))" |
  column -t -s $'\t'
echo "   archive: pg_dump --format=custom of $TABLES -> $ARCHIVE"
echo "   then, in one transaction: DROP TABLE policy.passages; DROP TABLE policy.document_versions;"

if [ "$APPLY" != 1 ]; then
  echo "DRY RUN: nothing archived, nothing dropped. --apply does both (brief the owner first)."
  exit 0
fi

echo "== 2. archive"
SERVER_MAJOR=$("${PSQL[@]}" -c "SHOW server_version_num" | cut -c1-2)
DUMP_MAJOR=$(pg_dump --version | sed -E 's/.* ([0-9]+)\..*/\1/')
[ "$DUMP_MAJOR" -ge "$SERVER_MAJOR" ] || { echo "STOP: pg_dump $DUMP_MAJOR is older than the server ($SERVER_MAJOR)"; exit 1; }
mkdir -p "$ARCHIVE_DIR"
pg_dump "$ADMIN" --format=custom --no-owner --table=policy.passages --table=policy.document_versions \
  --file="$ARCHIVE"
# the archive must hold both tables' data, and as many rows as the tables do
pg_restore --list "$ARCHIVE" | grep -q "TABLE DATA policy passages" || { echo "STOP: archive lacks passages data"; exit 1; }
pg_restore --list "$ARCHIVE" | grep -q "TABLE DATA policy document_versions" || { echo "STOP: archive lacks document_versions data"; exit 1; }
N_DB=$("${PSQL[@]}" -c "SELECT (SELECT count(*) FROM policy.passages) + (SELECT count(*) FROM policy.document_versions)")
N_DUMP=$(pg_restore --data-only --file=- "$ARCHIVE" | awk '/^COPY /{c=1;next} /^\\\.$/{c=0} c{n++} END{print n+0}')
[ "$N_DB" = "$N_DUMP" ] || { echo "STOP: archive holds $N_DUMP rows, the tables $N_DB"; exit 1; }
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"
ls -l "$ARCHIVE"
echo "ok: $N_DUMP rows archived, sha256 in $ARCHIVE.sha256. Keep it off the laptop's only disk too."

echo "== 3. drop"
BEFORE=$("${PSQL[@]}" -c "SELECT pg_database_size(current_database())")
"${PSQL[@]}" -c "BEGIN; DROP TABLE policy.passages; DROP TABLE policy.document_versions; COMMIT;"
"${PSQL[@]}" -c "CHECKPOINT" >/dev/null || true
AFTER=$("${PSQL[@]}" -c "SELECT pg_database_size(current_database())")
echo "done: database $((BEFORE / 1048576)) MB -> $((AFTER / 1048576)) MB (freed $(((BEFORE - AFTER) / 1048576)) MB)."
echo "Restore, if ever needed: pg_restore --dbname \"\$ADMIN\" $ARCHIVE"
