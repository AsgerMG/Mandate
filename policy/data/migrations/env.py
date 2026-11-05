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
from data.session import SCHEMA, hnsw_connect_options

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate compares against the real model metadata. data.models must be
# imported above for this to see every table, not just the ones Base knows about
# by the time this module loads.
target_metadata = Base.metadata


#: The placeholder alembic.ini ships with. Any other value was set deliberately.
_INI_PLACEHOLDER = "driver://user:pass@localhost/dbname"


def _database_url() -> str:
    """The database to migrate: an explicitly supplied URL if there is one,
    otherwise the app's own resolved URL.

    The precedence matters for safety, and the earlier version got it wrong by
    *always* using the app's setting. That silently discarded
    ``alembic -x db_url=…`` and any programmatic ``set_main_option``, so Alembic
    could not be pointed at another database at all — and an attempt to migrate a
    scratch or staging database ran against production instead. Found exactly
    that way: a fresh-install test reported success because it had quietly
    migrated the live Railway corpus.

    Falling back to ``data.session._resolve_url`` (rather than re-reading the
    setting here) keeps the ``local`` sentinel and the trailing-whitespace guard
    earned live on Railway in one place.
    """
    explicit = context.get_x_argument(as_dictionary=True).get("db_url")
    if explicit:
        return explicit
    configured = config.get_main_option("sqlalchemy.url", None)
    if configured and configured != _INI_PLACEHOLDER:
        return configured

    from data.session import _resolve_url

    return _resolve_url()


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=SCHEMA,
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
    # The SAME connection options as the app's engine. This engine used to be
    # built without them, so a migration ran on Postgres's default search_path:
    # new tables and `alembic_version` would have gone to `public` while the app
    # reads `policy`, and the enum migrations would not have found their types.
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"options": hnsw_connect_options()},
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            version_table_schema=SCHEMA,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
