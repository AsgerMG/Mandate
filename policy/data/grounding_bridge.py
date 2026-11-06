"""Policy on grounding: the views policy reads its sources through, and the guard
on the tables it no longer writes.

THE SPLIT. Schema `grounding` (mandate/db/grounding.sql) holds every source text,
version, fetch, passage and vector, once, append-only. Policy keeps what is its
own (documents' type/lifecycle/dates, enrichments, actors, and VersionRef: which
grounding version each document is at and whether it is current). Readers ask
the ORM for DocumentVersion / Passage exactly as before; those classes are
mapped onto the two views below, so the text, the spans and the vectors come
from grounding and no reader needed to learn a second schema.

    install(conn)               the views + the legacy-write guard (idempotent)
    backfill_version_refs(conn) one VersionRef per migrated policy version
    resolve_passage_ids(s, ids) old policy passage ids -> grounding passage ids
    driver(session)             the psycopg connection mandate.grounding writes on

WRITES go through mandate.grounding only (etl/pipeline.py, etl/enrichment/
embeddings.py). The views are not updatable, and the legacy tables
policy.document_versions / policy.passages refuse every write by trigger, so a
code path that still tries to write the old way fails loudly instead of landing
text that no reader will ever see again.
"""

from __future__ import annotations

from collections.abc import Iterable

from mandate.embedding import STORED

#: Who cut the passages: the same name the migration (policy_to_grounding.py)
#: stamped on the 125k migrated passages, so old and new passages are one set.
CHUNKER = "policy.chunking.v1"
#: The model policy's passage vectors are stored (and must be queried) in.
EMBEDDINGS_TABLE = "grounding.passage_embeddings"
MODEL = STORED[EMBEDDINGS_TABLE]
#: grounding.sources key for a policy adapter (as the migration created them).
SOURCE_PREFIX = "policy."
#: mime and extractor of what policy stores: the normalised text it versions on.
TEXT_MIME = "text/plain; charset=utf-8"


def _q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


VIEWS_SQL = f"""
CREATE OR REPLACE VIEW grounded_versions AS
SELECT r.id, r.document_id, r.grounding_version_id,
       gv.sha256 AS content_hash, r.raw_format, gv.text,
       coalesce(length(gv.text), 0) AS char_count,
       r.fetched_at, r.is_current, r.created_at, r.updated_at
  FROM version_refs r
  LEFT JOIN grounding.document_versions gv ON gv.id = r.grounding_version_id;

CREATE OR REPLACE VIEW grounded_passages AS
SELECT gp.id, r.id AS version_id, gp.version_id AS grounding_version_id,
       gp.ordinal, gp.text, gp.char_start, gp.char_end, gp.heading, gp.token_count,
       e.embedding
  FROM version_refs r
  JOIN grounding.passages gp
    ON gp.version_id = r.grounding_version_id AND gp.chunker = {_q(CHUNKER)}
  LEFT JOIN grounding.passage_embeddings e
    ON e.passage_id = gp.id AND e.model = {_q(MODEL)};
"""

# The legacy tables are kept (never dropped, never deleted from: their retirement
# is an owner decision) and refuse writes. The escape hatch exists for exactly one
# caller, a test that builds a pre-migration corpus to migrate; production code
# never sets it.
LEGACY_TABLES = ("document_versions", "passages")
#: Also declared on the models (data/models.py), so Alembic autogenerate does
#: not propose removing it.
LEGACY_COMMENT = (
    "DEPRECATED 2026-11 (revision 5c2f9e1a7b30): read-only copy of policy's "
    "pre-grounding sources. Superseded by schema grounding; writes refused by trigger "
    "deprecated_read_only. Kept until the owner decides its retirement."
)
LEGACY_GUARD_SQL = """
CREATE OR REPLACE FUNCTION refuse_legacy_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('policy.legacy_write', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'policy.% is deprecated and read-only: % refused. Source text, '
                  'versions and passages are written to schema grounding '
                  '(mandate.grounding, etl/pipeline.py).', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
END $$;
""" + "".join(
    f"""
DROP TRIGGER IF EXISTS deprecated_read_only ON {t};
CREATE TRIGGER deprecated_read_only BEFORE INSERT OR UPDATE OR DELETE ON {t}
  FOR EACH ROW EXECUTE FUNCTION refuse_legacy_write();
COMMENT ON TABLE {t} IS {_q(LEGACY_COMMENT)};
"""
    for t in LEGACY_TABLES
)

