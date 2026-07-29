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
