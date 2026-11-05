"""Schema bootstrap: the fresh-install path and its Alembic handoff.

Regression cover for a verified defect (2026-07-28). ``init_db``'s ``create_all``
builds the schema as of the latest revision, but nothing recorded that fact, so a
fresh install had no ``alembic_version`` row and the next ``alembic upgrade head``
replayed every migration against a schema that already had everything:

    DuplicateColumn: column "date_application" of relation "documents"
    already exists

``init_db`` docstring had claimed the stamping happened. It didn't.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from data.session import _stamp_alembic_head


def test_stamping_does_not_overwrite_an_established_database(pg_engine):
    """``init_db`` doubles as "make sure the schema exists" on a database that is
    already managed by Alembic. Re-stamping there would silently move the version
    pointer to head and skip real pending migrations — much worse than the bug it
    replaces."""
    with pg_engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        conn.execute(text("CREATE TABLE alembic_version (version_num varchar(32) NOT NULL)"))
        conn.execute(text("INSERT INTO alembic_version VALUES ('deadbeef1234')"))

    _stamp_alembic_head(pg_engine)

    with pg_engine.begin() as conn:
        version = conn.execute(text("select version_num from alembic_version")).scalar()
    assert version == "deadbeef1234", "an existing Alembic version must not be rewritten"

    with pg_engine.begin() as conn:
        conn.execute(text("DROP TABLE alembic_version"))


def test_stamping_is_non_fatal_when_alembic_is_unavailable(pg_engine, tmp_path, monkeypatch):
    """A database must stay usable even if the Alembic config cannot be found —
    ``init_db`` is the path that makes a database work at all, so it must not be
    the thing that refuses to run."""
    monkeypatch.chdir(tmp_path)  # no alembic.ini here
    assert not inspect(pg_engine).has_table("alembic_version")
    _stamp_alembic_head(pg_engine)  # must not raise
    # And it must not leave a half-written version table behind.
    assert not inspect(pg_engine).has_table("alembic_version")


def test_models_and_migrations_agree_on_the_columns_that_broke(pg_engine):
    """The specific drift that caused the failure: the model carried
    ``date_application`` and the migration added it, so a create_all-built
    database already had it before the migration ran. Asserting both the column
    and the actor tables exist keeps create_all and the migration chain from
    diverging again unnoticed."""
    inspector = inspect(pg_engine)
    columns = {c["name"] for c in inspector.get_columns("documents")}
    assert {"date_in_force", "date_application", "date_end_validity"} <= columns
    for table in ("actors", "document_actor", "retrieval_events"):
        assert inspector.has_table(table), f"{table} missing from create_all schema"


# --- pgvector HNSW search settings ------------------------------------------
#
# `semantic_search` rides ix_passages_embedding_hnsw and applies `is_current`
# AFTER the ANN scan. At pgvector's default `hnsw.ef_search = 40` the index hands
# up 40 candidates and the filter takes from that — so the query silently
# returns fewer rows than asked for, or none, once enough candidates are
# superseded. It survives today only because 2.1% of passages are non-current.
# The same geometry produced a silent zero-result bug twice before (decision-log
# 2026-07-09, commit e993d9f), and both fixes were `SET LOCAL`s that a later
# refactor removed. These pin the settings so a regression to the defaults is a
# failing test rather than an empty brief.


def test_hnsw_search_settings_are_not_left_at_pgvectors_defaults():
    from data.session import HNSW_EF_SEARCH, HNSW_ITERATIVE_SCAN

    assert HNSW_EF_SEARCH >= 100, (
        "ef_search regressed toward pgvector's default of 40 — at that depth a "
        "post-scan filter can empty the result with no error"
    )
    assert HNSW_ITERATIVE_SCAN != "off", (
        "with iterative scan off, pgvector will not go back for more candidates "
        "when the filter empties the result: a short result is simply short"
    )
    # strict_order, not relaxed_order: semantic_search's contract is ORDER BY
    # distance LIMIT k and callers rank on that order.
    assert HNSW_ITERATIVE_SCAN == "strict_order"


def test_the_engine_applies_the_hnsw_settings_to_every_connection(monkeypatch):
    """Set on the connection, not next to one query. Both previous fixes lived at
    a call site and both were lost to a refactor of that call site."""
    import data.session as session_module

    captured: dict = {}

    def fake_create_engine(url, **kwargs):
        captured.update(kwargs)
        return "engine"

    monkeypatch.setattr(session_module, "_engine", None)
    monkeypatch.setattr(session_module, "create_engine", fake_create_engine)
    monkeypatch.setattr(session_module, "_resolve_url", lambda: "postgresql+psycopg://x/y")
    try:
        session_module.get_engine()
    finally:
        session_module._engine = None

    options = captured["connect_args"]["options"]
    assert "hnsw.ef_search=200" in options
    assert "hnsw.iterative_scan=strict_order" in options


def test_postgres_accepts_the_hnsw_options_string(pg_engine):
    """The settings are pgvector GUCs, so Postgres only sees placeholders until
    the extension loads. That is fine — but a typo or an unsupported value here
    would fail every connection, so assert a real server takes them."""
    from sqlalchemy import create_engine

    from data.session import hnsw_connect_options

    engine = create_engine(pg_engine.url, connect_args={"options": hnsw_connect_options()})
    try:
        with engine.connect() as conn:
            assert conn.execute(text("SHOW hnsw.ef_search")).scalar() == "200"
            assert conn.execute(text("SHOW hnsw.iterative_scan")).scalar() == "strict_order"
    finally:
        engine.dispose()


# --- the HNSW index is part of the schema, not a side effect ----------------


def test_the_hnsw_index_is_declared_on_the_model():
    """It used to exist in every database and in no metadata, so
    `alembic revision --autogenerate` proposed DROPPING it — one line in a
    migration nobody reads closely. `alembic check` failed on exactly that."""
    from data.models import Passage

    index = next(
        (i for i in Passage.__table__.indexes if i.name == "ix_passages_embedding_hnsw"), None
    )
    assert index is not None, "autogenerate will propose dropping this index"
    assert index.dialect_options["postgresql"]["using"] == "hnsw"
    assert index.dialect_options["postgresql"]["ops"] == {"embedding": "vector_cosine_ops"}
    assert [c.name for c in index.columns] == ["embedding"]


def test_create_all_builds_the_hnsw_index(pg_engine):
    """The declaration has to be what actually builds the index on a fresh
    install — init_db no longer creates it imperatively."""
    indexes = inspect(pg_engine).get_indexes("passages")
    hnsw = next((i for i in indexes if i["name"] == "ix_passages_embedding_hnsw"), None)
    assert hnsw is not None, "fresh-install schema has no HNSW index"
    with pg_engine.connect() as conn:
        definition = conn.execute(
            text("select indexdef from pg_indexes where indexname='ix_passages_embedding_hnsw'")
        ).scalar()
    assert "USING hnsw" in definition
    assert "vector_cosine_ops" in definition


def test_every_table_lands_in_the_brains_schema_not_public(pg_engine):
    """One database, one schema per brain. Postgres silently skips a search_path
    entry that does not exist, so before ``ensure_schema`` a fresh install put
    every table in ``public`` while the code said ``policy``. Nothing failed: the
    defect only shows when the brain shares a database with another one."""
    from data.base import Base
    from data.session import SCHEMA

    with pg_engine.begin() as conn:
        placed = dict(conn.execute(text(
            "select c.relname, n.nspname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where c.relkind = 'r' and c.relname = any(:names)"
        ), {"names": [t.name for t in Base.metadata.sorted_tables]}).all())
        vector_home = conn.execute(text(
            "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace "
            "where e.extname = 'vector'")).scalar()
    assert placed and set(placed.values()) == {SCHEMA}, placed
    assert vector_home == "public", "pgvector is shared by every brain; it lives in public"


def test_alembic_keeps_its_version_in_the_brains_schema(pg_engine, monkeypatch):
    """Alembic built its own engine without the app's connection options, so a
    real ``alembic`` run would have written ``alembic_version`` (and any new
    table) to ``public`` while the app read ``policy``. Exercised through
    Alembic itself, not by inspecting env.py."""
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    from data.session import SCHEMA

    root = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(root)
    config = Config(str(root / "alembic.ini"))
    # configparser treats % as interpolation; pgserver's socket path is URL-encoded.
    url = pg_engine.url.render_as_string(hide_password=False).replace("%", "%%")
    config.set_main_option("sqlalchemy.url", url)
    command.stamp(config, "head")
    try:
        with pg_engine.begin() as conn:
            homes = [r[0] for r in conn.execute(text(
                "select table_schema from information_schema.tables where table_name = 'alembic_version'"))]
        assert homes == [SCHEMA], homes
    finally:
        with pg_engine.begin() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{SCHEMA}".alembic_version'))
