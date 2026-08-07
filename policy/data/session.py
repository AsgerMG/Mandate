"""Engine / session factory and schema bootstrap.

The engine is built lazily on first use (not at import) so that importing the
models or pipeline never has the side effect of starting a database — and so
the ``local`` default can boot the embedded Postgres only when something
actually needs a connection.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import structlog
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from . import models  # noqa: F401  (ensure models register on Base.metadata)
from .base import Base
from .config import get_settings

log = structlog.get_logger(__name__)

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None

# --- pgvector HNSW search-time settings -----------------------------------
# Set on every connection rather than left at pgvector's defaults, because the
# defaults are only safe by accident here.
#
# `semantic_search()` rides ix_passages_embedding_hnsw and applies its
# `is_current` filter AFTER the ANN scan (confirmed by EXPLAIN ANALYZE:
# `Index Scan using ix_passages_embedding_hnsw` with `Filter: is_current`). At
# the default `hnsw.ef_search = 40` the index hands up 40 candidates, the filter
# removes the superseded ones, and whatever survives is the result. Today only
# 2.1% of passages are non-current so 40 candidates comfortably yields k=5 — but
# that is a property of the corpus, not of the query, and it has already failed
# twice in this project as the ratio moved (decision-log 2026-07-09, commit
# e993d9f). Both times the fix was a `SET LOCAL` next to one query, and both
# times it was later removed as collateral of an unrelated refactor. Setting it
# on the connection instead means no single call site owns it and no refactor of
# one query can quietly drop it.
#
# 200 rather than the historical 1000: 1000 was chosen to brute-force a
# then-unbounded post-filter, and it costs real latency on every ANN query. 200
# gives a 5x margin over the default against a corpus whose non-current share
# would have to reach ~97% before k=5 could not be filled — and iterative scan
# below covers the tail beyond that anyway.
HNSW_EF_SEARCH = 200

# The actual guarantee. Without it pgvector will NOT go back for more candidates
# when a post-scan filter empties the result: a short result is simply short, and
# a query that should return 5 passages returns 0 with no error, no warning and
# no log line. `strict_order` (not `relaxed_order`) because semantic_search's
# contract is `ORDER BY distance LIMIT k` and callers rank on that order;
# relaxed_order would return the right rows in the wrong order. Cost is bounded
# by pgvector's own `hnsw.max_scan_tuples`, and it only engages when the first
# pass came up short — on this corpus, essentially never.
HNSW_ITERATIVE_SCAN = "strict_order"


def hnsw_connect_options() -> str:
    """libpq ``options`` string applying the HNSW settings above to a connection.

    Passed in the startup packet rather than issued as a `SET` statement, so the
    settings are in force before the first query on a connection and cannot be
    lost to a transaction rollback. These are pgvector GUCs, which Postgres
    accepts as placeholders here even though the extension's module has not been
    loaded yet — it validates them when pgvector first loads in the session.
    """
    return f"-c hnsw.ef_search={HNSW_EF_SEARCH} -c hnsw.iterative_scan={HNSW_ITERATIVE_SCAN}"


def _resolve_url() -> str:
    # .strip() guards against a trailing newline/whitespace in the
    # DATABASE_URL env var — hit live 2026-07-10 on Railway: a stray \n
    # after the value made Postgres see the dbname as "railway\n" and
    # reject every connection with "database does not exist", even though
    # every other field (host, port, credentials) was correct. Cheap
    # insurance against however a value got into a platform's variable
    # store, not specific to Railway.
    url = (get_settings().database_url or "").strip()
    if url in ("local", ""):
        from .local_db import ensure_local_db

        return ensure_local_db()
    return url


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(
            _resolve_url(),
            pool_pre_ping=True,
            future=True,
            connect_args={"options": hnsw_connect_options()},
        )
    return _engine


def get_sessionmaker() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(), expire_on_commit=False, class_=Session
        )
    return _session_factory


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional session: commit on success, rollback on error."""
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create the pgvector extension and all tables.

    The **fresh-install** path, and only that. It also creates the pgvector
    extension and the HNSW index, which is why it still exists after Alembic
    landed (2026-07-27) rather than being replaced by it.

    ``create_all`` cannot alter an existing schema — it will not add a column or
    extend an enum — so any change to a database that already holds data goes
    through Alembic (``alembic.ini`` + ``data/migrations/``).

    ``create_all`` builds the CURRENT models, i.e. the schema as of the latest
    revision, so this then stamps Alembic at **head**. Without that stamp a fresh
    install is left with no ``alembic_version`` row, and the next
    ``alembic upgrade head`` replays every migration against a schema that
    already has everything — verified to fail with
    ``DuplicateColumn: column "date_application" of relation "documents" already
    exists``. This docstring previously claimed the stamping happened when
    nothing did it; ``_stamp_alembic_head`` is that claim made real.

    One trap worth knowing before writing a migration: SQLAlchemy's
    ``Enum(PyEnum)`` persists a member's **name**, not its value, so enum labels
    in Postgres are UPPERCASE (``REGULATION``, not ``regulation``). The first
    migration got this wrong and failed immediately with
    InvalidTextRepresentation.
    """
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    # Includes ix_passages_embedding_hnsw, which is declared on the Passage model
    # (see data/models.py). It used to be created by a separate imperative
    # CREATE INDEX here instead — which meant the index existed in every database
    # but in no metadata, so `alembic revision --autogenerate` would propose
    # dropping it. One definition, in the place Alembic actually compares against.
    Base.metadata.create_all(engine)
    _stamp_alembic_head(engine)


def _stamp_alembic_head(engine) -> None:
    """Record the current schema as being at Alembic head, unless it already is.

    Idempotent and deliberately non-fatal. ``init_db`` is also the "make sure the
    schema exists" call on an established database, where an ``alembic_version``
    row is already present and must not be overwritten — so this only stamps when
    the table is absent. And a missing/misconfigured Alembic setup should not
    stop a database from being usable, so failure is logged rather than raised.
    """
    from sqlalchemy import inspect as sa_inspect

    if sa_inspect(engine).has_table("alembic_version"):
        return
    try:
        from alembic import command
        from alembic.config import Config

        config = Config("alembic.ini")
        # env.py resolves the URL from Settings, and this is the same engine that
        # was just created from it, so no URL needs passing here.
        command.stamp(config, "head")
        log.info("alembic_stamped_head")
    except Exception:
        log.warning(
            "alembic_stamp_failed",
            hint="run `alembic stamp head` manually before the next `alembic upgrade`",
            exc_info=True,
        )
