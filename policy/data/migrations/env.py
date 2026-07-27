"""Alembic environment.

Introduced 2026-07-27, when the schema stopped being safely re-creatable:
``init_db()``'s ``create_all`` is fine for a fresh database but cannot alter an
existing one, and the first real change (adding ``documents.date_application``
and extending the ``document_type`` enum) had to be applied to a live 4,781-row
corpus. ``init_db()`` remains the fresh-install path; Alembic owns changes to
databases that already hold data.

The URL comes from ``Settings.database_url`` rather than alembic.ini so
migrations always run against the same database the app resolves — including the
``DATABASE_URL=local`` embedded Postgres — and so no credentials live in a
committed file.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from data import models  # noqa: F401  (import registers every table on Base.metadata)
from data.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate compares against the real model metadata. data.models must be
# imported above for this to see every table, not just the ones Base knows about
# by the time this module loads.
target_metadata = Base.metadata


def _database_url() -> str:
    """The app's own resolved database URL.

    Reuses ``data.session._resolve_url`` rather than re-reading the setting:
    that function handles the ``local`` sentinel (embedded Postgres under
    .localdb/) *and* carries a trailing-whitespace guard earned live on Railway
    (see its docstring). A second implementation here would be one more place
    for those two behaviours to drift apart.
    """
    from data.session import _resolve_url

    return _resolve_url()


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Without this, autogenerate ignores server-side type changes on
        # existing columns — exactly the class of change this project will make
        # most often as the document vocabulary grows.
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