BACKFILL_SQL = """
INSERT INTO version_refs (id, document_id, grounding_version_id, raw_format, fetched_at,
                          is_current, created_at, updated_at)
SELECT v.id, v.document_id, l.grounding_version_id, v.raw_format, v.fetched_at,
       v.is_current, v.created_at, v.updated_at
  FROM document_versions v
  JOIN grounding_version_link l ON l.policy_version_id = v.id
 WHERE NOT EXISTS (SELECT 1 FROM version_refs r WHERE r.id = v.id)
ON CONFLICT DO NOTHING
"""


def _exec(conn, sql: str):
    """Run parameterless SQL on a SQLAlchemy Connection or Session, or a psycopg
    connection, through the driver (so a plpgsql '%' is not a placeholder)."""
    if hasattr(conn, "get_bind"):  # Session
        conn = conn.connection()
    if hasattr(conn, "exec_driver_sql"):  # SQLAlchemy Connection
        conn = conn.connection.driver_connection
    return conn.execute(sql)


def install(conn) -> None:
    """Create/replace the grounded views and the legacy-write guard. Needs schema
    grounding (mandate/db/grounding.sql); refuses with a clear message without it."""
    have = _exec(conn, "SELECT 1 FROM pg_namespace WHERE nspname = 'grounding'").fetchone()
    if have is None:
        raise RuntimeError(
            "schema grounding is missing: apply mandate/db/grounding.sql (after roles.sql) "
            "as the database admin first. Policy reads its sources from it.")
    _exec(conn, VIEWS_SQL)
    _exec(conn, LEGACY_GUARD_SQL)


def backfill_version_refs(conn) -> int:
    """One VersionRef per migrated policy version, keeping its id. Idempotent.
    Refuses while the migration's version links are incomplete: an empty or
    partial VersionRef table would make the API serve a corpus with holes."""
    unlinked = _exec(conn, "SELECT count(*) FROM document_versions v WHERE NOT EXISTS "
                           "(SELECT 1 FROM grounding_version_link l WHERE l.policy_version_id = v.id)"
                     ).fetchone()[0]
    if unlinked:
        raise RuntimeError(
            f"{unlinked} policy.document_versions rows have no grounding_version_link: run "
            "mandate/grounding/migrations/policy_to_grounding.py --apply first (it is idempotent).")
    n = _exec(conn, BACKFILL_SQL).rowcount
    _exec(conn, "SELECT setval(pg_get_serial_sequence('version_refs', 'id'), "
                "GREATEST((SELECT max(id) FROM version_refs), "
                "(SELECT max(id) FROM document_versions), 1))")
    return n


def resolve_passage_ids(session, ids: Iterable[int]) -> dict[int, int]:
    """{stored id: grounding passage id} for ids stored before the move
    (enrichments.citations, document_actor.passage_id). Every non-duplicate id
    maps to itself; a passage of a folded duplicate version maps onto the
    surviving version's passage (same text, verified by the migration). An id
    that is neither migrated nor in grounding is absent from the result."""
    ids = sorted({int(i) for i in ids if i is not None})
    if not ids:
        return {}
    from sqlalchemy import text  # noqa: PLC0415

    rows = session.execute(text(
        "SELECT i, coalesce(l.grounding_passage_id, gp.id) FROM unnest(CAST(:ids AS bigint[])) i "
        "LEFT JOIN grounding_passage_link l ON l.policy_passage_id = i "
        "LEFT JOIN grounding.passages gp ON gp.id = i AND l.policy_passage_id IS NULL "
        "WHERE l.policy_passage_id IS NOT NULL OR gp.id IS NOT NULL"), {"ids": ids}).all()
    return {int(a): int(b) for a, b in rows}


def driver(session):
    """The psycopg connection under a SQLAlchemy session, in the session's own
    transaction: mandate.grounding writes on it, so a policy row and the
    grounding row it points at commit (or roll back) together."""
    return session.connection().connection.driver_connection


def grounding_url(source_key: str, url: str | None, external_id: str) -> str:
    """The grounding document a policy document is stored under: its canonical
    URL, or the stable urn the migration gave a document without a usable URL."""
    from mandate.grounding import canonical_url  # noqa: PLC0415

    if url:
        try:
            return canonical_url(url)
        except ValueError:
            pass
    return f"urn:mandate:policy:{source_key}:{external_id}"
